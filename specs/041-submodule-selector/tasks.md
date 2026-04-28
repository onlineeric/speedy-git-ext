---

description: "Task list for 041-submodule-selector implementation"
---

# Tasks: Replace Submodule Mode with Submodule Selector

**Input**: Design documents from `/specs/041-submodule-selector/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/webview-rpc.md ✓, quickstart.md ✓

**Tests**: Tests are NOT requested in the feature spec. Vitest unit tests for new store
actions are listed in the Polish phase as OPTIONAL parallelizable add-ons; skip if not needed.

**Organization**: Tasks are grouped by user story (US1 P1 MVP → US5 P3) so each story is
independently completable and testable. Foundational store/type work that all stories share is
in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3, US4, or US5 — maps to user stories from spec.md
- File paths are repo-relative.

## Path Conventions

This is a single VS Code extension with dual-process architecture:

- Backend (extension host): `src/`
- Frontend (webview): `webview-ui/src/`
- Shared types/contracts: `shared/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new dependencies, no new directories. The feature reuses the existing
project structure and existing packages (`@radix-ui/react-popover` already present).

- [x] T001 Confirm working tree is clean and on branch `041-submodule-selector` via `git status` (no code changes — sanity gate before refactors)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type extension and store refactor that **all** user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase completes.

- [x] T002 Extend `Submodule` interface in `shared/types.ts`: add `initialized: boolean` (required) per data-model.md §1.1
- [x] T003 Add a deprecation JSDoc comment on `SubmoduleNavEntry` in `shared/types.ts` (no shape change) — tag it as deprecated by the new design (data-model.md §1.2)
- [x] T004 Populate `Submodule.initialized` in `src/services/GitSubmoduleService.ts` `parseSubmoduleLine` per research.md R5: `initialized = (status !== 'uninitialized') && fs.existsSync(path.join(this.workspacePath, submodulePath, '.git'))`. Import `existsSync` and `path.join` if not already used.
- [x] T005 Add new fields `activeParentRepoPath: string`, `displayedRepoPath: string`, `submoduleSelection: 'parent' | string` to the `GraphStore` interface and the `create<GraphStore>(...)` initial-state literal in `webview-ui/src/stores/graphStore.ts` (data-model.md §2.1). Initial values: `''`, `''`, `'parent'`.
- [x] T006 Add new actions `resetTopMenuGroup: () => void` and `setSubmoduleSelection: (value: 'parent' | string) => void` to the `GraphStore` interface declaration in `webview-ui/src/stores/graphStore.ts` (data-model.md §2.2). Implementation lands in T008/T009. (Same file as T005 — batch into one Edit pass.)
- [x] T007 Migrate the existing `activeRepoPath` field in `webview-ui/src/stores/graphStore.ts`: rename to `activeParentRepoPath` everywhere in the store file, and update consumer files referenced in T013–T016. (Use the Edit tool's `replace_all` carefully scoped to `webview-ui/src/`.)
- [x] T008 Implement `resetTopMenuGroup()` in `webview-ui/src/stores/graphStore.ts`: call `get().resetAllFilters({ preserveBranches: false })` and reset `searchState` to `{ ...defaultSearchState, isOpen: state.searchState.isOpen }` (preserve `isOpen`); MUST NOT touch `activeToggleWidget` (FR-024). Idempotent.
- [x] T009 Implement `setSubmoduleSelection(value)` in `webview-ui/src/stores/graphStore.ts`: write `submoduleSelection`, compute `displayedRepoPath`. For the `'parent'` case use `activeParentRepoPath` as-is. For a submodule path, concatenate using forward slashes — `joinPath(activeParentRepoPath, value)` — and collapse any duplicate slashes with a small helper: `(a, b) => \`${a.replace(/\/$/, '')}/${b.replace(/^\/+/, '')}\`.replace(/\/+/g, '/')`. Place the helper as a top-level `function joinRepoPath(parent: string, sub: string): string` in the same file (above `useGraphStore`). Do **not** import Node's `path` module (the webview is a sandboxed browser bundle). Call `resetTopMenuGroup()`. Dispatch `rpcClient.send({ type: 'switchRepo', payload: { repoPath: displayedRepoPath } })`. Set `isLoadingRepo: true`.
- [x] T010 Refactor `setActiveRepo(repoPath)` in `webview-ui/src/stores/graphStore.ts` per data-model.md §2.2: write `activeParentRepoPath = repoPath`, `submoduleSelection = 'parent'`, `displayedRepoPath = repoPath`; call `resetTopMenuGroup()`; preserve existing RPC dispatch (`switchRepo`) and `isLoadingRepo: true` semantics. Remove the now-redundant inline `resetAllFilters` call done by `setRepos` (or leave it — verify no double-reset).
- [x] T011 Refactor `setRepos(repos, activeRepoPath)` in `webview-ui/src/stores/graphStore.ts`: write `activeParentRepoPath = activeRepoPath`, `submoduleSelection = 'parent'`, `displayedRepoPath = activeRepoPath` on the change path. Existing reset behavior preserved.
- [x] T012 Update consumers of the old `activeRepoPath` field across the webview (e.g., `webview-ui/src/components/RepoSelector.tsx`, anything using `useGraphStore((s) => s.activeRepoPath)`) to use `activeParentRepoPath`. Confirm via `grep -rn "activeRepoPath" webview-ui/src` returns no hits.
- [x] T013 Run `pnpm typecheck` to verify the rename and new fields compile cleanly. Fix any type errors before proceeding.

**Checkpoint**: Foundational types + store ready. All user-story phases unblocked.

---

## Phase 3: User Story 1 - View a parent repo's submodule via a dedicated selector (Priority: P1) 🎯 MVP

**Goal**: Replace the legacy submodule header row + Back-to-parent button with a compact
submodule selector next to the repo selector. Selecting a submodule switches the graph
view to that submodule; selecting the parent option returns to the parent.

**Independent Test**: Open a parent repo with submodules. Confirm the header row above the
graph is gone, the submodule selector appears next to the repo selector, and switching
between the parent option and a submodule option in the submodule selector switches the
graph view accordingly. (Quickstart §A, §B, §C1–C2.)

### Implementation for User Story 1

- [x] T014 [US1] Create `webview-ui/src/components/SubmoduleSelector.tsx`. Component reads `activeParentRepoPath`, `submodules`, `submoduleSelection`, and `setSubmoduleSelection` from `useGraphStore`. Uses a native `<select>` (filterable upgrade comes in US4). Renders nothing when `initializedSubmodules.length === 0`. Builds options per data-model.md §3.2: parent option labeled `<basename(activeParentRepoPath)> (parent)` with value `'parent'`, then initialized submodules labeled `basename(s.path)` sorted case-insensitive. `onChange` calls `setSubmoduleSelection(e.target.value)`.
- [x] T015 [US1] Render `<SubmoduleSelector />` in `webview-ui/src/components/ControlBar.tsx` immediately after `<RepoSelector />` and before `<MultiBranchDropdown />` (left-to-right order per spec). No conditional wrapper at the call site — the component owns its own visibility.
- [x] T016 [US1] Delete file `webview-ui/src/components/SubmoduleBreadcrumb.tsx` (FR-002 — Back-to-parent button removed).
- [x] T017 [US1] Remove the `<SubmoduleBreadcrumb />` import and render site from `webview-ui/src/components/GraphContainer.tsx` (FR-001).
- [x] T018 [US1] Remove the `<SubmoduleSection />` render site (and its inner `SubmoduleSection` / `SubmoduleRow` / `getSubmoduleStatusColor` helper functions) from `webview-ui/src/components/GraphContainer.tsx` (FR-001). Also remove the now-unused `submodules` destructure from the same file's `useGraphStore` call.
- [x] T019 [US1] Remove the `submoduleStack` push side-effect from `src/ExtensionController.ts`'s `setSubmoduleNavigationHandlers` `openSubmodule` callback. The handlers can remain wired but `submoduleStack` is no longer mutated by selector-driven navigation. (`backToParentRepo` callback also unchanged but unreachable.)
- [~] T020 [US1] Manual smoke: run `pnpm build` then F5 → "Run Extension". Open a fixture repo with ≥ 2 initialized submodules. Verify quickstart §A1, §A3, §B1, §B2, §C1, §C2.

**Checkpoint**: User Story 1 fully functional. The MVP increment can ship here — the
remaining stories layer behavioral guarantees and ergonomics on top.

---

## Phase 4: User Story 2 - Switch directly between submodules (Priority: P2)

**Goal**: With a parent that has ≥ 2 submodules, picking sub B from the submodule selector
while sub A is displayed switches directly to B. No intermediate parent view, no
"Back to parent" button anywhere.

**Independent Test**: With a parent repo that has at least two submodules, switch from one
submodule to another using only the submodule selector and confirm the graph updates with
no intermediate parent view and no "Back to parent" button is needed or shown anywhere.
(Quickstart §C3.)

### Implementation for User Story 2

- [x] T021 [US2] Verify in `webview-ui/src/stores/graphStore.ts` that `setSubmoduleSelection` correctly handles the `submodule → submodule` transition: when called with a different submodule path while `submoduleSelection !== 'parent'`, it MUST send a fresh `switchRepo` RPC for the new submodule's absolute path (not first switch back to parent). Add a one-line guard if needed.
- [x] T022 [US2] Confirm by `grep -rn "Back to parent" webview-ui/src src` that no "Back to parent" string remains in the codebase.
- [~] T023 [US2] Manual smoke: with the fixture repo, navigate parent → sub-A → sub-B (without going to parent in between). Verify the graph switches directly to sub-B and no intermediate parent commits flash on screen.

**Checkpoint**: Direct submodule-to-submodule switching verified. Quickstart §C3 passes.

---

## Phase 5: User Story 3 - Consistent behavior across entry paths + legacy cleanup (Priority: P3)

**Goal**: A submodule reached via the parent's submodule selector and the same submodule
reached via the auto-discovered sub-repo entry in the repo selector produce identical
graph views, identical controls, and identical operation behavior. Specially-added
submodule entries are absent from the repo selector. Legacy navigation transport is
deprecated.

**Independent Test**: With two parents sharing a submodule, verify all three paths to that
submodule produce the same view; switching the repo selector resets the submodule
selector. (Quickstart §C4, §G2, §B3 for the no-submodules case.)

### Implementation for User Story 3

- [x] T024 [US3] Verify (no code change expected per research.md R8): `grep -rn "specially\|-submodules\|virtualSubmodule\|injectSubmodule\|SUBMODULE_SUFFIX" src/ webview-ui/src/` returns no hits. If any hits surface, remove the corresponding injection logic from `src/services/GitRepoDiscoveryService.ts` (FR-011). Document the verification in the PR description.
- [x] T024a [US3] FR-012 verification: confirm `src/services/GitRepoDiscoveryService.ts` is **unchanged** by this feature (`git diff main -- src/services/GitRepoDiscoveryService.ts` should be empty). After running the extension on the fixture repo, visually confirm the repo selector still lists every auto-discovered sub-repo entry that was present before this branch. Record the verification result in the PR description.
- [x] T024b [US3] FR-014 / FR-016 code-level verification: open `src/WebviewProvider.ts` and confirm that no message-handler branch (e.g., `case 'fetch'`, `case 'pull'`, `case 'push'`, `case 'checkoutBranch'`, `case 'cherryPick'`, `case 'rebase'`, `case 'resetBranch'`, `case 'createTag'`, `case 'applyStash'`, etc.) reads or writes `submoduleStack`, branches on parent-vs-submodule context, or addresses any repo other than the one bound by the most recent `reinitServices(...)` call. The handlers must dispatch only to the rebound service singletons (`gitLogService`, `gitDiffService`, `gitBranchService`, etc.). Record any deviation in the PR description as a follow-up.
- [x] T025 [US3] Delete `rpcClient.openSubmodule(submodulePath)` and `rpcClient.backToParentRepo()` methods from `webview-ui/src/rpc/rpcClient.ts` (no callers after T016/T017). Confirm via `grep -rn "openSubmodule\|backToParentRepo" webview-ui/src/` returns only the dead-handler call sites in shared types (which are kept).
- [x] T026 [US3] Add deprecation JSDoc comments on the `openSubmodule` and `backToParentRepo` request-message variants in `shared/messages.ts` (per contracts/webview-rpc.md §1.2 and §1.3): `/** @deprecated since 041-submodule-selector — selector navigation uses switchRepo. Handler kept for legacy compatibility; will be removed in a follow-up. */` placed on the union variants.
- [~] T027 [US3] Manual smoke: pick a submodule that's reachable both via a parent's submodule selector AND as an auto-discovered sub-repo in the repo selector. Verify quickstart §G2 (identical views, identical operations). Verify quickstart §C4 (changing repo selector resets submodule selector).
- [~] T028 [US3] Verify quickstart §B3 (parent with zero initialized submodules hides the submodule selector entirely).

**Checkpoint**: All entry paths produce identical views; legacy submodule-mode RPC is
deprecated; no specially-added entries in the repo selector.

---

## Phase 6: User Story 4 - Filterable combo-box parity across selectors (Priority: P3)

**Goal**: Repo selector, submodule selector, and the existing branches filter combo box
share dropdown layout and filter behavior. A single shared `FilterableSingleSelectDropdown<T>`
building block backs the repo and submodule selectors. The branches filter combo box is
the reference contract — not modified.

**Independent Test**: With at least 10 repos in the workspace (or 10 initialized submodules
under a parent), open the relevant selector, type a partial substring of an entry's label,
confirm the list narrows to matching entries, pick one, and confirm the view switches.
(Quickstart §E.)

### Implementation for User Story 4

- [x] T029 [US4] Create `webview-ui/src/components/FilterableSingleSelectDropdown.tsx`. Mirror the API of `webview-ui/src/components/MultiSelectDropdown.tsx`: props `items: T[]`, `selectedKey: string | undefined`, `onSelect: (item: T) => void`, `getKey: (item: T) => string`, `getSearchText: (item: T) => string`, `renderItem`, `renderTrigger`, `placeholder?`, `className?`. Single-select differences from `MultiSelectDropdown`: no clear-all row; selecting an item closes the popover; trigger label shows the current selection's display name. Reuse Radix Popover. Match keyboard behavior (Tab to list, Arrow keys, Enter, Esc, type-to-redirect, scroll-into-view, close-resets-filter-text) verbatim from `MultiSelectDropdown`.
- [x] T030 [P] [US4] Refactor `webview-ui/src/components/RepoSelector.tsx` to use `FilterableSingleSelectDropdown<RepoInfo>`. `getKey: r => r.path`, `getSearchText: r => r.displayName`. Selected key: `activeParentRepoPath`. `onSelect: r => setActiveRepo(r.path)`. Trigger renders the active repo's `displayName` with the same chevron/styling as the existing `<select>` so toolbar height is preserved.
- [x] T031 [P] [US4] Refactor `webview-ui/src/components/SubmoduleSelector.tsx` (created in T014) to use `FilterableSingleSelectDropdown<SubmoduleOption>` with `SubmoduleOption` from data-model.md §3.2. `getKey: o => o.value`, `getSearchText: o => o.label`. Selected key: `submoduleSelection`. `onSelect: o => setSubmoduleSelection(o.value)`.
- [x] T032 [US4] Delete `webview-ui/src/components/FilterableBranchDropdown.tsx` (unused — verified by grep in research.md R10).
- [~] T033 [US4] Manual smoke: with a fixture exposing ≥ 10 repos and a parent with ≥ 10 submodules, verify quickstart §E1–E5. Spot-check that the branches filter combo box behavior (existing `MultiBranchDropdown`) is unchanged and that all three selectors share the same dropdown layout.
- [~] T034 [US4] Visual sanity: open all three selectors in succession and confirm no styling or width regressions in the toolbar (constitution principle II — no visual drift).

**Checkpoint**: All three filterable selectors share dropdown layout and filter behavior;
`FilterableBranchDropdown.tsx` removed; combo-box duplication net zero or reduced (SC-012).

---

## Phase 7: User Story 5 - Top-menu reset/refresh chain (Priority: P3)

**Goal**: A change in a higher-priority top-menu control resets the content of all
lower-priority controls while preserving panel toggle (open/closed) state. Repo selector
change → resets submodule selector AND filter/search group content. Submodule selector
change → resets only filter/search group content. The internal reset logic of the
filter/search group's individual controls is not modified.

**Independent Test**: Open the filter panel via its toggle button and set a filter. Switch
the repo selector to a different repo. Confirm: filter contents are cleared, filter panel
is still visibly open. Now switch the submodule selector to a different option. Confirm:
filter contents are cleared again, filter panel is still visibly open. Repeat with the
search panel. (Quickstart §F.)

### Implementation for User Story 5

- [x] T035 [US5] Verify `webview-ui/src/stores/graphStore.ts` `resetTopMenuGroup()` (T008) does **not** read or write `activeToggleWidget`. Add a code comment referencing FR-024 to lock this invariant against future drift.
- [x] T036 [US5] Verify `setActiveRepo` (T010) calls `resetTopMenuGroup()` exactly once (FR-022).
- [x] T037 [US5] Verify `setSubmoduleSelection` (T009) calls `resetTopMenuGroup()` exactly once (FR-023).
- [x] T038 [US5] Confirm the existing internal reset/refresh logic of the filter/search group's individual controls (`MultiBranchDropdown`, `FilterWidget`, `SearchWidget`) was **not** modified by this feature (FR-025). `git diff main -- webview-ui/src/components/{MultiBranchDropdown,MultiSelectDropdown,FilterWidget,SearchWidget}.tsx` should show no functional changes (only possible import reshuffle if any).
- [~] T039 [US5] Manual smoke: execute quickstart §F1–F4 in full. Pay particular attention to F2/F3 (toggle state preserved) and F4 (panel content reset on the change is not undone by reopening).

**Checkpoint**: Reset/refresh chain verified end-to-end. All FR-022–FR-025 satisfied.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Constitution gates, full-feature smoke test, optional unit tests.

- [x] T040 Run `pnpm typecheck` — must report zero errors (constitution gate).
- [x] T041 Run `pnpm lint` — must report zero errors (constitution gate).
- [x] T042 Run `pnpm build` — must succeed for both extension and webview (constitution gate).
- [~] T043 Execute the full quickstart.md smoke checklist (sections A–H). All boxes must tick.
- [s] T044 OPTIONAL: add Vitest unit tests for `resetTopMenuGroup()` and `setSubmoduleSelection()` in `webview-ui/src/stores/graphStore.test.ts` (create file if missing). Coverage:
  - `resetTopMenuGroup()`: (a) clears `filters.branches`, `filters.authors`, `filters.afterDate`, `filters.beforeDate`, `filters.textFilter`; (b) clears `searchState.query`, `searchState.matchIndices`, `searchState.currentMatchIndex`; (c) preserves `searchState.isOpen` and `activeToggleWidget`.
  - `setSubmoduleSelection('parent')` and `setSubmoduleSelection('<sub.path>')`: `displayedRepoPath` correctness, `submoduleSelection` state, `resetTopMenuGroup` invoked, `switchRepo` RPC dispatched (mock `rpcClient`).
  Both suites live in the same file → no `[P]` marker.
- [s] T045 OPTIONAL cleanup follow-up: stage a separate PR to delete the now-unreachable `openSubmodule` / `backToParentRepo` request handlers in `src/WebviewProvider.ts` (lines ~1619–1631) and `setSubmoduleNavigationHandlers` plumbing in `src/ExtensionController.ts`. Out of scope for this PR per data-model.md §6.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Trivial — single sanity-check task. No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS all user stories.**
- **Phase 3 (US1, MVP)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 3 (uses `setSubmoduleSelection` and the new selector).
- **Phase 5 (US3)**: Depends on Phase 3 (uses removed legacy components for the cleanup).
- **Phase 6 (US4)**: Depends on Phase 3 (refactors the components US1 created).
- **Phase 7 (US5)**: Depends on Phase 2 (the reset action lives there). Verification-only;
  can run in parallel with Phase 6 if the reset behavior is proven by Phase 2 alone.
- **Phase 8 (Polish)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1, MVP)**: Independent of the other stories. Can ship alone.
- **US2 (P2)**: Layered on top of US1's selector. Touches the same component, so cannot
  parallelize with US4. Sequential after US1.
- **US3 (P3)**: Depends on US1 (deletions). Independent of US2 / US4 / US5 in code paths.
- **US4 (P3)**: Depends on US1 (refactors `SubmoduleSelector`). Touches `RepoSelector` which
  is otherwise untouched.
- **US5 (P3)**: Mostly verification — the underlying reset action is already foundational.

### Within Each User Story

- Models / types before services (Phase 2 already orders these: T002 → T004).
- Components before integration (T014 before T015).
- Deletion tasks (T016, T032) can run in parallel with creation tasks (T029).

### Parallel Opportunities

- **Phase 2**: T005 / T006 are independent edits to the same file (`graphStore.ts`); run
  serially to avoid edit-conflict, but they can be batched in one Edit pass. T002 and T004
  are in different files and **can run in parallel**.
- **Phase 6**: T030 (RepoSelector) and T031 (SubmoduleSelector) are independent files and
  can run in parallel after T029 lands.
- **Phase 8**: T044 and T045 are independent test files and can run in parallel.

---

## Parallel Example: Phase 6 (US4)

```bash
# After T029 (FilterableSingleSelectDropdown.tsx) lands, run T030 + T031 in parallel:
Task: "Refactor RepoSelector.tsx to use FilterableSingleSelectDropdown"
Task: "Refactor SubmoduleSelector.tsx to use FilterableSingleSelectDropdown"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 (sanity gate)
2. T002–T013 (foundational)
3. T014–T020 (US1)
4. **STOP and VALIDATE**: quickstart §A, §B, §C1–C2 — MVP is shippable.

### Incremental Delivery

1. MVP (above) → Demo: header row gone, submodule selector works.
2. Add US2 (T021–T023) → Demo: direct sub-to-sub switching.
3. Add US3 (T024–T028) → Demo: identical-view guarantee + legacy cleanup.
4. Add US4 (T029–T034) → Demo: filterable combo-box parity across the three selectors.
5. Add US5 (T035–T039) → Demo: full reset/refresh chain.
6. Polish (T040–T046) → Constitution gates pass + full quickstart green.

### Solo Developer Strategy

Recommended: serial through MVP (US1) for shippable increment, then US3 → US4 → US2 → US5
in any order. US5 is the lowest-effort phase since the mechanism is foundational.

---

## Notes

- File paths in this codebase follow the dual-process layout: `src/` for backend extension
  host, `webview-ui/src/` for frontend, `shared/` for cross-process types.
- All new code must keep `pnpm typecheck` and `pnpm lint` clean (constitution gates).
- Per CLAUDE.md restrictions: do **NOT** auto-install packages — none are needed for this
  feature. Do **NOT** commit or merge unless explicitly asked.
- Avoid backwards-compat hacks per CLAUDE.md: deleted code is deleted, not commented out.
  The deferred deletion in T046 is acceptable because the unreachable handlers are silent
  no-ops, not dead-code shims.
- Submodule navigation transport is `switchRepo` only — do not introduce a new RPC type
  (research.md R2).
