# Database Schema

> **Database:** SQLite (better-sqlite3 + Drizzle ORM)
> **Last Updated:** 2026-05-03

## Overview

Single-file SQLite database with Drizzle ORM. Schema defined in `src/server/db/schema.ts`, migrations managed via `drizzle-kit` in `drizzle/`.

WAL journal mode is enabled for better concurrent read performance.

## words_v2 Table

Single-table design — the full YAML document is stored as JSON text in the `content` column.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | NO | - | UUID primary key |
| `lemma` | TEXT | NO | - | Canonical form |
| `language` | TEXT | NO | `'en'` | Language code (`en`, `de`) |
| `part_of_speech` | TEXT | YES | - | Part of speech |
| `content` | TEXT | NO | - | Full YAML document as JSON string |
| `created_at` | TEXT | NO | `datetime('now')` | ISO timestamp |
| `updated_at` | TEXT | NO | `datetime('now')` | ISO timestamp |
| `revision_count` | INTEGER | NO | `1` | Update count |

**Constraints:** `UNIQUE (lemma, language)`

**Indexes:**
- `idx_words_v2_language` on `language`
- `idx_words_v2_lemma_lang` on `(lemma, language)`
- `idx_words_v2_created_at` on `created_at`
- `idx_words_v2_updated_at` on `updated_at`

## The `content` Column

The `content` column stores the complete YAML document as a JSON string. It is the single source of truth for a word entry. Example structure:

```json
{
  "yield": { "lemma": "...", "contextual_meaning": { "en": "...", "zh": "..." } },
  "etymology": { "root_and_affixes": { ... }, "historical_origins": { ... } },
  "cognate_family": { "cognates": [...] },
  "application": { "selected_examples": [...] },
  "nuance": { "synonyms": [...] }
}
```

German entries use `morphological_analysis` instead of `root_and_affixes`, German-specific `historical_origins` fields, and extra `yield` fields such as `genus` and `kasus`. The current German prompt schema is defined in `docs/prompts/schemas/de-schema.md`; legacy German sections such as `dialectal_notes` and `observations` are not part of the current save-time validation schema.

## Schema Management

```bash
# Generate migration after editing src/server/db/schema.ts
npx drizzle-kit generate

# Migrations run automatically on server start (pushMigration())
```

## Data File Locations

| Mode | Path |
|------|------|
| Web dev | `data/ad_fontes.db` (or `DATABASE_URL` env var) |
| Desktop (Windows) | `%APPDATA%/ad-fontes-manager/data/ad_fontes.db` |
| Desktop (Mac) | `~/Library/Application Support/ad-fontes-manager/data/ad_fontes.db` |
| Docker | `/app/data/ad_fontes.db` (volume mount) |

## WAL Mode Notes

SQLite WAL (Write-Ahead Logging) creates two companion files alongside the database:
- `ad_fontes.db-wal` — Write-Ahead Log
- `ad_fontes.db-shm` — Shared Memory index

These are normal and automatically cleaned up on clean shutdown. When copying or replacing the database file, delete these companion files first to avoid data corruption.

## Migrating from PostgreSQL

```bash
PG_DATABASE_URL=postgresql://user:pass@host:5432/db \
DATABASE_URL=./data/ad_fontes.db \
npm run import:pg-v2
```

## Removed v1 Schema

The old 6-table schema (`words`, `etymologies`, `cognates`, `examples`, `synonyms`, `user_requests`) is no longer part of the active SQLite schema. Active code paths and migrations use `words_v2`.

## See Also

- [src/server/db/schema.ts](../src/server/db/schema.ts) — Drizzle schema definition
- [src/server/db/index.ts](../src/server/db/index.ts) — DB connection management
- [API Documentation](./API.md) — API endpoints
