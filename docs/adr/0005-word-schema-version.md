# 0005: Word Schema Version as App-Owned Word Metadata

**Status**: accepted

## Context

Word Content is the source of truth for a saved Word. As the Word YAML schema evolves, users need to see whether an existing Word was generated against the current structure without confusing that with Prompt version, App Version, Word Export File version, or revision count.

## Decision

Store Word Schema Version in Content at `ad_fontes.word_schema_version`.

`ad_fontes` is app-owned metadata, not learning content. The ordinary YAML editor hides it and users are not expected to edit it directly. Word Export preserves it because export is a lossless exchange format.

Add `words_v2.word_schema_version` as a derived query cache for list badges and filtering. Content remains the source of truth. Existing Words without `ad_fontes.word_schema_version` are treated as version 1.

The app does not automatically migrate old Word Content to a newer Word Schema Version. It should show that the Word is outdated and recommend regeneration.

## Consequences

- New saves and generated Words include `ad_fontes.word_schema_version`.
- Future schema changes increment a single integer `CURRENT_WORD_SCHEMA_VERSION`.
- Outdated Word UI uses informational or warning styling, not danger styling.
- Import/export keeps version metadata with Content.
- The database column must be kept in sync from Content when Words are created or updated.
