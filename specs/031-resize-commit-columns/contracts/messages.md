# Message Contracts: Resizable Commit Columns

This feature reuses the existing persisted UI state message names. No new message types are required.

## Existing Response: `persistedUIState` (Extension Host -> Webview)

Sent during webview initialization before the main commit payload so the webview can hydrate mode and column layout before rendering.

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
    order: Array<'graph' | 'hash' | 'refs' | 'message' | 'author' | 'date'>;
    columns: Record<
      'graph' | 'hash' | 'refs' | 'message' | 'author' | 'date',
      {
        visible: boolean;
        preferredWidth: number;
      }
    >;
  };
}
```

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

## Validation Expectations in `WebviewProvider`

- Invalid `commitListMode` values fall back to `'classic'`.
- Invalid or incomplete `commitTableLayout.order` values fall back to the default full order.
- `columns.graph.visible` is always coerced to `true`.
- Any invalid `preferredWidth` falls back to that column's default width.
- Missing optional column entries are restored from defaults instead of discarding the whole saved layout.

## No Other Contract Changes

- `shared/messages.ts` keeps the same request and response names.
- Commit fetching, selection, search, and context-menu messages are unchanged.
