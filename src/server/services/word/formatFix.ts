import type { ValidationError } from './WordValidator';

// 这里处理“生成出来的 YAML 能不能保存”这件事。
// 它会先做轻量修复，再把剩下的问题整理成前端可展示、编辑器可定位的诊断。
const yaml = require('js-yaml') as typeof import('js-yaml');
const { stripMarkdownFences, repairCommonYamlScalarSlips, repairLlmYamlQuirks } =
  require('../ai/utils') as {
    stripMarkdownFences: (text: string) => string;
    repairCommonYamlScalarSlips: (text: string) => string;
    repairLlmYamlQuirks: (text: string) => string;
  };
const { EnglishWordSchema } = require('../../schemas/word/english');
const { GermanWordSchema } = require('../../schemas/word/german');
const { ensureCurrentWordSchemaMetadata } = require('../../schemas/word/version') as {
  ensureCurrentWordSchemaMetadata: (content: Record<string, unknown>) => Record<string, unknown>;
};
const validator = require('./WordValidator') as {
  validate: (
    data: unknown,
    wordLower: string,
    language?: string
  ) => { valid: boolean; errors: ValidationError[] };
};

type WordLanguage = 'en' | 'de';
type FormatDiagnosticSeverity = 'error' | 'warning';
type FormatRepairType = 'syntax' | 'promote-section';

export interface FormatDiagnostic {
  anchorPath?: string;
  candidatePath?: string;
  kind?: ValidationError['kind'];
  severity: FormatDiagnosticSeverity;
  code: string;
  path: string;
  expected?: string;
  actual?: string;
  message: string;
  suggestion?: string;
}

export interface FormatRepair {
  type: FormatRepairType;
  from?: string;
  to?: string;
  message: string;
}

export interface FormatFixResult {
  ok: boolean;
  yaml?: string;
  data?: Record<string, unknown>;
  language?: WordLanguage;
  changed: boolean;
  canSave: boolean;
  repairs: FormatRepair[];
  diagnostics: FormatDiagnostic[];
}

interface Candidate {
  path: string;
  parent: Record<string, unknown>;
  value: unknown;
}

interface SectionSchema {
  safeParse: (value: unknown) => { success: boolean };
}

interface DuplicateKeyInfo {
  key: string;
  path: string;
  firstLine: number;
  duplicateLine: number;
}

interface UnclosedQuoteInfo {
  key: string;
  path: string;
  line: number;
  closingQuote: string;
}

interface DoubleQuotedScalarPreference {
  key: string;
  value: string;
}

const EXPECTED_ROOT_SECTIONS: Record<WordLanguage, string[]> = {
  en: ['yield', 'etymology', 'word_formation', 'cognate_family', 'application', 'nuance'],
  de: ['yield', 'etymology', 'word_formation', 'cognate_family', 'application', 'nuance'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function detectLanguage(data: Record<string, unknown>): WordLanguage {
  const yieldValue = isRecord(data.yield) ? data.yield : {};
  const contextualMeaning = isRecord(yieldValue.contextual_meaning)
    ? yieldValue.contextual_meaning
    : {};

  if (yieldValue.language === 'de') return 'de';
  if (yieldValue.language === 'en') return 'en';
  if (contextualMeaning.de && !contextualMeaning.en) return 'de';
  return 'en';
}

function getSectionSchema(language: WordLanguage, section: string): SectionSchema | null {
  const schema = language === 'de' ? GermanWordSchema : EnglishWordSchema;
  return schema?.shape?.[section] ?? null;
}

function findNestedCandidates(
  value: unknown,
  section: string,
  path = 'root',
  parent?: Record<string, unknown>
): Candidate[] {
  if (!isRecord(value)) return [];

  const candidates: Candidate[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === 'root' ? key : `${path}.${key}`;
    if (key === section && parent) {
      candidates.push({ path: childPath, parent: value, value: child });
      continue;
    }

    candidates.push(...findNestedCandidates(child, section, childPath, value));
  }

  return candidates;
}

function applySectionPromotion(
  data: Record<string, unknown>,
  language: WordLanguage
): { repairs: FormatRepair[]; diagnostics: FormatDiagnostic[] } {
  const repairs: FormatRepair[] = [];
  const diagnostics: FormatDiagnostic[] = [];

  for (const section of EXPECTED_ROOT_SECTIONS[language]) {
    const nestedCandidates = findNestedCandidates(data, section).filter(
      candidate => !candidate.path.startsWith(`${section}.`) && isRecord(candidate.value)
    );

    if (Object.prototype.hasOwnProperty.call(data, section)) {
      if (nestedCandidates.length > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'section.duplicate',
          path: nestedCandidates[0].path,
          expected: `Only one top-level ${section}`,
          actual: `Root already contains ${section}`,
          message: `${section} also appears at a nested path.`,
          suggestion: `Review both sections and keep one canonical top-level ${section}.`,
        });
      }
      continue;
    }

    if (nestedCandidates.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'section.missing',
        path: section,
        expected: `Top-level ${section}`,
        actual: 'Missing',
        message: `${section} is missing at the YAML root.`,
        suggestion: `Add ${section} as a top-level section.`,
      });
      continue;
    }

    if (nestedCandidates.length > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'section.ambiguous',
        path: section,
        expected: `One misplaced ${section} candidate`,
        actual: nestedCandidates.map(candidate => candidate.path).join(', '),
        message: `Multiple nested ${section} sections were found.`,
        suggestion: `Choose one ${section} section and move it to the YAML root.`,
      });
      continue;
    }

    const [candidate] = nestedCandidates;
    const sectionSchema = getSectionSchema(language, section);
    const validCandidate = sectionSchema?.safeParse(candidate.value).success === true;

    if (!validCandidate) {
      diagnostics.push({
        severity: 'error',
        code: 'section.invalid_candidate',
        path: candidate.path,
        expected: `A valid ${language} ${section} section`,
        actual: 'Nested candidate does not match the section schema',
        message: `${candidate.path} looks like ${section}, but its shape is invalid.`,
        suggestion: `Fix ${candidate.path} before moving it to the YAML root.`,
      });
      continue;
    }

    data[section] = candidate.value;
    delete candidate.parent[section];
    repairs.push({
      type: 'promote-section',
      from: candidate.path,
      to: section,
      message: `Moved ${candidate.path} to top-level ${section}.`,
    });
  }

  return { repairs, diagnostics };
}

function buildInvalidResult(
  diagnostic: FormatDiagnostic,
  yamlText?: string,
  data?: Record<string, unknown>,
  language?: WordLanguage,
  changed = false
): FormatFixResult {
  return {
    ok: false,
    yaml: yamlText,
    data,
    language,
    changed,
    canSave: false,
    repairs: [],
    diagnostics: [diagnostic],
  };
}

function parseYamlObject(text: string): Record<string, unknown> {
  const parsed = yaml.load(text);
  if (!isRecord(parsed)) {
    throw Object.assign(new Error('YAML must be an object.'), {
      code: 'yaml.not_object',
      actual: Array.isArray(parsed) ? 'Array' : typeof parsed,
    });
  }
  return parsed;
}

function getLemma(data: Record<string, unknown>): string {
  const yieldValue = isRecord(data.yield) ? data.yield : {};
  return typeof yieldValue.lemma === 'string' ? yieldValue.lemma : '';
}

function findDuplicateMappingKey(text: string): DuplicateKeyInfo | null {
  const seen = new Map<string, { key: string; line: number }>();
  const stack: Array<{ indent: number; key: string; synthetic?: boolean }> = [];
  let blockScalarIndent: number | null = null;
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    if (blockScalarIndent !== null) {
      if (indent > blockScalarIndent || trimmed === '') continue;
      blockScalarIndent = null;
    }

    const keyMatch = line.match(/^(\s*)(-\s*)?(['"]?)([^:'"#][^:#]*?)\3\s*:\s*(.*)$/);
    if (!keyMatch) continue;

    const hasListMarker = Boolean(keyMatch[2]);
    const key = keyMatch[4].trim();
    const value = keyMatch[5].trim();
    if (!key) continue;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (hasListMarker) {
      stack.push({ indent, key: `[]${index + 1}`, synthetic: true });
    }

    const pathKey = [...stack.map(item => item.key), key].join('.');
    const displayPath = [...stack.filter(item => !item.synthetic).map(item => item.key), key].join(
      '.'
    );
    const existing = seen.get(pathKey);
    if (existing) {
      return {
        key,
        path: displayPath,
        firstLine: existing.line,
        duplicateLine: index + 1,
      };
    }

    seen.set(pathKey, { key, line: index + 1 });

    if (
      value === '' ||
      value === '|' ||
      value === '>' ||
      value.startsWith('|') ||
      value.startsWith('>')
    ) {
      stack.push({ indent, key });
      if (value.startsWith('|') || value.startsWith('>')) {
        blockScalarIndent = indent;
      }
    }
  }

  return null;
}

function hasUnescapedDoubleQuote(text: string): boolean {
  let backslashCount = 0;
  for (const char of text) {
    if (char === '"') return backslashCount % 2 === 0;
    backslashCount = char === '\\' ? backslashCount + 1 : 0;
  }
  return false;
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseYamlScalarValue(rawValue: string): unknown {
  const parsed = yaml.load(`value: ${rawValue}`);
  return isRecord(parsed) ? parsed.value : undefined;
}

function collectDoubleQuotedScalarPreferences(text: string): DoubleQuotedScalarPreference[] {
  const preferences: DoubleQuotedScalarPreference[] = [];
  let blockScalarIndent: number | null = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    if (blockScalarIndent !== null) {
      if (indent > blockScalarIndent || trimmed === '') continue;
      blockScalarIndent = null;
    }

    const keyMatch = line.match(/^(\s*)(?:-\s*)?(['"]?)([^:'"#][^:#]*?)\2\s*:\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[3].trim();
    const value = keyMatch[4].trim();
    if (
      value === '' ||
      value === '|' ||
      value === '>' ||
      value.startsWith('|') ||
      value.startsWith('>')
    ) {
      if (value.startsWith('|') || value.startsWith('>')) {
        blockScalarIndent = indent;
      }
      continue;
    }

    if (!value.startsWith('"')) continue;

    try {
      const parsedValue = parseYamlScalarValue(value);
      if (typeof parsedValue === 'string') {
        preferences.push({ key, value: parsedValue });
      }
    } catch {
      // Ignore invalid scalar text; syntax repair diagnostics handle it elsewhere.
    }
  }

  return preferences;
}

function applyDoubleQuotedScalarPreferences(
  text: string,
  preferences: DoubleQuotedScalarPreference[]
): string {
  if (preferences.length === 0) return text;

  let blockScalarIndent: number | null = null;
  const remaining = [...preferences];
  const lines = text.split(/\r?\n/);

  return lines
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const indent = line.length - line.trimStart().length;
      if (blockScalarIndent !== null) {
        if (indent > blockScalarIndent || trimmed === '') return line;
        blockScalarIndent = null;
      }

      const keyMatch = line.match(
        /^(\s*(?:-\s*)?(['"]?)([^:'"#][^:#]*?)\2\s*:\s*)([^#\n]*?)(\s*(?:#.*)?)$/
      );
      if (!keyMatch) return line;

      const [, prefix, , rawKey, rawValue, comment = ''] = keyMatch;
      const key = rawKey.trim();
      const value = rawValue.trim();

      if (
        value === '' ||
        value === '|' ||
        value === '>' ||
        value.startsWith('|') ||
        value.startsWith('>')
      ) {
        if (value.startsWith('|') || value.startsWith('>')) {
          blockScalarIndent = indent;
        }
        return line;
      }

      let parsedValue: unknown;
      try {
        parsedValue = parseYamlScalarValue(value);
      } catch {
        return line;
      }

      const preferenceIndex = remaining.findIndex(
        preference => preference.key === key && preference.value === parsedValue
      );
      if (preferenceIndex === -1) return line;

      const [preference] = remaining.splice(preferenceIndex, 1);
      return `${prefix}"${escapeYamlDoubleQuoted(preference.value)}"${comment}`;
    })
    .join('\n');
}

function findSmartClosedDoubleQuotedScalar(text: string): UnclosedQuoteInfo | null {
  const stack: Array<{ indent: number; key: string }> = [];
  let blockScalarIndent: number | null = null;
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    if (blockScalarIndent !== null) {
      if (indent > blockScalarIndent || trimmed === '') continue;
      blockScalarIndent = null;
    }

    const keyMatch = line.match(/^(\s*)(?:-\s*)?(['"]?)([^:'"#][^:#]*?)\2\s*:\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[3].trim();
    const value = keyMatch[4].trim();
    if (!key) continue;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const path = [...stack.map(item => item.key), key].join('.');
    if (value.startsWith('"') && !hasUnescapedDoubleQuote(value.slice(1)) && /[”」]$/.test(value)) {
      return {
        key,
        path,
        line: index + 1,
        closingQuote: value.at(-1) || '”',
      };
    }

    if (
      value === '' ||
      value === '|' ||
      value === '>' ||
      value.startsWith('|') ||
      value.startsWith('>')
    ) {
      stack.push({ indent, key });
      if (value.startsWith('|') || value.startsWith('>')) {
        blockScalarIndent = indent;
      }
    }
  }

  return null;
}

export function buildYamlParseDiagnostic(
  error: { message?: string; code?: string; actual?: string },
  text: string
): FormatDiagnostic {
  const duplicate = findDuplicateMappingKey(text);
  if (duplicate && /duplicated mapping key/i.test(String(error.message || ''))) {
    return {
      severity: 'error',
      code: 'yaml.duplicate_key',
      path: duplicate.path || duplicate.key,
      expected: `One mapping entry named ${duplicate.key}`,
      actual: `First at line ${duplicate.firstLine}, duplicated at line ${duplicate.duplicateLine}`,
      message: `Duplicate YAML key "${duplicate.key}": first seen at line ${duplicate.firstLine}, duplicated at line ${duplicate.duplicateLine}.`,
      suggestion: `Merge the two ${duplicate.key} sections or keep only one canonical section.`,
    };
  }

  const unclosedQuote = findSmartClosedDoubleQuotedScalar(text);
  if (unclosedQuote) {
    return {
      severity: 'error',
      code: 'yaml.unclosed_quote',
      path: unclosedQuote.path || unclosedQuote.key,
      expected: 'A double-quoted scalar closed with an ASCII " character',
      actual: `Closed with smart quote ${unclosedQuote.closingQuote}`,
      message: `Line ${unclosedQuote.line} has a double-quoted value closed with a smart quote at ${unclosedQuote.path || unclosedQuote.key}. Replace the final ${unclosedQuote.closingQuote} with ".`,
      suggestion: `Change the closing quote on line ${unclosedQuote.line} to an ASCII double quote, or remove both wrapping quotes.`,
    };
  }

  return {
    severity: 'error',
    code: error.code || 'yaml.parse_error',
    path: 'root',
    expected: 'Parseable YAML object',
    actual: error.actual || error.message,
    message:
      error.code === 'yaml.not_object'
        ? 'YAML must be an object.'
        : `YAML parse error: ${error.message}`,
  };
}

export function prepareYamlForWordSave(wordText: string, yamlText: string): FormatFixResult {
  const strippedYaml = stripMarkdownFences(String(yamlText || ''));
  const repairs: FormatRepair[] = [];
  if (!strippedYaml.trim()) {
    return buildInvalidResult({
      severity: 'error',
      code: 'yaml.empty',
      path: 'root',
      expected: 'YAML content',
      actual: 'Empty text',
      message: 'YAML content is required.',
    });
  }

  let data: Record<string, unknown>;
  let parseableYaml = strippedYaml;
  try {
    data = parseYamlObject(parseableYaml);
  } catch (error) {
    const syntaxRepairedYaml = repairCommonYamlScalarSlips(repairLlmYamlQuirks(parseableYaml));
    if (syntaxRepairedYaml !== parseableYaml) {
      try {
        data = parseYamlObject(syntaxRepairedYaml);
        parseableYaml = syntaxRepairedYaml;
        repairs.push({
          type: 'syntax',
          message: 'Repaired common YAML scalar formatting slips.',
        });
      } catch {
        const err = error as { message?: string; code?: string; actual?: string };
        return buildInvalidResult(
          buildYamlParseDiagnostic(err, syntaxRepairedYaml),
          syntaxRepairedYaml,
          undefined,
          undefined,
          syntaxRepairedYaml !== strippedYaml
        );
      }
    } else {
      const err = error as { message?: string; code?: string; actual?: string };
      return buildInvalidResult(buildYamlParseDiagnostic(err, parseableYaml), parseableYaml);
    }
  }

  const language = detectLanguage(data);
  const doubleQuotedScalarPreferences = collectDoubleQuotedScalarPreferences(parseableYaml);
  try {
    ensureCurrentWordSchemaMetadata(data);
  } catch (error) {
    return buildInvalidResult(
      {
        severity: 'error',
        code: 'schema.unsupported_word_schema_version',
        path: 'ad_fontes.word_schema_version',
        message: error instanceof Error ? error.message : 'Unsupported Word Schema Version',
      },
      parseableYaml,
      data,
      language,
      parseableYaml !== String(yamlText || '').trim() || repairs.length > 0
    );
  }
  const promotionResult = applySectionPromotion(data, language);
  repairs.push(...promotionResult.repairs);
  const diagnostics = promotionResult.diagnostics;
  const repairedYaml = applyDoubleQuotedScalarPreferences(
    yaml.dump(data, { lineWidth: -1, noRefs: true }),
    doubleQuotedScalarPreferences
  );
  const changed =
    parseableYaml !== String(yamlText || '').trim() ||
    repairedYaml.trim() !== parseableYaml.trim() ||
    repairs.length > 0;
  const wordLower = String(wordText || getLemma(data))
    .trim()
    .toLowerCase();
  const validation = wordLower
    ? validator.validate(data, wordLower, language)
    : {
        valid: false,
        errors: [{ path: 'yield.lemma', message: 'yield.lemma is required' }],
      };
  const schemaDiagnostics: FormatDiagnostic[] = validation.valid
    ? []
    : validation.errors.map(error => ({
        severity: 'error',
        code: 'schema.invalid',
        kind: error.kind,
        path: error.path,
        anchorPath: error.anchorPath,
        candidatePath: error.candidatePath,
        message: error.message,
        suggestion: error.suggestion,
      }));
  const allDiagnostics = [...diagnostics, ...schemaDiagnostics];
  const ok = allDiagnostics.length === 0;

  return {
    ok,
    yaml: repairedYaml,
    data,
    language,
    changed,
    canSave: ok,
    repairs,
    diagnostics: allDiagnostics,
  };
}

module.exports = {
  prepareYamlForWordSave,
  buildYamlParseDiagnostic,
};
