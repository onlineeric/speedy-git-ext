# Quickstart: Responsive Split Layout for Bottom Commit Details Panel

**Date**: 2026-03-31

## Prerequisites

- Node.js 18+
- pnpm installed
- VS Code for debugging

## Development

```bash
pnpm watch

# or build once
pnpm build

pnpm typecheck
pnpm lint
```

## Testing

1. Open VS Code with this repo
2. Press F5 or use the "Run Extension" launch config
3. Open a git repository in the Extension Development Host
4. Run `Speedy Git: Show Graph`
5. Select a commit to open the commit details panel

### Test Scenarios

**Bottom panel switches to split layout on wide widths**
- Keep the details panel in the bottom position
- Resize the editor and/or bottom panel so the panel becomes wide
- Verify commit details render on the left and files changed render on the right
- Verify both sections remain visible at once for a commit with long metadata and many changed files

**Bottom panel falls back to stacked layout on narrow widths**
- Start from a wide bottom panel already showing split mode
- Narrow the available panel width
- Verify the layout automatically returns to commit details on top and files changed below
- Verify the current commit selection and file view mode remain unchanged

**Right panel stays unchanged**
- Move the details panel to the right
- Resize the overall editor area and the panel width
- Verify the panel always renders in the original stacked layout

**Files section behavior remains intact**
- In bottom split mode, toggle between list and tree views
- Click changed files and verify existing open-diff/open-file behavior still works
- Verify long file lists remain scrollable and usable in the right-hand section

## Files Expected to Change

| File | Change |
|------|--------|
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Refactor panel body into reusable sections and add responsive bottom split layout |
| `webview-ui/src/stores/graphStore.ts` | No change expected |
| `shared/types.ts` | No change expected |
