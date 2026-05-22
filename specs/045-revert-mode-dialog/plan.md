# Implementation Plan: Revert Commit dialog with mode selection

**Branch**: `045-revert-mode-dialog` | **Date**: 2026-05-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/045-revert-mode-dialog/spec.md`

## Summary

Replace the existing direct-action **Revert Commit** menu item with a new dialog modeled after `CherryPickDialog`. The dialog exposes three radio-button modes — **Commit now** (`--no-edit`, current behavior), **Stage only** (`--no-commit`, leaves inverse changes in index/worktree), and **Edit message** (user types a custom commit message in the dialog) — plus a live single-line command preview. The merge-commit mainline-parent picker is consolidated into the same dialog (the standalone `RevertParentDialog` is removed). Dirty-tree check stays strict for all three modes (clarification Q1). Command preview uses canonical native git syntax for all modes, including `git revert <hash>` for Edit message (clarification Q2); the two-step internal implementation (`git revert --no-commit` then `git commit -m`) is not exposed.

**Technical approach**: One new service method signature (a refactor of `GitRevertService.revert(hash, mainlineParent?)` → `revert(hash, options: RevertOptions)`). One new dialog component (`RevertDialog.tsx`) cloned from `CherryPickDialog.tsx` skeleton. One file deletion (`RevertParentDialog.tsx`). One new shared type (`RevertMode`, `RevertOptions`). RPC message-payload shape updated in place (no new RPC variant). Zustand store gains a `revertOptions` slice mirroring `cherryPickOptions`. No new dependencies. No new conflict-recovery flow — **Commit now** keeps today's `REVERT_HEAD`-based continue/abort path; the other two modes' conflicts fall back to the VS Code SCM panel because git does not engage its revert state machine for `--no-commit` runs.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**:
- Backend: `vscode` (host API), Node.js 18 `child_process` via existing `GitExecutor`
- Webview: React 18, Zustand, `@radix-ui/react-dialog`, Tailwind CSS
**Storage**: N/A — last-used revert mode lives in the Zustand store (transient, session-only), mirroring `cherryPickOptions`. No `globalState` persistence (out of scope per spec Assumptions).
**Testing**: Vitest (unit) for `GitRevertService.revert` across the three modes, `buildRevertCommand` across the three modes, and the dialog's render/disabled-state behavior if convenient via existing webview test setup. Manual smoke test via VS Code "Run Extension" launch.
**Target Platform**: VS Code 1.80+ on macOS / Linux / Windows; webview runs in Electron's sandboxed Chromium
**Project Type**: VS Code extension — backend (Node.js extension host) + frontend (React webview) communicating via `postMessage` RPC
**Performance Goals**:
- Dialog open: zero git RPCs except the existing `getCommitParents` call for merge commits (already in flight today)
- Mode switch / preview update: pure-function recompute; no re-renders beyond the dialog itself
- Revert execution: bounded by git CLI; the two-step `Edit message` path runs sequentially in the same `GitExecutor` (the second step only fires if the first succeeded and produced staged changes)
**Constraints**:
- Dirty working tree MUST refuse all three modes (spec FR-016, clarified Q1)
- Command preview MUST use canonical git syntax (`git revert <hash>` for Edit message); MUST NOT leak the two-step internal command (spec Command Preview Policy, clarified Q2)
- The `REVERT_HEAD`-based Continue/Abort recovery flow MUST stay attached to **Commit now** only (FR-013, FR-014). For the other two modes, conflict surfaces a one-shot error and the user recovers via the VS Code SCM panel
- The merge-commit parent picker MUST be inlined into the new dialog (FR-004); the old `RevertParentDialog.tsx` is removed
- No new dependencies, no auto-installs (constitution: agent restrictions)
**Scale/Scope**: ~14 source-file touches (13 modifications + 1 new + 1 deletion); ~120 LOC backend, ~250 LOC webview, ~150 LOC tests. One new file (`RevertDialog.tsx`), one deletion (`RevertParentDialog.tsx`). Touched files: `shared/types.ts`, `shared/errors.ts`, `shared/messages.ts`, `src/services/GitRevertService.ts`, `src/__tests__/GitRevertService.test.ts`, `src/WebviewProvider.ts`, `webview-ui/src/rpc/rpcClient.ts`, `webview-ui/src/stores/graphStore.ts`, `webview-ui/src/utils/gitCommandBuilder.ts`, `webview-ui/src/utils/__tests__/gitCommandBuilder.test.ts`, `webview-ui/src/components/CommitContextMenu.tsx`, `webview-ui/src/components/RevertDialog.tsx` (new), `webview-ui/src/components/RevertParentDialog.tsx` (deleted), `CLAUDE.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| I. Performance First | ✅ PASS | Dialog open does no new git calls (merge-commit `getCommitParents` already exists). Mode switch updates only the local dialog state. No new background polling, no new RPC handlers. |
| II. Clean Code & Simplicity | ✅ PASS | One service method refactor (no new method), one new dialog component (replaces two: the old direct-call path and the old `RevertParentDialog`). No premature abstraction (e.g., no shared "mode-radio" component — three call sites in the codebase don't justify it yet). Two-step `Edit message` implementation is kept inside `GitRevertService.revert()` — no separate "commit message manager" layer. |
| III. Type Safety & Explicit Error Handling | ✅ PASS | New `RevertMode` and `RevertOptions` types added to `shared/types.ts`. The `revert` RPC payload shape becomes `{ hash, options: RevertOptions }`. Service returns `Result<string, GitError>` for every path including the two-step `Edit message` flow. New `GitError` code for the conflict-without-REVERT_HEAD case (`REVERT_CONFLICT_NO_RECOVERY`). No new throw sites. |
| IV. Library-First & Purpose-Built Tools | ✅ PASS | No parsing of structured data introduced. No new dependencies. Reuses existing Radix Dialog (already used by `CherryPickDialog`), existing `CommandPreview` component, existing `validateHash`, existing `isConflictStderr`. |
| V. Dual-Process Architecture Integrity | ✅ PASS | All git I/O stays in `GitRevertService`. Two-step `Edit message` runs entirely backend-side; webview only sends the message string. New types added to `shared/types.ts` (single source of truth). No `vscode` imports in webview, no DOM manipulation in extension host. |

**Gate result**: All five principles satisfied. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/045-revert-mode-dialog/
├── plan.md              # This file
├── spec.md              # Feature spec (already written, post-clarify)
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — RevertMode / RevertOptions / RPC payload shape
├── quickstart.md        # Phase 1 — manual smoke-test recipe
├── contracts/
│   └── rpc-revert.md    # RPC `revert` request/response contract (updated payload)
├── checklists/
│   └── requirements.md  # From /speckit-specify + /speckit-clarify (complete)
└── tasks.md             # Generated by /speckit-tasks (NOT created here)
```

### Source Code (touched files)

```text
shared/
├── types.ts                                     # +RevertMode, +RevertOptions
├── messages.ts                                  # update `revert` payload shape
└── errors.ts                                    # +GitErrorCode 'REVERT_CONFLICT_NO_RECOVERY'

src/
├── services/
│   └── GitRevertService.ts                      # refactor revert() → 3 modes (two-step for Edit message)
├── WebviewProvider.ts                           # update case 'revert' to read new payload shape
└── __tests__/
    └── GitRevertService.test.ts                 # extend: 3 modes × (happy / conflict / empty / dirty)

webview-ui/src/
├── components/
│   ├── RevertDialog.tsx                         # NEW — clone of CherryPickDialog skeleton
│   ├── RevertParentDialog.tsx                   # DELETE — consolidated into RevertDialog
│   └── CommitContextMenu.tsx                    # open RevertDialog instead of direct revert call
├── stores/
│   └── graphStore.ts                            # +revertOptions slice + setter (mirror cherryPickOptions)
├── rpc/
│   └── rpcClient.ts                             # revert() signature: (hash, options: RevertOptions)
├── utils/
│   ├── gitCommandBuilder.ts                     # extend RevertCommandOptions with `mode`
│   └── __tests__/
│       └── gitCommandBuilder.test.ts            # extend: 3 modes × (with / without -m N)

```

**Structure Decision**: Follows the established VS Code-extension layout. The only structural changes are one new file (`RevertDialog.tsx`) and one deletion (`RevertParentDialog.tsx`). No new directories, no new top-level modules. Type definitions live in `shared/`, matching constitution principle III.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

**No violations.** This section is intentionally empty.
