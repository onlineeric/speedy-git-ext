# Tasks: Centralize Git Command Preview for All Dialogs

**Input**: Design documents from `/specs/022-git-command-preview/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Unit tests are required per FR-008 and SC-003. All command builder functions must have test coverage for all flag combinations.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared utility and reusable component that all dialogs depend on. No user story work can begin until this phase is complete.

- [X] T001 [P] Create all command builder pure functions (buildPushCommand, buildMergeCommand, buildRebaseCommand, buildCherryPickCommand, buildResetCommand, buildRevertCommand, buildDropCommitCommand, buildCheckoutCommand, buildTagCommand) with typed option interfaces in `webview-ui/src/utils/gitCommandBuilder.ts`
  - Import `PushForceMode`, `ResetMode` from `@shared/types`
  - Each function takes a typed options object and returns a git command string
  - `buildPushCommand({ remote, branch, setUpstream, forceMode })` → `git push [-u] [--force-with-lease|--force] <remote> <branch>`
  - `buildMergeCommand({ branch, noCommit, noFastForward, squash? })` → `git merge [--squash] [--no-commit] [--no-ff] <branch>` (noCommit implies --no-ff)
  - `buildRebaseCommand({ targetRef, ignoreDate })` → `git rebase [--ignore-date] <targetRef>`
  - `buildCherryPickCommand({ hashes, appendSourceRef, noCommit, mainlineParent? })` → `git cherry-pick [-m N] [-x] [--no-commit] <hash...>` (-x suppressed when noCommit)
  - `buildResetCommand({ hash, mode })` → `git reset --<mode> <hash>`
  - `buildRevertCommand({ hash, mainlineParent? })` → `git revert --no-edit [-m N] <hash>`
  - `buildDropCommitCommand({ hash })` → `git rebase -i <hash>~1  # drop <hash>`
  - `buildCheckoutCommand({ branch, pull })` → `git checkout <branch> [&& git pull]`
  - `buildTagCommand({ name, hash, message? })` → `git tag [-a] <name> [-m "<message>"] <hash>`
- [X] T002 [P] Create reusable CommandPreview component in `webview-ui/src/components/CommandPreview.tsx`
  - Extract from PushDialog.tsx lines 165-183 (readonly input + Copy button with "Copied!" feedback)
  - Props: `{ command: string }`
  - Encapsulate clipboard logic (`navigator.clipboard.writeText`) + `copied` state with 2s timeout
  - Use same CSS: label "Command preview:", flex row, readonly input with `font-mono select-all`, secondary-styled Copy button
  - Input MUST use `overflow-x: auto` (or Tailwind `overflow-x-auto`) so long command strings (e.g., cherry-picking many commits) scroll horizontally without breaking the dialog layout
  - Silent failure on clipboard error (matching existing PushDialog behavior)
- [X] T003 Create unit tests for all builder functions in `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`
  - Follow existing vitest pattern from `mergeRefs.test.ts`: `import { describe, it, expect } from 'vitest'`
  - One `describe` block per builder function
  - Test all flag combinations per function:
    - Push: default, with -u, with --force-with-lease, with --force, combined flags
    - Merge: default, --no-commit (implies --no-ff), --no-ff alone, --squash, --squash with --no-commit
    - Rebase: default, with --ignore-date
    - Cherry-pick: single hash, multiple hashes, with -x, with --no-commit (suppresses -x), with -m N, combined flags
    - Reset: --soft, --mixed, --hard
    - Revert: default (--no-edit), with -m N
    - Drop commit: verify format `git rebase -i <hash>~1  # drop <hash>`
    - Checkout: without pull, with pull (&& git pull)
    - Tag: lightweight, annotated with message

**Checkpoint**: Foundation ready — all builder functions tested, CommandPreview component created. User story implementation can now begin.

---

## Phase 2: User Story 1 — Refactored Push Dialog Command Preview (Priority: P1)

**Goal**: Refactor PushDialog to use shared gitCommandBuilder and CommandPreview component. Zero visual/behavioral regression.

**Independent Test**: Open Push dialog, change remote/upstream/force options, verify command preview updates reactively and Copy button works identically to before.

### Implementation for User Story 1

- [X] T004 [US1] Refactor PushDialog to use shared pieces in `webview-ui/src/components/PushDialog.tsx`
  - Remove inline `buildPushCommand` function (lines 19-32) → import from `../utils/gitCommandBuilder`
  - Remove `copied` state and `handleCopy` handler (lines 67-82)
  - Replace inline command preview UI (lines 165-183) with `<CommandPreview command={command} />`
  - Keep the exported `buildPushCommand` re-export if anything else imports it, or remove if only used internally
  - No changes to props, dialog behavior, or external API

**Checkpoint**: PushDialog works identically using shared components. Run `pnpm typecheck && pnpm test` to verify no regressions.

---

## Phase 3: User Story 2 — Command Preview in Merge and Cherry-Pick Dialogs (Priority: P1)

**Goal**: Add reactive command preview to Merge and Cherry-Pick dialogs using the shared builder functions and CommandPreview component.

**Independent Test**: Open Merge dialog — toggle no-commit/no-ff, verify command preview updates. Open Cherry-Pick dialog — toggle options, verify preview including flag interactions (-x suppressed with --no-commit).

### Implementation for User Story 2

- [X] T005 [P] [US2] Add command preview to MergeDialog in `webview-ui/src/components/MergeDialog.tsx`
  - Import `buildMergeCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - Compute command: `buildMergeCommand({ branch: branchName, noCommit, noFastForward: noCommit ? true : noFastForward })`
  - Insert `<CommandPreview command={command} />` between the checkboxes section and the action buttons (after line 61, before line 63)
- [X] T006 [P] [US2] Add command preview to CherryPickDialog in `webview-ui/src/components/CherryPickDialog.tsx`
  - Import `buildCherryPickCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - Compute command using existing state: `buildCherryPickCommand({ hashes: commits.map(c => c.abbreviatedHash), appendSourceRef, noCommit, ...(isSingleMergeCommit ? { mainlineParent } : {}) })`
  - Insert `<CommandPreview command={command} />` between options section and action buttons

**Checkpoint**: Merge and Cherry-Pick dialogs show reactive command preview. Run `pnpm typecheck` to verify.

---

## Phase 4: User Story 3 — Command Preview in Rebase, Reset, and Drop Commit Dialogs (Priority: P2)

**Goal**: Add command preview to the destructive operation dialogs (Rebase, Reset, Drop Commit), including extending ConfirmDialog and wiring context menus to pass data.

**Independent Test**: Open Rebase dialog (via commit or branch context menu) — verify preview shows target ref and updates with ignore-date toggle. Open Reset confirm — verify preview shows mode and hash. Open Drop Commit — verify preview shows rebase-based drop command.

### Implementation for User Story 3

- [X] T007 [P] [US3] Add optional targetRef prop and command preview to RebaseConfirmDialog in `webview-ui/src/components/RebaseConfirmDialog.tsx`
  - Add `targetRef?: string` to `RebaseConfirmDialogProps` interface
  - Import `buildRebaseCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - When `targetRef` is provided, compute command: `buildRebaseCommand({ targetRef, ignoreDate })`
  - Render `<CommandPreview>` between description/checkbox area and action buttons (only when targetRef is provided)
  - Backward compatible: existing callers without targetRef continue working (no preview shown)
- [X] T008 [P] [US3] Add optional commandPreview prop to ConfirmDialog in `webview-ui/src/components/ConfirmDialog.tsx`
  - Add `commandPreview?: string` to `ConfirmDialogProps` interface
  - Import `CommandPreview` from `./CommandPreview`
  - When `commandPreview` is provided, render `<CommandPreview command={commandPreview} />` between `<AlertDialog.Description>` and the action buttons div
  - No change for existing usages that don't pass the prop
- [X] T009 [P] [US3] Add command preview to DropCommitDialog in `webview-ui/src/components/DropCommitDialog.tsx`
  - Import `buildDropCommitCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - Compute command: `buildDropCommitCommand({ hash: commitHash.slice(0, 7) })` (abbreviated hash)
  - Insert `<CommandPreview command={command} />` between the warning text section and action buttons (after line 37, before line 39)
- [X] T010 [US3] Wire CommitContextMenu to pass command data to dialogs in `webview-ui/src/components/CommitContextMenu.tsx`
  - Import `buildResetCommand` from `../utils/gitCommandBuilder`
  - Pass `commandPreview={buildResetCommand({ hash: commit.abbreviatedHash, mode: pendingResetMode })}` to the Reset ConfirmDialog (around line 383)
  - Pass `targetRef={commit.hash}` to RebaseConfirmDialog (around line 395)
- [X] T011 [US3] Wire BranchContextMenu to pass targetRef to RebaseConfirmDialog in `webview-ui/src/components/BranchContextMenu.tsx`
  - Pass `targetRef={displayName}` to RebaseConfirmDialog (around line 302)

**Checkpoint**: Rebase, Reset, and Drop Commit dialogs all show command preview. Context menus correctly pass data. Run `pnpm typecheck` to verify.

---

## Phase 5: User Story 4 — Command Preview in Checkout and Tag Creation Dialogs (Priority: P3)

**Goal**: Add command preview to the remaining in-scope dialogs for full consistency across the extension.

**Independent Test**: Open Checkout with Pull dialog — toggle pull/no-pull, verify preview updates. Open Tag Creation dialog — type tag name and message, verify preview updates (switches between lightweight and annotated tag format).

### Implementation for User Story 4

- [X] T012 [P] [US4] Add command preview to CheckoutWithPullDialog in `webview-ui/src/components/CheckoutWithPullDialog.tsx`
  - Import `buildCheckoutCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - Compute command: `buildCheckoutCommand({ branch: branchName, pull })`
  - Insert `<CommandPreview command={command} />` between the radio buttons and action buttons (after line 57, before line 59)
- [X] T013 [P] [US4] Add command preview to TagCreationDialog in `webview-ui/src/components/TagCreationDialog.tsx`
  - Import `buildTagCommand` from `../utils/gitCommandBuilder` and `CommandPreview` from `./CommandPreview`
  - Compute command: `buildTagCommand({ name: name.trim() || '<name>', hash: commit.abbreviatedHash, ...(message.trim() ? { message: message.trim() } : {}) })`
  - Show placeholder `<name>` when tag name is empty
  - Insert `<CommandPreview command={command} />` between the form fields and action buttons (after textarea, before button container)

**Checkpoint**: All 8 in-scope dialogs now show command preview. Run `pnpm typecheck` to verify.

---

## Phase 5b: Additional Dialogs — Command Preview for Delete Branch, Stash, Tag, and Rename Branch

**Goal**: Add command previews to dialogs that were missing them: Delete Branch, Force Delete Branch, Delete Remote Branch, Delete Tag, Drop Stash, Stash & Checkout, and Rename Branch.

- [X] T016 [P] Add builder functions: buildDeleteBranchCommand, buildDeleteRemoteBranchCommand, buildDeleteTagCommand, buildDropStashCommand, buildStashAndCheckoutCommand, buildRenameBranchCommand in `webview-ui/src/utils/gitCommandBuilder.ts`
- [X] T017 [P] Add unit tests for all new builder functions in `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`
- [X] T018 Add optional `buildCommandPreview` callback prop to InputDialog in `webview-ui/src/components/InputDialog.tsx` for reactive command preview based on user input
- [X] T019 Wire command previews into BranchContextMenu dialogs in `webview-ui/src/components/BranchContextMenu.tsx`:
  - Delete Branch/Tag/Remote ConfirmDialog → `commandPreview` prop
  - Force Delete Branch ConfirmDialog → `commandPreview` prop
  - Stash & Checkout ConfirmDialog → `commandPreview` prop
  - Rename Branch InputDialog → `buildCommandPreview` callback prop
- [X] T020 Wire command preview into Drop Stash ConfirmDialog in `webview-ui/src/components/StashContextMenu.tsx`
- [X] T021 Run full validation: `pnpm typecheck && pnpm lint && pnpm test` — all 98 tests pass

---

## Phase 6: Polish & Validation

**Purpose**: Final validation across all user stories

- [X] T014 Run full validation: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] T015 Manual smoke test (requires manual verification): open each dialog in the extension, verify command preview appears, updates reactively with option changes, and Copy button copies to clipboard with "Copied!" feedback. Also verify that out-of-scope dialogs (Interactive Rebase, Revert Parent Selection, Remote Management) remain unchanged per FR-009.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1 completion
- **US2 (Phase 3)**: Depends on Phase 1 completion. Independent of US1.
- **US3 (Phase 4)**: Depends on Phase 1 completion. Independent of US1 and US2.
- **US4 (Phase 5)**: Depends on Phase 1 completion. Independent of US1, US2, US3.
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on foundational phase. No dependencies on other stories.
- **US2 (P1)**: Depends only on foundational phase. No dependencies on other stories.
- **US3 (P2)**: Depends only on foundational phase. T010 depends on T007+T008 within the same phase. T011 depends on T007.
- **US4 (P3)**: Depends only on foundational phase. No dependencies on other stories.

### Within Phase 4 (US3) — Internal Dependencies

```
T007 (RebaseConfirmDialog) ──┐
T008 (ConfirmDialog)     ────┼──→ T010 (CommitContextMenu)
T009 (DropCommitDialog)       │
T007 (RebaseConfirmDialog) ──┘──→ T011 (BranchContextMenu)
```

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 2-5**: US1, US2, US3, US4 can all start in parallel after Phase 1 completes (different files, no cross-story dependencies)
- **Within US2**: T005 and T006 can run in parallel (different dialog files)
- **Within US3**: T007, T008, T009 can run in parallel (different dialog files); T010 and T011 depend on T007+T008
- **Within US4**: T012 and T013 can run in parallel (different dialog files)

---

## Parallel Example: Foundational Phase

```bash
# Launch T001 and T002 in parallel (different files, no dependencies):
Task T001: "Create all builder functions in webview-ui/src/utils/gitCommandBuilder.ts"
Task T002: "Create CommandPreview component in webview-ui/src/components/CommandPreview.tsx"

# Then T003 sequentially (depends on T001):
Task T003: "Create unit tests in webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts"
```

## Parallel Example: All User Stories After Foundation

```bash
# After Phase 1 completes, all user stories can start in parallel:
Task T004 [US1]: "Refactor PushDialog.tsx"
Task T005 [US2]: "Add preview to MergeDialog.tsx"
Task T006 [US2]: "Add preview to CherryPickDialog.tsx"
Task T007 [US3]: "Add targetRef + preview to RebaseConfirmDialog.tsx"
Task T008 [US3]: "Add commandPreview prop to ConfirmDialog.tsx"
Task T009 [US3]: "Add preview to DropCommitDialog.tsx"
Task T012 [US4]: "Add preview to CheckoutWithPullDialog.tsx"
Task T013 [US4]: "Add preview to TagCreationDialog.tsx"

# Then wire context menus (depends on T007+T008):
Task T010 [US3]: "Wire CommitContextMenu.tsx"
Task T011 [US3]: "Wire BranchContextMenu.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (gitCommandBuilder + CommandPreview + tests)
2. Complete Phase 2: US1 (Refactor PushDialog)
3. **STOP and VALIDATE**: Verify PushDialog works identically
4. This alone delivers: centralized utility + reusable component + zero regression

### Incremental Delivery

1. Foundation → Shared utility + component ready
2. Add US1 (Push refactor) → Validate no regression (MVP!)
3. Add US2 (Merge + Cherry-Pick) → Validate new previews
4. Add US3 (Rebase + Reset + Drop) → Validate destructive op previews
5. Add US4 (Checkout + Tag) → Full coverage, validate all 8 dialogs
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All builder functions are created in the foundational phase (single file) because they share types and patterns
- The revert builder is created for future use but has no UI consumer in this feature
- No new packages needed — no install commands required
- All changes are frontend-only (webview-ui/src/)
