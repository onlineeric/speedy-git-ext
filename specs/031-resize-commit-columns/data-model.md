# Data Model: Resizable Commit Columns

**Date**: 2026-04-03

## Shared Persistent Types

### `CommitListMode`

**Location**: `shared/types.ts`

```typescript
export type CommitListMode = 'classic' | 'table';
```

**Semantics**:
- `'classic'` keeps the current flex row rendering unchanged.
- `'table'` enables the customizable table-style header and rows.

### `CommitTableColumnId`

**Location**: `shared/types.ts`

```typescript
export type CommitTableColumnId =
  | 'graph'
  | 'hash'
  | 'refs'
  | 'message'
  | 'author'
  | 'date';
```

### `CommitTableColumnPreference`

**Location**: `shared/types.ts`

```typescript
export interface CommitTableColumnPreference {
  visible: boolean;
  preferredWidth: number;
}
```

**Notes**:
- `preferredWidth` is the user-controlled width that should be restored when space becomes available again.
- Width minimums remain implementation constants in the webview layout helper; they are not user-editable.

### `CommitTableLayout`

**Location**: `shared/types.ts`

```typescript
export interface CommitTableLayout {
  order: CommitTableColumnId[];
  columns: Record<CommitTableColumnId, CommitTableColumnPreference>;
}
```

**Invariants**:
- `order[0]` is always `'graph'`.
- `columns.graph.visible` is always `true`.
- Hidden optional columns stay in `order`, which preserves their last saved position for later restore.

## Persisted UI State Changes

### `PersistedUIState`

**Location**: `shared/types.ts`

Add:

```typescript
commitListMode: CommitListMode;
commitTableLayout: CommitTableLayout;
```

**Default state**:

| Field | Default |
|-------|---------|
| `commitListMode` | `'classic'` |
| `commitTableLayout.order` | `['graph', 'hash', 'refs', 'message', 'author', 'date']` |
| `graph.preferredWidth` | `120` |
| `hash.preferredWidth` | `72` |
| `refs.preferredWidth` | `220` |
| `message.preferredWidth` | `320` |
| `author.preferredWidth` | `160` |
| `date.preferredWidth` | `120` |
| optional column visibility | all visible by default |

## Frontend-Derived View Models

### `ResolvedCommitTableColumn`

**Location**: `webview-ui/src/utils/commitTableLayout.ts`

Derived per render from:
- persisted layout
- current topology-derived graph width
- available container width

Expected fields:

| Field | Description |
|-------|-------------|
| `id` | Column identifier |
| `visible` | Whether the column renders in the current table |
| `preferredWidth` | Saved width from persisted layout |
| `effectiveWidth` | Rendered width after responsive fitting logic |
| `minWidth` | Fixed implementation constraint |

### `ResolvedCommitTableLayout`

**Location**: `webview-ui/src/utils/commitTableLayout.ts`

Derived bundle shared by header and rows:

| Field | Description |
|-------|-------------|
| `columns` | Visible columns in render order |
| `gridTemplateColumns` | CSS grid template string used by header and rows |
| `tableWidth` | Sum of effective widths used as the rendered table width |
| `minimumTableWidth` | Width at which the message column can no longer shrink |

## Local Interaction State

### Resize Session

**Location**: `webview-ui/src/components/CommitTableHeader.tsx`

Non-persistent local state while dragging a resize handle:

| Field | Description |
|-------|-------------|
| target column id | Which header divider is active |
| start pointer x | Pointer position at drag start |
| start preferred width | Width used as the resize baseline |

### Column Settings Popover State

**Location**: `webview-ui/src/components/CommitListSettingsPopover.tsx`

Local UI state only:

| Field | Description |
|-------|-------------|
| popover open/closed | Whether the settings popover is visible |
| active drag item | Temporary sortable-list state during reorder |

## State Transition Rules

| Action | Result |
|--------|--------|
| Switch to table mode | `commitListMode = 'table'`; current `commitTableLayout` is reused |
| Resize non-message column | Update that column's `preferredWidth`; message column recomputes effective width as space allows |
| Resize message column | Update `message.preferredWidth`; later viewport growth restores toward that saved value |
| Hide optional column | Set `visible = false`; keep its `preferredWidth` and position in `order` |
| Show optional column | Set `visible = true`; restore at saved `order` position with saved `preferredWidth` |
| Reorder optional columns | Update `order`; `'graph'` remains first |
| Narrow container | Message column shrinks first to its minimum; after minimum table width is reached, table width stops shrinking |

