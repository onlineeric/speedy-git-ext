# Quickstart: UI Enhancements for Merge Dialog and Inline Code Rendering

**Date**: 2026-03-30

## Prerequisites

- Node.js 18+
- pnpm installed
- VS Code for debugging

## Development

```bash
# Build and watch
pnpm watch

# Or build once
pnpm build

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

## Testing

1. Open VS Code with this repo
2. Press F5 (or use "Run Extension" launch config) to open Extension Development Host
3. Open a git repository in the development host
4. Run command "Speedy Git: Show Graph"

### Test Scenarios

**Inline code rendering:**
- Create a test commit with backticks in the message: `` git commit --allow-empty -m "Fix `handleClick` in `App.tsx`" ``
- Verify the commit list shows "handleClick" and "App.tsx" with grey background, no backticks
- Click the commit to open details panel and verify same styling in subject and body

**Merge dialog --squash:**
- Right-click a branch → "Merge into current branch"
- Verify --squash checkbox appears first, above --no-commit and --no-ff
- Toggle --squash and verify command preview updates
- Verify --squash operates independently from other checkboxes

**Label styling:**
- In merge dialog, verify --squash, --no-commit, --no-ff display with grey background inline code style

## Files to Modify

| File | Change |
|------|--------|
| `webview-ui/src/utils/inlineCodeRenderer.tsx` | **NEW** — backtick parsing utility |
| `webview-ui/src/components/CommitRow.tsx` | Use `parseInlineCode()` for subject rendering |
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Use `parseInlineCode()` for subject + body |
| `webview-ui/src/components/MergeDialog.tsx` | Add squash checkbox, update labels |
