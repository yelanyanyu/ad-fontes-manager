import type { ZodIssue } from 'zod';

const { EnglishWordSchema, GermanWordSchema } = require('../../schemas/word.ts') as {
  EnglishWordSchema: {
    safeParse: (input: unknown) => {
      success: boolean;
      data: {
        yield: {
          lemma: string;
        };
      };
      error: {
        issues: ZodIssue[];
      };
    };
  };
  GermanWordSchema: {
    safeParse: (input: unknown) => {
      success: boolean;
      data: {
        yield: {
          lemma: string;
        };
      };
      error: {
        issues: ZodIssue[];
      };
    };
  };
};

type ValidationError = string;

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

class WordValidator {
  validate(data: unknown, wordLower: string, language: string = 'en'): ValidationResult {
    const schema = language === 'de' ? GermanWordSchema : EnglishWordSchema;
    const parseResult = schema.safeParse(data);

    if (!parseResult.success) {
      return {
        valid: false,
        errors: this._convertZodIssues(parseResult.error.issues),
      };
    }

    const lemma = String(parseResult.data.yield.lemma || '')
      .trim()
      .toLowerCase();
    if (!lemma || lemma !== wordLower) {
      return {
        valid: false,
        errors: ['yield.lemma must match word'],
      };
    }

    return { valid: true, errors: [] };
  }

  private _convertZodIssues(issues: ZodIssue[]): ValidationError[] {
    const normalized: string[] = [];

    for (const issue of issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';

      if (issue.code === 'invalid_type') {
        normalized.push(path === 'root' ? 'root must be an object' : `${path} is required`);
        continue;
      }

      if (issue.code === 'too_small') {
        normalized.push(issue.message || `${path} is required`);
        continue;
      }

      if (issue.message && issue.message !== 'Required') {
        normalized.push(issue.message);
        continue;
      }

      normalized.push(issue.message || `${path} is invalid`);
    }

    return [...new Set(normalized)];
  }
}

module.exports = new WordValidator();
