const express = require('express');
const { Pool } = require('pg');
const yaml = require('js-yaml');
const path = require('path');
const cors = require('cors');
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
        const result = await pool.query(`
            SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at 
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

// Save YAML Data
app.post('/api/words', async (req, res) => {
    let pool;
    let client;
    try {
        const { yaml: yamlStr } = req.body;
        if (!yamlStr) return res.status(400).json({ error: 'No YAML content' });

        const data = yaml.load(yamlStr);
        pool = getPool(req);
        client = await pool.connect();
        
        await client.query('BEGIN');

        // 1. Insert Word
        const yieldData = data.yield || {};
        const nuanceData = data.nuance || {};
        
        const wordQuery = `
            INSERT INTO words (
                user_word, lemma, syllabification, part_of_speech, 
                user_context_sentence, contextual_meaning_en, contextual_meaning_zh,
                other_common_meanings, image_differentiation_zh, original_yaml
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;
        
        const wordValues = [
            yieldData.user_word,
            yieldData.lemma,
            yieldData.syllabification,
            yieldData.part_of_speech,
            yieldData.user_context_sentence,
            yieldData.contextual_meaning?.en,
            yieldData.contextual_meaning?.zh,
            yieldData.other_common_meanings || [],
            nuanceData.image_differentiation_zh,
            data
        ];

        const wordRes = await client.query(wordQuery, wordValues);
        const wordId = wordRes.rows[0].id;

        // 2. Insert Etymology
        const etymData = data.etymology || {};
        const roots = etymData.root_and_affixes || {};
        const origins = etymData.historical_origins || {};

        const etymQuery = `
            INSERT INTO etymologies (
                word_id, prefix, root, suffix, structure_analysis,
                history_myth, source_word, pie_root,
                visual_imagery_zh, meaning_evolution_zh
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        await client.query(etymQuery, [
            wordId,
            roots.prefix,
            roots.root,
            roots.suffix,
            roots.structure_analysis,
            origins.history_myth,
            origins.source_word,
            origins.pie_root,
            etymData.visual_imagery_zh,
            etymData.meaning_evolution_zh
        ]);

        // 3. Insert Cognates
        const cognates = data.cognate_family?.cognates || [];
        for (const cog of cognates) {
            await client.query(
                'INSERT INTO cognates (word_id, cognate_word, logic) VALUES ($1, $2, $3)',
                [wordId, cog.word, cog.logic]
            );
        }

        // 4. Insert Examples
        const examples = data.application?.selected_examples || [];
        for (const ex of examples) {
            await client.query(
                'INSERT INTO examples (word_id, example_type, sentence, translation_zh) VALUES ($1, $2, $3, $4)',
                [wordId, ex.type, ex.sentence, ex.translation_zh]
            );
        }

        // 5. Insert Synonyms
        const synonyms = nuanceData.synonyms || [];
        for (const syn of synonyms) {
            await client.query(
                'INSERT INTO synonyms (word_id, synonym_word, meaning_zh) VALUES ($1, $2, $3)',
                [wordId, syn.word, syn.meaning_zh]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, id: wordId, lemma: yieldData.lemma });

    } catch (e) {
        if (client) await client.query('ROLLBACK');
        
        // Auto-create DB Logic Check
        if (e.code === '3D000') { // Database does not exist
             return res.status(404).json({ error: 'Database does not exist. Please create it manually as auto-creation via connection string is restricted by PG security.' });
        }
        
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
    }
});

// Delete Word (Cascade)
app.delete('/api/words/:id', async (req, res) => {
    let pool;
    try {
        pool = getPool(req);
        // Cascade delete handled by DB schema (ON DELETE CASCADE)
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
