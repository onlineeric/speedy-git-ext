# Implementation Plan: Batch Initial Data — Single Render on Load

**Branch**: `040-batch-initial-data` | **Date**: 2026-04-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/040-batch-initial-data/spec.md`

## Summary

Batch all initial/refresh data delivery into a single coordinated message (`initialData` or `refreshData`) so the webview receives commits, branches, stashes, uncommitted changes, and all metadata in one payload. The frontend processes this payload with a single Zustand state update and a single topology computation, eliminating the current 3× topology recomputation and multi-frame UI flicker.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, esbuild (backend), Vite (frontend), VS Code Extension API
**Storage**: VS Code `context.globalState` for persisted UI state
**Testing**: Vitest (unit tests)
**Target Platform**: VS Code Extension (Node.js extension host + webview)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Zero intermediate renders during load/refresh; topology computed exactly once per cycle; wall-clock time equal to or less than current
**Constraints**: Must not break targeted/incremental updates; must handle partial data source failures gracefully
**Scale/Scope**: Repositories with 500+ commits, many branches, stashes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | ✅ PASS | Core goal: reduce topology computations from 3→1, eliminate flicker. Parallel data fetching preserved. |
| II. Clean Code & Simplicity | ✅ PASS | Consolidates scattered send logic into a clear batch-then-send pattern. No speculative abstractions. |
| III. Type Safety & Explicit Error Handling | ✅ PASS | New message types added to `shared/messages.ts`. `Result<T, GitError>` pattern preserved. Partial failures handled with defaults + notification. |
| IV. Library-First | ✅ PASS | No new libraries needed. Uses existing Zustand, VS Code message passing. |
| V. Dual-Process Architecture Integrity | ✅ PASS | Communication still via VS Code message passing. Backend still owns git I/O. Frontend still owns topology + rendering. `shared/` types updated for new message contract. |

**Agent Restrictions**: ✅ No auto-install, no git mutations.

## Project Structure

### Documentation (this feature)

```text
specs/040-batch-initial-data/
├── plan.md              # This file
├── research.md          # Phase 0: current architecture analysis
├── data-model.md        # Phase 1: new types and data structures
├── quickstart.md        # Phase 1: implementation quickstart guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
shared/
├── messages.ts           # Add InitialDataPayload interface and initialData ResponseMessage variant

src/
├── WebviewProvider.ts    # Refactor sendInitialData() to gather-then-send pattern

webview-ui/src/
├── stores/graphStore.ts  # Add setInitialData() / setRefreshData() that do single atomic state update
├── rpc/rpcClient.ts      # Add handler for new batched message types
└── components/
    └── ControlBar.tsx    # Add subtle refresh indicator (spinner)
```

**Structure Decision**: Existing project structure is preserved. Changes are surgical modifications to existing files plus new types in `shared/`. No new files or directories needed in src/ or webview-ui/.

## Design

### Backend Changes (WebviewProvider.ts)

#### Current Flow (sendInitialData):
```
send(persistedUIState) → send(settingsData) → send(loading:true)
→ fetch commits → send(commits) → send(loading:false)
→ await uncommitted → send(uncommittedChanges)
→ await Promise.all([branches, authors, remotes, submodules, worktrees, stashes])
  → send(branches) → send(authors) → send(remotes) → ...
→ send(cherryPickState) → send(rebaseState) → send(revertState)
```
**Problem**: ~12+ separate postMessage calls, each triggering frontend state updates.

#### New Flow:
```
send(persistedUIState) → send(settingsData) → send(loading:true)
→ Promise.all([commits, uncommitted, branches, authors, remotes, 
   submodules, worktrees, stashes, cherryPick, rebase, revert])
→ send(initialData: { ...all results }) → send(loading:false)
```

For **refresh** (non-initial):
```
→ Promise.all([commits, uncommitted, branches, authors, remotes,
   submodules, worktrees, stashes, cherryPick, rebase, revert])
→ send(refreshData: { ...all results })
```
No loading:true/false wrapper during refresh — the current graph stays visible.

**Fingerprint optimization**: When auto-refresh detects unchanged commits, the `initialData` payload includes `commits: null` to signal "reuse previous commits." Other data is still fetched and included.

**Partial failure handling**: Each data source is wrapped in a try/catch. Failed sources get default values (empty arrays, false for states). An `errors` field in the payload lists which sources failed, and the frontend shows a non-blocking notification.

### Frontend Changes (graphStore.ts)

#### New Store Action: `setInitialData(payload)`
- Receives the complete `InitialDataPayload`
- If `payload.commits` is not null, uses new commits; else reuses existing `state.commits` (fingerprint-unchanged refresh)
- Performs a **single** Zustand `set()` call that updates all fields:
  - commits, branches, stashes, uncommittedChanges, remotes, authors, worktrees, submodules
  - cherryPickInProgress, rebaseInProgress, revertInProgress, rebaseConflictInfo
- Computes `mergedCommits` and `topology` **once** using the complete dataset
- Computes `hiddenCommitHashes` once
- Result: exactly one React re-render cycle

### Message Types (shared/messages.ts)

New response message variant:
- `type: 'initialData'` with `InitialDataPayload`

A single `initialData` message type is used for both initial load and refresh. The `commits: null` field distinguishes fingerprint-unchanged refreshes — no separate `refreshData` type needed.

The existing individual message types (`commits`, `branches`, `stashes`, etc.) remain unchanged — they are still used by targeted/incremental updates.

### Refresh Indicator (ControlBar.tsx)

During refresh:
- A subtle spinner appears in the toolbar (using existing loading state or a new `isRefreshing` flag)
- The current graph remains fully visible and interactive
- Spinner disappears when `refreshData` is processed

## Complexity Tracking

No constitution violations — no complexity justification needed.
