# Data Model: Filterable Branch Dropdown

**Feature**: 014-filterable-branch-dropdown | **Date**: 2026-03-17

## Existing Entities (No Changes)

### Branch (from `shared/types.ts`)

| Field    | Type                | Description                                      |
|----------|---------------------|--------------------------------------------------|
| name     | string              | Branch name (without remote prefix for remotes)  |
| remote   | string \| undefined | Remote name (e.g., "origin"); undefined for local |
| current  | boolean             | Whether this is the currently checked-out branch |
| hash     | string              | Commit hash the branch points to                 |

**Display name derivation**:
- Local branches: `branch.name`
- Remote branches: `${branch.remote}/${branch.name}`

**Filter value derivation** (used as `filters.branch`):
- Local branches: `branch.name`
- Remote branches: `${branch.remote}/${branch.name}`

### GraphFilters (from `shared/types.ts`)

| Field    | Type                | Description                            |
|----------|---------------------|----------------------------------------|
| branch   | string \| undefined | Selected branch name; undefined = all  |
| author   | string \| undefined | Author filter                          |
| maxCount | number              | Batch commit size                      |
| skip     | number \| undefined | Pagination offset                      |

No changes to these types. The new component consumes them as-is.

## New Component State (Local to FilterableBranchDropdown)

These are transient UI states managed via React `useState` within the component. They are not persisted in the Zustand store.

| State              | Type    | Default     | Description                                                       |
|--------------------|---------|-------------|-------------------------------------------------------------------|
| filterText         | string  | `""`        | Current text in the filter input. Cleared on dropdown close.      |
| highlightedIndex   | number  | `-1`        | Index of the highlighted item in the flat filtered list. -1 = none highlighted. |
| listNavigationMode | boolean | `false`     | Whether keyboard input is in list navigation mode (after Tab). Typing resets to false. |

### Flat Filtered List (Derived)

The dropdown renders a flat list derived from the branch data. Each item is one of:

| Item Type      | Fields                                    | Description                              |
|----------------|-------------------------------------------|------------------------------------------|
| AllBranches    | `{ type: "all" }`                         | Always first. Selects `undefined` filter |
| GroupHeader    | `{ type: "header", label: string }`       | "Local" or "Remote" section header       |
| BranchItem     | `{ type: "branch", branch: Branch, displayName: string, value: string }` | A selectable branch |

**Filtering logic**:
1. Start with "All Branches" item (always present).
2. Filter local branches by `filterText` (case-insensitive substring on `branch.name`).
3. If any local branches match, add "Local" header + matched branches.
4. Filter remote branches by `filterText` (case-insensitive substring on `${branch.remote}/${branch.name}`).
5. If any remote branches match, add "Remote" header + matched branches.
6. Group headers are not selectable and are skipped during keyboard navigation.

### State Transitions

```
CLOSED → [click trigger / keyboard open] → OPEN (filterText="", highlightedIndex=-1, listNavigationMode=false)
OPEN + typing → filterText updates, list re-filters, highlightedIndex resets to -1, listNavigationMode=false
OPEN + Tab (when filtered list has items) → listNavigationMode=true, highlightedIndex=0 (first selectable item)
OPEN + Tab (when filtered list is empty) → no change (focus stays on input)
OPEN + ArrowDown/ArrowUp (listNavigationMode=true) → highlightedIndex moves to next/prev selectable item
OPEN + typing (listNavigationMode=true) → listNavigationMode=false, focus returns to input, character appended to filterText
OPEN + Enter (listNavigationMode=true, highlightedIndex >= 0) → select branch, CLOSED
OPEN + click branch → select branch, CLOSED
OPEN + Escape → CLOSED (no selection change, filterText cleared)
OPEN + click outside → CLOSED (no selection change)
```
