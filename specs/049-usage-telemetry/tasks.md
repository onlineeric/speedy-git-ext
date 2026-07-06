# Tasks: Anonymous Usage Statistics Collection

**Input**: Design documents from `/specs/049-usage-telemetry/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/telemetry-events.md, quickstart.md

**Tests**: Included — plan.md's Testing context explicitly calls for Vitest unit tests on the three privacy/correctness-critical seams (catalog validator, service gating, router middleware). No TDD ordering; tests sit next to their implementation task.

**Organization**: Grouped by user story (US1–US5 from spec.md) after Setup + Foundational phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 = operation usage, US2 = consent/opt-out, US3 = environment insight, US4 = UI interactions, US5 = settings/perf snapshots

## Path Conventions

Dual-process VS Code extension (from plan.md): backend `src/`, webview `webview-ui/src/`, shared contracts `shared/`. Repo root holds `package.json`, `esbuild.config.mjs`, `telemetry.json`.

---

## Phase 1: Setup

**Purpose**: Dependency + build-time connection-string plumbing that everything else assumes.

- [x] T001 Verify `@vscode/extension-telemetry` (^1.5.2) is present in `package.json` dependencies; if missing, add the dependency entry to `package.json` and STOP with instruction for the developer to run `pnpm add @vscode/extension-telemetry` manually (constitution: agents MUST NOT install packages). Do not proceed to later tasks until `node_modules/@vscode/extension-telemetry` exists.
- [x] T002 [P] Modify `esbuild.config.mjs`: on `--production` only, load `.env` via `process.loadEnvFile('.env')` inside try/catch (absent file ⇒ ignore), then add `define: { 'process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING': JSON.stringify(process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING ?? '') }` to build options; non-production builds always define `''`. Confirm `.gitignore` already covers `.env` (existing `.env*` rule — do not commit any `.env`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The closed vocabulary, the funnel service, and its wiring — every user story sends through these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Create `shared/telemetry.ts` per data-model.md: `TelemetryEventName`, `TRACKED_OPERATIONS: ReadonlySet<RequestMessage['type']>` (exact include/exclude lists from data-model.md §3), `CommitCountBucket` + `toCommitCountBucket(n)`, `UiSurface`/`UiAction`/`DialogId` literal unions with exported readonly arrays (`UI_SURFACES`, `UI_ACTIONS`, `DIALOG_IDS`, `COMMIT_COUNT_BUCKETS`), `UiTelemetryEvent` discriminated union, `ErrorArea`, and runtime validator `isValidUiTelemetryEvent(value: unknown)` implementing data-model.md validation rules 1–5 (set membership, strict shape, finite clamped numerics, reject unknown keys).
- [x] T004 [P] Add Vitest unit tests for `shared/telemetry.ts` in `shared/telemetry.test.ts` (follow the repo's existing test file placement convention): bucket boundaries (500/501/1000/1001/5000/5001/10000/10001), validator accepts every catalog shape, rejects: unknown `kind`, out-of-set `surface`/`action`/`dialog`, free-string values, extra keys, negative/NaN/Infinity `durationMs`, non-object input.
- [x] T005 Create `src/services/TelemetryService.ts` per contracts/telemetry-events.md §B: `TelemetryService` interface (all methods `void`, never throw); `createTelemetryService(context, connectionString)` returning a **no-op** implementation when `connectionString === ''` or `context.extensionMode !== vscode.ExtensionMode.Production`; **both implementations lazily create the `'Speedy Git Telemetry'` LogOutputChannel and log exactly one gate-status line on construction (`enabled` or `disabled (reason: no connection string | dev mode | extension setting | global setting)`)**; the real implementation additionally wraps `TelemetryReporter`, appends `common.appName`/`common.appHost`/`common.uiKind` to every event, logs one info line per sent event (name + properties + measurements; never `.show()`), implements one-shot flags for `sendActivate`/`sendSettingsSnapshot`, uses `sendTelemetryErrorEvent` for `sendError`, and `dispose()` disposes reporter + channel. Export from `src/services/index.ts` barrel. (Extension-setting gate is added in T012/US2; leave a single `isEnabled()` seam for it.)
- [x] T006 [P] Add Vitest unit tests for `TelemetryService` in `src/services/TelemetryService.test.ts` (mock the `vscode` module and `@vscode/extension-telemetry` following existing backend test patterns): no-op returned for empty string / non-Production mode (and it still logs the disabled status line); real impl forwards events with `common.*` properties appended; one-shot methods fire once; methods never throw when reporter throws.
- [x] T007 Wire the service: in `src/extension.ts` capture `const activationStart = performance.now()` at `activate()` entry, construct via `createTelemetryService(context, process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING ?? '')`, push to `context.subscriptions`, pass into `ExtensionController` (new constructor param) along with `activationStart`; in `src/ExtensionController.ts` store it and pass into `WebviewProvider`; in `src/webview/WebviewProvider.ts` + `src/webview/WebviewRequestContext.ts` expose `readonly telemetry: TelemetryService` on the request context. `pnpm typecheck` must pass.

**Checkpoint**: Funnel exists, is a guaranteed no-op in dev/test, and is reachable from both the controller and every RPC handler.

---

## Phase 3: User Story 1 — Feature Usage Visibility (Priority: P1) 🎯 MVP

**Goal**: Every allowlisted user-initiated git operation produces one `operation` event with outcome, error code (enum only), and duration; failures on untracked paths surface as `error` events.

**Independent Test**: In a production build with telemetry enabled, run merge/checkout/createTag → telemetry output channel shows one `operation` line each with `outcome:success` + `durationMs`; force a failure → `outcome:error` + `errorCode` enum, never message text; scroll/load-more/auto-refresh produce no lines (quickstart.md §2/§6).

- [x] T008 [US1] Implement the middleware in `src/webview/WebviewMessageRouter.ts` per contracts §C: in `dispatch`, if `message.type` is in `TRACKED_OPERATIONS`, start `performance.now()`, invoke the handler with a per-dispatch shallow-copied context whose `postMessage` marks `outcome='error'` and captures `GitErrorCode` via an `extractGitCode` helper (reads only `payload.error.code`, validated against the `GitErrorCode` literals, else `'UNKNOWN'`) when it sees a `type: 'error'` response, then forwards; interim responses (`checkoutNeedsStash`, `checkoutCommitNeedsStash`, `deleteBranchNeedsForce`, `checkoutPullFailed`) still count as success; thrown exceptions → `outcome='error'`, `errorCode='UNKNOWN'`, rethrow; `finally` calls `context.telemetry.sendOperation(message.type, outcome, elapsed, errorCode)`. Untracked types must take the exact pre-existing code path (zero added allocations).
- [x] T009 [P] [US1] Add Vitest unit tests for the middleware in `src/webview/WebviewMessageRouter.test.ts` (stub context + handlers): success outcome, error-response outcome with code extraction, thrown-handler outcome + rethrow, interim-response-counts-as-success, untracked type sends nothing, two concurrent dispatches don't cross-attribute errors.
- [x] T010 [US1] Instrument untracked-path failures to call `telemetry.sendError(area, errorCode)` (FR-014, clarification #2 — these are the ONLY standalone `error` producers): `src/webview/RepoDataLoader.ts` initial/deferred load failures (area `'dataLoader'`), `GitWatcherService` failures surfaced in `src/ExtensionController.ts`'s auto-refresh error callback (area `'watcher'`), and `GitRepoDiscoveryService.initialize()` rejection in `src/ExtensionController.ts` (area `'repoDiscovery'`). Use `GitError.code` when the failure is a `GitError`, else `'UNKNOWN'`; never pass message text. Do NOT instrument failures of tracked operations (already counted by T008).

**Checkpoint**: MVP — operation usage and wild-error visibility measurable end-to-end via the output channel.

---

## Phase 4: User Story 2 — Respecting User Choice / Opt-Out (Priority: P1)

**Goal**: Dual consent — `speedyGit.telemetry.enabled` AND VS Code global telemetry must both allow; toggles apply without restart; zero telemetry UI.

**Independent Test**: quickstart.md §3 — disable extension setting → status line logged, no further events; re-enable + global `off` → same; both on → events resume. No notification/prompt ever appears (SC-003).

- [x] T011 [US2] Add the `speedyGit.telemetry.enabled` setting to `package.json` `contributes.configuration`: `"type": "boolean"`, `"default": true`, `"tags": ["telemetry", "usesOnlineServices"]`, markdownDescription in original wording containing the dual-consent note per FR-004 / contracts §E (e.g. "Anonymous usage statistics are sent only when this setting and VS Code's global telemetry setting are both enabled — turning either off stops all collection.") and a link to `docs/telemetry.md`.
- [x] T012 [US2] Implement the extension-setting gate in `src/services/TelemetryService.ts`: cached boolean read from `workspace.getConfiguration('speedyGit').get('telemetry.enabled', true)`, refreshed by an `onDidChangeConfiguration` listener (disposed with the service); every send method returns early when false; on gate change, log a new status line to the telemetry output channel (FR-008a). Global level needs no code (enforced inside `TelemetryReporter`). Extend `src/services/TelemetryService.test.ts`: sends suppressed when setting false, resume when true, status line re-logged on change.

**Checkpoint**: Both P1 stories done — collection is useful AND correctly consented.

---

## Phase 5: User Story 3 — Environment & Reach Insight (Priority: P2)

**Goal**: Session-level `activate` + `panelOpened` events; every event already carries `common.appName/appHost/uiKind` (done in T005) plus package-provided OS/version/machineId.

**Independent Test**: quickstart.md §2 — install vsix in VS Code and a fork; `activate` line shows `common.appName` distinguishing the products, `activationMs`, `repoCount`, `hasMultiRoot`; opening the panel logs `panelOpened` with `trigger: command` (or `scmButton` from the SCM title button).

- [x] T013 [US3] Send the `activate` event from `src/ExtensionController.ts`: after `GitRepoDiscoveryService.initialize()` resolves (fire-and-forget, off the activation path), call `telemetry.sendActivate({ activationMs: performance.now() - activationStart, repoCount: repos.length }, hasMultiRoot)` where `hasMultiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1`; rely on the one-shot guarantee from T005.
- [x] T014 [US3] Send `panelOpened` with trigger: in `src/ExtensionController.ts`, `showGraph()` → `telemetry.sendPanelOpened('command')` and `openForRepo()` → `sendPanelOpened('scmButton')`, but only when the call actually creates/opens the panel (not on reveal of an already-open panel — gate on the same condition `WebviewProvider` uses to detect a fresh panel, e.g. `isPanelOpen()` before `show()`).

**Checkpoint**: OS/IDE/user-count questions answerable from `activate` + common properties.

---

## Phase 6: User Story 4 — UI Interaction & Dialog Outcomes (Priority: P3)

**Goal**: Fire-and-forget `trackUiEvent` RPC; allowlisted clicks (all context-menu items, toolbar buttons, dialog confirm/cancel, panel toggles, column show/hide) recorded from fixed catalogs; funnel re-validates.

**Independent Test**: quickstart.md §5 — click a commit-menu item, cancel a dialog → `uiInteraction` + `dialogOutcome` lines with catalog ids only; a hand-crafted invalid payload (unit test) is dropped; scrolling/hovering produces nothing.

- [x] T015 [US4] Add `{ type: 'trackUiEvent'; payload: { event: UiTelemetryEvent } }` to the `RequestMessage` union and `REQUEST_TYPES` map in `shared/messages.ts` (import type from `shared/telemetry.ts`).
- [x] T016 [US4] Create `src/webview/handlers/telemetryHandlers.ts`: handler validates with `isValidUiTelemetryEvent`, then forwards every valid event to `context.telemetry.trackUi(event)` — `trackUi` internally maps `kind:'uiInteraction'` → `uiInteraction`, `kind:'dialogOutcome'` → `dialogOutcome`, and `kind:'perf'` → `perf` telemetry events (contracts §B); drops invalid silently (optional debug line); never posts a response. Register in `requestHandlers` spread in `src/webview/WebviewMessageRouter.ts` (the `satisfies RequestHandlerMap` enforces it). Confirm `trackUiEvent` is NOT in `TRACKED_OPERATIONS`.
- [x] T017 [P] [US4] Add handler unit tests in `src/webview/handlers/telemetryHandlers.test.ts`: valid event forwarded, out-of-catalog surface/action/dialog dropped, free-string smuggling dropped, no response ever posted.
- [x] T018 [US4] Create `webview-ui/src/utils/telemetry.ts` exporting `trackUi(event: UiTelemetryEvent): void` — synchronous fire-and-forget post through `rpcClient` (add a `post`-style send-without-response helper to `webview-ui/src/rpc/rpcClient.ts` if one doesn't exist), wrapped in try/catch that swallows everything; must add zero work beyond one postMessage per tracked click.
- [x] T019 [US4] Finalize the `UiAction` + `DialogId` + `UiSurface` literal unions in `shared/telemetry.ts` by walking the actual components (`webview-ui/src/components/*ContextMenu.tsx`, `ToolbarIconButton.tsx`/`ControlBar.tsx`, all `*Dialog.tsx`, `TogglePanel.tsx`, `CommitTableHeader.tsx` column menu) so every tracked control has a literal id; update `shared/telemetry.test.ts` fixtures accordingly.
- [x] T020 [P] [US4] Instrument toolbar: `webview-ui/src/components/ToolbarIconButton.tsx` (or its call sites in `ControlBar.tsx`) → `trackUi({ kind:'uiInteraction', surface:'toolbar', action:<buttonId> })` on click; toolbar right-click menu items → `surface:'toolbarContextMenu'`.
- [x] T021 [P] [US4] Instrument context menus: add the `trackUi` call at the shared menu-item click seam (prefer one helper in shared menu code or a small wrapper used by `LazyContextMenu.tsx` consumers rather than 10 copy-pastes) covering commit/branch/tag/stash/author/date/uncommitted/remote-branch/worktree menus with their `surface` values.
- [x] T022 [P] [US4] Instrument dialogs: every operation dialog (`*Dialog.tsx`, ~20) reports `trackUi({ kind:'dialogOutcome', dialog:<DialogId>, outcome:'confirmed'|'cancelled' })` at its confirm/cancel seam — prefer a single shared hook/helper (DRY) if the dialogs share a footer/confirm pattern; cancel includes ESC/overlay dismissal where the component can observe it.
- [x] T023 [P] [US4] Instrument panel toggles and column show/hide: `webview-ui/src/components/TogglePanel.tsx` (`surface:'panelToggle'`, action `panelOpen`/`panelClose` with panel id in the action literal, e.g. `'filterOpen'`) and the column visibility menu in `CommitTableHeader.tsx` (`surface:'columnHeader'`, `columnShow`/`columnHide` variants).

**Checkpoint**: UI usage measurable; nothing outside the closed catalog can leave the webview.

---

## Phase 7: User Story 5 — Configuration & Health Signals (Priority: P3)

**Goal**: Once-per-session `settingsSnapshot`; `perf` events for initial load (backend) and topology (webview) with bucketed commit counts.

**Independent Test**: quickstart.md — activation logs one `settingsSnapshot` with option enums + `batchCommitSize`/`overScan`; first graph load logs `perf kind:initialLoad` and `perf kind:topology` with `commitCountBucket` (never an exact count); repeat loads in the same session add no new snapshot.

- [x] T024 [US5] Send `settingsSnapshot` from `src/ExtensionController.ts` right after the `activate` event: properties from `readUserSettings()` (`dateFormat`, `avatarsEnabled`, `showTags`, `showRemoteBranches`, `toolbarShowLabels`, `toolbarShowRemoteButton`) plus `statusBarText` config and, when available from `PersistedUIStateStore`, `viewMode` + `signatureColumnVisible`; measurements `batchCommitSize`, `overScan`. All boolean/enum values stringified to the closed literals from data-model.md.
- [x] T025 [US5] Send `perf` (kind `initialLoad`) from `src/webview/RepoDataLoader.ts`: time the initial-data load once per session (one-shot flag), `commitCountBucket = toCommitCountBucket(commits.length)`, via `context/provider` access to `TelemetryService.sendPerfInitialLoad` (the backend-only convenience wrapper for this event; webview-measured perf rides `trackUi`).
- [x] T026 [US5] Send `perf` (kind `topology`) from the webview: measure the `graphTopology` computation for the initial load only (module-scope one-shot flag near its call site in `webview-ui/src/stores/graphStore.ts` or `GraphContainer.tsx` — wherever topology is invoked), then `trackUi({ kind:'perf', perfKind:'topology', durationMs, commitCountBucket: toCommitCountBucket(commitCount) })`; measurement must wrap the existing computation without adding work to re-renders.

**Checkpoint**: All five stories complete; full catalog live.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T027 [P] Create `telemetry.json` at the repository root mirroring contracts §D 1:1 (every event, property, measurement) so `code --telemetry` surfaces the events (FR-018).
- [x] T028 [P] Write `docs/telemetry.md` (full disclosure: what we collect — the contracts §D table in prose, what we NEVER collect — spec FR-005 list, how to opt out — both settings) and add a short "Telemetry" section to `README.md` linking it (FR-018).
- [x] T029 Run and fix until green: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` (constitution build gates). Also run `pnpm build:prod` WITHOUT a `.env` and verify it succeeds with an empty define (FR-019 safe default).
- [ ] T030 (CLI-verifiable parts DONE 2026-07-06: build matrix verified — dev/test builds define an empty connection string; `pnpm build:prod` without `.env` succeeds and embeds `''` (no-op, FR-019); no-op status-line + gate behavior covered by unit tests; TelemetryService calls no notification/status-bar API; chatty paths verified untracked by unit tests. REMAINING: in-editor steps below need a human + VS Code.) Manual smoke test per quickstart.md verification walkthrough §1 and §5–7 (F5 no-op status line; no telemetry UI anywhere; chatty paths produce no events) **plus SC-004 perf check**: load the generated `test-repo/` graph with the telemetry build and compare initial-load feel/timing against the current release (must be indistinguishable within normal run-to-run variance — use the `perf` event's own `durationMs` in the output channel as the measurement). Production-vsix steps (§2–4) require the maintainer's `.env` — list them as follow-up for the maintainer if no `.env` is present.

---

## Dependencies & Execution Order

```text
Phase 1 (T001 install gate, T002 build)
  → Phase 2 (T003 → T004; T003 → T005 → T006; T005 → T007)   [foundational, blocking]
    → Phase 3 US1 (T008 → T009; T010 needs T007)              [MVP]
    → Phase 4 US2 (T011 ∥ T012)                               [needs T005 only]
    → Phase 5 US3 (T013, T014)                                [needs T007]
    → Phase 6 US4 (T015 → T016 → T017; T015 → T018; T003 → T019 → T020 ∥ T021 ∥ T022 ∥ T023)
    → Phase 7 US5 (T024 needs T007; T025 needs T007; T026 needs T018)
  → Phase 8 (T027 ∥ T028 after catalog final [T019]; T029, T030 last)
```

- **Story independence**: US1, US2, US3 are mutually independent once Phase 2 lands. US4 is self-contained (adds its own RPC). US5's T026 depends on US4's T018 (shared webview send helper) — the only cross-story edge.
- **Parallel opportunities**: T002∥T001; T004∥T005; T006∥T007; T009∥T010; T020–T023 all parallel (different components); T027∥T028.

## Implementation Strategy

**MVP first**: Phases 1–3 (T001–T010) deliver the core value — operation usage + wild-error visibility with privacy guarantees — verifiable entirely through the output channel in a packaged build. **Ship-safe gate**: do not publish before Phase 4 (consent setting) is also done; US1+US2 together are the minimum publishable increment. Then US3 (nearly free), US4 (largest surface, all parallelizable), US5, polish.

**Task counts**: Setup 2, Foundational 5, US1 3, US2 2, US3 2, US4 9, US5 3, Polish 4 — **30 total**.
