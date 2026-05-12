import { describe, expect, it } from 'vitest';
import { describeWorksetSaveResult } from '@/services/worksetSaveResult';

describe('describeWorksetSaveResult', () => {
  it('classifies schema validation errors as invalid', () => {
    expect(
      describeWorksetSaveResult({
        success: false,
        error: 'Invalid YAML',
        errors: ['yield.contextual_meaning.en is required'],
      })
    ).toMatchObject({
      status: 'invalid',
      label: 'invalid',
    });
  });

  it('classifies YAML parse and missing lemma errors as invalid', () => {
    expect(
      describeWorksetSaveResult({
        success: false,
        error: 'Invalid YAML format: bad indentation',
      })
    ).toMatchObject({
      status: 'invalid',
      label: 'invalid',
    });

    expect(
      describeWorksetSaveResult({
        success: false,
        error: 'YAML missing yield.lemma',
      })
    ).toMatchObject({
      status: 'invalid',
      label: 'invalid',
    });
  });

  it('keeps non-YAML failures as error', () => {
    expect(
      describeWorksetSaveResult({
        success: false,
        error: 'SQLITE_BUSY: database is locked',
      })
    ).toMatchObject({
      status: 'error',
      label: 'error',
    });
  });
});
