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
  anchorPath?: string;
  candidatePath?: string;
  kind?:
    | 'unknown_key'
    | 'missing_required'
    | 'wrong_type'
    | 'empty_value'
    | 'invalid_array_item'
    | 'malformed_key_candidate';
  path: string;
  message: string;
  suggestion?: string;
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
    const missingPaths = this._collectMissingPaths(issues);

    for (const issue of issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';

      if (issue.code === 'unrecognized_keys') {
        // Zod 把“多出来的字段”挂在父对象上，这里要展开到真正多出来的 key。
        for (const key of issue.keys) {
          const keyPath = path === 'root' ? key : `${path}.${key}`;
          const candidatePath = this._findMalformedKeyCandidate(keyPath, missingPaths);
          if (candidatePath) {
            this._pushUniqueError(normalized, seen, {
              kind: 'malformed_key_candidate',
              path: keyPath,
              anchorPath: keyPath,
              candidatePath,
              message: `字段名可能写错。这里是不是想写 ${this._pathLeaf(candidatePath)}？`,
              suggestion: `把 ${this._pathLeaf(keyPath)} 改成 ${this._pathLeaf(candidatePath)}。`,
            });
            continue;
          }

          this._pushUniqueError(normalized, seen, {
            kind: 'unknown_key',
            path: keyPath,
            anchorPath: keyPath,
            message: `Unrecognized key: "${key}"`,
            suggestion: '当前结构不支持这个字段。',
          });
        }
        continue;
      }

      if (issue.code === 'invalid_type') {
        const missingRequired = this._isMissingRequiredIssue(issue);
        this._pushUniqueError(normalized, seen, {
          kind: missingRequired ? 'missing_required' : 'wrong_type',
          path,
          anchorPath: missingRequired ? this._pathParent(path) : path,
          message: missingRequired ? `${path} is required` : `${path} has the wrong value type`,
          suggestion: missingRequired
            ? `这里缺少 ${this._pathLeaf(path)} 字段。`
            : '这里的值类型不符合当前词条结构。',
        });
        continue;
      }

      if (issue.code === 'too_small') {
        this._pushUniqueError(normalized, seen, {
          kind: 'empty_value',
          path,
          anchorPath: path,
          message: issue.message || `${path} is required`,
          suggestion: `这里需要填写 ${this._pathLeaf(path)}。`,
        });
        continue;
      }

      if (issue.message && issue.message !== 'Required') {
        this._pushUniqueError(normalized, seen, {
          kind: this._looksLikeArrayItemIssue(issue.message) ? 'invalid_array_item' : undefined,
          path,
          anchorPath: path,
          message: issue.message,
          suggestion: this._looksLikeArrayItemIssue(issue.message)
            ? '这里的条目结构不完整。'
            : undefined,
        });
        continue;
      }

      this._pushUniqueError(normalized, seen, {
        kind: 'wrong_type',
        path,
        anchorPath: path,
        message: issue.message || `${path} is invalid`,
        suggestion: '这里不符合当前词条结构。',
      });
    }

    return this._sortErrors(normalized);
  }

  /**
   * 先收集“缺少字段”路径，后面遇到相似未知字段时才能判断真正根因。
   */
  private _collectMissingPaths(issues: ZodIssue[]): Set<string> {
    const missingPaths = new Set<string>();
    for (const issue of issues) {
      if (issue.code !== 'invalid_type' || !this._isMissingRequiredIssue(issue)) continue;
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      missingPaths.add(path);
    }
    return missingPaths;
  }

  /**
   * 判断 unknown key 是否像是把合法字段名后面误接了额外文本。
   */
  private _findMalformedKeyCandidate(keyPath: string, missingPaths: Set<string>): string | null {
    const keyLeaf = this._pathLeaf(keyPath);
    const colonIndex = keyLeaf.indexOf(':');
    if (colonIndex <= 0) return null;

    const likelyLeaf = keyLeaf.slice(0, colonIndex);
    const likelyPath = this._pathParent(keyPath);
    const candidatePath = likelyPath === 'root' ? likelyLeaf : `${likelyPath}.${likelyLeaf}`;
    return missingPaths.has(candidatePath) ? candidatePath : null;
  }

  /**
   * Zod 用 invalid_type 同时表达缺失字段和类型错误，这里把两者拆开。
   */
  private _isMissingRequiredIssue(issue: ZodIssue): boolean {
    const received = (issue as { received?: unknown }).received;
    return (
      received === 'undefined' ||
      issue.message === 'Required' ||
      /received undefined/i.test(issue.message)
    );
  }

  private _looksLikeArrayItemIssue(message: string): boolean {
    return /\bitems?\b/i.test(message);
  }

  private _pathLeaf(path: string): string {
    return path.split('.').at(-1) || path;
  }

  private _pathParent(path: string): string {
    const parts = path.split('.');
    parts.pop();
    return parts.length > 0 ? parts.join('.') : 'root';
  }

  /**
   * 用户最需要先看到真正可改的位置；拼坏字段名优先于它引发的缺失字段。
   */
  private _sortErrors(errors: ValidationError[]): ValidationError[] {
    const rank = (error: ValidationError): number => {
      if (error.kind === 'malformed_key_candidate') return 0;
      if (error.kind === 'unknown_key') return 1;
      if (error.kind === 'missing_required') return 2;
      return 3;
    };
    return [...errors].sort((left, right) => rank(left) - rank(right));
  }

  /**
   * 去掉重复错误。Zod 有时会对同一个字段给出多条等价信息，保留一条即可。
   */
  private _pushUniqueError(
    target: ValidationError[],
    seen: Set<string>,
    error: ValidationError
  ): void {
    const key = `${error.kind || ''}\n${error.path}\n${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(error);
  }
}

module.exports = new WordValidator();
