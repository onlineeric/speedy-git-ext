# Data Model: Resizable Commit Columns

**Date**: 2026-04-04

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
  | 'message'
  | 'author'
  | 'date';
```

**Note**: Refs are not a separate column. Ref badges render inline within the message column, matching the classic view layout.

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
- Ref badges render inline in the message column (matching classic view) and are not a separate column.

## Persisted UI State Changes

### `PersistedUIState` (Global)

**Location**: `shared/types.ts`

The global persisted UI state includes the view mode but **not** the column table layout:

```typescript
commitListMode: CommitListMode;
```

**Default state**:

| Field | Default |
|-------|---------|
| `commitListMode` | `'table'` |

### Per-Repository Column Layout

**Location**: `src/WebviewProvider.ts` (storage), `shared/types.ts` (types)

Column layout preferences are stored per repository using a repo-path-keyed `globalState` entry. This allows different repos to have different column configurations suited to their graph density, author name lengths, and branch naming conventions.

**Storage key pattern**: `speedyGit.repoTableLayout.<sha256-hash-of-repo-path>`

Uses SHA-256 hash of the repo path to avoid issues with special characters in file paths as globalState keys.

**Default state** (per repo, when no saved layout exists):

| Field | Default |
|-------|---------|
| `commitTableLayout.order` | `['graph', 'hash', 'message', 'author', 'date']` |
| `graph.preferredWidth` | `120` |
| `hash.preferredWidth` | `72` |
| `message.preferredWidth` | `400` |
| `author.preferredWidth` | `160` |
| `date.preferredWidth` | `120` |
| optional column visibility | all visible by default |

### Migration

When upgrading from a version that stored `commitTableLayout` in the global `PersistedUIState`:
- The global `commitListMode` defaults to `'table'` (new default for upgraded users).
- The previously global `commitTableLayout` is ignored; each repo starts fresh with defaults until the user customizes it.

## Frontend-Derived View Models

### `ResolvedCommitTableColumn`

**Location**: `webview-ui/src/utils/commitTableLayout.ts`

Derived per render from:
- persisted layout
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
| popover open/closed | Whether the settings popover is visible; this state is independent from the exclusive filter/search/compare toggle state |
| active drag item | Temporary sortable-list state during reorder |

## State Transition Rules

| Action | Result |
|--------|--------|
| Switch to table mode | `commitListMode = 'table'` (global); current repo's `commitTableLayout` is reused |
| Switch to classic mode | `commitListMode = 'classic'` (global); column config controls become disabled |
| Open settings popover | Local popover state becomes open; filter, search, and compare panel state remain unchanged |
| Close settings popover | Local popover state becomes closed; filter, search, and compare panel state remain unchanged |
| Resize non-message column | Update that column's `preferredWidth` in per-repo layout; message column recomputes effective width as space allows |
| Resize message column | Update `message.preferredWidth` in per-repo layout; later viewport growth restores toward that saved value |
| Hide optional column | Set `visible = false` in per-repo layout; keep its `preferredWidth` and position in `order` |
| Show optional column | Set `visible = true` in per-repo layout; restore at saved `order` position with saved `preferredWidth` |
| Reorder optional columns | Update `order` in per-repo layout; `'graph'` remains first |
| Switch repository | Load the target repo's saved `commitTableLayout` (or defaults); `commitListMode` stays unchanged (global) |
| Open or close filter/search/compare panel | `activeToggleWidget` changes among the exclusive toggle panels or clears; settings popover state remains unchanged |
| Narrow container | Message column shrinks first to its minimum; after minimum table width is reached, table width stops shrinking |
| Narrow graph column below topology width | Graph content clips naturally; minimum width is independent of topology |
| Double-click resize handle | Compute auto-fit width via `canvas.measureText()` across all commits; update that column's `preferredWidth` in per-repo layout; persist immediately |
