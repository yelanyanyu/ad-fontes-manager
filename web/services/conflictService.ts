const diff = require('deep-diff') as (lhs: unknown, rhs: unknown) => unknown[] | undefined;

interface ConflictAnalysisResult {
  hasConflict: boolean;
  diff: unknown[] | undefined;
  cleanOld: Record<string, unknown>;
  cleanNew: Record<string, unknown>;
}

class ConflictService {
  analyze(oldData: unknown, newData: unknown): ConflictAnalysisResult {
    const cleanOld = this._clean(oldData);
    const cleanNew = this._clean(newData);

    const differences = diff(cleanOld, cleanNew);

    return {
      hasConflict: Boolean(differences),
      diff: differences,
      cleanOld,
      cleanNew,
    };
  }

  _clean(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') return {};

    const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    const yieldData = clean.yield;

    if (yieldData && typeof yieldData === 'object') {
      delete (yieldData as Record<string, unknown>).user_word;
      delete (yieldData as Record<string, unknown>).user_context_sentence;
    }

    return clean;
  }
}

module.exports = new ConflictService();
