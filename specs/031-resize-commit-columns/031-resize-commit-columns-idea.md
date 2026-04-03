# 031 — Resizable Commit Columns (Idea Spec)

## Problem

The commit list in `GraphContainer` displays columns (Graph, Hash, Refs, Message, Author, Date) using a flex layout with hardcoded widths. Users cannot adjust column widths to suit their screen size or preferences — e.g., hiding author to see more of the message, or widening the graph when many lanes are active.

## Goal

Provide a table-like commit list with:
1. **Resize columns** — drag column borders to adjust widths
2. **Reorder columns** — drag-and-drop to rearrange (Graph always pinned first)
3. **Show/hide columns** — toggle column visibility via a column chooser

These features are delivered via a new TanStack Table view alongside the existing Classic view. Users can switch between views in settings.

## Current Layout (CommitRow.tsx)

Each row is a flex `<div>` with these columns:

| # | Column | Current Sizing | CSS |
|---|--------|---------------|-----|
| 1 | Graph (SVG) | Dynamic, `maxLanes * 16px` | Computed inline width |
| 2 | Hash | Fixed 64px | `w-16 flex-shrink-0` |
| 3 | Refs | Variable, shrink-proof | `flex-shrink-0`, no fixed width |
| 4 | Message | Fills remaining space | `flex-1 truncate` |
| 5 | Author | Fixed 144px | `w-36 flex-shrink-0` |
| 6 | Date | Fixed 96px | `w-24 flex-shrink-0` |

Rows are virtually scrolled via `@tanstack/react-virtual` with absolute positioning and `transform: translateY(...)`.

## Solution: 2 Swappable View Modes

A user setting (`commitListView`) switches between two view implementations:

| View | Layout | Resize | Reorder | Show/Hide | Column State | New Dependencies |
|------|--------|--------|---------|-----------|-------------|-----------------|
| **Classic** | Flex (current code) | No | No | No | None | None |
| **Table (TanStack)** | CSS Grid | Yes | Yes (dnd-kit) | Yes | `@tanstack/react-table` | `@tanstack/react-table` (~15 kB) |

### Architecture

```
GraphContainer (shared: virtualizer, selection, search, prefetch, tooltip)
│
├── [All views] Banners, TogglePanel, SubmoduleSection (unchanged)
│
├── viewMode === 'classic'
│   └── CommitRowClassic (current flex layout, renamed, zero changes)
│
└── viewMode === 'table'
    ├── ColumnHeader (TanStack Table state + dnd-kit reorder + resize handles)
    └── CommitRowTable (CSS Grid, column layout from TanStack Table instance)
```

**Shared logic stays in GraphContainer (unchanged across views):**
- Virtual scrolling (`@tanstack/react-virtual`)
- Selection (click, shift-click, ctrl-click)
- Prefetch on scroll
- Search match highlighting + scroll-to-match
- Tooltip hover management
- Resize observation for `maxVisibleRefs`

**View-specific logic (swappable per view):**
- Row layout component (flex vs CSS Grid)
- Column header (none vs header with resize/reorder handles)
- Column state management (none vs TanStack Table)

**Shared cell components (reused by both row variants):**
- `GraphCell` — SVG graph rendering
- `RefLabel` / `OverflowRefsBadge` — branch/tag labels
- `AuthorAvatar` — author avatar
- `CommitContextMenu` / `BranchContextMenu` / `StashContextMenu` — context menus
- `formatRelativeDate` / `formatAbsoluteDateTime` — date formatting
- `renderInlineCode` — inline code in commit messages

### Why TanStack Table?

| Consideration | Assessment |
|---------------|------------|
| **Performance** | `getCoreRowModel` iterates all commits (~1-3ms on 500 commits) — imperceptible to users |
| **Bundle size** | ~15 kB gzipped — acceptable |
| **Ecosystem fit** | Same `@tanstack` ecosystem as our existing `react-virtual` |
| **Built-in features** | Column resize, reorder state, visibility, pinning — all handled |
| **Future extensibility** | Sorting, grouping, filtering available if needed later |
| **Edge cases** | Resize + reorder + visibility state interactions are battle-tested |
| **Maintenance** | Less custom code vs hand-rolling equivalent state management |

### Performance Analysis

**Critical concern: Resize drag performance (~60 mousemove events/sec)**

The table view uses the **CSS variable via ref** pattern to achieve zero React re-renders during drag:

```ts
// During drag (mousemove handler) — direct DOM mutation, no setState:
containerRef.current?.style.setProperty('--col-hash', `${newWidth}px`);

// On mouseup only — commit to React state:
setColumnWidth('hash', newWidth);
```

Each row uses CSS Grid with variables: `grid-template-columns: var(--col-graph) var(--col-hash) ...`
When CSS variables change on the parent container, the browser handles style recalc + layout on ~40 visible rows × ~6 cells = ~240 elements, which takes < 2ms/frame. React.memo on row components is never invalidated during drag.

| Concern | Impact | Notes |
|---------|--------|-------|
| Resize drag (CSS vars via ref) | **Negligible** | Zero React work; browser handles ~240 elements in < 2ms/frame |
| Flex → Grid switch | **Negligible** | Same layout cost for 6 cells; rows are absolutely positioned (layout-independent) |
| React.memo during resize | **No impact** | CSS variables bypass React; no prop changes during drag |
| Column reorder | **Negligible** | One-time re-render on drop |
| Column visibility toggle | **Negligible** | One-time re-render on toggle |
| TanStack Table row model overhead | **Minor** | `getCoreRowModel` iterates all 500+ commits to build Row wrappers on data change; ~1-3ms but imperceptible |

---

## Implementation Phases

### Phase 1: Refactor + Classic View + Setting

**Goal:** Extract the current CommitRow into a swappable architecture. Add the `commitListView` setting. The only functional view is "Classic" — the app behaves identically to today.

**This phase changes zero rendering behavior.** It is purely a structural refactor to enable Phase 2.

#### 1.1 Add `commitListView` setting

- **`shared/types.ts`** — Add type and default:
  ```ts
  export type CommitListView = 'classic' | 'table';
  ```
  Add `commitListView: CommitListView` to `UserSettings` with default `'classic'`.

- **`src/services/SettingsService.ts`** (or wherever settings are read) — Read/write the new setting from VS Code configuration.

- **Settings UI** — Add a dropdown in the existing settings panel:
  - Label: "Commit List View"
  - Options: "Classic", "Table"
  - Only "Classic" is functional in Phase 1; "Table" shows as disabled or displays a "coming soon" note.

#### 1.2 Rename CommitRow → CommitRowClassic

- **Rename** `webview-ui/src/components/CommitRow.tsx` → `webview-ui/src/components/CommitRowClassic.tsx`
- **Rename** the exported component from `CommitRow` to `CommitRowClassic`
- **Keep the exact same code** — no layout changes, no prop changes, no behavior changes

#### 1.3 Create CommitRow switcher

- **New file** `webview-ui/src/components/CommitRow.tsx` — a thin wrapper that reads `commitListView` from settings and renders the appropriate row component:
  ```tsx
  export const CommitRow = memo(function CommitRow(props: CommitRowProps) {
    const viewMode = useGraphStore((s) => s.userSettings.commitListView);
    switch (viewMode) {
      case 'table':
        return <CommitRowTable {...props} />;
      case 'classic':
      default:
        return <CommitRowClassic {...props} />;
    }
  });
  ```
  In Phase 1, `CommitRowTable` is a stub that falls back to `CommitRowClassic`.

#### 1.4 Prepare header slot in GraphContainer

- **`webview-ui/src/components/GraphContainer.tsx`** — Add a conditional header area above the scroll container:
  ```tsx
  {viewMode !== 'classic' && <ColumnHeader viewMode={viewMode} />}
  ```
  In Phase 1, `ColumnHeader` is a stub or not rendered (since only Classic is active).

#### 1.5 Extract CommitRowProps to shared location

- **`webview-ui/src/components/commitRowTypes.ts`** (new file) — Move the `CommitRowProps` interface out of `CommitRowClassic.tsx` so both row variants can import it. This avoids circular dependencies.

#### Phase 1 Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add `CommitListView` type, add to `UserSettings` |
| `webview-ui/src/components/CommitRow.tsx` → `CommitRowClassic.tsx` | Rename file + component |
| `webview-ui/src/components/CommitRow.tsx` | **New** — view switcher |
| `webview-ui/src/components/commitRowTypes.ts` | **New** — shared `CommitRowProps` interface |
| `webview-ui/src/components/GraphContainer.tsx` | Read `commitListView`, add header slot |
| `webview-ui/src/stores/graphStore.ts` | No change (setting comes via `userSettings`) |
| Backend settings files | Add `commitListView` to settings schema |
| Settings UI | Add dropdown (Table disabled in Phase 1) |

#### Phase 1 Testing Checklist

- [ ] App behaves identically to current — no visual or performance difference
- [ ] Setting appears in settings UI with "Classic" selected by default
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] Virtual scrolling, selection, search, prefetch all work as before
- [ ] Context menus (commit, branch, stash) all work as before
- [ ] Tooltip hover works as before

---

### Phase 2: Table View (TanStack Table + dnd-kit)

**Goal:** Implement the TanStack Table-powered table view with resize, reorder, and show/hide columns.

**New dependency:** `@tanstack/react-table` (~15 kB gzipped)

#### 2.1 Install @tanstack/react-table

- Run: `pnpm add @tanstack/react-table`

#### 2.2 Column definitions

- **New file** `webview-ui/src/components/tableView/columnDefs.ts`
- Define 6 columns: `graph`, `hash`, `refs`, `message`, `author`, `date`
- Each column has: `id`, `header` label, `size` (default width), `minSize`, `enableHiding` (false for graph), `enableResizing`
- Column `cell` functions are NOT used — we render cells ourselves in CommitRowTable

#### 2.3 Table state hook

- **New file** `webview-ui/src/components/tableView/useCommitTable.ts`
- Wraps `useReactTable()` configured with:
  - `columnOrder` state (persisted)
  - `columnVisibility` state (persisted)
  - `columnPinning: { left: ['graph'] }` — Graph always first
  - `enableColumnResizing: true`, `columnResizeMode: 'onChange'`
  - `getCoreRowModel` with the commits array (required by TanStack, minimal overhead)
- Exposes: ordered visible columns, column sizes, resize handlers, reorder/visibility setters
- Computes CSS variables for column sizes (following TanStack's performant resize pattern)

#### 2.4 Column Header (TanStack variant)

- **New file** `webview-ui/src/components/tableView/ColumnHeaderTable.tsx`
- Renders header cells using `table.getHeaderGroups()`
- Each non-pinned header cell is wrapped in `@dnd-kit/sortable` for drag-to-reorder
- Resize handles between columns (thin `<div>`, `cursor: col-resize`)
- Double-click resize handle → reset column to default width
- Column visibility toggle button (popover with checkboxes, Graph checkbox disabled)
- Uses CSS Grid with same `grid-template-columns` as rows

#### 2.5 CommitRowTable

- **New file** `webview-ui/src/components/tableView/CommitRowTable.tsx`
- CSS Grid layout with `grid-template-columns` from CSS variables set on the scroll container
- Renders the same cell components as Classic (GraphCell, RefLabel, AuthorAvatar, etc.)
- Column order follows `table.getVisibleLeafColumns()` order
- Hidden columns are simply not rendered
- Wrapped in `React.memo` with same memoization strategy as Classic

#### 2.6 Integrate into GraphContainer

- When `viewMode === 'table'`:
  - Initialize `useCommitTable()` hook
  - Set CSS variables on `containerRef` for column sizes
  - Render `ColumnHeaderTable` above the scroll container
  - Render `CommitRowTable` for each virtual item

#### 2.7 Persist column state

- Save `columnOrder`, `columnVisibility`, `columnWidths` to VS Code `globalState` via `PersistedUIState`
- Load on webview init alongside other persisted state
- Add corresponding message types to `shared/messages.ts` and handlers in `WebviewProvider.ts`

#### Phase 2 Files

| File | Change |
|------|--------|
| `webview-ui/src/components/tableView/columnDefs.ts` | **New** — column definitions |
| `webview-ui/src/components/tableView/useCommitTable.ts` | **New** — TanStack Table hook |
| `webview-ui/src/components/tableView/ColumnHeaderTable.tsx` | **New** — header with resize + dnd-kit reorder |
| `webview-ui/src/components/tableView/CommitRowTable.tsx` | **New** — CSS Grid row |
| `webview-ui/src/components/CommitRow.tsx` | Enable `table` case in switcher |
| `webview-ui/src/components/GraphContainer.tsx` | Add table hook + CSS vars + header rendering |
| `shared/types.ts` | Add column state types to `PersistedUIState` |
| `shared/messages.ts` | Add persist/load column state messages (if needed) |
| `src/WebviewProvider.ts` | Handle column state persistence |
| `webview-ui/src/rpc/rpcClient.ts` | Add column state persist calls |

#### Phase 2 Testing Checklist

- [ ] Switch to "Table" in settings → table view renders with header
- [ ] Column resize: drag handle resizes column smoothly (no jank)
- [ ] Column resize: double-click handle resets to default width
- [ ] Column reorder: drag header cell to reorder (Graph stays pinned first)
- [ ] Column visibility: toggle columns on/off via popover (Graph cannot be hidden)
- [ ] Column state persists across webview reloads
- [ ] Virtual scrolling, selection, search, prefetch all work
- [ ] Context menus work on all row variants
- [ ] Switch back to "Classic" → everything works as before
- [ ] Performance: resize drag is smooth (check with DevTools Performance tab)
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` pass

---

## Open Questions

1. Should we show column header labels, or just have invisible resize handles in a thin divider bar?
2. Should the Refs column be hideable entirely (width → 0) or enforce a minimum?
3. Should column widths be per-repo or global?
4. After sufficient usage, do we drop Classic view or keep it as a permanent fallback?

---

## Historical Reference: Hand-Rolled CSS Grid Option (Not Implementing)

> **Decision:** We evaluated a hand-rolled CSS Grid approach (zero dependencies, ~220-280 lines of custom state management) as an alternative to TanStack Table. While it would have zero bundle cost, TanStack Table was chosen because:
> - The ~1-3ms row model overhead is imperceptible to users
> - TanStack Table provides battle-tested resize + reorder + visibility state coordination
> - Same `@tanstack` ecosystem as our existing `react-virtual`
> - Future extensibility (sorting, grouping) comes free if needed
> - Less custom code to maintain vs hand-rolling equivalent state management
>
> The hand-rolled approach remains a viable fallback if TanStack Table proves problematic.

### Hand-Rolled Design (Reference Only)

| View | Layout | Resize | Reorder | Show/Hide | Column State | New Dependencies |
|------|--------|--------|---------|-----------|-------------|-----------------|
| **Table (Hand-rolled)** | CSS Grid + CSS vars | Yes | Yes (dnd-kit) | Yes | Zustand records | None (`@dnd-kit` already installed) |

**Architecture:** Zustand-based column state with 3 records (`columnWidths`, `columnOrder`, `columnVisibility`). Resize via CSS variables mutated through refs (zero React re-renders during drag). Column reorder via `@dnd-kit/sortable`. ~220-280 lines of custom state management code.

**Files that would be needed:**
- `webview-ui/src/components/handrolledView/useColumnState.ts` — Zustand column state hook
- `webview-ui/src/components/handrolledView/useColumnResize.ts` — CSS var resize logic
- `webview-ui/src/components/handrolledView/ColumnHeaderHandRoll.tsx` — header with resize + dnd-kit reorder
- `webview-ui/src/components/handrolledView/CommitRowHandRoll.tsx` — CSS Grid + CSS vars row

### Library Comparison (Reference)

| Library | Size (gzip) | Column Resize | Column Reorder | Show/Hide | Virtual Scroll Compat | Verdict |
|---------|-------------|---------------|----------------|-----------|----------------------|---------|
| **@tanstack/react-table** | ~15 kB | Yes (built-in) | State only (use dnd-kit for drag) | Yes | Yes (headless, same ecosystem) | **Chosen** |
| **Hand-rolled** | 0 kB | Yes (~100 lines) | Yes (via dnd-kit, ~80 lines) | Yes (~40 lines) | Fully compatible | Viable fallback |
| react-data-grid | ~14.8 kB | Yes | Limited | Limited | Own implementation (conflicts) | Poor — conflicts with our virtualizer |
| react-resizable-panels | ~10.7 kB | No | No | No | N/A | Wrong tool — panel layout splitter |
| react-virtuoso | ~18.3 kB | No | No | No | Replaces our virtualizer | Wrong tool — no column features |
| AG Grid | ~330 kB | Yes | Yes | Yes | Built-in | Massive overkill |
