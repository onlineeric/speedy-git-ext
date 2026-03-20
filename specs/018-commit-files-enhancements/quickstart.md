# Quickstart: 018-commit-files-enhancements

**Date**: 2026-03-20

## Prerequisites

1. Install new dependency (tree view library):
   ```bash
   cd webview-ui && pnpm add @headless-tree/core @headless-tree/react
   ```

2. Verify build:
   ```bash
   pnpm build
   pnpm typecheck
   pnpm lint
   ```

## Key Files to Modify

### Backend (Extension Host)

| File | Changes |
|------|---------|
| `shared/messages.ts` | Add `openCurrentFile` request message type |
| `shared/types.ts` | Add `FileViewMode` type |
| `src/WebviewProvider.ts` | Add `openCurrentFile` handler |

### Frontend (Webview)

| File | Changes |
|------|---------|
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Refactor FileChangesList, FileChangeRow; add hover icons, change count logic, renamed file display |
| `webview-ui/src/components/FileChangesTreeView.tsx` | **NEW** — Tree view component using `@headless-tree/react` |
| `webview-ui/src/components/icons/index.tsx` | Add CopyIcon, FileIcon, FileCodeIcon, ListIcon, TreeIcon |
| `webview-ui/src/stores/graphStore.ts` | Add `fileViewMode` state + `setFileViewMode` action |
| `webview-ui/src/rpc/rpcClient.ts` | Add `openCurrentFile(filePath)` method |
| `webview-ui/src/utils/fileTreeBuilder.ts` | **NEW** — Utility to build tree from flat FileChange array with folder compaction |

## Architecture Flow

```
FileChangesList (header + view toggle)
  ├── List View (default): FileChangeRow[] (flat list, existing pattern)
  └── Tree View: FileChangesTreeView
       ├── @headless-tree/react (state management, keyboard nav, a11y)
       ├── @tanstack/react-virtual (virtual scrolling if needed)
       └── FileChangeRow (shared row component for file nodes)
```

## Smoke Test Checklist

1. Select a commit with mixed file statuses (added, modified, deleted, renamed)
2. Verify header shows only file count, no aggregate +/-
3. Verify per-file +/- counts on modified/renamed files, none on added/deleted
4. Hover over a file row → action icons appear
5. Click copy icon → path copied, checkmark flashes 0.5s
6. Click "open at commit" icon → file opens read-only at that revision
7. Click "open current version" icon → current file opens editable
8. Toggle to tree view → files grouped by folder, all expanded
9. Collapse/expand a folder
10. Verify renamed files show `newName ← oldName`
11. Switch back to list view → flat list restored
12. Repeat with uncommitted changes
