const yaml = require('js-yaml');
const nlp = require('compromise');
const { getPool } = require('../db');
const conflictService = require('./conflictService');

class WordService {
    _isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    _isObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    _validateStrictYaml(data, wordLower) {
        const errors = [];
        if (!this._isObject(data)) {
            return { valid: false, errors: ['root must be an object'] };
        }

        const yieldData = data.yield;
        if (!this._isObject(yieldData)) errors.push('yield is required');
        if (yieldData) {
            if (!this._isNonEmptyString(yieldData.user_word)) errors.push('yield.user_word is required');
            if (!this._isNonEmptyString(yieldData.lemma)) errors.push('yield.lemma is required');
            if (this._isNonEmptyString(yieldData.lemma) && yieldData.lemma.trim().toLowerCase() !== wordLower) {
                errors.push('yield.lemma must match word');
            }
            if (!this._isNonEmptyString(yieldData.syllabification)) errors.push('yield.syllabification is required');
            if (!this._isNonEmptyString(yieldData.user_context_sentence)) errors.push('yield.user_context_sentence is required');
            if (!this._isNonEmptyString(yieldData.part_of_speech)) errors.push('yield.part_of_speech is required');
            if (!this._isObject(yieldData.contextual_meaning)) errors.push('yield.contextual_meaning is required');
            if (this._isObject(yieldData.contextual_meaning)) {
                if (!this._isNonEmptyString(yieldData.contextual_meaning.en)) errors.push('yield.contextual_meaning.en is required');
                if (!this._isNonEmptyString(yieldData.contextual_meaning.zh)) errors.push('yield.contextual_meaning.zh is required');
            }
            if (!Array.isArray(yieldData.other_common_meanings) || yieldData.other_common_meanings.length === 0) {
                errors.push('yield.other_common_meanings must be a non-empty array');
            }
        }

        const etymology = data.etymology;
        if (!this._isObject(etymology)) errors.push('etymology is required');
        if (etymology) {
            const roots = etymology.root_and_affixes;
            if (!this._isObject(roots)) errors.push('etymology.root_and_affixes is required');
            if (this._isObject(roots)) {
                if (!this._isNonEmptyString(roots.prefix)) errors.push('etymology.root_and_affixes.prefix is required');
                if (!this._isNonEmptyString(roots.root)) errors.push('etymology.root_and_affixes.root is required');
                if (!this._isNonEmptyString(roots.suffix)) errors.push('etymology.root_and_affixes.suffix is required');
                if (!this._isNonEmptyString(roots.structure_analysis)) errors.push('etymology.root_and_affixes.structure_analysis is required');
            }
            const origins = etymology.historical_origins;
            if (!this._isObject(origins)) errors.push('etymology.historical_origins is required');
            if (this._isObject(origins)) {
                if (!this._isNonEmptyString(origins.history_myth)) errors.push('etymology.historical_origins.history_myth is required');
                if (!this._isNonEmptyString(origins.source_word)) errors.push('etymology.historical_origins.source_word is required');
                if (!this._isNonEmptyString(origins.pie_root)) errors.push('etymology.historical_origins.pie_root is required');
            }
            if (!this._isNonEmptyString(etymology.visual_imagery_zh)) errors.push('etymology.visual_imagery_zh is required');
            if (!this._isNonEmptyString(etymology.meaning_evolution_zh)) errors.push('etymology.meaning_evolution_zh is required');
        }

        const cognateFamily = data.cognate_family;
        if (!this._isObject(cognateFamily)) errors.push('cognate_family is required');
        if (this._isObject(cognateFamily)) {
            const cognates = cognateFamily.cognates;
            if (!Array.isArray(cognates) || cognates.length === 0) {
                errors.push('cognate_family.cognates must be a non-empty array');
            } else {
                const invalid = cognates.some(c => !this._isObject(c) || !this._isNonEmptyString(c.word) || !this._isNonEmptyString(c.logic));
                if (invalid) errors.push('cognate_family.cognates items must have word and logic');
            }
        }

        const application = data.application;
        if (!this._isObject(application)) errors.push('application is required');
        if (this._isObject(application)) {
            const examples = application.selected_examples;
            if (!Array.isArray(examples) || examples.length === 0) {
                errors.push('application.selected_examples must be a non-empty array');
            } else {
                const invalid = examples.some(e => !this._isObject(e) || !this._isNonEmptyString(e.type) || !this._isNonEmptyString(e.sentence) || !this._isNonEmptyString(e.translation_zh));
                if (invalid) errors.push('application.selected_examples items must have type, sentence, translation_zh');
            }
        }

        const nuance = data.nuance;
        if (!this._isObject(nuance)) errors.push('nuance is required');
        if (this._isObject(nuance)) {
            if (!this._isNonEmptyString(nuance.image_differentiation_zh)) errors.push('nuance.image_differentiation_zh is required');
            const synonyms = nuance.synonyms;
            if (!Array.isArray(synonyms) || synonyms.length === 0) {
                errors.push('nuance.synonyms must be a non-empty array');
            } else {
                const invalid = synonyms.some(s => !this._isObject(s) || !this._isNonEmptyString(s.word) || !this._isNonEmptyString(s.meaning_zh));
                if (invalid) errors.push('nuance.synonyms items must have word and meaning_zh');
            }
        }

        return { valid: errors.length === 0, errors };
    }

    async addWord(req, wordText, yamlStr) {
        const pool = await getPool(req);
        const wordLower = String(wordText || '').trim().toLowerCase();
        if (!wordLower) return { status: 'invalid', errors: ['word is required'] };

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existingRes = await client.query('SELECT id, lemma FROM words WHERE lower(lemma) = $1', [wordLower]);
            if (existingRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return { status: 'duplicate', lemma: existingRes.rows[0].lemma, id: existingRes.rows[0].id };
            }

            let data;
            try {
                data = yaml.load(String(yamlStr || ''));
            } catch (e) {
                await client.query('ROLLBACK');
                return { status: 'invalid', errors: ['yaml parse error'] };
            }

            const validation = this._validateStrictYaml(data, wordLower);
            if (!validation.valid) {
                await client.query('ROLLBACK');
                return { status: 'invalid', errors: validation.errors };
            }

            const yieldData = data.yield || {};
            const nuanceData = data.nuance || {};

            const insertRes = await client.query(
                `
                INSERT INTO words (
                    lemma, syllabification, part_of_speech, 
                    contextual_meaning_en, contextual_meaning_zh,
                    other_common_meanings, image_differentiation_zh, original_yaml
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, lemma
                `,
                [
                    wordLower,
                    yieldData.syllabification,
                    yieldData.part_of_speech,
                    yieldData.contextual_meaning?.en,
                    yieldData.contextual_meaning?.zh,
                    yieldData.other_common_meanings || [],
                    nuanceData.image_differentiation_zh,
                    data
                ]
            );

            const wordId = insertRes.rows[0].id;
            await this._updateChildren(client, wordId, data);
            await client.query('COMMIT');

            return { status: 'created', id: wordId, lemma: insertRes.rows[0].lemma };
        } catch (e) {
            await client.query('ROLLBACK');
            if (e && e.code === '23505') {
                return { status: 'duplicate', lemma: wordLower };
            }
            throw e;
        } finally {
            client.release();
        }
    }

    async listWords(req) {
        if (req.query && (req.query.page || req.query.limit || req.query.search || req.query.sort)) {
            return this.listWordsPaged(req);
        }

        const pool = await getPool(req);
        const result = await pool.query(`
            SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, revision_count, original_yaml
            FROM words 
            ORDER BY created_at DESC
        `);
        return result.rows;
    }

    async listWordsPaged(req) {
        const pool = await getPool(req);

        const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
        const limitRaw = parseInt(req.query.limit || '20', 10) || 20;
        const limit = Math.min(200, Math.max(1, limitRaw));
        const offset = (page - 1) * limit;

        const search = (req.query.search || '').trim();
        const sort = (req.query.sort || 'newest').trim();

        const where = [];
        const params = [];

        if (search) {
            params.push(`%${search.toLowerCase()}%`);
            where.push(`lower(lemma) LIKE $${params.length}`);
        }

        let orderBy = 'created_at DESC';
        if (sort === 'az') orderBy = 'lemma ASC';
        if (sort === 'za') orderBy = 'lemma DESC';
        if (sort === 'newest') orderBy = 'created_at DESC';
        if (sort === 'oldest') orderBy = 'created_at ASC';

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countRes = await pool.query(
            `SELECT COUNT(*)::int AS total FROM words ${whereSql}`,
            params
        );
        const total = countRes.rows[0]?.total || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

        const dataParams = [...params, limit, offset];
        const dataRes = await pool.query(
            `
            SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, updated_at, revision_count
            FROM words
            ${whereSql}
            ORDER BY ${orderBy}
            LIMIT $${params.length + 1}
            OFFSET $${params.length + 2}
            `,
            dataParams
        );

        return {
            items: dataRes.rows,
            page,
            limit,
            total,
            totalPages
        };
    }

    async getWordById(req, id) {
        if (!id) throw new Error('Missing id');
        const pool = await getPool(req);
        const res = await pool.query(
            'SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, contextual_meaning_zh, other_common_meanings, image_differentiation_zh, created_at, updated_at, revision_count, original_yaml FROM words WHERE id = $1',
            [id]
        );
        if (res.rows.length === 0) throw new Error('Not found');
        return res.rows[0];
    }

    async getWordDetails(req, wordText, include = []) {
        const pool = await getPool(req);
        const inc = new Set(include.map(s => String(s || '').toLowerCase()));

        const selectFields = [
            'id',
            'lemma',
            'syllabification',
            'other_common_meanings',
            'image_differentiation_zh'
        ];
        if (inc.has('rawyaml')) {
            selectFields.push('original_yaml');
        }

        const wordRes = await pool.query(
            `SELECT ${selectFields.join(', ')} FROM words WHERE lower(lemma) = $1`,
            [String(wordText).toLowerCase()]
        );
        if (wordRes.rows.length === 0) throw new Error('Not found');
        const base = wordRes.rows[0];

        const queries = [];
        const keys = [];

        if (inc.has('etymology')) {
            queries.push(pool.query(
                `SELECT prefix, root, suffix, structure_analysis, history_myth, source_word, pie_root, visual_imagery_zh, meaning_evolution_zh FROM etymologies WHERE word_id = $1`,
                [base.id]
            ));
            keys.push('etymology');
        }
        if (inc.has('cognates')) {
            queries.push(pool.query(
                `SELECT cognate_word, logic FROM cognates WHERE word_id = $1`,
                [base.id]
            ));
            keys.push('cognates');
        }
        if (inc.has('examples')) {
            queries.push(pool.query(
                `SELECT example_type, sentence, translation_zh FROM examples WHERE word_id = $1`,
                [base.id]
            ));
            keys.push('examples');
        }
        if (inc.has('synonyms')) {
            queries.push(pool.query(
                `SELECT synonym_word, meaning_zh FROM synonyms WHERE word_id = $1`,
                [base.id]
            ));
            keys.push('synonyms');
        }

        if (queries.length) {
            const results = await Promise.all(queries);
            results.forEach((r, i) => {
                const k = keys[i];
                base[k] = k === 'etymology' ? (r.rows[0] || null) : r.rows;
            });
        }

        return {
            lemma: base.lemma,
            syllabification: base.syllabification,
            other_common_meanings: base.other_common_meanings,
            image_differentiation_zh: base.image_differentiation_zh,
            ...(inc.has('rawyaml') ? { original_yaml: base.original_yaml } : {}),
            ...(inc.has('etymology') ? { etymology: base.etymology ?? null } : {}),
            ...(inc.has('cognates') ? { cognates: base.cognates ?? [] } : {}),
            ...(inc.has('examples') ? { examples: base.examples ?? [] } : {}),
            ...(inc.has('synonyms') ? { synonyms: base.synonyms ?? [] } : {})
        };
    }

    async checkWord(req, userWord) {
        // 1. NLP Lemmatization
        const doc = nlp(userWord);
        doc.verbs().toInfinitive();
        doc.nouns().toSingular();
        const lemma = doc.text().trim().toLowerCase() || userWord.toLowerCase();

        // 2. DB Lookup
        const pool = await getPool(req);
        const result = await pool.query('SELECT * FROM words WHERE lower(lemma) = $1', [lemma]);
        
        if (result.rows.length > 0) {
            return { found: true, lemma, data: result.rows[0] };
        } else {
            return { found: false, lemma };
        }
    }

    async checkConflict(req, yamlStr) {
        if (!yamlStr) throw new Error('No content');
        const data = yaml.load(yamlStr);
        const lemma = data.yield?.lemma?.toLowerCase();
        if (!lemma) throw new Error('Missing lemma');

        const pool = await getPool(req);
        // Using pool directly for check (read-only)
        const res = await pool.query('SELECT * FROM words WHERE lower(lemma) = $1', [lemma]);
        const existing = res.rows[0];

        if (!existing) return { status: 'created', lemma };

        const analysis = conflictService.analyze(existing.original_yaml, data);

        if (analysis.hasConflict) {
            return { 
                status: 'conflict', 
                lemma,
                diff: analysis.diff, 
                oldData: existing.original_yaml, 
                newData: data 
            };
        }

        return { status: 'ok', lemma }; // 'ok' means exists but no conflict (or identical)
    }

    async saveWord(req, yamlStr, forceUpdate) {
        if (!yamlStr) throw new Error('No YAML content');
        const data = yaml.load(yamlStr);
        const lemma = data.yield?.lemma?.toLowerCase();
        if (!lemma) throw new Error('YAML missing yield.lemma');

        const pool = await getPool(req);
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Check Existence
            const existingRes = await client.query('SELECT * FROM words WHERE lower(lemma) = $1', [lemma]);
            const existing = existingRes.rows[0];

            const analysis = existing ? conflictService.analyze(existing.original_yaml, data) : null;
            if (existing && !forceUpdate && analysis?.hasConflict) {
                await client.query('ROLLBACK');
                return { 
                    status: 'conflict', 
                    diff: analysis.diff, 
                    oldData: existing.original_yaml, 
                    newData: data 
                };
            }

            let wordId;
            if (existing) {
                // Update
                wordId = existing.id;

                const shouldUpdate = !!forceUpdate || !!analysis?.hasConflict;
                if (shouldUpdate) {
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

                    await this._updateChildren(client, wordId, data);
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
                await this._updateChildren(client, wordId, data);
            }

            // Log User Request
            const userWord = data.yield?.user_word || lemma;
            const userContext = data.yield?.user_context_sentence;
            if (userWord || userContext) {
                await client.query(`
                    INSERT INTO user_requests (word_id, user_input, context_sentence)
                    VALUES ($1, $2, $3)
                `, [wordId, userWord, userContext]);
            }

            await client.query('COMMIT');
            
            // Determine return status
            let status = 'created';
            if (existing) {
                if (forceUpdate || analysis?.hasConflict) status = 'updated';
                else status = 'logged';
            }

            return { 
                success: true, 
                id: wordId, 
                lemma, 
                status
            };

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async deleteWord(req, id) {
        const pool = await getPool(req);
        await pool.query('DELETE FROM words WHERE id = $1', [id]);
        return { success: true };
    }

    // Helper: Update Child Tables
    async _updateChildren(client, wordId, data) {
        // Clear old
        await client.query('DELETE FROM etymologies WHERE word_id = $1', [wordId]);
        await client.query('DELETE FROM cognates WHERE word_id = $1', [wordId]);
        await client.query('DELETE FROM examples WHERE word_id = $1', [wordId]);
        await client.query('DELETE FROM synonyms WHERE word_id = $1', [wordId]);

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
}

module.exports = new WordService();
