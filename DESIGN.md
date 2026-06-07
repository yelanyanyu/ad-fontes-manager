# Ad Fontes Manager Design Guide

Ad Fontes Manager is a desktop-first study and production tool. Its UI should feel calm, structured, and trustworthy: dense enough for repeated work, but never visually noisy.

## Product Feel

- Prefer operational interfaces over marketing layouts. The first screen should expose the user's work: words, queue state, generation progress, review output, and export actions.
- Keep visual hierarchy quiet. Use spacing, borders, muted text, and compact controls before using large decorative surfaces.
- Treat generated content and user data as serious work artifacts. Destructive actions must be explicit, reversible when possible, and clearly explained when not.

## Visual System

- Use the tokens in `src/renderer/src/assets/theme.css` for color, radius, shadow, typography, and surfaces.
- Use the shared UI primitives in `src/renderer/src/assets/ui.css` before adding component-local CSS. Local scoped styles should describe layout and domain-specific details, not reimplement panels, buttons, controls, dialogs, chips, or empty states.
- Primary actions use `--green`; dangerous actions use `--red`; warnings use `--amber`; secondary text uses `--muted` or `--text-soft`.
- Use `var(--sans)` for application UI, `var(--serif)` for lemma/title-like word display, and `var(--mono)` for YAML, JSON, logs, and technical output.
- Prefer compact radii: `--radius-sm` for controls, `--radius-md` for panels, `--radius-lg` for modal cards.
- Avoid decorative gradients, floating ornament, and oversized hero-like sections inside the app.

## CSS Template

- Treat `theme.css` as the token layer and `ui.css` as the reusable UI grammar. Do not add one-off `.btn`, `.panel`, `.ctl`, `.modal-*`, or `.chip-*` systems inside a component when a shared primitive already exists.
- Prefer semantic shared classes such as `.ui-panel`, `.ui-panel__head`, `.ui-panel__title`, `.ui-button`, `.ui-button--primary`, `.ui-button--quiet`, `.ui-icon-button`, `.ui-control`, and `.ui-select`.
- Use `.ui-dialog-*` for modal shells, `.ui-notice-*` for inline feedback, `.ui-chip-*` for compact status labels, `.ui-field-*` with `.ui-input` / `.ui-textarea` for forms, and `.ui-empty-state-*` for empty work surfaces.
- Component scoped CSS may tune dimensions, grid placement, and domain-specific state, but should not copy the base visual treatment of common controls.
- Add new shared primitives only after the same visual pattern appears in at least two places or is required by this guide.

## Layout

- Desktop app pages should fit the window without causing the main app shell to scroll. Individual content regions may scroll when that is the expected work surface.
- Tables and table-like queues must use stable column definitions. Header and body rows should share the same grid or table layout so columns stay aligned across screen sizes.
- If a dense table cannot fit horizontally, preserve column alignment and allow horizontal scrolling inside the table surface.
- Do not place cards inside cards. Use panels for major regions, cards only for repeated items, dialogs, and framed tools.

## Dialogs And Confirmation

- Do not use browser/system dialogs such as `window.confirm`, `confirm`, `alert`, or `prompt` for product UI.
- Use project modal components instead, currently `src/renderer/src/components/ui/ConfirmDialog.vue` with `src/renderer/src/composables/useConfirmDialog.ts`.
- Destructive confirmations must include:
  - a specific title,
  - a short consequence-focused message,
  - a clear danger-styled confirm action,
  - a safe cancel path.
- If an action has hidden data dependencies, say so in the dialog and near the action when space allows. Example: Queue Today is derived from Job History, so deleting History can remove Today items.

## Queue UI

- Queue has three distinct surfaces: Active Queue for live control, Job History for completed/partial/error review, and Today Workset for latest generated results.
- Today Workset depends on Job History. Treat Clear History and individual History deletion as destructive actions that may affect Today, Save All, and Workset Improve.
- Queue tables should reuse `QueueTable` semantics rather than ad hoc row markup. Column alignment, status dots, job type chips, score chips, improve counts, notes, and row actions belong to that shared table language.
- Running job updates should feel live, but historical review should feel stable and inspectable.

## Feedback

- Use toasts for non-blocking outcomes: saved, skipped, queued, failed, or completed.
- Use modal dialogs for decisions that block progress or mutate data.
- Use inline warnings for persistent context the user should see before choosing an action.
- Use custom floating tips for icon-only controls and compact help triggers. They should share one visual treatment within a surface, teleport to `body` when they might escape a clipped panel, use `--radius-sm`, and stay within the viewport. Do not rely on browser-native `title` tooltips for product UI that needs consistent styling.
- Error messages should distinguish parsing failures, schema validation failures, missing data, and blocked workflow states when the system can tell them apart.

## Accessibility And Responsiveness

- Dialog overlays must use `role="dialog"` and `aria-modal="true"`.
- Buttons need explicit text labels unless they are standard icon buttons with accessible labels.
- Text inside buttons, chips, and table cells must not overlap or resize the layout unexpectedly.
- Keep controls reachable at small desktop widths. When content is too wide, scroll the content region rather than pushing controls off-screen.
