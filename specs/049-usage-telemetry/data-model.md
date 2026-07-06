# Data Model: Anonymous Usage Statistics Collection

**Feature**: 049-usage-telemetry | **Date**: 2026-07-06

All types live in **`shared/telemetry.ts`** (new) — the single source of truth for both processes (Constitution III/V). Everything below is a *closed* vocabulary: string literal unions, never `string`.

## Entities

### 1. TelemetryEventName

```
'activate' | 'panelOpened' | 'operation' | 'uiInteraction' | 'dialogOutcome'
| 'settingsSnapshot' | 'perf' | 'error'
```

### 2. Event payloads (properties = closed string literals; measurements = numbers)

| Event | Properties | Measurements | Cadence |
|---|---|---|---|
| `activate` | `hasMultiRoot: 'true'\|'false'` | `activationMs`, `repoCount` | once per session |
| `panelOpened` | `trigger: 'command'\|'scmButton'` | — | per panel creation (not reveal) |
| `operation` | `operation: TrackedOperation`, `outcome: 'success'\|'error'`, `errorCode?: GitErrorCode` (error only) | `durationMs` | per allowlisted RPC dispatch |
| `uiInteraction` | `surface: UiSurface`, `action: UiAction` | — | per tracked click |
| `dialogOutcome` | `dialog: DialogId`, `outcome: 'confirmed'\|'cancelled'` | — | per dialog close |
| `settingsSnapshot` | `dateFormat`, `avatarsEnabled`, `showTags`, `showRemoteBranches`, `toolbarShowLabels`, `toolbarShowRemoteButton`, `statusBarText`, `viewMode?`, `signatureColumnVisible?` (all as literal-string values of their existing setting enums / `'true'\|'false'`) | `batchCommitSize`, `overScan` | once per session, after `activate` |
| `perf` | `kind: 'initialLoad'\|'topology'`, `commitCountBucket: CommitCountBucket` | `durationMs` | once per initial load / topology compute |
| `error` (via `sendTelemetryErrorEvent`) | `area: ErrorArea`, `errorCode: GitErrorCode` | — | per untracked-path failure only (never for tracked-operation failures — clarification #2) |

Common properties appended by `TelemetryService` to **every** event: `common.appName`, `common.appHost`, `common.uiKind`. (Package adds extension/VS Code versions, OS, arch, anonymized machineId, session ID automatically.)

### 3. TrackedOperation (the operation allowlist)

`TRACKED_OPERATIONS: ReadonlySet<RequestMessage['type']>` — user-initiated actions only. Included:

```
checkoutBranch, checkoutCommit, stashAndCheckout, stashAndCheckoutCommit,
createBranch, renameBranch, deleteBranch, deleteRemoteBranch, mergeBranch,
fastForwardLocalBranch, push, pull, fetch,
addRemote, removeRemote, editRemote,
createTag, deleteTag, pushTag,
applyStash, popStash, dropStash, stashWithMessage, stashSelected,
resetBranch, cherryPick, abortCherryPick, continueCherryPick,
revert, continueRevert, abortRevert,
rebase, interactiveRebase, abortRebase, continueRebase, dropCommit,
updateSubmodule, initSubmodule,
addWorktree, removeWorktree, pruneWorktree, openWorktree,
stageFiles, unstageFiles, stageAll, unstageAll, discardFiles, discardAllUnstaged,
compareRefs
```

Explicitly **excluded** (chatty/read/high-frequency or trivial): `getCommits`, `getBranches`, `getCommitDetails`, `loadMoreCommits`, `refresh`, `getRemotes`, `getStashes`, `getAuthors`, `getSignatureInfo`, `detectSignaturePresence`, `verifySignatures`, `getCommitParents`, `isCommitPushed`, `getContainingBranches`, `getSettings`, `getSubmodules`, `getWorktreeList`, `resolveWorktreePath`, `getWorktreeEnvFiles`, `getUncommittedChanges`, `getConflictState`, `getRebaseCommits`, `copyToClipboard`, `openDiff`, `openFile`, `openCurrentFile`, `openStagedDiff`, `openCompareDiff`, `openExternal`, `openSettings`, `openSignatureHelp`, `openSubmodule`, `backToParentRepo`, `switchRepo`, `displayRepo`, `revealWorktree`, `setToolbarSetting`, `updatePersistedUIState`, `cancelCompare`, `trackUiEvent`.

### 4. UiTelemetryEvent (webview → backend payload, discriminated union)

```ts
type UiTelemetryEvent =
  | { kind: 'uiInteraction'; surface: UiSurface; action: UiAction }
  | { kind: 'dialogOutcome'; dialog: DialogId; outcome: 'confirmed' | 'cancelled' }
  | { kind: 'perf'; perfKind: 'topology'; durationMs: number; commitCountBucket: CommitCountBucket };
```

- **UiSurface**: `'commitMenu' | 'branchMenu' | 'tagMenu' | 'stashMenu' | 'authorMenu' | 'dateMenu' | 'uncommittedMenu' | 'remoteBranchMenu' | 'worktreeMenu' | 'toolbar' | 'toolbarContextMenu' | 'panelToggle' | 'columnHeader'`
- **UiAction**: closed union of fixed item ids (e.g. `'checkout'`, `'merge'`, `'cherryPick'`, `'interactiveRebase'`, `'copyHash'`, `'filter'`, `'search'`, `'compare'`, `'worktrees'`, `'refresh'`, `'fetch'`, `'view'`, `'remote'`, `'settings'`, `'panelOpen'`, `'panelClose'`, `'columnShow'`, `'columnHide'`, …). Final enumeration happens at implementation time by walking the existing menu/toolbar components — every value MUST be a literal in `shared/telemetry.ts`, and the runtime validator MUST reject anything outside the set.
- **DialogId**: `'merge' | 'push' | 'pull' | 'fetch' | 'rebase' | 'interactiveRebase' | 'cherryPick' | 'revert' | 'reset' | 'createBranch' | 'renameBranch' | 'deleteBranch' | 'createTag' | 'deleteTag' | 'pushTag' | 'stash' | 'applyStash' | 'dropStash' | 'addRemote' | 'editRemote' | 'removeRemote' | 'createWorktree' | 'removeWorktree' | 'dropCommit' | 'fastForward'` (extend to match the actual ~20 dialog components at implementation time; closed set).

### 5. CommitCountBucket

```
'<=500' | '501-1000' | '1001-5000' | '5001-10000' | '>10000'
```

Helper `toCommitCountBucket(n: number): CommitCountBucket` exported from `shared/telemetry.ts`.

### 6. ErrorArea

Closed union of backend service names: `'gitExecutor' | 'logService' | 'watcher' | 'repoDiscovery' | 'avatarService' | 'dataLoader' | 'stateStore' | 'other'`.

### 7. Consent State (runtime, not persisted)

| Input | Source | Live? |
|---|---|---|
| Global level | enforced inside `TelemetryReporter` | yes (package listens) |
| Extension setting `speedyGit.telemetry.enabled` | cached boolean, refreshed by `onDidChangeConfiguration` | yes |
| Build/destination gate | connection string define + `ExtensionMode.Production` | fixed per session |

Effective send = destination gate ∧ extension setting ∧ global level. First two evaluated in `TelemetryService`; third inside the reporter.

## Validation rules (runtime, at the funnel)

`isValidUiTelemetryEvent(value: unknown): value is UiTelemetryEvent` in `shared/telemetry.ts`:

1. `kind` ∈ closed set; discriminant-specific fields present with correct types.
2. Every string field checked by **set membership** against the exported literal arrays (`UI_SURFACES`, `UI_ACTIONS`, `DIALOG_IDS`, `COMMIT_COUNT_BUCKETS`) — never `typeof === 'string'` alone.
3. Numeric fields (`durationMs`) must be finite non-negative numbers; clamp to a sane ceiling (e.g. 10 min) to keep garbage out of aggregates.
4. Unknown extra keys → reject (strict shape).
5. Invalid ⇒ drop silently (optionally one debug line to the telemetry output channel).

## State transitions

None persisted. Session-scoped one-shot flags inside `TelemetryService`/`ExtensionController`: `activateSent`, `settingsSnapshotSent`, `initialLoadPerfSent` (webview keeps `topologyPerfSent` in module scope). All reset naturally per extension-host session.

## Privacy contract mapping (FR-005 → structure)

| Never-collect class | Structural guard |
|---|---|
| Names/paths/URLs/messages/hashes | No `string`-typed property exists anywhere in the catalog; all properties are literal unions |
| Raw git stderr / exception text | Only `GitError.code` (enum) crosses into telemetry; middleware extracts `.code` exclusively |
| User-typed input | Dialog events carry only `dialog` + `outcome`; no payload fields from dialog forms are representable |
| Exact repo magnitudes | `CommitCountBucket` only; validator rejects raw numbers for bucketed fields |
