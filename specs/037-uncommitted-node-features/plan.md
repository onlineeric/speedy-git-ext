# Implementation Plan: Uncommitted Node Features

**Branch**: `037-uncommitted-node-features` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/037-uncommitted-node-features/spec.md`

## Summary

Enhance the existing read-only uncommitted node with full staging workflow capabilities: separate staged/unstaged file sections in the details panel, per-file and bulk stage/unstage/discard actions, an expanded context menu with stash/discard/stage operations, a file picker dialog for batch operations, and merge conflict state display. The backend needs new git index manipulation services and RPC handlers; the frontend needs refactored details panel sections, new action buttons, dialogs, and an expanded context menu.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, Radix UI, @tanstack/react-virtual, esbuild (backend), Vite (frontend)
**Storage**: N/A (transient Zustand state + VS Code globalState for UI preferences)
**Testing**: Vitest (unit tests)
**Target Platform**: VS Code Extension (1.80+)
**Project Type**: VS Code extension (dual-process: Node.js backend + React webview frontend)
**Performance Goals**: Stage/unstage operations < 1 second perceived latency (SC-001)
**Constraints**: All git I/O in backend via GitExecutor; webview is sandboxed; all cross-boundary communication via message passing
**Scale/Scope**: Local git repos, single user, typical 0-100 uncommitted files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Stage/unstage are single git commands (< 100ms). No new list rendering concerns — same virtual scrolling applies. Backend operations return Result<T> with 30s timeout. |
| II. Clean Code & Simplicity | PASS | New service (GitIndexService) follows single responsibility. New UI sections reuse existing FileChangeRow/TreeView components. No speculative abstractions. |
| III. Type Safety & Explicit Error Handling | PASS | New types added to shared/types.ts. New messages added to shared/messages.ts. All operations return Result<T, GitError>. |
| IV. Library-First & Purpose-Built Tools | PASS | No new libraries needed. Git output parsed with existing null-byte format parsers. Radix UI used for new dialogs/menus. |
| V. Dual-Process Architecture Integrity | PASS | All git operations in backend services. Frontend only renders and sends RPC messages. shared/ used for cross-boundary types. |

**Gate result: PASS — no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/037-uncommitted-node-features/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (RPC message contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── GitIndexService.ts        # NEW: stage, unstage, discard operations
│   ├── GitDiffService.ts         # MODIFY: return per-file stage state, conflict detection
│   ├── GitStashService.ts        # MODIFY: add stash-with-message method
│   └── GitExecutor.ts            # EXISTING: no changes needed
├── WebviewProvider.ts            # MODIFY: add new RPC handlers for staging ops

shared/
├── types.ts                      # MODIFY: extend FileChange with stageState, add ConflictState
└── messages.ts                   # MODIFY: add new request/response message types

webview-ui/src/
├── components/
│   ├── CommitDetailsPanel.tsx    # MODIFY: split into staged/unstaged/conflict sections
│   ├── FileChangeShared.tsx      # MODIFY: add stage/unstage/discard action icons
│   ├── UncommittedContextMenu.tsx # MODIFY: expand with full context menu
│   ├── StashDialog.tsx           # NEW: stash confirmation with message input
│   ├── DiscardDialog.tsx         # NEW: discard confirmation dialog
│   ├── DiscardAllDialog.tsx      # NEW: discard-all confirmation dialog
│   └── FilePickerDialog.tsx      # NEW: multi-select file picker dialog
├── stores/
│   └── graphStore.ts             # MODIFY: store per-file stage state, conflict state
├── rpc/
│   └── rpcClient.ts              # MODIFY: add methods for staging operations
└── utils/
    └── gitCommandBuilder.ts      # MODIFY: add command preview builders for new operations
```

**Structure Decision**: Follows existing architecture exactly. One new backend service (GitIndexService) for staging/discarding. All other changes are modifications to existing files. No new directories needed except `contracts/` under specs.

## Complexity Tracking

> No violations — table not needed.
