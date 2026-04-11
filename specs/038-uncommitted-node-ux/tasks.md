---

description: "Task list for feature 038-uncommitted-node-ux"
---

# Tasks: Uncommitted Node UX Polish

**Input**: Design documents from `/specs/038-uncommitted-node-ux/`
**Prerequisites**: plan.md (required), spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Limited Vitest unit tests are included ONLY for pure helper functions (radio availability rules, selective-stash command builder, default stash message). No integration/UI tests are generated — manual validation uses `quickstart.md` per project convention (Vitest is configured for unit tests only).

**Organization**: Tasks are grouped by user story. Each story can be implemented and validated independently. User Story 1 (the dialog overhaul) is the MVP and the largest; stories 2–4 are small, independent polish items.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One-time dev-environment preparation for all stories

- [X] T001 SUPERSEDED — research revised during implementation to use native `<input type="radio">` (see research.md §1). No new npm dependency required; no `pnpm add` step needed. `pnpm typecheck` / `pnpm build` succeed without any manual developer action.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-story extensions to shared components with default-preserving props. These are additive only — existing call sites remain unchanged — and they unblock US1 and US2 simultaneously.

**⚠️ CRITICAL**: These tasks MUST be completed before the US1 and US2 implementation tasks can begin.

- [X] T002 [P] Extend `CommandPreview` with optional `showCopyButton` (default `true`) and `showLabel` (default `true`) props in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/CommandPreview.tsx`. When `showLabel === false`, omit the `<label>Command preview:</label>` element. When `showCopyButton === false`, omit the copy button. The inner read-only `<input>` element, its `select-all` class, and the `overflow-x-auto` horizontal-scroll styling MUST be preserved regardless of prop values so click-to-select still works in every call site. Keep defaults so every existing call site is unchanged.

- [X] T003 [P] Extend `StashDialog` with optional `title?: string` (default `'Stash All Changes'`) and `description?: string` (default `'Stash all changes including untracked files.'`) props in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/StashDialog.tsx`. Replace the hardcoded `Dialog.Title` / `Dialog.Description` content with the prop values (falling back to the defaults). Do NOT touch any other call site in this task.

- [X] T004 [P] Extend `DiscardAllDialog` with optional `title`, `description`, `confirmLabel`, and `commandPreview` props in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/DiscardAllDialog.tsx`. Defaults must preserve the current exact wording (`'Discard All Unstaged Changes'`, the existing description, `'Discard All'`, and `buildDiscardAllUnstagedCommand()`). Pass through all props to the underlying `ConfirmDialog`.

- [X] T004b Add a promise-based dialog-action correlation slot to `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/rpc/rpcClient.ts`, mirroring the existing `pendingPush` pattern:
  - Private field: `pendingDialogAction: { resolve: () => void; reject: (err: string) => void } | null = null;`
  - Public method `awaitNextDialogAction(): Promise<void>` — installs the resolve/reject pair. If a previous slot is still installed, reject it with the string `'superseded'` and clear it before installing the new one.
  - Public method `clearPendingDialogAction(): void` — rejects the current slot with the string `'dialog-closed'` and clears it. No-op when the slot is null.
  - In the existing `case 'success':` branch, if `pendingDialogAction` is non-null, call its `resolve()` and null it (this happens alongside the existing `store.setSuccessMessage(...)` call — do not remove that call; both sides stay wired).
  - In the existing `case 'error':` branch, if `pendingDialogAction` is non-null, call its `reject(message.payload.error.message)` and null it (alongside the existing `store.setError(...)` + `this.rejectPendingLookups(...)` calls).
  This becomes the deterministic busy-lift signal used by `FilePickerDialog` — replacing the unreliable "next store update" approach — so a watcher-triggered refresh can no longer prematurely clear `isRunning`. Existing non-dialog callers are not affected: a `null` pending slot is a no-op at both hook points.

**Checkpoint**: With T001–T004b complete, all shared component primitives and the dialog-action correlation mechanism are ready. US1 and US2 implementations can now start in parallel.

---

## Phase 3: User Story 1 — "Select files for…" dialog overhaul (Priority: P1) 🎯 MVP

**Goal**: Replace the four action buttons with a radio group + single action button, with live counts, command previews, stash-with-message support, busy state, inline error banner, post-success refresh, and correct handling of untracked + renamed files.

**Independent Test**: Manually execute the Story 1 steps in `quickstart.md` on a working tree that has a mix of unstaged, staged, untracked, renamed, and dual-state files. All acceptance scenarios in spec.md section "User Story 1" must pass without any other story in this feature being present.

### Unit tests for User Story 1 (pure helpers only)

- [X] T005 [P] [US1] Write Vitest unit tests for `computeRadioAvailability` and `applyDefaultRadioRule` in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/__tests__/radioAvailability.test.ts`. Cover the full table in `data-model.md` §2.1 including: no selection, only-unstaged, only-staged, mixed, dual-state alone, and the sticky previous-radio case for `applyDefaultRadioRule`. Tests MUST fail until T006 lands.

- [X] T006 [P] [US1] Write Vitest unit tests for `buildDefaultStashMessage` in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/__tests__/stashMessage.test.ts`. Cover `buildDefaultStashMessage(5, 'dev') === 'Stash of 5 files from dev'`, `buildDefaultStashMessage(1, 'feature/x') === 'Stash of 1 files from feature/x'`, and the zero-count edge case. Tests MUST fail until T008 lands.

- [X] T007 [P] [US1] Write Vitest unit tests for `buildSelectiveStashCommand` AND `buildSelectiveDiscardCommand` in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/__tests__/gitCommandBuilder.stash.test.ts`. Cover stash: no untracked → single `git stash push -m "<msg>" -- <paths>` line; with untracked → `git add -- <paths> && git stash push -m "<msg>" -- <paths>`; path-quoting for paths containing spaces; empty-message case. Cover discard: tracked only → `git checkout -- <paths>`; tracked + untracked → `git checkout -- <tracked> && git clean -fd -- <untracked>`; untracked only → `git clean -fd -- <paths>`. Tests MUST fail until T009 lands.

### Pure utilities for User Story 1

- [X] T008 [P] [US1] Create `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/stashMessage.ts` with `export function buildDefaultStashMessage(fileCount: number, branchName: string): string` returning `` `Stash of ${fileCount} files from ${branchName}` `` exactly (matches FR-032).

- [X] T009 [P] [US1] Extend `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/gitCommandBuilder.ts` with four new exports: `buildSelectiveStageCommand(paths)`, `buildSelectiveUnstageCommand(paths)`, `buildSelectiveDiscardCommand({ trackedPaths, untrackedPaths })`, and `buildSelectiveStashCommand({ paths, message, hasUntracked })`. Use shell-safe path quoting (wrap any path containing whitespace in double quotes, escape embedded `"`). The stash builder joins `git add -- <paths>` and `git stash push -m "<msg>" -- <paths>` with ` && ` when `hasUntracked === true`, otherwise emits only the `git stash push` form. The discard builder emits `git checkout -- <trackedPaths>` when `untrackedPaths` is empty, and joins `git checkout -- <trackedPaths> && git clean -fd -- <untrackedPaths>` with ` && ` when untracked are present (mirrors the backend `discardFiles` behavior exactly, so the preview and copy button match what runs per the same contract that governs stash in FR-028c). When `trackedPaths` is empty, emit only the `git clean -fd` form. The returned strings are the exact commands the backend will run and what the copy button will copy (FR-028a/b/c for stash, and by parallel contract for discard).

- [X] T010 [P] [US1] Create `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/utils/radioAvailability.ts` with `type ActionKind`, `interface RadioAvailability`, `computeRadioAvailability({ selectedPaths, stagedFiles, unstagedFiles })`, and `applyDefaultRadioRule(availability, previous)`. Follow the rules and counts from `data-model.md` §2.1/§2.2 exactly, including dual-state handling (FR-015a) and the sticky previous-radio rule.

### Shared types and backend for User Story 1

- [X] T011 [US1] Add a new request variant `{ type: 'stashSelected'; payload: { message: string; paths: string[]; addUntrackedFirst: boolean } }` to the `RequestMessage` union in `/home/onlineeric/repos/speedy-git-ext/shared/messages.ts`, and add `stashSelected: true` to the `REQUEST_TYPES` exhaustiveness map so compile-time coverage stays enforced.

- [X] T012 [US1] Add `stashSelected(message: string, paths: string[], addUntrackedFirst: boolean): Promise<Result<string>>` to `/home/onlineeric/repos/speedy-git-ext/src/services/GitStashService.ts`. When `addUntrackedFirst` is true, first call `executor.execute({ args: ['add', '--', ...paths], cwd: this.workspacePath })` — if that fails, return its error immediately. Then call `executor.execute({ args: ['stash', 'push', '-m', message, '--', ...paths], cwd: this.workspacePath })`. On stash-step failure after a successful add, return a new `GitError` whose message explicitly names both steps and states `"git add succeeded; git stash push failed with <original message>. Selected untracked files are now staged."` so the webview banner can surface FR-F03 wording. When `addUntrackedFirst` is false, run only the single `git stash push -m <message> -- <paths>` step. Include an `info` log line similar to the existing `stashWithMessage` method.

- [X] T013 [US1] Add an `rpcClient.stashSelected(message, paths, addUntrackedFirst)` method in `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/rpc/rpcClient.ts` next to the existing `stashWithMessage` method. It sends `{ type: 'stashSelected', payload: { message, paths, addUntrackedFirst } }` via the existing `send` helper.

- [X] T014 [US1] Add the `case 'stashSelected':` branch to the webview message handler in `/home/onlineeric/repos/speedy-git-ext/src/WebviewProvider.ts`, mirroring the existing `stashWithMessage` case. On success post `{ type: 'success', ... }` and call `await this.sendInitialData(undefined, true)`; on failure post `{ type: 'error', payload: { error: result.error } }`. Wire `message.payload.message`, `message.payload.paths`, and `message.payload.addUntrackedFirst` into `this.gitStashService.stashSelected(...)`.

### UI: dialog overhaul for User Story 1

- [X] T015 [US1] Rewrite `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/FilePickerDialog.tsx` to replace the four action buttons with a `@radix-ui/react-radio-group` containing Stage, Unstage, Discard, and Stash with message rows. All state, rules, and wiring live in this single component. Specifically:

  1. Local React state additions: `selectedRadio: ActionKind | null`, `stashMessage: string`, `isRunning: boolean`, `errorBanner: string | null` (matches `data-model.md` §1.3).

  2. On every change to `selectedPaths`, recompute `RadioAvailability` via `computeRadioAvailability` and update `selectedRadio` via `applyDefaultRadioRule(availability, prev)`. Also clear `errorBanner` on any selection change.

  3. **Derive the effective path list per action kind before rendering previews** (resolves the spec ambiguity about whose path list drives the Stash preview — it is always the post-augmentation list the backend will receive):
     - `effectiveStagePaths` = selected paths whose path has an unstaged side.
     - `effectiveUnstagePaths` = selected paths whose path has a staged side.
     - `effectiveDiscardTrackedPaths` = selected paths whose path has an unstaged side AND whose status is NOT `untracked`.
     - `effectiveDiscardUntrackedPaths` = selected paths whose status IS `untracked`.
     - `effectiveStashPaths` = the union of `selectedPaths` PLUS both sides (`path` and `oldPath`) of every renamed entry present anywhere in the uncommitted set (FR-035), deduped. `hasUntracked` is true iff any file in `effectiveStashPaths` has status `untracked`.
     These exact lists are what the command previews AND the RPC payloads will use, so what the user sees is what the backend runs (FR-028c).

  4. Render the radio group inside a container placed between the file list and the button bar. Each row shows `<RadioGroup.Item> <label>`, then the command preview via `<CommandPreview command={...} showLabel={false} showCopyButton={kind === selectedRadio} />`, with disabled rows rendered at lower opacity (FR-026). The Stash row is two lines: the radio + label on line 1, and an `<input type="text">` for the stash message on line 2 (placeholder `Stash message...`). The four previews are built from the effective lists in step 3: `buildSelectiveStageCommand(effectiveStagePaths)`, `buildSelectiveUnstageCommand(effectiveUnstagePaths)`, `buildSelectiveDiscardCommand({ trackedPaths: effectiveDiscardTrackedPaths, untrackedPaths: effectiveDiscardUntrackedPaths })`, `buildSelectiveStashCommand({ paths: effectiveStashPaths, message: resolvedStashMessage, hasUntracked })`. The `resolvedStashMessage` is the trimmed `stashMessage` or, when empty, `buildDefaultStashMessage(effectiveStashPaths.length, currentBranch)`.

  5. The Stash message input is disabled whenever `selectedRadio !== 'stash'`. Clicking the disabled input auto-sets `selectedRadio = 'stash'` and focuses the input (FR-030).

  6. When any renamed file exists in the uncommitted set (check `[...stagedFiles, ...unstagedFiles].some(f => f.status === 'renamed')`), render a persistent muted-text note underneath the Stash row: `Note: renamed files are always stashed as a pair and cannot be partially selected.` (FR-034).

  7. Read the current branch name via `const currentBranch = useGraphStore((s) => s.branches.find(b => b.current)?.name ?? 'HEAD');` and pass it into the default-stash-message helper whenever the user leaves the message input blank.

  8. The action button replaces the four old buttons. Its label is `${labelFor(selectedRadio)} (${availability[...Count]})` using the counts from availability. Hide the button entirely when `selectedRadio === null` (FR-024). While `isRunning === true`, render the button as `Working…` with a small inline spinner (unicode `⏳` or an SVG) and keep it disabled (FR-I01).

  9. On action button click, branch by `selectedRadio`:
     - `'stage'` → `setIsRunning(true); rpcClient.stageFiles(effectiveStagePaths); await rpcClient.awaitNextDialogAction();`
     - `'unstage'` → `setIsRunning(true); rpcClient.unstageFiles(effectiveUnstagePaths); await rpcClient.awaitNextDialogAction();`
     - `'discard'` → open the per-file discard confirmation (see step 10). The `awaitNextDialogAction()` call happens in the confirm handler, not here.
     - `'stash'` → `setIsRunning(true); rpcClient.stashSelected(resolvedStashMessage, effectiveStashPaths, hasUntracked); await rpcClient.awaitNextDialogAction();`

     Wrap the awaits in `try { ... success path ... } catch (errMsg) { setErrorBanner(String(errMsg)); } finally { setIsRunning(false); }`. The `awaitNextDialogAction()` pattern comes from T004b and GUARANTEES that `isRunning` is cleared by the actual response to this command, not by an unrelated store update.

  10. For the Discard path, render a `<DiscardAllDialog>` configured with `title='Discard Selected Changes'`, `description` built as `This will permanently discard ${n} file(s).` + (when `effectiveDiscardUntrackedPaths.length > 0`) ` ${effectiveDiscardUntrackedPaths.length} untracked file(s) will be permanently deleted.` + ` This cannot be undone.`, `confirmLabel={``Discard (${n})``}`, `commandPreview={buildSelectiveDiscardCommand({ trackedPaths: effectiveDiscardTrackedPaths, untrackedPaths: effectiveDiscardUntrackedPaths })}`. On confirm: `setIsRunning(true); rpcClient.discardFiles([...effectiveDiscardTrackedPaths, ...effectiveDiscardUntrackedPaths], effectiveDiscardUntrackedPaths.length > 0); try { await rpcClient.awaitNextDialogAction(); } catch (errMsg) { setErrorBanner(String(errMsg)); } finally { setIsRunning(false); setDiscardConfirmOpen(false); }`.

  11. While `isRunning === true`, disable the action button, the file-list checkboxes, and the radio group; Close button stays enabled (FR-I02, FR-I03). Closing the dialog while a command is in flight cancels the local `awaitNextDialogAction` wait via the next `rpcClient.awaitNextDialogAction()` call's `'superseded'` reject — the backend git command keeps running and the next refresh will show its real effect (matches the FR-I03 clarification).

  12. Render an inline error banner at the top of the dialog when `errorBanner !== null` (red background using `var(--vscode-inputValidation-errorBackground)`, a dismiss-X button that clears it). The banner text is the verbatim error message surfaced by the backend — for the add-then-stash case, that message is already prefixed with which step failed and the current tree state (the backend owns that wording per T012); the webview does NOT augment it further.

  13. On a successful action (i.e., `awaitNextDialogAction()` resolved), PRESERVE `selectedPaths` so the user can run another action on the same set (FR-P02), clear `stashMessage`, clear `errorBanner`, and let the radio rule re-evaluate via the existing availability effect — the sticky default rule in `applyDefaultRadioRule` will flip a now-disabled `selectedRadio` (e.g. `'stage'` → `'unstage'` after Stage succeeded). Add a separate effect keyed on the refreshed `stagedPathSet` / `unstagedPathSet` that prunes any path in `selectedPaths` which no longer exists in either list (untracked files discarded, or files stashed away), so counts and checkboxes stay aligned with the new working-tree state. The backend-driven refresh has already updated `stagedFiles` / `unstagedFiles` in the store by the time the promise resolves.

- [X] T016 [US1] In `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/FilePickerDialog.tsx`, verify that on dialog close (`onOpenChange(false)`) any in-flight `pendingDialogAction` slot is released by calling `rpcClient.awaitNextDialogAction()`-equivalent cleanup — specifically: install an `useEffect` cleanup that, if the component unmounts while `isRunning === true`, calls a new `rpcClient.clearPendingDialogAction()` method added in T004b (make that method a named no-op that rejects the current slot with `'dialog-closed'`). This guarantees the `try/await/catch` chain in T015 step 9 never leaks a hanging promise when the user closes the dialog mid-command. Also confirm: selection on the file list remains preserved on BOTH failure AND success (with stale paths pruned on success), per FR-P02 and T015 step 13; this task is purely the cleanup safety net.

**Checkpoint**: User Story 1 delivers the full radio-group dialog. With T001–T016 complete, steps 1–15 of `quickstart.md` pass without any changes to US2/US3/US4 code.

---

## Phase 4: User Story 2 — "Stash Everything…" rename and confirmation (Priority: P2)

**Goal**: Rename the uncommitted context-menu item "Stash All Changes" → "Stash Everything…" and surface the existing `StashDialog` with a title override so the menu item is unambiguous and confirm-gated.

**Independent Test**: Right-click the uncommitted node → verify the menu item says "Stash Everything…" with trailing ellipsis, is visually distinct from "Stage All Changes", opens the StashDialog with "Stash Everything" as the title, Cancel aborts without any stash, and Stash with an optional message stashes the whole working tree.

### Implementation for User Story 2

- [X] T017 [US2] In `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/UncommittedContextMenu.tsx`: change the `<ContextMenu.Item>` currently labeled `Stash All Changes` to `Stash Everything…` (use `\u2026` or a literal `…`). Keep its `onSelect` unchanged (it already opens `StashDialog` via `setStashDialogOpen(true)`).

- [X] T018 [US2] In the same file, update the `<StashDialog>` render to pass `title="Stash Everything"` (and `description="Stash all changes including untracked files."` if clarity helps). This relies on the optional props added in T003.

**Checkpoint**: With T017–T018 complete, quickstart Story 2 passes. The existing "Stash Everything" whole-tree flow remains confirmation-gated via the already-present `StashDialog`.

---

## Phase 5: User Story 3 — Always-visible Stage / Unstage arrow (Priority: P3)

**Goal**: On uncommitted-node file rows, show the stage/unstage arrow at all times (skip the hover gate) while keeping all other action icons hover-only.

**Independent Test**: Open the uncommitted node → each file row shows the stage or unstage arrow without hovering. Copy-path, Open file, and Open current version icons remain hidden until hover. On any regular commit, all per-row icons behave as before.

### Implementation for User Story 3

- [X] T019 [US3] In `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/FileChangeShared.tsx`, `FileActionIcons` component: split the current single `<span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">` wrapper into two sibling spans. The first span contains only the stage-button / unstage-button / discard-button children and is always visible when `isUncommitted && !isConflicted` (no `opacity-0 group-hover:opacity-100`). The second span contains the copy-path button, the "Open file at this commit" button, and the "Open current version" button and keeps the existing `opacity-0 group-hover:opacity-100 transition-opacity` hover gate. Ensure layout (gap, alignment) is unchanged by giving both spans `flex items-center gap-0.5`.

**Checkpoint**: With T019 complete, quickstart Story 3 passes. Regular commits are unchanged because none of them enter the `isUncommitted` branch.

---

## Phase 6: User Story 4 — Remove redundant "Open file at this commit" on uncommitted rows (Priority: P4)

**Goal**: Hide the "Open file at this commit" icon on uncommitted-node rows only. On every other commit it still appears and works as before.

**Independent Test**: Uncommitted node → no "Open file at this commit" icon on any file row. Regular commit → icon is still present and opens the file at that commit.

### Implementation for User Story 4

- [X] T020 [US4] In `/home/onlineeric/repos/speedy-git-ext/webview-ui/src/components/FileChangeShared.tsx`, gate the "Open file at this commit" button (the `handleOpenAtCommit` button with `<FileCodeIcon />`) on `!isUncommitted` so it is not rendered at all for uncommitted-node rows. All other commits MUST continue to render this button unchanged.

**Checkpoint**: With T020 complete, quickstart Story 4 passes. Combined with T019, the uncommitted-node file row now has always-visible stage/unstage + hover-only copy/open-current, and no "Open file at this commit" button.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Project-wide validation and documentation.

- [X] T021 [P] Run the full `pnpm typecheck` and fix any TypeScript errors surfaced by the new RPC message, new service method, or the refactored `FilePickerDialog`.

- [X] T022 [P] Run `pnpm lint` and fix any ESLint errors or warnings introduced by this feature in `webview-ui/src/**` or `src/**`.

- [X] T023 [P] Run `pnpm test` and make sure all new Vitest tests (T005, T006, T007) pass along with the existing test suite.

- [X] T024 Run `pnpm build` (non-prod) and confirm a clean build of both extension and webview bundles.

- [ ] T025 Manually execute the full `/home/onlineeric/repos/speedy-git-ext/specs/038-uncommitted-node-ux/quickstart.md` walkthrough end-to-end against the "Run Extension (Watch)" launch, verifying all four stories independently and then together. In addition, explicitly exercise the following mandatory sub-scenarios that are easy to skip:
  1. **Untracked in selective stash** — confirm the `&&`-joined preview matches the exact `git add -- … && git stash push -m "…" -- …` form, run it, apply the resulting stash, and verify the untracked file reappears on disk (SC-004).
  2. **Renamed file auto-inclusion** — include at least one renamed pair in the uncommitted set, select only unrelated modified files, run Stash, apply the resulting stash on a clean tree, and verify both sides of the rename reappear (SC-005).
  3. **Busy → success transition** — click action, observe `Working…` + disabled inputs, wait for completion, observe selection **preserved** (same checkboxes still ticked) with stale paths pruned, and the radio auto-flipped via the sticky default rule (e.g. Stage → Unstage).
  4. **Busy → failure transition** — force a failure (e.g., stage a path that git refuses), click action, observe the inline error banner populated, selection and radio choice preserved.
  5. **Close-during-busy** — click action, close the dialog before completion, re-open the dialog, confirm the file list reflects the backend's actual final state and no ghost banner is present.
  6. **Superseded action** — rapid-click two different actions in a row (if staging still permits during the first) and confirm the UI does not double-lift `isRunning`. Capture any regressions and fix before closing the feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 must finish (i.e., developer has run the `pnpm add`) before any code in T015 can compile, because `FilePickerDialog` imports `@radix-ui/react-radio-group`.
- **Foundational (Phase 2)**: T002 (CommandPreview props) is required by T015; T003 (StashDialog title) is required by T018; T004 (DiscardAllDialog overrides) is required by T015; T004b (rpcClient dialog-action correlation) is required by T015 and T016. T002–T004b are mutually independent (different files / different code regions) and can all run in parallel after T001.
- **User Stories (Phase 3+)**: US1 depends on Phase 2 (T002, T004). US2 depends on Phase 2 (T003). US3 and US4 depend on nothing outside Phase 1 and touch the same file (`FileChangeShared.tsx`), so they MUST run sequentially with each other but are independent of every other story.
- **Polish (Phase 7)**: Depends on every story you chose to land.

### User Story Dependencies

- **US1 (P1)**: Depends on T001, T002, T004, T004b. Internally, T005–T010 are pure-utility work that can run in parallel with each other; T011 (shared messages) unblocks T013/T014; T012 is independent of the webview tasks; T015 depends on T008, T009, T010, T013, T004b, and the Phase-2 tasks. T016 depends on T015 and T004b.
- **US2 (P2)**: Depends on T001, T003. Internally T017 and T018 are sequential (same file).
- **US3 (P3)**: Depends on T001 only. Single task T019.
- **US4 (P4)**: Depends on T001 only. Single task T020. T019 and T020 touch the same file and MUST run sequentially.

### Within Each User Story

- Tests (T005–T007) are written first and MUST fail until their respective utility tasks (T008–T010) land.
- Pure utilities (T008–T010) before UI consumers (T015).
- Backend RPC (T011, T012) before webview RPC client (T013) before webview handler (T014) before dialog rewrite (T015) before dialog store subscription (T016).
- US3 and US4 both edit `FileChangeShared.tsx` and therefore MUST be implemented one after the other (T019 then T020) to avoid merge conflicts.

### Parallel Opportunities

- Phase 2: T002, T003, T004, T004b all parallelizable (different files / different regions of rpcClient).
- Phase 3 pure utilities + tests: T005, T006, T007, T008, T009, T010 are all parallelizable (different files) once the Phase-2 gate is cleared.
- T011 and T012 are independent (different files) and can run in parallel.
- Polish: T021, T022, T023 are parallelizable (read-only validation steps).

---

## Parallel Example: User Story 1 — pure helpers & tests wave

```bash
# Launch all pure-helper utility tasks together (after Phase 2 completes):
Task: "T008 — create webview-ui/src/utils/stashMessage.ts"
Task: "T009 — extend webview-ui/src/utils/gitCommandBuilder.ts with selective commands"
Task: "T010 — create webview-ui/src/utils/radioAvailability.ts"

# Launch their Vitest suites in parallel (tests fail until each implementation lands):
Task: "T005 — write radioAvailability.test.ts"
Task: "T006 — write stashMessage.test.ts"
Task: "T007 — write gitCommandBuilder.stash.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (T001).
2. Complete Phase 2 (T002, T004 — T003 not strictly needed for MVP).
3. Complete Phase 3 (T005–T016) — the full dialog overhaul.
4. **STOP and VALIDATE**: Run quickstart Story 1 end-to-end on a mixed working tree.
5. Ship as an MVP increment. Stories 2–4 are additive polish.

### Incremental Delivery

1. Setup + Foundational → primitives in place.
2. US1 → test → ship MVP (largest value).
3. US2 → test → ship (confirm-gate for whole-tree stash).
4. US3 → test → ship (always-visible arrow).
5. US4 → test → ship (removes redundant icon).
6. Polish phase validates the whole feature against quickstart + typecheck + lint + build.

### Parallel Team Strategy

If two developers are available after Phase 2:

- Developer A: US1 (the long path — T005 through T016).
- Developer B: US2, then US3, then US4 (all small).
  Stories 2–4 have no code-path dependency on US1 and can land in any order.

---

## Notes

- [P] tasks operate on distinct files and have no dependencies on incomplete tasks.
- `[Story]` labels map each task back to the priority in spec.md for traceability.
- Each story is independently testable per its section's "Independent Test" rubric.
- Per constitution: the agent MUST NOT run `pnpm add` itself — T001 is a developer-executed step.
- No integration/UI tests are generated; manual validation via `quickstart.md` is the convention for this codebase.
- Commit after each numbered task or logical group, per `CLAUDE.md` guidance.
