import yaml from 'js-yaml';

export interface DiffBadge {
  path: string;
  cls: string;
}

export interface DiffEntry {
  kind?: string;
  path?: Array<string | number>;
  [key: string]: unknown;
}

export interface YamlFormatter {
  format: (obj: unknown) => string;
}

export interface DeepDiffAdapter {
  getBadges: (diffs: unknown) => DiffBadge[];
  getModules: (diffs: unknown) => string[];
}

const KEY_ORDER = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'] as const;

export const yamlFormatter: YamlFormatter = {
  format(obj: unknown): string {
    const source = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : undefined;
    const orderedObj: Record<string, unknown> = {};

    for (const key of KEY_ORDER) {
      if (source && source[key] !== undefined) {
        orderedObj[key] = source[key];
      }
    }

    if (source) {
      for (const key of Object.keys(source)) {
        if (!KEY_ORDER.includes(key as (typeof KEY_ORDER)[number])) {
          orderedObj[key] = source[key];
        }
      }
    }

    return yaml.dump(orderedObj, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      sortKeys: false,
    });
  },
};

export const deepDiffAdapter: DeepDiffAdapter = {
  getBadges(diffs: unknown): DiffBadge[] {
    if (!Array.isArray(diffs) || diffs.length === 0) return [];

    return (diffs as DiffEntry[]).map(diff => {
      const path = Array.isArray(diff.path) && diff.path.length ? diff.path.join('.') : 'root';

      let cls = 'bg-slate-100 text-slate-600 border-slate-200';
      if (diff.kind === 'N') cls = 'bg-green-100 text-green-700 border-green-200';
      if (diff.kind === 'D') cls = 'bg-red-100 text-red-700 border-red-200';
      if (diff.kind === 'E') cls = 'bg-yellow-100 text-yellow-700 border-yellow-200';
      if (diff.kind === 'A') cls = 'bg-indigo-100 text-indigo-700 border-indigo-200';

      return { path, cls };
    });
  },

  getModules(diffs: unknown): string[] {
    if (!Array.isArray(diffs) || diffs.length === 0) return [];

    const set = new Set<string>();
    for (const diff of diffs as DiffEntry[]) {
      const top = Array.isArray(diff.path) && diff.path.length ? String(diff.path[0]) : 'root';
      set.add(top);
    }

    const ordered: string[] = [];
    for (const key of KEY_ORDER) {
      if (set.has(key)) ordered.push(key);
    }

    for (const key of Array.from(set)) {
      if (!KEY_ORDER.includes(key as (typeof KEY_ORDER)[number])) {
        ordered.push(key);
      }
    }

    return ordered;
  },
};
