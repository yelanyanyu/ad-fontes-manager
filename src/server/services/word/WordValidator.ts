import type { ZodIssue } from 'zod';

// 词条验证器负责把 Zod 的底层错误整理成业务层能直接使用的诊断。
// message 给人读，path 给编辑器、弹窗和自动修复流程定位字段。
const { EnglishWordSchema, GermanWordSchema } = require('../../schemas/word') as {
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

export interface ValidationError {
  path: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

class WordValidator {
  /**
   * 校验词条是否符合当前语言的 schema，并额外确认 lemma 和用户输入的单词一致。
   */
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
        errors: [{ path: 'yield.lemma', message: 'yield.lemma must match word' }],
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * 把 Zod issue 转成稳定的验证错误，避免后续调用方只能从字符串里猜字段位置。
   */
  private _convertZodIssues(issues: ZodIssue[]): ValidationError[] {
    const normalized: ValidationError[] = [];
    const seen = new Set<string>();

    for (const issue of issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';

      if (issue.code === 'unrecognized_keys') {
        // Zod 把“多出来的字段”挂在父对象上，这里要展开到真正多出来的 key。
        for (const key of issue.keys) {
          const keyPath = path === 'root' ? key : `${path}.${key}`;
          this._pushUniqueError(normalized, seen, {
            path: keyPath,
            message: `Unrecognized key: "${key}"`,
          });
        }
        continue;
      }

      if (issue.code === 'invalid_type') {
        this._pushUniqueError(normalized, seen, {
          path,
          message: path === 'root' ? 'root must be an object' : `${path} is required`,
        });
        continue;
      }

      if (issue.code === 'too_small') {
        this._pushUniqueError(normalized, seen, {
          path,
          message: issue.message || `${path} is required`,
        });
        continue;
      }

      if (issue.message && issue.message !== 'Required') {
        this._pushUniqueError(normalized, seen, {
          path,
          message: issue.message,
        });
        continue;
      }

      this._pushUniqueError(normalized, seen, {
        path,
        message: issue.message || `${path} is invalid`,
      });
    }

    return normalized;
  }

  /**
   * 去掉重复错误。Zod 有时会对同一个字段给出多条等价信息，保留一条即可。
   */
  private _pushUniqueError(
    target: ValidationError[],
    seen: Set<string>,
    error: ValidationError
  ): void {
    const key = `${error.path}\n${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(error);
  }
}

module.exports = new WordValidator();
