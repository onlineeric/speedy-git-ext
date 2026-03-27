# Quickstart: Commit Node Hover Tooltip

## Prerequisites

- Node.js 18+
- pnpm
- VS Code 1.80+

## Setup

```bash
pnpm install        # No new packages needed
pnpm build          # Build extension + webview
```

## Development

```bash
pnpm watch          # Watch mode for both extension and webview
```

Then press F5 in VS Code to launch the extension host (use "Run Extension (Watch)" config).

## Key Files to Modify

### Shared Types & Messages
1. `shared/types.ts` — Add `WorktreeInfo` and `ExternalRef` types
2. `shared/messages.ts` — Add `getWorktreeList`/`worktreeList` message types

### Backend (Extension Host)
3. `src/services/GitWorktreeService.ts` — **NEW**: Parse `git worktree list --porcelain`
4. `src/ExtensionController.ts` — Instantiate `GitWorktreeService`
5. `src/WebviewProvider.ts` — Handle `getWorktreeList` message, send worktree data on load

### Frontend (Webview)
6. `webview-ui/src/utils/externalRefParser.ts` — **NEW**: Extract PR/issue refs from commit messages
7. `webview-ui/src/components/CommitTooltip.tsx` — **NEW**: Tooltip component with Radix Popover
8. `webview-ui/src/components/GraphCell.tsx` — Add hover event handlers on SVG circle
9. `webview-ui/src/components/CommitRow.tsx` — Pass tooltip-related props
10. `webview-ui/src/components/GraphContainer.tsx` — Scroll dismiss listener, tooltip rendering
11. `webview-ui/src/stores/graphStore.ts` — Add tooltip state (hover, worktree cache, sync cache)
12. `webview-ui/src/rpc/rpcClient.ts` — Add `getWorktreeList()`, handle `worktreeList` response

## Validation

```bash
pnpm typecheck      # Must pass with zero errors
pnpm lint           # Must pass with zero errors
pnpm build          # Must build cleanly
```

Then smoke test:
1. Open extension in VS Code debug host
2. Load a git repository with branches, tags, and stashes
3. Hover over commit node circles — tooltip should appear after 200ms
4. Verify refs, sync status (loading → result), worktree info display
5. Move cursor into tooltip — should remain visible
6. Move cursor away — tooltip dismisses after 150ms
7. Scroll graph — tooltip dismisses immediately
8. Hover over commit with `#123` in message — verify clickable link
