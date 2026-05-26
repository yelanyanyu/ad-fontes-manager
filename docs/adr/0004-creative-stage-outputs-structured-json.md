# 0004: Creative Stage outputs structured JSON, not YAML

**Status**: accepted

The `pondering` Stage generates the longest and most nested creative fields in a Word result: `etymology.visual_imagery_zh`, `etymology.meaning_evolution_zh`, `cognate_family`, `application`, and `nuance`. These fields include long Chinese prose, quoted terms, PIE roots, arrays, and block-like text. When the Stage asks an LLM to stream YAML directly, the model frequently produces syntactically invalid YAML: top-level creative sections become indented under `etymology`, quoted strings close with Chinese punctuation instead of ASCII `"`, duplicate `etymology` keys appear, and YAML aliases are accidentally triggered by unquoted `*root` values.

We will change the `pondering` Stage contract from raw YAML to structured JSON. The Stage may still stream its raw JSON text to the UI so users can see live progress, but that raw stream is an intermediate artifact, not the final Word YAML. The server parses and validates the JSON object, merges it with the structural research object, and serializes the final result with `yaml.dump`.

```text
searching output -> structural object
pondering output -> creative JSON object
program merge -> full Word object
program serialization -> final YAML
```

The user-facing saved result remains YAML. YAML becomes a program-generated serialization format, not an LLM-authored format for the creative Stage.

## Considered Options

### Strengthen the YAML prompt

Rejected because it still relies on the model to maintain YAML indentation, quote escaping, array nesting, and duplicate-key discipline across long prose. It reduces failure frequency but does not remove the class of failures.

### Auto-repair creative YAML after generation

Rejected as the primary strategy because repair logic must infer intent from already-broken syntax. It is useful as a transitional guard, but it is brittle for ambiguous cases such as nested top-level sections, unterminated quotes, and accidental aliases.

### Hide streaming until final YAML is ready

Rejected because live Stage output is part of the product experience. Users should still be able to inspect what the model is producing while the Stage runs. Streaming JSON is acceptable because JSON remains readable enough for diagnostics and review.

### Structured JSON for all Stages immediately

Deferred. `auditing` already uses JSON-like output, while `searching` produces shorter structural YAML and is not the main source of creative indentation failures. The first hard boundary is the `pondering` Stage because it carries the highest formatting risk.

## Consequences

- The `pondering` parser must parse JSON, validate the creative object shape, and expose a structured creative payload to the Pipeline context.
- Final YAML must be produced only by program serialization after merging structural and creative objects.
- The raw Stage Output panel may show streaming JSON. A later UI can add a YAML preview rendered from the completed structured object.
- Prompt files for creative Stages should describe JSON keys and values, not YAML indentation rules.
- Format Fix should no longer be the primary recovery path for creative Stage indentation failures; those failures should be prevented before final YAML exists.
- Existing saved Words remain YAML and do not require migration.
