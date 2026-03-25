# Quickstart: Centralize Git Command Preview for All Dialogs

**Branch**: `022-git-command-preview` | **Date**: 2026-03-26

## Prerequisites

- Node.js 18+, pnpm installed
- VS Code with extension development setup
- Existing dev environment for the speedy-git-ext project

No new packages to install — this feature uses only existing dependencies.

## Implementation Order

The implementation follows a strict dependency chain:

```
Phase 1: Foundation (no deps)
  ├── gitCommandBuilder.ts    (pure functions)
  └── CommandPreview.tsx       (UI component)

Phase 2: Tests
  └── gitCommandBuilder.test.ts (depends on Phase 1)

Phase 3: Refactor existing
  └── PushDialog.tsx            (depends on Phase 1)

Phase 4: Extend ConfirmDialog
  └── ConfirmDialog.tsx         (depends on CommandPreview)

Phase 5: Add preview to dialogs (independent of each other)
  ├── MergeDialog.tsx
  ├── CherryPickDialog.tsx
  ├── DropCommitDialog.tsx
  ├── RebaseConfirmDialog.tsx
  ├── CheckoutWithPullDialog.tsx
  └── TagCreationDialog.tsx

Phase 6: Wire up context menus (depends on Phase 4+5)
  ├── CommitContextMenu.tsx
  └── BranchContextMenu.tsx
```

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `webview-ui/src/utils/gitCommandBuilder.ts` | CREATE | All command builder pure functions |
| `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts` | CREATE | Unit tests for builders |
| `webview-ui/src/components/CommandPreview.tsx` | CREATE | Reusable preview UI component |
| `webview-ui/src/components/PushDialog.tsx` | MODIFY | Remove inline builder + preview, use shared |
| `webview-ui/src/components/ConfirmDialog.tsx` | MODIFY | Add optional `commandPreview` prop |
| `webview-ui/src/components/MergeDialog.tsx` | MODIFY | Add command preview |
| `webview-ui/src/components/CherryPickDialog.tsx` | MODIFY | Add command preview |
| `webview-ui/src/components/RebaseConfirmDialog.tsx` | MODIFY | Add `targetRef` prop + command preview |
| `webview-ui/src/components/DropCommitDialog.tsx` | MODIFY | Add command preview |
| `webview-ui/src/components/CheckoutWithPullDialog.tsx` | MODIFY | Add command preview |
| `webview-ui/src/components/TagCreationDialog.tsx` | MODIFY | Add command preview |
| `webview-ui/src/components/CommitContextMenu.tsx` | MODIFY | Pass commandPreview + targetRef to dialogs |
| `webview-ui/src/components/BranchContextMenu.tsx` | MODIFY | Pass targetRef to RebaseConfirmDialog |

## Validation

```bash
pnpm typecheck    # Zero TypeScript errors
pnpm lint         # Zero ESLint warnings
pnpm test         # New gitCommandBuilder tests pass, existing tests unaffected
pnpm build        # Clean build
```

Manual smoke test: Open each dialog via the extension, verify command preview appears, updates reactively with option changes, and Copy button works.
