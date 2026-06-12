#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const DEFAULT_WORD_SCHEMA_VERSION = 1;

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readDeclaredWordSchemaVersion(content) {
  if (!isRecord(content)) return null;
  const metadata = content.ad_fontes;
  if (!isRecord(metadata)) return null;
  const version = metadata.word_schema_version;
  return Number.isInteger(version) && version > 0 ? version : null;
}

function ensureVersionMetadata(content) {
  const declared = readDeclaredWordSchemaVersion(content);
  if (declared !== null) {
    return {
      content,
      version: declared,
      changedContent: false,
      alreadyVersioned: true,
    };
  }

  const metadata = isRecord(content.ad_fontes) ? { ...content.ad_fontes } : {};
  metadata.word_schema_version = DEFAULT_WORD_SCHEMA_VERSION;
  return {
    content: {
      ...content,
      ad_fontes: metadata,
    },
    version: DEFAULT_WORD_SCHEMA_VERSION,
    changedContent: true,
    alreadyVersioned: false,
  };
}

export function backfillWordSchemaVersion(dbPath, options = {}) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new Error('Database path is required');
  }

  const resolvedPath = path.resolve(dbPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Database not found: ${resolvedPath}`);
  }

  const dryRun = Boolean(options.dryRun);
  const db = new Database(resolvedPath);

  try {
    const rows = db.prepare('SELECT id, content, word_schema_version FROM words_v2').all();
    const planned = backfillWordSchemaVersionRows(rows, { dryRun });
    const update = db.prepare(
      'UPDATE words_v2 SET content = ?, word_schema_version = ? WHERE id = ?'
    );

    const applyBackfill = db.transaction(() => {
      if (dryRun) return;
      for (const row of planned.updates) update.run(row.content, row.word_schema_version, row.id);
    });

    applyBackfill();
    const { updates: _updates, ...result } = planned;
    return result;
  } finally {
    db.close();
  }
}

export function backfillWordSchemaVersionRows(rows, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const result = {
    scanned: 0,
    updated: 0,
    alreadyVersioned: 0,
    skippedInvalidJson: 0,
    dryRun,
    updates: [],
  };

  for (const row of rows) {
    result.scanned += 1;

    let content;
    try {
      content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    } catch {
      result.skippedInvalidJson += 1;
      continue;
    }

    if (!isRecord(content)) {
      result.skippedInvalidJson += 1;
      continue;
    }

    const next = ensureVersionMetadata(content);
    if (next.alreadyVersioned) result.alreadyVersioned += 1;

    const contentText = JSON.stringify(next.content);
    const currentContentText =
      typeof row.content === 'string' ? row.content : JSON.stringify(row.content);
    const needsUpdate =
      next.changedContent ||
      Number(row.word_schema_version) !== next.version ||
      currentContentText !== contentText;

    if (!needsUpdate) continue;
    result.updated += 1;
    result.updates.push({
      id: row.id,
      content: contentText,
      word_schema_version: next.version,
    });
  }

  return result;
}

function printUsage() {
  console.log(
    'Usage: node scripts/backfill-word-schema-version.mjs <path-to-ad_fontes.db> [--dry-run]'
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dbPath = args.find(arg => arg !== '--dry-run');
  return { dbPath, dryRun };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const { dbPath, dryRun } = parseArgs(process.argv);
  if (!dbPath) {
    printUsage();
    process.exitCode = 1;
  } else {
    const result = backfillWordSchemaVersion(dbPath, { dryRun });
    console.log(JSON.stringify(result, null, 2));
  }
}
