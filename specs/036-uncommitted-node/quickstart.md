# Quickstart: Uncommitted Changes Node

**Feature**: 036-uncommitted-node | **Date**: 2026-04-09

## Overview

This feature adds a synthetic "Uncommitted Changes" node at the top of the git graph when the working tree has changes. It follows the existing stash-node pattern for all major concerns.

## Key Files to Understand First

1. **`webview-ui/src/stores/graphStore.ts:214-257`** — `mergeStashesIntoCommits()`: The exact blueprint. Study how stash entries become synthetic commits and get inserted into the commit array.

2. **`webview-ui/src/utils/graphTopology.ts:136-148, 301-314`** — Stash topology handling: How stashes skip parent processing in the main loop and finalize connections in a post-loop pass.

3. **`webview-ui/src/stores/graphStore.ts:40-68`** — `computeHiddenCommitHashes()`: How stashes bypass filters. The uncommitted node adds similar bypass logic.

4. **`src/services/GitDiffService.ts:140-184`** — `getUncommittedDetails()`: Already implemented. Returns `FileChange[]` with staged + unstaged + untracked files merged.

5. **`src/WebviewProvider.ts:1504-1517`** — `openDiffEditor()`: How diffs are opened. Needs modification for uncommitted file diffs (HEAD vs working directory).

## Implementation Order

1. **Types & constants** (`shared/types.ts`, `shared/messages.ts`) — Add `'uncommitted'` RefType, `UNCOMMITTED_HASH` constant, new message types.
2. **Backend handler** (`WebviewProvider.ts`) — Add `getUncommittedChanges` handler, modify `getCommitDetails` and `openDiff` for UNCOMMITTED_HASH.
3. **Store logic** (`graphStore.ts`) — Add `mergeUncommittedIntoCommits()`, integrate into `setCommits` flow, add filter bypass.
4. **Topology** (`graphTopology.ts`) — Add uncommitted node to skip-parent logic and post-loop finalization.
5. **UI components** (`CommitRow.tsx`, `CommitTableRow.tsx`, `GraphCell.tsx`) — Add visual styling for uncommitted type.
6. **Context menu** (`UncommittedContextMenu.tsx`) — New minimal component.
7. **Details panel** (`CommitDetailsPanel.tsx`) — Handle uncommitted node selection and auto-update on refresh.
8. **Diff support** — Modify `openDiffEditor()` for uncommitted files.

## Build & Test

```bash
pnpm typecheck    # Verify no TypeScript errors after type changes
pnpm lint         # ESLint compliance
pnpm build        # Full build (extension + webview)
pnpm test         # Unit tests
```

Smoke test: Open a repo with uncommitted changes → verify node appears → click it → verify details panel → click a file → verify diff opens.

## Key Constants

- `UNCOMMITTED_HASH = 'UNCOMMITTED'` — identifies the synthetic node in all layers
- Ref type: `'uncommitted'` — used for context menu routing, filter bypass, visual styling
- Subject format: `"Uncommitted Changes (3 staged, 2 modified, 1 untracked)"` — dynamic, zero-count categories omitted
