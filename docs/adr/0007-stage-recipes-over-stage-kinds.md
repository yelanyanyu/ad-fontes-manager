# Stage Recipes over Stage Kinds

Accepted: Pipeline customization will be expressed through Stage Recipes run by a shared LLM Stage Executor, not through many Stage Kinds or a runtime plugin registry. In this project, a Stage is fundamentally LLM-driven: it receives Pipeline Context, follows a Prompt, may use Tools, validates or repairs its output, and writes a Pipeline Context Patch. Business differences such as word generation, auditing, single-prompt generation, or future phrase analysis should be described by recipes unless they truly require a different product result contract.

External agent or workflow frameworks may be evaluated as an implementation option inside the LLM Stage Executor, especially for model calls, Tool loops, tracing, and repair loops. They should not replace the app's outer Pipeline contract by default unless they can preserve the same user-visible behaviour for Queue, Job History, Workset, partial YAML, Review Score, SSE events, and Word save flows.

This means the app should first make Stage Recipe explicit before adding more execution types. A single-prompt full generation Stage, an auditing Stage, and a future phrase-analysis Stage can all stay on the same LLM Stage Executor when their differences are input context, Prompt, Tools, validator, repair policy, and output mapping.
