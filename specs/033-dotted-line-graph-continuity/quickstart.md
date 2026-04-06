# Quickstart: Dotted-Line Graph Continuity

**Feature Branch**: `033-dotted-line-graph-continuity`  
**Date**: 2026-04-05

## Overview

This feature adds visual continuity to the git graph when filters hide intermediate commits. Dotted lines connect visible commits through hidden gaps, preserving the sense of branch continuity.

## Architecture Summary

**Two-tier filtering model**:
1. **Structural filters** (server-side): Branch selection, date range — git preserves parent chains naturally
2. **Visibility filters** (client-side): Author filter — frontend hides commits while keeping full ancestry for topology computation

**Data flow change**:
```
Before:  Backend (--author filter) → filtered commits → topology → render
After:   Backend (no --author) → all commits → topology(hiddenHashes) → render visible only
```

## Key Files to Modify

| File | Role | Change Summary |
|------|------|----------------|
| `src/services/GitLogService.ts` | Git log arg builder | Remove `--author` args from git log |
| `webview-ui/src/stores/graphStore.ts` | State management | Add `hiddenCommitHashes`, `computeHiddenCommitHashes()`, auto-retry state; existing `commits` holds all loaded data |
| `webview-ui/src/utils/graphTopology.ts` | Graph algorithm | Accept `hiddenHashes`, skip hidden nodes, create dotted skip connections, mark dotted passing lanes |
| `webview-ui/src/components/GraphCell.tsx` | SVG rendering | Render `strokeDasharray` for dotted connections/lanes, add `<title>` tooltip |
| `webview-ui/src/components/FilterWidget.tsx` | Filter UI | Remove `rpcClient.getCommits()` on author toggle; local recompute only |
| `webview-ui/src/components/GraphContainer.tsx` | Scroll/prefetch | Adapt prefetch trigger for visible-row positions; render gap indicator |
| `webview-ui/src/rpc/rpcClient.ts` | RPC layer | Update `firePrefetch()` to exclude author from git args; handle auto-retry |
| `shared/types.ts` | Shared types | No changes needed (existing types sufficient) |

## Build & Test

```bash
pnpm build              # Build extension + webview
pnpm typecheck          # Verify no type errors
pnpm lint               # Verify no lint errors
```

Manual smoke test via VS Code "Run Extension" launch config:
1. Open a repo with multiple authors
2. Apply author filter to exclude some authors
3. Verify dotted lines appear between visible commits
4. Toggle filter on/off — verify instant update, no loading indicator
5. Scroll to bottom with filter active — verify prefetch and gap indicator behavior
