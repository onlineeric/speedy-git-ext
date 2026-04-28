# Phase 0 Research — Submodule Selector

**Feature**: `041-submodule-selector` | **Date**: 2026-04-28

This document resolves all `NEEDS CLARIFICATION` items implied by the Technical Context and
records design decisions that shape Phase 1 contracts and data model.

## R1. Shared filterable combo-box building block

**Question**: The repo selector, the new submodule selector, and the existing branches filter
combo box must share filter behavior and dropdown style (FR-020, SC-008, SC-012). What concrete
shape does the shared building block take, and what existing components are repurposed vs. removed?

**Decision**: Introduce **`FilterableSingleSelectDropdown<T>`** as the shared single-select
sibling of the existing **`MultiSelectDropdown<T>`** (`webview-ui/src/components/MultiSelectDropdown.tsx`).

- The new component owns: Radix `Popover` trigger/content, the filter `<input>` at the top of
  the dropdown, the listbox, keyboard navigation (Tab→list, Arrow keys, Enter, Esc, type-to-redirect),
  scroll-into-view for highlighted items, filter-text reset on close.
- Both the new `RepoSelector` and the new `SubmoduleSelector` use this single component.
- The existing `MultiBranchDropdown` (which uses `MultiSelectDropdown`) is the **reference
  contract** for keyboard / focus / filter behavior (per spec clarification: "Match the existing
  branches filter combo box exactly"). It is **not** rewritten.
- The existing **`FilterableBranchDropdown`** (single-select, currently unused — verified by
  `grep`: only its own file references it) is **removed** as part of this feature so the new
  shared building block is the only single-select implementation. This satisfies SC-012 (no net
  increase in combo-box duplication; reduced where practical).

**Rationale**:
- Reuses Radix Popover (already a dependency) — no new packages.
- Mirrors the proven pattern in `MultiSelectDropdown` (filter input, list-navigation mode,
  type-to-redirect, scroll-into-view, `aria-activedescendant`).
- Single-select differs from multi-select in: (a) no clear-all row, (b) selecting an item closes
  the popover immediately, (c) trigger label shows the current selection's display name (not a
  count). These are mechanical differences, not behavioral ones — no new keyboard behavior is
  introduced (matches FR-020).

**Alternatives considered**:
- **Add a `mode: 'single'` prop to `MultiSelectDropdown`**. Rejected: forks list-item rendering
  (no clear-all row), leaks `selectedItems[]` into a single-select API, and contaminates the
  `aria-multiselectable` semantics. Two purpose-built components are clearer than one
  multi-modal one.
- **Keep `FilterableBranchDropdown` and use it for repo + submodule selectors**. Rejected:
  it is currently dead code (unused — confirmed by grep). Reviving it as the shared component
  is fine in spirit, but the cleanest read is to remove it and create one new
  `FilterableSingleSelectDropdown<T>` that mirrors `MultiSelectDropdown<T>`'s API surface (same
  prop names where they overlap: `items`, `getKey`, `getSearchText`, `renderItem`,
  `renderTrigger`, `placeholder`).
- **Use a third-party library (Downshift, cmdk, Combobox)**. Rejected: would add a dependency
  and diverge from the existing branches-filter contract. The codebase already has the keyboard
  pattern in `MultiSelectDropdown`; copy and adapt rather than introducing a new dependency.

## R2. Submodule navigation transport — switchRepo vs. dedicated message

**Question**: The legacy flow uses `openSubmodule` / `backToParentRepo` messages plus a
`submoduleStack` on the backend. With the new design (no modal mode), how does the webview tell
the backend to display a submodule's repo?

**Decision**: **Reuse the existing `switchRepo` request message.** Submodule navigation is
implemented as a `switchRepo` whose `repoPath` is the submodule's resolved absolute path.

- **Webview**: When the user picks a submodule from the submodule selector, the store
  dispatches a `switchRepo` with `repoPath = absolute(parentRepoPath, submodule.path)`.
- **Backend (`ExtensionController.switchActiveRepo`)**: Accepts any absolute path and calls
  `reinitServices(repoPath)`. No `submoduleStack` push/pop is required for selector-driven
  navigation. The legacy `submoduleStack` (and the `getStack` / `openSubmodule` /
  `backToParentRepo` handlers wired in `setSubmoduleNavigationHandlers`) becomes unused. The
  webview no longer renders a Back-to-parent button (FR-002), so `backToParentRepo` has no caller.
- **`submodulesData` message**: Still used. After a `switchRepo`, the backend sends a fresh
  `submodulesData` payload for the *displayed* repo. The webview uses it to (a) decide whether
  to show the submodule selector at all (per FR-005) and (b) populate the dropdown options.

**Rationale**:
- One transport for "show this repo" is simpler than two parallel paths (`switchRepo` for repo
  selector, `openSubmodule` for submodule selector).
- The constitution principle V (Dual-Process Architecture Integrity) is preserved: the webview
  emits a single semantic intent ("show this absolute repo path"); the backend orchestrates
  service rebinding.
- Eliminates the `submoduleNavigating` re-entrancy guard in `ExtensionController` for the
  selector flow.

**Alternatives considered**:
- **Keep `openSubmodule` / `backToParentRepo` and wire the new selector through them**.
  Rejected: introduces two paths that differ only by whether they push onto a stack the UI no
  longer surfaces; spec FR-016 explicitly forbids "submodule mode" as a modal state.
- **Add a new `displaySubmodule(parentPath, submodulePath)` message**. Rejected: redundant with
  `switchRepo`. The backend can resolve absolute paths itself.

**Backwards-compat handling**: The `openSubmodule` / `backToParentRepo` request types and the
`submoduleStack` field on the `submodulesData` payload are kept in `shared/messages.ts` for now
(removing them is a clean follow-up once we confirm no external callers via git history). The
webview stops calling them; the backend handlers remain wired but are unreachable. Removing the
dead code is part of the implementation tasks (deletion-first; constitution YAGNI).

## R3. Identifying the "displayed repo" vs. "repo selector value"

**Question**: When the repo selector is on parent A and the submodule selector is on a submodule
of A, the backend services (and therefore git operations) must target the submodule's repo
(FR-014, SC-007). The repo selector visually stays on the parent (FR-017). How does the webview
track this without re-introducing a "submodule mode"?

**Decision**: Add **two derived store fields** in `graphStore`:

- `activeParentRepoPath: string` — the path the **repo selector** displays. Reset by
  `setActiveRepo(repoPath)` for any path that exists in the workspace `repos` list.
- `displayedRepoPath: string` — the path whose commits are currently rendered in the graph.
  Equals `activeParentRepoPath` unless a submodule is active in the submodule selector, in
  which case it equals the submodule's resolved absolute path.

The submodule selector has a single client-side state: `submoduleSelection`, one of `'parent'`
or a string equal to the submodule's `path` (relative to the parent). Default value: `'parent'`.

**Why two fields, not one**:
- The repo selector's *visible* selection must remain on the parent even though the *displayed*
  graph corresponds to the submodule. Conflating them would either flicker the repo selector or
  require the backend to know which repos are submodules of which parents (it does, via
  `submodulesData`, but threading that through every render path is unnecessary).

**Rationale**:
- Matches the spec language verbatim: "the repo selector remains on the parent" (FR-017).
- All git operations dispatch through services that are already keyed to the *current
  workspacePath* in `reinitServices`. The webview doesn't need to know the displayed path on
  the backend; the backend re-reads its singleton on every command (constitution principle V).
- Resetting the submodule selector to `'parent'` (FR-008) becomes a single-line store update;
  resetting on `setActiveRepo` is colocated with the existing repo-change reset logic.

**Alternatives considered**:
- **Push the `displayedRepoPath` into `RepoInfo`**. Rejected: `RepoInfo` describes workspace
  repositories. A submodule's absolute path may not be in `repos` at all.
- **Track only `submoduleSelection` and derive `displayedRepoPath` lazily from
  `activeParentRepoPath` + `submodules`**. Rejected: forces re-derivation in every consumer
  and obscures intent. A computed field with a single update path is clearer.

## R4. Reset/refresh chain — implementation shape

**Question**: FR-022 / FR-023 / FR-024 / FR-025 specify left→right reset semantics. Where do
the reset entry points live, and how do they avoid touching the toggle state of the filter
and search panel buttons?

**Decision**: A single store action **`resetTopMenuGroup()`** centralizes the reset and is
called from:

- `setActiveRepo(repoPath)` — repo selector change. Also resets submodule selector.
- `setSubmoduleSelection(value)` — submodule selector change.

Implementation:

```ts
resetTopMenuGroup: () => {
  // (1) Branches filter — clear branch list filter (preserve maxCount)
  // (2) Filter panel internals — clear authors / dates / textFilter (preserve maxCount)
  //     This is what `resetAllFilters({ preserveBranches: false })` already does.
  // (3) Search panel internals — clear searchState (query, matchIndices, currentMatchIndex)
  //     by calling closeSearch()-equivalent that does NOT change activeToggleWidget.
  //
  // Crucially: does NOT change `activeToggleWidget` (FR-024).
}
```

**Why the existing `closeSearch` is not reused as-is**: The current `closeSearch` action
(line 712 of `graphStore.ts`) clears `searchState` AND clears `activeToggleWidget` if it was
`'search'`. That is exactly the behavior we must NOT do during a top-menu reset (FR-024). The
new `resetTopMenuGroup` introduces an internal helper that resets the `searchState` payload
without touching `activeToggleWidget`.

**Why the existing `resetAllFilters` IS reused**: It already resets author / date / textFilter
without touching branch lock. We pass `preserveBranches: false` to also clear branches (FR-022
explicitly requires clearing the branches filter on a repo selector change). On a submodule
selector change (FR-023), branches must also be cleared because the displayed repo changed —
the previous parent's branch list no longer applies. Same call site.

**Rationale**:
- Centralizing in the store keeps the reset chain ordering explicit and testable.
- Constitution principle II (DRY): the same reset is invoked from two call sites.
- Constitution principle V: the reset is a pure store update; no RPC fan-out.

**Alternatives considered**:
- **Have `setActiveRepo` and `setSubmoduleSelection` each call `resetAllFilters` and
  `closeSearch` directly**. Rejected: easy to drift if a third reset trigger is added later.
- **Subscribe to repo / submodule changes and run resets in a `useEffect`**. Rejected: shifts
  ordering off the dispatch path and into render — fragile; risk of double-reset or
  out-of-order reset relative to graph data load.

## R5. Initialized vs. uninitialized submodules

**Question**: FR-006 + spec edge cases require omitting uninitialized submodules from the
selector. `GitSubmoduleService.parseSubmoduleLine` already returns `status: 'uninitialized'`
for the `-` prefix from `git submodule status`. How is "initialized" determined for the new
selector?

**Decision**: A submodule appears in the dropdown **iff** all of:

1. It is reported by `GitSubmoduleService.getSubmodules()` (so it's declared in `.gitmodules`).
2. Its `.status !== 'uninitialized'` (i.e., `clean` or `dirty`).
3. Its working tree exists on disk: `fs.existsSync(path.join(parentRepoPath, submodule.path, '.git'))`.

The frontend filter applies (2) by default. (3) is delegated to the backend so disk-existence
checks don't run in the webview. We add a **`initialized: boolean`** field on the `Submodule`
shared type, computed in `GitSubmoduleService.getSubmodules()` and used by the frontend without
re-checking.

**Rationale**:
- Treating `clean | dirty` as initialized matches `git submodule status`'s own convention
  (the `-` prefix means "not initialized").
- The on-disk `.git` check guards against half-initialized states (e.g., the user `rm -rf`-ed
  the submodule directory but `.gitmodules` still references it).
- A single backend-computed boolean keeps the webview's filtering rule one-line and stable.

**Alternatives considered**:
- **Webview infers initialized = `status !== 'uninitialized'`** (no on-disk check). Rejected:
  half-initialized states can show a stale/clean status and produce a broken submodule entry.
- **Skip the on-disk check entirely; document the edge case as out-of-scope**. Rejected: spec's
  Edge Cases section explicitly addresses the on-disk reachability requirement.

## R6. Sorting and labeling of submodule selector options

**Question**: FR-006 mandates "alphabetical by submodule name (case-insensitive)" with the
parent option always first. What is the "name" used for sorting and for the label?

**Decision**:
- **Label** for parent option: `<repo basename> (parent)` where `<repo basename>` is
  `path.basename(parentRepoPath)`. This matches the existing `RepoInfo.name` for the parent
  in the workspace.
- **Label** for each submodule: `path.basename(submodule.path)` — i.e., the last segment of
  the submodule's relative path. Example: a submodule at `submodules/repo-a` is labeled
  `repo-a`.
- **Sort key**: lowercased label (case-insensitive). Stable sort.
- **Filter match**: case-insensitive substring against the **visible label** (FR-019). The
  parent option's full label `<parent> (parent)` is the matched string for the parent option.

**Rationale**:
- Using the basename (rather than the full relative path) is consistent with how the repo
  selector labels auto-discovered sub-repos; deeper-nested submodules are reached by switching
  the repo selector to the intermediate (FR-015).
- A stable, case-insensitive sort matches user expectation when submodule names vary in case.

**Alternatives considered**:
- **Label submodules with their full relative path** (e.g., `submodules/repo-a`). Rejected:
  longer labels reduce dropdown width budget and don't add navigation value when only one
  level is shown.
- **Sort by `submodule.path`** (which may be `submodules/repo-a`). Rejected: groups
  alphabetically by parent folder rather than by submodule identity.

## R7. Filter input behavior on close — alignment with branches filter

**Question**: FR-021 requires the filter input to be cleared when the dropdown closes. Does
this match the existing `MultiSelectDropdown` behavior?

**Decision**: Yes — `MultiSelectDropdown.handleOpenChange` already calls
`setFilterText('')`, `setHighlightedIndex(-1)`, `setListNavigationMode(false)` when the
popover closes. The new `FilterableSingleSelectDropdown` mirrors this verbatim.

**Rationale**: FR-020 says "match exactly". Reusing the same close-time reset is the
shortest path to behavioral parity.

## R8. Specially-added submodule entries in the repo selector

**Question**: FR-011 requires removing "specially-added submodule entries" from the repo
selector. Does the current codebase contain such entries?

**Decision**: A grep across `src/` and `webview-ui/src/` for `specially`,
`-submodules`, `submodules/repo`, `virtualSubmodule`, `injectSubmodule`, `SUBMODULE_SUFFIX`
returns no matches. `GitRepoDiscoveryService` produces `RepoInfo[]` purely from VS Code's
`vscode.git` API or workspace folder scanning — there is no submodule injection code path.

**Conclusion**: FR-011 is effectively a **no-op confirmation** in this codebase. The
implementation should still validate this empirically during the implementation phase by
running the extension against a multi-submodule fixture (`pnpm generate-test-repo`) and
visually confirming the repo selector contains no `<parent>-submodules/<sub>` style entries.
If any are found at implementation time, they are removed. The corresponding task in
`tasks.md` is a verification step, not a code-removal step.

## R9. Submodule data refresh trigger

**Question**: When does `submodulesData` need to be re-fetched? Stale data would cause the
selector to omit a submodule the user just initialized.

**Decision**: `WebviewProvider.sendInitialData()` already fans out a background fetch of
submodules after the initial graph payload (lines 732–733: "Fetch submodules in the background").
The new design preserves this and additionally triggers a fresh `submodulesData` send on every
`switchRepo` (which already calls `reinitServices` → re-renders the webview). No new
refresh trigger is introduced; the auto-refresh path (file watcher) is unchanged.

**Rationale**: FR-014 (operations target the displayed repo) is already satisfied by the
existing service rebind on `switchRepo`. The submodule selector merely renders whatever the
latest `submodulesData` payload provided.

## R10. Constitution alignment for the file deletions

**Question**: The plan deletes `SubmoduleBreadcrumb.tsx` and (likely) `FilterableBranchDropdown.tsx`.
Does this risk breaking any wired-up affordance?

**Decision**: Verified by grep:

- `SubmoduleBreadcrumb` is referenced only by `GraphContainer.tsx` (one import + one render
  site). Deletion + removal of those two lines is sufficient.
- `FilterableBranchDropdown` is unused (zero references outside its own file). Deletion is safe.

**Rationale**: Constitution principle II (YAGNI / clean code) endorses deletion of dead /
replaced UI rather than leaving `// removed` comments or feature-flagged shims (CLAUDE.md:
"Avoid backwards-compatibility hacks like ... // removed comments for removed code").

---

## Summary of decisions feeding Phase 1

1. **New shared component**: `FilterableSingleSelectDropdown<T>` (mirrors `MultiSelectDropdown<T>`).
2. **Repo selector**: rewrite to use the new shared component (filterable single-select).
3. **New component**: `SubmoduleSelector` using the shared component; visible only when the
   displayed parent has ≥ 1 initialized submodule.
4. **Transport**: reuse `switchRepo` for both parent and submodule navigation; deprecate
   `openSubmodule` / `backToParentRepo` in `shared/messages.ts` (mark and stop calling them;
   remove dead handler code).
5. **Store**: split `activeParentRepoPath` (repo selector value) from `displayedRepoPath`
   (graph target); add `submoduleSelection` ('parent' | submodule.path); add
   `resetTopMenuGroup()` action that preserves `activeToggleWidget`.
6. **Shared types**: extend `Submodule` with `initialized: boolean` (computed in
   `GitSubmoduleService`); deprecate `SubmoduleNavEntry` / `submoduleStack` once unused.
7. **Deletions**: `SubmoduleBreadcrumb.tsx`, `FilterableBranchDropdown.tsx`, and the rendered
   `<SubmoduleSection />` in `GraphContainer.tsx`.
8. **No change** to performance constraints, build pipeline, or constitution gates.
