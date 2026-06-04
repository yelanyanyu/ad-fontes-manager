import type { PipelineContext } from './types';

const yaml = require('js-yaml') as typeof import('js-yaml');
const { getAIConfig } = require('./configService') as {
  getAIConfig: () => {
    review?: {
      aiFlavorMarkers?: AIFlavorMarkerConfig[];
    };
  };
};

export interface AIFlavorMarkerConfig {
  id: string;
  label: string;
  pattern: string;
  description?: string;
  fields?: string[];
  enabled?: boolean;
}

export interface AIFlavorMarkerHit {
  markerId: string;
  label: string;
  field: string;
  match: string;
  excerpt: string;
}

export interface AIFlavorMarkerEvidence {
  hits: AIFlavorMarkerHit[];
  summaryText: string;
}

const REVIEW_FIELDS = [
  'etymology.visual_imagery_zh',
  'etymology.meaning_evolution_zh',
  'nuance.image_differentiation_zh',
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPath(root: unknown, path: string): string {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    const record = asRecord(current);
    if (!record) return '';
    current = record[segment];
  }
  return typeof current === 'string' ? current : '';
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, index + length + 24);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, ' ').trim();
}

function parseYamlDocument(yamlText: string): unknown {
  try {
    return yaml.load(yamlText);
  } catch {
    return undefined;
  }
}

export function findMarkerHits(
  yamlText: string,
  markers: AIFlavorMarkerConfig[]
): AIFlavorMarkerHit[] {
  const document = parseYamlDocument(yamlText);
  if (!document) return [];

  const hits: AIFlavorMarkerHit[] = [];
  for (const marker of markers) {
    if (marker.enabled === false) continue;

    let regex: RegExp;
    try {
      regex = new RegExp(marker.pattern, 'gu');
    } catch {
      continue;
    }

    const fields = marker.fields?.length ? marker.fields : REVIEW_FIELDS;
    for (const field of fields) {
      const value = readPath(document, field);
      if (!value) continue;

      regex.lastIndex = 0;
      for (const match of value.matchAll(regex)) {
        const matchedText = match[0];
        if (!matchedText) continue;
        hits.push({
          markerId: marker.id,
          label: marker.label,
          field,
          match: matchedText,
          excerpt: excerptAround(value, match.index || 0, matchedText.length),
        });
      }
    }
  }

  return hits;
}

function summarizeEvidence(hits: AIFlavorMarkerHit[], statusText?: string): string {
  if (!hits.length) return statusText || '机械检测未发现已配置的 AI 味硬标识。';

  const lines = [
    `机械检测发现 ${hits.length} 处已配置的 AI 味硬标识。LLM 审核时必须结合下列命中与 YAML 原文判断是否扣分或触发强失败：`,
  ];

  hits.forEach((hit, index) => {
    lines.push(`${index + 1}. [${hit.label}] ${hit.field}: "${hit.match}"；上下文：${hit.excerpt}`);
  });

  return lines.join('\n');
}

export function buildAiFlavorMarkerEvidence(
  ctx: PipelineContext,
  markerOverride?: AIFlavorMarkerConfig[]
): AIFlavorMarkerEvidence {
  const yamlText = ctx.fullYaml || ctx.researchYaml || '';
  if (!yamlText.trim()) {
    return { hits: [], summaryText: summarizeEvidence([], '未检测：没有可审核 YAML。') };
  }

  const markers = markerOverride || getAIConfig().review?.aiFlavorMarkers || [];
  if (!markers.length) {
    return { hits: [], summaryText: summarizeEvidence([], '未配置机械 AI 味标识。') };
  }

  const hits = findMarkerHits(yamlText, markers);
  return { hits, summaryText: summarizeEvidence(hits) };
}

module.exports = { buildAiFlavorMarkerEvidence, findMarkerHits };
