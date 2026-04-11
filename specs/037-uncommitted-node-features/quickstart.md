# Quickstart: Uncommitted Node Features

## Prerequisites

- Node.js 18+
- pnpm installed
- VS Code or Cursor for debugging

## Setup

```bash
git checkout 037-uncommitted-node-features
pnpm install
```

## Development

```bash
pnpm watch          # Watch mode for both extension + webview
```

Then press F5 in VS Code to launch the Extension Development Host.

## Validation

```bash
pnpm typecheck      # TypeScript type checking (must pass)
pnpm lint           # ESLint (must pass)
pnpm build          # Full build (must pass)
pnpm test           # Unit tests (must pass)
```

## Key Files to Modify

### Backend (in order of implementation)

1. `shared/types.ts` — Add `FileStageState`, `ConflictState`, extend `FileChange`
2. `shared/messages.ts` — Add new request/response message types
3. `src/services/GitIndexService.ts` — **NEW** — Stage, unstage, discard operations
4. `src/services/GitDiffService.ts` — Modify to return separated staged/unstaged arrays and detect conflicts
5. `src/services/GitStashService.ts` — Add `stashWithMessage()` method
6. `src/WebviewProvider.ts` — Add RPC handlers for all new message types

### Frontend (in order of implementation)

1. `webview-ui/src/stores/graphStore.ts` — Add separated file arrays and conflict state
2. `webview-ui/src/rpc/rpcClient.ts` — Add RPC methods for new operations
3. `webview-ui/src/utils/gitCommandBuilder.ts` — Add command preview builders
4. `webview-ui/src/components/CommitDetailsPanel.tsx` — Split into staged/unstaged/conflict sections
5. `webview-ui/src/components/FileChangeShared.tsx` — Add stage/unstage/discard action icons
6. `webview-ui/src/components/UncommittedContextMenu.tsx` — Expand with full context menu
7. `webview-ui/src/components/StashDialog.tsx` — **NEW** — Stash confirmation dialog
8. `webview-ui/src/components/DiscardDialog.tsx` — **NEW** — Discard file confirmation
9. `webview-ui/src/components/DiscardAllDialog.tsx` — **NEW** — Discard all confirmation
10. `webview-ui/src/components/FilePickerDialog.tsx` — **NEW** — Multi-select file picker

## Smoke Test Checklist

1. Make changes to files, stage some via terminal
2. Open Speedy Git graph, verify uncommitted node appears
3. Click uncommitted node — verify staged/unstaged sections display separately
4. Click stage button on an unstaged file — verify it moves to staged section
5. Click unstage button on a staged file — verify it moves to unstaged section
6. Click discard button on an unstaged file — verify confirmation dialog, then file disappears
7. Right-click uncommitted node — verify full context menu appears
8. Test "Stash All Changes" from context menu — verify dialog with message input
9. Create a merge conflict, verify Merge Conflicts section appears
