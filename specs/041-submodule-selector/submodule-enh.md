# Git submodule feature enhancement

## Current situation (problems to solve)

When a repo is selected from the repo selector (see `@docs/repo-selector.png`), if it has submodules connected, a row of "submodule headers" is shown under the top menu, above the graph (see `@docs/git-submodule-header.png`). This is the current "submodule mode".

### Sub-module mode (current behavior)

- Selecting a parent repo in the repo selector shows submodule headers above the graph.
- Clicking a submodule header switches the graph to that submodule, while the repo selector remains on the parent.
- The title changes to e.g. `test-repo / Current` (the literal "Current" is a display bug — it should be the submodule's name; with multiple submodules, you can't tell which one is active).
- A right-aligned "Back to parent" button returns the graph to the parent.

**Problems with sub-module mode:**

1. Headers consume a lot of vertical space when a repo has many submodules.
2. Switching between submodules is indirect: you must click "Back to parent" before opening another submodule. Not user-friendly.
3. The mode confuses users when the repo selector also lists submodules as individual repos (see below).

### Duplicated entries in the repo selector

The repo selector currently lists submodules in two ways:

- **Specially added by our submodule logic** — e.g. `test-repo-submodules/repo-a`, `test-repo-submodules/repo-b`.
- **Auto-discovered as sub-repos** by VS Code's `Git: Repository Scan Max Depth` setting (when set to e.g. 3) — e.g. `test-repo/submodules/repo-a`, `test-repo/submodules/repo-b`.

These entries are duplicates of each other. Selecting either from the repo selector currently shows the repo standalone, with no submodule header.

## Final design

Remove submodule mode entirely. Replace the header row with a **submodule selector** placed next to the repo selector. The repo selector remains the primary control; the submodule selector is dependent on it.

### Behavior

- **Repo selector** is the top-level / primary control. It is unchanged in scope (it lists workspace repos and auto-discovered sub-repos).
- **Submodule selector** appears next to the repo selector, and is **visible only when the currently selected repo is a parent that has submodules**. Otherwise it is hidden.
- Submodule selector options:
  - First option: `<parent repo name> (parent)` — selecting this displays the parent repo's graph.
  - Followed by each submodule, listed by submodule name.
- **Default selection** when a parent repo is selected: always the parent option. Never auto-select a submodule.
- **Reset rule**: any change in the repo selector resets the submodule selector to the parent option (or hides it entirely if the new repo has no submodules). The previously-selected submodule is **not** remembered across repo selector changes.
- Selecting a submodule from the submodule selector switches the graph to that submodule.
- The repo selector stays on the parent while a submodule is being viewed via the submodule selector.

### Sub-repo and submodule entries produce identical views

A submodule may also appear in the repo selector as an auto-discovered sub-repo (depending on `Git: Repository Scan Max Depth`). Selecting that sub-repo entry directly from the repo selector and selecting it via the parent's submodule selector produce the **same graph view** — same data, same UI, no special mode, no header, no "Back to parent" button.

We **keep** auto-discovered sub-repo entries in the repo selector unchanged. We **remove** the specially-added submodule entries from the repo selector (since they are duplicates and the submodule selector now serves that purpose).

### Scope of git operations

When a submodule is being displayed (whether reached via the submodule selector or directly via the repo selector), all UI controls operate on the displayed submodule's repo. This includes:

- Filter, search, refresh, fetch, pull, push controls
- Right-click / context menu actions: checkout, push, cherry-pick, rebase, reset, tag, stash, etc.
- All dialogs and command previews

The displayed repo is the only target — there is no parent/submodule mode distinction at the operation level.

### Removed UI

- Submodule header row above the graph — removed entirely.
- "Back to parent" button — removed (no longer needed; switching is done via the two selectors).
- The `test-repo / Current` title formatting — moot, since the header is gone. The display bug is implicitly resolved by removing the header feature.

## Edge cases

### Multiple parents sharing submodules

Two parent repos and two submodule repos:

- `parent1` connects to `sub1` and `sub2`
- `parent2` connects only to `sub1`

If `sub1` and `sub2` are within the `Git: Repository Scan Max Depth`, they also appear as standalone sub-repo entries in the repo selector.

Behavior:

- Repo selector on `parent1` → submodule selector visible with 3 options: `parent1 (parent)`, `sub1`, `sub2`. Selecting `sub1` or `sub2` shows that submodule. Selecting `parent1 (parent)` shows the parent.
- Repo selector on `parent2` → submodule selector visible with 2 options: `parent2 (parent)`, `sub1`. Selecting `sub1` shows that submodule.
- Switching the repo selector from `parent1` to `parent2` while `sub2` is selected: the submodule selector resets to the new parent (`parent2 (parent)`). Last-selected submodule is **not** carried over.

### Nested submodules (deeper than 1 level)

The submodule selector handles **only one level** of nesting (a parent and its direct submodules).

To view a deeper submodule (e.g. `test-repo > sub1 > sub1.1`), the user selects the intermediate repo (`sub1`) from the repo selector first; the submodule selector then offers `sub1`'s submodules.

This works in practice because nested submodule repos are conventionally placed in the same folder level (e.g. all under a `submodules/` folder), so the auto-scan picks them up and lists them in the repo selector. No additional handling is needed.

If `Git: Repository Scan Max Depth` is set too shallow to reach a nested submodule, that nested submodule is unreachable through this UI. This is accepted as out-of-scope; users who need deeper nesting should increase their scan depth.

## Summary of changes

| Area | Change |
|------|--------|
| Submodule headers | Removed |
| "Back to parent" button | Removed |
| `test-repo / Current` title | Removed (resolved by header removal) |
| Repo selector | Specially-added submodule entries removed; auto-discovered sub-repo entries kept unchanged |
| Submodule selector | New control next to repo selector; visible only when the selected repo is a parent with submodules |
| Default submodule selection | Always the parent option |
| Submodule selector reset rule | Resets to parent on any repo selector change |
| Sub-repo vs. submodule view | Identical — same graph, same operations, same UI |
| Git operation scope | Always targets the currently displayed repo |
| Nested submodule support | Single level via submodule selector; deeper levels reached by selecting the intermediate repo in the repo selector |
