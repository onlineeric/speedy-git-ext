# Quickstart: Push Branch Dialog

**Feature Branch**: `020-push-branch-dialog`
**Date**: 2026-03-24

## What This Feature Does

Replaces the direct "Push Branch" context menu action with a dialog that lets developers configure push parameters (set-upstream, force mode, remote selection) and preview the exact git command before executing. Includes a copy button for developers who prefer to run the command manually.

## Files to Create

| File | Purpose |
|------|---------|
| `webview-ui/src/components/PushDialog.tsx` | Push dialog component with options, command preview, and copy button |

## Files to Modify

| File | Change |
|------|--------|
| `shared/types.ts` | Add `PushForceMode` type |
| `shared/messages.ts` | Update `push` payload: `force?: boolean` → `forceMode?: PushForceMode`, make `remote`/`branch` required |
| `src/services/GitRemoteService.ts` | Update `push()` signature and force mode handling |
| `src/WebviewProvider.ts` | Update push handler to pass `forceMode` |
| `webview-ui/src/rpc/rpcClient.ts` | Update `push()` signature, add `pushAsync()` method |
| `webview-ui/src/components/BranchContextMenu.tsx` | Replace direct `rpcClient.push()` call with dialog open state |

## Key Design Decisions

1. **Dialog pattern**: Follows `MergeDialog` — Radix UI dialog, local `useState`, callbacks
2. **Force mode**: `PushForceMode` string literal union replaces `force: boolean` to support 3 modes
3. **Async push**: New `pushAsync()` on rpcClient returns a promise so the dialog can await completion
4. **Remote data**: Reads from existing `remotes` in graphStore — no new backend calls
5. **Command preview**: Pure function that builds command string from current options — no side effects

## Build & Validate

```bash
pnpm typecheck    # Zero TypeScript errors
pnpm lint         # Zero ESLint errors
pnpm build        # Clean build
# Then manual smoke test via VS Code "Run Extension"
```
