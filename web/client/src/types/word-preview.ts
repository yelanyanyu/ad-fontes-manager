export type PreviewMode = 'card' | 'markdown';

export interface PreviewYamlData {
  yield?: {
    lemma?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PreviewRecord {
  id: string;
  isLocal?: boolean;
  lemma?: string;
  original_yaml?: string | PreviewYamlData;
  raw_yaml?: string;
}
