# Quickstart: Anonymous Usage Statistics Collection

**Feature**: 049-usage-telemetry

## One-time developer setup

1. **Install the dependency** (agents must not do this):

   ```bash
   pnpm add @vscode/extension-telemetry
   ```

2. **(Maintainer, for real collection only)** Create `.env` at the repo root — it is already gitignored (`.env*`):

   ```bash
   SPEEDYGIT_TELEMETRY_CONNECTION_STRING=InstrumentationKey=...;IngestionEndpoint=https://...
   ```

   Without this file every build (including production) ships with telemetry off — safe default. Azure resource + daily ingestion cap are maintainer-owned, out of implementation scope.

## Build matrix (expected behavior)

| Build | Connection string | ExtensionMode | Telemetry |
|---|---|---|---|
| `pnpm build` / `pnpm watch` / `pnpm test` | empty (define not loaded) | any | no-op |
| F5 "Run Extension" (dev build) | empty | Development | no-op |
| `pnpm build:prod` with `.env` | embedded | Production (installed vsix) | active (subject to consent gates) |
| `pnpm build:prod` without `.env` | empty | Production | no-op |

## Verification walkthrough (maps to spec success criteria)

1. **No-op in dev (FR-015)**: F5 → open the Output panel → "Speedy Git Telemetry" channel shows `disabled (dev mode / no connection string)` status line; no event lines ever appear.
2. **Events flow in production (US1, SC-001)**: `pnpm ext:package` with `.env` present, install the `.vsix`, set `telemetry.telemetryLevel: all`. Open the graph, run a merge and a failed operation. Telemetry channel shows: `activate`, `settingsSnapshot`, `panelOpened`, one `operation` per action — the failed one with `outcome:error` + `errorCode` enum only.
3. **Dual consent (US2, SC-002)**: with the vsix install, (a) set `speedyGit.telemetry.enabled: false` → channel logs status change, no further event lines; (b) re-enable it but set global `telemetry.telemetryLevel: off` → same result. Both toggles take effect without restart.
4. **No PII (SC-005)**: inspect event lines in the channel — every property value is an enum/bucket/boolean; no repo/branch/path/message strings anywhere.
5. **UI events (US4)**: right-click a commit → click a menu item; open a dialog → cancel it. Channel shows `uiInteraction` + `dialogOutcome` records with fixed ids only.
6. **Excluded chatter (FR-002)**: scroll the graph (loadMoreCommits), open commit details, let auto-refresh fire — no `operation` lines for any of these.
7. **Silence (SC-003)**: at no point does any notification, prompt, or status-bar text appear.
8. **Gates**: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all pass (constitution build gates).

## Key file map

| Concern | File |
|---|---|
| Closed vocabulary + validator + allowlist | `shared/telemetry.ts` |
| RPC type | `shared/messages.ts` (`trackUiEvent`) |
| Funnel service | `src/services/TelemetryService.ts` |
| Operation middleware | `src/webview/WebviewMessageRouter.ts` |
| UI-event handler | `src/webview/handlers/telemetryHandlers.ts` |
| Wiring | `src/extension.ts`, `src/ExtensionController.ts`, `src/webview/WebviewProvider.ts`, `WebviewRequestContext.ts` |
| Webview send helper | `webview-ui/src/utils/telemetry.ts` (+ `rpc/rpcClient.ts`) |
| Build injection | `esbuild.config.mjs` |
| Setting + dependency | `package.json` |
| Transparency | `telemetry.json`, README "Telemetry" section |
