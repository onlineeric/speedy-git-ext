# Data Model: 030-v2 — v2.0 UI Reorganization

All changes are in-memory Zustand state. No backend/persistence changes.

## New Type: `ActiveToggleWidget`

**Location**: `shared/types.ts`

```typescript
export type ActiveToggleWidget = 'search' | 'filter' | 'compare' | null;
```

**Semantics**:
- `'search'` — SearchWidget is visible in TogglePanel
- `'filter'` — FilterWidget placeholder is visible in TogglePanel
- `'compare'` — CompareWidget placeholder is visible in TogglePanel
- `null` — TogglePanel is collapsed (nothing visible)

**Invariant**: Only one value can be active at a time (enforced in store actions).

---

## Store Changes: `graphStore.ts`

### New State Field

| Field | Type | Initial value | Description |
|-------|------|---------------|-------------|
| `activeToggleWidget` | `ActiveToggleWidget` | `null` | Which toggle panel widget is currently shown |

### New Action

| Action | Signature | Behavior |
|--------|-----------|----------|
| `setActiveToggleWidget` | `(widget: ActiveToggleWidget) => void` | Sets `activeToggleWidget`; if `widget === 'search'` also calls `openSearch()`; if switching away from `'search'` also calls `closeSearch()` |

### Modified Actions

| Action | Change |
|--------|--------|
| `openSearch()` | Additionally sets `activeToggleWidget = 'search'` |
| `closeSearch()` | Additionally sets `activeToggleWidget = null` when current value is `'search'` |

### Invariants Preserved

- `searchState.isOpen === (activeToggleWidget === 'search')` — always true after any action
- `activeToggleWidget` can only hold one non-null value (mutual exclusion enforced by setter)

---

## New Component Contracts

### `TogglePanel`

| Aspect | Detail |
|--------|--------|
| Props | None — reads `activeToggleWidget` from Zustand store directly |
| Renders | `<SearchWidget />` when `'search'`, `<FilterWidget />` when `'filter'`, `<CompareWidget />` when `'compare'`, `null` when `null` |
| Height | Natural content height (no explicit sizing) |
| Animation | None — instant mount/unmount |

### `FilterWidget` (placeholder)

| Aspect | Detail |
|--------|--------|
| Props | None |
| Renders | A container div with a "Filter" label identifying the panel |
| State | None |

### `CompareWidget` (placeholder)

| Aspect | Detail |
|--------|--------|
| Props | None |
| Renders | A container div with a "Compare" label identifying the panel |
| State | None |

---

## Toggle Button State Model

### `ToggleButtonState` (conceptual, not a runtime type)

Drives the CSS class applied to each toggle icon button:

| State | Condition | Visual |
|-------|-----------|--------|
| `active` | `activeToggleWidget === thisWidget` | Orange/yellow color |
| `filtered` | Filter button only: `activeToggleWidget !== 'filter'` AND filters are applied | Purple/red color |
| `inactive` | All other cases | Muted gray |

### Color Constants

Defined in `webview-ui/src/components/ControlBar.tsx` (or a shared `toggleButtonColors.ts` utility):

```typescript
const TOGGLE_BUTTON_COLORS = {
  inactive: /* muted/gray via VSCode CSS var */,
  active:   /* orange/yellow via VSCode CSS var */,
  filtered: /* purple/red via VSCode CSS var — Filter button only */,
} as const;
```

All three toggle buttons (Filter, Search, Compare) use the same `inactive` and `active` color values from this constant.
