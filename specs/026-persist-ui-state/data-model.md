# Data Model: Persist UI State

## Entities

### PersistedUIState

Represents the user's saved commit details panel preferences, stored as a single versioned object in VS Code's `globalState`.

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| `version` | `number` | `1` | Must be a positive integer |
| `detailsPanelPosition` | `'bottom' \| 'right'` | `'bottom'` | Must be one of the two literal values |
| `fileViewMode` | `'list' \| 'tree'` | `'list'` | Must be one of the two literal values |
| `bottomPanelHeight` | `number` | `280` | Must be >= MIN_SIZE (120) |
| `rightPanelWidth` | `number` | `400` | Must be >= MIN_SIZE (120) |

**Storage key**: `speedyGit.uiState`

**Lifecycle**:
1. **Created**: On first access when no stored state exists — defaults are written.
2. **Read**: On webview initialization — extension host reads from `globalState` and sends to webview.
3. **Updated**: On each user action that changes a persisted field — webview sends update to extension host, which writes to `globalState`.
4. **Migrated**: When `version` doesn't match expected version — fall back to defaults and overwrite.

### Relationship to Existing Types

- `DetailsPanelPosition` (`shared/types.ts`): Already defined as `'bottom' | 'right'`. Reused directly.
- `FileViewMode` (`shared/types.ts`): Already defined as `'list' | 'tree'`. Reused directly.
- `GraphStore` (`graphStore.ts`): Already contains `detailsPanelPosition` and `fileViewMode`. Will add `bottomPanelHeight` and `rightPanelWidth` fields and corresponding setters.

## Validation Rules

1. If stored object is missing or not an object → use all defaults.
2. If `version` doesn't match current version → use all defaults, overwrite stored state.
3. For each field: if value is missing or fails type/range check → use that field's default (partial fallback).
4. Size values below `MIN_SIZE` (120px) → clamp to `MIN_SIZE`.

## State Flow

```
globalState (extension host)
    ↓ read on init
WebviewProvider.sendInitialData()
    ↓ 'persistedUIState' message
rpcClient.handleMessage()
    ↓ hydrate
Zustand store (detailsPanelPosition, fileViewMode, bottomPanelHeight, rightPanelWidth)
    ↓ user changes
rpcClient.send('updatePersistedUIState')
    ↓ message
WebviewProvider.handleMessage()
    ↓ write
globalState (extension host)
```
