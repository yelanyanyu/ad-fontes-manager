import { describe, expect, it } from 'vitest';
import { hideWordAppMetadataInYaml, stripWordAppMetadata } from './wordMetadata';

describe('wordMetadata', () => {
  it('strips top-level app metadata from editor YAML', () => {
    const result = hideWordAppMetadataInYaml(
      'ad_fontes:\n  word_schema_version: 2\nyield:\n  lemma: abandon\n'
    );

    expect(result).toBe('yield:\n  lemma: abandon\n');
  });

  it('leaves non-object or metadata-free YAML unchanged', () => {
    expect(hideWordAppMetadataInYaml('yield:\n  lemma: abandon\n')).toBe(
      'yield:\n  lemma: abandon\n'
    );
    expect(hideWordAppMetadataInYaml('- abandon\n')).toBe('- abandon\n');
  });

  it('does not mutate the original content object', () => {
    const source = {
      ad_fontes: { word_schema_version: 2 },
      yield: { lemma: 'abandon' },
    };

    expect(stripWordAppMetadata(source)).toEqual({ yield: { lemma: 'abandon' } });
    expect(source).toHaveProperty('ad_fontes');
  });
});
