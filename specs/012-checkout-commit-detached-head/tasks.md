# Tasks: Checkout Commit (Detached HEAD)

**Input**: Design documents from `/specs/012-checkout-commit-detached-head/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/messages.md ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks grouped by user story. Phase 2 (shared types) is the only blocking prerequisite — backend and frontend can proceed in parallel once it is complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task description

---

## Phase 1: Setup

**Purpose**: Confirm project baseline before making any changes.

- [X] T001 Verify baseline build passes: run `pnpm build && pnpm typecheck` from repo root and confirm zero errors before modifying any files

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend shared message-type contracts — required before ANY backend handler or frontend RPC call can compile.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Extend `shared/messages.ts`: add `checkoutCommit` and `stashAndCheckoutCommit` to the `RequestMessage` union and `REQUEST_TYPES` map; add `checkoutCommitNeedsStash` to the `ResponseMessage` union and `RESPONSE_TYPES` map, with payload `{ hash: string }` on all three (see `contracts/messages.md` for full shapes)

**Checkpoint**: Shared types compile — backend handlers and frontend RPC can now be implemented in parallel.

---

## Phase 3: User Story 1 — Checkout Commit via Right-Click Menu (Priority: P1) 🎯 MVP

**Goal**: Right-clicking any commit row shows "Checkout this commit". Confirming the detached HEAD dialog checks out the repository to that commit (clean working tree path only).

**Independent Test**: Open graph on a clean repo, right-click any commit row, confirm dialog, verify `git status` shows `HEAD detached at <hash>` and graph HEAD indicator moves.

### Implementation for User Story 1

- [X] T003 [P] [US1] Add `checkoutCommit(hash: string): Promise<Result<string, GitError>>` method to `src/services/GitBranchService.ts` that runs `git checkout <hash>` via `GitExecutor` (enforces 30 s timeout per Principle I; mirrors existing `checkoutBranch`; no hash validation needed per research.md Finding 3)
- [X] T004 [P] [US1] Add `pendingCommitCheckout: { hash: string } | null` state and `setPendingCommitCheckout(v: { hash: string } | null) => void` action to `webview-ui/src/stores/graphStore.ts` (mirrors `pendingCheckout` for branch checkouts; required so stash dialog survives context menu unmount)
- [X] T005 [US1] Add `checkoutCommit` request handler to `src/WebviewProvider.ts`: call `isDirtyWorkingTree()` — if clean, call `GitBranchService.checkoutCommit(hash)`; on `Ok` result post `success` and call `sendInitialData()`; on `Err` result post an error response to the frontend and display a VS Code error notification with the git error message; if dirty, post `checkoutCommitNeedsStash { hash }` (mirrors `checkoutBranch` handler pattern)
- [X] T006 [US1] Add `checkoutCommit(hash: string)` function to `webview-ui/src/rpc/rpcClient.ts` that posts `{ type: 'checkoutCommit', payload: { hash } }` (depends on T002 types and T004 store)
- [X] T007 [US1] Add "Checkout this commit" menu item and detached HEAD `ConfirmDialog` to `webview-ui/src/components/CommitContextMenu.tsx`: place item at top of menu (before "Create Branch Here...") with a separator after; disable when `isOperationInProgress`; dialog message: `"Checkout commit <commit.abbreviatedHash> will result in detached HEAD. Continue?"`; on Confirm call `rpcClient.checkoutCommit(commit.hash)` (depends on T004 store state, T006 rpc call)

**Checkpoint**: User Story 1 is fully functional — confirm via quickstart.md Stories 1, 3, 5, and 6.

---

## Phase 4: User Story 2 — Checkout Commit with Dirty Working Tree (Priority: P2)

**Goal**: When the working tree is dirty and the user confirms the detached HEAD dialog, the backend detects the dirty state and the frontend presents a stash-and-checkout dialog before completing the checkout. Mirrors existing branch `checkoutNeedsStash` pattern exactly.

**Independent Test**: Make a local change, right-click any commit row, confirm detached HEAD dialog, verify stash dialog appears; confirm stash dialog, verify `git stash list` shows a new entry and `git status` shows `HEAD detached at <hash>`.

### Implementation for User Story 2

- [X] T008 [P] [US2] Add `stashAndCheckoutCommit` request handler to `src/WebviewProvider.ts`: call `GitStashService.stash()`, then `GitBranchService.checkoutCommit(hash)`, post `success`, call `sendInitialData()` (mirrors `stashAndCheckout` handler; depends on T002 types and T003 service method)
- [X] T009 [P] [US2] Add `stashAndCheckoutCommit(hash: string)` function to `webview-ui/src/rpc/rpcClient.ts` and add `checkoutCommitNeedsStash` response handler that dispatches `store.setPendingCommitCheckout({ hash })` (depends on T002 types and T004 store action)
- [X] T010 [US2] Add stash-and-checkout `ConfirmDialog` to `webview-ui/src/components/CommitContextMenu.tsx`: render when `pendingCommitCheckout` is non-null; message: `"You have uncommitted changes. Stash them and checkout the commit?"`; Confirm button label: `"Stash & Checkout"`; Cancel button label: `"Cancel"`; on Confirm call `rpcClient.stashAndCheckoutCommit(pendingCommitCheckout.hash)` and clear `pendingCommitCheckout`; on `stashAndCheckoutCommit` error, clear `pendingCommitCheckout` and display an error notification (do not leave state set); on Cancel clear `pendingCommitCheckout` only (depends on T004 store state, T008 handler, T009 rpc call)

**Checkpoint**: User Story 2 is fully functional — confirm via quickstart.md Stories 2 and 4.

---

## Phase 5: User Story 3 — Checkout Commit Already at HEAD (Priority: P3)

**Goal**: Verify that right-clicking the current HEAD commit shows "Checkout this commit" and follows the same confirmation flow with no special-case exclusions.

**Independent Test**: Right-click the commit marked as HEAD; confirm the detached HEAD dialog; verify `git status` shows `HEAD detached at <hash>`.

### Implementation for User Story 3

- [X] T011 [US3] Review `webview-ui/src/components/CommitContextMenu.tsx` and `webview-ui/src/components/BranchContextMenu.tsx`: (1) confirm no HEAD-specific exclusion logic is present for the "Checkout this commit" item — the item must appear for ALL commit rows including the current HEAD commit (FR-002, spec assumption); (2) confirm `BranchContextMenu.tsx` contains no "Checkout this commit" item — the item is exclusively available in `CommitContextMenu` (FR-009); no code change is expected, this is a review-and-confirm task (test manually via quickstart.md Story 1 using the HEAD commit row and Story 6 for BranchContextMenu exclusion)

**Checkpoint**: All three user stories are independently functional.

---

## Phase N: Polish & Cross-Cutting Concerns

- [X] T012 [P] Run `pnpm typecheck` from repo root and confirm zero TypeScript strict-mode violations (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- [X] T013 [P] Run `pnpm lint` from repo root and confirm zero ESLint errors
- [X] T014 Run `pnpm build` from repo root and confirm both extension and webview bundles produce zero errors
- [ ] T015 Validate all six quickstart.md manual test flows (Stories 1–6): basic clean checkout, dirty-tree stash flow, cancel at detached HEAD dialog, cancel at stash dialog, disabled state during operation, exclusion from BranchContextMenu

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user story work**
- **US1 (Phase 3)**: Depends on Phase 2 — start T003 and T004 in parallel immediately after T002
- **US2 (Phase 4)**: Depends on Phase 2 + Phase 3 — T008 and T009 can run in parallel once T003 (service method) and T004 (store state) are done
- **US3 (Phase 5)**: Depends on Phase 3 — review task, no new code
- **Polish (Phase N)**: Depends on all story phases being complete

### User Story Dependencies

- **US1 (P1)**: Unblocked after Foundational — no dependency on US2 or US3
- **US2 (P2)**: Unblocked after Foundational — reuses T003 service method and T004 store state from US1, so US1 must complete first
- **US3 (P3)**: Unblocked after US1 — pure validation, no new code

### Within Each User Story

- T003 ‖ T004 (US1 parallel start — different files, no cross-dependency)
- T005 after T003 (needs service method)
- T006 after T002, T004 (needs types + store)
- T007 after T004, T006 (needs store state + rpc call)
- T008 ‖ T009 (US2 parallel start — different files)
- T010 after T008, T009 (needs handler + rpc)

---

## Parallel Execution Examples

### User Story 1 (after T002 completes)

```
Parallel start:
  Task T003: Add GitBranchService.checkoutCommit in src/services/GitBranchService.ts
  Task T004: Add pendingCommitCheckout state in webview-ui/src/stores/graphStore.ts

Then sequentially:
  Task T005: Add WebviewProvider checkoutCommit handler (needs T003)
  Task T006: Add rpcClient.checkoutCommit() (needs T002, T004)
  Task T007: Add CommitContextMenu item + dialog (needs T004, T006)
```

### User Story 2 (after US1 completes)

```
Parallel start:
  Task T008: Add WebviewProvider stashAndCheckoutCommit handler
  Task T009: Add rpcClient stashAndCheckoutCommit + checkoutCommitNeedsStash handler

Then sequentially:
  Task T010: Add CommitContextMenu stash dialog (needs T008, T009)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002) — **CRITICAL**
3. Complete Phase 3: User Story 1 (T003–T007)
4. **STOP and VALIDATE**: Right-click any commit, confirm dialog, verify detached HEAD
5. Demo the core feature

### Incremental Delivery

1. Setup + Foundational → shared types ready
2. US1 → core checkout works (MVP)
3. US2 → stash flow works (safe for dirty trees)
4. US3 → edge case verified (robustness)
5. Polish → build/typecheck/manual QA

---

## Notes

- No new source files — all changes are additions to existing files
- `git checkout <hash>` is used (not `git switch --detach`), consistent with existing `GitBranchService` usage
- Commit hash comes from in-memory `Commit` object — no validation needed (trusted internal source)
- Short hash in dialog uses `commit.abbreviatedHash` (already on every `Commit` object)
- `isOperationInProgress` guard on menu item is consistent with Revert Commit and Drop Commit (FR-010)
- TypeScript strict mode: if `REQUEST_TYPES`/`RESPONSE_TYPES` maps in `shared/messages.ts` are incomplete, the compiler will error at exhaustive checks
