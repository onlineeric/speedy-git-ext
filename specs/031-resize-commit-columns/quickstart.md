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
- Verify header and row cells stay aligned while resizing.
- Narrow the panel and confirm the message column shrinks first.
- Keep narrowing until the minimum viable width is reached and confirm the table extends past the right edge without showing a horizontal scrollbar.

### 3. Reorder and Hide Optional Columns

- Open the commit-list settings popover in table mode.
- Reorder the optional columns.
- Hide `refs` or `author`.
- Verify the graph column remains visible and first.
- Re-enable the hidden column and verify it returns in its previous position and width.

### 4. Persistence Across Reloads

- In table mode, resize at least two columns and hide one optional column.
- Reload the webview or reopen the panel.
- Verify the previous mode, column widths, order, and visibility restore on first render.
- Switch repositories and confirm the same layout is reused.

### 5. Regression Checks

- Verify search highlight, row selection, and keyboard navigation still work in both modes.
- Open commit and ref context menus in both modes.
- Confirm long refs and long messages truncate within their columns instead of overlapping adjacent content.

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

