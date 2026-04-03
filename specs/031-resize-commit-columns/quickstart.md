# Quickstart: Resizable Commit Columns

**Date**: 2026-04-03

## Prerequisites

- Node.js 18+
- pnpm installed
- VS Code for extension debugging

## Development

```bash
pnpm watch

# or run one-off validation
pnpm typecheck
pnpm lint
pnpm build
```

## Manual Test Flow

1. Open this repository in VS Code.
2. Start the extension via the "Run Extension" launch config.
3. In the Extension Development Host, open a Git repository with enough history to show several graph lanes.
4. Run `Speedy Git: Show Graph`.

## Test Scenarios

### 1. Switch Between Classic and Table Modes

- Open the commit-list settings popover from the control bar.
- Switch from classic to table mode.
- Verify the classic layout is replaced by a table header plus aligned table rows.
- Switch back to classic mode and confirm the current commit selection remains intact.

### 2. Resize Columns

- Switch to table mode.
- Drag the boundary for the message column wider and narrower.
- Drag the graph column wider on a history with multiple active lanes.
- Narrow the graph column below the topology width and confirm the graph clips naturally.
- Verify header and row cells stay aligned while resizing.
- Narrow the panel and confirm the message column shrinks first.
- Keep narrowing until the minimum viable width is reached and confirm the table extends past the right edge without showing a horizontal scrollbar.
- Double-click the boundary between the author column and the next column; confirm the author column auto-sizes to fit the widest author name.
- Double-click the message column boundary; confirm it widens to fit the longest commit subject.
- Double-click the date column boundary; confirm the width fits the longest formatted date string.
- Reload the webview and confirm the auto-fit widths persisted correctly.

### 3. Reorder and Hide Optional Columns

- Open the commit-list settings popover in table mode.
- Reorder the optional columns (hash, message, author, date).
- Hide `author` or `date`.
- Verify the graph column remains visible and first.
- Re-enable the hidden column and verify it returns in its previous position and width.
- Confirm ref badges render inline in the message column (matching classic view) and maintain fixed size when the column width changes.

### 4. Persistence Across Reloads

- In table mode, resize at least two columns and hide one optional column.
- Reload the webview or reopen the panel.
- Verify the previous mode, column widths, order, and visibility restore on first render.
- Switch repositories and confirm each repo has its own independent column layout.
- Customize columns differently in two repos, switch between them, and verify each restores its own layout.

### 6. Default to Table View

- Clear persisted state (or test with a fresh extension install).
- Open the commit list and verify it defaults to Table view, not Classic.

### 7. Classic Mode Disables Column Config

- Switch to Classic mode in the settings popover.
- Verify that column visibility toggles and drag-to-reorder controls are visually disabled and non-interactive.
- Switch back to Table mode and verify controls become interactive again.

### 5. Regression Checks

- Verify search highlight, row selection, and keyboard navigation still work in both modes.
- Open commit and ref context menus in both modes.
- Confirm long refs and long messages truncate within their columns instead of overlapping adjacent content.
- Verify the commit-list settings button highlights active (sky-400) when its popover is open and deactivates when closed or when another toggle widget opens.
- Confirm table body column borders match the header border color.

## Files Expected to Change

| File | Change |
|------|--------|
| `shared/types.ts` | Add commit-list mode and persisted table-layout types/defaults |
| `src/WebviewProvider.ts` | Validate and persist commit list mode + table layout |
| `webview-ui/src/stores/graphStore.ts` | Hold hydrated mode/layout state and mutation actions |
| `webview-ui/src/components/ControlBar.tsx` | Add entry point for commit-list settings/column chooser |
| `webview-ui/src/components/GraphContainer.tsx` | Render classic or table mode with virtualization preserved |
| `webview-ui/src/components/CommitTableHeader.tsx` | Add table header and resize handles |
| `webview-ui/src/components/CommitTableRow.tsx` | Render aligned table rows with existing interactions |
| `webview-ui/src/components/CommitListSettingsPopover.tsx` | Mode switch, visibility toggles, and reorder UI |
| `webview-ui/src/utils/commitTableLayout.ts` | Shared width-resolution and visible-column helpers |

