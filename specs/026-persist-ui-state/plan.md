# Implementation Plan: Persist UI State

**Branch**: `026-persist-ui-state` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/026-persist-ui-state/spec.md`

## Summary

Persist the commit details panel's UI preferences (position, file view mode, panel height/width) using VS Code's `globalState` API, hydrating the Zustand store from persisted state on webview initialization to eliminate flash of defaults. The extension host acts as the persistence layer; the webview reads on startup and writes back on each user change.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: VS Code Extension API, React 18, Zustand, esbuild, Vite
**Storage**: VS Code `context.globalState` (key-value, JSON-serializable, global across workspaces)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code 1.80+ (desktop)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Persisted state hydrated before first render (no flash); writes complete within 1 second
**Constraints**: No new dependencies; must not replace Zustand; must maintain dual-process architecture
**Scale/Scope**: Single persisted object (~100 bytes), 6 files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | `globalState.get()` is synchronous read; state sent with initial payload (no extra round-trip); writes are async but non-blocking and infrequent (user-initiated) |
| II. Clean Code & Simplicity | PASS | Single shared type, centralized validation, no speculative abstractions |
| III. Type Safety & Explicit Error Handling | PASS | New `PersistedUIState` type added to `shared/types.ts`; validation with safe fallback to defaults; no exceptions thrown |
| IV. Library-First & Purpose-Built Tools | PASS | Uses VS Code's built-in `globalState` API; no new packages needed |
| V. Dual-Process Architecture Integrity | PASS | Extension host owns persistence (read/write `globalState`); webview owns rendering; communication via message passing only; shared type in `shared/types.ts` |

**Post-Phase 1 Re-check**: All principles still satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/026-persist-ui-state/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity model
├── quickstart.md        # Phase 1: implementation quickstart
├── contracts/           # Phase 1: message contracts
│   └── messages.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # Add PersistedUIState interface
└── messages.ts          # Add persistedUIState response + updatePersistedUIState request

src/
└── WebviewProvider.ts   # Read/write globalState, send on init, handle updates

webview-ui/src/
├── stores/
│   └── graphStore.ts    # Add bottomPanelHeight, rightPanelWidth, hydration action
├── rpc/
│   └── rpcClient.ts     # Handle persistedUIState response, send updatePersistedUIState
└── components/
    └── CommitDetailsPanel.tsx  # Read sizes from store, persist on resize end
```

**Structure Decision**: Follows existing project structure exactly. No new files or directories needed in source code — all changes are additions to existing files. The shared type goes in `shared/types.ts` as required by Constitution Principle III.

## Complexity Tracking

> No violations to justify. All changes fit within existing architecture.
