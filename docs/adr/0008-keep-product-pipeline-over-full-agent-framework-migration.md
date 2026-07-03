# Keep App-Owned Pipeline over Full Agent Framework Migration

Accepted: Ad Fontes Manager will keep its own Pipeline and optimize it into a small workflow runtime, rather than fully migrating Pipeline execution to a third-party agent workflow framework right now. A full migration is technically possible because the Pipeline maps cleanly to common workflow concepts: Stage Recipes are steps, Pipeline Context is workflow state, Tools are agent tools, Stop-loss and repair are feedback loops, and SSE events are trace output. The migration cost is whether the framework can preserve the same user-visible behaviour for Queue, Job History, Workset, partial YAML, Review Score, and Word save flows without a large adapter layer.

Third-party frameworks may still be used inside the LLM Stage Executor. The preferred evaluation target is replacing model calls, Tool loops, streaming, tracing, and repair-loop mechanics while preserving the app-owned Pipeline interface: `PipelineRunner.run()` still returns Word YAML and scores, partial Jobs still preserve partial YAML, and users see the same Queue and Workset behaviour.

**Considered Options**

- Full migration to a workflow framework such as LangGraph or Mastra. This gives mature workflow features such as persistence, streaming, resumable runs, workflow state, observability, and agent/tool abstractions, but it forces existing user-visible Job behaviour to be re-expressed through the framework.
- Keep the current implementation as-is. This avoids migration cost but leaves `pipe.ts` carrying too much workflow logic and increases the chance of repeated local refactors.
- Optimize the current Pipeline into a generic workflow-shaped module while using framework pieces only inside the LLM Stage Executor. This keeps product semantics local while still allowing mature agent tooling to replace the most complex execution internals.

**Consequences**

The next refactor should treat this Pipeline as an app-owned workflow runtime: Stage Recipe, Pipeline Context Patch, LLM Stage Executor, Progress Event mapping, and final Word Result assembly should become explicit modules. A spike branch may compare LangGraph, Mastra, and the existing Vercel AI SDK path, but the acceptance test is whether the framework reduces executor complexity while keeping user-facing Queue, Job History, Workset, partial-result, and saved Word behaviour equivalent.
