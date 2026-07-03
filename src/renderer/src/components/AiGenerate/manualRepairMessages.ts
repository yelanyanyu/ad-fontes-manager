// 这里集中管理手动修复弹窗文案，让组件只关心动作，不关心具体语言。
export type ManualRepairLocale = 'zh' | 'en';
export type ManualRepairKind = 'syntax' | 'schema';

export interface ManualRepairDiagnostic {
  code?: string;
  message?: string;
  path?: string;
}

export interface ManualRepairMessageInput {
  locale: ManualRepairLocale;
  changed: boolean;
  diagnostics: ManualRepairDiagnostic[];
  summary: string;
}

export interface ManualRepairMessage {
  kind: ManualRepairKind;
  title: string;
  body: string;
  diagnosis: string;
  rawPath: string;
  actionHint: string;
  primaryFillLabel: string;
  primaryFillTooltip: string;
  originalFillLabel: string;
  originalFillTooltip: string;
}

interface ManualRepairCopy {
  syntaxTitle: string;
  schemaTitle: string;
  partialRepair: string;
  noRepair: string;
  primaryFillLabel: string;
  primaryFillTooltip: string;
  originalFillLabel: string;
  originalFillTooltip: string;
  actionHint: string;
}

type SchemaDiagnosisKind = 'missing' | 'unknown' | 'invalid';

interface SchemaDiagnosis {
  kind: SchemaDiagnosisKind;
  path: string;
}

const COPY: Record<ManualRepairLocale, ManualRepairCopy> = {
  zh: {
    syntaxTitle: 'YAML 语法需要手动修复',
    schemaTitle: '词条结构需要手动修复',
    partialRepair: '自动修复做了部分安全处理，但 YAML 还不能保存。',
    noRepair: '自动修复没有把 YAML 修到可保存状态。',
    primaryFillLabel: '填入最小修复版',
    primaryFillTooltip: '先保留安全格式修复，再放入编辑器，推荐优先使用。',
    originalFillLabel: '填入原始 YAML',
    originalFillTooltip: '不应用自动格式修复，直接放入模型原始输出。',
    actionHint: '选择一份 YAML 放入编辑器后，可以按提示手动补齐结构。',
  },
  en: {
    syntaxTitle: 'YAML syntax needs manual repair',
    schemaTitle: 'Word structure needs manual repair',
    partialRepair: 'Automatic repair made safe partial changes, but the YAML is not saveable yet.',
    noRepair: 'Automatic repair could not make this YAML saveable.',
    primaryFillLabel: 'Fill minimal repair',
    primaryFillTooltip: 'Keep safer formatting repairs, then place the YAML in the editor.',
    originalFillLabel: 'Fill original YAML',
    originalFillTooltip:
      'Place the original model output in the editor without automatic formatting.',
    actionHint: 'Choose one YAML version to place in the editor, then complete the structure.',
  },
};

function resolveManualRepairKind(diagnostics: ManualRepairDiagnostic[]): ManualRepairKind {
  return diagnostics.some(diagnostic => String(diagnostic.code || '').startsWith('yaml.'))
    ? 'syntax'
    : 'schema';
}

function diagnosticPath(input: ManualRepairMessageInput): string {
  const firstPath = input.diagnostics.find(diagnostic => diagnostic.path)?.path;
  if (firstPath && firstPath !== 'root') return firstPath;
  const pathFromSummary = /([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+)/.exec(input.summary);
  return pathFromSummary?.[1] || 'root';
}

function firstDiagnosticText(input: ManualRepairMessageInput): string {
  return [input.diagnostics.find(diagnostic => diagnostic.message)?.message, input.summary]
    .filter(Boolean)
    .join('\n');
}

function unquoteDiagnosticKey(value: string): string {
  return value.replace(/^["'`]+|["'`]+$/g, '');
}

function schemaDiagnosis(input: ManualRepairMessageInput): SchemaDiagnosis {
  const text = firstDiagnosticText(input);
  const unknownKey =
    /Unrecognized key(?:s)?(?: in object)?:?\s*(["'`][^"'`]+["'`]|[A-Za-z_][\w-]*)/i.exec(text);
  if (unknownKey?.[1]) {
    return {
      kind: 'unknown',
      path: unquoteDiagnosticKey(unknownKey[1]),
    };
  }

  return {
    kind: /required|missing/i.test(text) ? 'missing' : 'invalid',
    path: diagnosticPath(input),
  };
}

function schemaDiagnosisText(diagnosis: SchemaDiagnosis, locale: ManualRepairLocale): string {
  if (diagnosis.kind === 'unknown') {
    return locale === 'zh'
      ? `存在不支持的字段：${diagnosis.path}`
      : `Unsupported field: ${diagnosis.path}`;
  }
  if (diagnosis.kind === 'missing') {
    return locale === 'zh'
      ? `缺少必填字段：${diagnosis.path}`
      : `Missing required field: ${diagnosis.path}`;
  }
  return locale === 'zh'
    ? `结构不符合词条格式：${diagnosis.path}`
    : `Word structure is invalid: ${diagnosis.path}`;
}

// 根据诊断代码选择语法或结构文案；文案本身可以以后接入完整语言切换。
export function buildManualRepairMessage(input: ManualRepairMessageInput): ManualRepairMessage {
  const copy = COPY[input.locale];
  const kind = resolveManualRepairKind(input.diagnostics);
  const schema = kind === 'schema' ? schemaDiagnosis(input) : undefined;
  const path = schema?.path || diagnosticPath(input);
  const diagnosis = schema ? schemaDiagnosisText(schema, input.locale) : input.summary;
  return {
    kind,
    title: kind === 'syntax' ? copy.syntaxTitle : copy.schemaTitle,
    body: input.changed ? copy.partialRepair : copy.noRepair,
    diagnosis,
    rawPath: path,
    actionHint: copy.actionHint,
    primaryFillLabel: copy.primaryFillLabel,
    primaryFillTooltip: copy.primaryFillTooltip,
    originalFillLabel: copy.originalFillLabel,
    originalFillTooltip: copy.originalFillTooltip,
  };
}
