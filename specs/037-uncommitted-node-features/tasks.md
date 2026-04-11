# Tasks: Uncommitted Node Features

**Input**: Design documents from `/specs/037-uncommitted-node-features/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-messages.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Shared Types & Backend Services

**Purpose**: Define cross-boundary contracts, create backend services, and wire up RPC plumbing. MUST complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add FileStageState type ('staged' | 'unstaged' | 'conflicted'), ConflictState interface, and extend FileChange with optional stageState field in shared/types.ts
- [x] T002 Add new RequestMessage types (stageFiles, unstageFiles, stageAll, unstageAll, discardFiles, discardAllUnstaged, stashWithMessage, getConflictState, openStagedDiff) and modify uncommittedChanges ResponseMessage payload to use separated stagedFiles/unstagedFiles/conflictFiles arrays in shared/messages.ts
- [x] T003 [P] Create GitIndexService with stageFiles, unstageFiles, stageAll, unstageAll, discardFiles, and discardAllUnstaged methods using GitExecutor, all returning Result<string, GitError> in src/services/GitIndexService.ts
- [x] T004 [P] Add stashWithMessage(message?: string) method to GitStashService that runs git stash push --include-untracked with optional -m flag, returning Result<string, GitError> in src/services/GitStashService.ts
- [x] T005 [P] Modify GitDiffService.getUncommittedSummary() to return separated stagedFiles and unstagedFiles arrays (each with stageState set) instead of merged files array, keeping existing counts in src/services/GitDiffService.ts
- [x] T006 Add getConflictState() method to GitDiffService that checks for .git/MERGE_HEAD, .git/REBASE_HEAD, .git/CHERRY_PICK_HEAD and lists conflicted files via git diff --name-only --diff-filter=U in src/services/GitDiffService.ts
- [x] T007 Add RPC handlers for stageFiles, unstageFiles, stageAll, unstageAll, discardFiles, discardAllUnstaged, stashWithMessage, getConflictState, and update getUncommittedChanges and getCommitDetails handlers for new payload shape, all following mutation+sendInitialData pattern in src/WebviewProvider.ts
- [x] T008 [P] Add rpcClient methods: stageFiles, unstageFiles, stageAll, unstageAll, discardFiles, discardAllUnstaged, stashWithMessage, getConflictState, openStagedDiff, and update uncommittedChanges response handler for new payload in webview-ui/src/rpc/rpcClient.ts
- [x] T009 [P] Add command preview builder functions for stage, unstage, discard, discard-all, and stash operations in webview-ui/src/utils/gitCommandBuilder.ts
- [x] T010 [P] Update graphStore.setUncommittedChanges to store separated uncommittedStagedFiles, uncommittedUnstagedFiles, uncommittedConflictFiles, and conflictType, and update auto-refresh logic for the new payload shape in webview-ui/src/stores/graphStore.ts

**Checkpoint**: Backend services, RPC handlers, and frontend data layer are complete. All message types defined. Ready for UI implementation.

---

## Phase 2: User Story 1 — View Staged and Unstaged Files Separately (Priority: P1) 🎯 MVP

**Goal**: When the uncommitted node is selected, the details panel displays file changes in separate "Staged Changes" and "Unstaged Changes" sections with file counts and a shared list/tree view toggle.

**Independent Test**: Make changes, stage some via terminal, select the uncommitted node, verify two sections appear with correct files and counts. Toggle list/tree view and verify both sections update.

### Implementation for User Story 1

- [x] T011 [US1] Refactor CommitDetailsPanel to render separate "Staged Changes (X files)" and "Unstaged Changes (X files)" collapsible sections for UNCOMMITTED_HASH, reading from graphStore's separated arrays, with a single list/tree view toggle in the top section header controlling all sections in webview-ui/src/components/CommitDetailsPanel.tsx
- [x] T012 [US1] Hide empty sections — only show "Staged Changes" section when stagedFiles is non-empty, only show "Unstaged Changes" section when unstagedFiles is non-empty in webview-ui/src/components/CommitDetailsPanel.tsx

**Checkpoint**: Selecting the uncommitted node shows separated staged/unstaged sections. MVP deliverable.

---

## Phase 3: User Story 2 — Stage and Unstage Individual Files (Priority: P1)

**Goal**: Each file in the details panel has a stage or unstage action button. Clicking it moves the file between sections immediately.

**Independent Test**: Click stage button on an unstaged file — verify it moves to staged section. Click unstage on a staged file — verify it moves back. Stage an untracked file — verify it moves to staged.

**Depends on**: US1 (sections must exist for buttons to appear within them)

### Implementation for User Story 2

- [x] T013 [US2] Add stage button (up arrow icon) to unstaged files and unstage button (down arrow icon) to staged files in FileActionIcons component, conditionally rendered based on stageState, with onClick calling rpcClient.stageFiles/unstageFiles in webview-ui/src/components/FileChangeShared.tsx

**Checkpoint**: Per-file stage/unstage works from the details panel. Combined with US1, this is a fully functional staging workflow.

---

## Phase 4: User Story 3 — Bulk Stage All and Unstage All (Priority: P2)

**Goal**: Section headers have bulk action buttons — "Stage All" on unstaged header, "Unstage All" on staged header.

**Independent Test**: Click "Stage All" on unstaged section — all files move to staged. Click "Unstage All" on staged section — all files move to unstaged.

**Depends on**: US1 (section headers must exist)

### Implementation for User Story 3

- [x] T014 [US3] Add "Stage All" button to the Unstaged Changes section header and "Unstage All" button to the Staged Changes section header, calling rpcClient.stageAll/unstageAll on click in webview-ui/src/components/CommitDetailsPanel.tsx

**Checkpoint**: Bulk stage/unstage from section headers works.

---

## Phase 5: User Story 4 — Discard Individual File Changes (Priority: P2)

**Goal**: Unstaged files have a discard button that shows a confirmation dialog before reverting changes. Staged files do not have a discard button.

**Independent Test**: Click discard on an unstaged modified file, confirm dialog, verify file disappears. Click discard on an untracked file, confirm, verify file is deleted. Cancel dialog, verify no changes.

**Depends on**: US1 (unstaged section must exist)

### Implementation for User Story 4

- [x] T015 [P] [US4] Create DiscardDialog component with destructive warning, CommandPreview showing the git command, confirm/cancel buttons, using Radix AlertDialog and danger variant styling in webview-ui/src/components/DiscardDialog.tsx
- [x] T016 [US4] Add discard button (trash/revert icon) to unstaged files only in FileActionIcons, with onClick opening DiscardDialog, and on confirm calling rpcClient.discardFiles in webview-ui/src/components/FileChangeShared.tsx

**Checkpoint**: Per-file discard with confirmation works for unstaged files.

---

## Phase 6: User Story 5 — Uncommitted Node Context Menu (Priority: P2)

**Goal**: Right-clicking the uncommitted node shows a context menu with: Stash All Changes, Stage All Changes, Unstage All Changes, Discard All Unstaged Changes, Select files for..., and Open Source Control Panel. Items conditionally shown/hidden based on state.

**Independent Test**: Right-click uncommitted node, verify all menu items. Test Stash All with message input dialog. Test Discard All with confirmation. Verify items hide when no unstaged/staged changes.

**Depends on**: Foundation only (independent of detail panel stories)

### Implementation for User Story 5

- [x] T017 [P] [US5] Create StashDialog component with message text input, CommandPreview showing git stash command, confirm/cancel buttons, using Radix AlertDialog in webview-ui/src/components/StashDialog.tsx
- [x] T018 [P] [US5] Create DiscardAllDialog component with destructive warning for discarding all unstaged changes, CommandPreview, confirm/cancel buttons, using Radix AlertDialog with danger variant in webview-ui/src/components/DiscardAllDialog.tsx
- [x] T019 [US5] Expand UncommittedContextMenu with menu items for Stash All Changes, Stage All Changes, Unstage All Changes, Discard All Unstaged Changes, Select files for..., Open Source Control Panel, with conditional visibility based on uncommittedCounts from graphStore, separator groups, and dialog state management for StashDialog and DiscardAllDialog in webview-ui/src/components/UncommittedContextMenu.tsx

**Checkpoint**: Full context menu with all operations works from the graph node.

---

## Phase 7: User Story 6 — File Selection for Batch Operations (Priority: P3)

**Goal**: "Select files for..." opens a multi-select file picker dialog with files grouped by staged/unstaged status, and action buttons (Stage, Unstage, Stash, Discard) that operate on selected files only.

**Independent Test**: Open file picker from context menu, select 3 of 5 files, click Stage, verify only selected files are staged. Verify action buttons disabled when nothing selected.

**Depends on**: US5 (triggered from context menu)

### Implementation for User Story 6

- [x] T020 [US6] Create FilePickerDialog component with grouped checkboxes (staged/unstaged sections with headers), select-all per section, action buttons (Stage, Unstage, Stash, Discard) disabled when no files selected, Discard showing sub-confirmation, using Radix Dialog in webview-ui/src/components/FilePickerDialog.tsx
- [x] T021 [US6] Wire FilePickerDialog to UncommittedContextMenu "Select files for..." menu item, passing current uncommitted files from graphStore and handling action callbacks in webview-ui/src/components/UncommittedContextMenu.tsx

**Checkpoint**: File picker with grouped selection and batch operations works.

---

## Phase 8: User Story 7 — Merge Conflict State Display (Priority: P3)

**Goal**: When the repo is in a merge/rebase/cherry-pick conflict state, a "Merge Conflicts (X files)" section appears above staged/unstaged sections. Conflict files only have an "open file" button.

**Independent Test**: Create a merge conflict, select uncommitted node, verify Merge Conflicts section appears with correct files. Verify only open file button shown for conflict files. Resolve conflicts, verify section disappears.

**Depends on**: US1 (adds a section to the same panel layout)

### Implementation for User Story 7

- [x] T022 [US7] Add "Merge Conflicts (X files)" section above Staged/Unstaged sections in CommitDetailsPanel, rendered when conflictFiles is non-empty, reading conflictType from graphStore for the section label in webview-ui/src/components/CommitDetailsPanel.tsx
- [x] T023 [US7] Ensure FileActionIcons shows only "open file" button (no stage/unstage/discard) when file stageState is 'conflicted' in webview-ui/src/components/FileChangeShared.tsx

**Checkpoint**: Conflict state is displayed correctly; conflict files have open-only actions.

---

## Phase 9: User Story 8 — Staged File Content Viewing (Priority: P3)

**Goal**: Opening a staged file's content shows the staged version (git index), not the working tree version. Unstaged files show the working tree version.

**Independent Test**: Stage a file, modify it again, open from Staged section — verify staged version shown. Open from Unstaged section — verify working tree version shown.

**Depends on**: US1 (needs separated sections to distinguish staged vs unstaged file clicks)

### Implementation for User Story 8

- [x] T024 [US8] Add staged file content support to openDiff and openFile RPC handlers — when a 'staged' flag is passed, use git show :<path> (index version) instead of working tree, handling the openStagedDiff request type (defined in T002) in src/WebviewProvider.ts
- [x] T025 [US8] Update FileActionIcons to pass stageState context when opening file content, so staged files call rpcClient.openStagedDiff (defined in T008) and unstaged files use the existing openDiff path in webview-ui/src/components/FileChangeShared.tsx

**Checkpoint**: Staged files show correct content from git index. Unstaged files show working tree content.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories.

- [x] T026 Run pnpm typecheck and fix any TypeScript errors across all modified files
- [x] T027 Run pnpm lint and fix any ESLint violations across all modified files
- [x] T028 Run pnpm build and verify clean production build
- [x] T029 Run pnpm test and fix any failing unit tests
- [x] T030 Run quickstart.md smoke test validation — perform full manual test sequence

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Foundational completion — MVP
- **US2 (Phase 3)**: Depends on US1 (needs separated sections)
- **US3 (Phase 4)**: Depends on US1 (needs section headers)
- **US4 (Phase 5)**: Depends on US1 (needs unstaged section)
- **US5 (Phase 6)**: Depends on Foundational only (independent of detail panel stories)
- **US6 (Phase 7)**: Depends on US5 (triggered from context menu)
- **US7 (Phase 8)**: Depends on US1 (adds section to panel)
- **US8 (Phase 9)**: Depends on US1 (needs staged/unstaged distinction)
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Foundation ──► US1 (P1 MVP) ──► US2 (P1)
                              ├─► US3 (P2)
                              ├─► US4 (P2)
                              ├─► US7 (P3)
                              └─► US8 (P3)
           ──► US5 (P2) ──► US6 (P3)
```

- **US1** and **US5** can run in parallel after Foundation
- **US2, US3, US4, US7, US8** all depend on US1 but are independent of each other
- **US6** depends only on US5

### Parallel Opportunities Within Foundation

```
After T001 + T002:
  Parallel group: T003, T004, T005 (different service files)
  Parallel group: T008, T009, T010 (different frontend files)
After T005:
  T006 (same file as T005)
After T003, T004, T005, T006:
  T007 (WebviewProvider uses all services)
```

---

## Parallel Example: Foundation Phase

```
# Step 1: Sequential — shared contracts
T001: shared/types.ts
T002: shared/messages.ts

# Step 2: Parallel — backend services + frontend plumbing
T003: GitIndexService.ts       |  T008: rpcClient.ts
T004: GitStashService.ts       |  T009: gitCommandBuilder.ts
T005: GitDiffService.ts (part1)|  T010: graphStore.ts

# Step 3: Sequential — remaining backend
T006: GitDiffService.ts (part2, after T005)
T007: WebviewProvider.ts (after T003-T006)
```

## Parallel Example: User Stories After Foundation

```
# Can run in parallel:
US1: CommitDetailsPanel sections  |  US5: UncommittedContextMenu + dialogs

# After US1 completes, can run in parallel:
US2: Stage/unstage buttons  |  US3: Section header buttons  |  US4: Discard button + dialog

# After US5 completes:
US6: FilePickerDialog
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001-T010)
2. Complete Phase 2: User Story 1 (T011-T012)
3. **STOP and VALIDATE**: Select uncommitted node, verify staged/unstaged sections appear correctly
4. Ready for demo — users can see their staging state at a glance

### Incremental Delivery

1. Foundation → US1 → **MVP** (view separated files)
2. Add US2 → **Stage/unstage individual files** (core workflow)
3. Add US3 + US4 → **Bulk operations + discard** (convenience + safety)
4. Add US5 → **Context menu** (quick access from graph)
5. Add US6 → **File picker** (power user batch ops)
6. Add US7 + US8 → **Conflict display + staged content** (correctness)
7. Polish → Final validation

### Parallel Team Strategy

With two developers:

1. Team completes Foundation together
2. Once Foundation is done:
   - Developer A: US1 → US2 → US3 → US4 → US7 → US8
   - Developer B: US5 → US6
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable once its dependencies are met
- All backend mutation handlers follow the existing pattern: execute → success message → sendInitialData() → or error message
- All new dialogs follow existing patterns: Radix AlertDialog/Dialog + CommandPreview + danger variant for destructive ops
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
