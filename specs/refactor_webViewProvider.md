# AI Implementation Spec: Refactor WebviewProvider

## How To Use This Spec

This document is written for an AI coding agent that will implement the full `WebviewProvider` refactor end to end.

The implementing agent should:

1. Read this file first.
2. Inspect the current repository state, especially `src/WebviewProvider.ts`, `shared/messages.ts`, `src/ExtensionController.ts`, and existing tests.
3. Implement the architecture described here.
4. Preserve existing behavior unless this spec explicitly says otherwise.
5. Add only the tests needed to protect risky behavior that is not already covered.
6. Run the verification commands.
7. Report what changed, what passed, and any residual manual smoke-test risk.

This is a major-version refactor. A large coordinated change is acceptable. Do not stop after proposing the architecture; implement it.

Do not ask the user for clarification unless implementation is blocked by contradictory repository state or missing required context. Make conservative engineering decisions that preserve current behavior.

## Objective

`src/WebviewProvider.ts` has grown into a central host for many unrelated responsibilities:

- VS Code webview panel lifecycle
- persisted UI state and per-repo table layout storage
- initial and deferred repository data loading
- refresh scheduling and hidden-panel refresh deferral
- webview RPC routing
- git feature operation handling
- VS Code editor commands for file and diff views
- repo switching and submodule display navigation
- worktree management host commands
- in-progress git operation guards

The goal is to replace the current large god object with a composed backend webview subsystem whose files map to clear responsibilities. Behavior should remain compatible unless a deliberate behavior change is explicitly documented during implementation.

The final result should make it possible to work on a feature area, such as worktrees, compare refs, signatures, or rebase, without reading the entire webview host.

## Current Anchor Files

- `src/WebviewProvider.ts`: current implementation to refactor.
- `shared/messages.ts`: typed RPC request/response contract.
- `src/ExtensionController.ts`: constructs and updates `WebviewProvider`.
- `src/__tests__/WebviewProvider.test.ts`: current provider-level behavior tests.
- `src/services/*`: repo-bound git services used by the provider.
- `specs/046-git-worktrees/plan.md`: relevant recent context for worktree behavior and constraints.

## Design Principles

1. Keep `WebviewProvider` as a thin facade.
   It should remain the public object used by `ExtensionController`, but it should no longer own feature logic.

2. Split by responsibility, not by arbitrary line count.
   Each new file should have a stable reason to exist.

3. Avoid naming every component `Provider`.
   In this codebase, clearer internal names are `Host`, `Store`, `Registry`, `Router`, `Loader`, `Coordinator`, `Service`, `Guard`, and `Handlers`.

4. Prevent stale service references.
   Repo switching and submodule display navigation replace repo-bound git services. Handlers must fetch current services from a registry/context at execution time, not capture old service instances.

5. Make RPC routing exhaustive.
   Adding a new `RequestMessage` type should fail TypeScript compilation until a handler is registered.

6. Preserve current behavior first.
   Any behavior changes should be explicit follow-up work, not accidental side effects of extraction.

7. Keep handler context narrow.
   Do not pass a giant mutable provider object to every handler. Give handlers the operations they need through `WebviewRequestContext`.

8. Implement, then verify.
   This spec is not a planning prompt. It is the execution guide for completing the refactor.

## Target Structure

Create a backend webview subsystem:

```text
src/
├── WebviewProvider.ts                  # compatibility re-export, optional but recommended
└── webview/
    ├── WebviewProvider.ts              # thin public facade used by ExtensionController
    ├── WebviewPanelHost.ts             # VS Code panel lifecycle, HTML, postMessage
    ├── WebviewRuntime.ts               # current repo path, filters, generations, flags
    ├── GitServiceRegistry.ts           # current repo-bound git services
    ├── WebviewMessageRouter.ts         # exhaustive typed RPC dispatch
    ├── WebviewRequestContext.ts        # narrow handler API
    ├── PersistedUIStateStore.ts        # load/save/validate UI state and table layout
    ├── RepoDataLoader.ts               # initialData, deferred data, avatars, submodules
    ├── RefreshCoordinator.ts           # refresh queue, hidden-panel deferral, loading lifecycle
    ├── EditorCommandService.ts         # open diff/file/current/staged/compare/open folder/reveal
    ├── OperationGuard.ts               # rebase/cherry-pick/revert/merge in-progress checks
    └── handlers/
        ├── graphDataHandlers.ts
        ├── branchHandlers.ts
        ├── remoteHandlers.ts
        ├── tagHandlers.ts
        ├── stashHandlers.ts
        ├── historyHandlers.ts
        ├── signatureHandlers.ts
        ├── submoduleHandlers.ts
        ├── worktreeHandlers.ts
        ├── workingTreeHandlers.ts
        ├── compareHandlers.ts
        └── vscodeCommandHandlers.ts
```

Keep `src/WebviewProvider.ts` as:

```ts
export { WebviewProvider } from './webview/WebviewProvider.js';
```

This minimizes import churn. `ExtensionController` can either keep importing from `./WebviewProvider.js` or later be updated to `./webview/WebviewProvider.js`.

The preferred implementation is to keep the compatibility re-export and avoid touching unrelated import sites unless it simplifies the code.

## Component Responsibilities

### WebviewProvider

Public facade only.

Expected methods:

- `constructor(...)`
- `setSwitchRepoHandler(...)`
- `setDisplayRepoHandler(...)`
- `setSettingsProvider(...)`
- `setSubmoduleNavigationHandlers(...)`
- `updateServices(...)`
- `isPanelOpen()`
- `reload()`
- `triggerAutoRefresh()`
- `sendRepoList(...)`
- `sendSettingsData(...)`
- `show()`
- `dispose()`

It composes the other objects and wires dependencies. It should not contain feature-specific RPC cases.

### WebviewPanelHost

Owns VS Code webview panel details:

- `vscode.window.createWebviewPanel`
- icon path
- `webview.html`
- `onDidReceiveMessage`
- `onDidChangeViewState`
- `onDidDispose`
- panel visibility state notification
- `postMessage`
- HTML/CSP generation and nonce creation

It should expose a small API:

- `show(onMessage)`
- `reveal()`
- `dispose()`
- `isOpen()`
- `isVisible()`
- `postMessage(message)`

### WebviewRuntime

Owns mutable provider state that is not a git service:

- `currentRepoPath`
- `currentFilters`
- `fetchGeneration`
- `isDisplayingSubmodule`
- `initialLoadSent`
- `lastCommitFingerprint`
- active compare controller

Refresh-specific flags may either live here or in `RefreshCoordinator`, but avoid duplicating state.

### GitServiceRegistry

Groups all repo-bound services and supports atomic replacement.

It should hold:

- `gitLogService`
- `gitDiffService`
- `gitBranchService`
- `gitRemoteService`
- `gitTagService`
- `gitStashService`
- `gitHistoryService`
- `gitCherryPickService`
- `gitRevertService`
- `gitRebaseService`
- `gitSignatureService`
- `gitSubmoduleService`
- `gitWorktreeService`
- `gitIndexService`

Required rules:

- Handlers call `services.current()` or equivalent inside each request handler.
- Do not destructure services once during router construction if that can create stale references.
- `updateServices(...)` updates this registry and resets repo-scoped runtime/cache state.

### PersistedUIStateStore

Move all UI persistence logic out of `WebviewProvider`:

- layout key hashing
- table column width healing
- `validateCommitTableLayout`
- `loadPersistedUIState`
- `loadRepoTableLayout`
- `saveRepoTableLayout`
- `savePersistedUIState`
- UI state cache

Current tests around per-repo column layout and healing should move or continue to pass through the public facade.

### RepoDataLoader

Owns data loading behavior:

- `sendInitialData(filters?, isAutoRefresh?)`
- initial payload with commits and branches
- commit fingerprint optimization for auto-refresh
- branch-filter validity cleanup
- deferred data loading:
  - uncommitted summary
  - remotes
  - worktrees
  - stashes
  - revert state
  - cherry-pick state
  - rebase state/conflict info
- submodule data loading with generation guard
- GitHub avatar initialization/fetch
- VS Code Source Control refresh after extension-initiated git operations

This module should receive dependencies through context/constructor:

- `GitServiceRegistry`
- `WebviewRuntime`
- `PersistedUIStateStore`
- `postMessage`
- settings provider
- submodule stack provider
- logger

### RefreshCoordinator

Owns when data loading happens:

- initial load vs manual refresh vs auto-refresh
- `isRefreshing`
- `pendingRefresh`
- `deferredRefresh`
- hidden panel auto-refresh deferral
- loading message lifecycle

It should call `RepoDataLoader`, not duplicate data-loading logic.

### EditorCommandService

Move VS Code editor/command interactions:

- open commit diff
- open uncommitted working-tree diff
- open staged diff
- open file at revision
- open current workspace file
- open compare diff
- open worktree folder
- reveal worktree in OS
- open signature help preview
- open external URL if desired
- copy to clipboard can live here or in `vscodeCommandHandlers.ts`

It needs:

- current repo path getter
- `gitLogService` getter for resolving `HEAD`
- logger
- extension URI for docs if handling signature help

### OperationGuard

Move reusable in-progress checks:

- rebase in progress
- cherry-pick in progress
- revert in progress
- merge in progress via `MERGE_HEAD`

Return `GitError | null`, preserving existing messages.

### WebviewMessageRouter

Owns request dispatch only.

Use an exhaustive typed handler map:

```ts
import type { RequestMessage } from '../../shared/messages.js';

export type RequestHandler<T extends RequestMessage['type']> = (
  message: Extract<RequestMessage, { type: T }>,
  context: WebviewRequestContext,
) => Promise<void>;

export type RequestHandlerMap = {
  [T in RequestMessage['type']]: RequestHandler<T>;
};

export const requestHandlers = {
  getCommits: handleGetCommits,
  // all request types here
} satisfies RequestHandlerMap;
```

The router should:

- log received message type
- dispatch by message type
- catch errors at the same boundary as current `show()` message callback
- post the same error response shape as today

### WebviewRequestContext

The context should provide narrow operations. Suggested shape:

```ts
export interface WebviewRequestContext {
  readonly log: vscode.LogOutputChannel;
  readonly extensionUri: vscode.Uri;
  readonly runtime: WebviewRuntime;
  readonly services: GitServiceRegistry;
  readonly dataLoader: RepoDataLoader;
  readonly refreshCoordinator: RefreshCoordinator;
  readonly editorCommands: EditorCommandService;
  readonly operationGuard: OperationGuard;

  postMessage(message: ResponseMessage): void;
  getSettings(): UserSettings | undefined;
  getBatchSize(): number;

  getRepoDiscovery(): GitRepoDiscoveryService | undefined;
  getSubmoduleHandlers(): SubmoduleNavigationHandlers | undefined;

  onSwitchRepo(repoPath: string): void;
  onDisplayRepo(repoPath: string): void;
}
```

Refine during implementation, but keep it smaller than the original provider.

## Handler Grouping

Move request types into these files.

### graphDataHandlers.ts

- `getAuthors`
- `getCommits`
- `loadMoreCommits`
- `getBranches`
- `getCommitDetails`
- `getContainingBranches`
- `refresh`

### branchHandlers.ts

- `checkoutBranch`
- `checkoutCommit`
- `stashAndCheckout`
- `stashAndCheckoutCommit`
- `fastForwardLocalBranch`
- `createBranch`
- `renameBranch`
- `deleteBranch`
- `deleteRemoteBranch`
- `mergeBranch`

### remoteHandlers.ts

- `fetch`
- `push`
- `pull`
- `getRemotes`
- `addRemote`
- `removeRemote`
- `editRemote`

### tagHandlers.ts

- `createTag`
- `deleteTag`
- `pushTag`

### stashHandlers.ts

- `getStashes`
- `applyStash`
- `popStash`
- `dropStash`
- `stashWithMessage`
- `stashSelected`

### historyHandlers.ts

- `resetBranch`
- `cherryPick`
- `abortCherryPick`
- `continueCherryPick`
- `getCommitParents`
- `revert`
- `continueRevert`
- `abortRevert`
- `rebase`
- `interactiveRebase`
- `getRebaseCommits`
- `abortRebase`
- `continueRebase`
- `isCommitPushed`
- `dropCommit`

### signatureHandlers.ts

- `getSignatureInfo`
- `detectSignaturePresence`
- `verifySignatures`
- `openSignatureHelp`

### submoduleHandlers.ts

- `getSubmodules`
- `openSubmodule`
- `backToParentRepo`
- `updateSubmodule`
- `initSubmodule`
- `switchRepo`
- `displayRepo`

`switchRepo` and `displayRepo` are navigation handlers rather than pure submodule handlers, but keeping them here is acceptable because they interact with submodule-display state and generation behavior. If desired, use `repoNavigationHandlers.ts` instead.

### worktreeHandlers.ts

- `getWorktreeList`
- `resolveWorktreePath`
- `addWorktree`
- `removeWorktree`
- `pruneWorktree`
- `openWorktree`
- `revealWorktree`

### workingTreeHandlers.ts

- `getUncommittedChanges`
- `stageFiles`
- `unstageFiles`
- `stageAll`
- `unstageAll`
- `discardFiles`
- `discardAllUnstaged`
- `getConflictState`
- `openStagedDiff`
- `openDiff`
- `openFile`
- `openCurrentFile`

### compareHandlers.ts

- `compareRefs`
- `cancelCompare`
- `openCompareDiff`

Preserve latest-wins compare cancellation semantics.

### vscodeCommandHandlers.ts

- `openSettings`
- `getSettings`
- `copyToClipboard`
- `openExternal`
- `updatePersistedUIState`

## Execution Sequence

This is allowed to be a major-version big-bang refactor, but still use checkpoints internally.

The implementing agent should complete all phases in one working session if feasible. If interrupted, the repository should be left in a coherent intermediate state where TypeScript errors clearly indicate unfinished migration work.

### Phase 1: Inspect and Characterize High-Risk Behavior

First inspect existing tests. Use current tests as the primary behavior contract. Add focused characterization tests only where behavior is risky and not already covered.

High-risk behavior to confirm:

- initial load posts `initialData` before deferred data
- manual refresh preserves filters
- auto-refresh uses commit fingerprint and can send `commits: null`
- hidden-panel auto-refresh is deferred
- `switchRepo` clears branch filters, increments generation, resets submodule display state
- `displayRepo` changes displayed repo without changing workspace active repo
- per-repo UI layout persistence and healing
- worktree add/remove/prune sends success and refreshes data
- compare refs aborts previous request and posts request-id-scoped result/error
- rebase/revert/cherry-pick conflicts post correct operation state
- uncommitted commit details synthesize details from staged/unstaged/conflict files

Do not overbuild tests. Add enough tests to catch behavior loss during extraction. Prefer provider-level tests for host orchestration behavior and service-level tests for git command behavior.

### Phase 2: Create New Module Skeleton

Add `src/webview/` and create initial class/module shells:

- `WebviewProvider.ts`
- `WebviewPanelHost.ts`
- `WebviewRuntime.ts`
- `GitServiceRegistry.ts`
- `WebviewMessageRouter.ts`
- `WebviewRequestContext.ts`
- `PersistedUIStateStore.ts`
- `RepoDataLoader.ts`
- `RefreshCoordinator.ts`
- `EditorCommandService.ts`
- `OperationGuard.ts`
- handler files

Add `src/WebviewProvider.ts` compatibility re-export.

After this phase, imports should still resolve. It is acceptable for new modules to be empty or partially wired while later phases migrate logic.

### Phase 3: Extract Pure UI State Logic

Move:

- `HEALING_ASSUMED_CONTAINER_WIDTH`
- `computeHealingMaxWidth`
- `healPersistedColumnWidth`
- `repoLayoutKey`
- `clonePersistedUIStateDefaults`
- `isCommitListMode`
- `isCommitTableColumnId`
- `validateCommitTableLayout`
- `loadPersistedUIState`
- `loadRepoTableLayout`
- `saveRepoTableLayout`
- `savePersistedUIState`

Run provider UI state tests after this phase.

### Phase 4: Introduce Runtime and Service Registry

Move provider mutable state into `WebviewRuntime` where appropriate.

Create `GitServiceRegistry` and update construction/update paths:

- constructor initializes registry
- `updateServices(...)` replaces registry contents
- repo switch invalidates UI cache, avatars, fingerprint, initial load state as today

Be careful to preserve existing resets:

- UI state cache invalidated on repo change
- GitHub avatar service reset on repo change
- last commit fingerprint reset on repo change
- initial load state reset on repo change

### Phase 5: Extract Panel Host

Move panel creation and HTML generation:

- `show()` panel creation internals
- icon path
- message callback wiring
- visibility change callback
- dispose callback
- `postMessage`
- `getWebviewContent`
- `getNonce`

`WebviewProvider.show()` should orchestrate:

1. create/reveal panel via host
2. send repo list if available
3. trigger initial load via refresh/data loader

### Phase 6: Extract Editor Commands and Operation Guard

Move editor command methods:

- `getHeadHash`
- `openDiffEditor`
- `openStagedDiffEditor`
- `openFileAtRevision`
- `openCurrentFile`
- `openCompareDiffEditor`
- `getWorkspacePath`
- `resolveWorkspaceFilePath`
- `openWorktreeFolder`

Move `getOperationInProgressError` to `OperationGuard`.

Preserve existing warning/error messages.

### Phase 7: Extract Repo Data Loader and Refresh Coordinator

Move:

- `computeCommitFingerprint`
- `refreshVSCodeSourceControl`
- `sendInitialData`
- `sendDeferredRepoData`
- `fetchAndSendGitHubAvatars`
- `sendSubmodulesData`
- `emptyUncommittedSummary`
- `unwrapSettledResult`

Split responsibilities:

- `RepoDataLoader` decides what data to fetch and post.
- `RefreshCoordinator` decides when to call it and how to handle pending/deferred refresh.

Make generation checks explicit and centralized.

### Phase 8: Replace Giant Switch With Router

Create `requestHandlers` with every `RequestMessage['type']`.

Initially handlers may call extracted services or contain moved logic directly. The important milestone is:

- `WebviewProvider` no longer contains a giant `switch`.
- router is exhaustive by TypeScript.
- message error handling matches current behavior.

The old `handleMessage` method should either disappear or become a tiny call into `WebviewMessageRouter`.

### Phase 9: Move RPC Cases Into Domain Handler Files

Move one group at a time in this order:

1. `vscodeCommandHandlers.ts`
2. `tagHandlers.ts`
3. `stashHandlers.ts`
4. `signatureHandlers.ts`
5. `remoteHandlers.ts`
6. `worktreeHandlers.ts`
7. `workingTreeHandlers.ts`
8. `compareHandlers.ts`
9. `branchHandlers.ts`
10. `submoduleHandlers.ts` / `repoNavigationHandlers.ts`
11. `historyHandlers.ts`
12. `graphDataHandlers.ts`

This order starts with simpler low-coupling handlers and leaves the most stateful handlers for later.

### Phase 10: Clean Imports and Tests

After all handlers move:

- remove obsolete imports from old `WebviewProvider`
- ensure no handler imports the facade provider
- ensure handlers use context/registry, not concrete old service captures
- update tests to import pure helpers directly where appropriate
- keep public facade tests where they verify integration behavior

Run `rg "handleMessage|private async sendInitialData|private async openDiffEditor|private savePersistedUIState" src/webview src/WebviewProvider.ts` or similar searches to ensure old large-provider responsibilities are not still embedded in the facade.

## Required Implementation Checks

During implementation, repeatedly check these invariants:

- `RequestMessage['type']` is exhaustively handled.
- no handler imports the facade `WebviewProvider`.
- no handler stores repo-bound services in long-lived module state.
- repo switching still resets repo-scoped runtime/cache state.
- submodule display navigation still avoids overwriting parent submodule selector data.
- compare latest-wins cancellation still uses request IDs.
- initial load still posts `persistedUIState` before first render data.
- initial load still avoids waiting for deferred ancillary data.
- auto-refresh still avoids disruptive full loading overlays.
- worktree add/remove/prune still explicitly refreshes data.
- UI table layout remains per-repo, while other UI state remains global.

## Verification Commands

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If one command fails, fix it before proceeding to manual smoke testing.

Also run targeted tests while developing when useful, for example:

```bash
pnpm test src/__tests__/WebviewProvider.test.ts
pnpm test src/__tests__/GitWorktreeService.test.ts
pnpm test src/__tests__/GitDiffService.compare.test.ts
```

Use exact test paths only if supported by the repo's Vitest configuration. If not, run `pnpm test`.

## Manual Prerelease Smoke Test

Use the VS Code extension host launch config and verify:

1. Open graph on a normal repo.
2. Initial commits, branches, refs, remotes, stashes, and uncommitted summary load.
3. Manual refresh works.
4. Auto-refresh works while panel is visible.
5. Auto-refresh while panel is hidden is deferred and runs when visible again.
6. Repo switch updates services, repo list, commits, and clears branch filters.
7. Submodule display navigation works and does not overwrite parent submodule selector data.
8. Checkout branch and checkout commit work, including stash-needed flow.
9. Create, rename, delete, merge, and fast-forward branch operations work.
10. Fetch, pull, push, add/edit/remove remote work.
11. Create, delete, and push tag work.
12. Apply, pop, drop, and create stash flows work.
13. Stage, unstage, discard selected files, stage all, unstage all, discard all unstaged.
14. Uncommitted node details show correct synthesized details.
15. Open committed diff, uncommitted diff, staged diff, file at revision, and current file.
16. Rebase, interactive rebase, continue/abort rebase, and conflict state display.
17. Cherry-pick, continue/abort cherry-pick, and conflict state display.
18. Revert modes, continue/abort revert, and conflict state display.
19. Drop commit flow.
20. Signature presence, verification, detail popover, and help doc.
21. Compare refs result, compare cancellation/latest-wins, and compare diff editor.
22. Worktree list, resolve path, add, open, reveal, remove, and prune.
23. Persisted UI state reloads correctly.
24. Per-repo table layout remains independent across repo switches.
25. No duplicate or stale messages appear after rapid repo switches.

## Success Criteria

The refactor is complete when:

- `src/WebviewProvider.ts` is a compatibility re-export or very small facade.
- `src/webview/WebviewProvider.ts` is a thin orchestrator, not a feature host.
- there is no giant `handleMessage` switch in the provider.
- every `RequestMessage['type']` is registered in an exhaustive typed router.
- feature handlers live in named domain files.
- repo-bound services are accessed through `GitServiceRegistry` at request time.
- current tests pass.
- added characterization tests pass.
- manual smoke testing does not reveal regressions.

The implementing agent should not consider the task complete if the refactor merely moves code into one or two large files. The result must materially reduce the responsibility and size of `WebviewProvider`.

## Risks and Mitigations

### Stale service references after repo switch

Mitigation: handlers must call `context.services.current()` during handler execution.

### Lost generation guards

Mitigation: keep generation ownership in `WebviewRuntime`/`RefreshCoordinator`; preserve all checks around initial data, deferred data, submodules, and repo switch.

### Changed loading behavior

Mitigation: characterize initial vs refresh vs auto-refresh behavior before extraction.

### Message contract drift

Mitigation: use the exhaustive router map with `satisfies RequestHandlerMap`.

### Overly broad context

Mitigation: do not pass the provider instance to handlers. Add explicit context capabilities as needed.

### Refactor creates many small but confusing files

Mitigation: each file must have one stable responsibility. If a file only forwards calls and adds no clarity, remove or merge it.

## Notes for the Implementing Session

- Do not install new packages.
- Do not commit or merge changes.
- Prefer `rg` for searching.
- Use `apply_patch` for manual edits.
- Preserve current user-facing messages unless intentionally changing behavior.
- Keep TypeScript strictness: no unused locals/parameters and no implicit returns.
- The worktree feature is recent and important; verify it carefully after extraction.

## Final Response Requirements

When implementation is complete, report:

- the new module structure
- the major responsibilities moved out of `WebviewProvider`
- any behavior-preserving tests added or updated
- verification commands run and their results
- any commands that could not be run
- any remaining manual smoke-test recommendations
