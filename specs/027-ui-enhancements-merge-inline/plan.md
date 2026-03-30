# Implementation Plan: UI Enhancements for Merge Dialog and Inline Code Rendering

**Branch**: `027-ui-enhancements-merge-inline` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/027-ui-enhancements-merge-inline/spec.md`

## Summary

Add inline code rendering (backtick → grey-background styled `<code>` spans) to commit messages across the UI, add a `--squash` checkbox to the merge dialog (wiring into the already-supported command builder and RPC layer), and restyle merge dialog option labels to show git flags with inline code styling.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, Radix UI (AlertDialog), Tailwind CSS, esbuild (backend), Vite (frontend)
**Storage**: N/A (no persistence changes)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config; existing `gitCommandBuilder.test.ts` for command builder
**Target Platform**: VS Code Extension (webview + extension host)
**Project Type**: VS Code Extension (desktop-app)
**Performance Goals**: No measurable rendering overhead — inline code parsing must be O(n) on message length; commit list virtual scrolling must remain smooth at 500+ commits
**Constraints**: Must use VSCode theme CSS variables for colors; must not break existing `truncate` behavior on CommitRow
**Scale/Scope**: 3 UI components modified (CommitRow, CommitDetailsPanel, MergeDialog), 1 new utility function, 0 new shared types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Inline code parsing is O(n) string scan; no additional re-renders; no impact on virtual scrolling |
| II. Clean Code & Simplicity | PASS | Single reusable utility for backtick parsing; no speculative abstractions |
| III. Type Safety & Explicit Error Handling | PASS | No new shared types needed; existing `MergeOptions.squash` already typed; no new message types |
| IV. Library-First & Purpose-Built Tools | PASS | Simple single-backtick parsing does not warrant a library; it's a trivial regex-free string scan for paired delimiters |
| V. Dual-Process Architecture Integrity | PASS | All changes are frontend-only (webview); no backend modifications needed; `--squash` already wired through RPC and backend |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/027-ui-enhancements-merge-inline/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
webview-ui/src/
├── components/
│   ├── CommitRow.tsx             # MODIFY: use renderInlineCode() for subject
│   ├── CommitDetailsPanel.tsx    # MODIFY: use renderInlineCode() for subject + body
│   └── MergeDialog.tsx           # MODIFY: add squash checkbox, use InlineCode for labels
└── utils/
    ├── inlineCodeRenderer.tsx    # NEW: parseInlineCode(), renderInlineCode(), InlineCode component
    ├── gitCommandBuilder.ts      # NO CHANGE: already supports squash
    └── __tests__/
        └── gitCommandBuilder.test.ts  # NO CHANGE: squash tests already exist

shared/
├── types.ts                      # NO CHANGE: MergeOptions.squash already defined
└── messages.ts                   # NO CHANGE: mergeBranch payload already includes squash

src/
└── WebviewProvider.ts            # NO CHANGE: already passes squash to gitBranchService.merge()
```

**Structure Decision**: All changes are in the webview frontend layer. One new utility file (`inlineCodeRenderer.tsx`) for the shared backtick-parsing logic, used by both CommitRow and CommitDetailsPanel. No contracts directory needed — no new external interfaces.
