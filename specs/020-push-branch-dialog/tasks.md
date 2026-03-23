# Tasks: Push Branch Dialog

**Input**: Design documents from `/specs/020-push-branch-dialog/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Types & Contracts)

**Purpose**: Add shared type definitions and update message contracts that all layers depend on

- [ ] T001 Add `PushForceMode` type (`'none' | 'force-with-lease' | 'force'`) to `shared/types.ts`
- [ ] T002 Update push message payload in `shared/messages.ts` — replace `force?: boolean` with `forceMode?: PushForceMode`, make `remote` and `branch` required strings, add import for `PushForceMode`

---

## Phase 2: Foundational (Backend & RPC)

**Purpose**: Update backend push handling and RPC client to support new force mode and async push pattern

**Note**: All tasks in this phase touch different files and can run in parallel after Phase 1

- [ ] T003 [P] Update `GitRemoteService.push()` in `src/services/GitRemoteService.ts` — change `force?: boolean` param to `forceMode?: PushForceMode`, map `'force-with-lease'` to `--force-with-lease` and `'force'` to `--force` flags, keep `'none'`/undefined as no flag
- [ ] T004 [P] Update push message handler in `src/WebviewProvider.ts` — pass `message.payload.forceMode` instead of `message.payload.force` to `gitRemoteService.push()`
- [ ] T005 [P] Update `rpcClient.push()` signature in `webview-ui/src/rpc/rpcClient.ts` — change `force?: boolean` to `forceMode?: PushForceMode`, add `pushAsync()` method that returns `Promise<string>` using pending request pattern (resolve on `success` response, reject on `error` response)

**Checkpoint**: Backend and RPC layer ready — all existing push functionality preserved with new force mode support

---

## Phase 3: User Story 1 — Push Branch with Default Options (Priority: P1) MVP

**Goal**: Developer right-clicks a local branch badge, selects "Push Branch", a dialog opens with defaults, and clicking "Execute" pushes the branch with loading state and auto-close

**Independent Test**: Right-click any local branch badge → select "Push Branch" → verify dialog opens with branch name in title, default options pre-selected, and command preview showing `git push -u origin <branch>` → click "Execute" → verify push succeeds, dialog closes, success toast appears

### Implementation for User Story 1

- [ ] T006 [US1] Create `PushDialog` component in `webview-ui/src/components/PushDialog.tsx` — dialog shell using `@radix-ui/react-dialog` with Portal/Overlay/Content, title displaying "Push Branch: `<branchName>`", `--set-upstream / -u` checkbox (checked by default), "Push mode:" radio group (Normal/`--force-with-lease`/`--force`, default Normal), remote dropdown (populated from `useGraphStore(s => s.remotes)`, default "origin"), read-only command preview textbox at bottom, Execute and Cancel buttons
- [ ] T007 [US1] Implement async push execution flow in `webview-ui/src/components/PushDialog.tsx` — on Execute click: set `isPushing` state to true, disable all controls, show loading indicator, call `await rpcClient.pushAsync(remote, branch, setUpstream, forceMode)`, on success/failure close dialog (parent handles via `onCancel` callback)
- [ ] T008 [US1] Wire PushDialog into `webview-ui/src/components/BranchContextMenu.tsx` — add `pushDialogOpen` state, replace direct `rpcClient.push(undefined, refInfo.name)` call with `setPushDialogOpen(true)`, render `<PushDialog>` with `open`, `branchName`, `onCancel` props

**Checkpoint**: User Story 1 fully functional — dialog opens, shows defaults, executes push with loading state, closes with toast notification

---

## Phase 4: User Story 2 — Configure Push Options (Priority: P1)

**Goal**: Developer can toggle options in the dialog and the command preview updates in real time, with force push warning display

**Independent Test**: Open push dialog → uncheck `--set-upstream / -u` → verify `-u` removed from preview → select `--force-with-lease` → verify flag appears in preview AND yellow warning shown → select `--force` → verify flag changes → change remote → verify remote updates in preview → select Normal → verify warning removed

### Implementation for User Story 2

- [ ] T009 [US2] Implement `buildPushCommand()` pure helper function in `webview-ui/src/components/PushDialog.tsx` — takes `{ remote, branch, setUpstream, forceMode }` and returns full command string (e.g., `git push -u origin my-branch`), wire it to state so command preview updates on any option change
- [ ] T010 [US2] Add sharp yellow force push warning in `webview-ui/src/components/PushDialog.tsx` — when `forceMode` is `'force-with-lease'` or `'force'`, display a yellow warning message on the dialog body and apply warning styling to the Execute button, remove warning when mode returns to Normal

**Checkpoint**: User Story 2 complete — all option combinations correctly reflected in command preview, force warning displays/hides appropriately

---

## Phase 5: User Story 3 — Copy Command and Cancel (Priority: P2)

**Goal**: Developer can copy the constructed git command to clipboard and cancel the dialog without executing

**Independent Test**: Open push dialog → configure options → click copy button → verify clipboard contains the displayed command → verify visual feedback (Copied!) → click Cancel → verify no push executed

### Implementation for User Story 3

- [ ] T011 [US3] Add copy button adjacent to command preview in `webview-ui/src/components/PushDialog.tsx` — use `navigator.clipboard.writeText()` to copy command text, add `copied` state that briefly shows "Copied!" feedback (auto-reset after ~2 seconds via setTimeout), style button inline with the read-only textbox

**Checkpoint**: Copy-and-cancel workflow complete — developers can extract the command for manual use

---

## Phase 6: User Story 4 — Consistent Push Workflow Across Entry Points (Priority: P2)

**Goal**: All locations that trigger push branch use the same PushDialog

**Independent Test**: Search codebase for all push triggers → verify each opens PushDialog with same options and behavior

### Implementation for User Story 4

- [ ] T012 [US4] Audit all push entry points in the codebase (search for `rpcClient.push` and push-related menu items) and ensure each triggers PushDialog instead of direct push calls — document findings and update any additional entry points found

**Checkpoint**: All push entry points unified under PushDialog

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling and build validation

- [ ] T013 Handle edge cases in `webview-ui/src/components/PushDialog.tsx` — when no remotes configured: disable Execute button and show "No remotes configured" message; when single remote: pre-select it in dropdown; ensure branch names with special characters display correctly in preview
- [ ] T014 Run `pnpm typecheck && pnpm lint && pnpm build` to validate zero errors across all modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (shared types must exist before backend/RPC can reference them)
- **US1 (Phase 3)**: Depends on Phase 2 (needs `pushAsync()` and updated backend)
- **US2 (Phase 4)**: Depends on Phase 3 (needs PushDialog component to exist)
- **US3 (Phase 5)**: Depends on Phase 3 (needs command preview textbox to add copy button to)
- **US4 (Phase 6)**: Depends on Phase 3 (needs PushDialog to exist for audit)
- **Polish (Phase 7)**: Depends on all user story phases

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational phase — creates the PushDialog component and BranchContextMenu integration
- **User Story 2 (P1)**: Depends on US1 — adds interactive option behavior and force warning to existing PushDialog
- **User Story 3 (P2)**: Depends on US1 — adds copy button to existing command preview
- **User Story 4 (P2)**: Depends on US1 — audits and ensures all entry points use PushDialog

**Note**: US3 and US4 are independent of US2 and could run in parallel with US2 after US1 completes.

### Parallel Opportunities

- **Phase 2**: T003, T004, T005 can all run in parallel (different files)
- **After US1**: US2, US3, and US4 can start in parallel (US3/US4 don't depend on US2)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all foundational tasks together (different files, no dependencies):
Task: T003 "Update GitRemoteService.push() in src/services/GitRemoteService.ts"
Task: T004 "Update push handler in src/WebviewProvider.ts"
Task: T005 "Update rpcClient.push() and add pushAsync() in webview-ui/src/rpc/rpcClient.ts"
```

## Parallel Example: After User Story 1

```bash
# These can start in parallel once US1 (Phase 3) is complete:
Task: T009 "US2 — buildPushCommand() and live preview in PushDialog.tsx"
Task: T011 "US3 — Copy button with clipboard in PushDialog.tsx"
Task: T012 "US4 — Audit push entry points"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T005)
3. Complete Phase 3: User Story 1 (T006–T008)
4. **STOP and VALIDATE**: Dialog opens, defaults work, Execute pushes, loading state, auto-close
5. This is a functional MVP — developers can push via dialog

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. Add User Story 1 → Dialog opens and executes push (MVP!)
3. Add User Story 2 → Options are interactive with live preview and force warning
4. Add User Story 3 → Copy button for manual command use
5. Add User Story 4 → All entry points consistent
6. Polish → Edge cases handled, build validated

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 creates PushDialog.tsx; US2–US4 modify it incrementally
- US3 and US4 can run in parallel with US2 after US1 completes
- Commit after each phase or logical group
- Stop at any checkpoint to validate story independently
