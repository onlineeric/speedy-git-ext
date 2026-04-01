# Quickstart: Multi-Branch Filter Selection

**Feature**: 028-multi-branch-filter  
**Date**: 2026-03-31

## What This Feature Does

Changes the branch filter dropdown from single-select to multi-select. Users can select multiple branches and the commit graph shows only commits reachable from the selected branches.

## How to Build & Test

```bash
pnpm build              # Build extension + webview
pnpm typecheck          # Verify no type errors (strict mode)
pnpm lint               # Verify no lint errors
```

Then use VS Code's "Run Extension" launch config to smoke test:

1. Open the extension in a repo with multiple branches
2. Click the branch filter dropdown
3. Select multiple branches — verify checkboxes appear and graph updates after each toggle
4. Verify text filter still narrows the list
5. Verify "All Branches" clears selections
6. Verify trigger button shows correct label ("All Branches", branch name, or "N branches selected")

## Files Changed (8 files)

| File | Change |
|------|--------|
| `shared/types.ts` | `GraphFilters.branch?: string` → `branches?: string[]` |
| `shared/messages.ts` | `loadMoreCommits` filter type aligned |
| `src/services/GitLogService.ts` | Push multiple refs to git log args |
| `src/WebviewProvider.ts` | Multi-branch validation, filter merging |
| `webview-ui/src/components/FilterableBranchDropdown.tsx` | Multi-select toggle, checkboxes, trigger label, dropdown stays open |
| `webview-ui/src/components/ControlBar.tsx` | `handleBranchToggle` + `handleClearSelection` |
| `webview-ui/src/stores/graphStore.ts` | `hasFilter` check for branches array |
| `webview-ui/src/rpc/rpcClient.ts` | Extract `branches[]` for prefetch |

## No New Dependencies

This feature extends existing code only. No packages to install.
