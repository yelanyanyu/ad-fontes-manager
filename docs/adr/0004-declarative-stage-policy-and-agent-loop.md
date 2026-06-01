# Declarative Stage Policy and Agent Loop

Accepted: Pipeline Definitions will declare Stage Policy instead of relying on Stage-name special cases inside the Runner. Stage Policy is split into Execution Policy, Output Policy, Assembly Policy, and Stop-loss Policy so future Pipeline Types can use different Stage names or shorter Stage sequences without changing generic sequencing code.

The Agent Loop is an Execution Policy, not a Stage. It must implement a real query loop: model Tool calls execute, Tool Results are appended as model-readable messages, and the model is called again until visible Stage output is produced or the configured tool-round limit is reached. Tool Results have two channels: a fuller UI Result for Stage Details and a compressed Model Result for subsequent model turns. Evidence synthesis and no-tool retry are Stop-loss behaviours after the Agent Loop fails, not the normal Tool path.

We rejected continuing to branch on Stage ids such as `searching` and `pondering` inside `SequentialRunner`. That approach is easy for the current English Generate Pipeline, but it would make token-saving or otherwise different Pipeline Definitions inherit hidden assumptions about Tool use, YAML assembly, and partial-result Stop-loss.
