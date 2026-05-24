# 0003: Workset Improve uses Effective Review Score and user-editable selection

**Status**: accepted

Workset Improve will apply Content Fix to low-score Jobs in the current visible Workset, not to all Jobs in Job History. The Workset is already a deduplicated review-and-save surface: for each Lemma + Language, it shows only the newest Job Result from today's persisted History. Workset Improve should therefore operate on the same surface the user is looking at.

The action uses **Effective Review Score** for eligibility:

```text
Effective Review Score = User Review Score ?? AI Review Score
```

The AI Review Score produced by the auditing Stage remains stored with the Job Result. A User Review Score is a persisted user override in the Job Result's score metadata; it does not delete or rewrite the AI Review Score. This lets users correct a mistaken score without losing the original AI judgment.

Workset Improve opens a **Pending Improve Selection** before creating Fix Jobs. The selection defaults to eligible low-score Workset Items. Users may remove any item before submission, including items that have already been improved. High-score Jobs, `partial` Jobs, `error` Jobs, and Jobs missing required Content Fix inputs are not added to the selection.

**Improve Count** is displayed as context, not used as a hard eligibility gate. It records the number of Content Fix rounds in the current Job Result chain:

```text
Generate Job: improve_count = 0
Fix Job from Workset Improve: source.improve_count + 1
Fresh Generate Job for the same Lemma + Language: improve_count = 0
```

## Considered Options

### Use `improve_count === 0` as the eligibility rule

Rejected because it makes the system too rigid. A Job can remain low-quality after one fix, and the user should be able to include it again. Improve Count is still valuable, but as context for user judgment rather than an automatic block.

### Scan all of today's Job History

Rejected because hidden deduplicated History Jobs are not visible in the Workset. Improving invisible Jobs would create background work the user did not explicitly ask for, and could produce surprising replacements later.

### Overwrite `overall_score` when the user edits the score

Rejected because it destroys the distinction between the auditing Stage's judgment and the user's judgment. Keeping both AI Review Score and User Review Score makes later diagnostics, dashboard statistics, and prompt tuning more trustworthy.

### Automatically re-run auditing for blocked low-score items

Rejected for the first implementation. Workset Improve should create Fix Jobs from known inputs, not start a hidden two-stage recovery flow. Items without valid Revision Notes, parseable score metadata, or usable YAML become **Blocked Improve Items** with visible reasons.

## Consequences

- Workset responses must expose AI Review Score, User Review Score, Effective Review Score, Improve Count, and improve eligibility or blocking reason.
- User Review Score must be persisted in Job Result score metadata so refreshes and desktop restarts do not change Workset Improve eligibility.
- Fix Jobs created by Workset Improve inherit source Improve Count + 1.
- Workset Improve creates high-priority Fix Jobs only for the user's confirmed Pending Improve Selection.
- The original Workset Item remains visible while its linked Fix Job is running. When the Fix Job completes, the Workset refreshes and the newer Fix Job Result naturally replaces the source result. If the Fix Job fails, the original item remains visible with a failed improve state.
- Audit Incomplete must not be represented as a perfect Review Score. Such Jobs should be blocked from automatic Workset Improve until the user re-runs auditing or provides explicit Revision Notes through a manual fix path.
