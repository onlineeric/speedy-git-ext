# Tasks: Fix Checkout with Uncommitted Changes Behavior

**Input**: Design documents from `/specs/013-fix-checkout-stash/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not requested in the feature specification. Manual smoke testing via quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this is a modification to an existing extension. Skip to Foundational.

*(No tasks in this phase)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the new error code and conflict detection helper that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Add `isCheckoutConflict(error: GitError): boolean` helper function in src/services/GitBranchService.ts that checks if `error.message` contains `"would be overwritten by checkout"` and returns a boolean. No new error code needed — the helper is the sole detection mechanism.

**Checkpoint**: Foundation ready — conflict detection helper is in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Checkout Branch with Non-Conflicting Uncommitted Changes (Priority: P1) 🎯 MVP

**Goal**: When checking out a branch with non-conflicting uncommitted changes, the checkout succeeds silently without any stash dialog, matching native `git checkout` behavior.

**Independent Test**: Make non-conflicting changes in a file, then checkout another branch via the context menu. The checkout should succeed silently with changes preserved in the working tree.

### Implementation for User Story 1

- [x] T002 [US1] Rewrite the `checkoutBranch` handler in src/WebviewProvider.ts to remove the `isDirtyWorkingTree()` pre-check and instead attempt `checkout()` directly. On success, proceed with the existing success path (optional pull, refresh UI). This task only handles the success path — conflict handling is US2.

**Checkpoint**: Checkout branch with non-conflicting changes now works silently. The conflict path is a no-op (falls through to generic error) until US2 is implemented.

---

## Phase 4: User Story 2 — Checkout Branch with Conflicting Uncommitted Changes (Priority: P1)

**Goal**: When checking out a branch with conflicting uncommitted changes, show a dialog offering "Stash & Checkout" or "Cancel", reusing the existing `checkoutNeedsStash` message and stash confirmation dialog.

**Independent Test**: Modify a file that differs between the current and target branch, then attempt checkout. A dialog should appear offering to stash and checkout.

### Implementation for User Story 2

- [x] T003 [US2] Add conflict-detection branching to the `checkoutBranch` handler in src/WebviewProvider.ts: when checkout fails and `isCheckoutConflict(error)` is true, send `checkoutNeedsStash` response (with `pull` flag preserved). For non-conflict errors, send the existing error response. This completes the attempt-first, detect-conflict-on-failure pattern for branch checkout.

**Checkpoint**: Branch checkout now fully matches git's native behavior — silent success for non-conflicting changes, stash dialog for conflicts, error message for other failures.

---

## Phase 5: User Story 3 — Checkout Commit (Detached HEAD) with Uncommitted Changes (Priority: P1)

**Goal**: When checking out a specific commit with non-conflicting uncommitted changes, the checkout succeeds without forcing a stash, and when changes conflict, a stash dialog appears — matching `git checkout <hash>` behavior.

**Independent Test**: Make non-conflicting changes, then checkout a commit via the context menu. The checkout should succeed with changes preserved. Then test with conflicting changes — a dialog should appear.

### Implementation for User Story 3

- [x] T004 [US3] Rewrite the `checkoutCommit` handler in src/WebviewProvider.ts to remove the `isDirtyWorkingTree()` pre-check and instead attempt checkout directly. On success, proceed with the existing success path. On failure with `isCheckoutConflict(error)`, send `checkoutCommitNeedsStash` response. On other failures, send the existing error response.

**Checkpoint**: Commit checkout now matches git's native behavior, consistent with branch checkout.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup

- [x] T005 Run `pnpm typecheck` and fix any type errors
- [x] T006 Run `pnpm lint` and fix any lint errors
- [x] T007 Run `pnpm build` and verify clean build
- [x] T008 Run quickstart.md manual smoke test scenarios (all 6 scenarios: 3 for branch checkout, 3 for commit checkout, plus stash dialog and cancel flows, plus edge cases: staged conflicts trigger dialog, both staged+unstaged changes handled correctly, stash failure shows error message)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately
- **User Story 1 (Phase 3)**: Depends on Phase 2 (needs `isCheckoutConflict` helper)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (builds on the rewritten `checkoutBranch` handler)
- **User Story 3 (Phase 5)**: Depends on Phase 2 only (modifies a different handler than US1/US2)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2). Modifies `checkoutBranch` handler — success path only.
- **User Story 2 (P1)**: Depends on User Story 1 (Phase 3). Adds conflict handling to the same `checkoutBranch` handler rewritten in US1.
- **User Story 3 (P1)**: Depends on Foundational (Phase 2) only. Modifies `checkoutCommit` handler (separate from US1/US2).

### Within Each User Story

- Each story has a single implementation task (small, focused changes)
- No model/service/endpoint layering needed — changes are surgical modifications to existing handlers

### Parallel Opportunities

- US1 (T002) and US3 (T004) modify different handlers in the same file — they CAN run in parallel if care is taken, but sequential execution is safer since both modify src/WebviewProvider.ts
- US2 (T003) MUST follow US1 (T002) since it adds to the same handler
- All Polish tasks (T005–T008) are sequential (each validates the prior)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001)
2. Complete Phase 3: User Story 1 (T002)
3. **STOP and VALIDATE**: Test branch checkout with non-conflicting changes
4. This alone fixes the most common user-facing issue

### Incremental Delivery

1. Complete Foundational → Conflict detection helper ready
2. Add User Story 1 → Non-conflicting branch checkout works → Validate
3. Add User Story 2 → Conflicting branch checkout shows dialog → Validate
4. Add User Story 3 → Commit checkout matches branch checkout behavior → Validate
5. Polish → Type check, lint, build, full smoke test

### Recommended Execution Order (Single Developer)

Since all changes are in ~2 files and closely related:

1. T001 (foundational helper)
2. T002 → T003 (branch checkout: success path then conflict path)
3. T004 (commit checkout: both paths)
4. T005 → T006 → T007 → T008 (validation)

---

## Notes

- All 3 user stories are P1 — this is a bug fix, not a feature addition
- Zero frontend changes required — the webview UI already handles stash dialogs correctly
- The existing `stashAndCheckout` and `stashAndCheckoutCommit` handlers are NOT modified
- The `isDirtyWorkingTree()` method can be left in place (may be used elsewhere) — we simply stop calling it in the checkout handlers
- No new `GitErrorCode` needed — `isCheckoutConflict()` boolean helper is sufficient for the handler branching logic
- Detection string: `"would be overwritten by checkout"` — stable across git versions since 2.0
