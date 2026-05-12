# Ad Fontes Manager

A word-entry management tool for the "Ad Fontes" English/German vocabulary learning system. Stores word entries as YAML, provides a Vue 3 editor with live preview, and exports to Anki flashcards.

## Language

### Core

**Word** (词条):
A vocabulary entry identified by a lemma + language pair, stored as a YAML document.
_Avoid_: Entry, record, vocabulary item

**Lemma** (词元):
The citation form of a word — the dictionary headword (e.g., "run" not "running", "gehen" not "ging").
_Avoid_: Headword, base form

**Language**:
Either `en` (English) or `de` (German). Determines which YAML schema applies.
_Avoid_: Locale, tongue

**YAML**:
The serialization format for a Word's full content. Parsed at request time and validated against a language-specific Zod schema.
_Avoid_: Document, payload, body

**Content**:
The JSON column in `words_v2` that holds the complete YAML document. The single source of truth for a Word.
_Avoid_: Data, blob, payload

**Part of Speech** (词性):
Grammatical category of a Lemma — stored at the top level of the YAML, not inferred from content.

### Word structure (YAML fields)

**Yield**:
The top-level section of a Word's YAML containing the word's core semantic output: contextual meanings, example sentences, synonyms, and visual imagery.

**Contextual Meaning** (上下文释义):
A language-specific meaning block inside Yield — `contextual_meaning.en` for English, `contextual_meaning.de` for German. The presence of `.de` is how the system detects German words.
_Avoid_: Definition, gloss

**Root and Affixes** (词根词缀):
English-only YAML section breaking a word into its morphological components (prefix, root, suffix).
_Avoid_: Morphology, word parts

**Morphological Analysis** (形态分析):
German-only counterpart to Root and Affixes. Covers the same structural role with German-specific categories.
_Avoid_: Word formation, Wortbildung

**Etymology** (词源):
The historical origin and development of a word, including cognates and historical phonology.
_Avoid_: Word history, derivation

**Cognate Family** (同源词族):
A set of words across languages that share a common etymological origin.

### Anki export

**AnkiConnect**:
A local Anki desktop plugin exposing an HTTP API. The backend relays requests to it for real-time card creation.
_Avoid_: Anki plugin, Anki bridge

**APKG** (`.apkg` file):
An Anki package file — a zip archive containing a SQLite database of cards, media, and metadata. Generated server-side for download.
_Avoid_: Anki deck file, package

**Field**:
A named slot in an Anki card template (e.g., "Front", "Back", "Etymology"). Word data is mapped from YAML fields to Anki fields.

**Field Mapping**:
The configuration that determines which YAML data source populates which Anki Field.

**Data Source**:
A named extractable value from a Word's YAML (e.g., `lemma`, `synonyms_word`, `rendered_html`). The enumerated set `AnkiDataSource` is the interface between word data and Anki card rendering.
_Avoid_: Field key, extractor key

**Card Template**:
The HTML/CSS structure defining how a single Anki card type renders. Templates are currently hardcoded in the server-side field extractor.

### AI generation

**Pipeline** (流水线):
A multi-stage AI workflow that generates a Word's YAML from a lemma and context. Currently a 3-stage linear sequence: searching → pondering → auditing.
_Avoid_: Workflow, chain, process

**Stage** (阶段):
One step in a Pipeline. Each Stage has a model assignment (`fast`/`balanced`/`expert`), an optional system prompt, optional tools, and an output parser. Stages run sequentially; each receives the previous Stage's output.
_Avoid_: Step, phase, node

**Job** (任务):
A unit of work in the Queue. Three types: **Generate Job** (runs a full Pipeline for one Word), **Fix Job** (runs a single fix Stage against a completed Generate Job's output), **Audit-Fix Job** (audits and fixes a Word already saved to the database). Every Job has a lifecycle (`queued` → `running` → `complete` / `partial` / `error`) and a **Priority** (`normal` or `high`).
_Avoid_: Task, execution, run

**Priority**:
Either `normal` (for Generate Jobs) or `high` (for Fix and Audit-Fix Jobs). The Queue always dequeues high-priority Jobs before normal-priority ones, ensuring user-facing fixes are not blocked by batch generation.

**Concurrency Pool** (并发池):
The set of slots that determines how many Jobs the Queue runs simultaneously. Size is configurable; when a slot frees up, the Queue immediately dequeues the next eligible Job into it.

**Batch** (批次):
A group of Jobs submitted together, tracked as a unit with aggregate progress derived from `job_queue` (`done`/`failed`/`total` via COUNT GROUP BY status). Has its own lifecycle (`pending` → `running` → `paused` / `complete` / `cancelled`). All Jobs in a Batch share the global Concurrency Pool.
_Avoid_: Bulk, group, collection

**Batch Submission** (批量提交):
The user action of creating one Batch from multiple Word analysis requests. A Batch Submission expands into one Generate Job per Word; it does not create a special multi-Word Job. In user-entered batch text and imported batch files, only Word/Lemma is required; Context and Notes are optional per item. Manual batch text input remains a first-class entry path. JSON file import is the stable contract for browser-extension export and future direct desktop integration: `{ "items": [{ "word": "...", "context": "...", "notes": "..." }] }`.
_Avoid_: Multi-word job, combined job

**Queue** (队列):
A SQLite-backed durable scheduler that gates Job execution across a global Concurrency Pool. Dequeues by Priority then by `created_at`. Supports restart recovery (`running` → `queued`), pause/resume/cancel per Job and per Batch, and automatic retry with circuit breaker.
_Avoid_: Job pool, task queue

**Active Queue** (活动队列):
The operational Queue view containing Jobs that can still affect execution: `queued`, `running`, and `paused`. It is used for live control actions such as pause, resume, cancel, and selecting an active Job.
_Avoid_: Queue history, completed queue

**Job History** (任务历史):
The review-oriented Queue view containing non-active Jobs worth revisiting: `complete`, `partial`, and `error`. It is backed by persisted rows in `job_queue`, not by in-memory SSE replay state. It is paginated for display, with 20 Jobs per page by default, and orders statuses by recovery urgency: `error` before `partial` before `complete`. `cancelled` Jobs are hidden by default because they represent intentionally discarded work. Users can hard-delete individual History Jobs or use **Clear History** to hard-delete the current filtered History set, preventing unbounded clutter without forcing page-by-page cleanup. Hard deletion is only allowed for non-executing Jobs, never for `queued`, `running`, or `paused` Jobs.
_Avoid_: Archive, completed tasks

**Job Result Preview** (任务结果预览):
A read-only detail view for a `complete` Job's generated YAML before or after it is saved as a Word. It is distinct from a saved Word preview because a completed Job may not yet have been persisted to `words_v2`.
_Avoid_: Word detail, saved preview

**Circuit Breaker** (熔断):
A safety mechanism that pauses all Jobs assigned to a specific Provider after 3 consecutive failures from that Provider. The user is notified; manual intervention is required to resume.
_Avoid_: Rate limiter, throttle

**Stop-loss** (止损):
A circuit breaker within a Pipeline Stage: if the LLM returns empty text, the Stage retries once with degraded settings (e.g., no tools). If still empty, the Pipeline terminates early, preserving partial results.
_Avoid_: Fallback, safety net, guard

**Provider** (供应商):
An LLM API service (e.g., DeepSeek, OpenRouter) identified by a base URL, API format (`openai` or `anthropic`), and a list of available models.

**Tool**:
A function callable by the LLM during a Pipeline Stage — currently `searchEtymology` (Brave Search API) and `fetchPage` (web page scraping). Defined via Vercel AI SDK's `tool()` and registered per Stage.
_Avoid_: Plugin, capability, skill

**Prompt** (提示词):
A Markdown file under `docs/prompts/` containing the system prompt template for a Stage. Supports `{{variable}}` placeholder injection at load time.
_Avoid_: Template, instruction

**Reasoning** (推理):
An LLM's internal chain-of-thought output, exposed via the `reasoningEffort` parameter. Streamed to the client as `step:reasoning` SSE events, distinct from visible text tokens.
_Avoid_: Thinking, chain-of-thought, CoT

**SSE** (Server-Sent Events):
The protocol used to push real-time Pipeline progress (tokens, reasoning, tool calls, stage transitions) from server to client during a Job.

## Relationships

- A **Word** is identified by a **Lemma** + **Language** pair
- A **Word**'s full data lives in its **Content** (the JSON column holding the **YAML**)
- A **Pipeline** contains 3 **Stages**: searching → pondering → auditing
- A **Job** is one run of a **Pipeline** for one **Word**
- A **Batch** contains N **Jobs**, executed by the **Queue** with configurable concurrency
- The **Active Queue** is for controlling live Jobs; **Job History** is for revisiting completed, partial, or failed Jobs
- Clicking a **Job History** item opens a status-specific detail: `complete` Jobs open a **Job Result Preview**, while `partial` and `error` Jobs reuse the AI drawer so the user can inspect stages and retry or recover
- The Queue panel presents **Active Queue** and **Job History** as two modes in the same UI surface; execution controls belong only to Active Queue, while review and filtering controls belong to Job History
- Saving or overwriting a **Word** remains an Editor responsibility; **Job History** may fill the Editor from a complete Job, but does not write directly to `words_v2`
- Each **Stage** may use one **Provider** + model and zero or more **Tools**
- A **Field Mapping** connects a **Data Source** (from a Word's YAML) to an Anki **Field**
- **AnkiConnect** and **APKG** are two export paths; both use the same **Field Mapping** and **Card Template**

## Example dialogue

> **Dev:** "When a Job hits Stop-loss during searching, does the Pipeline still produce a usable YAML?"
> **Domain expert:** "Yes — Stop-loss preserves whatever the searching Stage produced before it went empty. The Pipeline completes with `pipeline:stopped` instead of `pipeline:complete`, and the partial YAML is returned. The user can still save it, or fix it later with the Fix endpoint."
>
> **Dev:** "Is a Batch just a group of Jobs, or does it have its own Pipeline?"
> **Domain expert:** "A Batch is purely a grouping construct — each Job inside it runs its own Pipeline independently. The Batch tracks aggregate progress (done/failed/total) and enforces the concurrency limit, but it doesn't have a Pipeline of its own."

## Flagged ambiguities

- "Content" was used to mean both the `content` JSON column in `words_v2` and the textual body of a web page fetched by `fetchPage`. Resolved: **Content** always means the database column; use "page text" or "scraped content" for web fetch results.
- "Template" was used for both Anki card HTML templates and Prompt files. Resolved: **Card Template** for Anki; **Prompt** for AI system prompts.
- "Stage" and "Step" were used interchangeably in early code. Resolved: **Stage** is the canonical term; `step` survives only in SSE event names (`step:start`, `step:tokens`) for backward compatibility.
