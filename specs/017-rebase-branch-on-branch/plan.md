# Implementation Plan: Rebase Branch on Branch Badge Context Menu

**Branch**: `017-rebase-branch-on-branch` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/017-rebase-branch-on-branch/spec.md`

## Summary

The branch badge context menu already has a "Rebase Current Branch onto This" menu item, but it is hidden when the target branch's commit is an ancestor of HEAD (via a `mergedCommits` check). The commit-row context menu does not have this restriction, creating inconsistency. The fix is to relax the visibility condition in `BranchContextMenu.tsx` to match the commit-row's `canRebase` logic, while adding missing guards for detached HEAD (FR-006) and same-commit-as-HEAD (FR-004).

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, @radix-ui/react-context-menu, Zustand, VS Code Extension API
**Storage**: N/A (in-memory Zustand store)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (webview)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: N/A — single condition evaluation; no performance impact
**Constraints**: Must reuse existing rebase confirmation dialog and backend workflow
**Scale/Scope**: 1 file changed, ~3 lines modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | No performance impact — single boolean condition change |
| II. Clean Code & Simplicity | PASS | Simplifies condition by removing unnecessary `mergedCommits` check; adds explicit guards for clarity |
| III. Type Safety & Explicit Error Handling | PASS | No new types needed; uses existing store selectors and type-safe comparisons |
| IV. Library-First & Purpose-Built Tools | PASS | N/A — no new libraries needed |
| V. Dual-Process Architecture Integrity | PASS | Change is purely in webview frontend; no backend changes required |
| Agent Restrictions | PASS | No package installs; no git operations beyond readonly |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/017-rebase-branch-on-branch/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
webview-ui/src/components/
└── BranchContextMenu.tsx  # ONLY file modified (lines 88-97: canRebaseOnto condition)
```

**Structure Decision**: No new files or directories. Single file modification in the existing webview component.

## Complexity Tracking

No violations — table omitted.
