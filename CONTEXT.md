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

**Word Schema Version** (词条结构版本):
The integer version of the Word Content schema that a saved Word's YAML conforms to. It answers whether a Word is structurally current after the app's Word YAML fields change. It lives in Content at `ad_fontes.word_schema_version`, where `ad_fontes` is application metadata rather than learning content. The app owns the `ad_fontes` metadata block; users should not be expected or encouraged to edit it directly, and the ordinary YAML editor should hide it. Word Export keeps `ad_fontes` in Content for lossless exchange. The `words_v2.word_schema_version` column is a derived query cache for lists, filters, and freshness badges; Content remains the source of truth. The version increments by 1 whenever a Word structure change needs user-visible freshness checks. `CURRENT_WORD_SCHEMA_VERSION` is the single code source for the current version; server validation, AI mock generation, and Preview Content freshness checks derive from it instead of hardcoding version numbers. Prompt and schema documentation may still be updated manually, but tests should catch when documented `word_schema_version` values fall out of sync with the current code version. Existing Words without this field are treated as version 1 for compatibility. An external one-time backfill script may add `ad_fontes.word_schema_version: 1` to old database Content and synchronize the derived `words_v2.word_schema_version` column; this is classification, not migration to a newer Word Schema Version, and it is not core app behavior. The app does not automatically migrate old Word Content to a newer Word Schema Version; it only shows that the Word is outdated and should be regenerated. User-facing surfaces should present outdated schema state transparently as "old" rather than exposing numeric Word Schema Version values. Outdated schema messaging should use an informational or warning tone, not danger styling, because old Word Content may still be valid learning material. New Words entering the App Database must conform to the current Word Schema Version, regardless of whether they come from the YAML Editor, AI Generate, Workset save, or Word Import. Old or future Word Content must not be created as new database Words. Word Import may overwrite an existing old Word losslessly as maintenance of historical Content, but it must reject old or future Content when that Content would create a new Word. Import rejection for non-current new Words is item-level: current Words in the same file may still import, while skipped old or future Words report per-Word reasons such as outdated structure or requires newer app. Word Import must not downgrade existing Content: imported old Content may overwrite only an existing old Word, imported current Content may overwrite old or current Words after conflict review, and imported future Content may not overwrite any existing Word. Updating an existing old Word from the YAML Editor is lossless and may keep the old Word Schema Version. Updating an existing current Word from the YAML Editor must remain current; the editor must not downgrade current Content to old Content. Fill Editor is not a separate save path; once YAML is in the editor, the save rules depend on whether the operation creates a new Word or updates an existing Word. A manually edited Word Schema Version is not trusted as an upgrade: if Content declares the current Word Schema Version, it must pass current schema validation. If edited YAML omits the metadata while updating an old Word, the app may probe whether the YAML already conforms to the current structure; if it does, saving adds the current Word Schema Version metadata, otherwise the edit remains lossless old Word maintenance. Future Word Content is identified by declared metadata above `CURRENT_WORD_SCHEMA_VERSION`; it is never accepted as a new Word or as an overwrite in the current app, and users should update the app before importing or creating it. Future-shaped YAML without declared metadata cannot be reliably recognized by an older app and is handled as current-invalid or unknown entry YAML rather than as maintainable future Content. It is distinct from Prompt version, App Version, Word Export File version, and revision count.
_Avoid_: Prompt version, export version, app version, revision

**Word Schema Detector** (词条结构判定器):
A server-side boundary module that classifies parseable Word YAML when Word Schema Version metadata is missing or potentially misleading at an entry point. It is used for user-pasted YAML, Word Import inputs, old exports without metadata, and editing an old Word after the user replaces the editor text with current-shaped YAML. It is not used to scan historical database Content after save; saved Words trust their Content metadata and the derived `words_v2.word_schema_version` column. The detector reports declared version, inferred version, freshness, confidence (`declared`, `signature`, or `fallback`), and diagnostics. Declared Word Schema Version takes precedence for write policy, but structural evidence may produce diagnostics when the declaration and shape disagree. If YAML declares v1 while matching current-version structural signatures, write policy still treats it as v1 and may allow lossless old Word maintenance; the detector records that it looks current but declares old. Current-shape detection may use current schema validation and version-specific signatures such as `yield.word_forms`, object-shaped `etymology.historical_origins.source_word`, and `word_formation.derivations`. The detector runs before Word Save Policy and answers what the entry YAML appears to be; Word Save Policy separately decides whether a create, update, import, or overwrite action may write it. Full detector results are backend-internal for policy, logs, and tests. Frontend APIs should expose only compressed user semantics such as schema freshness, notices, and save/import eligibility; they should not expose detector confidence or declared-versus-inferred details. The detector classifies entry YAML; it does not migrate old Word Content.
_Avoid_: database migration, prompt detector, schema validator

**Current Schema Reference** (当前结构参考):
A read-only reference surface that belongs to the YAML Editor and shows the current language-specific Word YAML schema beside the user's YAML so they can compare and repair their work. It follows the global Language by default but may be temporarily switched inside the reference surface without changing the app's global Language. It shows the full current schema with lightweight section navigation; it does not follow the editor cursor until the editor has a stable structured selection API. It is not a global right-side workspace surface, not an editor template, does not insert schema sections into user YAML, and does not participate in save validation.
_Avoid_: Schema Editor, Schema Preview, Insert Template

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

### Word exchange

**Word Export** (词条导出):
A user action that exports selected Words for lossless exchange with future Ad Fontes versions or other applications. The primary exchange format is a versioned JSON envelope whose per-Word source of truth is **Content**; a YAML rendering may be included as a readable companion, but CSV is not the lossless contract and SQLite database export is treated as backup/migration rather than Word exchange.
_Avoid_: CSV export, database backup, Anki export

**Word Export File** (词条导出文件):
The JSON file produced by Word Export. It includes export metadata such as format name, version, and exported time, plus an `items` array of Words containing Lemma, Language, Part of Speech, and Content. Optional fields such as YAML, id, timestamps, revision count, or content hash may support readability, provenance, and integrity checks without replacing Content as the canonical exported data. Exported ids are provenance metadata, not import identity: future import flows should detect conflicts by Lemma + Language and should not overwrite or force local ids from the export file by default.
_Avoid_: CSV file, SQLite dump, YAML bundle

**Word Import** (词条导入):
A user action that reads a **Word Export File** and creates missing Words in the current App Database. Import identity is Lemma + Language, not exported id. If a Word with the same Lemma + Language already exists locally, Word Import first imports the non-conflicting Words, then asks for a **Word Import Conflict Decision** before any local Content is overwritten.
_Avoid_: Restore backup, force overwrite, database import

**Word Import Conflict Decision** (词条导入冲突决策):
The blocking review shown when Word Import finds existing local Words with the same Lemma + Language as imported Words. The safe default is importing only new Words and skipping conflicts. Users may explicitly overwrite all conflicts or choose Skip / Overwrite per Word after previewing the existing and imported Content with the shared YAML conflict preview.
_Avoid_: Silent overwrite, import plan, duplicate import decision

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

**Built-in Word Card HTML** (内置词卡 HTML):
The default HTML rendering of a Word's Content for user preview and the `rendered_html` Data Source. It is app-owned rendering logic, not a user-owned template. Word Preview, Job Result Preview, and Anki export paths should use the same Built-in Word Card HTML Module so new YAML fields such as Word Schema Version additions render consistently across preview and export. User-facing Anki customization belongs to Card Template and Field Mapping, not to a renderer-only custom preview template.
_Avoid_: Preview-only HTML, Anki-only HTML, custom preview template

**Preview Content** (预览内容):
The renderer-side presentation model produced from a saved Word's Content or a Job Result's YAML before it is shown in Word Preview or Job Result Preview. Preview Content is lenient: YAML only needs to parse into an object, missing fields are omitted from the Built-in Word Card HTML, and an outdated Word Schema Version is shown as context rather than blocking preview. Preview Content may carry internal schema freshness status, but user-facing UI should describe outdated Content as old rather than showing the numeric Word Schema Version. Preview Content is a pure content-conversion module: it accepts YAML text or an already parsed Content object and returns previewable data, HTML, and status. Saved Word loading from store/API is an outer adapter concern, not part of Preview Content. Preview Content is not the validation contract for saving or generation. Filling the YAML Editor from a Job Result Preview is allowed even when the YAML is outdated, because it moves content into a repair surface rather than writing Content. Word save, Word Import overwrite, Workset save, and completed AI Generate results must still validate against the current Word Schema Version before writing Content.
_Avoid_: Saved content, generated content, schema validation

**Editor Save Intent** (编辑器保存意图):
The product meaning of a YAML Editor save action: creating a new current Word, updating an existing old Word, updating an existing current Word, or importing a Word. Editor Save Intent decides whether current schema validation is required or whether lossless old/future Content maintenance is allowed. In the YAML Editor, the intent is inferred from the editing context: no current editing id means creating a new Word, while a current editing id means updating an existing Word. The UI should still show this inferred intent with a compact state chip such as "New Word" or "Editing Word" so users understand which save rule applies. It is distinct from whether the user is typing in the YAML Editor; Fill Editor only moves YAML into the editor and does not create a separate save intent.
_Avoid_: Edit mode, add mode, fill-editor mode

**YAML Parse Status** (YAML 解析状态):
Whether the editor text is syntactically parseable YAML and parses into an object. YAML Parse Status is separate from Word Schema Version freshness. When an existing old Word is being updated, schema freshness should be shown as "old" context while parseable YAML should still read as OK; old schema Content must not be presented as "Invalid YAML" unless the YAML itself cannot be parsed. Strict schema errors are shown as blocking editor errors only when the current Editor Save Intent requires the current Word Schema Version, such as creating a new Word or updating an existing current Word. When maintaining an existing old Word, strict schema differences should be hidden by default and replaced with a warning-style notice explaining that the Word is old, can be saved losslessly, and should be regenerated to update its structure.
_Avoid_: Schema validity, word freshness

**Card Template**:
The HTML/CSS structure defining how a single Anki card type renders. Templates are currently hardcoded in the server-side field extractor.

**Batch Anki Import** (批量 Anki 导入):
A user action that imports selected Word cards into Anki. The primary path is a single Import action: the app checks for duplicate Anki notes as part of the import flow, imports directly when no duplicates exist, and asks for a Duplicate Import Decision only when duplicates are found. The UI should not ask users to pre-plan duplicate handling before they know whether duplicates exist.
_Avoid_: Batch overwrite, import plan

**Duplicate Import Decision** (重复导入决策):
The blocking choice shown during Batch Anki Import when duplicate Anki notes are found. Users choose between overwriting duplicates and importing the whole batch, or importing only new cards. Choosing to import only new cards completes the batch and marks duplicate items as skipped, with details explaining the skipped duplicate note ID. Internal resolution states such as `overwrite` or `skip` may still exist in code, but the product UI should describe the final outcome rather than exposing a "mark duplicates" step.
_Avoid_: Mark duplicates, duplicate resolution plan

### Desktop data

**Data Directory** (数据目录):
The desktop app directory that contains the active **App Database** file. Changing the Data Directory is a workspace switch for future app sessions, not a database migration: if the selected directory does not contain the database file, the app creates a new empty App Database there and tells the user. It must not silently copy the previous database because that makes an empty workspace look like the old one.
_Avoid_: Database path, data migration, backup folder

**App Database** (应用数据库):
The SQLite database file named `ad_fontes.db` inside the desktop Data Directory. It stores Words, Queue state, and other local app data. A missing App Database in a selected Data Directory means the user is starting a fresh local database for that directory.
_Avoid_: Config file, export file, cache

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

**Announcement Source** (公告来源):
The upstream location used to populate Release Announcements. The default source is the latest GitHub Release note; alternate sources may be configured as fallbacks without changing the Announcement surface.
_Avoid_: Update Feed, installer source

**Announcement Source Notice** (公告来源提示):
A non-blocking warning shown in the Announcement surface when an Announcement Source cannot be reached. It explains that the app is showing local cached announcements or no announcements because the source is unavailable.
_Avoid_: Update error, release failure dialog

**Announcement Fallback Source** (公告降级来源):
A secondary Announcement Source used only when the primary source is unreachable. Gitee may become a fallback source in the future, but it is not part of the current source order until explicitly configured.
_Avoid_: Mirror update feed, automatic source switch

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
A multi-stage AI workflow that produces or transforms a Word's YAML from a Lemma, Context, and optional Notes. The current default English Generate Pipeline is a 3-Stage linear sequence: searching → pondering → auditing, but Pipeline does not imply those exact Stage names or that exact length. Future Pipeline Types may use different Stage definitions or combine responsibilities, such as a token-saving Generate Pipeline that combines searching and pondering.
_Avoid_: Workflow, chain, process

**Pipeline Type** (流水线类型):
The product-level purpose of a Pipeline, such as Generate, Content Fix, Audit-Fix, or a future token-saving Generate variant. Pipeline Type explains why a Job exists; it is not the executable Stage list itself.
_Avoid_: Runner type, workflow mode

**Pipeline Definition** (流水线定义):
The executable definition for a Pipeline: Stage order, Prompt assignment, Tool assignment, model assignment, output parser, and Stage Policy. Multiple Pipeline Definitions may share one Pipeline Type when they represent different execution strategies for the same product purpose.
_Avoid_: Pipeline config, workflow file

**Stage** (阶段):
One step in a Pipeline Definition. Each Stage has a model assignment (`fast`/`balanced`/`expert`), an optional Prompt, optional Tools, and an output parser. Stages run sequentially; each receives the previous Stage's output through Pipeline Context. Stage names are defined by the Pipeline Definition and are not globally limited to searching, pondering, auditing, or fixing.
_Avoid_: Step, phase, node

**Stage Recipe** (阶段配方):
The declarative description of one LLM-driven Stage: which Pipeline Context it reads, which Prompt drives it, which Tools it may use, how its output is validated or repaired, and where the accepted result is written. Stage Recipe captures business differences between Stages without turning each business case into a new executor type.
_Avoid_: Stage kind, runner branch, prompt-only config

**LLM Stage Executor** (LLM 阶段执行器):
The shared implementation that runs Stage Recipes. It owns model calls, Tool loops, validation, repair, Stop-loss, and Pipeline Context Patch creation for LLM-driven Stages; external agent frameworks may replace parts of this implementation, but they do not define the product meaning of Pipeline, Job, or Workset.
_Avoid_: Workflow framework, plugin system, custom stage handler

**Pipeline Context Patch** (流水线上下文补丁):
The Stage output shape used inside a Pipeline run: a partial update to Pipeline Context rather than a final Job Result. Word-focused Pipelines still return YAML and Review Score at the outer Runner interface, but Stage Recipes should report their accepted work as Pipeline Context Patch so single-Stage and custom Stage sequences share the same sequencing model.
_Avoid_: Stage result payload, final result, direct YAML return

**Stage Policy** (阶段策略):
The declared behaviour attached to a Stage beyond ordinary LLM execution, such as Stop-loss rules, Tool fallback, evidence synthesis, YAML assembly, token budget choices, or recovery behaviour. Stage Policy belongs with the Pipeline Definition so a Runner can execute generic sequencing without hardcoding product-specific Stage names. Stage Policy should be declarative by default: Pipeline Definitions name policy capabilities, while the implementation lives in shared policy modules. Custom executable hooks are a future escape hatch, not the first design. Stage Policy is split into Execution Policy, Output Policy, Assembly Policy, and Stop-loss Policy: Execution Policy decides whether the Stage runs as a single LLM call or an Agent Loop; Output Policy decides which Pipeline Context slot the Stage writes, such as research YAML, creative YAML, full YAML, or Review Score metadata; Assembly Policy decides whether and how Stage outputs are combined after a Stage completes; Stop-loss Policy decides when empty or unusable output should stop the Pipeline and which partial YAML is preserved.
_Avoid_: Runner special case, stage hack

**Execution Policy** (执行策略):
The part of Stage Policy that controls how a Stage calls the model: single LLM call, Agent Loop, Tool set, tool-round limit, timeout, token budget, retry, and empty-output Stop-loss behaviour. Execution Policy must not imply which YAML slot the Stage writes.
_Avoid_: Stage type

**Output Policy** (输出策略):
The part of Stage Policy that maps visible Stage output into Pipeline Context, such as research YAML, creative YAML, full YAML, or Review Score metadata. Output Policy is independent from whether the Stage used an Agent Loop or a single LLM call.
_Avoid_: Parser side effect

**Assembly Policy** (组装策略):
The part of Stage Policy that combines Pipeline Context values after a Stage, such as merging research YAML and creative YAML into full YAML. Assembly Policy is explicit; Stage names such as `pondering` must not implicitly trigger YAML assembly.
_Avoid_: Hidden merge

**Stop-loss Policy** (止损策略):
The part of Stage Policy that decides when a Pipeline should stop early and preserve a partial result. Stop-loss Policy is based on declared output requirements, not Stage names. For example, a Stage that writes required research YAML, creative YAML, or full YAML may stop the Pipeline when that output is empty after parsing; an auditing Stage with malformed Review Score metadata should produce Audit Incomplete rather than being treated as generic YAML Stop-loss.
_Avoid_: Stage-name fallback

**Agent Loop** (Agent 循环):
A Stage execution mode where the model may call Tools, receive Tool results, and continue producing visible Stage output. An Agent Loop is not itself a Stage name. The current English `searching` Stage is an Agent Loop that can use web Tools, but future Pipeline Definitions may use an Agent Loop under a different Stage name or combine it with other responsibilities. Pipeline Definitions should declare Agent Loop execution separately from the Stage id, so a Runner does not infer Tool behaviour from names such as `searching`. Agent Loop's primary contract is a real query loop: the model emits Tool calls, Tools execute, Tool results are appended as model-readable messages, and the model is called again until visible Stage output is produced or the configured tool-round limit is reached. Evidence synthesis and no-tool retry are Stop-loss behaviours after the query loop fails to produce visible output, not the normal Tool path.
_Avoid_: Search stage, tool step

**Stage Details** (阶段详情):
A read-only detail panel for one Stage key (`searching`, `pondering`, `auditing`, or `fixing`) on the currently selected Job. Stage Details is keyed by Stage, not by a stale Stage object from a previous Job selection. When the user selects a different Job while Stage Details is open, the panel follows the same Stage key on the newly selected Job if that Stage key exists; if the Stage key does not exist, the panel closes. Empty or pending Stage content is rendered by Stage Details itself rather than being treated as a reason to close. This lets users compare the same Stage across Jobs without accidentally viewing details from the previous Job.
_Avoid_: Stale step details, detached details

**Job** (任务):
A unit of work in the Queue. Three types: **Generate Job** (runs a full Pipeline for one Word), **Fix Job** (runs a single fix Stage against a completed Generate Job's output), **Audit-Fix Job** (audits and fixes a Word already saved to the database). Every Job has a lifecycle (`queued` → `running` → `complete` / `partial` / `error`) and a **Priority** (`normal` or `high`).
_Avoid_: Task, execution, run

**Run Metrics** (运行指标):
Observable execution cost for a Job, including per-Stage duration, total duration, and token usage when the provider reports it. Run Metrics describe how expensive the Job was to run; they are not Review Score metadata and should be exposed as structured data so Queue UI summaries and future dashboards can share one source of truth.
_Avoid_: Task metrics, cost text, score metadata

**Run Metrics Disclosure** (运行指标展开):
A Queue table interaction that reveals compact Job-level Run Metrics inline below a Job row. The disclosure arrow lives in the Word cell; the Word header can expand or collapse the visible rows for the current Queue surface. Active Queue, Job History, and Today Workset each keep their own in-memory disclosure preference for the current app session. This preference is not persisted to Local Storage or User Configuration. The Queue row disclosure should show only a compact total summary, such as total duration and total token usage, so expanded rows do not turn the Queue table into a Stage diagnostics surface. If token usage is unavailable, the Queue row disclosure shows only the available total duration rather than an unavailable-token message. Per-Stage durations and token usage belong with Stage Details, near the Stage completion state.
_Avoid_: Cost column, persisted row expansion, metrics popover

**Format Fix** (格式修复):
A synchronous (non-Queue) repair and diagnostic pass for a Word's YAML. It handles syntax slips such as markdown fences, quote mistakes, alias-like root values, and scalar formatting problems, then performs schema-aware structure checks such as detecting top-level sections that were incorrectly nested under another section. Safe structural fixes may be applied automatically only when the intended section is unambiguous and its shape matches the language-specific YAML schema; otherwise Format Fix returns precise diagnostics instead of guessing. Basic Format Fix is deterministic and may run automatically before filling the Editor from a Job Result, before saving a Word, and before saving a Workset item. The Word Editor also provides an explicit Basic Format Fix action for YAML already in the editor. When Basic Format Fix changes YAML, the visible Editor or preview text should be updated to the repaired YAML and the user should receive a lightweight notice; diagnostics without repair must not mutate visible YAML. If safe repairs were applied but the full Word still fails schema validation, the repaired YAML should still be returned and shown, while saving remains blocked until the remaining diagnostics are resolved. From Fill Editor, invalid YAML should still be fillable into the Word Editor when Format Fix can return editable YAML text, including parse-error cases where no safe automatic repair was possible; a dialog must first tell the user Basic Format Fix did not finish the repair and ask them to continue manually. Enhanced Format Fix may use an LLM and must be explicitly triggered by the user. When triggered from a Job Result, it runs in-place on the original Job, reusing its SSE step panel. `partial` and `error` Jobs are rejected — they must regenerate.
_Avoid_: YAML repair, schema fix

**Format Diagnostic** (格式诊断):
A structured explanation returned by Format Fix when YAML cannot be safely repaired or when the user should be told what changed. The first version is path-based rather than line-based: it identifies the YAML path, the expected shape or location, the actual shape or location, a stable diagnostic code, and a suggested action. Line and column ranges are optional future detail, not required for the first diagnostic UI.
_Avoid_: Raw error string, stack trace

**Format Fix Result** (格式修复结果):
The structured result returned by Format Fix. `ok` means the final YAML is parseable, schema-valid, and can be saved; it does not merely mean the repair process completed. A result may contain repaired YAML even when `ok` is false, allowing the UI to show partial safe repairs while blocking save. The result returns the YAML text the UI should display, the parsed Content object the server should validate or save, and the detected Language when available. It also records whether YAML changed, whether saving is allowed, which repairs were applied, and which Format Diagnostics remain.
_Avoid_: Boolean success flag

Live Word Editor validation checks the current YAML text as-is and must not run Basic Format Fix. The Editor should report whether the visible text is currently parseable and schema-valid. The explicit Repair action and save paths may still run Basic Format Fix and update the visible YAML when repairs are applied.

**Section Promotion** (区块提升):
A Basic Format Fix operation that moves a misplaced top-level YAML section from a nested path back to the root of the Word YAML. The first version applies to language-specific expected root sections, and only promotes same-name sections when the root is missing that section, exactly one nested candidate exists, and the candidate matches that section's language-specific shape. It does not merge duplicate sections, infer misspelled section names, move differently named sections, reorder arrays, fill missing content, or infer field ownership from prose.
_Avoid_: Section merge, content inference, schema guessing

Section Promotion follows a deterministic candidate rule: if the root is missing an expected section and no nested candidate exists, Format Fix reports a missing section; if exactly one valid nested candidate exists, it promotes that candidate; if exactly one invalid nested candidate exists, it reports an invalid candidate; if multiple nested candidates exist, it reports ambiguity and does not choose between them; if the root already has the section and a nested candidate also exists, it reports a Duplicate Section.

**Duplicate Section** (重复区块):
A Format Diagnostic for a top-level YAML section that also appears at a nested path. Basic Format Fix must not merge the two sections or overwrite the root section. Duplicate Section is treated as a blocking error for saving because silently ignoring the nested section could discard user-visible content.
_Avoid_: Shadow section, extra copy

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

**AI Flavor Marker** (AI 味标识):
A configurable deterministic pattern used as a declared Prompt input augmenter to flag formulaic Chinese writing signals in creative YAML fields, such as contrast templates or abstract seal words. AI Flavor Markers produce structured evidence plus a prompt-ready summary for the reviewer LLM; they are not themselves a Review Score and do not automatically fail a Job without contextual judgment.
_Avoid_: Review rule, score rule, prompt-only checklist

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
The display model passed into Queue Table by Active Queue, Job History, or Workset. It is not a persisted Job row and not a Workset Item; it is the normalized presentation input containing the row id, Job type, Lemma/Word text, status, optional Language, optional Review Score, optional Improve Count, optional note chip, and optional row action metadata. In Workset, the note chip represents only the durable Workset Sync Marker (`synced`, `unsynced`, `not saved`, or `blocked`). Save diagnostics and Improve blocking details belong in short-lived feedback, Improve controls, or detail panels rather than this compact row marker.
_Avoid_: Job row, Workset row

**Queue Runtime Metrics** (队列运行指标):
Per-Job operational measurements shown in Queue Table views for execution monitoring and review: total duration, per-Stage duration, and Token Usage. Queue Runtime Metrics are Job context, not Word content and not Workset decision state. They are shown in Active Queue and Job History; Workset does not show them in its first version so that save/improve decisions remain focused on Review Score, Improve Count, and blocking notes. Queue rows show Job-level total Token Usage compactly; Stage-level Token Usage belongs in row detail, tooltip text, or Stage Details. Queue Table shows first-version metrics as two compact row columns: `Time` for Job total duration and `Tok` for Job total Token Usage. Per-Stage duration and per-Stage Token Usage are exposed through cell tooltip text or Stage Details rather than separate Queue Table columns. If the Provider does not return usage data, Token Usage is shown as missing (`--`) rather than estimated from text length. Total duration is the Job wall-clock duration from actual start to terminal state (`complete`, `partial`, or `error`), based on persisted Job timestamps; queued Jobs show missing duration. The first version does not try to subtract paused intervals. Stage durations remain separate measurements and should not be silently substituted for Job total duration. Queue Runtime Metrics are exposed by Queue APIs as a derived `metrics` object computed from `job_queue.started_at`, `job_queue.completed_at`, and persisted `progress_events`; the first version does not add database columns or a separate metrics table. Future dashboards should consume the same API-level metrics contract before introducing materialized analytics storage.
_Avoid_: Word metrics, Workset metrics, content metadata

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

**Workset Sync Marker** (工作集同步标记):
A compact row-level indicator in the Workset that tells whether the latest Workset result is synced to the App Database. It distinguishes synced results, unsynced results for Words that already exist in the App Database, not-saved results for Words that do not yet exist in the App Database, and blocked results that cannot be saved. It is about the relationship between the latest Workset result and the App Database's current Word Content, not merely whether a Word with the same Lemma + Language exists. Its purpose is to keep users from repeatedly saving the same generated result and spending unnecessary resources. Default Workset save actions should submit unsynced and not-saved complete results rather than already synced results. It must survive app restart because it records review progress on durable Job Results, not a transient UI filter. Save and refresh actions may show short-lived toast feedback, but they must not replace the durable Workset Sync Marker. The Workset row marker deliberately does not display `no notes`, `audit`, `partial`, `invalid`, or `error`; those are detailed operation states surfaced by Improve or Job details.
_Avoid_: Job status, Review Score, Word content state

**Word Save Provenance** (词条保存来源):
The source metadata carried by a Word save action when the saved YAML came from a Job Result. It connects the saved Word back to the source Job so a successful save can update the Workset Sync Marker. Word Save Provenance does not change Word Content, does not decide whether the Word save succeeded, and does not create a user-visible save history. If provenance recording fails after the Word is saved, the Word save remains successful and the response should expose the provenance warning separately.
_Avoid_: Save status, audit log, Workset note

**Circuit Breaker** (熔断):
A safety mechanism that pauses all Jobs assigned to a specific Provider after 3 consecutive failures from that Provider. The user is notified; manual intervention is required to resume.
_Avoid_: Rate limiter, throttle

**Stop-loss** (止损):
A circuit breaker within a Pipeline Stage: if the LLM returns empty text, the Stage retries once with degraded settings (e.g., no tools). If still empty, the Pipeline terminates early, preserving partial results.
_Avoid_: Fallback, safety net, guard

**Provider** (供应商):
An LLM API service (e.g., DeepSeek, OpenRouter) identified by a base URL, API format (`openai` or `anthropic`), and a list of available models.

**Tool**:
A function callable by the LLM during an Agent Loop — currently `searchEtymology` (Brave Search API) and `fetchPage` (web page scraping). Tools are capabilities available to the model inside a Stage; they are not Stages themselves.
_Avoid_: Plugin, capability, skill

**Tool Result** (工具结果):
The result produced by a Tool during an Agent Loop. Tool Result has two channels: a UI Result for Stage Details, logs, and user inspection, and a Model Result for the next model turn. The UI Result may preserve fuller raw details, while the Model Result should be compressed, cleaned, and length-limited so Agent Loop query rounds do not explode token usage. Evidence synthesis should consume Model Results, not raw UI Results.
_Avoid_: Raw tool output, search result

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
- The current English and German Generate **Pipeline Definitions** contain 3 **Stages** labeled `searching` → `pondering` → `auditing` for compatibility and UI continuity, but Stage behaviour is declared by **Stage Policy** rather than inferred from those ids.
- A **Job** is one run of a **Pipeline** for one **Word**
- A **Batch** contains N **Jobs**, executed by the **Queue** with configurable concurrency
- The **Active Queue** is for controlling live Jobs; **Job History** is for revisiting completed, partial, or failed Jobs
- Clicking a **Job History** item opens a status-specific detail: `complete` Jobs open a **Job Result Preview**, while `partial` and `error` Jobs reuse the AI drawer so the user can inspect stages and retry or recover
- The Queue panel presents **Active Queue** and **Job History** as two modes in the same UI surface; execution controls belong only to Active Queue, while review and filtering controls belong to Job History
- Saving or overwriting a **Word** remains an Editor responsibility; **Job History** may fill the Editor from a complete Job after Basic **Format Fix** has run, but does not write directly to `words_v2`
- A **Workset** is derived from **Job History** rows but is not itself History: it answers "what latest YAML results should I save now?" and can batch-save through the Word save path, reporting per-Word save outcomes such as saved, conflict, invalid, missing, or error
- A **Workset Sync Marker** separates App Database sync state from Queue status, so a `complete` Job can be visibly unsynced even when an older Word with the same Lemma + Language already exists
- **Word Save Provenance** connects a saved **Word** back to the source **Job** only after the save succeeds, allowing the **Workset Sync Marker** to update without making Queue status part of Word Content
- Basic **Format Fix** can run automatically before Fill Editor, Word save, and Workset save, and it can be triggered manually from the Word Editor. It can repair common YAML syntax slips, safely promote misplaced top-level sections when schema evidence is unambiguous, and return structured diagnostics when automatic repair is unsafe. Enhanced **Format Fix** is user-triggered. `partial` and `error` Jobs are rejected.
- A **Content Fix** applies to `complete` Jobs whose `overall_score < 6`. It creates a new Queue-based Fix Job (priority `high`) that runs `fixing` then re-runs `auditing`. Can be triggered per-word or as a Workset batch.
- **Workset Improve** applies Content Fix only to eligible low-score Jobs in the current visible **Workset**, never to older deduplicated **Job History** rows. A user can remove Jobs from the **Pending Improve Selection** before creating Fix Jobs.
- **Effective Review Score** is the score used for Workset ordering and Workset Improve eligibility: User Review Score overrides AI Review Score without deleting the original AI judgment.
- **Improve Count** follows the Job Result chain: a Workset Improve Fix Job receives source Improve Count + 1, while a fresh Generate Job starts again at 0.
- A **Pipeline Definition** can declare **AI Flavor Markers** as a Prompt input augmenter for a Stage; that Stage then receives structured evidence summarized into the Prompt alongside the YAML.
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
