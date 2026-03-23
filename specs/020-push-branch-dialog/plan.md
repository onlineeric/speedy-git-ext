# Implementation Plan: Push Branch Dialog

**Branch**: `020-push-branch-dialog` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-push-branch-dialog/spec.md`

## Summary

Replace the direct "Push Branch" context menu action with a configurable dialog. The dialog provides a `--set-upstream / -u` checkbox (default checked), a "Push mode:" radio group (Normal / `--force-with-lease` / `--force`), a remote dropdown, a live command preview with copy button, and Execute/Cancel buttons. The dialog stays open with a loading state during push and shows a yellow warning when force modes are selected. The existing `force: boolean` parameter is replaced with a `PushForceMode` string literal union to support three distinct modes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand, `@radix-ui/react-dialog`, Tailwind CSS, esbuild (backend), Vite (webview)
**Storage**: N/A (in-memory Zustand store, session-scoped)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension API (1.80+)
**Project Type**: VS Code extension (dual-process: Node.js backend + React webview)
**Performance Goals**: Dialog opens in <100ms, command preview updates instantly on option change
**Constraints**: Webview sandbox (no `require('vscode')`), git process timeout 60s
**Scale/Scope**: Single dialog component, ~6 files modified, ~1 file created

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Dialog is lightweight (no virtual scrolling needed, no graph computation). Command preview is a pure string computation — instant updates. |
| II. Clean Code & Simplicity | PASS | Follows existing MergeDialog pattern. Single new component. No unnecessary abstractions. |
| III. Type Safety & Explicit Error Handling | PASS | New `PushForceMode` type in `shared/types.ts`. Push uses `Result<T, GitError>` pattern. Message contract updated in `shared/messages.ts`. |
| IV. Library-First | PASS | Uses existing `@radix-ui/react-dialog`. Clipboard via standard `navigator.clipboard.writeText()`. No new packages needed. |
| V. Dual-Process Architecture | PASS | Dialog is frontend-only (webview). Push execution via existing message passing to backend `GitRemoteService`. No cross-boundary violations. |
| Agent Restrictions | PASS | No auto-installs. No commits/pushes by agent. |

### Post-Phase 1 Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | No performance-sensitive operations. Dialog is a simple form. |
| II. Clean Code & Simplicity | PASS | One new file (`PushDialog.tsx`). Minimal changes to existing files. Command builder is a pure function. |
| III. Type Safety & Explicit Error Handling | PASS | `PushForceMode` type enforces valid modes at compile time. `pushAsync()` returns `Promise<string>` for dialog await pattern. |
| IV. Library-First | PASS | No new packages required. |
| V. Dual-Process Architecture | PASS | All changes respect the backend/frontend boundary. Shared types updated in `shared/`. |

## Project Structure

### Documentation (this feature)

```text
specs/020-push-branch-dialog/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: data model changes
├── quickstart.md        # Phase 1: implementation quickstart
├── contracts/           # Phase 1: message contract changes
│   └── messages.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # Add PushForceMode type
└── messages.ts          # Update push payload (forceMode, required remote/branch)

src/
├── services/
│   └── GitRemoteService.ts  # Update push() signature and force mode handling
└── WebviewProvider.ts       # Update push handler to pass forceMode

webview-ui/src/
├── components/
│   ├── PushDialog.tsx           # NEW: Push dialog with options, preview, copy
│   └── BranchContextMenu.tsx    # Replace direct push call with dialog open
└── rpc/
    └── rpcClient.ts             # Update push(), add pushAsync()
```

**Structure Decision**: This is a VS Code extension with the existing dual-process architecture (backend `src/` + frontend `webview-ui/src/` + shared `shared/`). The feature adds one new component and modifies existing files across all three layers. No structural changes needed.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
