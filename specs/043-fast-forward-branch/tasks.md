---
description: "Task list for feature 043-fast-forward-branch"
---

# Tasks: Fast-forward Local Branch from Remote

**Input**: Design documents from `/specs/043-fast-forward-branch/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-fast-forward-local-branch.md, quickstart.md

**Tests**: Tests are INCLUDED for the pure helpers and the backend service to align with the project's existing Vitest coverage of all `src/services/Git*Service.ts` files and `webview-ui/src/utils/__tests__/*` (per Constitution gate "pnpm test" must exit clean). React/component changes are validated via the manual smoke test in `quickstart.md`, not by component tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Each task lists the exact file path it touches.

## Path Conventions

This is a VS Code extension with two TypeScript projects sharing types via `@shared/*`:

- Backend (extension host): `src/`, tests in `src/__tests__/`
- Webview (React): `webview-ui/src/`, util tests in `webview-ui/src/utils/__tests__/`
- Shared types: `shared/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a clean baseline before introducing changes.

- [X] T001 Run `pnpm typecheck && pnpm lint && pnpm test` from repo root and confirm all pass on the current `043-fast-forward-branch` branch — baseline before any code change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting plumbing that every user story depends on. Each task is in a different file so the parallel ones can be executed concurrently.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add the `fastForwardLocalBranch` request variant in `shared/messages.ts` — append `| { type: 'fastForwardLocalBranch'; payload: { remote: string; branch: string } }` to the `RequestMessage` union, and add `fastForwardLocalBranch: true` to the `RequestAllowlist` constant in the same file (place it adjacent to existing `push: true, pull: true, fetch: true` entries). No new response type is needed — success and error reuse the existing envelopes.

- [X] T003 [P] Add `fastForwardFromRemote(remote: string, branch: string): Promise<Result<string>>` method to `src/services/GitBranchService.ts` directly under the existing `fetch(...)` method (around line 78–105). Implementation: validate both args via `validateRefName`, then `args = ['fetch', remote, ` + "`${branch}:${branch}`" + `]`, call `this.executor.execute({ args, cwd: this.workspacePath, timeout: 60000 })` (60s to match `pull` in `GitRemoteService`), return `ok('Fast-forward completed')` on success or pass through the failure `Result`. Log `Fast-forward local branch: ${remote}/${branch}` at start.

- [X] T004 [P] Add `buildFastForwardLocalBranchCommand({ remote, branch }: { remote: string; branch: string }): string` to `webview-ui/src/utils/gitCommandBuilder.ts`. Place the function adjacent to the other branch/remote builders (e.g. near `buildPushCommand` around line 54). Output exactly `git fetch <remote> <branch>:<branch>` (no quoting; no extra flags). Export the type alias for the options object using the existing pattern in this file.

- [X] T005 [P] Create new file `webview-ui/src/utils/resolveDefaultRemote.ts` exporting `resolveDefaultRemote(branches: Branch[]): string`. Implementation per `data-model.md` §3 and `research.md` D3: collect the unique non-empty `b.remote` values from `branches`; if `'origin'` is in that set return `'origin'`; else return the alphabetically-first remote name; else (empty set) return literal `'origin'`. Pure function, no React, no store imports — only `import type { Branch } from '@shared/types';`.

**Checkpoint**: Foundation ready — plumbing in place; user-story phases can now be implemented.

---

## Phase 3: User Story 1 — Fast-forward a non-checked-out local branch from its remote (Priority: P1) 🎯 MVP

**Goal**: A right-click on a qualifying local branch badge → menu item → confirm dialog → confirm executes `git fetch <remote> <branch>:<branch>` → graph refreshes with the branch advanced. Working tree and current branch unchanged.

**Independent Test**: `quickstart.md` "Happy path" section — set up a behind-branch fixture, right-click the badge while on a different branch, confirm, assert the branch advances and current branch / working tree are untouched.

### Tests for User Story 1

> Backend service test + helper tests; written before the wiring lands so failures are visible.

- [X] T006 [P] [US1] Add tests for `fastForwardFromRemote` to `src/__tests__/GitBranchService.test.ts`. Mirror the existing `fetch()` test style in the same file. Cover:
  - Success: stub executor to return `ok({ stdout: '', stderr: '' })`, assert returned `Result` is success and `value === 'Fast-forward completed'`, assert `executor.execute` was called with `args: ['fetch', 'origin', 'feature-x:feature-x']`, `cwd: workspacePath`, `timeout: 60000`.
  - Refspec format with non-trivial branch name (e.g. `release/1.2.x`) → `args[2] === 'release/1.2.x:release/1.2.x'`.
  - Validation rejection: `remote` containing a shell metachar returns the validation error and never calls executor.
  - Validation rejection: `branch` containing a shell metachar returns the validation error and never calls executor.
  - Executor failure: stub returns a `GitError` (e.g. simulating non-fast-forward) → returned `Result` is the same failure, no message rewrite.

- [X] T007 [P] [US1] Add tests for `buildFastForwardLocalBranchCommand` to `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`. Cover: simple branch name (`{remote: 'origin', branch: 'dev'}` → `'git fetch origin dev:dev'`); slashed branch (`'release/1.2.x'`); non-default remote (`{remote: 'upstream', branch: 'main'}`).

- [X] T008 [P] [US1] Create `webview-ui/src/utils/__tests__/resolveDefaultRemote.test.ts`. Cover: branches with `origin` only → `'origin'`; branches with `upstream` and `origin` → `'origin'` (preference); branches with only `upstream` and `fork` → `'fork'` (alphabetical first); branches with no remotes → `'origin'` (literal fallback); empty `branches` array → `'origin'`; ignores duplicate remote entries.

### Implementation for User Story 1

- [X] T009 [US1] Add the RPC dispatch case in `src/WebviewProvider.ts` directly after the existing `case 'fetch'` block (currently at line ~1059). Implementation:
  ```text
  case 'fastForwardLocalBranch': {
    const result = await this.gitBranchService.fastForwardFromRemote(
      message.payload.remote,
      message.payload.branch,
    );
    if (result.success) {
      this.postMessage({ type: 'success', payload: { message: result.value } });
      await this.sendInitialData(this.currentFilters);
    } else {
      this.postMessage({ type: 'error', payload: { error: result.error } });
    }
    break;
  }
  ```
  Match the surrounding indentation and style. Do not change the existing `fetch` case.

- [X] T010 [US1] Add `fastForwardLocalBranch(remote: string, branch: string): void` to `webview-ui/src/rpc/rpcClient.ts`, alongside the existing `fetch(...)` helper (currently around line 272). Body: `this.send({ type: 'fastForwardLocalBranch', payload: { remote, branch } });`.

- [X] T011 [US1] Wire the menu item and `ConfirmDialog` in `webview-ui/src/components/BranchContextMenu.tsx`:
  1. Import `resolveDefaultRemote` from `../utils/resolveDefaultRemote` and `buildFastForwardLocalBranchCommand` from `../utils/gitCommandBuilder`.
  2. Add `const [fastForwardOpen, setFastForwardOpen] = useState(false);` next to the other dialog `useState` calls.
  3. Compute, with `useMemo` over `branches`, `const defaultRemote = useMemo(() => resolveDefaultRemote(branches), [branches]);`.
  4. Compute, with `useMemo` over `defaultRemote` + `refInfo.name`, `const fastForwardPreview = useMemo(() => buildFastForwardLocalBranchCommand({ remote: defaultRemote, branch: refInfo.name }), [defaultRemote, refInfo.name]);`.
  5. Inside the existing `{isLocalBranch && ( ... )}` block, after the existing "Push Branch" item (around line 175–177) and before the "Pull Branch" current-branch case, add a new `<ContextMenu.Item>` shown only when `!isCurrentBranch`. Label: `Fast-forward Local Branch from Remote`. `disabled={loading || rebaseInProgress}`. `onSelect={() => setFastForwardOpen(true)}`.
  6. After the existing `<CheckoutWithPullDialog>` near line 322, add a `<ConfirmDialog>` instance:
     - `open={fastForwardOpen}`
     - `onConfirm={() => { setFastForwardOpen(false); rpcClient.fastForwardLocalBranch(defaultRemote, refInfo.name); }}`
     - `onCancel={() => setFastForwardOpen(false)}`
     - `title="Fast-forward Local Branch from Remote"`
     - `description={`Update local branch '${refInfo.name}' to match remote branch without checkout. Your current branch and working tree are not affected.`}`
     - `confirmLabel="Fast-forward"`
     - `variant="warning"`
     - `commandPreview={fastForwardPreview}`
  7. Do NOT change any other menu item, dialog, or visibility logic in this file beyond the additions above.

- [X] T012 [US1] Run `pnpm typecheck && pnpm lint && pnpm test` from repo root and fix any errors (expected: zero, since each touched file is additive).

- [ ] T013 [US1] **(manual — pending user)** Execute `quickstart.md` "Happy path" (steps 1–7) end-to-end via the VS Code "Run Extension" launch config. Confirm: dialog opens with the correct title / description / preview; confirm advances the local branch; current branch and working tree are unchanged; success toast appears.

**Checkpoint**: At this point, US1 (the MVP) is fully functional and shippable on its own. The fast-forward operation works end-to-end against a normal qualifying branch.

---

## Phase 4: User Story 2 — Clear intent via confirmation dialog with command preview (Priority: P2)

**Goal**: The dialog text and preview communicate exactly what will happen before any git command runs. Cancel does nothing; confirm runs the previewed command verbatim.

**Independent Test**: `quickstart.md` "Cancel path" plus inspection of the dialog content during the happy-path test.

### Implementation for User Story 2

- [X] T014 [US2] Verify the dialog content from T011 matches all FR-004 sub-bullets in `spec.md` and renders correctly:
  - Title names the action.
  - Description plainly states "without checkout" and "working tree not affected".
  - Command preview renders via the existing `<CommandPreview>` component (already inside `ConfirmDialog`).
  - Cancel and Confirm buttons present; Cancel returns without running the fetch; pressing Esc or clicking outside the modal also cancels (Radix `AlertDialog` behavior — verify in browser).
  Adjust the description string in `webview-ui/src/components/BranchContextMenu.tsx` if any sub-bullet is unmet. No other file changes expected here.

- [ ] T015 [US2] **(manual — pending user)** Run `quickstart.md` "Cancel path" manually: open the dialog, click Cancel, confirm no fetch occurs and no toast appears. Then re-open and confirm — verify the previewed command literally matches what was executed (compare against the `git fetch ...` line shown in the extension's Output Channel "Speedy Git").

**Checkpoint**: Dialog UX matches FR-004 verbatim.

---

## Phase 5: User Story 3 — Menu option appears only when applicable (Priority: P2)

**Goal**: The new menu item appears on the right badge contexts and is hidden / disabled in every disqualifying context.

**Independent Test**: `quickstart.md` "Visibility — option appears only on the right badges" matrix and "Concurrent-operation guard" section.

### Implementation for User Story 3

- [X] T016 [US3] Audit the visibility predicate added in T011. Confirm in `webview-ui/src/components/BranchContextMenu.tsx`:
  1. The new menu item lives inside the `{isLocalBranch && ( ... )}` block (so it never appears for `refInfo.type === 'remote'`, `'tag'`, `'stash'`).
  2. It is wrapped in `{!isCurrentBranch && ( ... )}` so it does not appear on the currently checked-out branch (prevents `git fetch X:X` rejection on HEAD).
  3. The `disabled` prop is `loading || rebaseInProgress` so the item greys out during long-running ops (FR-009).
  4. No other branch context menu (e.g., `CommitContextMenu`, `StashContextMenu`, `AuthorContextMenu`, `UncommittedContextMenu`, `DateContextMenu`) gains the new item — verify by grep.

- [ ] T017 [US3] **(manual — pending user)** Execute `quickstart.md` "Visibility — option appears only on the right badges" matrix (7 row test) and "Concurrent-operation guard" scenario.

- [ ] T018 [US3] **(manual — pending user)** Execute the "No-op (already up to date)" and "Error paths A/B/C" sections of `quickstart.md`. Verify error toasts surface git's verbatim message and the local branch is unchanged on failure (FR-006, FR-007).

**Checkpoint**: All three user stories pass their independent tests; the manual quickstart matrix is fully green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final gates and documentation alignment.

- [X] T019 Run all four release gates from `quickstart.md` "Automated gates": `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — all four MUST exit 0.

- [ ] T020 **(manual — pending user)** Run `quickstart.md` "Multi-remote disambiguation" section (origin preferred over upstream). Confirm the command preview reads `git fetch origin <branch>:<branch>` and not the second remote.

- [X] T021 [P] Update CLAUDE.md "Recent Changes" section by prepending a single line: `- 043-fast-forward-branch: Fast-forward a non-checked-out local branch from its remote without checkout`. Drop the oldest line if the section keeps three lines (current pattern shows three).

- [X] T022 [P] Mark all checklist items in `specs/043-fast-forward-branch/checklists/requirements.md` complete and add a final note: `Implementation complete on <YYYY-MM-DD>; quickstart matrix passes.`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 is just a baseline check.
- **Foundational (Phase 2)**: Depends on T001 only. T002–T005 are mutually independent (different files) and can run in parallel.
- **US1 (Phase 3)**: Depends on T002 (RPC type), T003 (backend service), T004 (command builder), T005 (remote resolver). Within Phase 3: tests T006/T007/T008 are mutually independent and can run in parallel; T009–T011 are sequential because each builds on the previous (RPC dispatch → client method → component wiring); T012/T013 are gating checks at the end.
- **US2 (Phase 4)**: Depends on US1 (the dialog must exist before its content can be verified).
- **US3 (Phase 5)**: Depends on US1 (the menu item must exist before its visibility can be audited).
- **Polish (Phase 6)**: Depends on US1 + US2 + US3 all complete.

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 (Foundational) — see `data-model.md` §1–3.
- **US2 (P2)**: Builds on US1's dialog wiring. Cannot ship before US1.
- **US3 (P2)**: Builds on US1's menu item. Cannot ship before US1. US2 and US3 are independent of each other within Phase 4/5 and could be done in either order, but both should be complete before Phase 6.

### Parallel Opportunities

- **Phase 2**: T002, T003, T004, T005 are all `[P]` — four different files, zero dependencies between them. A single developer can also do them sequentially without rework.
- **Phase 3 tests**: T006, T007, T008 are all `[P]` — three different test files, zero dependencies.
- **Phase 6**: T021 and T022 are `[P]` — different files (`CLAUDE.md` vs. `checklists/requirements.md`).

---

## Parallel Example: Phase 2 (Foundational)

```text
# Four independent edits / creations across separate files:
Task: "T002 Add fastForwardLocalBranch request variant in shared/messages.ts"
Task: "T003 Add fastForwardFromRemote method in src/services/GitBranchService.ts"
Task: "T004 Add buildFastForwardLocalBranchCommand in webview-ui/src/utils/gitCommandBuilder.ts"
Task: "T005 Create webview-ui/src/utils/resolveDefaultRemote.ts"
```

## Parallel Example: User Story 1 Tests

```text
# Three independent test files:
Task: "T006 Add fastForwardFromRemote tests to src/__tests__/GitBranchService.test.ts"
Task: "T007 Add buildFastForwardLocalBranchCommand cases to webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts"
Task: "T008 Create webview-ui/src/utils/__tests__/resolveDefaultRemote.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. T001 (baseline)
2. T002–T005 (foundational plumbing — all `[P]`)
3. T006–T008 (US1 tests — all `[P]`)
4. T009 → T010 → T011 (US1 wiring; sequential)
5. T012 (lint/test gate) → T013 (manual happy-path)
6. **STOP & VALIDATE**: US1 is shippable as the MVP if needed.

### Incremental Delivery (recommended)

Ship MVP after T013, then layer US2 and US3 on top:

1. MVP ready after T013.
2. Phase 4 (T014–T015) → confirm the dialog UX is precise.
3. Phase 5 (T016–T018) → confirm visibility is precise across the badge matrix.
4. Phase 6 (T019–T022) → polish and final gates.

### Single-developer path (this feature's expected mode)

This is a small, focused feature with one developer (the user). Run sequentially T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022. Total: 22 tasks. Estimated effort: ~3–5 hours including manual smoke testing.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks in the same phase.
- `[Story]` label maps each implementation task to a user story for traceability against `spec.md`.
- Each user story is independently testable per its quickstart sections.
- Tests for the pure helpers and the backend service are required by the project's existing Vitest gate; component-level tests are intentionally omitted in favor of the manual smoke test (consistent with how recent features 040 and 041 were validated in this repo).
- Commit at logical groupings (end of each phase) — agent must not commit unless the user explicitly asks.
- Stop at any checkpoint to validate independently. Do not proceed past a failing gate.
- Avoid: introducing a new dialog component (use `ConfirmDialog`), adding a remote-picker UI (rejected by spec Q2), adding a force option (rejected by spec Q3), pre-fetching divergence info on dialog open (violates Constitution Principle I).
