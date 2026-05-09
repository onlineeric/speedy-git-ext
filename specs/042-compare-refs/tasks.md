---
description: "Task list for feature 042-compare-refs implementation"
---

# Tasks: Compare Refs (A vs B)

**Input**: Design documents from `/specs/042-compare-refs/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/rpc-messages.md, contracts/ui-contracts.md, quickstart.md

**Tests**: Unit tests are scoped to deterministic helpers (slot-equality, default-mode rule, parser sub-cases, abort plumbing) per plan.md §Testing. Integration / acceptance is covered by the manual quickstart, not automated tests.

**Organization**: Tasks are grouped by user story (US1 → US5) so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User-story label (US1, US2, US3, US4, US5)
- All file paths are repository-relative

## Path Conventions (from plan.md)

- **Shared contracts**: `shared/types.ts`, `shared/messages.ts`, `shared/errors.ts`
- **Extension host**: `src/services/`, `src/WebviewProvider.ts`
- **Webview**: `webview-ui/src/components/`, `webview-ui/src/stores/`, `webview-ui/src/rpc/`
- **Tests**: `webview-ui/src/stores/__tests__/`, `src/services/__tests__/` (Vitest)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the project is in a state where the compare feature can be added. No new directories or tooling are required (per plan.md §Project Structure: "all changes fit inside the existing `shared/` / `src/` / `webview-ui/src/` triad").

- [X] T001 Verify clean build baseline by running `pnpm typecheck && pnpm lint && pnpm build && pnpm test` from repo root. Resolve any pre-existing failures before starting feature work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, error codes, RPC message contracts, and backend cancellation plumbing. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add `EMPTY_TREE_HASH` constant, `SlotValue` discriminated union (variants: `workingTree`, `head`, `branch`, `tag`, `commit`, `expression`, `emptyTree`), `CompareMode` (`'two-dot' | 'three-dot'`), `CompareSelection`, `EMPTY_COMPARE_SELECTION`, `CompareResult`, and `ComparePanelUIState` to `shared/types.ts` per data-model.md §1–§5.
- [X] T003 [P] Add `'CANCELLED'` value to `GitErrorCode` union and update the `isGitErrorCode` guard / `GitError` doc comment in `shared/errors.ts`.
- [X] T004 Add request types `compareRefs`, `cancelCompare`, `openCompareDiff` and response type `compareResult` to `shared/messages.ts`; update the `REQUEST_TYPES` and `RESPONSE_TYPES` const maps so the existing exhaustive narrowing fires if a future edit drops one (depends on T002, T003).
- [X] T005 [P] Add optional `abortSignal?: AbortSignal` to `GitExecOptions` in `src/services/GitExecutor.ts`; in `execute()`, short-circuit with `err(new GitError('Cancelled', 'CANCELLED', cmdString))` when the signal is already aborted at call time, and register a one-shot `'abort'` listener that calls `gitProcess.kill()` and resolves with the same `CANCELLED` error.
- [X] T006 [P] Write Vitest unit tests for the abort path of `GitExecutor` (already-aborted signal short-circuits; abort during execution kills process and yields `CANCELLED`) in `src/services/__tests__/GitExecutor.test.ts` (create file if it does not yet exist).
- [X] T007 Add `compareSelection: CompareSelection`, `compareResult: CompareResult | null`, and `comparePanelUI: ComparePanelUIState` fields to the Zustand store in `webview-ui/src/stores/graphStore.ts`, initialised to `EMPTY_COMPARE_SELECTION`, `null`, and `{ loading: false, inlineError: null }` respectively. Add the action stubs `setSlotA`, `setSlotB`, `swapSlots`, `setCompareModeOverride`, `clearCompareState`, `beginCompare`, `endCompareSuccess`, `endCompareError`, `endCompareCancelled` per data-model.md §6. Both `setSlotA` and `setSlotB` MUST clear `compareSelection.modeOverride` (set to `null`) whenever the new slot value's `kind` differs from the previous slot value's `kind`, so the default-mode rule re-applies on the next render (research.md Decision 4) (depends on T002).
- [X] T008 [P] Write Vitest unit tests for `slotsEqual` and the store transitions defined in data-model.md §3 (slot edit clears resolved hashes and `compareResult`; swap exchanges values and dismisses result; mode flip dismisses result; clearCompareState resets to `EMPTY_COMPARE_SELECTION`) in `webview-ui/src/stores/__tests__/graphStore.compare.test.ts`.

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Right-click compare two commits (Priority: P1) 🎯 MVP

**Goal**: A user can right-click commit X → "Set as Base", right-click commit Y → "Compare with Base", and see the X→Y diff in the existing Commit Details panel. Single-commit click dismisses the compare result.

**Independent Test**: Per quickstart.md Scenario 1 — verify menu items appear/disable correctly, the result matches `git diff X Y`, file rows open VS Code's diff editor, and clicking a single commit returns to single-commit details.

### Implementation for User Story 1

- [X] T009 [US1] Implement `GitDiffService.compareRefs(refA, refB, mode, abortSignal?)` in `src/services/GitDiffService.ts` for the **commit-hash-only / two-dot** path: invoke `git diff --name-status -z refA refB` and `git diff --numstat -z refA refB` in parallel via `GitExecutor` (passing `abortSignal`), parse with the existing `parseDiffNameStatus` and `applyNumstatToFiles` helpers, resolve final hashes via `git rev-parse`, and return `Result<CompareResult, GitError>` per contracts/rpc-messages.md §Backend service contract (depends on T002, T005).
- [X] T010 [US1] Add a private `resolveSlot(slot: SlotValue): string | null` helper in `src/services/GitDiffService.ts` that maps slot kinds to commit-ish strings per contracts/rpc-messages.md (`commit` → hash, `emptyTree` → `EMPTY_TREE_HASH`, others wired in later stories).
- [X] T011 [US1] Wire request handlers in `src/WebviewProvider.ts` for `compareRefs`, `cancelCompare`, and `openCompareDiff`. Maintain a single in-flight `AbortController` for compare requests (latest-wins per research.md Decision 2). On `compareRefs`, call `GitDiffService.compareRefs` and post a `compareResult` response with the same `requestId`; on `cancelCompare`, call `abort()` on the active controller; on `openCompareDiff`, build the two URIs (file URI for working-tree side, `git-show://` URI otherwise) and call `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)` (depends on T004, T009).
- [X] T012 [US1] Map `GitError.code === 'CANCELLED'` to a non-toast outcome in `src/WebviewProvider.ts` (return error response without surfacing a notification) per contracts/rpc-messages.md §Errors.
- [X] T013 [P] [US1] Add `compareRefs(payload)`, `cancelCompare(requestId)`, and `openCompareDiff(payload)` client methods to `webview-ui/src/rpc/rpcClient.ts`, generating a UUID `requestId` for each compare so the store can match responses (depends on T004).
- [X] T014 [US1] Add `Set as Base` and `Compare with Base` items to `webview-ui/src/components/CommitContextMenu.tsx` per contracts/ui-contracts.md §CommitContextMenu. Visibility/disable rules: "Set as Base" always visible; "Compare with Base" visible iff `compareSelection.a !== null`, disabled iff `compareSelection.aResolvedHash === <right-clicked hash>` (semantic same-as-A guard per FR-014). On click, dispatch `setSlotA({ kind: 'commit', hash })` or `setSlotB({ kind: 'commit', hash })` plus `compareRefs` immediately for the second item (FR-019) (depends on T007, T013).
- [X] T015 [US1] In `webview-ui/src/components/CommitDetailsPanel.tsx`, read `compareResult` and `comparePanelUI` from the store; when `compareResult !== null` render the compare layout (header naming both ends + 2-dot/3-dot badge, stats line, virtualized file list) with rendering precedence `compareResult > commitDetails > placeholder` per contracts/ui-contracts.md §CommitDetailsPanel.
- [X] T016 [US1] In `webview-ui/src/components/CommitDetailsPanel.tsx`, render the existing single-commit loading spinner when `comparePanelUI.loading === true`, plus a visible **Cancel** button that dispatches `cancelCompare(activeRequestId)` per FR-025a/FR-025b (depends on T013, T015).
- [X] T017 [US1] Wire compare-result file-row clicks in `webview-ui/src/components/CommitDetailsPanel.tsx` to dispatch `openCompareDiff` with `compareResult.aResolvedHash`, `compareResult.bResolvedHash`, the file path, status, and a "Base → Target · path" title per contracts/ui-contracts.md §CommitDetailsPanel (depends on T013, T015).
- [X] T018 [US1] Update the single-commit selection setter in `webview-ui/src/stores/graphStore.ts` so that selecting a single commit row sets `compareResult = null` (FR-023) — slot values stay intact (depends on T007).
- [X] T019 [US1] Wire `beginCompare` / `endCompareSuccess` / `endCompareError` / `endCompareCancelled` in the store: on RPC dispatch from any compare entry point, set `loading=true`, `inlineError=null`, `compareResult=null`, store the active `requestId`; on `compareResult` response with matching `requestId` populate result + resolved hashes; on error response set `inlineError` (suppress for `CANCELLED`); ignore stale responses whose `requestId` is older than the active one (depends on T007, T013).

**Checkpoint**: User Story 1 fully functional — right-click X, right-click Y, see the diff, cancel mid-flight, click any commit to dismiss.

---

## Phase 4: User Story 2 — Compare any two refs via Compare panel (Priority: P2)

**Goal**: A user can open the Compare panel from the toolbar, type/pick any ref (branch, tag, HEAD, expression) into slot A and slot B, and click Compare to see the diff. Inline errors surface for unresolvable refs. Slots persist within session.

**Independent Test**: Per quickstart.md Scenario 2 — pick two branches and verify the result matches `git diff base...target`; verify A==B disables the button; verify slot persistence within session and clearing on window reload.

### Implementation for User Story 2

- [X] T020 [P] [US2] Extend `GitDiffService.compareRefs` in `src/services/GitDiffService.ts` to handle `branch`, `tag`, `head`, and `expression` slot kinds via `resolveSlot`. Pass each slot's identifier string verbatim to `git diff` as a separate `args[]` entry (`branch.name`, `tag.name`, `expression.text`, or the literal `'HEAD'`) — do NOT call `git rev-parse` before invocation; git resolves these natively (FR-007a / research.md Decision 3). No shell string concatenation. Map git-resolution failures (stderr matching "unknown revision" / "ambiguous argument") to a `GitError` with code `COMMAND_FAILED` and a clean message ("Unknown ref: <label>") per contracts/rpc-messages.md §Errors (depends on T010).
- [X] T021 [P] [US2] Add `displayRepo` / repo-switch hook in `webview-ui/src/stores/graphStore.ts` that calls `clearCompareState()` per FR-030 (depends on T007).
- [X] T022 [US2] Implement `webview-ui/src/components/CompareWidget.tsx` per contracts/ui-contracts.md §CompareWidget: two `FilterableSingleSelectDropdown<SlotValue>` slots (Base, Target), a swap (⇄) button, a 2-dot/3-dot radio toggle, and a Compare button. Slot items assembled from `WORKING_TREE`, `HEAD`, branches (local + remote), tags, recents, plus a synthetic typed-expression candidate when free-text doesn't match anything (depends on T007, T013).
- [X] T023 [US2] In `webview-ui/src/components/CompareWidget.tsx`, render each slot's chosen value as a chip showing kind icon + label (FR-006) and a per-slot ✕ clear affordance that calls `setSlotA(null)` / `setSlotB(null)` (depends on T022).
- [X] T024 [US2] In `webview-ui/src/components/CompareWidget.tsx`, disable the Compare button when either slot is null OR the two slots are structurally equal per data-model.md §2 equality (FR-021), and show an inline "A and B are the same" hint in the latter case (depends on T022).
- [X] T025 [US2] On Compare click in `webview-ui/src/components/CompareWidget.tsx`, dispatch `beginCompare()` then `rpcClient.compareRefs({ a, b, mode, requestId })`; on swap click, call `swapSlots()`; on toggle flip, call `setCompareModeOverride(...)`. The interim default mode (until T041–T042 land in US5) MUST be computed inline from slot kinds so FR-009/FR-010 are satisfied even if US5 ships later: `mode = override ?? ((a.kind ∈ {'branch','tag'} && b.kind ∈ {'branch','tag'}) ? 'three-dot' : 'two-dot')`. The full helper from T041 supersedes this inline check once available (depends on T013, T022).
- [X] T026 [US2] In `webview-ui/src/components/CompareWidget.tsx`, render `comparePanelUI.inlineError` below the controls in red text — no toast (FR-007 / FR-034 / FR-035) (depends on T022).
- [X] T027 [US2] In `webview-ui/src/components/TogglePanel.tsx`, register `CompareWidget` as the renderer for `activeToggleWidget === 'compare'` so opening the Compare button shows the panel (depends on T022).
- [X] T028 [US2] In `webview-ui/src/components/ControlBar.tsx` line 156: remove the `style={{ display: 'none' }}` on the Compare button. Compute the button color from `(activeToggleWidget, anySlotFilled)` per contracts/ui-contracts.md §ControlBar Compare button: `'compare'` → active blue; not-compare AND any slot filled → filtered yellow; otherwise → inactive (depends on T007).
- [X] T029 [P] [US2] Add `Set as Base` and `Compare with Base` items to `webview-ui/src/components/BranchContextMenu.tsx` (which also handles tag refs — see existing `refInfo.type === 'tag'` branch). Build the `SlotValue` from `refInfo.type`: `'branch'` / `'remote'` → `{ kind: 'branch', name, remote? }` (matches FR-013 branch case); `'tag'` → `{ kind: 'tag', name }` (matches FR-013 tag case); `'stash'` → DO NOT show compare items (FR-017). Apply the same disable rules as the commit-row variant (depends on T007, T013).
- [X] T030 [P] [US2] Write Vitest unit tests for `slotsEqual` covering all 7 kinds plus case-insensitive commit-hash equality and trim-equality for expressions in `webview-ui/src/stores/__tests__/graphStore.compare.test.ts` (extend the file from T008).

**Checkpoint**: User Stories 1 AND 2 work — both right-click flow and panel-driven flow are functional with branches and tags.

---

## Phase 5: User Story 3 — Compare working tree against any ref (Priority: P3)

**Goal**: A user can pick `Working Tree` in either slot and compare against any ref. The 3-dot toggle is disabled while `Working Tree` is involved. Auto-refresh re-runs the working-tree comparison when files change on disk; ref-vs-ref comparisons do not re-run.

**Independent Test**: Per quickstart.md Scenario 3 — make a local edit, compare HEAD vs Working Tree, verify only the edited file appears and that auto-refresh updates the result.

### Implementation for User Story 3

- [X] T031 [US3] Extend `GitDiffService.compareRefs` in `src/services/GitDiffService.ts` to handle `workingTree` slots: when `refB === null`, run `git diff --name-status -z refA` and `git diff --numstat -z refA` (working-tree comparison form per research.md Decision 1). Set `bResolvedHash = null` in the result. Reject any call that arrives with `mode === 'three-dot'` AND a `workingTree` slot with a `GitError` code `COMMAND_FAILED` and message "three-dot is not supported with Working Tree" (defense-in-depth; UI prevents this) (depends on T020).
- [X] T032 [P] [US3] In `webview-ui/src/components/CompareWidget.tsx`, add `Working Tree` (and `HEAD`) as top-level items in each slot's dropdown via the `SlotValue` `workingTree` / `head` variants per contracts/ui-contracts.md §CompareWidget (depends on T022).
- [X] T033 [US3] In `webview-ui/src/components/CompareWidget.tsx`, disable the 3-dot radio option (with a tooltip "3-dot does not apply to Working Tree") whenever either slot's `kind === 'workingTree'`; force the active mode to `'two-dot'` in that case regardless of override (FR-011) (depends on T022, T025).
- [X] T034 [US3] Hook the existing auto-refresh signal in `webview-ui/src/rpc/rpcClient.ts` `case 'commits':` handler (line ~54 — this is where the backend's `GitWatcherService`-driven refresh arrives in the webview). After the existing `store.setCommits(...)` call, additionally invoke a new store action `maybeRerunCompareForWorkingTree()` which: returns early unless `compareResult !== null` AND (`compareSelection.a?.kind === 'workingTree'` OR `compareSelection.b?.kind === 'workingTree'`); otherwise re-dispatches `rpcClient.compareRefs(...)` with the current selection and a fresh `requestId` (FR-032). For ref-vs-ref comparisons, the early-return path leaves the showing result untouched (FR-033).
- [X] T035 [P] [US3] Add `Set as Base` and `Compare with Base` items to `webview-ui/src/components/UncommittedContextMenu.tsx` using `{ kind: 'workingTree' }` per contracts/ui-contracts.md §UncommittedContextMenu (depends on T007, T013).
- [X] T036 [US3] In `webview-ui/src/components/CommitDetailsPanel.tsx`, render an explicit "No changes" empty state when `compareResult.files.length === 0` (FR-024) (depends on T015).

**Checkpoint**: User Story 3 works — working-tree comparison runs, 3-dot is correctly disabled, auto-refresh updates working-tree compares only.

---

## Phase 6: User Story 4 — Compare a range of commits at once (Priority: P3)

**Goal**: A user multi-selects ≥2 commits in the graph, right-clicks → "Compare these commits", and the result is the diff from the parent of the oldest selected commit to the newest. Root-commit edge case uses the empty-tree sentinel.

**Independent Test**: Per quickstart.md Scenario 4 — multi-select a contiguous range, run Compare these commits, verify the diff matches `git diff <oldest>^ <newest>`. Verify single-commit selection hides the item. Verify non-contiguous selection collapses to oldest+newest endpoints. Verify root-commit edge case renders the full content of the newest commit.

### Implementation for User Story 4

- [X] T037 [US4] Extend `GitDiffService.compareRefs.resolveSlot` in `src/services/GitDiffService.ts` to handle the `emptyTree` slot kind by mapping it to `EMPTY_TREE_HASH` so the existing `git diff <EMPTY_TREE_HASH> <newest>` form returns the full content of the newest commit (FR-016) (depends on T010, T020).
- [X] T038 [US4] In `webview-ui/src/components/CommitContextMenu.tsx`, detect multi-selection (`selectedCommits.length >= 2`) and surface a single **Compare these commits** item that hides the single-commit "Set as Base" / "Compare with Base" pair per contracts/ui-contracts.md §CommitContextMenu (depends on T014).
- [X] T039 [US4] On "Compare these commits" click, in `webview-ui/src/components/CommitContextMenu.tsx`: order the selected hashes by their position in `useGraphStore.getState().commits[]` (which is committer-date-descending); the **newest** is the hash with the lowest index, the **oldest** is the hash with the highest index. If `oldest.parents.length > 0`, set `a = { kind: 'commit', hash: oldest.parents[0] }`; if oldest is a root commit (no parents), set `a = { kind: 'emptyTree' }`; set `b = { kind: 'commit', hash: <newest> }`; dispatch `compareRefs` immediately (FR-019) (depends on T013, T038).
- [X] T040 [US4] In `webview-ui/src/components/CompareWidget.tsx` slot chip render path, add a label for `emptyTree` ("Empty Tree") so users see what slot A is when "Compare these commits" runs against a root commit (depends on T022).

**Checkpoint**: User Story 4 works — range compare via multi-select, including root-commit edge case.

---

## Phase 7: User Story 5 — Two-dot vs three-dot toggle defaults (Priority: P3)

**Goal**: The mode toggle defaults are computed from slot kinds: 3-dot for branch-vs-branch / tag-vs-tag, 2-dot otherwise; 3-dot is disabled when `Working Tree` is involved. Three-dot comparisons with no merge base fall back to two-dot with an inline notice.

**Independent Test**: Per quickstart.md Scenario 5 — pick two branches, verify default 3-dot; switch one slot to a typed expression, verify default snaps to 2-dot; pick two histories with no merge base in 3-dot mode, verify the fallback notice.

### Implementation for User Story 5

- [X] T041 [US5] Add a pure helper `defaultMode(a: SlotValue | null, b: SlotValue | null): CompareMode` to `webview-ui/src/utils/` (new file `compareDefaults.ts`) implementing the algorithm in research.md Decision 4: working-tree → two-dot; both refs (branch/tag) → three-dot; otherwise → two-dot.
- [X] T042 [US5] In `webview-ui/src/components/CompareWidget.tsx`, replace the fixed mode placeholder from T025 with `compareSelection.modeOverride ?? defaultMode(a, b)`. When the user flips the radio, call `setCompareModeOverride(mode)`; the store action MUST clear the override (`null`) whenever a slot's kind changes so the default re-applies on subsequent edits per research.md Decision 4 (depends on T007, T022, T041).
- [X] T043 [P] [US5] Write Vitest unit tests for `defaultMode` covering all combinations (workingTree A, workingTree B, branch×branch, tag×tag, branch×tag, branch×commit, branch×expression, commit×commit, expression×expression, head×branch, emptyTree×commit) in `webview-ui/src/utils/__tests__/compareDefaults.test.ts`.
- [X] T044 [US5] Add three-dot fallback to `GitDiffService.compareRefs` in `src/services/GitDiffService.ts`: when `mode === 'three-dot'`, call `git merge-base refA refB` first; if it returns a non-zero exit or empty output, run the diff with the two-dot form instead and set `fellBackToTwoDot: true` on the result per research.md Decision 1 + FR-012 (depends on T020).
- [X] T045 [US5] In `webview-ui/src/components/CommitDetailsPanel.tsx` compare-mode header (T015), render the inline notice "ⓘ No common ancestor; showing endpoint diff" when `compareResult.fellBackToTwoDot === true` (depends on T015, T044).

**Checkpoint**: User Story 5 works — smart defaults, manual override, three-dot fallback notice.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-cutting visual affordances (graph A/B markers, recently-used) and final validation gates. None of these block any single user story; they round out the feature.

- [X] T046 [P] In `webview-ui/src/components/CommitRow.tsx`, read `compareSelection.aResolvedHash` and `compareSelection.bResolvedHash`; render small "A" / "B" badges next to the commit hash chip when the row's hash matches, coexisting with existing branch/tag/HEAD chips (FR-026 / FR-027). Working Tree never gets a marker (FR-028) (depends on T007).
- [X] T047 [P] Mirror T046 in `webview-ui/src/components/CommitTableRow.tsx` for the table-style commit row (depends on T007).
- [X] T048 [P] In `webview-ui/src/stores/graphStore.ts`, append a slot value to `compareSelection.recents` (most-recent-first, max 8) inside `setSlotA` / `setSlotB`. Surface `recents` to `CompareWidget` so the dropdown pins recent items at the top per FR-005 + research.md Decision 10 (depends on T007, T022).
- [ ] T049 **Manual gate (deferred)**: Run `quickstart.md` Scenarios 1–10 against the test repo (`pnpm generate-test-repo` + F5 → Run Extension). Cannot be exercised from headless CLI; requires the VS Code Extension Development Host. File any deviation as a follow-up task before marking the feature complete.
- [X] T050 Run the validation gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` from repo root. All four MUST exit zero.
- [X] T051 Verify FR-017 is preserved by inspecting `webview-ui/src/components/StashContextMenu.tsx`: confirm it contains zero "Set as Base" / "Compare with Base" / "Compare these commits" items, and add an inline comment near the menu items list noting "// FR-017 (042-compare-refs): stash compare is intentionally out of scope; do not add compare items here." This task is a regression guard, not a behavior change.
- [ ] T052 **Manual gate (deferred)**: Performance gate for SC-003 (Constitution Principle I). Run a panel-driven compare across two refs with >100 changed files in the Extension Development Host and informally measure render latency. Cannot be exercised from headless CLI; defer to manual smoke. If observed time exceeds 2 seconds for <1,000 files, file a follow-up before merge.
- [X] T053 [P] Add a regression test for `compareRefs` parsing edge cases in `src/services/__tests__/GitDiffService.compare.test.ts`: feed synthetic `--name-status -z` + `--numstat -z` outputs covering binary files (numstat `-\t-`), renamed files (`R100`), mode-only changes (`M`), and added/deleted files; assert the resulting `FileChange[]` has the expected `status`, `additions`, `deletions`, and `oldPath` fields per data-model.md §4 (depends on T009).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2)** → depends on Setup; **blocks** all user stories.
- **User Story 1 (Phase 3, P1)** → depends on Foundational.
- **User Story 2 (Phase 4, P2)** → depends on Foundational. Independent of US1 in principle, but T028 (toolbar visibility) builds on the toolbar conventions and T026 (inline error) shares the panel-error path; either can land first.
- **User Story 3 (Phase 5, P3)** → depends on Foundational + US2 (CompareWidget exists, slot dropdowns are wired).
- **User Story 4 (Phase 6, P3)** → depends on Foundational + US1 (CommitContextMenu has the compare items already; this story adds the multi-select branch).
- **User Story 5 (Phase 7, P3)** → depends on Foundational + US2 (CompareWidget + mode toggle exist).
- **Polish (Phase 8)** → graph markers (T046/T047) depend on Foundational only; recents (T048) depend on US2; the parser regression test (T053) depends on US1 (T009); validation gates (T049/T050) come last; the FR-017 regression guard (T051) and SC-003 perf measurement (T052) sit alongside T049.

### Within Each User Story

- Backend service methods before WebviewProvider routes before rpcClient methods before component wiring.
- Store fields and actions before component reads.
- Typed contracts (`shared/`) before any consumer.

### Parallel Opportunities

- **Phase 2**: T002, T003, T005, T006, T008 can run in parallel (different files, no internal dependencies). T004 depends on T002+T003. T007 depends on T002.
- **Phase 3**: T013 ([P]) can run in parallel with T009/T010/T011/T012. T014 depends on T007+T013. T015/T016/T017 are sequential (same file).
- **Phase 4**: T020, T021, T029, T030 marked [P]. T022→T023→T024→T025→T026 are sequential (same file).
- **Phase 5**: T031, T032, T035 marked [P]. T033 depends on T022/T025; T034 depends on T007.
- **Phase 7**: T041, T043 marked [P]. T042 depends on T041; T044 depends on T020; T045 depends on T015+T044.
- **Phase 8**: T046, T047, T048 marked [P] (different files).

---

## Parallel Example: Phase 2 Foundational

```text
# Launch in parallel (no inter-dependencies):
T002 — shared/types.ts
T003 — shared/errors.ts
T005 — src/services/GitExecutor.ts
T006 — src/services/__tests__/GitExecutor.test.ts
T008 — webview-ui/src/stores/__tests__/graphStore.compare.test.ts (test file scaffold)

# Then in sequence:
T004 — shared/messages.ts (needs T002, T003)
T007 — webview-ui/src/stores/graphStore.ts (needs T002)
```

## Parallel Example: User Story 4

```text
# Sequential within US4 (each builds on prior):
T037 — backend resolveSlot for emptyTree
T038 — multi-select detection in CommitContextMenu
T039 — Compare these commits action wiring
T040 — Empty Tree label in CompareWidget chip
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup): T001.
2. Complete Phase 2 (Foundational): T002–T008.
3. Complete Phase 3 (US1): T009–T019.
4. Validate Scenario 1 in quickstart.md.
5. Ship MVP.

### Incremental Delivery

- After Phase 3 → MVP shippable (right-click flow works on commit rows).
- After Phase 4 → panel-driven branch/tag comparison works.
- After Phase 5 → working-tree comparison works.
- After Phase 6 → range compare via multi-select works.
- After Phase 7 → smart defaults + fallback notice land.
- After Phase 8 → polish (graph markers, recents) + validation.

### Parallel Team Strategy

Foundational must complete first. Once Phase 2 lands, US1 → US2 are typically sequential (US2 depends on US1's WebviewProvider routes existing in shape, even if its slot kinds are richer). After US2, **US3, US4, US5 are independent** and can be split across developers — they touch different files (UncommittedContextMenu, CommitContextMenu multi-select branch, defaultMode helper) and make compatible store changes.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to specific user story for traceability.
- Each user story should be independently completable and testable per the corresponding quickstart.md scenario.
- Tests are **scoped to deterministic helpers only** (slot equality, default mode, abort plumbing). End-to-end UI verification is the manual quickstart, not Vitest.
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts within a phase, cross-story dependencies that break independence.
