import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, test } from 'vitest';
import { mapWordToAnkiFields } from '@/services/ankiFieldMapper';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(currentDir, '../../../../yml_example.yml');
const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
const fixtureData = yaml.load(fixtureRaw) as Record<string, unknown>;

describe('mapWordToAnkiFields', () => {
  test('maps yml_example.yml to target fields', () => {
    const fields = mapWordToAnkiFields(fixtureData, true);

    expect(fields.Word).toBeTruthy();
    expect(fields.Context).toBeTruthy();
    expect(fields.notes).toContain('POS:');
    expect(fields.Back).toContain('<div');
    expect(fields['Add Reverse']).toBe('true');
    expect(fields.Media).toBe('');
  });
});
