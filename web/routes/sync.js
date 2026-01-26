const express = require('express');
const router = express.Router();
const localStore = require('../localStore');
const yaml = require('js-yaml');
const { getPool } = require('../db');
const wordService = require('../services/wordService');

router.get('/local', (req, res) => {
    res.json(localStore.getAll());
});

const conflictService = require('../services/conflictService');

router.post('/local', (req, res) => {
    try {
        const { yaml: yamlStr, id, forceUpdate } = req.body;
        // Basic validation
        const data = yaml.load(yamlStr); 
        const lemma = data.yield?.lemma;

        // Offline Conflict Detection
        if (!forceUpdate) {
            // If updating existing ID, conflict check is against ITSELF (diff check only)
            // If creating NEW (no ID), check if lemma exists
            
            let existing = null;
            if (id) {
                // Updating specific record -> Check if content changed
                const items = localStore.getAll();
                existing = items.find(i => i.id === id);
            } else if (lemma) {
                // Creating new -> Check if lemma already exists
                existing = localStore.findByLemma(lemma);
            }

            if (existing) {
                // Parse existing raw yaml
                const oldData = yaml.load(existing.raw_yaml);
                const analysis = conflictService.analyze(oldData, data);
                
                if (analysis.hasConflict) {
                     return res.json({ 
                        status: 'conflict', 
                        diff: analysis.diff, 
                        oldData: oldData, 
                        newData: data,
                        // If it was a lemma collision (new -> existing), we need to return the ID so frontend can update IT instead
                        id: existing.id 
                    });
                } else {
                    // No conflict (content same), just update timestamp/log
                    // If no ID was passed but we found existing, we should probably return 'logged' and the existing ID
                    if (!id) {
                        return res.json({ success: true, id: existing.id, status: 'logged' });
                    }
                }
            }
        }

        // Proceed to Save
        try {
            const savedId = localStore.save(yamlStr, id); // Pass optional ID
            res.json({ success: true, id: savedId, status: id ? 'updated' : 'local_saved' });
        } catch (e) {
            // Check if it's a limit error
            if (e.message.includes('limit reached')) {
                return res.status(400).json({ error: e.message, code: 'LIMIT_REACHED' });
            }
            throw e;
        }
    } catch (e) {
        res.status(400).json({ error: 'Save failed: ' + e.message });
    }
});

router.delete('/local/:id', (req, res) => {
    localStore.delete(req.params.id);
    res.json({ success: true });
});

// New Check Endpoint
router.post('/sync/check', async (req, res) => {
    const { items } = req.body; // Expects array of { id, raw_yaml }
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });

    const results = [];
    try {
        // Verify connection
        const pool = await getPool(req);
        await pool.query('SELECT 1');

        for (const item of items) {
            try {
                const check = await wordService.checkConflict(req, item.raw_yaml);
                results.push({ id: item.id, ...check });
            } catch (e) {
                results.push({ id: item.id, status: 'error', error: e.message });
            }
        }
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: 'Database check failed: ' + e.message });
    }
});

// Execute Sync (Single or Batch)
router.post('/sync/execute', async (req, res) => {
    const { items, forceUpdate } = req.body; // Array of { id, raw_yaml }
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });

    const results = { success: 0, failed: 0, errors: [] };

    try {
        const pool = await getPool(req);
        await pool.query('SELECT 1');

        for (const item of items) {
            try {
                await wordService.saveWord(req, item.raw_yaml, forceUpdate); // Pass forceUpdate
                localStore.delete(item.id);
                results.success++;
            } catch (e) {
                results.failed++;
                results.errors.push({ id: item.id, error: e.message });
            }
        }
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: 'Sync failed: ' + e.message });
    }
});

// Legacy Sync (Keep for compatibility if needed, but better to deprecate)
// We'll replace it with a redirect or just remove it to force frontend update
router.post('/sync', async (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use /sync/check and /sync/execute' });
});

module.exports = router;
