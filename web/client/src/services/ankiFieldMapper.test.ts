import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, test } from 'vitest';
import {
  buildCanonicalAnkiFields,
  mapCanonicalFieldsToAnkiFields,
  mapWordToAnkiFields,
} from '@/services/ankiFieldMapper';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(currentDir, '../../../../yml_example.yml');
const fixtureRaw = fs.readFileSync(fixturePath, 'utf8');
const fixtureData = yaml.load(fixtureRaw) as Record<string, unknown>;

describe('mapWordToAnkiFields', () => {
  test('maps yml_example.yml to target fields', () => {
    const fields = mapWordToAnkiFields(fixtureData, true);

    expect(fields.Word).toBeTruthy();
    expect(fields.Context).toBeTruthy();
    expect(fields.notes).toBe('');
    expect(fields.Back).toContain('<div');
    expect(fields['Add Reverse']).toBe('true');
    expect(fields.Media).toBe('');
  });

  test('builds canonical fields before mapping them to the default Anki template', () => {
    const canonical = buildCanonicalAnkiFields(fixtureData, true);
    const mapped = mapCanonicalFieldsToAnkiFields(canonical);

    expect(mapped).toEqual(mapWordToAnkiFields(fixtureData, true));
  });

  test('maps canonical fields to an alternate target template field set', () => {
    const canonical = buildCanonicalAnkiFields(fixtureData, false, 'audio.mp3');
    const mapped = mapCanonicalFieldsToAnkiFields(canonical, {
      word: 'id',
      context: 'question',
      notes: 'notes',
      back: 'answer',
      addReverse: 'options',
      media: 'audio',
    });

    expect(mapped.id).toBe(canonical.word);
    expect(mapped.question).toBe(canonical.context);
    expect(mapped.answer).toBe(canonical.back);
    expect(mapped.options).toBe(canonical.addReverse);
    expect(mapped.audio).toBe('audio.mp3');
  });
});
