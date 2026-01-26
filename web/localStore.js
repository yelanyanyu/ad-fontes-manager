const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LocalStore {
    constructor() {
        this.dataFile = path.join(__dirname, 'data', 'local_words.json');
        this.configFile = path.join(__dirname, 'config.json');
        
        // Load limit from config or default
        const config = this.getConfig();
        this.limit = config.MAX_LOCAL_ITEMS || 100;
        
        // Ensure data dir exists
        const dataDir = path.dirname(this.dataFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    // --- Config Management ---

    getConfig() {
        if (!fs.existsSync(this.configFile)) return {};
        try {
            return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        } catch (e) {
            console.error('Config read error:', e);
            return {};
        }
    }

    saveConfig(config) {
        // Merge with existing
        const current = this.getConfig();
        const newConfig = { ...current, ...config };
        
        // Update limit if changed
        if (newConfig.MAX_LOCAL_ITEMS) {
            this.limit = parseInt(newConfig.MAX_LOCAL_ITEMS) || 100;
        }

        fs.writeFileSync(this.configFile, JSON.stringify(newConfig, null, 2));
    }

    // --- Data Management ---

    _readData() {
        if (!fs.existsSync(this.dataFile)) return [];
        try {
            return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        } catch (e) {
            console.error('Local data read error:', e);
            return [];
        }
    }

    _writeData(data) {
        fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    }

    getAll() {
        return this._readData().sort((a, b) => b.updated_at - a.updated_at);
    }

    findByLemma(lemma) {
        if (!lemma) return null;
        const items = this._readData();
        const target = lemma.toLowerCase();
        // We need to parse items to check lemma, or store lemma metadata.
        // Parsing everything is slow but robust for small local store (limit 100).
        // Optimization: Store lemma in the JSON object when saving.
        
        // Fallback: Parse on the fly
        return items.find(i => {
            if (i.lemma_preview) return i.lemma_preview.toLowerCase() === target;
            // Try parse
            try {
                // simple regex extract to avoid full parse
                const match = i.raw_yaml.match(/lemma:\s*"?([^"\n]+)"?/);
                if (match && match[1].trim().toLowerCase() === target) return true;
            } catch(e) {}
            return false;
        });
    }

    save(rawYaml, id = null) {
        let items = this._readData();
        
        // Extract lemma for indexing/search
        let lemma = null;
        try {
            const match = rawYaml.match(/lemma:\s*"?([^"\n]+)"?/);
            if (match) lemma = match[1].trim();
        } catch(e) {}
        
        if (id) {
            // Update existing
            const index = items.findIndex(i => i.id === id);
            if (index !== -1) {
                items[index] = {
                    ...items[index],
                    raw_yaml: rawYaml,
                    lemma_preview: lemma, // Store metadata
                    updated_at: Date.now()
                };
                const item = items.splice(index, 1)[0];
                items.unshift(item);
                this._writeData(items);
                return id;
            }
        }

        // Create New
        if (items.length >= this.limit) {
            throw new Error(`Local storage limit reached (${this.limit}). Please sync or delete items.`);
        }

        const newId = crypto.randomUUID();
        const newItem = {
            id: newId,
            raw_yaml: rawYaml,
            lemma_preview: lemma, // Store metadata
            updated_at: Date.now()
        };

        // Add to front
        items.unshift(newItem);
        
        // Enforce limit (Just in case, though we check above)
        // if (items.length > this.limit) {
        //    items = items.slice(0, this.limit);
        // }

        this._writeData(items);
        return newId;
    }

    delete(id) {
        let items = this._readData();
        items = items.filter(i => i.id !== id);
        this._writeData(items);
    }
    
    clear() {
        this._writeData([]);
    }
}

module.exports = new LocalStore();
