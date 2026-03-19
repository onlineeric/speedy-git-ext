# Implementation Plan: Auto-Refresh on Git State Changes

**Branch**: `016-auto-refresh` | **Date**: 2026-03-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-auto-refresh/spec.md`

## Summary

The extension currently requires manual refresh to show latest git history. This feature adds automatic refresh by listening to VSCode's built-in git extension state change events (primary) and filesystem watching of `.git/` directory artifacts (fallback). Refresh requests are debounced to coalesce rapid changes, and the UI preserves scroll position and selection during refresh. The implementation is entirely backend-driven — a new `GitWatcherService` detects changes and triggers refresh via existing `WebviewProvider.sendInitialData()`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: VS Code Extension API (1.80+), `vscode.git` built-in extension API v1, esbuild (backend), Vite + React 18 (webview)
**Storage**: N/A (in-memory state only)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Desktop (Node.js extension host + webview)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Graph updates within 2s after VSCode operations, 3s after terminal operations
**Constraints**: No auto-fetch from remote, always-on (no user setting), drop concurrent requests
**Scale/Scope**: Single active repository, 500+ commit graphs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Debouncing prevents excessive refreshes; deferred refresh when webview hidden avoids wasted work |
| II. Clean Code & Simplicity | PASS | Single new service (GitWatcherService) with focused responsibility; no over-engineering |
| III. Type Safety & Explicit Errors | PASS | No new shared types needed — reuses existing message flow; no throwing exceptions |
| IV. Library-First | PASS | Uses VSCode's built-in APIs (git extension, FileSystemWatcher), no custom implementations |
| V. Dual-Process Architecture | PASS | Watcher runs in extension host (backend); webview receives data via existing message passing |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-auto-refresh/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── services/
│   └── GitWatcherService.ts    # NEW — watches git state changes (VSCode git API + filesystem)
├── ExtensionController.ts      # MODIFIED — creates/disposes GitWatcherService, wires to WebviewProvider
└── WebviewProvider.ts          # MODIFIED — exposes triggerAutoRefresh(), visibility tracking
```

No changes to `shared/`, `webview-ui/`, or frontend code — auto-refresh reuses the existing `sendInitialData()` flow and the webview cannot distinguish auto from manual refresh.

**Structure Decision**: Follows existing single-project structure. One new service file (`GitWatcherService.ts`) in the established `src/services/` directory. All other changes are modifications to existing files.
