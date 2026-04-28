# Phase 1 Data Model — Submodule Selector

**Feature**: `041-submodule-selector` | **Date**: 2026-04-28

This document captures the entities and state transitions touched by this feature. It covers
**shared types** (the cross-process contract in `shared/types.ts`), **frontend store state**
(`webview-ui/src/stores/graphStore.ts`), and the **derived UI state** rendered by the new and
modified components.

## 1. Shared types (`shared/types.ts`)

### 1.1 `Submodule` (extended)

```ts
export interface Submodule {
  path: string;          // relative to parent repo root, e.g. "submodules/repo-a"
  hash: string;          // recorded commit
  status: SubmoduleStatus; // 'clean' | 'dirty' | 'uninitialized'
  describe: string;
  url?: string;
  /** NEW: true iff status !== 'uninitialized' AND <parent>/<path>/.git exists */
  initialized: boolean;
}
```

**Validation rules (backend, in `GitSubmoduleService.parseSubmoduleLine`)**:

- `initialized = (status !== 'uninitialized') && fs.existsSync(path.join(parentRepoPath, submodule.path, '.git'))`.
- The `path.join` result is checked once per submodule per `getSubmodules()` call.
- The `existsSync` check is bounded — a submodule list rarely exceeds a few dozen entries.

**Frontend usage**: a submodule appears in the submodule selector iff `initialized === true`.

### 1.2 `SubmoduleNavEntry` (deprecated)

```ts
export interface SubmoduleNavEntry { repoPath: string; repoName: string; }
```

No longer populated by the webview after this feature lands. Kept in the type file (and in
`submodulesData` payload) as a transitional empty array for now to avoid touching every
`messages.ts` consumer in this PR. A follow-up may delete it.

### 1.3 No new top-level shared types

All other shared types (`RepoInfo`, `Commit`, `Branch`, etc.) are unchanged.

## 2. Frontend store (`webview-ui/src/stores/graphStore.ts`)

### 2.1 New fields

```ts
interface GraphStore {
  // ...existing fields...

  /**
   * Path the user has selected in the repo selector. Equals the parent path when a
   * submodule is being viewed via the submodule selector (the repo selector visibly
   * stays on the parent — FR-017).
   *
   * INVARIANT: equals one of the entries in `repos`, or '' if no repo is loaded.
   */
  activeParentRepoPath: string;

  /**
   * Path whose commits are currently rendered in the graph. Equals
   * `activeParentRepoPath` unless a submodule is selected, in which case it equals
   * the submodule's resolved absolute path.
   *
   * INVARIANT: when `submoduleSelection === 'parent'`, displayedRepoPath === activeParentRepoPath.
   *            when `submoduleSelection === <submodule.path>`,
   *               displayedRepoPath === path.resolve(activeParentRepoPath, submoduleSelection).
   * (Resolution is performed in the backend on `switchRepo`; the webview stores the
   * absolute path it sent, so the invariant holds without re-resolution.)
   */
  displayedRepoPath: string;

  /**
   * Submodule selector's current value. 'parent' means the parent option is selected.
   * Otherwise equals one of the parent's initialized submodule paths
   * (matching `submodule.path` exactly).
   *
   * INVARIANT: reset to 'parent' on every setActiveRepo() call, on initialData load,
   *            and on every reinitialize-from-extension lifecycle event.
   */
  submoduleSelection: 'parent' | string;
}
```

The existing field `activeRepoPath: string` is **renamed** to `activeParentRepoPath` to make
its semantic explicit. (Where `activeRepoPath` was used for "the repo selector's value",
the new name applies; where it was used for "the displayed repo", consumers move to
`displayedRepoPath`.)

The existing fields `submodules: Submodule[]` and `submoduleStack: SubmoduleNavEntry[]` are
unchanged in shape. `submoduleStack` becomes effectively always empty under the new design
(see deprecation note in 1.2).

### 2.2 New actions

```ts
interface GraphStore {
  // ...existing actions...

  /**
   * Set the submodule selector value AND switch the displayed repo accordingly.
   * - 'parent': graph target = activeParentRepoPath
   * - <submodulePath>: graph target = absolute(activeParentRepoPath, submodulePath)
   *
   * Side effects (FR-023):
   *   - Calls resetTopMenuGroup() to clear filter/search content.
   *   - Sends `switchRepo` RPC with the resolved absolute path.
   *   - Marks isLoadingRepo true while the new graph data loads.
   */
  setSubmoduleSelection: (value: 'parent' | string) => void;

  /**
   * Centralized left→right reset entry point.
   *
   * Effects:
   *   - filters → reset to defaults (preserves maxCount, drops branches/authors/dates/textFilter)
   *     via the existing resetAllFilters({ preserveBranches: false }).
   *   - searchState → reset payload (query, matchIndices, currentMatchIndex) but
   *     preserve the open/closed view state — does NOT touch activeToggleWidget (FR-024).
   *
   * Idempotent.
   */
  resetTopMenuGroup: () => void;
}
```

The existing `setActiveRepo(repoPath)` action's behavior is **revised**:

- Sets `activeParentRepoPath = repoPath`.
- Sets `submoduleSelection = 'parent'` (FR-008).
- Sets `displayedRepoPath = repoPath`.
- Calls `resetTopMenuGroup()` (FR-022).
- Sends `switchRepo` RPC.

### 2.3 Field removal / transition

- `setRepos(repos, activeRepoPath)` retains its signature; internally, it now writes to
  `activeParentRepoPath` and sets `submoduleSelection = 'parent'`, `displayedRepoPath = activeRepoPath`.
- `pushSubmodule` / `popSubmodule` and `submoduleStack` reads remain in the store (unused at
  call sites after this feature) until a follow-up cleanup PR removes them.

## 3. Derived UI state

### 3.1 Submodule selector visibility

The submodule selector is rendered iff:

```ts
const initializedSubmodules = submodules.filter(s => s.initialized);
const showSubmoduleSelector = initializedSubmodules.length > 0;
```

(FR-005, FR-006.) When `showSubmoduleSelector === false`, `<SubmoduleSelector />` returns
`null` and consumes no toolbar space (matches Edge Cases entry "Repo with zero submodules").

### 3.2 Submodule selector option list

```ts
type SubmoduleOption =
  | { kind: 'parent'; label: string; value: 'parent' }
  | { kind: 'submodule'; label: string; value: string /* submodule.path */ };

function buildSubmoduleOptions(
  parentName: string,
  initializedSubmodules: Submodule[],
): SubmoduleOption[] {
  const parentOption: SubmoduleOption = {
    kind: 'parent',
    label: `${parentName} (parent)`,
    value: 'parent',
  };
  const submoduleOptions: SubmoduleOption[] = initializedSubmodules
    .map(s => ({
      kind: 'submodule' as const,
      label: path.basename(s.path),     // computed via posix path basename
      value: s.path,
    }))
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

  return [parentOption, ...submoduleOptions];
}
```

(FR-006: parent first; submodules sorted alphabetically case-insensitive by name.)

### 3.3 Filter-match semantics

```ts
function matchOption(option: SubmoduleOption, filterText: string): boolean {
  return option.label.toLowerCase().includes(filterText.toLowerCase());
}
```

Identical to the branches-filter pattern (FR-019, FR-020). Empty filter matches all options.

## 4. State transitions

### 4.1 User picks a submodule from the submodule selector

**Pre-conditions**:
- `activeParentRepoPath = '<parent>'`
- `submoduleSelection = 'parent' | '<other-sub>'`
- `displayedRepoPath = '<current>'` (could be parent or another submodule)

**Action**: `setSubmoduleSelection('<sub.path>')`

**Post-conditions**:
- `submoduleSelection = '<sub.path>'`
- `displayedRepoPath = absolute('<parent>', '<sub.path>')`
- `activeParentRepoPath = '<parent>'` (UNCHANGED — FR-017)
- Filter/search content reset; `activeToggleWidget` unchanged (FR-023, FR-024).
- `switchRepo` RPC dispatched with `displayedRepoPath`.
- `isLoadingRepo = true` until backend responds with `initialData`.

### 4.2 User picks the parent option

**Pre-conditions**: `submoduleSelection = '<sub.path>'`, `displayedRepoPath = absolute(...)`

**Action**: `setSubmoduleSelection('parent')`

**Post-conditions**:
- `submoduleSelection = 'parent'`
- `displayedRepoPath = activeParentRepoPath`
- Filter/search content reset; `activeToggleWidget` unchanged.
- `switchRepo` RPC dispatched with the parent path.

### 4.3 User changes the repo selector

**Action**: `setActiveRepo('<new-parent>')`

**Post-conditions**:
- `activeParentRepoPath = '<new-parent>'`
- `submoduleSelection = 'parent'` (FR-008, FR-008a)
- `displayedRepoPath = '<new-parent>'`
- Filter/search content reset; `activeToggleWidget` unchanged (FR-022, FR-024).
- `switchRepo` RPC dispatched.
- `submodules` state cleared until the new `submodulesData` arrives, so the submodule
  selector hides until backend confirms which submodules the new repo has.

### 4.4 Panel reload / VS Code restart

The webview is re-mounted; `useGraphStore` re-initializes with default state:

- `activeParentRepoPath = ''` (set later by the first `repoList` message)
- `submoduleSelection = 'parent'` (FR-008a — no persistence)
- `displayedRepoPath = ''`
- `submodules = []`

The first `initialData` arrives with the active repo path. `setActiveRepo` runs the
post-condition flow above. **There is no per-repo "last submodule" memory.**

## 5. Validation rules summary

| Rule | Source | Where enforced |
|---|---|---|
| Submodules in `.gitmodules` but uninitialized are excluded from selector | FR-006, R5 | Frontend filter on `submodule.initialized` |
| Parent option label is `<basename> (parent)` | FR-006 | `buildSubmoduleOptions()` |
| Submodule options are sorted alphabetically (case-insensitive) by basename | FR-006 | `buildSubmoduleOptions()` |
| Selector hidden when no initialized submodules exist | FR-005 | `<SubmoduleSelector />` early return |
| Submodule selection does not persist across reloads | FR-008a | `submoduleSelection` initial value `'parent'`; no `globalState` write |
| Repo selector change resets submodule selector to `'parent'` | FR-008 | `setActiveRepo()` action |
| Repo selector change resets filter/search content | FR-022 | `setActiveRepo()` → `resetTopMenuGroup()` |
| Submodule selection change resets filter/search content | FR-023 | `setSubmoduleSelection()` → `resetTopMenuGroup()` |
| Resets do not change `activeToggleWidget` (panel open/closed state) | FR-024 | `resetTopMenuGroup()` does not touch that field |
| Filter input cleared when dropdown closes | FR-021 | `FilterableSingleSelectDropdown` close handler (mirrors `MultiSelectDropdown`) |
| All git operations target `displayedRepoPath` | FR-014, FR-016 | Backend services rebound by `reinitServices(displayedRepoPath)` on every `switchRepo` |

## 6. Backwards-compat / cleanup matrix

| Item | Action |
|---|---|
| `SubmoduleBreadcrumb.tsx` | DELETE |
| `<SubmoduleSection />` (in `GraphContainer.tsx`) | DELETE the render site and the inner functions if no longer reused |
| `FilterableBranchDropdown.tsx` | DELETE (unused) |
| `rpcClient.openSubmodule(submodulePath)` | DELETE (no callers after this PR) |
| `rpcClient.backToParentRepo()` | DELETE (no callers after this PR) |
| `RequestMessage` variants `openSubmodule`, `backToParentRepo` | KEEP for now (orphan handlers); remove in follow-up |
| Backend `submoduleHandlers.openSubmodule` / `backToParentRepo` | KEEP wired but unreachable; remove in follow-up |
| `submoduleStack` field on `GraphStore` and `submodulesData` payload | KEEP, always empty after this PR; remove in follow-up |

The "follow-up" deletions are intentionally deferred to keep this PR's diff focused on user-visible
behavior change. Each is one-line deletions with no downstream behavior change.
