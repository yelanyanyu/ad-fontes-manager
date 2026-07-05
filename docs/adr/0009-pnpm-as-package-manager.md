# Use pnpm as Package Manager

Accepted: Starting with the 2.0.8 release line, Ad Fontes Manager uses pnpm as the project package manager. `pnpm-lock.yaml` is the dependency lockfile, and `package-lock.json` is no longer maintained.

The project is now primarily an Electron desktop application. Dependency installs need to stay fast and reproducible, while native modules such as `better-sqlite3` still need explicit Node and Electron ABI rebuild paths. pnpm gives us a stricter install model, a smaller shared store, and a clear build-script approval mechanism for packages that need postinstall work.

The package manager version is pinned through `packageManager` in `package.json`. CI enables Corepack and runs `pnpm install --frozen-lockfile`, so local development and GitHub Actions use the same lockfile contract. Daily commands should use `pnpm run ...`.

Desktop packaging uses `nodeLinker: hoisted` in `pnpm-workspace.yaml`. Electron packaging tools still inspect the physical `node_modules` tree, and the hoisted layout keeps that tree close to the npm layout they expect. The stricter pnpm layout is useful during development, but here the packaged app must be able to resolve runtime dependencies from inside `app.asar` without falling back to the developer machine.

Native build scripts are approved through `pnpm-workspace.yaml`. The approved packages are intentionally narrow:

- `better-sqlite3`, because the app stores data in SQLite and switches between Node and Electron ABI builds.
- `electron`, because the desktop runtime needs its install script.
- `electron-winstaller`, because Windows desktop packaging needs its install-time helper.
- `esbuild`, because Vite, Electron tooling, and related build tools use esbuild native binaries.

We rejected keeping both npm and pnpm lockfiles. Dual lockfiles make CI and local development disagree about dependency resolution. We also rejected committing a project-level China mirror registry setting. Developers can configure a user-level pnpm registry mirror when needed, while CI should keep using the default registry unless the release pipeline explicitly changes.

The main migration risk is native module ABI drift. The existing `native:node`, `native:electron`, and desktop build scripts remain the boundary for switching `better-sqlite3` between runtimes. Any future dependency manager change must prove those scripts still restore the correct ABI after desktop builds.

A second migration risk is missing packaged transitive dependencies. In pnpm builds, `electron-builder` can miss small production packages that are only reached through deeper CommonJS `require` chains. The `afterPack` hook therefore patches the known missing production dependency packages into `app.asar` before the installer is built. If a desktop build starts with `Cannot find module ...` from inside `resources/app.asar`, treat it as a packaging dependency graph issue first, then update the `afterPack` patch list and verify the packaged server entry from a temporary extracted `app.asar`.
