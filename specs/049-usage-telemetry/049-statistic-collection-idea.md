# Usage statistics collection idea spec

> Idea input for the SpecKit full workflow. Captures the motivation, the
> technical investigation of `@vscode/extension-telemetry`, the proposed
> architecture, and the privacy contract. Intentionally light on
> implementation detail — not a final spec.

## Origin / motivation

We have no visibility into how Speedy Git is actually used. We want anonymous
usage statistics to answer questions like:

- What OS / IDE (VS Code, Cursor, Windsurf, VSCodium, …) do our users run?
- Which features are actually used, and how often? (menus, buttons, dialogs,
  git operations — e.g. "how frequently is *Interactive Rebase* used vs
  *Cherry-pick*?")
- Which errors do users hit in the wild (by error code, not message)?
- Basic health/performance signals (load times, repo-size buckets).

**Hard constraint 1: zero confidential data.** No repo names, no branch names, no
commit content, no file paths, no user identity. Only anonymous, aggregate-able
statistics of the kind the official package and VS Code guidelines explicitly
allow.

**Hard constraint 2: zero performance impact.** Telemetry must never affect how the
app performs or feels. No measurable CPU, memory, or main-thread cost on any user
path; no synchronous work in render loops, RPC handlers, or activation. All
collection and sending is fire-and-forget and happens off the critical path — the
user must never wait on, or notice, telemetry. If instrumenting something would add
cost to a hot path (scroll, hover, keystroke, auto-refresh), don't instrument it.

**Hard constraint 3: invisible to the user.** Telemetry must be completely silent.
No notifications, dialogs, prompts, warnings, info messages or status-bar text visible to the user — ever, only output log is allowed. We never ask for consent or agreement: if a
mechanism *requires* the user to agree, approve, or acknowledge anything, we do not
build it. (We still honor VS Code's global `telemetry.telemetryLevel` — that's the
user's existing choice, requiring no new prompt from us.) Transparency is provided
passively, through written disclosure only: a clear statement — in the README,
`LICENSE.md`, or a dedicated telemetry doc — of exactly what we collect, why, and
that no confidential or personal user data is ever gathered.

## Technical investigation (confirmed facts)

### The package: `@vscode/extension-telemetry`

- Latest version **1.5.2** (npm, checked 2026-07). Microsoft's official module,
  the one VS Code's extension-telemetry guide recommends. Requires VS Code
  1.75+ — our engine floor is `^1.85.0`, so we're fine.
- **Backend is Azure Application Insights** (Azure Monitor) — this is the
  default and only first-class endpoint. The constructor takes an App Insights
  **connection string**:

  ```ts
  import TelemetryReporter from '@vscode/extension-telemetry';

  const reporter = new TelemetryReporter(connectionString);
  context.subscriptions.push(reporter); // dispose() flushes pending events
  ```

- API surface we'd use:
  - `sendTelemetryEvent(name, properties?, measurements?)` — string properties
    + numeric measurements.
  - `sendTelemetryErrorEvent(name, properties?, measurements?)` — same, but
    also emitted at the `error` telemetry level and auto-scrubs
    stack-trace-like values.
  - `dispose()` — flush on deactivate (handled via `context.subscriptions`).
  - `sendDangerousTelemetryEvent` exists (bypasses user settings) — we will
    **never** use it.
- **User consent is handled for us.** The reporter internally honors
  `telemetry.telemetryLevel` / `vscode.env.isTelemetryEnabled` and reacts to
  `onDidChangeTelemetryEnabled`. When the user sets telemetry to `off`,
  nothing is sent; at `error`/`crash` levels only error events are sent;
  usage events go out only at `all`. We write zero consent-plumbing code.
- **Common properties are automatic.** Every event is enriched with:
  extension name + version, VS Code version, OS + platform version, node
  arch, UI kind (desktop/web), remote name (wsl/ssh/devcontainer),
  anonymized `machineId` (random GUID — enables "distinct users" counts, not
  identity), and session ID. This alone answers the "what OS" question.
- **The connection string is not a secret, but we still keep it out of the repo.**
  App Insights ingestion keys are client-side by design (same model as VS Code
  itself and every MS extension) — Microsoft's docs say they need no special
  handling, and the value is anyway extractable from any shipped `.vsix` (just a
  zip). So this is not confidentiality; it's *misuse-friction* for a public repo:
  keeping the string off GitHub removes the casual copy-paste vector, nothing more.
  The **real** safeguard against abuse (data pollution / bill inflation) is an
  Azure-side **daily ingestion cap**, not where the string lives.
- **How we store and inject it (decided).** The string lives in a **local,
  gitignored `.env`** file — never committed. `esbuild.config.mjs` injects it via a
  build-time `define`, **only on `--production` builds**:
  - dev / watch / tests → the `define` is an empty string ⇒ `TelemetryService` is a
    no-op (telemetry disabled while hacking).
  - `--production` → the config loads `.env` (e.g. `process.loadEnvFile('.env')` on
    Node 20.12+, or the `dotenv` package) and defines
    `SPEEDYGIT_TELEMETRY_CONNECTION_STRING`. If `.env` is absent, the value stays
    empty and the extension simply ships with telemetry off (safe default).
  - Publishing is local (`pnpm ext:publish`), not CI, so no GitHub/CI secret is
    involved. `vsce`/`ovsx` both run `vscode:prepublish` → `build:prod`
    (`--production`), so every packaged/published artifact embeds the string.

### IDE detection (the Cursor/fork question)

The package's common properties identify VS Code *version* but not the fork.
One extra common property closes the gap:

- `vscode.env.appName` → `"Visual Studio Code"`, `"Cursor"`, `"Windsurf"`,
  `"VSCodium"`, …
- `vscode.env.appHost` (`desktop` / web host) and `vscode.env.uiKind` round it
  out.

These are appended by our wrapper service to every event (or sent once per
session in an `activate` event — decide in planning; per-event is simpler to
query).

### Why the webview never talks to App Insights directly

All telemetry goes out from the **extension host**, never from the React
webview. Reasons: the webview CSP would have to be loosened to allow the
ingestion endpoint (bad); the reporter needs the VS Code API for consent
state; and one funnel = one place to enforce the privacy contract.

## Proposed architecture

```
webview (React)                    extension host                     Azure
┌───────────────────┐   RPC   ┌──────────────────────┐   HTTPS  ┌──────────────┐
│ UI interactions ──┼────────►│ WebviewMessageRouter │          │ Application  │
│ (trackUiEvent,    │         │   │ (op middleware)  │          │  Insights    │
│  fire-and-forget) │         │   ▼                  │          │ (customEvents│
└───────────────────┘         │ TelemetryService ────┼─────────►│  table, KQL) │
                              │  (wraps Reporter,    │          └──────────────┘
                              │   allowlist + gate)  │
                              └──────────────────────┘
```

Two instrumentation surfaces, one funnel:

1. **`src/services/TelemetryService.ts`** (new) — thin wrapper around
   `TelemetryReporter`, owned by `ExtensionController`, disposed via
   `context.subscriptions`. Responsibilities:
   - Construct the reporter only when a connection string is present **and**
     `context.extensionMode === ExtensionMode.Production` (keeps dev/F5
     sessions out of the stats). Otherwise it's a no-op object — call sites
     never null-check.
   - Append our extra common properties (`appName`, `appHost`, `uiKind`).
   - Expose a **typed, closed API**: event names and property values are
     TypeScript union types / enums, not free strings. This makes "no PII"
     structurally enforceable — you *can't* pass a branch name because the
     parameter type won't take arbitrary strings; numbers go in measurements.

2. **Git-operation usage — one middleware in `WebviewMessageRouter`.** Every
   feature action already flows through the router's typed dispatch map, so a
   single wrap point yields, for *all ~131 RPC types* with zero per-handler
   code:
   - `operation` (the RPC `type` string — a closed set by construction),
   - outcome (`success` / `error` + `GitErrorCode` — the enum only, never the
     message), and
   - duration (ms, as a measurement).
   High-frequency read RPCs (`getCommits`, `loadMore`, `getCommitDetails`,
   avatar lookups, signature batches, …) are **excluded via an allowlist** —
   we track *user-initiated actions*, not chatty data fetches.

3. **UI-only interactions — one new fire-and-forget RPC** (`trackUiEvent`) in
   `shared/messages.ts`, for things that never reach a backend handler:
   context-menu opens, dialog confirm/cancel, toolbar button clicks, panel
   toggles, column show/hide. Payload is `{ event: UiTelemetryEvent }` where
   `UiTelemetryEvent` is a shared discriminated union — the router forwards it
   to `TelemetryService`, which re-validates against the allowlist (never
   trust webview input verbatim). No response message; it must never block UI.

## What to collect (event catalog, first cut)

| Event | Properties (all closed enums) | Measurements |
|---|---|---|
| `activate` | appName, appHost, uiKind, hasMultiRoot (bool) | activationMs, repoCount |
| `panelOpened` | trigger (`command` / `scmButton` / `statusBar` / `keybinding`) | — |
| `operation` | operation (RPC type), outcome (`success`/`error`), errorCode (GitErrorCode, on error only) | durationMs |
| `uiInteraction` | surface (`commitMenu`/`branchMenu`/`stashMenu`/`toolbar`/…), action (item id from a fixed set) | — |
| `dialogOutcome` | dialog (`merge`/`push`/`rebase`/`cherryPick`/`createTag`/…), outcome (`confirmed`/`cancelled`) | — |
| `settingsSnapshot` (once per session) | dateFormat, avatarsEnabled, showTags, showRemoteBranches, toolbarLabels, statusBarText, viewMode, signatureColumnVisible | batchCommitSize, overScan |
| `perf` (sampled, once per load) | kind (`initialLoad` / `topology`) | durationMs, commitCountBucket |
| `error` (sendTelemetryErrorEvent) | area (service name), errorCode | — |

Notes:

- **Counts, not content.** `repoCount` and `commitCountBucket` are numbers/
  buckets — never names. Buckets (e.g. commit count 500/1k/5k/10k+) avoid
  even theoretical fingerprinting via exact values.
- **No high-frequency events.** Nothing on scroll, hover, keystroke, row
  selection, or auto-refresh ticks. The reporter batches internally, but the
  cheapest event is the one never sent — and it keeps App Insights inside the
  free tier (~5 GB/month) indefinitely at our scale.
- The `settingsSnapshot` tells us which options are worth keeping/promoting
  (e.g. does anyone use `custom` date format?).

## What we will NEVER collect (privacy contract)

- Repo names, paths, or remote URLs; workspace folder names
- Branch / tag / stash / worktree names; commit hashes, messages, or diffs
- Author names, emails, avatars; git config values
- File paths or file names of any kind
- Raw git stderr/stdout or exception messages (may embed paths/branch names —
  only our own `GitErrorCode` enum values are sent)
- Search text, filter text, dates entered in filters
- Anything typed by the user into any input

Enforcement is **structural** (typed closed API + allowlist re-validation at
the funnel), not reviewer-vigilance.

## Consent & transparency plan

- **Global setting respected automatically** by the package
  (`telemetry.telemetryLevel`, `isTelemetryEnabled`) — mandatory baseline.
- **Extension-level opt-out**: add `speedyGit.telemetry.enabled` (default
  `true`), tagged with `telemetry` and `usesOnlineServices` so it surfaces in
  VS Code's `@tag:telemetry` settings view. Our setting can only *further
  restrict* — if the global level says no, nothing is sent regardless.
- **`telemetry.json`** in the extension root listing every event + property,
  so `code --telemetry` shows our events in the transparency dump.
- **README/marketplace section** ("Telemetry"): what we collect, what we
  never collect, how to opt out. Cheap to write — we already have the two
  lists above.

## Azure side (user-managed, out of implementation scope)

- One workspace-based **Application Insights** resource; copy its
  **connection string** (not just the legacy instrumentation key) into the
  build. Events land in the `customEvents` table with our properties under
  `customDimensions`; query with KQL, chart with Workbooks/Dashboards.
- Useful starter queries: distinct users by `common.vscodemachineid`, OS/IDE
  split, top operations, error-code frequency, feature funnel
  (panelOpened → operation).
- No server code, no auth, no sampling config needed at our volume.

## Design principles

- **Performance first, as always.** Telemetry must be fire-and-forget on both
  sides: no awaits in UI paths, no extra work in render loops, excluded from
  chatty RPCs. A no-op service in dev means zero overhead while hacking.
- **One funnel.** Every event passes through `TelemetryService`; the webview
  posts intents, it never sends network traffic (CSP stays strict).
- **Closed vocabulary.** Event names and property values are enums in shared
  types. Adding a new tracked action = extending a union type, which makes
  telemetry additions reviewable in the diff.
- **Fail silent.** Telemetry errors must never surface to the user or affect
  any operation.

## Out of scope

- Any custom/self-hosted collection endpoint (App Insights only).
- Crash/stack-trace reporting, session replay, A/B testing, remote config.
- Collecting anything typed by the user, ever.
- Webview-direct telemetry (would require CSP loosening).
- Azure resource provisioning / dashboard building (owner handles separately;
  implementation just needs the connection string).

## Relevant existing code

- `src/extension.ts` / `src/ExtensionController.ts` — activation; where
  `TelemetryService` is constructed, injected, and disposed.
- `src/webview/WebviewMessageRouter.ts` — the single dispatch point to wrap
  for operation success/error/duration telemetry.
- `src/webview/WebviewRequestContext.ts` — how the router/handlers would see
  the telemetry service (if handler-level events are ever needed).
- `shared/messages.ts` — add the `trackUiEvent` request type (+ shared
  `UiTelemetryEvent` union, probably in `shared/telemetry.ts`).
- `shared/errors.ts` — `GitErrorCode` enum, the only error detail ever sent.
- `webview-ui/src/rpc/rpcClient.ts` — add the fire-and-forget `trackUiEvent`
  send helper used by menus/dialogs/toolbar.
- `esbuild.config.mjs` — load the gitignored `.env` on `--production` only and
  inject the connection string via a build-time `define`; empty string in
  dev/watch/tests (⇒ no-op telemetry) and when `.env` is absent.
- `.env` (new, **gitignored**) — holds `SPEEDYGIT_TELEMETRY_CONNECTION_STRING`;
  never committed. Add the entry to `.gitignore`.
- `package.json` — new `speedyGit.telemetry.enabled` setting; dependency on
  `@vscode/extension-telemetry` (^1.5.2). **Install manually:**
  `pnpm add @vscode/extension-telemetry`. (Publish is local via `pnpm
  ext:publish`; `vsce`/`ovsx` both trigger `vscode:prepublish` → `build:prod`, so
  published artifacts are always production builds that embed the string.)

## Open questions for /speckit-clarify

1. Which UI interactions make the first-cut allowlist? (Proposal: every
   context-menu item + toolbar button + dialog confirm/cancel; nothing else.)
2. Should `settingsSnapshot` fire on every activation or only when settings
   changed since last snapshot?
3. ~~How to ship the connection string?~~ **Decided:** local gitignored `.env`
   → esbuild `define` on `--production` only → empty (no-op) in dev/tests and when
   absent. Not confidentiality (it's extractable from the `.vsix`); the Azure daily
   ingestion cap is the real abuse safeguard. See *The connection string* note above.
4. Do we want a one-time, non-blocking "this extension collects anonymous
   usage data — see README, opt out here" notification on first activation?
   (Not required by policy since we honor the global setting, but good will.)
