---
description: "Task list for Git Worktree Management"
---

# Tasks: Git Worktree Management

**Input**: Design documents from `/specs/046-git-worktrees/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-worktree.md, quickstart.md

**Tests**: Unit tests are included for backend service methods, the path-composition helper, and command builders — required by the project constitution (Vitest gate), not full TDD. No webview interaction/integration tests.

**Organization**: Tasks grouped by user story (priority order) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US6 maps to the spec's user stories

## Path Conventions

VS Code extension: backend `src/`, frontend `webview-ui/src/`, shared contracts `shared/`. Backend tests in `src/__tests__/`, store tests in `webview-ui/src/stores/__tests__/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm prerequisites; no new dependencies required.

- [X] T001 Confirm `speedyGit.worktree.basePath` is registered in `package.json` `contributes.configuration` (already present) and confirm no new npm dependencies are needed for this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-boundary type/contract/store changes that every story depends on. Several of these change shared shapes that will not compile until consumers are updated, so they MUST land first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Update `shared/types.ts`: add `isCurrent: boolean` to `WorktreeInfo`; add `worktreeBasePath: string` to `UserSettings` and `DEFAULT_USER_SETTINGS` (default `'../${repoName}.worktrees'`); add `'worktree'` to the `ActiveToggleWidget` union; declare `export type WorktreeBranchMode = 'existing' | 'new' | 'detached'` as the single source of truth for the branch-mode union used by RPC payloads, the command builder, and the create dialog.
- [X] T003 Update `shared/messages.ts` (after T002, same-module type dependency): add `RequestMessage` variants `addWorktree`, `removeWorktree`, `pruneWorktree`, `resolveWorktreePath`, `openWorktree`, `revealWorktree` (payloads using the `WorktreeBranchMode` type from T002, not inline literals); add `ResponseMessage` variant `worktreePathResolved`; register all new `type` strings in the request/response type-guard maps (mirroring existing `getWorktreeList` / `worktreeList`).
- [X] T004 [P] Read `speedyGit.worktree.basePath` in `src/ExtensionController.ts` (add to the settings key list and the `UserSettings` provider) so the backend can resolve worktree paths.
- [X] T005 Enrich `GitWorktreeService.listWorktrees()` in `src/services/GitWorktreeService.ts` to set `isCurrent` by normalized path-match of each `worktree.path` against the active `workspacePath` (research R3).
- [X] T006 Change `worktreeByHead` to `Map<string, WorktreeInfo[]>` in `webview-ui/src/stores/graphStore.ts`; update `setWorktreeList` and `setBatchData` to append per `head` (research R7).
- [X] T007 Update `WorktreeSection` in `webview-ui/src/components/CommitTooltip.tsx` to read the array-valued `worktreeByHead` (render the matching worktree(s)) so the webview compiles after T006.
- [X] T008 [P] Unit test `listWorktrees` porcelain parsing + `isCurrent` derivation in `src/__tests__/GitWorktreeService.test.ts`.

**Checkpoint**: Shared types, RPC contracts, settings, store shape, and tooltip all build green — user stories can begin.

---

## Phase 3: User Story 1 - Create a worktree for an existing branch and open it (Priority: P1) 🎯 MVP

**Goal**: Right-click a local branch → Create worktree… → confirm dialog → worktree created at the sibling path and opened in a new IDE window, with list + graph refreshed.

**Independent Test**: Right-click a branch not checked out anywhere, confirm with defaults; verify the sibling folder exists, a new window opens, and `git worktree list` shows the entry.

- [X] T009 [P] [US1] Add worktree path + new-branch-name validation in `src/utils/gitValidation.ts` (reuse `validateRefName`; non-empty path).
- [X] T010 [US1] Implement `resolveWorktreePath` helper in `src/services/GitWorktreeService.ts`: read base path, expand `${repoName}` and resolve leading `..` **anchored to the main worktree**, sanitize ref → leaf, append numeric collision suffix; return `{ path, leafName }` (research R1/R2).
- [X] T011 [US1] Implement `addWorktree({ path, ref, branchMode, newBranchName?, force? })` in `src/services/GitWorktreeService.ts` producing the existing / `-b` new / `--detach` command forms (research R4); returns `Result<void>`.
- [X] T012 [P] [US1] Add `buildAddWorktreeCommand({ path, ref, branchMode, newBranchName })` in `webview-ui/src/utils/gitCommandBuilder.ts` (quote paths with spaces).
- [X] T013 [US1] Add RPC dispatch in `src/WebviewProvider.ts` for `resolveWorktreePath` (→ `worktreePathResolved`), `addWorktree` (on success: re-post `worktreeList` + call `sendInitialData()`, then run `openWorktree`), and `openWorktree` (`vscode.commands.executeCommand('vscode.openFolder', Uri.file(path), { forceNewWindow: true })`).
- [X] T014 [US1] Add `addWorktree`, `resolveWorktreePath`, `openWorktree` send-helpers and a `worktreePathResolved` handler in `webview-ui/src/rpc/rpcClient.ts`.
- [X] T015 [US1] Create `webview-ui/src/components/CreateWorktreeDialog.tsx` (existing-branch mode): source display, editable target path seeded via `resolveWorktreePath`, live `CommandPreview`, and a note that the worktree opens in a new window. Surface backend `error` and keep the dialog open on failure.
- [X] T016 [US1] Add "Create worktree…" to `webview-ui/src/components/BranchContextMenu.tsx` for local branches and wire the dialog open-state following the existing dialog pattern (as `DeleteBranchDialog`/`MergeDialog` are opened from menus).
- [X] T017 [P] [US1] Unit tests in `src/__tests__/GitWorktreeService.test.ts` (addWorktree command forms, resolveWorktreePath sanitize/collision) and `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts` (buildAddWorktreeCommand).

**Checkpoint**: MVP — creating a worktree for an existing branch works end-to-end and opens a new window.

---

## Phase 4: User Story 2 - View and manage worktrees in a dedicated panel (Priority: P2)

**Goal**: A toolbar toggle opens a worktree panel listing every worktree (path, branch/detached, short HEAD, main badge) with Open / Reveal actions and a panel-level Prune (confirmation lists stale entries). Main worktree non-removable.

**Independent Test**: With ≥2 worktrees, open the panel; verify the list matches `git worktree list`, Open/Reveal work, the main worktree has no Remove, and Prune shows a confirmation listing stale entries.

- [X] T018 [US2] Implement `pruneWorktrees()` (`git worktree prune`) in `src/services/GitWorktreeService.ts`; returns `Result<void>`.
- [X] T019 [US2] Add RPC dispatch in `src/WebviewProvider.ts` for `pruneWorktree` (on success: re-post `worktreeList` + `sendInitialData()`) and `revealWorktree` (`vscode.commands.executeCommand('revealFileInOS', Uri.file(path))`).
- [X] T020 [US2] Add `pruneWorktree` and `revealWorktree` send-helpers in `webview-ui/src/rpc/rpcClient.ts`.
- [X] T021 [P] [US2] Add `buildPruneWorktreeCommand()` in `webview-ui/src/utils/gitCommandBuilder.ts`.
- [X] T022 [US2] Add a Worktree toggle button to `webview-ui/src/components/ControlBar.tsx` (calls `setActiveToggleWidget('worktree')`).
- [X] T023 [US2] Render `WorktreeWidget` when `activeToggleWidget === 'worktree'` in `webview-ui/src/components/TogglePanel.tsx`.
- [X] T024 [US2] Create `webview-ui/src/components/WorktreeWidget.tsx`: list rows (path, branch or "detached", short HEAD, main badge), per-row Open + Reveal in OS, and a panel-level Prune action that opens a `ConfirmDialog` listing stale entries (worktree paths whose folders are missing). Main worktree row has no Remove.
- [X] T025 [P] [US2] Unit tests for `pruneWorktrees` (`src/__tests__/GitWorktreeService.test.ts`) and `buildPruneWorktreeCommand` (`webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`).

**Checkpoint**: Panel lists, opens, reveals, and prunes worktrees independently of removal.

---

## Phase 5: User Story 3 - Remove a worktree, optionally deleting its branch (Priority: P2)

**Goal**: Remove a worktree via a confirm dialog: force required when dirty, optional "also delete branch" with nested force, retry-on-unmerged keeping the dialog open, and a caution if open in another window.

**Independent Test**: Remove a clean worktree (folder + entry gone); remove a dirty worktree (force required); tick "also delete branch" and confirm the branch is gone; for an unmerged branch, confirm the safe-delete error surfaces and force-retry succeeds.

- [X] T026 [US3] Implement `removeWorktree(path, { force? })` in `src/services/GitWorktreeService.ts` (`git worktree remove [--force] <path>`) plus a dirty pre-check reusing `isDirtyWorkingTree` from `src/utils/gitQueries.ts` against the target path (research R9); returns `Result<void>`.
- [X] T027 [US3] Add RPC dispatch in `src/WebviewProvider.ts` for `removeWorktree` (reject `isMain`/`isCurrent`; on success re-post `worktreeList` + `sendInitialData()`); branch deletion is handled by the webview via the existing `deleteBranch` request after success (research R10).
- [X] T028 [P] [US3] Add `removeWorktree` send-helper in `webview-ui/src/rpc/rpcClient.ts`.
- [X] T029 [P] [US3] Add `buildRemoveWorktreeCommand({ path, force })` in `webview-ui/src/utils/gitCommandBuilder.ts`.
- [X] T030 [US3] Create `webview-ui/src/components/RemoveWorktreeDialog.tsx`: dirty data-loss warning + force requirement, "Also delete branch `<name>`" (hidden/disabled when detached) with nested "force delete", static "open in another window" caution, and retry flow on `BRANCH_NOT_FULLY_MERGED` (worktree already removed → retry only the branch delete) using `CommandPreview`.
- [X] T031 [US3] Wire a Remove action on non-main, non-current rows in `webview-ui/src/components/WorktreeWidget.tsx` to open `RemoveWorktreeDialog`.
- [X] T032 [P] [US3] Unit tests for `removeWorktree` (force / no-force) in `src/__tests__/GitWorktreeService.test.ts` and `buildRemoveWorktreeCommand` in `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`.

**Checkpoint**: Full create→work→remove loop closed, with safe branch deletion.

---

## Phase 6: User Story 4 - Create a worktree from a commit or tag (Priority: P3)

**Goal**: Right-click a commit, tag badge, or remote-only branch badge → Create worktree… defaulting to new-branch mode (detached available); remote-only defaults to a tracking local branch.

**Independent Test**: Right-click a commit → dialog defaults to new-branch with detached option; right-click a remote-only badge → new branch named after the remote, tracking it.

- [X] T033 [US4] Extend `webview-ui/src/components/CreateWorktreeDialog.tsx` with new-branch + detached modes and remote-only default (pre-fill new branch name from the remote branch, set tracking); reuses `buildAddWorktreeCommand`/`resolveWorktreePath` from US1.
- [X] T034 [P] [US4] Add "Create worktree…" to `webview-ui/src/components/CommitContextMenu.tsx` for commits and tag badges (default new-branch mode, source = clicked ref).
- [X] T035 [US4] Add "Create worktree…" for remote-only branch badges in `webview-ui/src/components/BranchContextMenu.tsx` (new-branch tracking default).
- [X] T036 [P] [US4] Unit tests in `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts` for `buildAddWorktreeCommand` new-branch and detached variants, plus remote-only branch-name derivation.

**Checkpoint**: Creation works from any history point and from remote-only branches.

---

## Phase 7: User Story 5 - See where worktrees point in the graph (Priority: P3)

**Goal**: Commits that are a worktree HEAD show a badge; the badge menu lists one "Open in new window" target per worktree (multiple worktrees per commit supported).

**Independent Test**: A commit that is a worktree HEAD shows a badge; two worktrees on the same commit both appear as separate open targets.

- [X] T037 [US5] Render a worktree badge on rows whose `head` has a non-empty `worktreeByHead` array in `webview-ui/src/components/CommitRow.tsx` (and/or `GraphCell.tsx`), memo-safe for virtual scrolling.
- [X] T038 [US5] Create `webview-ui/src/components/WorktreeBadgeMenu.tsx`: a context menu listing one "Open in new window" item per worktree at that commit (calls `openWorktree`).
- [X] T039 [P] [US5] Extend `webview-ui/src/stores/__tests__/graphStore.test.ts` to assert two worktrees sharing one `head` both survive in `worktreeByHead`.

**Checkpoint**: Worktree locations are visible and openable from the graph.

---

## Phase 8: User Story 6 - Manage worktrees while working inside a linked worktree (Priority: P3)

**Goal**: From a linked-worktree window the panel shows the full list with the current worktree marked and non-removable; new worktrees still land beside the main repo (anchored to main).

**Independent Test**: In a worktree window, open the panel (current marked "you are here", non-removable) and create a worktree with defaults → it lands beside the main repo, not nested.

- [X] T040 [US6] In `webview-ui/src/components/WorktreeWidget.tsx`, render the "you are here" marker on the `isCurrent` row (marker only — the non-removable guard for `isMain`/`isCurrent` is already delivered by the backend reject in T027 and the row-action gating in T031).
- [X] T041 [P] [US6] Unit tests in `src/__tests__/GitWorktreeService.test.ts`: `resolveWorktreePath` anchors `..`/`${repoName}` to the main worktree when the active cwd is a linked worktree; `isCurrent` detection via path-match.

**Checkpoint**: Feature behaves correctly from inside any worktree.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T042 Map the branch-checked-out-elsewhere conflict to a readable message naming the conflicting worktree in both directions — `addWorktree` (`src/services/GitWorktreeService.ts`) and the reverse main-window checkout via `GitBranchService` (`src/services/GitBranchService.ts`) — per FR-024/SC-003.
- [X] T043 [P] Run `pnpm typecheck` and `pnpm lint`; fix any issues across touched files.
- [X] T044 Run `pnpm build` (clean) and execute the `quickstart.md` smoke test (all 8 sections) via the "Run Extension" launch config.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: depends on Setup. BLOCKS all user stories (shared types/contracts/store shape must compile).
- **User Stories (Phases 3–8)**: all depend on Foundational. Priority order P1 → P2 → P3; can be parallelized by file where marked.
- **Polish (Phase 9)**: depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories. Establishes `addWorktree`, `resolveWorktreePath`, `buildAddWorktreeCommand`, `CreateWorktreeDialog`, open-folder RPC — reused later.
- **US2 (P2)**: after Foundational. Independent (adds panel + prune + reveal). Hosts the Remove button US3 fills in.
- **US3 (P2)**: after Foundational; the Remove button wiring (T031) assumes the `WorktreeWidget` from US2 exists. Backend/dialog parts are independent.
- **US4 (P3)**: builds on US1's dialog + command builder (extends modes/menus).
- **US5 (P3)**: relies on the Foundational array-valued `worktreeByHead` and US1's `openWorktree`.
- **US6 (P3)**: relies on Foundational `isCurrent` and US1's `resolveWorktreePath` (main-anchor).

### Within Each User Story

- Same-file tasks run sequentially; `[P]` tasks touch different files.
- Backend service + command builder before the dialog/menu that calls them.
- Unit tests can be written alongside or after the unit under test (constitution gate, not strict TDD).

---

## Parallel Opportunities

- **Foundational**: T004 (settings) and T008 (test) run parallel to T002; T003 (messages) depends on T002's `WorktreeBranchMode` type; T005/T006/T007 are sequential where they share files/consumers.
- **US1**: T009 (validation) and T012 (command builder) parallel; T017 (tests) parallel once units exist. T010/T011/T013 share files → sequential.
- **US2**: T021 (command builder) and T025 (tests) parallel.
- **US3**: T028 (rpcClient) and T029 (command builder) and T032 (tests) parallel.
- **US4**: T034 (commit menu) and T036 (tests) parallel.
- Cross-story parallelism is possible with multiple developers once Foundational is done, mindful of shared files (`WebviewProvider.ts`, `rpcClient.ts`, `gitCommandBuilder.ts`, `GitWorktreeService.ts`, `WorktreeWidget.tsx`).

## Parallel Example: User Story 1

```bash
# After Foundational, launch the independent US1 units together:
Task: "Add worktree path/new-branch validation in src/utils/gitValidation.ts"          # T009
Task: "Add buildAddWorktreeCommand in webview-ui/src/utils/gitCommandBuilder.ts"        # T012
# Then, after the service methods exist:
Task: "Unit tests for addWorktree/resolveWorktreePath + buildAddWorktreeCommand"        # T017
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: create a worktree for an existing branch, confirm new window opens and the list/graph refresh.
3. Demo the MVP.

### Incremental Delivery

1. Foundation ready → US1 (MVP) → US2 (panel) → US3 (remove) closes the core loop.
2. US4 (commit/tag/remote sources) → US5 (graph badges) → US6 (inside-worktree correctness) add reach and polish.
3. Phase 9 hardens errors and runs the full validation gate.

## Notes

- `[P]` = different files, no incomplete dependency.
- Branch deletion reuses `GitBranchService.deleteBranch` — do not add a delete path in `GitWorktreeService`.
- Lock/unlock is out of scope (deferred per spec).
- Refresh after every add/remove/prune is explicit (`worktreeList` + `sendInitialData()`); do not rely on `GitWatcherService`.
- Test targets already exist and are **extended**, not created: `src/__tests__/GitWorktreeService.test.ts`, `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`, `webview-ui/src/stores/__tests__/graphStore.test.ts`.
- Per CLAUDE.md: do not auto-install packages or commit; provide commands for the developer.
