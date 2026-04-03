# Research: 030-v2 — v2.0 UI Reorganization

## 1. SearchWidget Integration Strategy

**Decision**: Move `SearchWidget` from its dedicated container in `GraphContainer` into the new `TogglePanel`, reusing it without any internal changes.

**Finding**: `SearchWidget` has no props — it is entirely store-driven via `searchState` from the Zustand store. It renders conditionally: when `searchState.isOpen === true` it shows; otherwise it returns `null`. The widget's own "Close" button calls `closeSearch()` from the store.

**Integration approach**: The TogglePanel will render `<SearchWidget />` when the active toggle is `'search'`. The TogglePanel does NOT conditionally unmount SearchWidget based on `isOpen` itself — instead it mounts SearchWidget when the toggle is `'search'`, and SearchWidget's own `searchState.isOpen` check handles its visibility. To keep the two in sync, `openSearch()` and `closeSearch()` in the store will be updated to also update `activeToggleWidget`.

**Rationale**: Zero changes to SearchWidget internals. The Close button inside SearchWidget already calls `closeSearch()`, which will be wired to clear `activeToggleWidget`, keeping both in sync automatically.

**Alternatives considered**:
- Adding props to SearchWidget to control rendering → rejected (breaks single-source-of-truth, adds prop drilling)
- Managing open/close purely from TogglePanel without touching store → rejected (Close button inside SearchWidget would go out of sync)

---

## 2. Zustand Store: `activeToggleWidget` State

**Decision**: Add a single `activeToggleWidget: 'search' | 'filter' | 'compare' | null` field to the Zustand store.

**Finding**: The store currently uses `searchState.isOpen: boolean` to gate SearchWidget rendering. A separate `activeToggleWidget` field covers all three toggle panels with a single field, and cross-cutting concerns (mutually exclusive panels) are handled in one place.

**Store changes**:
- Add `activeToggleWidget: ActiveToggleWidget` (initial value: `null`)
- Add `setActiveToggleWidget(widget: ActiveToggleWidget): void` action
  - If `widget === 'search'`: also calls `openSearch()`
  - If `widget !== 'search'` and currently `searchState.isOpen`: also calls `closeSearch()`
- Modify `openSearch()`: also sets `activeToggleWidget = 'search'`
- Modify `closeSearch()`: also sets `activeToggleWidget = null` (only if currently `'search'`)

**Rationale**: Single field, mutual exclusion enforced in store, no ambiguous dual-state.

**Type**: `ActiveToggleWidget = 'search' | 'filter' | 'compare' | null` — add to `shared/types.ts`.

---

## 3. Icon Button Implementation

**Decision**: Reuse the existing custom SVG icon pattern (`icons/index.tsx`) for all new icon buttons. Use HTML `title` attribute for tooltips.

**Finding**: The codebase has NO Codicons dependency. All icons are custom SVG components in `webview-ui/src/components/icons/index.tsx` using `currentColor`. The settings button currently uses a literal `⚙` character (to be replaced with a proper SVG). The cloud icon already uses the SVG pattern with `aria-label`.

**New icon components needed**:
- `FilterIcon` — funnel/filter shape SVG
- `CompareIcon` — compare/diff shape SVG (or two-branch diverge shape)

**Tooltip approach**: `title` attribute on `<button>` elements. This is the VS Code webview convention and consistent with existing `aria-label` usage. No Radix Tooltip needed.

**Rationale**: `title` is zero-dependency, renders natively in the webview environment, consistent with VSCode UI feel. Radix Tooltip would add complexity without benefit here.

---

## 4. Toggle Button State Colors

**Decision**: Define three button-state color classes in a shared constant object, referenced by all toggle buttons.

**Finding**: Current buttons use inline Tailwind classes with `var(--vscode-button-*)` CSS variables. For toggle state colors, we need three named states: `inactive` (gray), `active` (yellow/orange), `filtered` (purple/red for Filter only).

**Approach**: Define a `TOGGLE_BUTTON_COLORS` constant in a shared utility file:
```typescript
const TOGGLE_BUTTON_COLORS = {
  inactive: 'text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100',
  active:   'text-[var(--vscode-statusBarItem-warningBackground)]',  // orange/yellow
  filtered: 'text-[var(--vscode-inputValidation-warningBorder)]',    // amber/orange-red
} as const;
```
All three toggle icon buttons (Filter, Search, Compare) import this same constant.

**Rationale**: Single source of truth for colors. Changing one entry updates all buttons. VSCode CSS vars adapt automatically to all themes (dark, light, high contrast).

---

## 5. TogglePanel Height Auto-Adjustment

**Decision**: TogglePanel uses natural/content height via `flex-col` layout. No explicit height set.

**Finding**: `GraphContainer` uses `flex h-full flex-col overflow-hidden`. The commit scroll container uses `flex-1 overflow-auto`. The TogglePanel sits between the banners/breadcrumb and the scroll container. By placing it as a non-flex-1 sibling, it takes its natural content height and the `flex-1` scroll container fills the rest.

**Layout structure** (unchanged flex model):
```
GraphContainer (flex-col, h-full)
├── CherryPickConflictBanner      (natural height)
├── RebaseConflictBanner          (natural height)  
├── SubmoduleBreadcrumb           (natural height)
├── TogglePanel                   (natural height — NEW, replaces SearchWidget wrapper)
├── SubmoduleSection              (natural height)
└── scroll container (flex-1)    (fills remaining space)
```

**Instant show/hide**: The TogglePanel renders its content or nothing (`null`). No CSS transition, no animation. The flex layout recalculates immediately.

**Rationale**: No changes to the layout model. Natural height with flex-1 already works for banners above the scroll list — the same pattern applies to TogglePanel.

---

## 6. Keyboard Shortcut Compatibility

**Decision**: Update `App.tsx` keyboard handler for Ctrl/Cmd+F to call `setActiveToggleWidget('search')` instead of `openSearch()` directly.

**Finding**: `App.tsx` has a `keydown` listener that calls `openSearch()` on Cmd/Ctrl+F and `closeSearch()` on Escape (when search is open). These will continue to work because the store actions now sync `activeToggleWidget`. However, for correctness, the Escape handler should call `setActiveToggleWidget(null)` (or continue using `closeSearch()` — both are equivalent after the store sync).

**Rationale**: Minimal change. The existing keyboard shortcut logic is already centralized in App.tsx.

---

## 7. Source Files Touched

| File | Change type |
|------|-------------|
| `shared/types.ts` | Add `ActiveToggleWidget` type |
| `webview-ui/src/stores/graphStore.ts` | Add `activeToggleWidget`, update `openSearch`/`closeSearch`, add `setActiveToggleWidget` |
| `webview-ui/src/components/icons/index.tsx` | Add `FilterIcon`, `CompareIcon`; replace ⚙ with `SettingsIcon` |
| `webview-ui/src/components/ControlBar.tsx` | Convert buttons to icon-only; add Filter/Compare buttons; add toggle state colors; add tooltips |
| `webview-ui/src/components/GraphContainer.tsx` | Remove SearchWidget wrapper; add `<TogglePanel />` |
| `webview-ui/src/components/TogglePanel.tsx` | New file — renders active widget |
| `webview-ui/src/components/FilterWidget.tsx` | New file — placeholder |
| `webview-ui/src/components/CompareWidget.tsx` | New file — placeholder |
| `webview-ui/src/App.tsx` | Update keyboard handlers to use `setActiveToggleWidget` |
