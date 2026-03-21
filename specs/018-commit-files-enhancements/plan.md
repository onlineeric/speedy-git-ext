# Implementation Plan: Commit Files Panel Enhancements

**Branch**: `018-commit-files-enhancements` | **Date**: 2026-03-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-commit-files-enhancements/spec.md`

## Summary

Enhance the commit details panel file changes list with three improvements: (1) move line change counts from aggregate header to per-file display, suppressing counts for added/deleted files; (2) add hover action icons per file row (copy path, open at commit, open current version); (3) add a tree view toggle that groups files by folder hierarchy with compaction, using `@headless-tree/react` for tree state management paired with the existing `@tanstack/react-virtual` for virtual scrolling.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand, `@tanstack/react-virtual`, `@headless-tree/core` + `@headless-tree/react` (new), Tailwind CSS, Radix UI
**Storage**: N/A (in-memory Zustand store, session-scoped)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config + `pnpm typecheck` + `pnpm lint` + `pnpm build`
**Target Platform**: VS Code Extension (webview, VS Code 1.80+)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Tree view render <1s for 100+ files; view toggle instant (<100ms perceived)
**Constraints**: Webview sandbox (no Node.js APIs); all git I/O via extension host message passing
**Scale/Scope**: Commits with up to 500+ changed files; deeply nested directory structures

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Tree view uses `@headless-tree` (headless, 9.9kB) + existing `@tanstack/react-virtual`. No redundant virtualizers. Flat list computation for tree is O(n) where n = files. |
| II. Clean Code & Simplicity | PASS | Shared `FileChangeRow` component reused between list and tree views. New utility `fileTreeBuilder.ts` is single-purpose. No over-abstraction. |
| III. Type Safety & Explicit Error Handling | PASS | New `openCurrentFile` message added to `shared/messages.ts` type union. `FileViewMode` type added to `shared/types.ts`. Type guards updated. |
| IV. Library-First | PASS | `@headless-tree/react` chosen over custom implementation for keyboard nav + accessibility. Actively maintained, TypeScript-native, zero deps. |
| V. Dual-Process Architecture | PASS | All new git/file operations handled in extension host (`openCurrentFile` handler). Webview only sends messages + renders UI. `shared/` remains single source of truth. |
| Agent Restrictions | PASS | No auto-install. Install command documented for developer to run manually. |

### Post-Design Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Tree nodes computed once per commit selection (memoized). Folder compaction is a single-pass O(n) transformation. Virtual scrolling available for large trees. |
| II. Clean Code & Simplicity | PASS | 2 new files (`FileChangesTreeView.tsx`, `fileTreeBuilder.ts`), 1 modified component. All small and focused. |
| III. Type Safety | PASS | `FileTreeNode` interface defined. `FileViewMode` type union. `openCurrentFile` added to message type union with type guard. |
| IV. Library-First | PASS | `@headless-tree/react` handles tree state, keyboard navigation, accessibility (WAI-ARIA). No manual reimplementation of these concerns. |
| V. Dual-Process Architecture | PASS | `openCurrentFile` handler in `WebviewProvider.ts`. No `require('vscode')` or git calls in webview. |

## Project Structure

### Documentation (this feature)

```text
specs/018-commit-files-enhancements/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: package research, message design
├── data-model.md        # Phase 1: entity definitions, new types
├── quickstart.md        # Phase 1: setup + smoke test checklist
├── contracts/
│   └── messages.md      # Phase 1: new message contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # MODIFY: Add FileViewMode type
└── messages.ts          # MODIFY: Add openCurrentFile message type

src/
└── WebviewProvider.ts   # MODIFY: Add openCurrentFile handler

webview-ui/src/
├── components/
│   ├── CommitDetailsPanel.tsx      # MODIFY: Refactor FileChangesList header, FileChangeRow layout, add hover icons, renamed display
│   ├── FileChangesTreeView.tsx     # NEW: Tree view component using @headless-tree/react
│   └── icons/
│       └── index.tsx               # MODIFY: Add CopyIcon, FileIcon, FileCodeIcon, ListViewIcon, TreeViewIcon, CheckIcon
├── stores/
│   └── graphStore.ts               # MODIFY: Add fileViewMode state + setFileViewMode action
├── rpc/
│   └── rpcClient.ts                # MODIFY: Add openCurrentFile method
└── utils/
    └── fileTreeBuilder.ts          # NEW: Build FileTreeNode[] from FileChange[] with folder compaction
```

**Structure Decision**: Follows the existing dual-process architecture (backend `src/` + frontend `webview-ui/src/`). Two new files created (`FileChangesTreeView.tsx`, `fileTreeBuilder.ts`), the rest are modifications to existing files. No new directories needed.

## Complexity Tracking

> No constitution violations to justify. All design choices align with existing patterns and principles.

## Post-Implementation Bug Fixes (2026-03-21)

### Bugs Found During Smoke Testing

1. **Per-file change counts not displaying** (`src/services/GitDiffService.ts`): `parseNumstat` incorrectly assumed file paths were in separate NUL-terminated fields (`parts[i+1]`), but with `--numstat -z`, non-rename file paths are the 3rd tab-separated field (`tabParts[2]`). Also missing `--no-commit-id` flag which caused the commit hash to be prepended to the output, corrupting the first file's stats. Binary files were also incorrectly set to `0` instead of left `undefined` for proper binary detection.

2. **Action icons at end of row** (`CommitDetailsPanel.tsx`, `FileChangesTreeView.tsx`): `ml-auto` pushed action icons to the right edge. Moved icons to appear immediately after the file name link. Updated FR-021 layout order to: `[badge] [file path] [icons on hover] [+N -N]`.

3. **View toggle icons too small and misplaced** (`icons/index.tsx`, `CommitDetailsPanel.tsx`): `ListViewIcon` and `TreeViewIcon` increased from 12×12 to 16×16. Removed `ml-auto` so they appear right after the "N files changed" text.

4. **Open file at commit showing current version** (`WebviewProvider.ts`, `GitShowContentProvider.ts`): Replaced `vscode.Uri.parse()` with `vscode.Uri.from()` for reliable URI encoding. Removed unnecessary `resolveWorkspaceFilePath` guard that could silently bail. Updated `GitShowContentProvider` to use a dynamic service getter (lambda) instead of a captured reference, preventing stale service after repo switches.
