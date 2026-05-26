const yaml = require('js-yaml') as typeof import('js-yaml');
const { stripMarkdownFences, repairCommonYamlScalarSlips, repairLlmYamlQuirks } =
  require('../ai/utils') as {
    stripMarkdownFences: (text: string) => string;
    repairCommonYamlScalarSlips: (text: string) => string;
    repairLlmYamlQuirks: (text: string) => string;
  };
const { EnglishWordSchema } = require('../../schemas/word/english');
const { GermanWordSchema } = require('../../schemas/word/german');
const validator = require('./WordValidator') as {
  validate: (
    data: unknown,
    wordLower: string,
    language?: string
  ) => { valid: boolean; errors: string[] };
};

type WordLanguage = 'en' | 'de';
type FormatDiagnosticSeverity = 'error' | 'warning';
type FormatRepairType = 'syntax' | 'promote-section';

export interface FormatDiagnostic {
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

const EXPECTED_ROOT_SECTIONS: Record<WordLanguage, string[]> = {
  en: ['yield', 'etymology', 'cognate_family', 'application', 'nuance'],
  de: [
    'yield',
    'etymology',
    'cognate_family',
    'application',
    'nuance',
    'dialectal_notes',
    'observations',
  ],
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
      candidate => !candidate.path.startsWith(`${section}.`)
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
    const existing = seen.get(path);
    if (existing) {
      return {
        key,
        path,
        firstLine: existing.line,
        duplicateLine: index + 1,
      };
    }

    seen.set(path, { key, line: index + 1 });

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
  const promotionResult = applySectionPromotion(data, language);
  repairs.push(...promotionResult.repairs);
  const diagnostics = promotionResult.diagnostics;
  const changed = parseableYaml !== String(yamlText || '').trim() || repairs.length > 0;
  const repairedYaml = changed ? yaml.dump(data, { lineWidth: -1, noRefs: true }) : strippedYaml;
  const wordLower = String(wordText || getLemma(data))
    .trim()
    .toLowerCase();
  const validation = wordLower
    ? validator.validate(data, wordLower, language)
    : { valid: false, errors: ['yield.lemma is required'] };
  const schemaDiagnostics: FormatDiagnostic[] = validation.valid
    ? []
    : validation.errors.map(error => ({
        severity: 'error',
        code: 'schema.invalid',
        path: 'root',
        message: error,
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
