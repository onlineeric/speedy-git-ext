# Research: Auto-Refresh on Git State Changes

## R-001: VSCode Built-in Git Extension API for State Changes

**Decision**: Use `vscode.extensions.getExtension('vscode.git')` to obtain the Git API v1, then subscribe to `Repository.state.onDidChange` for each tracked repository.

**Rationale**: The `vscode.git` extension is bundled with all standard VSCode installations and exposes a stable v1 API. The `onDidChange` event fires after any git operation performed through VSCode's Source Control panel (commit, push, pull, checkout, branch create/delete, sync). This is the most reliable and lowest-latency detection mechanism for P1 scenarios.

**API Shape**:
```typescript
const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
const git = gitExtension?.exports?.getAPI(1);
// git.repositories → Repository[]
// repository.state.onDidChange → Event<void>
// git.onDidOpenRepository → Event<Repository>
// git.onDidCloseRepository → Event<Repository>
```

**Alternatives considered**:
- Polling git status on a timer: rejected due to unnecessary resource usage and higher latency.
- Using VSCode's `workspace.onDidSaveTextDocument`: doesn't cover git operations, only file saves.

## R-002: Filesystem Watching for External Git Operations

**Decision**: Use `vscode.workspace.createFileSystemWatcher` to watch key `.git/` directory files: `HEAD`, `refs/**`, `index`, and `MERGE_HEAD`. Changes to these files indicate git operations from terminal or external tools.

**Rationale**: External git commands (terminal, other tools) don't trigger VSCode git extension events. Filesystem watching catches these by detecting changes to git's internal files. This is the approach used by Git Graph and other similar extensions.

**Key files to watch**:
- `.git/HEAD` — branch checkout, detached HEAD
- `.git/refs/**` — branch create/delete, push/pull (ref updates)
- `.git/index` — staging area changes (commit, reset)
- `.git/MERGE_HEAD` — merge operations
- `.git/REBASE_HEAD`, `.git/rebase-merge/`, `.git/rebase-apply/` — rebase operations

**Pattern**: `**/.git/{HEAD,index,MERGE_HEAD,REBASE_HEAD,refs/**}` — a single `RelativePattern` scoped to the workspace.

**Alternatives considered**:
- `fs.watch` / `chokidar`: rejected because VSCode's FileSystemWatcher is cross-platform, integrates with the extension lifecycle (auto-disposal), and handles the `.git/` directory reliably.
- Watching the entire `.git/` directory: rejected due to excessive noise from lock files, FETCH_HEAD, etc.

## R-003: Debounce Strategy

**Decision**: 500ms debounce window using a simple timer pattern (`setTimeout`/`clearTimeout`). All git change events (from both VSCode git API and filesystem watcher) feed into the same debounce gate.

**Rationale**: Git operations like rebase replay multiple commits rapidly. A 500ms window coalesces these into a single refresh while keeping perceived latency under the 2s target (500ms debounce + ~500ms data fetch + ~200ms render). The spec suggests 500ms-1000ms; 500ms optimizes for responsiveness.

**Implementation**: A single `debouncedRefresh()` method on `GitWatcherService` that resets a timer on each event. When the timer fires, it calls `WebviewProvider.triggerAutoRefresh()`.

**Alternatives considered**:
- Leading-edge debounce (fire immediately, suppress subsequent): rejected because early events during a multi-step operation would show intermediate state.
- Throttle instead of debounce: rejected because throttle would still fire during multi-commit operations.

## R-004: Concurrent Request Handling (Drop Policy)

**Decision**: A boolean `isRefreshing` flag in `WebviewProvider`. When `triggerAutoRefresh()` is called while a refresh is in progress, the request is dropped. A `pendingRefresh` flag captures whether a trigger was dropped, so a follow-up refresh fires after the current one completes.

**Rationale**: The spec explicitly requires "drop incoming refresh requests if a refresh is already in progress." However, simply dropping without follow-up could miss the latest state change. The `pendingRefresh` flag ensures eventual consistency without queuing.

**Alternatives considered**:
- Queue all requests: rejected per spec (FR-012).
- Cancel in-flight refresh: rejected because git commands can't be interrupted mid-execution, and partial data would be worse than stale data.

## R-005: Webview Visibility Handling

**Decision**: Subscribe to `panel.onDidChangeViewState` to track webview visibility. When the panel is hidden, set a `deferredRefresh` flag instead of refreshing. When the panel becomes visible, trigger a single refresh if the flag is set.

**Rationale**: Refreshing a hidden webview wastes resources (git commands run, data is sent to a webview that discards it). Deferring until visible aligns with FR-005 and Performance First principle.

**Implementation**: Add `onDidChangeViewState` listener in `WebviewProvider.show()`. The `GitWatcherService` checks panel visibility before refreshing.

**Alternatives considered**:
- Always refresh regardless of visibility: rejected due to unnecessary resource usage.
- Pause/resume the watcher itself: rejected because it's simpler to let events accumulate and do one refresh on visibility restore.

## R-006: State Preservation During Refresh

**Decision**: Reuse the existing `sendInitialData()` flow which already handles state preservation. The `setCommits` action in the Zustand store already preserves `selectedCommit` if it still exists in the new commit list, and scroll position is maintained by React Virtual's stable row identity.

**Rationale**: The existing refresh flow (manual refresh button) already preserves selection and scroll. Auto-refresh uses the exact same code path, so no additional work is needed for FR-004.

**Verification**: In `graphStore.ts`, `setCommits` (line 224-248) checks if `selectedCommit` exists in the new commit list and preserves it. Virtual scroll maintains position because rows are keyed by commit hash.

**Alternatives considered**:
- Custom state snapshot/restore: rejected because the existing flow already handles this.

## R-007: Loading Indicator for Auto-Refresh

**Decision**: Use the existing `loading` state in the Zustand store. The `sendInitialData()` method already sends `{ type: 'loading', payload: { loading: true/false } }` which the webview uses to show/disable refresh buttons. No new message type is needed.

**Rationale**: The spec requires showing a spinner on the refresh button and disabling buttons during auto-refresh. The existing `loading` state already controls this behavior — the refresh button shows a loading indicator when `loading` is `true`.

**Alternatives considered**:
- Separate `autoRefreshing` state: rejected because the UX should be identical to manual refresh. Distinguishing them adds complexity without user benefit.
