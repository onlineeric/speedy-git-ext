# Tasks: Branch Checkout & Delete Dialog Improvements

**Input**: Design documents from `/specs/023-branch-dialog-improvements/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Types & Utilities)

**Purpose**: Extend shared message types and utility functions needed by all Story 3 tasks

**⚠️ CRITICAL**: Story 3 implementation tasks cannot begin until this phase is complete. Stories 1 & 2 have no dependencies on this phase.

- [x] T001 Extend `deleteBranch` request payload to add `deleteRemote?: { remote: string; name: string }` and extend `deleteBranchNeedsForce` response payload to add `deleteRemote?: { remote: string; name: string }` in `shared/messages.ts`
- [x] T002 [P] Add `buildDeleteBranchWithRemoteCommand` function that combines local delete + remote delete command strings in `webview-ui/src/utils/gitCommandBuilder.ts`
- [x] T003 [P] Change `pendingForceDeleteBranch` type from `string | null` to `{ name: string; deleteRemote?: { remote: string; name: string } } | null` and update `setPendingForceDeleteBranch` in `webview-ui/src/stores/graphStore.ts`
- [x] T004 [P] Update `deleteBranch` method to accept optional `deleteRemote` parameter and update `deleteBranchNeedsForce` case in `handleMessage` to pass `deleteRemote` to store in `webview-ui/src/rpc/rpcClient.ts`

**Checkpoint**: Shared types extended, utilities ready. `pnpm typecheck` may show errors in consuming files — these will be fixed in subsequent phases.

---

## Phase 2: User Stories 1 & 2 - Checkout Pull Dialog Verification (Priority: P1)

**Goal**: Verify that the checkout-with-pull dialog correctly appears when checking out a local branch with a diverged remote counterpart (US1) and when checking out a remote branch with an existing local counterpart (US2).

**Independent Test**: In a test repo with diverged local/remote branches, right-click local branch badge → Checkout → pull dialog should appear. Right-click remote branch badge (where local exists) → Checkout → pull dialog should appear. Local-only and remote-only branches should checkout directly without dialog.

**Context**: Research (research.md R1) indicates `getBranchCheckoutState()` in `BranchContextMenu.tsx` already correctly detects dual branches by matching branch names. This phase verifies that finding and applies fixes only if issues are discovered.

### Implementation for User Stories 1 & 2

- [x] T005 [US1] [US2] Verify `getBranchCheckoutState` correctly returns 'dual' for local branches with remote counterparts and for remote branches with local counterparts by reviewing logic and smoke testing all acceptance scenarios in `webview-ui/src/components/BranchContextMenu.tsx`. If bugs are found, fix the matching logic in `getBranchCheckoutState`. **Result: Logic already correct — no code changes needed.**

**Checkpoint**: Checkout pull dialog behavior verified for all scenarios in spec (US1 scenarios 1-3, US2 scenarios 1-2). If already working, no code changes needed.

---

## Phase 3: User Story 3 - Delete Branch with Remote Option (Priority: P2)

**Goal**: Add an "Also delete remote branch" checkbox (unchecked by default) to the delete branch confirmation dialog, with dynamic command preview and support in the force-delete flow.

**Independent Test**: Right-click a local branch with a remote counterpart → "Delete Branch" → dialog shows checkbox. Toggle checkbox → command preview updates. Confirm with checkbox checked → both branches deleted. Confirm unchecked → only local deleted. Test force-delete flow preserves checkbox state.

### Implementation for User Story 3

- [x] T006 [P] [US3] Create `DeleteBranchDialog` component with: Radix UI AlertDialog, "Also delete remote branch" checkbox (unchecked by default), dynamic command preview using `buildDeleteBranchCommand` and `buildDeleteBranchWithRemoteCommand`, confirm/cancel callbacks passing `{ force?: boolean; deleteRemote?: { remote: string; name: string } }` in `webview-ui/src/components/DeleteBranchDialog.tsx`
- [x] T007 [P] [US3] Update `deleteBranch` handler to execute `deleteRemoteBranch` after successful local delete when `deleteRemote` is provided, and echo `deleteRemote` in `deleteBranchNeedsForce` response in `src/WebviewProvider.ts`
- [x] T008 [US3] Replace local-branch `ConfirmDialog` with `DeleteBranchDialog` in `BranchContextMenu.tsx`: pass `hasRemote` flag and remote info from `branches` array, update force-delete `ConfirmDialog` to also use `DeleteBranchDialog` with pre-populated checkbox state from `pendingForceDeleteBranch`, update all related state management in `webview-ui/src/components/BranchContextMenu.tsx`

**Checkpoint**: Delete branch dialog fully functional with remote-delete option. All Story 3 acceptance scenarios (1-6) pass.

---

## Phase 4: Polish & Validation

**Purpose**: Build validation and final smoke test across all stories

- [x] T009 Run `pnpm typecheck` to verify zero TypeScript errors, `pnpm lint` to verify zero ESLint errors, and `pnpm build` to verify clean build of both extension and webview
- [ ] T010 Smoke test all scenarios from `specs/023-branch-dialog-improvements/quickstart.md` via VS Code "Run Extension" launch config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **US1 & US2 (Phase 2)**: No dependencies on Phase 1 — can run in parallel with Foundational
- **US3 (Phase 3)**: Depends on Foundational (Phase 1) completion
- **Polish (Phase 4)**: Depends on all story phases being complete

### User Story Dependencies

- **US1 & US2 (P1)**: Independent — verification only, no code changes expected
- **US3 (P2)**: Depends on Phase 1 foundational types — independent of US1/US2

### Within Phase 1 (Foundational)

- T001 (shared/messages.ts) MUST complete first
- T002, T003, T004 can run in parallel after T001 (different files)

### Within Phase 3 (US3)

- T006 (DeleteBranchDialog) and T007 (WebviewProvider) can run in parallel (different layers)
- T008 (BranchContextMenu wiring) depends on T006 completion

### Parallel Opportunities

```
Phase 1:
  T001 → { T002 ∥ T003 ∥ T004 }

Phase 2 (can run in parallel with Phase 1):
  T005

Phase 3 (after Phase 1):
  { T006 ∥ T007 } → T008

Phase 4 (after all):
  T009 → T010
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 2: Verify checkout behavior (T005)
2. **STOP and VALIDATE**: Confirm no bugs in checkout pull dialog
3. If issues found, fix and re-verify

### Incremental Delivery

1. Verify US1 & US2 (checkout dialog) → Confirm working
2. Complete Phase 1 (foundational types) → Types ready
3. Complete US3 (delete dialog) → Full feature ready
4. Validate (typecheck + lint + build + smoke test)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined in Phase 2 because they verify the same function (`getBranchCheckoutState`)
- No new packages needed — all implementation uses existing Radix UI, Zustand, and Tailwind CSS
- No test tasks included (not requested in spec)
