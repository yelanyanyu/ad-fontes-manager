# 0005: Word Schema Version as App-Owned Word Metadata

**Status**: accepted

## Context

Word Content is the source of truth for a saved Word. As the Word YAML schema evolves, users need to see whether an existing Word was generated against the current structure without confusing that with Prompt version, App Version, Word Export File version, or revision count.

## Decision

Store Word Schema Version in Content at `ad_fontes.word_schema_version`.

`ad_fontes` is app-owned metadata, not learning content. The ordinary YAML editor hides it and users are not expected to edit it directly. Word Export preserves it because export is a lossless exchange format.

Add `words_v2.word_schema_version` as a derived query cache for list badges and filtering. Content remains the source of truth. Existing Words without `ad_fontes.word_schema_version` are treated as version 1 for compatibility.

The app does not automatically migrate old Word Content to a newer Word Schema Version. It should show that the Word is outdated and recommend regeneration.

Historical databases may be normalized by an external one-time backfill script that adds `ad_fontes.word_schema_version: 1` to Content that lacks the metadata and synchronizes the derived database column. This is classification of unknown historical Content, not migration to the current schema, and it is outside the core app behavior.

New Words entering the App Database must conform to the current Word Schema Version. Old Content may be maintained only when it overwrites or edits an existing old Word; it must not be created as a new Word through YAML Editor save, AI Generate, Workset save, or Word Import. Future Word Content is rejected because the current app cannot safely interpret it. Future Content is identified by declared metadata above `CURRENT_WORD_SCHEMA_VERSION`; future-shaped YAML without declared metadata cannot be reliably recognized by an older app and is treated as current-invalid or unknown entry YAML rather than as maintainable future Content. Word Import reports non-current new Words as item-level skips with reasons, rather than failing the entire import file when other current Words can still be imported. Word Import must not downgrade existing Content: old imports may overwrite only existing old Words, current imports may overwrite old or current Words after conflict review, and future imports may not overwrite any Word. YAML Editor updates must not downgrade an existing current Word to old Content.

## Consequences

- New saves and generated Words include `ad_fontes.word_schema_version`.
- Future schema changes increment a single integer `CURRENT_WORD_SCHEMA_VERSION`.
- Outdated Word UI uses informational or warning styling, not danger styling.
- Import/export keeps version metadata with Content.
- The database column must be kept in sync from Content when Words are created or updated.
- A missing-version backfill can be maintained as an external operational script; the app should still read missing metadata as version 1 to remain compatible with old imports and databases.
- Word Import can maintain existing old Words losslessly, but it cannot expand the database with new old or future Words.
- Word Import results should distinguish imported current Words, skipped old new Words, skipped future new Words, and conflicts that require review.
- Word Import conflict review should not offer actions that would downgrade a current Word to old Content or write future Content with the current app.
- YAML Editor save can maintain old Words losslessly, but current Words must stay current after edit.
