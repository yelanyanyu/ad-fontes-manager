---
name: schema-prompt-sync
description: Guides agents through syncing application code with user-edited Word YAML schemas and language prompts. Use when the user says schema or prompt files changed, asks to adapt validation/rendering/import/export to a new schema, or wants Word Schema Version bumped after schema/prompt changes.
---

# Schema Prompt Sync

Use this skill when the user has manually changed Word YAML schema docs or language prompts and wants the app to adapt safely.

## Quick Start

1. Read the changed schema and prompt files first.
2. Compare the schema structure against prompt output requirements.
3. If they match, update validation, repair, rendering, import/export, tests, and schema reference paths as needed.
4. If they clearly do not match, stop and tell the user exactly where they diverge, then invoke `grill-with-docs` to confirm the intended domain model.
5. After the user confirms the intended schema change, attempt to bump Word Schema Version by `+1` and update all version references and tests.

## Files To Check

Check the current repository conventions, then inspect at least these areas:

- `docs/prompts/schemas/*-schema.md`: canonical visible Word YAML schema examples.
- `docs/prompts/*structural*.md` and `docs/prompts/*creative*.md`: AI output contract for each language.
- `src/server/schemas/word/*.ts`: Zod validation for current saved/generated YAML.
- `src/server/services/word/formatFix.ts`: Basic Format Fix, section promotion, language-specific root sections.
- `src/server/services/word/WordSchemaDetector.ts`: old/current/future schema classification.
- `src/server/shared/wordSchemaVersion.ts`: current/default Word Schema Version metadata.
- `src/server/shared/wordCardHtml.ts` and WordPreview modules: preview/Anki HTML rendering.
- Import/export and save paths that validate or tolerate older YAML.
- Existing tests covering schema docs, validator, format fix, preview rendering, import, and save policy.

## Consistency Check

Build a small matrix before editing:

- Top-level sections in schema doc vs structural prompt vs creative prompt.
- Required fields per section.
- Field shape changes, especially scalar-to-object or object-to-array changes.
- Language-specific fields such as German `genus`, `kasus`, `morphological_analysis`.
- Prompt-only helper fields. Decide whether they are intentionally allowed by passthrough objects or should be removed from prompts.
- Hidden app metadata such as `ad_fontes.word_schema_version`.

If the prompt asks the model to output fields that the schema doc does not show, or the schema doc requires fields that no prompt produces, report the mismatch. Do not guess the intended structure. Invoke `grill-with-docs` and ask the user to choose the canonical shape.

## Implementation Workflow

1. Create or update focused tests first when there is a correct seam.
2. Use current prompt/schema examples as fixtures.
3. Update validators to accept only the intended current schema for new AI generation and manual save.
4. Keep import/update behavior tolerant only where the product policy already allows tolerance.
5. Update Format Fix so misplaced current sections can be repaired, while field names that merely match a section name are not mistaken for sections.
6. Update preview/Anki/rendering so new fields are visible and old rendering does not leak obsolete field names.
7. Update schema reference if it reads from docs or if new docs paths are introduced.
8. Run focused tests, then `npm run type-check` and `npm run lint`.

## Version Bump Workflow

Only bump Word Schema Version after the user confirms the canonical schema change.

1. Increase `CURRENT_WORD_SCHEMA_VERSION` by `1`.
2. Update schema docs and prompts to declare the new version.
3. Update detector rules for the new version when specific structural changes distinguish it.
4. Update tests that assert prompt docs match the current version.
5. Check save policy: AI Generate and Yaml Editor save must require current version for new words; imports may remain tolerant only if policy says so.
6. Do not add automatic migration unless the user explicitly asks for it.

## Reporting

When done, summarize:

- What mismatch was found, or that schema and prompts matched.
- Which code paths were updated.
- Whether Word Schema Version was bumped.
- What tests and verification commands passed.
