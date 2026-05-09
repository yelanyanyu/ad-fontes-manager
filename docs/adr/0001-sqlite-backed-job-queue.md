# 0001: SQLite-backed durable Job Queue with single-table design

**Status**: accepted

The AI generation Job Queue currently lives as three in-memory Maps and an array inside `generateController.ts` (800 lines). Jobs vanish on restart. Concurrency is hardcoded to 1. There is no Batch abstraction — each Job is a standalone entity.

We will extract this into a `JobQueue` module backed by a single `job_queue` SQLite table, with a global concurrency pool, two priority levels, and restart recovery (`running` → `queued`). The old `generateController.ts` becomes a thin adapter that delegates to `JobQueue`.

## Considered Options

### Dual queue (generate vs fix)

A separate queue for Fix Jobs so they never wait behind batch generation.

Rejected because: LLM API is the shared bottleneck — two queues compete for the same provider. A single queue with `priority` achieves the same result without splitting the concurrency pool. Worst case for a fix: wait for 1 running Job (~60s for searching stage, max ~180s for full pipeline).

### Two-table design (batch_queue + job_queue)

A `batch_queue` table storing Batch-level status, `total`/`done`/`failed` counters, and a dedicated `concurrency` setting.

Rejected because: Batch progress can be derived from `job_queue` aggregation (`COUNT GROUP BY status WHERE batch_id = ?`). Two tables introduce a cross-table consistency risk — `batch_queue.done` must always match the count of `job_queue.status = 'complete'`. A single table has one source of truth. Batch-level operations (pause/resume/cancel) operate directly on `job_queue` rows.

### `position` column

An explicit `position` column maintained by re-numbering all queued Jobs on every change.

Rejected because: `created_at` captures insertion order naturally. `SELECT ... ORDER BY priority DESC, created_at ASC` achieves the same dequeue order without maintaining a mutable column.

### Per-Job PipelineRunner injection

Each Job carries its own Runner reference, allowing different execution strategies per Job.

Rejected because: Generate, Fix, and Audit-Fix all use the same `SequentialRunner` with different `PipelineDefinition` inputs. No variation in runner is needed — only variation in pipeline definition.

### Per-Batch concurrency pool

Each Batch has its own independent concurrency pool, set at creation time.

Rejected because: All Jobs share one LLM provider set with one aggregate rate limit. Per-Batch pools would allow over-subscription (e.g., two Batches with concurrency=3 each → 6 simultaneous calls to the same API). The global pool is a simpler model that reflects the physical constraint.

### Stage-level recovery on restart

Persist each Stage's output (`steps` table) so a restarted Job can resume from the last completed Stage.

Rejected because: The cost (additional table, serialization complexity) is not justified by the benefit. A full re-run costs 60-180s of LLM time — annoying but not catastrophic. The real disaster (losing an entire 200-word Batch on restart) is eliminated by `running` → `queued` recovery alone.

## Consequences

- **Single `job_queue` table** with nullable columns for the three Job types (`generate`, `fix`, `audit-fix`). Adding a fourth type requires only a new `CHECK` value.
- **No DDL migration needed for `batch_queue`** — if future requirements demand it (e.g., complex Batch scheduling policies), it can be added later without breaking the current schema.
- **`generateController.ts` shrinks from ~800 lines to ~100 lines** — each endpoint becomes a 3-line delegation to `JobQueue`.
- **Queue is testable in isolation** — inject a fake `PipelineRunner` and an in-memory SQLite via `getDb` factory.
- **Circuit breaker** (3 consecutive provider failures → pause that provider) is a Phase 6 concern and does not affect this design.
