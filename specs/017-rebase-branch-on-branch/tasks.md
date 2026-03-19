# Tasks: Rebase Branch on Branch Badge Context Menu

**Input**: Design documents from `/specs/017-rebase-branch-on-branch/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not requested in the feature specification. No test tasks included.

**Organization**: Tasks are grouped by user story. This feature requires only a single file change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Rebase current branch onto another branch via badge (Priority: P1) 🎯 MVP

**Goal**: Make the "Rebase Current Branch onto This" menu item visible on branch badges whenever the equivalent commit-row rebase would be visible, by relaxing the ancestor check and adding missing guards.

**Independent Test**: Check out a feature branch, right-click on another branch's badge (including ancestor branches like `main`), and verify the "Rebase Current Branch onto This" menu item appears. Verify it is hidden for: the current branch's own badge, a badge on the HEAD commit, and in detached HEAD state.

### Implementation for User Story 1

- [x] T001 [US1] Update `canRebaseOnto` condition in `webview-ui/src/components/BranchContextMenu.tsx`: remove `!mergedCommits.some((c) => c.hash === targetHash)` check, add `!!headBranch` guard (FR-006: detached HEAD), add `targetHash !== headBranch.hash` guard (FR-004: same commit as HEAD)
- [x] T002 [US1] Remove unused `mergedCommits` store selector (`useGraphStore((s) => s.mergedCommits)`) and update the comment on line 88 in `webview-ui/src/components/BranchContextMenu.tsx`

**Checkpoint**: Rebase option now appears on branch badges for all branches meeting visibility conditions (including ancestor branches like `main`). Hidden correctly for current branch, HEAD commit, detached HEAD, and during in-progress rebase.

---

## Phase 2: User Story 2 - Consistent behavior between branch badge and commit row rebase (Priority: P2)

**Goal**: Verify that the branch badge rebase visibility is now consistent with the commit-row rebase visibility across all scenarios.

**Independent Test**: For each scenario where the commit row shows "Rebase Current Branch onto This Commit", right-click the corresponding branch badge and confirm the rebase option also appears. Trigger a rebase from the branch badge and confirm the result is identical to rebasing from the commit row.

### Implementation for User Story 2

- [ ] T003 [US2] Manual smoke test: verify consistency between branch badge and commit row rebase visibility across all acceptance scenarios (ancestor branch, non-ancestor branch, same commit as HEAD, current branch, detached HEAD, rebase in progress, remote-only branch, tags) in `webview-ui/src/components/BranchContextMenu.tsx` *(requires manual VS Code testing)*

**Checkpoint**: Branch badge and commit row rebase options appear/hide in identical scenarios.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Build validation

- [x] T004 Run `pnpm typecheck` to verify zero TypeScript errors
- [x] T005 Run `pnpm lint` to verify zero ESLint errors
- [x] T006 Run `pnpm build` to verify clean build of both extension and webview

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies — can start immediately
- **User Story 2 (Phase 2)**: Depends on User Story 1 completion (T001-T002 must be done before smoke testing)
- **Polish (Phase 3)**: Depends on User Story 1 completion (code changes must be done before validation)

### Within User Story 1

- T001 must complete before T002 (T002 cleans up the selector that T001 makes unused)

### Parallel Opportunities

- T004, T005, T006 (Polish) can run in parallel after T001-T002 are complete
- US2 (T003) and Polish (T004-T006) can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Update `canRebaseOnto` condition
2. Complete T002: Remove unused `mergedCommits` selector
3. **STOP and VALIDATE**: Run typecheck + lint + build, then smoke test in VS Code

### Incremental Delivery

1. T001-T002 → Core fix delivered (MVP)
2. T003 → Consistency verified across all scenarios
3. T004-T006 → Build validation passed

---

## Notes

- This entire feature touches only **1 file**: `webview-ui/src/components/BranchContextMenu.tsx`
- No new files, types, state, or dependencies are introduced
- The existing rebase confirmation dialog, backend workflow, and `rpcClient.rebase()` call are reused without modification
- The menu item label "Rebase Current Branch onto This" and the confirmation dialog already exist — only the visibility condition changes
