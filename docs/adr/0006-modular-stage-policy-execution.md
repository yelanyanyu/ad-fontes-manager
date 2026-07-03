# Modular Stage Policy Execution

Accepted: Stage Policy execution will move behind a dedicated `StagePolicyEngine`. ADR-0004's declarative Stage Policy contract is already implemented; this ADR records the next modularization step so the generic Runner stops owning policy execution details.

`StagePolicyEngine` owns complete Stage Policy execution for a single normalized Stage: Execution Policy, Output Policy, Assembly Policy, and Stop-loss Policy. The Engine runs the Agent Loop, applies output parsing, performs assembly, applies stop-loss behaviour, and reports Stage progress through an abstract progress emitter. It does not own prompt assembly.

`SequentialRunner` remains responsible for sequencing only. It receives a ready prompt for each Stage, calls `StagePolicyEngine.executeStage()`, merges the returned context patch, and decides whether to continue, stop the Pipeline, or surface the stopped result. It should not branch on Stage ids to infer Tool use, YAML assembly, output parsing, or stop-loss rules.

Pipeline Definitions will be normalized before execution. A `PipelineDefinitionNormalizer` owns the legacy Stage adapter and produces normalized Stages with explicit policy. `StagePolicyEngine` accepts only normalized Stages. Legacy compatibility tests belong to the normalizer; Engine tests should not prove legacy Stage-name inference.

External effects are injected through a narrow Stage execution adapter boundary. Production adapters provide model streaming, Tool execution, timing or sleep, logging, cancellation, and progress emission. Tests use fake adapters through the same boundary so Engine behaviour can be tested without global model config, network calls, or real Tools.

`executeStage()` returns a small outcome object that contains only the information the Runner needs for sequencing:

- `complete`: status, context patch, raw text, optional reasoning text, diagnostics, summary, and duration.
- `stopped`: status, context patch, raw text, optional reasoning text, diagnostics, summary, duration, YAML, reason, and stopped Stage id.

Tool-call details, fallback internals, malformed-score handling, and stop-loss decision mechanics stay inside the Engine and are exposed only through diagnostics or progress events when useful to the UI.

Testing will concentrate on the new module boundary. `PipelineDefinitionNormalizer.normalize()` tests legacy Stage conversion to explicit policy. `StagePolicyEngine.executeStage()` tests Agent Loop, Tool fallback, Output Policy, Assembly Policy, Stop-loss Policy, and malformed-score handling with fake adapters. `SequentialRunner.run()` keeps a smaller set of integration tests for sequencing, resume behaviour, and pipeline-stopped events.

We rejected folding this into ADR-0004 because ADR-0004 describes the already-completed declarative Stage Policy contract. This ADR is about modular ownership, dependency seams, and test boundaries for the implementation that executes that contract.
