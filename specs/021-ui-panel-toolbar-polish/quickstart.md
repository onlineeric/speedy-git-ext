# Quickstart: UI Panel & Toolbar Polish

**Branch**: `021-ui-panel-toolbar-polish` | **Date**: 2026-03-24

## Files to Modify

| File | Change |
|------|--------|
| `webview-ui/src/components/icons/index.tsx` | Add 4 new SVG icons: CloudIcon, CloseIcon, MoveRightIcon, MoveBottomIcon |
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Fix right-side resize (add `relative`), add max width cap, update PanelHeader with SVG icons + labels + larger buttons |
| `webview-ui/src/components/ControlBar.tsx` | Reorder buttons (Refresh, Fetch, Search), move Manage Remotes to cloud icon button |
| `webview-ui/src/stores/graphStore.ts` | Clear commit selection state in `setActiveRepo` |

## No New Files

All changes are modifications to existing files. No new components, services, or shared types needed.

## No New Dependencies

All new icons are hand-crafted SVGs following the existing pattern. No packages to install.

## Validation

```bash
pnpm typecheck    # Zero TypeScript errors
pnpm lint         # Zero ESLint errors
pnpm build        # Clean build
```

Then smoke test via VS Code "Run Extension":
1. Open commit details → move to right → drag resize handle → verify width changes
2. Resize very wide → verify graph retains ~200px minimum
3. Verify toolbar order: Refresh, Fetch, Search, then [commits count] [cloud icon] [gear]
4. Click cloud icon → verify Remote Management dialog opens
5. Open commit details → switch repo → verify panel closes and selection clears
6. Verify close button shows clean X icon (not garbled)
7. Verify move button shows icon + "Move to right" / "Move to bottom" label
8. Verify both buttons are larger than before
