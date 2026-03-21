# Message Contracts: 018-commit-files-enhancements

**Date**: 2026-03-20

## New Messages

### Request: `openCurrentFile`

Opens the current working tree version of a file in an editable editor.

```typescript
{
  type: 'openCurrentFile';
  payload: {
    filePath: string;  // Relative file path from repository root
  };
}
```

**Response**: None (fire-and-forget, matches `openDiff` and `openFile` patterns).

**Backend handler**: Constructs file URI from workspace root + `filePath`, opens via `vscode.workspace.openTextDocument()` + `vscode.window.showTextDocument()`.

**Error handling**: If file does not exist, shows VS Code warning notification (matches existing `openFileAtRevision` error pattern).

## Existing Messages (Reused, No Changes)

| Message | Used For |
|---------|----------|
| `copyToClipboard` | Copy relative file path action |
| `openFile` | Open file at commit version |
| `openDiff` | File name click (existing behavior) |

## Type Guard

Add to `shared/messages.ts` alongside existing type guards:

```typescript
// Add 'openCurrentFile' to the RequestMessage type union
```
