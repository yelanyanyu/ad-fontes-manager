import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const { CURRENT_WORD_SCHEMA_VERSION } = require('../src/server/schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};

function listMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listMarkdownFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.md')) files.push(fullPath);
  }

  return files;
}

void test('prompt documentation Word Schema Version matches the current code version', () => {
  const promptDir = join(__dirname, '..', 'docs', 'prompts');
  const files = listMarkdownFiles(promptDir);
  const mismatches: string[] = [];
  let checkedCount = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/word_schema_version:\s*(\d+)/g)) {
      checkedCount += 1;
      const documentedVersion = Number(match[1]);
      if (documentedVersion !== CURRENT_WORD_SCHEMA_VERSION) {
        mismatches.push(`${file}: ${documentedVersion}`);
      }
    }
  }

  assert.ok(checkedCount > 0, 'Expected prompt docs to declare word_schema_version');
  assert.deepEqual(
    mismatches,
    [],
    `Prompt docs must use word_schema_version: ${CURRENT_WORD_SCHEMA_VERSION}`
  );
});
