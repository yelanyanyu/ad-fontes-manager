# Database Schema Documentation

> **Database:** SQLite (via better-sqlite3 + Drizzle ORM)  
> **Last Updated:** 2026-05-01

## Overview

Single-file SQLite database with Drizzle ORM. Schema is defined in `web/db/schema.ts` and managed via `drizzle-kit` migrations in `drizzle/`.

## Schema

All data is stored in `words_v2` — a single-table design where the full YAML document is stored as JSON in the `content` column.

```mermaid
erDiagram
    words_v2 {
        text id PK
        text lemma
        text language "en, de, etc."
        text part_of_speech
        json content "Full YAML document as JSON text"
        text created_at
        text updated_at
        integer revision_count
    }
```

### words_v2

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | TEXT | NO | - | UUID primary key |
| `lemma` | TEXT | NO | - | Canonical form |
| `language` | TEXT | NO | `'en'` | Language code (en, de) |
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

### _local_words

Draft/offline word storage. Items are deleted after sync to `words_v2`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `raw_yaml` | TEXT | Raw YAML string |
| `lemma_preview` | TEXT | Extracted lemma for search |
| `updated_at` | INTEGER | Unix ms timestamp |

### _local_config

Key-value configuration store.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Config key |
| `value` | TEXT | JSON-encoded value |

## Schema Management

```bash
# Generate migration after schema changes
cd web && npx drizzle-kit generate

# Apply migrations (runs automatically on server start)
cd web && npm run dev

# Initialize a new database
cd node && npm run init-db
```

## Data File

- Development: `web/data/ad_fontes.db`
- Docker: `/app/data/ad_fontes.db` (volume mount `./web/data:/app/data`)

## Migration from PostgreSQL

A one-time import script is available:

```bash
# Set PG source and SQLite target
PG_DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_URL=./web/data/ad_fontes.db

# Run import
cd web && npm run import:pg-v2

# Verify migration
cd node && npm run verify-sqlite-migration
```

Original PG schema and migration files have been removed. Git history (`schema.sql`, `migrations/`) is available for reference.

## See Also

- [web/db/schema.ts](../web/db/schema.ts) — Drizzle schema definition
- [web/db/index.ts](../web/db/index.ts) — DB connection management
- [API Documentation](./API.md) — API endpoints
