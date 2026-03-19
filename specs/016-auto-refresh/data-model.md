# Data Model: Auto-Refresh on Git State Changes

## New Entities

### GitWatcherService (Backend Service)

A single-responsibility service that detects git state changes and triggers refresh.

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| gitApi | `API \| null` | VSCode git extension API v1, null if unavailable |
| fileWatchers | `vscode.FileSystemWatcher[]` | Active filesystem watchers for `.git/` artifacts |
| disposables | `vscode.Disposable[]` | All subscriptions for cleanup |
| debounceTimer | `ReturnType<typeof setTimeout> \| undefined` | Active debounce timer |
| onDidDetectChange | `vscode.EventEmitter<void>` | Event emitter fired after debounce settles |

**Lifecycle**:
- Created by `ExtensionController` when `showGraph()` is first called
- Disposed when extension deactivates or webview closes

**State Transitions**:
```
[idle] --git event--> [debouncing] --500ms--> [fires onDidDetectChange] --> [idle]
[debouncing] --git event--> [debouncing] (timer reset)
```

### WebviewProvider Changes

**New Fields**:
| Field | Type | Description |
|-------|------|-------------|
| isRefreshing | `boolean` | True while `sendInitialData()` is running |
| pendingRefresh | `boolean` | True if a refresh was requested during an active refresh |
| isPanelVisible | `boolean` | Tracks webview panel visibility |
| deferredRefresh | `boolean` | True if a refresh was deferred while panel was hidden |

## Existing Entities (No Changes)

The following existing types require **no modifications**:

- `Commit`, `Branch`, `GraphFilters` (shared/types.ts) — auto-refresh reuses existing data structures
- `RequestMessage` / `ResponseMessage` (shared/messages.ts) — auto-refresh uses existing `sendInitialData()` flow, no new message types needed
- `GraphStore` (webview-ui/stores/graphStore.ts) — existing `setCommits()` already preserves selection state

## Relationships

```
ExtensionController
  ├── creates → GitWatcherService
  ├── creates → WebviewProvider
  └── wires: GitWatcherService.onDidDetectChange → WebviewProvider.triggerAutoRefresh()

GitWatcherService
  ├── subscribes to → vscode.git API (Repository.state.onDidChange)
  └── subscribes to → vscode.FileSystemWatcher (.git/HEAD, refs/**, index)

WebviewProvider
  ├── triggerAutoRefresh() → calls sendInitialData() with drop/defer guards
  └── onDidChangeViewState → tracks visibility, triggers deferred refresh
```
