# Quickstart: Auto-Refresh on Git State Changes

## Prerequisites

- VSCode 1.80+ with built-in `vscode.git` extension (enabled by default)
- pnpm installed

## Development Setup

```bash
pnpm install
pnpm build
# Then use VS Code "Run Extension" launch config to debug
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ Extension Host (Backend)                            │
│                                                     │
│  ExtensionController                                │
│    ├── GitWatcherService (NEW)                      │
│    │     ├── VSCode git API listener                │
│    │     ├── FileSystemWatcher (.git/*)             │
│    │     └── Debounce (500ms) → onDidDetectChange   │
│    │                                                │
│    └── WebviewProvider                              │
│          ├── triggerAutoRefresh()                    │
│          │     ├── Drop if already refreshing       │
│          │     ├── Defer if panel hidden             │
│          │     └── Call sendInitialData()            │
│          └── onDidChangeViewState (visibility)      │
│                                                     │
└───────────────── message passing ───────────────────┘
                        │
┌───────────────────────┴─────────────────────────────┐
│ Webview (Frontend) — NO CHANGES for auto-refresh    │
│                                                     │
│  Zustand Store ← receives commits/branches/loading  │
│  GraphContainer ← re-renders with preserved scroll  │
│  ControlBar ← refresh/fetch buttons disabled when   │
│               loading=true (existing behavior)      │
└─────────────────────────────────────────────────────┘
```

## Key Implementation Points

1. **GitWatcherService** — New service in `src/services/`. Subscribes to:
   - `vscode.git` API v1: `repository.state.onDidChange` for VSCode SCM operations
   - `vscode.workspace.createFileSystemWatcher`: `.git/HEAD`, `.git/refs/**`, `.git/index` for external operations
   - All events funnel into a single 500ms debounce → fires `onDidDetectChange`

2. **ExtensionController** — Wires `GitWatcherService.onDidDetectChange` to `WebviewProvider.triggerAutoRefresh()`

3. **WebviewProvider** — New `triggerAutoRefresh()` method with:
   - Drop policy: skip if `isRefreshing` is true (set `pendingRefresh` flag)
   - Defer policy: skip if panel is hidden (set `deferredRefresh` flag)
   - After refresh completes: check `pendingRefresh` → refresh again if set

## Smoke Test Checklist

1. Open Speedy Git Graph
2. Commit via VSCode Source Control → graph updates within ~2s
3. Run `git checkout -b test` in terminal → graph updates within ~3s
4. Rapid `git commit` x3 in terminal → graph updates once (debounced)
5. Hide Speedy Git tab → commit in terminal → reveal tab → graph updates
6. Click refresh button during auto-refresh → request dropped gracefully
