# Quickstart: Branch Checkout & Delete Dialog Improvements

## Prerequisites

- Node.js 18+, pnpm installed
- VS Code with extension development support

## Build & Run

```bash
pnpm build          # Build extension + webview
# Then in VS Code: F5 or "Run Extension" launch config
```

## Validation

```bash
pnpm typecheck      # Must pass with zero errors
pnpm lint           # Must pass with zero errors
pnpm build          # Must succeed for both extension and webview
```

## Smoke Test Scenarios

### Stories 1 & 2: Checkout Pull Dialog Verification

1. Open a repo with local branches that have remote counterparts at different commits
2. Right-click a local branch badge → "Checkout" → pull dialog should appear
3. Right-click a remote branch badge (where local exists at different commit) → "Checkout" → pull dialog should appear
4. Right-click a local-only branch (no remote) → should checkout directly (no dialog)
5. Right-click a remote-only branch (no local) → should create tracking branch directly (no dialog)

### Story 3: Delete Branch with Remote Option

1. Right-click a local branch that has a remote counterpart → "Delete Branch"
   - Dialog should show "Also delete remote branch" checkbox (unchecked)
   - Command preview: `git branch -d <name>`
2. Check the checkbox → command preview should update to include `git push origin --delete <name>`
3. Uncheck → preview returns to local-only delete
4. Confirm with checkbox checked → both branches deleted
5. Confirm with checkbox unchecked → only local branch deleted
6. Test with a branch that's NOT fully merged:
   - Delete → force-delete dialog appears with remote-delete checkbox preserved
7. Test with a local-only branch → no checkbox should appear

## Files Changed

| File | Change |
|------|--------|
| `shared/messages.ts` | Extend deleteBranch payload with `deleteRemote` option |
| `src/WebviewProvider.ts` | Handle `deleteRemote` in deleteBranch handler |
| `webview-ui/src/components/DeleteBranchDialog.tsx` | **NEW** — delete dialog with remote-delete checkbox |
| `webview-ui/src/components/BranchContextMenu.tsx` | Wire up DeleteBranchDialog, verify checkout logic |
| `webview-ui/src/rpc/rpcClient.ts` | Update deleteBranch method signature |
| `webview-ui/src/stores/graphStore.ts` | Extend pendingForceDeleteBranch type |
| `webview-ui/src/utils/gitCommandBuilder.ts` | Add combined delete command builder |
