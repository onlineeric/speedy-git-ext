---

description: "Task list for feature 045-revert-mode-dialog"
---

# Tasks: Revert Commit dialog with mode selection

**Input**: Design documents from `/specs/045-revert-mode-dialog/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-revert.md, quickstart.md

**Tests**: Tests ARE requested. Spec SC-007 mandates retained `GitRevertService` coverage plus new coverage for each mode's success / conflict / empty-revert paths. Test tasks are interleaved per user story below.

**Organization**: Tasks are grouped by user story. US1 = Commit now (P1, MVP / behavior parity with today), US2 = Stage only (P2), US3 = Edit message (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Path Conventions

VS Code extension layout:

- `shared/` — cross-boundary types & messages
- `src/` — extension host (backend), tests under `src/__tests__/`
- `webview-ui/src/` — webview (frontend), tests under `webview-ui/src/**/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new tooling, no new directories, no new dependencies required. Verify the working environment is clean and a feature branch is checked out.

- [x] T001 Confirm branch `045-revert-mode-dialog` is checked out (`git branch --show-current`); ensure a clean working tree before starting (commit, stash, or discard any unrelated edits).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, error code, RPC payload re-shape, store slice, and command-builder updates that all three user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Add `RevertMode` union type and `RevertOptions` interface to `shared/types.ts` (after the existing `RevertState` declaration ~line 319).
- [x] T003 [P] Add `'REVERT_CONFLICT_NO_RECOVERY'` to the `GitErrorCode` union in `shared/errors.ts`.
- [x] T004 Re-shape the `revert` request variant in `shared/messages.ts` from `{ hash, mainlineParent? }` to `{ hash, options: RevertOptions }` (line ~73). Add the `RevertOptions` import.
- [x] T005 Update `rpcClient.revert(...)` signature in `webview-ui/src/rpc/rpcClient.ts` (line ~461) to `revert(hash: string, options: RevertOptions): void`; update the `send({ type: 'revert', payload: ... })` call to pass `{ hash, options }`.
- [x] T006 Add a `revertOptions: RevertOptions` slice and `setRevertOptions` setter to `webview-ui/src/stores/graphStore.ts`, mirroring the existing `cherryPickOptions` pattern at lines 72 / 173 / 267 / 528. Default value: `{ mode: 'commit' }`.
- [x] T007 [P] Extend `RevertCommandOptions` in `webview-ui/src/utils/gitCommandBuilder.ts` (lines 34–37) to add `mode: RevertMode`; update `buildRevertCommand` (lines 116–123) to emit:
  - `git revert --no-edit [-m N] <hash>` for `mode === 'commit'`
  - `git revert --no-commit [-m N] <hash>` for `mode === 'no-commit'`
  - `git revert [-m N] <hash>` for `mode === 'edit-message'`
- [x] T008 [P] Update existing tests and add new ones in `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts` (around line 137) covering all three modes × (with mainlineParent / without mainlineParent).

**Checkpoint**: Types compile; command-builder unit tests pass; store slice initializes with `{ mode: 'commit' }`. No behavioral change visible to users yet.

---

## Phase 3: User Story 1 - Commit now mode (Priority: P1) 🎯 MVP

**Goal**: Preserve today's revert-to-create-commit behavior behind the new dialog. The dialog opens on right-click → Revert Commit; the user accepts the default mode and gets a revert commit identical to what today's direct-action would produce. Merge-commit parent picker is inlined; existing Continue Revert / Abort Revert recovery flow continues to work for `REVERT_CONFLICT`.

**Independent Test**: From a clean working tree on a non-merge commit, right-click → Revert Commit → Revert. The resulting commit equals what `git revert --no-edit <hash>` produces in a terminal. On a merge commit, the dialog shows the parent picker; selecting `Parent 1` produces the same commit as `git revert -m 1 --no-edit <hash>`. On a forced conflict, the existing Continue/Abort flow recovers cleanly.

### Tests for User Story 1 (write FIRST, ensure they FAIL before implementation)

- [x] T009 [P] [US1] In `src/__tests__/GitRevertService.test.ts`, refactor the existing tests to pass `{ mode: 'commit' }` (and `mainlineParent` where applicable) via the new `options` parameter. The cases at lines 16–104 ("rejects invalid hash", "dirty tree", "mainlineParent", "REVERT_IN_PROGRESS", "empty revert", "REVERT_CONFLICT") MUST all still pass with the new signature.
- [x] T010 [P] [US1] Add a fresh test in `src/__tests__/GitRevertService.test.ts` asserting that `mode: 'commit'` produces the exact argv `['revert', '--no-edit', '<hash>']` (no mainline parent) and that `mode: 'commit'` with `mainlineParent: 2` produces `['revert', '-m', '2', '--no-edit', '<hash>']`. These guard against accidental flag-ordering regressions.

### Implementation for User Story 1

- [x] T011 [US1] Refactor `GitRevertService.revert` signature in `src/services/GitRevertService.ts` from `revert(hash, mainlineParent?)` to `revert(hash: string, options: RevertOptions): Promise<Result<string>>`. Inside, switch on `options.mode`:
  - `commit`: existing body (lines 40–86) re-used verbatim — pull `mainlineParent` from `options.mainlineParent`.
  - `no-commit`: `return err(new GitError('Stage-only revert not yet implemented (US2 — task T020).', 'COMMAND_FAILED'));` (placeholder, replaced in US2). Per Constitution Principle III, git operations MUST return `Result<T, GitError>` — never `throw`. The dialog in US1 only renders the Commit-now radio so this branch is unreachable at runtime, but the type system still requires a valid `Result` return.
  - `edit-message`: `return err(new GitError('Edit-message revert not yet implemented (US3 — task T028).', 'COMMAND_FAILED'));` (placeholder, replaced in US3). Same unreachability + Result-return note.
- [x] T012 [US1] Update `WebviewProvider.ts` `case 'revert'` (lines 1430–1449) to read `message.payload.options` (the new `RevertOptions` object) and forward it to `gitRevertService.revert(hash, options)`. The success / `REVERT_CONFLICT` / generic-error response handling stays identical.
- [x] T013 [US1] Create `webview-ui/src/components/RevertDialog.tsx` as a clone of `CherryPickDialog.tsx` structure (Radix Dialog, theme tokens, button layout). For US1 it includes:
  - Title "Revert Commit" (or "Revert Merge Commit" when `commit.parents.length > 1`)
  - Commit summary `<abbrev-hash> — <subject>`
  - Mainline-parent radio group (only when merge commit) — same shape as `CherryPickDialog` lines 64–97
  - A mode-radio block containing ONLY the "Commit now (`--no-edit`)" radio for now (US2/US3 will add the other two radios in the same block)
  - `CommandPreview` line wired to `buildRevertCommand({ hash, mode, mainlineParent? })` — reuses the existing `webview-ui/src/components/CommandPreview.tsx` component, which already provides the selectable input + Copy button required by FR-006 (no new copy-button logic needed)
  - Cancel + Revert buttons. Revert button disabled when merge-commit parent is unselected.
  - On confirm: read `revertOptions` from store, send via `rpcClient.revert(hash, { mode: 'commit', mainlineParent? })`, call `setRevertOptions({ mode: 'commit' })`.
- [x] T014 [US1] Update `webview-ui/src/components/CommitContextMenu.tsx`:
  - Replace `handleRevertSelect` (lines 204–218) so it ALWAYS opens the new `RevertDialog`, fetching `commitParents` first for merge commits (existing logic) and passing them into the dialog. The branch that called `rpcClient.revert(commit.hash)` directly for non-merge commits is removed.
  - Replace the `<RevertParentDialog>` JSX at lines 488–498 with `<RevertDialog open=... commit=... parents=... onConfirm=... onCancel=... />`.
  - Remove the `RevertParentDialog` import (line 15) and the `revertParents` state if no longer needed beyond passing to the new dialog.
- [x] T015 [US1] Delete `webview-ui/src/components/RevertParentDialog.tsx` (consolidated into `RevertDialog.tsx`).

**Checkpoint**: Commit-now mode works end-to-end through the new dialog. Non-merge and merge-commit reverts produce identical commits to today's flow. Continue Revert / Abort Revert items remain visible after a conflict. All existing `GitRevertService.test.ts` cases pass under the new signature.

---

## Phase 4: User Story 2 - Stage only mode (Priority: P2)

**Goal**: Add the "Stage only" mode that applies the inverse changes to the index and working tree via `git revert --no-commit` without producing a commit. Conflicts in this mode return a one-shot `REVERT_CONFLICT_NO_RECOVERY` toast and do NOT enter the revert-in-progress UI state (because git does not set `REVERT_HEAD` for `--no-commit`).

**Independent Test**: From a clean working tree, open the dialog on a non-merge commit, switch to **Stage only**, confirm. The Source Control panel shows the inverse changes staged; no new commit appears on the graph. On a merge commit, the parent picker still works. On a forced conflict, an error toast appears but no `REVERT_HEAD` is set and no Continue/Abort items appear.

### Tests for User Story 2 (write FIRST, ensure they FAIL before implementation)

- [x] T016 [P] [US2] In `src/__tests__/GitRevertService.test.ts`, add a test asserting `mode: 'no-commit'` produces argv `['revert', '--no-commit', '<hash>']` (and `['revert', '-m', '<N>', '--no-commit', '<hash>']` when `mainlineParent` is set).
- [x] T017 [P] [US2] Add a test asserting that when `mode: 'no-commit'` and git's stderr contains "CONFLICT", the service returns `Result.err` with code `REVERT_CONFLICT_NO_RECOVERY` (NOT `REVERT_CONFLICT`). Verify the message string references the SCM panel and manual commit.
- [x] T018 [P] [US2] Add a test asserting that when `mode: 'no-commit'` and git's stderr contains "nothing to commit", the service returns the same "already present" error used by Commit-now mode.
- [x] T019 [P] [US2] Add a test asserting that `mode: 'no-commit'` still rejects a dirty working tree with the existing "uncommitted changes" error (per FR-016, strict policy).

### Implementation for User Story 2

- [x] T020 [US2] In `src/services/GitRevertService.ts`, replace the `no-commit` branch placeholder from T011 with the real implementation:
  - Reuse the dirty-tree precondition (already at the top of `revert`).
  - Reuse the in-progress (`REVERT_HEAD`) precondition.
  - Build args: `['revert', '--no-commit']` + (`-m <N>` if mainlineParent) + `[<hash>]`.
  - On success: return `ok('Reverted <abbrev> — changes staged. Commit when ready.')`.
  - On stderr-match "nothing to commit" / "nothing to revert": return the existing "already present" error.
  - On stderr-match via `isConflictStderr` (NO `REVERT_HEAD` check here — git doesn't set it): return `err(new GitError('Revert paused due to conflict. Resolve conflicts in the Source Control panel, then commit the result manually (this mode does not enter git's revert state machine, so there is no Continue/Abort step).', 'REVERT_CONFLICT_NO_RECOVERY'))`.
  - Otherwise propagate `result.error`.
- [x] T021 [US2] In `src/WebviewProvider.ts` `case 'revert'`, branch on `result.error.code`:
  - `'REVERT_CONFLICT'` → existing behavior (post `revertState: 'in-progress'`).
  - `'REVERT_CONFLICT_NO_RECOVERY'` → post the error AND `revertState: 'idle'` (so Continue/Abort items do NOT appear).
  - other errors → existing path.
- [x] T022 [US2] In `webview-ui/src/components/RevertDialog.tsx`, add the second radio "Stage only (`--no-commit`)" to the mode-radio block. Wire its selection to the local `mode` state. On confirm with `mode === 'no-commit'`, send via `rpcClient.revert(hash, { mode: 'no-commit', mainlineParent? })`.

**Checkpoint**: Stage-only mode works. Inverse changes appear in the VS Code SCM panel. Conflicts surface as a one-shot error toast without entering the revert-in-progress UI state. All US1 tests still pass.

---

## Phase 5: User Story 3 - Edit message mode (Priority: P3)

**Goal**: Add the "Edit message" mode that lets the user type a custom commit message in the dialog. Internally executed as a two-step `git revert --no-commit [-m N] <hash>` followed by `git commit -m "<message>"`. Empty-after-step-1 case (no net change) aborts before step 2 to avoid empty commits. Conflicts at step 1 surface as `REVERT_CONFLICT_NO_RECOVERY`. Step-2 hook failures propagate as `COMMAND_FAILED` with git's stderr, leaving inverse changes staged for manual recovery.

**Independent Test**: From a clean working tree, open the dialog on a non-merge commit, switch to **Edit message**. A textarea appears pre-filled with `Revert "<subject>"\n\nThis reverts commit <full-hash>.`. Edit the message to a custom string, confirm. A new commit appears on the graph with exactly the message typed (no normalization beyond trailing-whitespace-on-last-line trim) and the diff is the inverse of the selected commit. Empty/whitespace-only message disables the Revert button.

### Tests for User Story 3 (write FIRST, ensure they FAIL before implementation)

- [x] T023 [P] [US3] In `src/__tests__/GitRevertService.test.ts`, add a happy-path test for `mode: 'edit-message'`: assert the service executes the two-step sequence (revert --no-commit, then commit -m '<msg>'), in order, with the user's message verbatim.
- [x] T024 [P] [US3] Add a test for the empty-after-step-1 case: revert --no-commit succeeds but `git diff --cached --quiet` exits 0 → service returns "already present" error and step 2 (`git commit`) is NEVER called.
- [x] T025 [P] [US3] Add a test for step-1 conflict: stderr contains CONFLICT → service returns `REVERT_CONFLICT_NO_RECOVERY` and step 2 (`git commit`) is NEVER called.
- [x] T026 [P] [US3] Add a test for step-2 hook failure: revert --no-commit succeeds, diff --cached --quiet exits non-zero (something staged), then `git commit -m "..."` fails with stderr "pre-commit hook failed" → service returns `Result.err` with code `COMMAND_FAILED`, message contains the hook stderr. Verify the executor is called exactly three times (revert --no-commit + diff --cached --quiet + commit -m) and no fourth cleanup invocation (`git reset`, `git stash`, etc.) occurs after the commit step's failure — i.e., the service does NOT auto-clean staged changes on commit failure.
- [x] T027 [P] [US3] Add a test for validation: `mode: 'edit-message'` with `options.message` undefined or whitespace-only → service returns `Result.err` with code `VALIDATION_ERROR` BEFORE running any git command.

### Implementation for User Story 3

- [x] T028 [US3] In `src/services/GitRevertService.ts`, replace the `edit-message` branch placeholder from T011 with the real two-step implementation:
  - First validate `options.message` is non-empty after trim; else return `VALIDATION_ERROR`.
  - Reuse the dirty-tree precondition and in-progress precondition (already at the top of `revert`).
  - **Step 1**: execute `['revert', '--no-commit']` + (`-m <N>` if mainlineParent) + `[<hash>]`. Map errors as in T020 (empty → "already present"; conflict → `REVERT_CONFLICT_NO_RECOVERY`; other → propagate).
  - **Between steps**: execute `['diff', '--cached', '--quiet']`. Exit 0 (success) means nothing staged → return "already present" error WITHOUT calling step 2.
  - **Step 2**: execute `['commit', '-m', options.message]`. On failure, propagate `result.error` (typically `COMMAND_FAILED` for hook rejections); leave staged changes in place.
  - On full success: return `ok('Reverted <abbrev> with custom message.')`.
- [x] T029 [US3] In `webview-ui/src/components/RevertDialog.tsx`:
  - Add the third radio "Edit message (no flag; opens editor natively)" to the mode-radio block (label matches spec FR-002 exactly).
  - When `mode === 'edit-message'`, render a multi-line `textarea` (Tailwind sized to ~6 rows, vscode theme tokens, vertical scroll) pre-filled via an inline helper `defaultRevertMessage(commit)` returning `Revert "<subject>"\n\nThis reverts commit <hash>.`.
  - Local state `message` initialized from `defaultRevertMessage(commit)` on first render and reset whenever the dialog opens with a different `commit.hash`.
  - Disable the Revert button whenever `mode === 'edit-message' && message.trim().length === 0`.
  - On confirm with `mode === 'edit-message'`, send via `rpcClient.revert(hash, { mode: 'edit-message', message, mainlineParent? })`.
  - **Message-preservation on error (FR-012)**: when `mode === 'edit-message'`, the dialog MUST NOT auto-close on confirm. It stays open in a "submitting…" state (Revert button disabled, spinner or "Reverting…" label) until either a `success` response arrives (→ close dialog and reset) OR an `error` response arrives (→ re-enable the dialog with the typed message still in the textarea, so the user can copy it, edit it, and retry). Subscribe to the existing store-level last-response signal or an explicit success/error callback wired through `onConfirm` to detect completion. For modes `commit` and `no-commit`, the existing close-on-confirm behavior stands (no message to preserve).

**Checkpoint**: Edit-message mode works. Default pre-fill matches git's standard format. Empty message disables the button. Custom messages produce commits with exactly that message. Empty-after-step-1 is detected before step 2 runs. Step-1 conflicts and step-2 hook failures surface correctly without leaving the repo in a partially-resolved state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Update agent context, walk through the manual smoke-test recipe, run automated gates.

- [x] T030 [P] Update the `## Recent Changes` section of `CLAUDE.md` (around line 184) to add a one-line entry: `- 045-revert-mode-dialog: Three-mode Revert Commit dialog (Commit now / Stage only / Edit message) with inline mainline-parent picker, replacing the direct-action menu item and the standalone RevertParentDialog`.
- [x] T031 [P] Update `webview-ui/src/components/CommitContextMenu.tsx` if any unused imports remain (e.g. `RevertParentDialog`, `revertParents` state, `CommitParentInfo` import if no longer referenced elsewhere in the file). Pure dead-code cleanup. *(No stale imports — `RevertParentDialog` import already removed in T014; `CommitParentInfo` and `revertParents` are still in use to pass merge-commit parents into the new dialog.)*
- [ ] T032 Awaiting human validation in Extension Development Host. Walk through `specs/045-revert-mode-dialog/quickstart.md` end-to-end:
  - Happy paths A (Commit now), B (Stage only), C (Edit message)
  - Merge-commit path for all three modes
  - Visibility table
  - Persistence of last-used mode
  - Cancel & Escape
  - Error paths A (dirty tree, all 3 modes), B (empty revert, all 3 modes), C (Commit-now conflict + recovery), D (Stage-only conflict, no recovery), E (Edit-message conflict, no recovery), F (operation in progress).
- [x] T033 Run the automated gates from the repo root and confirm zero errors: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. *(All four pass — typecheck clean, lint clean after adding `.claude/` to ignores, 475 tests pass, build OK.)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: trivial — branch confirmation only.
- **Phase 2 (Foundational)**: depends on Phase 1. BLOCKS all user stories. T002, T003, T006, T007 can run in parallel (different files); T004 depends on T002; T005 depends on T004; T008 depends on T007.
- **Phase 3 (US1 / P1 / MVP)**: depends on Phase 2 complete.
- **Phase 4 (US2 / P2)**: depends on Phase 3 complete — US2 modifies the same `GitRevertService.ts` / `RevertDialog.tsx` / `WebviewProvider.ts` files as US1 and assumes the refactored signature & dialog scaffold are in place.
- **Phase 5 (US3 / P3)**: depends on Phase 4 complete — US3 modifies the same files again to add the third branch / radio / textarea.
- **Phase 6 (Polish)**: depends on Phase 5 complete (or earlier checkpoint if shipping MVP only — see Implementation Strategy).

### Within Each User Story

- Tests within a story marked [P] can run in parallel (all in the same test file but independent test cases).
- Each user story's implementation tasks are sequential because they share files (`GitRevertService.ts`, `RevertDialog.tsx`, `WebviewProvider.ts`).

### Parallel Opportunities

- **Phase 2**: T002 (types) ∥ T003 (errors) ∥ T007 (command builder); then T008 ∥ T006 once T002/T007 settle.
- **Phase 3 tests**: T009 ∥ T010 (both in `GitRevertService.test.ts`, but adding independent `describe` blocks / cases).
- **Phase 4 tests**: T016 ∥ T017 ∥ T018 ∥ T019 (independent test cases).
- **Phase 5 tests**: T023 ∥ T024 ∥ T025 ∥ T026 ∥ T027 (independent test cases).
- **Phase 6**: T030 ∥ T031 (different files).

### Cross-Story Independence

Each story phase ends in a working, releasable state of the feature:

- **After US1**: today's revert behavior is preserved behind the new dialog. If we stopped here, no functional regression and the dialog framework is in place.
- **After US2**: Stage-only mode added. Two radios visible.
- **After US3**: All three modes shipped. Three radios visible. Feature spec-complete.

---

## Parallel Example: Phase 2 Foundational

```bash
# Once T001 (branch check) is done, run in parallel:
Task: "T002 Add RevertMode + RevertOptions to shared/types.ts"
Task: "T003 Add REVERT_CONFLICT_NO_RECOVERY to shared/errors.ts"
Task: "T007 Extend buildRevertCommand in webview-ui/src/utils/gitCommandBuilder.ts"

# Then, in parallel:
Task: "T008 Add buildRevertCommand tests for 3 modes"
Task: "T006 Add revertOptions slice + setter to graphStore.ts"

# Sequentially after T002:
Task: "T004 Reshape revert payload in shared/messages.ts"
Task: "T005 Update rpcClient.revert signature"
```

## Parallel Example: User Story 3 tests

```bash
# All independent test cases in the same file; run as parallel describe blocks:
Task: "T023 [US3] Happy-path two-step test in GitRevertService.test.ts"
Task: "T024 [US3] Empty-after-step-1 test in GitRevertService.test.ts"
Task: "T025 [US3] Step-1 conflict test in GitRevertService.test.ts"
Task: "T026 [US3] Step-2 hook-failure test in GitRevertService.test.ts"
Task: "T027 [US3] Pre-validation test (empty message) in GitRevertService.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — shared types, error code, payload, store slice, command builder, tests.
3. Complete Phase 3 (User Story 1) — Commit-now mode wired through new dialog; existing revert behavior preserved.
4. **STOP and VALIDATE**: walk Quickstart Happy Path A + Error paths A & C (Commit-now conflict + recovery).
5. If shipping internally only, this is releasable — but per FR-002 the dialog must show all three radios; the MVP "stop" point is therefore for internal validation, not for release.

### Incremental Delivery (Recommended)

1. Phase 1 → 2 → 3 → validate Commit-now mode (regression check).
2. Phase 4 → validate Stage-only mode end-to-end (Happy path B + Error paths A/B/D).
3. Phase 5 → validate Edit-message mode end-to-end (Happy path C + Error paths A/B/E).
4. Phase 6 → full Quickstart walk-through + automated gates → ready to merge.

### Single-Developer Linear Order

This feature is owned by one developer; parallelism is mostly intra-story (multiple test cases or multiple shared/* files at once). The sequence is: T001 → T002∥T003∥T007 → T004 → T005 → T006 → T008 → T009∥T010 → T011 → T012 → T013 → T014 → T015 → T016..T019 (parallel) → T020 → T021 → T022 → T023..T027 (parallel) → T028 → T029 → T030∥T031 → T032 → T033.

---

## Notes

- `[P]` tasks are confirmed-independent (different files OR independent test cases in the same file).
- Every task has an exact file path so it is executable without further lookup.
- The new tests should be added BEFORE their corresponding implementation task and observed to FAIL first (TDD discipline).
- No git commits, no merges, no pushes are part of these tasks — per the constitution's agent restrictions, the developer drives all version-control actions.
- Per the constitution, agents MUST NOT install packages; this feature requires no new dependencies, so no install step is needed.
