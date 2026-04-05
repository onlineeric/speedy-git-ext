# Component Contracts: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`
**Date**: 2026-04-04

This document defines the public interfaces (props) for new and significantly modified React components.

## New Components

### MultiSelectDropdown<T>

Generic multi-select dropdown component extracted from `MultiBranchDropdown`. Used by both the branch filter dropdown and the author filter dropdown.

```typescript
interface MultiSelectDropdownProps<T> {
  /** All available items */
  items: T[];
  /** Currently selected items */
  selectedItems: T[];
  /** Called when an item is toggled (selected/deselected) */
  onToggle: (item: T) => void;
  /** Called when "Select All/None" is clicked (clears all selections) */
  onClearAll: () => void;
  /** Unique key for each item (used for React keys and selection tracking) */
  getKey: (item: T) => string;
  /** Text used for search/filter matching */
  getSearchText: (item: T) => string;
  /** Custom render for each dropdown item row */
  renderItem: (item: T, isSelected: boolean, isHighlighted: boolean) => ReactNode;
  /** Custom render for the trigger button */
  renderTrigger: (selectedCount: number, isOpen: boolean) => ReactNode;
  /** Optional: group items by category (returns group label) */
  groupBy?: (item: T) => string;
  /** Search input placeholder text */
  placeholder?: string;
  /** Label for the "clear all / select none" option */
  clearAllLabel?: string;
  /** Additional CSS class for the popover content */
  className?: string;
}
```

**Interaction patterns** (inherited from MultiBranchDropdown):
- Tab key: enter list navigation mode
- Arrow Up/Down: navigate highlighted item
- Enter: toggle selection of highlighted item
- Type while navigating: redirect focus to search input
- Auto-scroll: keeps highlighted item in view
- Popover stays open on selection (multi-select behavior)
- The clear-all option (rendered via `clearAllLabel`) MUST remain always-visible at the top of the list regardless of search filter text (per FR-002 "always-visible first option")

### AuthorBadge

Shared author badge component for filter panel and commit details panel.

```typescript
interface AuthorBadgeProps {
  /** Author display name */
  name: string;
  /** Author email (used to resolve avatar) */
  email: string;
  /** Optional: called when remove (X) button is clicked. When undefined, no X button is shown. */
  onRemove?: () => void;
  /** Additional CSS class */
  className?: string;
}
```

**Visual**: Avatar icon (via existing `AuthorAvatar` component) + author name text. Optional X button for removable variant.

### FilterWidget (rewritten)

The advanced filter panel displayed in the TogglePanel area.

```typescript
// No external props — reads all state from Zustand store.
// Renders three filter sections: branch badges, author filter, date range.
```

**Internal structure**:
```
FilterWidget
├── Branch Filter Row
│   ├── Label: "Branches"
│   └── Badge area (max-height ~96-112px, overflow-y: auto, flex-wrap: wrap):
│       ├── RefLabel[] (reused from commit table, with laneColorStyle from graph topology)
│       │   └── Each wrapped with X button for removal
│       └── Empty state: "All branches" text when no branches filtered
├── Author Filter Row
│   ├── Label: "Authors"
│   ├── MultiSelectDropdown<Author> (for selecting authors)
│   └── Badge area (max-height ~96-112px, overflow-y: auto, flex-wrap: wrap):
│       ├── AuthorBadge[] (from filters.authors, with X to remove)
│       └── Empty state: "All authors" text when no authors filtered
├── Date Range Row
│   ├── Label: "Date Range"
│   ├── From: <input type="date"> + <input type="time"> (optional)
│   ├── To: <input type="date"> + <input type="time"> (optional)
│   └── Reset All button (disabled when no author/date filters active)
└── Close button (X) to close the filter panel
```

**Height management (FR-020)**:
- The filter panel itself has NO fixed height and NO panel-level scrolling.
- Only the branch badge area and author badge area have `max-height` (~96-112px, approximately 3-4 lines of badges) and `overflow-y: auto`.
- Date range inputs, Reset All button, and labels take their natural height.

**Branch badge colors (FR-008)**:
- Each branch badge uses the `RefLabel` component with `laneColorStyle` prop.
- Color is resolved by: finding a commit with that branch ref in the topology → extracting `node.colorIndex` → resolving via `getColor(colorIndex, palette)` → building CSS style via `getLaneColorStyle()`.
- A helper `getBranchLaneColorStyle(branchName, commits, topology, palette)` in `filterUtils.ts` encapsulates this lookup.
- When a branch has no commit in the current topology, RefLabel falls back to default VS Code badge colors.

## Modified Components

### MultiBranchDropdown

Refactored to use `MultiSelectDropdown<Branch>` internally, delegating search, keyboard navigation, and multi-select logic to the generic component.

**Change summary**: Internal refactor only. External props remain unchanged:
```typescript
interface MultiBranchDropdownProps {
  branches: Branch[];
  selectedBranches: string[];
  onBranchToggle: (branch: string) => void;
  onClearSelection: () => void;
}
```

### CommitTableRow (context menu additions)

Author and date filter actions are added as **nested Radix ContextMenu** triggers directly in CommitTableRow, not via CommitContextMenu. The inner context menus take priority over the outer CommitContextMenu for right-clicks on specific cells.

**Author cell context menu**:
- "Add Author to filter" / "Remove Author from filter" (conditional on whether the commit's author email is in `filters.authors`)

**Date cell context menu**:
- "Filter from this date" (sets `afterDate` to date portion at `T00:00:00`)
- "Filter to this date" (sets `beforeDate` to date portion)

### BranchContextMenu

Extended with branch filter actions.

**New menu items**:
- "Add branch to filter" / "Remove branch from filter" (conditional on current filter state)

### CommitDetailsPanel

Author display upgraded from plain text to `AuthorBadge` component (display-only variant, no remove button).

### ControlBar

- Filter button unhidden (remove `style={{ display: 'none' }}`).
- `filterColor` logic updated to check all filter types: `filterHasBranchFilter || filterHasAuthorFilter || filterHasDateFilter`.

### GraphContainer

Empty state message when `mergedCommits.length === 0 && !loading && hasActiveFilters`:
```
"No commits match the current filters"
```

Note: The empty state is added to `GraphContainer.tsx` which wraps the virtual scroll list. There is no separate `CommitTable.tsx` file — the table is rendered inline via `CommitTableRow` and `CommitTableHeader` within the virtual scroller.
