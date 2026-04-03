# Implementation Plan: v2.0 UI Reorganization — Control Bar & Toggle Panel

**Branch**: `030-v2` | **Date**: 2026-04-02 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/030-v2/spec.md`

## Summary

Reorganize the VS Code extension's webview UI: convert control bar text buttons to icon-only buttons with tooltips, introduce a `TogglePanel` component in `GraphContainer` that hosts the existing `SearchWidget` plus new `FilterWidget` and `CompareWidget` placeholders (one visible at a time), and add a three-state color model for the Filter/Search/Compare toggle buttons. All changes are webview-only; no backend or message contract changes required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)  
**Primary Dependencies**: React 18, Zustand, Tailwind CSS, VS Code Extension API (webview)  
**Storage**: N/A — all state is in-memory Zustand; no persistence for TogglePanel state  
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; `pnpm typecheck`; `pnpm lint`; `pnpm build`  
**Target Platform**: VS Code Extension Webview (sandboxed browser context)  
**Project Type**: VS Code Extension — desktop app webview  
**Performance Goals**: Instant show/hide (no animation); no additional render cost at rest  
**Constraints**: No new npm packages; must pass full typecheck + lint + build  
**Scale/Scope**: Single-window UI widget reorganization — no data volume concerns

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | ✅ Pass | TogglePanel is instant show/hide (no animation). No new subscriptions added at rest. |
| II. Clean Code & Simplicity | ✅ Pass | Single `TogglePanel` component replaces ad-hoc SearchWidget wrapper. DRY color constants shared across toggle buttons. |
| III. Type Safety | ✅ Pass | `ActiveToggleWidget` type added to `shared/types.ts`. All new store actions typed. |
| IV. Library-First | ✅ Pass | No new packages. Reuses existing custom SVG icon pattern. |
| V. Dual-Process Integrity | ✅ Pass | All changes are in `webview-ui/`. No new message types, no backend changes. |

**Gate result**: PASS — proceed.

## Project Structure

### Documentation (this feature)

```text
specs/030-v2/
├── plan.md          ✅ this file
├── research.md      ✅ Phase 0 output
├── data-model.md    ✅ Phase 1 output
└── tasks.md         (Phase 2 — /speckit.tasks)
```

### Source Code (affected files)

```text
shared/
└── types.ts                                    # Add ActiveToggleWidget type

webview-ui/src/
├── stores/
│   └── graphStore.ts                           # Add activeToggleWidget + setActiveToggleWidget; sync openSearch/closeSearch
├── components/
│   ├── icons/
│   │   └── index.tsx                           # Add FilterIcon, CompareIcon; replace ⚙ with SettingsIcon SVG
│   ├── ControlBar.tsx                          # Icon-only buttons, toggle state colors, tooltips, Filter+Compare buttons
│   ├── GraphContainer.tsx                      # Remove SearchWidget wrapper → add <TogglePanel />
│   ├── TogglePanel.tsx                         # NEW — renders active widget (search/filter/compare/null)
│   ├── FilterWidget.tsx                        # NEW — placeholder
│   └── CompareWidget.tsx                       # NEW — placeholder
└── App.tsx                                     # Update keyboard handler to use setActiveToggleWidget
```

**Structure Decision**: Webview-only, single frontend project. All new files in `webview-ui/src/components/`. Shared type in `shared/types.ts` per existing conventions.

## Phase 0: Research

See [research.md](research.md) for full findings. Key decisions:

1. **SearchWidget integration**: No internal changes to SearchWidget. TogglePanel mounts it when `activeToggleWidget === 'search'`; existing `searchState.isOpen` stays in sync via updated store actions.
2. **Store shape**: Add `activeToggleWidget: ActiveToggleWidget` field. Update `openSearch`/`closeSearch` to sync it. Add `setActiveToggleWidget` action for Filter/Compare/null.
3. **Icon buttons**: Extend existing custom SVG pattern in `icons/index.tsx`. Use `title` attribute for tooltips.
4. **Color tokens**: `TOGGLE_BUTTON_COLORS` constant (inactive/active/filtered) shared across all toggle buttons; VS Code CSS vars adapt to all themes.
5. **Height**: Natural flex content height — no explicit sizing or animation.
6. **Keyboard shortcuts**: `Cmd/Ctrl+F` in `App.tsx` updated to use `setActiveToggleWidget('search')`.

## Phase 1: Design & Contracts

### Interface Contracts

No new message contracts. This feature is purely webview-side. The existing webview↔extension message protocol (`shared/messages.ts`) is unchanged.

### Component Interaction Diagram

```text
App.tsx
│  keydown: Ctrl+F → setActiveToggleWidget('search')
│  keydown: Escape → setActiveToggleWidget(null)  [when search open]
│
├── ControlBar.tsx
│   ├── [Filter icon btn]   onClick → setActiveToggleWidget('filter'|null)
│   ├── [Search icon btn]   onClick → setActiveToggleWidget('search'|null)
│   ├── [Refresh icon btn]  onClick → rpcClient.refresh()
│   ├── [Fetch icon btn]    onClick → rpcClient.fetch()
│   ├── [Compare icon btn]  onClick → setActiveToggleWidget('compare'|null)
│   ├── [Remotes icon btn]  onClick → openRemoteDialog()
│   └── [Settings icon btn] onClick → rpcClient.openSettings()
│
└── GraphContainer.tsx
    ├── CherryPickConflictBanner
    ├── RebaseConflictBanner
    ├── SubmoduleBreadcrumb
    ├── TogglePanel (NEW — reads activeToggleWidget from store)
    │   ├── <FilterWidget />   when activeToggleWidget === 'filter'
    │   ├── <SearchWidget />   when activeToggleWidget === 'search'
    │   └── <CompareWidget />  when activeToggleWidget === 'compare'
    ├── SubmoduleSection
    └── virtual scroll list
```

### Toggle Button State Logic

```text
Filter button color:
  activeToggleWidget === 'filter'              → TOGGLE_BUTTON_COLORS.active
  activeToggleWidget !== 'filter' && hasFilter → TOGGLE_BUTTON_COLORS.filtered
  otherwise                                   → TOGGLE_BUTTON_COLORS.inactive

Search button color:
  activeToggleWidget === 'search'             → TOGGLE_BUTTON_COLORS.active
  otherwise                                  → TOGGLE_BUTTON_COLORS.inactive

Compare button color:
  activeToggleWidget === 'compare'            → TOGGLE_BUTTON_COLORS.active
  otherwise                                  → TOGGLE_BUTTON_COLORS.inactive
```

### `TOGGLE_BUTTON_COLORS` — Implementation Note

```typescript
// webview-ui/src/components/ControlBar.tsx (or a co-located constants file)
const TOGGLE_BUTTON_COLORS = {
  inactive: 'opacity-60 hover:opacity-100',
  active:   'text-[var(--vscode-statusBarItem-warningForeground)] bg-[var(--vscode-statusBarItem-warningBackground)] opacity-100',
  filtered: 'text-[var(--vscode-inputValidation-warningForeground)] bg-[var(--vscode-inputValidation-warningBackground)] opacity-100',
} as const;
```
Exact CSS vars to be validated against VS Code theme API during implementation.

### Store Addition (pseudo-code for implementer)

```typescript
// In graphStore state:
activeToggleWidget: null as ActiveToggleWidget,

// New action:
setActiveToggleWidget: (widget) => set((state) => {
  const next = state.activeToggleWidget === widget ? null : widget; // toggle off if same
  const newSearchOpen = next === 'search';
  return {
    activeToggleWidget: next,
    searchState: { ...state.searchState, isOpen: newSearchOpen, query: newSearchOpen ? state.searchState.query : '' },
  };
}),

// Update openSearch to sync:
openSearch: () => set((state) => ({
  activeToggleWidget: 'search',
  searchState: { ...state.searchState, isOpen: true },
})),

// Update closeSearch to sync:
closeSearch: () => set((state) => ({
  activeToggleWidget: state.activeToggleWidget === 'search' ? null : state.activeToggleWidget,
  searchState: { isOpen: false, query: '', matchIndices: [], currentMatchIndex: -1 },
})),
```

## Complexity Tracking

No constitution violations. No complexity justification needed.
