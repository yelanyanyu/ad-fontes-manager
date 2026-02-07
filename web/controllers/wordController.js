const wordService = require('../services/wordService');

class WordController {
    async list(req, res) {
        try {
            const words = await wordService.listWords(req);
            res.json(words);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async getDetails(req, res) {
        const word = (req.query.word || '').trim();
        if (!word) {
            return res.status(400).json({ code: 400, message: 'Word parameter required' });
        }
        try {
            const includeRaw = (req.query.include || '').trim();
            const include = includeRaw ? includeRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
            const data = await wordService.getWordDetails(req, word, include);
            res.status(200).json({ code: 200, message: 'success', data });
        } catch (e) {
            const status = e.message === 'Not found' ? 404 : 500;
            res.status(status).json({ code: status, message: e.message });
        }
    }

    async get(req, res) {
        try {
            const word = await wordService.getWordById(req, req.params.id);
            res.json(word);
        } catch (e) {
            const status = e.message === 'Not found' ? 404 : 500;
            res.status(status).json({ error: e.message });
        }
    }

    async check(req, res) {
        const userWord = req.query.word;
        if (!userWord) return res.status(400).json({ error: 'Word parameter required' });
        
        try {
            const result = await wordService.checkWord(req, userWord);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async save(req, res) {
        const { yaml: yamlStr, forceUpdate } = req.body;
        try {
            const result = await wordService.saveWord(req, yamlStr, forceUpdate);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }

    async addWord(req, res) {
        const word = (req.body.word || '').trim();
        const yamlStr = req.body.yaml || '';
        if (!word || !yamlStr) {
            return res.status(400).json({ code: 400, message: 'Missing parameters' });
        }
        try {
            const result = await wordService.addWord(req, word, yamlStr);
            if (result.status === 'duplicate') {
                return res.status(409).json({ code: 409, message: 'Duplicate word', data: { lemma: result.lemma } });
            }
            if (result.status === 'invalid') {
                return res.status(422).json({ code: 422, message: 'Invalid YAML', data: { errors: result.errors || [] } });
            }
            return res.status(201).json({ code: 201, message: 'created', data: { id: result.id, lemma: result.lemma } });
        } catch (e) {
            res.status(500).json({ code: 500, message: e.message });
        }
    }

    async delete(req, res) {
        try {
            await wordService.deleteWord(req, req.params.id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
}

module.exports = new WordController();
