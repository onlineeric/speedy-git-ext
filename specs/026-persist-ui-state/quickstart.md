# Quickstart: Persist UI State

## What This Feature Does

Persists the commit details panel's UI preferences (position, file view mode, panel sizes) across panel close/reopen and VS Code reload. Uses VS Code's `globalState` for storage and hydrates the Zustand store on webview startup.

## Key Files to Modify

| File | Change |
|------|--------|
| `shared/types.ts` | Add `PersistedUIState` interface |
| `shared/messages.ts` | Add `persistedUIState` response and `updatePersistedUIState` request types |
| `src/WebviewProvider.ts` | Read/write `globalState`, send persisted state on init, handle update requests |
| `webview-ui/src/stores/graphStore.ts` | Add `bottomPanelHeight`, `rightPanelWidth` fields + setters, add hydration action |
| `webview-ui/src/rpc/rpcClient.ts` | Handle `persistedUIState` response, send `updatePersistedUIState` on changes |
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Read sizes from store instead of local state, persist on resize end |

## Architecture Summary

```
Extension Host                    Webview
┌─────────────────┐              ┌──────────────────┐
│ globalState      │──read──→    │ persistedUIState  │──hydrate──→ Zustand store
│ (persistent)     │             │ (init message)    │
│                  │←──write──   │ updatePersisted   │←──on change── UI actions
│                  │             │ UIState (request)  │
└─────────────────┘              └──────────────────┘
```

## Validation & Defaults

- All persisted values are validated on load
- Invalid/missing values fall back to defaults: `{ position: 'bottom', fileViewMode: 'list', bottomPanelHeight: 280, rightPanelWidth: 400 }`
- Version field enables future schema migrations

## Build & Test

```bash
pnpm typecheck    # Verify types
pnpm lint         # Check linting
pnpm build        # Full build
# Then manual smoke test via "Run Extension" launch config
```
