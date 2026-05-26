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

### Software update

**Software Update** (软件更新):
The desktop app's update flow: compare the local App Version with the latest Release Version, notify the user when a newer Platform Installer Asset is available, and optionally download the update before handing installation to the user.
_Avoid_: Silent update

**Auto Update Check** (自动检查更新):
The user-controlled setting that allows the desktop app to check GitHub Releases automatically, typically at startup. Turning it off disables automatic checks, but should not prevent a user from manually checking for updates.
_Avoid_: Auto install

**Auto Update Download** (自动下载更新):
The user-controlled behavior that downloads an available update after Software Update discovers a newer Release Version. Downloading an update is distinct from installing it.
_Avoid_: Auto install, silent update

**Automatic Software Update** (自动软件更新):
The single user-facing toggle for the first implementation. When enabled, the desktop app performs Auto Update Check and Auto Update Download; when disabled, the app only performs Manual Update Check. It never performs Install Update without explicit user action.
_Avoid_: Silent update, forced update

**Install Update** (安装更新):
The explicit user action that exits the desktop app and runs the already-downloaded update installer. The app must not install automatically on quit or run an installer without a user choosing this action.
_Avoid_: Silent install, auto install, run update

**Update Install Guard** (更新安装保护):
The safety check before Install Update. If the Active Queue contains `queued`, `running`, or `paused` Jobs, the app warns that installing will close the app and may interrupt Queue work, then lets the user cancel or explicitly continue.
_Avoid_: Forced install, queue lock

**Manual Update Check** (手动检查更新):
A user-triggered Software Update check, available regardless of whether Auto Update Check is enabled. Manual checks are not blocked by the automatic check interval.
_Avoid_: Forced update, manual update install

**Update Check Interval** (更新检查间隔):
The minimum time between automatic Software Update checks. The first implementation checks at most once every 24 hours and delays startup checks briefly so update discovery does not slow app startup.
_Avoid_: Polling rate, refresh interval

**Update Preference** (更新偏好):
Desktop-only user preferences for Software Update behavior, stored in Electron's userData `config.json` separately from the Word database and server configuration. Includes whether Auto Update Check is enabled and metadata such as the last automatic check time.
_Avoid_: Update config, database setting

**Update Reminder** (更新提醒):
The non-blocking in-app notice shown when an automatic Software Update check finds a newer Release Version. It should not steal focus or require an immediate decision. Manual Update Check results may show fuller details and a download action.
_Avoid_: Update dialog, forced update prompt

**Release Announcement** (发布公告):
An Announcement entry derived from Software Update release information, especially Release Version and release notes. It should appear through the existing Announcement surface rather than a separate release-message system.
_Avoid_: Separate release message, update-only bulletin

**Skipped Release Version** (跳过版本):
The Release Version the user chose not to be reminded about automatically. Automatic Software Update suppresses reminders while the latest Release Version matches the skipped version, but Manual Update Check still shows it.
_Avoid_: Ignored update, hidden update

**Installer Asset** (安装包资产):
A downloadable installer file attached to a GitHub Release, such as a Windows NSIS `.exe` or macOS `.dmg`. It is the artifact users open manually to update the app in the first Software Update implementation.
_Avoid_: Package, binary, release file

**Platform Installer Asset** (平台安装包资产):
An Installer Asset whose file name identifies both the target platform and the App Version, allowing the desktop app to choose the correct download for the current device automatically. Windows and macOS assets must use distinct names.
_Avoid_: Generic installer, latest package

**Windows Installer Update** (Windows 安装版更新):
The first supported Software Update target: a Windows x64 NSIS-installed desktop app updated through `electron-updater`. Portable Windows builds and macOS DMG updates are out of scope for the first implementation.
_Avoid_: Portable update, macOS update

**Release Version** (发布版本):
The App Version declared by the GitHub Release tag. Software Update compares the local App Version against the Release Version, while the Platform Installer Asset file name must contain the same version as a consistency check.
_Avoid_: Installer version, asset version

**Update Feed** (更新源):
The metadata consumed by `electron-updater` to discover the latest Release Version, select the current platform's Platform Installer Asset, and download it. The Update Feed is generated by the desktop packaging/release process, not manually inferred from arbitrary GitHub asset URLs at runtime.
_Avoid_: GitHub latest API, raw download link

### AI generation

**Default App Configuration** (默认应用配置):
The built-in, safe configuration shipped with the app and used to initialise a new user's editable settings. It may include Provider presets, model assignments, Queue concurrency, search domains, update preferences, and other Settings-page defaults, but must not include real API keys or user secrets.
_Avoid_: Example config, user config, hardcoded defaults

**User Configuration** (用户配置):
The persisted, user-owned configuration stored outside the packaged app, such as Electron `userData/config.json`. It records the user's API keys, Provider edits, Stage assignments, Queue concurrency, update preferences, and other Settings-page choices. App upgrades must not overwrite User Configuration without an explicit migration rule.
_Avoid_: Default config, bundled config

**Configuration Migration** (配置迁移):
A versioned transformation that upgrades existing User Configuration from an older shape to the current schema while preserving user-owned values such as API keys and custom Providers. Migrations may add new safe defaults, rename fields, or repair obsolete values, but should be deterministic and testable.
_Avoid_: Reset config, overwrite defaults

**Configuration Export** (配置导出):
A user action that packages User Configuration for backup or transfer to another device. Export should distinguish between ordinary settings and sensitive secrets, so users can choose whether API keys are included.
_Avoid_: Dump config, copy config file

**Pipeline** (流水线):
A multi-stage AI workflow that generates a Word's YAML from a lemma and context. Currently a 3-stage linear sequence: searching → pondering → auditing.
_Avoid_: Workflow, chain, process

**Stage** (阶段):
One step in a Pipeline. Each Stage has a model assignment (`fast`/`balanced`/`expert`), an optional system prompt, optional tools, and an output parser. Stages run sequentially; each receives the previous Stage's output.
_Avoid_: Step, phase, node

**Creative Stage Structured Output** (创意阶段结构化输出):
The `pondering` Stage's intermediate JSON object containing creative fields such as visual imagery, meaning evolution, cognates, examples, and nuance. It is streamed as raw JSON for inspection, parsed and validated by the server, then merged with structural research data before the program serializes the final Word YAML. The LLM should not author creative YAML directly.
_Avoid_: Creative YAML, final YAML, raw prose

**Job** (任务):
A unit of work in the Queue. Three types: **Generate Job** (runs a full Pipeline for one Word), **Fix Job** (runs a single fix Stage against a completed Generate Job's output), **Audit-Fix Job** (audits and fixes a Word already saved to the database). Every Job has a lifecycle (`queued` → `running` → `complete` / `partial` / `error`) and a **Priority** (`normal` or `high`).
_Avoid_: Task, execution, run

**Format Fix** (格式修复):
A synchronous (non-Queue) structural repair of a `complete` Job's YAML. Triggered manually by the user when YAML fails to parse. Runs in-place on the original Job, reusing its SSE step panel. Two tiers: **Basic** (code-driven: strip fences, remove unknown fields) and **Enhanced** (LLM-driven via `format-fixer.md` prompt). Basic runs first; Enhanced is only invoked if Basic fails. `partial` and `error` Jobs are rejected — they must regenerate.
_Avoid_: YAML repair, schema fix

**Content Fix** (内容修复):
A Queue-based creative-field rewrite against a `complete` Job whose `overall_score < 6`. Uses the existing `fixing` Pipeline Stage (with `content-fixer.md` prompt and existing revision notes), then re-runs `auditing` to produce a new score. Can be triggered per-word or as a Workset batch operation (one Fix Job per word, grouped by `batchId`). Requires `complete` status and valid revision notes from a prior auditing stage.
_Avoid_: Creative fix, quality fix, rewrite

**Workset Improve** (工作集优化):
A user action that applies Content Fix to eligible low-score Jobs in the current Workset. It only considers the visible, deduplicated latest `complete` Job Result for each Lemma + Language in the Workset; older hidden History Jobs, `partial` Jobs, `error` Jobs, and high-score Jobs are excluded. Improve Count is displayed as user context, but it does not by itself make a low-score Job ineligible.
_Avoid_: Improve all history, improve today history

**Improve Count** (优化次数):
The number of Content Fix rounds in the current Job Result chain. A Generate Job starts at `0`; a Fix Job created from Workset Improve inherits its source Job's Improve Count plus one. A newly generated Job for the same Lemma + Language starts a new chain at `0`; Improve Count is not a lifetime counter across all Job History.
_Avoid_: Total edit count, word history count

**Pending Improve Selection** (待优化选择):
The temporary, user-editable set of Workset Items that will become Fix Jobs when Workset Improve is confirmed. It defaults to all eligible low-score Workset Items, but users may remove any item before submission. Removing an item from Pending Improve Selection does not delete the Workset Item or its Job History row.
_Avoid_: Deleted workset items, selected history

**Blocked Improve Item** (受阻优化项):
A low-score Workset Item that cannot be included in Pending Improve Selection because automatic Content Fix lacks required inputs, such as valid Revision Notes, parseable score metadata, or usable YAML. Workset Improve shows the blocking reason instead of silently dropping the item or failing the whole batch.
_Avoid_: Failed selection, skipped item

**Improving Workset Item** (优化中的工作集项):
A Workset Item whose source Job has been submitted to Workset Improve and now has a linked Fix Job in the Queue. The original Workset Item remains visible until the Fix Job completes; then the Workset refreshes and the newer Fix Job Result naturally replaces it. If the Fix Job fails, the original item remains visible with the failed improve state.
_Avoid_: Removed item, hidden source result

**Audit Incomplete** (审核不完整):
A Job Result state where the auditing Stage did not produce parseable, trustworthy Review Score metadata. It must not be treated as a perfect Review Score. Such Jobs are blocked from automatic Workset Improve until the user re-runs auditing or supplies explicit Revision Notes through a manual fix path.
_Avoid_: Score 10 fallback, hidden audit failure

**Generation Notes** (生成备注):
Optional user guidance supplied before starting a new Generate Job. Generation Notes shape the initial Pipeline run but are not the same as later correction feedback.
_Avoid_: Notes, comments

**Revision Notes** (修复意见):
Correction feedback applied to an existing Job when the user regenerates or runs a Content Fix. Revision Notes may include the auditing Stage's `revision_notes` plus additional user feedback.
_Avoid_: Notes, comments

**Review Score** (审核分数):
The final quality score produced by a Job's auditing Stage. It is used to decide whether Content Fix is available and to help users prioritize Workset review before saving.
_Avoid_: Rating, database score

**AI Review Score** (AI 审核分数):
The original Review Score produced by the auditing Stage and stored with the Job Result. It should remain available even when the user later overrides the score.
_Avoid_: Original score, model score

**User Review Score** (用户审核分数):
An explicit user override for a Job Result's quality score. It does not erase the AI Review Score; it records the user's judgment when the automatic score is wrong or incomplete. It is persisted with the Job Result's score metadata so the Workset remains stable after refresh or restart.
_Avoid_: Manual score, edited overall_score

**Effective Review Score** (有效审核分数):
The score used by Workset and Workset Improve decisions. It equals User Review Score when present, otherwise AI Review Score.
_Avoid_: Final score, displayed score

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

**Queue Table** (队列表格):
The shared presentation surface for row-based Queue views, including Active Queue, Job History, and Workset. It is a Queue-specific table, not a generic DataTable: it knows how to present Job status dots, Job type chips, Lemma/Word text, compact status, Review Score, Improve Count, Blocked Improve Item notes, and row actions with consistent column alignment and horizontal scrolling when space is constrained. Callers configure Queue Table with semantic column types rather than arbitrary cell markup, so column alignment and chip styling remain local to the Queue Table Module. The first implementation lives inside the AI Generate area rather than a global common UI folder; Active Queue, Job History, and Workset pane extraction can happen later after Queue Table has stabilized.
_Avoid_: Generic table, data grid

**Queue Table Row** (队列表格行):
The display model passed into Queue Table by Active Queue, Job History, or Workset. It is not a persisted Job row and not a Workset Item; it is the normalized presentation input containing the row id, Job type, Lemma/Word text, status, optional Language, optional Review Score, optional Improve Count, optional note chip, and optional row action metadata.
_Avoid_: Job row, Workset row

**Active Queue** (活动队列):
The operational Queue view containing Jobs that can still affect execution: `queued`, `running`, and `paused`. It is used for live control actions such as pause, resume, cancel, and selecting an active Job.
_Avoid_: Queue history, completed queue

**Job History** (任务历史):
The review-oriented Queue view containing non-active Jobs worth revisiting: `complete`, `partial`, and `error`. It is backed by persisted rows in `job_queue`, not by in-memory SSE replay state. It is paginated for display, with 20 Jobs per page by default, and orders statuses by recovery urgency: `error` before `partial` before `complete`. `cancelled` Jobs are hidden by default because they represent intentionally discarded work. Users can hard-delete individual History Jobs or use **Clear History** to hard-delete the current filtered History set, preventing unbounded clutter without forcing page-by-page cleanup. Hard deletion is only allowed for non-executing Jobs, never for `queued`, `running`, or `paused` Jobs. Job History is also the source for the current **Workset**, so deleting History Jobs can remove Today items and make them unavailable for Workset Save or Workset Improve.
_Avoid_: Archive, completed tasks

**Job Result Preview** (任务结果预览):
A read-only detail view for a `complete` Job's generated YAML before or after it is saved as a Word. It is distinct from a saved Word preview because a completed Job may not yet have been persisted to `words_v2`.
_Avoid_: Word detail, saved preview

**Workset** (工作集):
A review-and-save surface for the latest generated YAML results the user is actively working through. The current Workset is the Queue Today view: it is derived from today's persisted `complete` and `partial` Job History rows, deduplicated by Lemma + Language so only the newest Job result for each Word remains. It is not an independent saved list or cache; deleting the backing History Job removes the corresponding Workset item. It displays each Job's Review Score when available, helping the user spot low-quality results before saving. It batch-saves through the same Word save path used by the Editor, first detecting conflicts without overwriting and only overwriting conflict items after an explicit user action.
_Avoid_: Current batch, History subset, temporary database

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
- The `pondering` Stage produces **Creative Stage Structured Output** as JSON; final **YAML** is produced by program serialization after merging with structural research output
- A **Job** is one run of a **Pipeline** for one **Word**
- A **Batch** contains N **Jobs**, executed by the **Queue** with configurable concurrency
- The **Active Queue** is for controlling live Jobs; **Job History** is for revisiting completed, partial, or failed Jobs
- Clicking a **Job History** item opens a status-specific detail: `complete` Jobs open a **Job Result Preview**, while `partial` and `error` Jobs reuse the AI drawer so the user can inspect stages and retry or recover
- The Queue panel presents **Active Queue** and **Job History** as two modes in the same UI surface; execution controls belong only to Active Queue, while review and filtering controls belong to Job History
- Saving or overwriting a **Word** remains an Editor responsibility; **Job History** may fill the Editor from a complete Job, but does not write directly to `words_v2`
- A **Workset** is derived from **Job History** rows but is not itself History: it answers "what latest YAML results should I save now?" and can batch-save through the Word save path, reporting per-Word save outcomes such as saved, conflict, invalid, missing, or error
- A **Format Fix** applies only to `complete` Jobs whose YAML fails `yaml.load`; `partial` and `error` Jobs are rejected. It runs synchronously in-place on the original Job, reusing the same SSE step panel. Basic (code-driven) runs first; Enhanced (LLM-driven) runs only if Basic fails.
- A **Content Fix** applies to `complete` Jobs whose `overall_score < 6`. It creates a new Queue-based Fix Job (priority `high`) that runs `fixing` then re-runs `auditing`. Can be triggered per-word or as a Workset batch.
- **Workset Improve** applies Content Fix only to eligible low-score Jobs in the current visible **Workset**, never to older deduplicated **Job History** rows. A user can remove Jobs from the **Pending Improve Selection** before creating Fix Jobs.
- **Effective Review Score** is the score used for Workset ordering and Workset Improve eligibility: User Review Score overrides AI Review Score without deleting the original AI judgment.
- **Improve Count** follows the Job Result chain: a Workset Improve Fix Job receives source Improve Count + 1, while a fresh Generate Job starts again at 0.
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
