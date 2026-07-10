# Unified Desktop Configuration Store

**Status**: accepted

Ad Fontes Manager will introduce a deep **User Settings module** for user-owned desktop settings while keeping a separate **Runtime Boot Config module** for process startup configuration. This prevents the Electron-first settings migration from breaking browser debugging, standalone server runs, tests, or CI.

The current configuration implementation mixes two different concerns in one `config.json` shape:

- user-owned settings such as AI providers, API keys, Data Directory, Software Update preferences, and future configuration export/import;
- process boot configuration such as server port, dev client port, database URL, logging, security, environment variable overlay, and test defaults.

That makes the current module shallow. Callers need to know config file paths, string lookup paths, merge order, masking rules, cache invalidation, defaulting, migration, and side effects such as Queue concurrency updates. The deletion test shows the module is earning its place, but the interface is too wide: deleting it would spread those rules across Electron main, server routes, AI provider setup, Settings UI, and tests.

## Decision

Create a **User Settings module** with a small interface. Its implementation owns user setting migration, schema versioning, UTF-8 JSON storage, backup policy, secret masking, atomic writes, cache invalidation, and import/export readiness.

The intended interface is conceptually:

```ts
interface UserSettingsModule {
  readSnapshot(): UserSettingsSnapshot;
  update(patch: UserSettingsPatch): UserSettingsSnapshot;
  migrate(input: unknown): MigrationResult;
}
```

The interface is deliberately not a generic `get(path)` / `set(path)` store. Settings callers should ask for domain-shaped snapshots and commands, not string paths into a shared object.

Keep a separate **Runtime Boot Config module** for startup concerns. It may keep env overlay and development defaults, but it should not own user setting mutation. Runtime callers can still read process-level values such as `server.port`, `database.url`, `logging.level`, and `security.helmet`.

## Seams and Adapters

The User Settings module seam sits between settings callers and persistent storage. It has at least two adapters:

- **Electron User Data adapter**: the product adapter. It reads and writes the settings file under Electron `userData`.
- **File Settings adapter**: the development and test adapter. It preserves `ADFONTES_CONFIG_PATH`, standalone server use, browser debugging, and isolated tests.

Two adapters make this a real seam rather than a hypothetical seam. The browser-facing development server remains a debugging surface as accepted in ADR-0010, not a separate Web product target.

## Consequences

- Electron remains the product target for user settings.
- Browser/debug and standalone paths must keep working through the File Settings adapter.
- `ADFONTES_CONFIG_PATH` must not be removed during the migration.
- User settings must not depend on env overlay for normal product behavior.
- Runtime boot config must not become the place where user settings are mutated.
- AI settings should move behind an **AI Runtime Profile module** that consumes the User Settings module through a narrow interface.
- Data Directory and Software Update preferences should stop writing ad hoc fields directly from Electron main.
- Configuration export/import should target User Settings, not Runtime Boot Config.

## Migration Shape

1. Introduce the User Settings module and File Settings adapter while keeping the existing `config.json` physical file.
2. Route AI settings read/update through the new module, preserving masked secret behavior.
3. Route Data Directory and Software Update preferences through the same module.
4. Split runtime-only reads behind Runtime Boot Config.
5. Only after callers are migrated, consider reshaping the physical file into clearer top-level sections.

The physical storage can remain compatible during the transition. The first migration should deepen the module interface before changing file layout.

## Rejected Options

### Make Electron `userData/config.json` the only supported source

Rejected because it would break the development server, standalone server, tests, and CI. ADR-0010 makes Electron the only product target, but it explicitly preserves the browser-facing development server as a debugging surface.

### Keep one generic config module with `get(path)` and `saveConfigFile`

Rejected because it keeps the module shallow. String paths leak storage shape and validation rules into callers, and tests have to know too much about implementation details.

### Split Web and Electron into separate long-lived configuration trees

Rejected because ADR-0010 rejects long-lived Web/Electron branches. A single module with adapters gives locality without creating divergent product lines.

