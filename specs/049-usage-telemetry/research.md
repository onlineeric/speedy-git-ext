# Research: Anonymous Usage Statistics Collection

**Feature**: 049-usage-telemetry | **Date**: 2026-07-06
**Sources**: `specs/049-usage-telemetry/049-statistic-collection-idea.md` (validated technical investigation, 2026-07), codebase inspection.

No NEEDS CLARIFICATION markers remained in the Technical Context; this document consolidates the pre-validated decisions and resolves the implementation-level unknowns discovered during codebase inspection.

## R1. Telemetry package

- **Decision**: `@vscode/extension-telemetry` ^1.5.2, constructed with an Azure Application Insights **connection string**.
- **Rationale**: Microsoft's official module, recommended by VS Code's extension-telemetry guide. Requires VS Code ≥1.75; our engine floor is `^1.85.0` ✓. Handles consent (`telemetry.telemetryLevel`, `isTelemetryEnabled`, `onDidChangeTelemetryEnabled`) internally — zero consent-plumbing code. Auto-enriches every event with extension name/version, VS Code version, OS/platform, arch, UI kind, remote name, anonymized `machineId`, session ID. `sendTelemetryErrorEvent` auto-scrubs stack-trace-like values. Disposal via `context.subscriptions` flushes pending events (satisfies FR-017).
- **Alternatives considered**: raw Application Insights SDK (rejected: no consent integration, larger surface); custom endpoint (out of scope by spec); `sendDangerousTelemetryEvent` API (never used — bypasses user settings).
- **Install (developer runs manually — agents must not install)**: `pnpm add @vscode/extension-telemetry`

## R2. Connection string storage & injection

- **Decision**: local gitignored `.env` (already matched by existing `.env*` gitignore rule) holding `SPEEDYGIT_TELEMETRY_CONNECTION_STRING`. `esbuild.config.mjs` loads it with Node's built-in `process.loadEnvFile('.env')` **only on `--production`** builds (wrapped in try/catch — absent file ⇒ value stays empty) and injects it via esbuild `define`. Dev/watch/test builds define an empty string.
- **Rationale**: The string is not a secret (extractable from any `.vsix`); keeping it off GitHub removes the casual copy-paste vector. Real abuse safeguard is the Azure-side daily ingestion cap (maintainer-owned). Publishing is local (`pnpm ext:publish` → `vscode:prepublish` → `build:prod` → `--production`), so every published artifact embeds the string; no CI secret needed. `process.loadEnvFile` exists since Node 20.12 and the local toolchain runs Node 24 — no `dotenv` dependency needed (Library-First principle satisfied by the platform built-in).
- **Alternatives considered**: `dotenv` package (rejected: unnecessary dependency); committing the string (rejected: invites misuse); CI secret (rejected: publishing is local).

## R3. Consent gating (dual gate) and no-op mode

- **Decision**: `TelemetryService` exposes a typed interface with two implementations:
  - **Real**: constructed only when (a) connection string non-empty AND (b) `context.extensionMode === vscode.ExtensionMode.Production`. Before every send it also checks `speedyGit.telemetry.enabled` (read live; a `onDidChangeConfiguration` listener refreshes a cached boolean so the check is O(1)). The global VS Code level is enforced inside the reporter (including live changes), so effective consent = extension setting AND global setting.
  - **No-op**: every method is an empty function. Returned when (a) or (b) fails. Call sites never null-check (FR-015).
- **Rationale**: `extensionMode` gate keeps F5/dev-host sessions out of stats even if a `.env` exists locally. Checking our setting at send time (not construction) makes mid-session toggles effective without restart (US2 scenario 4). Reporter is still constructed when our setting is off but global is on — cheap, and re-enabling works instantly; when our setting is off, sends are skipped before reaching the reporter.
- **Alternatives considered**: constructing/disposing the reporter on setting toggle (rejected: more state, no benefit); polling config per event via `getConfiguration` (acceptable but a cached boolean is cheaper and equally live).

## R4. Operation outcome capture at the router (the middleware)

- **Decision**: wrap `WebviewMessageRouter.dispatch`. For `message.type` ∈ `TRACKED_OPERATIONS` (closed allowlist in `shared/telemetry.ts`): record `performance.now()` start; invoke the handler with a **per-dispatch shallow copy of the context** whose `postMessage` inspects outgoing messages — a `type: 'error'` response (or domain failure markers, see contract) flips an `outcome` flag and captures `GitError.code` — then forwards to the real `postMessage`. On handler settle, send `operation { operation, outcome, errorCode? }` + `durationMs`. Thrown exceptions (shouldn't happen — Result pattern) also count as `outcome: error, errorCode: 'UNKNOWN'`, then rethrow.
- **Rationale**: Handlers post `ResponseMessage`s and return `Promise<void>`; they don't throw and don't return outcomes, so observing the posted messages is the only zero-per-handler-code seam. A shallow context copy (`{ ...context, postMessage: wrapped }`) is safe: `WebviewRequestContext` is a plain interface of readonly refs and methods; concurrent dispatches each get their own wrapper, so no cross-talk. Untracked types skip the wrapper entirely — zero overhead on chatty RPCs (getCommits, loadMoreCommits, …).
- **Alternatives considered**: instrument each handler (rejected: ~131 types, per-handler code violates DRY); make handlers return outcomes (rejected: touches every handler signature); global postMessage tap without per-dispatch scoping (rejected: concurrent dispatches would misattribute errors).
- **Note**: `WebviewRequestContext` object spread must preserve method `this`-binding — the existing context implementation in `WebviewProvider` already binds via arrow functions/closures; verify during implementation.

## R5. UI-event transport & re-validation

- **Decision**: one new fire-and-forget `RequestMessage` variant `{ type: 'trackUiEvent', payload: { event: UiTelemetryEvent } }`. New handler module `telemetryHandlers.ts` re-validates the payload against the closed catalog with a runtime validator exported from `shared/telemetry.ts` (checks discriminant + every property against allowlisted literal sets), then forwards to `TelemetryService`. Invalid ⇒ silently dropped. Never posts a response. `trackUiEvent` is NOT in `TRACKED_OPERATIONS` (it is not itself an operation).
- **Rationale**: webview input can't be trusted verbatim (compromised/buggy webview must not smuggle free text into properties). A closed-set membership check is O(1) per field, satisfies FR-006, and doubles as the unit-testable privacy boundary.
- **Alternatives considered**: separate webview→AI direct telemetry (rejected by spec: CSP); trusting the typed payload without runtime checks (rejected: types erase at runtime).

## R6. Extra common properties (IDE detection)

- **Decision**: `TelemetryService` appends `common.appName` (`vscode.env.appName`), `common.appHost` (`vscode.env.appHost`), `common.uiKind` (mapped from `vscode.env.uiKind`) to **every** event's properties.
- **Rationale**: package common properties identify VS Code version but not the fork; `appName` distinguishes Cursor/Windsurf/VSCodium. Per-event (vs once per session) is simpler to query in KQL — resolved as per-event (idea doc left this open; spec FR-011 requires per-event context).
- **Alternatives considered**: once-per-session `activate`-only (rejected: forces session joins in every query).

## R7. Output-channel transparency (FR-008a)

- **Decision**: dedicated `vscode.window.createOutputChannel('Speedy Git Telemetry', { log: true })` owned by `TelemetryService`. On construction: one status line — `enabled` or `disabled (reason: global setting | extension setting | no connection string | dev mode)`; re-logged when either gate changes. Per sent event: one `info` line `event <name> <json-properties+measurements>`. Never `show()`n programmatically.
- **Rationale**: satisfies clarification #3; `LogOutputChannel` writes are async/cheap and lazy (nothing renders unless the user opens the panel). Reuses the pattern of the existing 'Speedy Git' channel.
- **Alternatives considered**: reuse main channel (rejected: buries telemetry lines in operational logs, weaker transparency story); debug-gated logging (rejected in clarification).

## R8. `panelOpened` trigger granularity

- **Decision**: `trigger: 'command' | 'scmButton'`. Command palette, keybinding, and status-bar clicks all execute `speedyGit.showGraph` and are indistinguishable without extra plumbing — collapsed into `command`. The SCM-title button runs `speedyGit.openForRepo` → distinct value `scmButton`.
- **Rationale**: honest closed enum beats fabricated granularity; adding distinguishing plumbing (separate commands per surface) violates YAGNI for a P3-adjacent datum.
- **Alternatives considered**: 4-value enum from idea doc (rejected: not implementable truthfully today).

## R9. Numeric fingerprinting protection (buckets)

- **Decision**: `commitCountBucket: '<=500' | '501-1000' | '1001-5000' | '5001-10000' | '>10000'` (string property, not measurement). Exact numbers allowed for: `durationMs`, `activationMs`, `repoCount`, `batchCommitSize`, `overScan` (configuration/timing values, not repo-content-derived).
- **Rationale**: FR-013 — bucket anything derived from repository content magnitude; config values and timings carry no fingerprinting risk at our scale.

## R10. Event volume & free tier

- **Decision**: no sampling; no high-frequency events (allowlist excludes getCommits/loadMoreCommits/getCommitDetails/avatar/signature/auto-refresh paths). `perf` fires at most once per initial load; `settingsSnapshot`/`activate` once per session.
- **Rationale**: at current install base this stays far inside App Insights free tier (~5 GB/month); the cheapest event is the one never sent (SC-007).

## R11. Where `activate` / `settingsSnapshot` / `perf(initialLoad)` fire

- **Decision**:
  - `activate`: from `extension.ts`/`ExtensionController` after activation completes — `activationMs` measured from `activate()` entry; `repoCount` + `hasMultiRoot` from `GitRepoDiscoveryService.initialize()` result (sent after discovery resolves; fire-and-forget).
  - `settingsSnapshot`: immediately after `activate` event, from `readUserSettings()` + persisted UI state (viewMode, signature column visibility from `PersistedUIStateStore` when available; omitted otherwise).
  - `perf` kind `initialLoad`: measured in `RepoDataLoader` around the initial data load; kind `topology`: measured in the webview around `graphTopology` computation and sent through `trackUiEvent` (`kind: 'perf'`), re-validated like all webview input.
- **Rationale**: keeps backend-measurable signals in the backend; the only webview-measured signal (topology) rides the existing fire-and-forget channel — no new transport, CSP untouched.

## R12. Transparency artifacts

- **Decision**: `telemetry.json` at extension root enumerating every event/property/measurement (surfaces in `code --telemetry` dump); a compact README "Telemetry" section with the opt-out instructions and a collapsed full disclosure of what is and is not collected.
- **Rationale**: FR-018; both lists already exist in spec — cheap to produce, and the closed catalog in `shared/telemetry.ts` is the single source they're derived from.
