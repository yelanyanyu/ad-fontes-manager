const diff = require('deep-diff');

class ConflictService {
    /**
     * Analyzes differences between two YAML objects, ignoring transient fields.
     * @param {Object} oldData - Existing data from DB
     * @param {Object} newData - Incoming data from User/Sync
     * @returns {Object} { hasConflict, diff, cleanOld, cleanNew }
     */
    analyze(oldData, newData) {
        // Clean up noise for diff
        // We focus on core structure: yield(minus user context), etymology, cognate_family, nuance
        const cleanOld = this._clean(oldData);
        const cleanNew = this._clean(newData);
        
        const differences = diff(cleanOld, cleanNew);

        return {
            hasConflict: !!differences,
            diff: differences,
            cleanOld,
            cleanNew
        };
    }

    _clean(data) {
        if (!data) return {};
        // Clone to avoid mutation
        const clean = JSON.parse(JSON.stringify(data));
        
        // Remove User-Specific Context (Transient)
        if (clean.yield) {
            delete clean.yield.user_word;
            delete clean.yield.user_context_sentence;
        }

        return clean;
    }
}

module.exports = new ConflictService();