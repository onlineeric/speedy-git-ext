# Contracts: Telemetry Events & RPC

**Feature**: 049-usage-telemetry | **Date**: 2026-07-06

Three contract surfaces: (A) the webview→extension RPC, (B) the `TelemetryService` API, (C) the outbound event schema (what lands in Application Insights `customEvents`).

## A. RPC contract — `trackUiEvent` (new `RequestMessage` variant)

```ts
// shared/messages.ts (addition)
| { type: 'trackUiEvent'; payload: { event: UiTelemetryEvent } }
```

- **Direction**: webview → extension only. **No response message of any kind** — fire-and-forget by contract; the webview must not await it and the handler must not `postMessage`.
- **Registration**: added to the `RequestMessage` union AND `REQUEST_TYPES` map (compile-time exhaustiveness); handler registered in `requestHandlers` via new `telemetryHandlers.ts` (missing handler = compile error, per router convention).
- **Handler behavior** (`telemetryHandlers.ts`):
  1. `isValidUiTelemetryEvent(payload.event)` — runtime re-validation against closed sets (never trust webview input).
  2. Valid → forward to `context.telemetry` (`trackUi(event)`). Invalid → drop silently.
  3. Never throws; never posts; resolves immediately (telemetry send is fire-and-forget inside the service).
- **Exclusions**: `trackUiEvent` itself is NOT in `TRACKED_OPERATIONS` (no operation event for telemetry traffic).
- **Webview send helper** (`webview-ui/src/utils/telemetry.ts`):

```ts
export function trackUi(event: UiTelemetryEvent): void; // posts via rpcClient, returns immediately, swallows all errors
```

## B. `TelemetryService` contract (`src/services/TelemetryService.ts`)

```ts
export interface TelemetryService extends vscode.Disposable {
  /** Once per session; no-ops on repeat calls. */
  sendActivate(measurements: { activationMs: number; repoCount: number }, hasMultiRoot: boolean): void;
  /** Once per session; no-ops on repeat calls. */
  sendSettingsSnapshot(snapshot: SettingsSnapshotProperties, measurements: { batchCommitSize: number; overScan: number }): void;
  sendPanelOpened(trigger: 'command' | 'scmButton'): void;
  /** Called only by the router middleware. */
  sendOperation(operation: TrackedOperation, outcome: 'success' | 'error', durationMs: number, errorCode?: GitErrorCode): void;
  /** Called only by telemetryHandlers after validation. */
  trackUi(event: UiTelemetryEvent): void;
  sendPerfInitialLoad(durationMs: number, commitCountBucket: CommitCountBucket): void;
  /** sendTelemetryErrorEvent path; untracked-path failures only. */
  sendError(area: ErrorArea, errorCode: GitErrorCode): void;
  dispose(): void; // flushes reporter (context.subscriptions)
}

export function createTelemetryService(
  context: vscode.ExtensionContext,
  connectionString: string, // '' ⇒ no-op implementation
): TelemetryService;
```

**Guarantees (all implementations)**:

- Every method returns `void`, never throws, never awaits anything on the caller's path (FR-007/FR-016).
- No-op returned when `connectionString === ''` or `context.extensionMode !== ExtensionMode.Production` (FR-015). **Both implementations** lazily create the 'Speedy Git Telemetry' output channel and log exactly one gate-status line on construction (`enabled` / `disabled (reason: no connection string | dev mode | extension setting | global setting)`) — FR-008a applies in every mode; the no-op logs nothing further.
- Real implementation: checks cached `speedyGit.telemetry.enabled` before each send (FR-004, live via config listener); appends `common.appName/appHost/uiKind` to every event (FR-011); logs each sent event to the output channel and a new status line whenever a gate changes (FR-008a); property values are typed as the closed unions — the signature does not accept `string` (FR-006).
- `trackUi(event)` accepts the full `UiTelemetryEvent` union and maps internally: `kind:'uiInteraction'` → `uiInteraction` event, `kind:'dialogOutcome'` → `dialogOutcome` event, `kind:'perf'` → `perf` event. `sendPerfInitialLoad` is the backend-only convenience for the `initialLoad` perf kind (webview-measured perf always arrives through `trackUi`).

**Wiring**:

- Constructed in `extension.ts` `activate()` from the esbuild-defined constant; pushed to `context.subscriptions`; passed into `ExtensionController` → `WebviewProvider` → exposed on `WebviewRequestContext` as `readonly telemetry: TelemetryService`.

## C. Router middleware contract (`WebviewMessageRouter.dispatch`)

```text
dispatch(message):
  if message.type ∉ TRACKED_OPERATIONS → invoke handler unchanged (zero added work)
  else:
    start = performance.now()
    outcome = 'success'; errorCode = undefined
    wrappedContext = { ...context, postMessage(m) {
        if m.type === 'error':            outcome='error'; errorCode = extractGitCode(m.payload.error)
        forward to real postMessage(m)
    }}
    try { await handler(message, wrappedContext) }
    catch (e) { outcome='error'; errorCode='UNKNOWN'; rethrow after finally }
    finally { telemetry.sendOperation(message.type, outcome, now()-start, errorCode) }
```

- `extractGitCode`: returns `payload.error.code` when it is a valid `GitErrorCode` literal, else `'UNKNOWN'`. Never reads `.message`/`.stderr`/`.command`.
- Domain "needs-force/needs-stash" interim responses (`checkoutNeedsStash`, `deleteBranchNeedsForce`, `checkoutCommitNeedsStash`, `checkoutPullFailed`) count as `success` for the initial operation (the user gets a follow-up dialog; the follow-up RPC is tracked separately).
- Concurrency-safe: wrapper state is per-dispatch (closure), not shared.

## D. Outbound event schema (Application Insights `customEvents`)

Event name format: `onlineeric.speedy-git-ext/<eventName>` (reporter prefixes automatically). `customDimensions` carries our properties + `common.*`; `customMeasurements` carries numerics.

| name | customDimensions (ours) | customMeasurements |
|---|---|---|
| `…/activate` | hasMultiRoot, common.* | activationMs, repoCount |
| `…/panelOpened` | trigger, common.* | — |
| `…/operation` | operation, outcome, errorCode?, common.* | durationMs |
| `…/uiInteraction` | surface, action, common.* | — |
| `…/dialogOutcome` | dialog, outcome, common.* | — |
| `…/settingsSnapshot` | dateFormat, avatarsEnabled, showTags, showRemoteBranches, toolbarShowLabels, toolbarShowRemoteButton, statusBarText, viewMode?, signatureColumnVisible?, common.* | batchCommitSize, overScan |
| `…/perf` | kind, commitCountBucket, common.* | durationMs |
| `…/error` | area, errorCode, common.* | — |

This table is mirrored 1:1 by `telemetry.json` (extension root) for the `code --telemetry` transparency dump and by `docs/telemetry.md` for humans (FR-018).

## E. Configuration contract (`package.json`)

```jsonc
"speedyGit.telemetry.enabled": {
  "type": "boolean",
  "default": true,
  "tags": ["telemetry", "usesOnlineServices"],
  "markdownDescription": "Allow Speedy Git to send anonymous usage statistics (feature usage counts, error codes, performance timings — never repository names, branch names, file paths, or anything you type). **Note:** statistics are sent only when this setting and VS Code's global `#telemetry.telemetryLevel#` are both enabled — turning either off stops all collection. See [what we collect](https://github.com/onlineeric/speedy-git-ext/blob/main/docs/telemetry.md)."
}
```

(Exact prose may be polished at implementation; the dual-consent note MUST remain, in original wording — FR-004.)
