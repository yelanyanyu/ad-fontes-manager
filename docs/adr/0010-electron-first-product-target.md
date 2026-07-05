# Electron-first Product Target

Accepted: Ad Fontes Manager will treat Electron as the only supported product target. The browser-facing development server may remain as a debugging surface, but it is no longer a separate Web product target.

This decision follows the project's current direction. The app is becoming a desktop-first vocabulary and AI generation tool: it stores local SQLite data, uses Electron user data for configuration, ships through desktop installers, and has desktop update behavior. During development, Electron can already expose the renderer and local server in a way that allows browser-based debugging. That removes the main practical reason to keep a separate Web product.

We will keep a single mainline codebase rather than splitting long-lived Web and Electron branches. Long-lived branches would make schema changes, Pipeline work, Queue fixes, UI improvements, and dependency upgrades diverge. They would reduce one ABI pain point while creating a larger maintenance problem.

The Web scripts and docs may be kept temporarily as compatibility or debugging helpers, but they should be described as development support only. Release, CI, packaging, update, native module, and verification work should optimize for Electron. Future cleanup can deprecate and then remove Web build/start entry points once Electron development covers the same debugging needs.

This decision does not require migrating to Electron Forge. Forge is a packaging toolchain that can standardize Electron build and native rebuild workflows, but it does not remove native ABI differences between system Node.js and Electron. Any future Forge migration should be evaluated as a packaging/release migration, not as the solution to the product-target question.

Consequences:

- Electron is the release target for installers, update feeds, and user-facing verification.
- Browser preview is a debugging aid, not a supported product surface.
- Documentation should lead with Electron development and release commands.
- Web-specific deployment documentation should be deprecated before removal.
- Native module handling should prioritize Electron, while Node ABI restoration remains available for tests and developer scripts that still run in system Node.js.
- The project should avoid long-lived Web/Electron product branches.
