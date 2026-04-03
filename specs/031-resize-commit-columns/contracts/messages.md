# Message Contracts: Resizable Commit Columns

This feature reuses the existing persisted UI state message names. No new message types are required.

## Existing Response: `persistedUIState` (Extension Host -> Webview)

Sent during webview initialization before the main commit payload so the webview can hydrate mode and column layout before rendering. The `commitTableLayout` field is populated from per-repo storage (keyed by the active repository path), while all other fields come from global storage.

```typescript
{
  type: 'persistedUIState';
  payload: {
    uiState: PersistedUIState;
  };
}
```

### Expanded `PersistedUIState` payload

```typescript
interface PersistedUIState {
  version: number;
  detailsPanelPosition: 'bottom' | 'right';
  fileViewMode: 'list' | 'tree';
  bottomPanelHeight: number;
  rightPanelWidth: number;
  commitListMode: 'classic' | 'table';
  commitTableLayout: {
    order: Array<'graph' | 'hash' | 'message' | 'author' | 'date'>;
    columns: Record<
      'graph' | 'hash' | 'message' | 'author' | 'date',
      {
        visible: boolean;
        preferredWidth: number;
      }
    >;
  };
}
```

**Storage split**:
- `commitListMode` is stored in the global `PersistedUIState` (applies across all repos).
- `commitTableLayout` is stored per repository using the key pattern `speedyGit.repoTableLayout.<sha256-hash-of-repo-path>`.
- Both are combined into the same `PersistedUIState` payload sent to the webview, so the frontend code remains unchanged.

## Existing Request: `updatePersistedUIState` (Webview -> Extension Host)

Sent whenever the user changes mode, width, order, or visibility. The payload remains partial and only includes the changed fields.

```typescript
{
  type: 'updatePersistedUIState';
  payload: {
    uiState: Partial<Omit<PersistedUIState, 'version'>>;
  };
}
```

**Backend routing**:
- If the partial includes `commitListMode`, it is saved to the global UI state.
- If the partial includes `commitTableLayout`, it is saved to the per-repo storage for the currently active repository.
- Other fields continue to be saved to global UI state.

## Validation Expectations in `WebviewProvider`

- Invalid `commitListMode` values fall back to `'table'` (new default).
- Invalid or incomplete `commitTableLayout.order` values fall back to the default full order (`['graph', 'hash', 'message', 'author', 'date']`). Saved layouts from older versions that include `'refs'` will fail validation and fall back to defaults.
- `columns.graph.visible` is always coerced to `true`.
- Any invalid `preferredWidth` falls back to that column's default width.
- Missing optional column entries are restored from defaults instead of discarding the whole saved layout.
- Per-repo layout loading: if no saved layout exists for the current repo, defaults are used.

## No Other Contract Changes

- `shared/messages.ts` keeps the same request and response names.
- Commit fetching, selection, search, and context-menu messages are unchanged.
- The commit-list settings popover open state is local to the webview and is not part of any persisted or cross-boundary payload.
- The toolbar separator rendering change is purely visual and does not affect message contracts.
