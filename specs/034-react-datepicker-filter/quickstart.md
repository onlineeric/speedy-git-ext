# Quickstart: 034-react-datepicker-filter

## Setup

Install the new dependency (run manually):

```bash
cd webview-ui && pnpm add react-datepicker
```

This also installs transitive deps: `date-fns`, `@floating-ui/react`, `clsx`.

For TypeScript types (included in react-datepicker v9.x, but if needed):

```bash
cd webview-ui && pnpm add -D @types/react-datepicker
```

## Files to Modify

| File | Change |
|------|--------|
| `webview-ui/src/components/FilterWidget.tsx` | Replace 4 HTML inputs with 2 react-datepicker instances |
| `webview-ui/src/components/datepicker-overrides.css` | **New file**: VS Code theme overrides for react-datepicker styles |

## Files Unchanged

| File | Reason |
|------|--------|
| `shared/types.ts` | `GraphFilters` interface unchanged (ISO strings preserved) |
| `shared/messages.ts` | Message types unchanged |
| `src/services/GitLogService.ts` | Backend date handling unchanged |
| `src/WebviewProvider.ts` | Message handling unchanged |
| `webview-ui/src/stores/graphStore.ts` | Store actions/state unchanged |
| `webview-ui/src/components/DateContextMenu.tsx` | Context menu logic unchanged (sets ISO strings in store; FilterWidget syncs from store) |
| `webview-ui/src/rpc/rpcClient.ts` | RPC unchanged |

## Build & Validate

```bash
pnpm typecheck    # Zero errors
pnpm lint         # Zero errors
pnpm build        # Clean build
# Then: VS Code "Run Extension" launch config for smoke test
```
