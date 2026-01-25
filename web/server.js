const express = require('express');
const { Pool } = require('pg');
const yaml = require('js-yaml');
const path = require('path');
const cors = require('cors');
const nlp = require('compromise');
const diff = require('deep-diff');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Default connection from env, can be overridden by header
const DEFAULT_DB_URL = process.env.DATABASE_URL;

// Helper to get DB client
const getPool = (req) => {
    const connectionString = req.headers['x-db-url'] || DEFAULT_DB_URL;
    if (!connectionString) {
        throw new Error('No database URL provided');
    }
    return new Pool({ connectionString });
};

// --- API Routes ---

// Health Check / Connection Test
app.get('/api/health', async (req, res) => {
    let pool;
    try {
        pool = getPool(req);
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(pool) await pool.end();
    }
});

// List Words
app.get('/api/words', async (req, res) => {
    let pool;
    try {
        pool = getPool(req);
        // We now select revision_count too
        const result = await pool.query(`
            SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, revision_count, original_yaml
            FROM words 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(pool) await pool.end();
    }
});

// Check Word (NLP + DB Lookup)
app.get('/api/check', async (req, res) => {
    const userWord = req.query.word;
    if (!userWord) return res.status(400).json({ error: 'Word parameter required' });

    let pool;
    try {
        // 1. NLP Lemmatization
        const doc = nlp(userWord);
        // Try to get verb infinitive or noun singular, fallback to original
        doc.verbs().toInfinitive();
        doc.nouns().toSingular();
        const lemma = doc.text().trim().toLowerCase() || userWord.toLowerCase();

        // 2. DB Lookup
        pool = getPool(req);
        const result = await pool.query('SELECT * FROM words WHERE lower(lemma) = $1', [lemma]);
        
        if (result.rows.length > 0) {
            res.json({ found: true, lemma, data: result.rows[0] });
        } else {
            res.json({ found: false, lemma });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(pool) await pool.end();
    }
});

// Save YAML Data (Handle Conflicts)
app.post('/api/words', async (req, res) => {
    let pool;
    let client;
    try {
        const { yaml: yamlStr, forceUpdate } = req.body;
        if (!yamlStr) return res.status(400).json({ error: 'No YAML content' });

        const data = yaml.load(yamlStr);
        const lemma = data.yield?.lemma?.toLowerCase();
        if (!lemma) return res.status(400).json({ error: 'YAML missing yield.lemma' });

        pool = getPool(req);
        client = await pool.connect();
        
        await client.query('BEGIN');

        // Check Existence
        const existingRes = await client.query('SELECT * FROM words WHERE lower(lemma) = $1', [lemma]);
        const existing = existingRes.rows[0];

        // Conflict Detection
        if (existing && !forceUpdate) {
            // Compare Core Fields (using original_yaml for clean comparison)
            const oldData = existing.original_yaml;
            const newData = data;
            
            // Clean up noise for diff (e.g. user_context_sentence might change, but that's allowed)
            // We focus on core structure: yield(minus context), etymology, cognate_family, nuance
            const cleanOld = { ...oldData, yield: { ...oldData.yield, user_word: undefined, user_context_sentence: undefined } };
            const cleanNew = { ...newData, yield: { ...newData.yield, user_word: undefined, user_context_sentence: undefined } };
            
            const differences = diff(cleanOld, cleanNew);

            if (differences) {
                await client.query('ROLLBACK');
                return res.json({ 
                    status: 'conflict', 
                    diff: differences, 
                    oldData: existing.original_yaml, 
                    newData: data 
                });
            }
        }

        let wordId;

        if (existing) {
            // Update or Log Only
            wordId = existing.id;
            if (forceUpdate) {
                // Update Core Fields
                // Note: We need to re-run the full update logic similar to insert
                // For simplicity/robustness, we'll do an UPDATE on specific fields + revision_count
                
                // Helper to get field values
                const yieldData = data.yield || {};
                const nuanceData = data.nuance || {};
                
                await client.query(`
                    UPDATE words SET 
                        part_of_speech = $1, syllabification = $2, contextual_meaning_en = $3, 
                        contextual_meaning_zh = $4, other_common_meanings = $5, image_differentiation_zh = $6,
                        original_yaml = $7, revision_count = revision_count + 1, updated_at = now()
                    WHERE id = $8
                `, [
                    yieldData.part_of_speech, yieldData.syllabification, 
                    yieldData.contextual_meaning?.en, yieldData.contextual_meaning?.zh,
                    yieldData.other_common_meanings || [], nuanceData.image_differentiation_zh,
                    data, wordId
                ]);

                // We should also update child tables (Delete all and Re-insert is easiest for full sync)
                await client.query('DELETE FROM etymologies WHERE word_id = $1', [wordId]);
                await client.query('DELETE FROM cognates WHERE word_id = $1', [wordId]);
                await client.query('DELETE FROM examples WHERE word_id = $1', [wordId]);
                await client.query('DELETE FROM synonyms WHERE word_id = $1', [wordId]);
                
                // Re-insert Children (Shared Logic below)
                await insertChildren(client, wordId, data);
            }
        } else {
            // Insert New
            const yieldData = data.yield || {};
            const nuanceData = data.nuance || {};
            
            const insertRes = await client.query(`
                INSERT INTO words (
                    lemma, syllabification, part_of_speech, 
                    contextual_meaning_en, contextual_meaning_zh,
                    other_common_meanings, image_differentiation_zh, original_yaml
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                yieldData.lemma, yieldData.syllabification, yieldData.part_of_speech,
                yieldData.contextual_meaning?.en, yieldData.contextual_meaning?.zh,
                yieldData.other_common_meanings || [], nuanceData.image_differentiation_zh,
                data
            ]);
            wordId = insertRes.rows[0].id;
            await insertChildren(client, wordId, data);
        }

        // Always Insert User Request Log
        const userWord = data.yield?.user_word || lemma;
        const userContext = data.yield?.user_context_sentence;
        
        if (userWord || userContext) {
            await client.query(`
                INSERT INTO user_requests (word_id, user_input, context_sentence)
                VALUES ($1, $2, $3)
            `, [wordId, userWord, userContext]);
        }

        await client.query('COMMIT');
        res.json({ success: true, id: wordId, lemma, status: existing ? (forceUpdate ? 'updated' : 'logged') : 'created' });

    } catch (e) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
});

// Helper for Child Tables
async function insertChildren(client, wordId, data) {
    // Etymology
    const etymData = data.etymology || {};
    const roots = etymData.root_and_affixes || {};
    const origins = etymData.historical_origins || {};

    await client.query(`
        INSERT INTO etymologies (
            word_id, prefix, root, suffix, structure_analysis,
            history_myth, source_word, pie_root,
            visual_imagery_zh, meaning_evolution_zh
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
        wordId, roots.prefix, roots.root, roots.suffix, roots.structure_analysis,
        origins.history_myth, origins.source_word, origins.pie_root,
        etymData.visual_imagery_zh, etymData.meaning_evolution_zh
    ]);

    // Cognates
    const cognates = data.cognate_family?.cognates || [];
    for (const cog of cognates) {
        await client.query(
            'INSERT INTO cognates (word_id, cognate_word, logic) VALUES ($1, $2, $3)',
            [wordId, cog.word, cog.logic]
        );
    }

    // Examples
    const examples = data.application?.selected_examples || [];
    for (const ex of examples) {
        await client.query(
            'INSERT INTO examples (word_id, example_type, sentence, translation_zh) VALUES ($1, $2, $3, $4)',
            [wordId, ex.type, ex.sentence, ex.translation_zh]
        );
    }

    // Synonyms
    const synonyms = data.nuance?.synonyms || [];
    for (const syn of synonyms) {
        await client.query(
            'INSERT INTO synonyms (word_id, synonym_word, meaning_zh) VALUES ($1, $2, $3)',
            [wordId, syn.word, syn.meaning_zh]
        );
    }
}

// Delete Word (Cascade)
app.delete('/api/words/:id', async (req, res) => {
    let pool;
    try {
        pool = getPool(req);
        await pool.query('DELETE FROM words WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(pool) await pool.end();
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
