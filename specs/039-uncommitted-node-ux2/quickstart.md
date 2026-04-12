# Quickstart: Uncommitted Node UX2

## What this feature does

Upgrades the file picker dialog ("Select files for..." dialog triggered from the uncommitted node) to show the same rich file list as the commit details panel — status badges, +N/−N line counts, and a list/tree view toggle. The view mode is shared bidirectionally with the commit details panel.

## Prerequisites

- pnpm installed
- VS Code with "Run Extension" launch config

## Development

```bash
pnpm watch              # Watch mode for extension + webview
# Then press F5 in VS Code to launch the Extension Development Host
```

## Key files to modify

| File | What changes |
|------|-------------|
| `webview-ui/src/components/FileChangeShared.tsx` | Receives extracted `FileChangeRow` + new `ViewModeToggle` component |
| `webview-ui/src/components/FileChangesTreeView.tsx` | Add optional selection props for checkboxes and tri-state folder checkboxes |
| `webview-ui/src/components/FilePickerDialog.tsx` | Replace `FileGroup` with `SelectableFileSection` using shared rendering |
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Import `FileChangeRow` and `ViewModeToggle` from shared location |
| `webview-ui/src/utils/fileTreeBuilder.ts` | Add `getDescendantFilePaths()` utility |

## Validation

```bash
pnpm typecheck          # Must pass with zero errors
pnpm lint               # Must pass with zero errors
pnpm build              # Must produce clean build
pnpm test               # Unit tests must pass
```

Then smoke test in VS Code Extension Development Host:
1. Open a repo with both staged and unstaged changes
2. Click the uncommitted node → open file picker dialog
3. Verify status badges and +/- line counts match commit details panel
4. Toggle list/tree view in dialog → verify both sections switch
5. Close dialog → open commit details panel → verify view mode persisted
6. In tree view: check folder checkbox → verify all descendants selected (tri-state)
7. Toggle view mode mid-selection → verify selections preserved
