# Research: 018-commit-files-enhancements

**Date**: 2026-03-20

## R1: Tree View Component Library

### Decision: `@headless-tree/core` + `@headless-tree/react`

### Rationale

- **Headless architecture**: Provides tree state management (expand/collapse, keyboard navigation, accessibility) with full rendering control. Perfect for our custom file rows with badges, change counts, and action icons.
- **Zero runtime dependencies**: ~9.9kB total bundle. Does not duplicate any existing dependency.
- **Pairs with `@tanstack/react-virtual`**: Produces a flat list of visible nodes that feeds directly into `useVirtualizer` — same pattern used in `GraphContainer.tsx`.
- **Active maintenance**: Last published 2026-01-20. Author is the same maintainer behind `react-complex-tree` (3+ years of maturity).
- **Accessibility built-in**: WAI-ARIA tree pattern compliance, keyboard navigation, focus management.
- **Folder compaction**: Not built-in, but trivially implemented as a data transformation (~40 LOC) before passing data to the tree.

### Alternatives Considered

| Package | Weekly Downloads | Why Rejected |
|---------|-----------------|--------------|
| `@vscode/webview-ui-toolkit` | N/A | **Deprecated** (Jan 2025). Never had a tree view component. |
| `react-arborist` | ~86k-115k | Heavy dependency chain (redux, react-dnd, react-window). Maintenance stagnant since Feb 2025. Redundant virtualizer with existing `@tanstack/react-virtual`. |
| `react-complex-tree` | ~25k-48k | Predecessor to `@headless-tree`. Author designated headless-tree as official successor. Still usable but no major new features. |
| Custom implementation | N/A | Viable at ~300-400 LOC, but reimplements keyboard navigation and WAI-ARIA accessibility which `@headless-tree` provides for free. Higher maintenance burden. |

### Install Command

```bash
cd webview-ui && pnpm add @headless-tree/core @headless-tree/react
```

---

## R2: New Backend Message for Opening Current File Version

### Decision: Add `openCurrentFile` message type

### Rationale

The existing `openFile` message requires a commit hash and opens the file at that revision (read-only). For "open current version", we need to open the file from the working tree (editable). A new `openCurrentFile` message with only `filePath` is cleaner than overloading `openFile` with a sentinel hash value.

### Backend Handler

Uses `vscode.workspace.openTextDocument(uri)` + `vscode.window.showTextDocument(doc)` where `uri` is constructed from the workspace folder + relative path. This opens the live working tree file in an editable editor.

---

## R3: Clipboard API in VS Code Webview

### Decision: Reuse existing `copyToClipboard` RPC method

### Rationale

The project already has a `copyToClipboard` message type handled by `WebviewProvider.ts` (line 531-534) using `vscode.env.clipboard.writeText()`. The `rpcClient.copyToClipboard(text)` method is already available in the webview. No new infrastructure needed — just call it with the file path.

---

## R4: Per-File Change Counts Data Availability

### Decision: Existing backend data is sufficient

### Rationale

`GitDiffService.parseNumstat()` (lines 258-308) already populates `file.additions` and `file.deletions` on each `FileChange` object. The current `FileChangeRow` component already renders these per-file counts. The only change needed is:
1. Remove aggregate stats from the header (currently sourced from `details.stats`)
2. Suppress change counts for files with status `added` or `deleted`
3. Handle binary files (where numstat reports `-` for both additions/deletions)

The `FileChange` type already supports `additions?: number` and `deletions?: number` as optional fields, which naturally handles the binary case (both undefined).

---

## R5: Binary File Detection

### Decision: Use existing undefined additions/deletions pattern

### Rationale

`parseNumstat()` already handles binary files — when git reports `-` for additions/deletions, it sets neither field on the FileChange object. We can detect binary files by checking: `file.additions === undefined && file.deletions === undefined && file.status !== 'added' && file.status !== 'deleted'`. Display "binary" label in this case.
