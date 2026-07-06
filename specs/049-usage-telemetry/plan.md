# Implementation Plan: Anonymous Usage Statistics Collection

**Branch**: `049-usage-telemetry` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/049-usage-telemetry/spec.md` (idea/investigation doc: [049-statistic-collection-idea.md](./049-statistic-collection-idea.md))

## Summary

Add anonymous, aggregate-only usage telemetry with three hard constraints: zero confidential data, zero performance impact, invisible to the user. All events flow through one funnel — a new `TelemetryService` in the extension host wrapping Microsoft's official `@vscode/extension-telemetry` reporter (Azure Application Insights backend). Git-operation usage is captured by a single middleware wrap in `WebviewMessageRouter` (allowlisted operations only); UI-only interactions arrive via one new fire-and-forget RPC (`trackUiEvent`) whose payload is a closed discriminated union defined in `shared/telemetry.ts`. Consent = VS Code's global telemetry level (handled inside the reporter) AND a new `speedyGit.telemetry.enabled` setting (default on). Dev/test/F5 builds are structurally no-op: the App Insights connection string is injected only on `--production` esbuild builds from a gitignored `.env`. A dedicated "Speedy Git Telemetry" output channel logs every sent event as passive transparency.

## Technical Context

**Language/Version**: TypeScript 5.x (strict: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: `@vscode/extension-telemetry` ^1.5.2 (new — **manual install**: `pnpm add @vscode/extension-telemetry`); VS Code Extension API ^1.85.0 (package requires ≥1.75 ✓); React 18 + Zustand (webview, existing)
**Storage**: None. Telemetry is stateless; events go to Azure Application Insights (maintainer-owned resource, out of scope). Connection string lives in a local gitignored `.env`, injected via esbuild `define` on production builds only.
**Testing**: Vitest (unit: shared catalog validation, TelemetryService gating/no-op behavior, router middleware outcome capture)
**Target Platform**: VS Code desktop + forks (Cursor, Windsurf, VSCodium) ≥1.85; extension host Node 18 (esbuild CJS target)
**Project Type**: VS Code extension — dual process (Node extension host + React webview via message passing)
**Performance Goals**: Zero measurable overhead on any user path. No synchronous telemetry work in render loops, RPC handlers, or activation. Fire-and-forget everywhere; the reporter batches internally.
**Constraints**: No PII (structural enforcement via closed types + funnel re-validation); silent (no UI, output log only); webview CSP stays strict (no network from webview); no-op in dev/test/F5 and when connection string absent; extension setting can only further restrict the global telemetry level.
**Scale/Scope**: Small install base; no high-frequency events by design → App Insights free tier (~5 GB/mo) is ample. ~131 RPC types funnel through one middleware; UI allowlist = all context-menu items + toolbar buttons + dialog confirm/cancel + panel toggles + column show/hide.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Performance First | ✅ PASS | Fire-and-forget only; no hot-path instrumentation (scroll/hover/keystroke/auto-refresh excluded by spec FR-002/FR-007); no-op object in dev; reporter batches sends off the critical path. |
| II. Clean Code & Simplicity | ✅ PASS | One funnel (`TelemetryService`), one middleware wrap point, one shared vocabulary module. No per-handler instrumentation code. YAGNI respected: no sampling config, no custom endpoint, no retry logic (reporter owns transport). |
| III. Type Safety & Explicit Error Handling | ✅ PASS (with note) | Event names/properties are closed unions in `shared/telemetry.ts` (single source of truth for the cross-boundary contract, per constitution). The new RPC is added to `shared/messages.ts` + `REQUEST_TYPES`. *Note*: telemetry methods return `void`, not `Result` — telemetry is fail-silent by spec (FR-016); there is no caller that could act on an error, so surfacing one would violate YAGNI and the spec. `GitErrorCode` (the enum only) is the sole error detail ever transmitted. |
| IV. Library-First | ✅ PASS | Official Microsoft package, actively maintained, TS types included. Agent MUST NOT install — install command provided to developer. `.env` loading uses Node's built-in `process.loadEnvFile()` (Node ≥20.12; local toolchain is Node 24) — no extra dependency. |
| V. Dual-Process Integrity | ✅ PASS | Webview never talks to App Insights (CSP untouched). All egress from extension host. Cross-boundary contract lives in `shared/telemetry.ts` + `shared/messages.ts` only. |
| Agent Restrictions | ✅ PASS | No package auto-install; no git write operations. |

**Post-Phase-1 re-check**: ✅ PASS — design artifacts introduce no new violations (no new projects, no new dependencies beyond the one flagged, no webview network access).

## Project Structure

### Documentation (this feature)

```text
specs/049-usage-telemetry/
├── spec.md                          # Feature specification (done)
├── 049-statistic-collection-idea.md # Original idea/investigation input
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output (event catalog, entities)
├── quickstart.md                    # Phase 1 output (setup + verification walkthrough)
├── contracts/
│   └── telemetry-events.md          # Phase 1 output (event/RPC contract)
└── tasks.md                         # Phase 2 output (/speckit-tasks — NOT created by plan)
```

### Source Code (repository root)

```text
shared/
├── telemetry.ts                     # NEW — closed vocabulary: event unions, UiTelemetryEvent,
│                                    #   TRACKED_OPERATIONS allowlist, buckets, validation helper
├── messages.ts                      # MODIFIED — add `trackUiEvent` RequestMessage + REQUEST_TYPES entry
└── errors.ts                        # UNCHANGED — GitErrorCode is the only error detail sent

src/
├── extension.ts                     # MODIFIED — construct TelemetryService, activation timing start
├── ExtensionController.ts           # MODIFIED — own/dispose TelemetryService; send activate +
│                                    #   settingsSnapshot events after activation
├── services/
│   └── TelemetryService.ts          # NEW — funnel: wraps TelemetryReporter; consent gate
│                                    #   (extension setting, live); appName/appHost/uiKind common props;
│                                    #   typed send methods; output-channel logging; no-op mode
└── webview/
    ├── WebviewMessageRouter.ts      # MODIFIED — middleware: time dispatch, capture outcome for
    │                                #   allowlisted ops via per-dispatch context wrapper
    ├── WebviewRequestContext.ts     # MODIFIED — expose `telemetry` accessor to handlers/router
    ├── WebviewProvider.ts           # MODIFIED — plumb TelemetryService into the request context;
    │                                #   panelOpened event
    └── handlers/
        └── telemetryHandlers.ts     # NEW — trackUiEvent handler: re-validate against catalog, forward

webview-ui/src/
├── rpc/rpcClient.ts                 # MODIFIED — fire-and-forget `trackUiEvent` send helper
├── utils/telemetry.ts               # NEW — thin `trackUi(event)` wrapper used by components
└── components/                      # MODIFIED (instrumentation only, in click handlers):
    ├── ToolbarIconButton.tsx        #   toolbar button clicks (+ right-click menu items)
    ├── *ContextMenu.tsx             #   context-menu item clicks (via shared helper)
    ├── *Dialog.tsx                  #   dialog confirmed/cancelled
    ├── TogglePanel.tsx              #   panel open/close
    └── CommitTableHeader.tsx        #   column show/hide

esbuild.config.mjs                   # MODIFIED — on --production: process.loadEnvFile('.env') (if present),
                                     #   define SPEEDYGIT_TELEMETRY_CONNECTION_STRING (empty otherwise)
package.json                         # MODIFIED — speedyGit.telemetry.enabled setting (tags: telemetry,
                                     #   usesOnlineServices); dependency @vscode/extension-telemetry
telemetry.json                       # NEW — machine-readable event manifest (`code --telemetry` dump)
README.md                            # MODIFIED — "Telemetry" section (what/never/opt-out)
docs/telemetry.md                    # NEW — full disclosure doc linked from README + setting description
.env                                 # NEW, local only — already covered by `.env*` in .gitignore ✓
```

**Structure Decision**: Existing dual-process layout is reused as-is. The only new backend service is `TelemetryService` (in `src/services/`, constructed in `extension.ts`/`ExtensionController`, disposed via `context.subscriptions`). The only new cross-boundary contract surface is `shared/telemetry.ts` plus one `RequestMessage` variant. Webview changes are instrumentation-only calls inside existing click handlers.

## Design Decisions (summary — full rationale in research.md)

1. **One funnel**: `TelemetryService` interface with two implementations — real (reporter present + production mode) and no-op. Call sites never null-check (FR-015).
2. **Operation telemetry via router middleware**: `WebviewMessageRouter.dispatch` wraps the handler call for allowlisted `message.type`s with a per-dispatch context whose `postMessage` observes `error` responses (handlers post errors; they don't throw). Duration = dispatch start→settle. Outcome + `GitErrorCode` extracted from the posted `GitError` payload only.
3. **UI events via one RPC**: `trackUiEvent` payload is `UiTelemetryEvent` (discriminated union: `uiInteraction` | `dialogOutcome` | `perf`). Handler re-validates every field against the closed catalog before forwarding (never trust webview input). No response message ever.
4. **Consent**: reporter internally honors `telemetry.telemetryLevel` / `isTelemetryEnabled` (incl. live changes). `speedyGit.telemetry.enabled` is checked in `TelemetryService` before every send, read live via `onDidChangeConfiguration` — both gates must pass (FR-004).
5. **Connection string**: gitignored `.env` → esbuild `define` on `--production` only → `process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING` literal in bundle. Absent/dev ⇒ empty string ⇒ no-op service. Also gated on `context.extensionMode === Production` so F5 sessions never report (FR-015).
6. **Transparency**: "Speedy Git Telemetry" `LogOutputChannel` — one activation status line (enabled/disabled + why) + one line per sent event (name + properties). Never auto-shown (FR-008a). `telemetry.json` manifest at extension root; README section + `docs/telemetry.md`.
7. **`panelOpened` trigger granularity**: `command` | `scmButton`. Keybinding/status-bar/palette all execute `speedyGit.showGraph` and are not distinguishable without new plumbing — collapsed into `command` (documented deviation from the idea doc's 4-value enum; YAGNI).
8. **Buckets**: commit counts reported as `'≤500' | '501-1000' | '1001-5000' | '5001-10000' | '>10000'` (FR-013).

## Complexity Tracking

> No constitution violations — table intentionally empty.
