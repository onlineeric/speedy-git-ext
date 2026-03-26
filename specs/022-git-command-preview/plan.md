# Implementation Plan: Centralize Git Command Preview for All Dialogs

**Branch**: `022-git-command-preview` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/022-git-command-preview/spec.md`

## Summary

Extract the PushDialog's command preview feature (command builder function + readonly input with Copy button) into a centralized utility and reusable component, then extend command preview to all in-scope git dialogs (Merge, Cherry-Pick, Rebase, Reset, Drop Commit, Checkout with Pull, Tag Creation). Pure frontend work — no backend changes, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (strict: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`), Zustand, Tailwind CSS
**Storage**: N/A (no persistent state — all command strings computed in-memory from dialog state)
**Testing**: Vitest (existing pattern in `webview-ui/src/utils/__tests__/`)
**Target Platform**: VS Code Extension webview (browser sandbox)
**Project Type**: VS Code extension (dual-process: Node backend + React webview)
**Performance Goals**: Instantaneous command string computation (pure string concatenation)
**Constraints**: Must match existing PushDialog command preview UI exactly; no layout shifts when toggling options
**Scale/Scope**: 8 dialogs modified, 2 new files created, 1 new test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Command builders are pure string concatenation — O(1), no async, no DOM. CommandPreview component is a lightweight stateless render. |
| II. Clean Code & Simplicity | PASS | Centralizing duplicated logic into shared utility + reusable component is the DRY principle in action. Each builder is a small focused function. |
| III. Type Safety & Explicit Error Handling | PASS | Builder functions use typed option objects importing from `@shared/types` (`PushForceMode`, `ResetMode`, `MergeOptions`, `CherryPickOptions`). No new shared types needed — all exist. |
| IV. Library-First & Purpose-Built Tools | PASS | No new libraries needed. Uses existing Radix UI, Tailwind, clipboard API. |
| V. Dual-Process Architecture Integrity | PASS | All changes are frontend-only (`webview-ui/src/`). No backend modifications. No cross-boundary message changes. |
| Agent Restrictions | PASS | No packages to install. No git operations. |

## Project Structure

### Documentation (this feature)

```text
specs/022-git-command-preview/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: data model
├── quickstart.md        # Phase 1: implementation quickstart
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
webview-ui/src/
├── utils/
│   ├── gitCommandBuilder.ts              # NEW: All command builder pure functions
│   └── __tests__/
│       └── gitCommandBuilder.test.ts     # NEW: Unit tests for all builders
├── components/
│   ├── CommandPreview.tsx                # NEW: Reusable command preview UI component
│   ├── PushDialog.tsx                    # MODIFIED: Remove inline builder + preview UI → use shared
│   ├── MergeDialog.tsx                   # MODIFIED: Add command preview
│   ├── CherryPickDialog.tsx              # MODIFIED: Add command preview
│   ├── RebaseConfirmDialog.tsx           # MODIFIED: Add targetRef prop + command preview
│   ├── DropCommitDialog.tsx              # MODIFIED: Add command preview
│   ├── ConfirmDialog.tsx                 # MODIFIED: Add optional commandPreview prop
│   ├── CheckoutWithPullDialog.tsx        # MODIFIED: Add command preview
│   ├── TagCreationDialog.tsx             # MODIFIED: Add command preview
│   ├── CommitContextMenu.tsx             # MODIFIED: Pass commandPreview to Reset ConfirmDialog, targetRef to RebaseConfirmDialog
│   └── BranchContextMenu.tsx             # MODIFIED: Pass targetRef to RebaseConfirmDialog
```

**Structure Decision**: All new files live within the existing `webview-ui/src/` structure. `gitCommandBuilder.ts` goes in `utils/` alongside other pure utility functions. `CommandPreview.tsx` goes in `components/` alongside all existing dialog components. No new directories needed.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
