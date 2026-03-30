# Research: Persist UI State

## R1: VS Code globalState API for Persistence

**Decision**: Use `this.context.globalState` for storing persisted UI state.

**Rationale**: `globalState` is a key-value store provided by VS Code that persists across sessions, reloads, and extension updates. It is global (not per-workspace), aligning with the clarified requirement. It supports `get(key, defaultValue)` and `update(key, value)` returning a Thenable. The data is stored as JSON and limited to serializable types — perfect for our small state object.

**Alternatives considered**:
- `workspaceState`: Per-workspace storage. Rejected because the user chose global scope.
- VS Code `settings.json`: User-visible and editable. Rejected because these are internal UI preferences, not user-facing settings.
- File-based persistence: Unnecessary complexity; `globalState` is purpose-built for this.

## R2: Hydration Strategy — No Flash of Defaults

**Decision**: Include persisted UI state in the initial data payload sent from extension host to webview, before the webview renders.

**Rationale**: The extension host already sends initial data via `sendInitialData()` in `WebviewProvider.ts`. Persisted state can be read synchronously from `globalState.get()` and included in this initial payload. The webview's `rpcClient` message handler can hydrate the Zustand store before the first React render, eliminating any flash of default values.

**Alternatives considered**:
- Separate `getUIState` request from webview: Introduces a round-trip delay and potential flash. Rejected.
- Embed in existing `settingsData` message: Possible but mixes user-facing settings with internal UI state. Rejected for separation of concerns.

## R3: Persistence Granularity — Individual Fields vs Single Object

**Decision**: Persist as a single versioned object under one `globalState` key.

**Rationale**: A single key (`speedyGit.uiState`) keeps reads and writes atomic — one `get()` on load, one `update()` on change. The object is small (~100 bytes). A version field enables future schema migrations. Individual keys would require multiple reads and complicate validation.

**Alternatives considered**:
- One key per field: Simpler individual updates but complicates validation, versioning, and atomic consistency. Rejected.

## R4: Panel Size Storage — Component State vs Zustand

**Decision**: Move `bottomHeight` and `rightWidth` from CommitDetailsPanel's local `useState` into the Zustand store.

**Rationale**: Currently these values live in React component state and are lost when the panel unmounts. Moving them to Zustand makes them accessible for persistence via the RPC layer. The Zustand store already manages `detailsPanelPosition` and `fileViewMode`, so adding size fields is consistent.

**Alternatives considered**:
- Keep in component state and sync via refs: Fragile, doesn't survive unmount. Rejected.
- Store only in extension host, fetch on mount: Adds latency and complexity. Rejected.

## R5: Persistence Trigger — When to Write Back

**Decision**: Persist on each user action that changes a persisted field (toggle position, change view mode, end of resize drag).

**Rationale**: Writing on each change ensures an immediate VS Code reload captures the latest state (SC-004: within 1 second). The writes are infrequent (user-initiated) and cheap (`globalState.update` is async but fast). For resize, persist at the end of the drag (mouse-up), not during the drag, to avoid excessive writes.

**Alternatives considered**:
- Debounced timer: Adds complexity and risks losing state if reload happens during debounce window. Rejected.
- Persist on panel close only: Misses the "immediate reload" scenario. Rejected.

## R6: Message Type Design

**Decision**: Add two new message types: a response type `'persistedUIState'` (extension→webview) for initial hydration, and a request type `'updatePersistedUIState'` (webview→extension) for persisting changes.

**Rationale**: Follows the existing message-passing pattern in `shared/messages.ts`. Separate types keep the contract clear and avoid overloading existing message types. The response type is sent once during initialization; the request type is sent on each user change.

**Alternatives considered**:
- Reuse `settingsData` message: Mixes concerns. Rejected.
- Single bidirectional message type: Ambiguous direction. Rejected.
