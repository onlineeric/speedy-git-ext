# Quickstart: Filterable Branch Dropdown

**Feature**: 014-filterable-branch-dropdown | **Date**: 2026-03-17

## Prerequisites

- Node.js 18+
- pnpm installed
- VS Code for testing

## Setup

```bash
git checkout 014-filterable-branch-dropdown
pnpm install
```

No new packages to install — all dependencies (`@radix-ui/react-popover`, React, Zustand) are already in the project.

## Development

```bash
pnpm watch        # Watch mode for both extension + webview
```

Then press F5 in VS Code (or use "Run Extension" launch config) to open the Extension Development Host.

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `webview-ui/src/components/FilterableBranchDropdown.tsx` | CREATE | New filterable dropdown component |
| `webview-ui/src/components/ControlBar.tsx` | MODIFY | Replace `<select>` with `<FilterableBranchDropdown>` |

## Validation

```bash
pnpm typecheck    # TypeScript strict mode check
pnpm lint         # ESLint
pnpm build        # Full build (extension + webview)
```

### Manual Smoke Test Checklist

1. Open the extension in a repo with multiple branches
2. Click the branch dropdown trigger → verify it opens with text input focused
3. Type partial branch name → verify list filters in real-time
4. Press Tab → verify first item is highlighted
5. Use Up/Down arrows → verify highlight moves
6. Press Enter → verify branch is selected and dropdown closes
7. Click a branch → verify selection works
8. Press Escape → verify dropdown closes without changing selection
9. Click outside → verify dropdown closes
10. Verify "All Branches" is always visible
11. Verify current branch has `*` indicator
12. Test in both light and dark VS Code themes
