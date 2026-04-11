# Implementation Plan: Uncommitted Node UX Polish

**Branch**: `038-uncommitted-node-ux` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/038-uncommitted-node-ux/spec.md`

## Summary

Polish the uncommitted-node UX in three places:

1. **"Select files for…" dialog** — replace the four stand-alone action buttons with a single radio group (Stage / Unstage / Discard / Stash with message) that drives one action button. Each radio row shows a live git command preview, the action button shows a live affected-file count, the Stash row supports an optional message input and auto-includes untracked (via `git add` + `git stash push`) and renamed files (per-pair). The dialog adds a busy state while a command runs, an inline error banner on failure, and a post-success refresh.
2. **Uncommitted-node context menu** — rename "Stash All Changes" → "Stash Everything…" and route it through the existing `StashDialog` confirmation flow (title updated).
3. **Uncommitted-node file rows in the details panel** — always render the Stage / Unstage arrow (skip the hover gate), and drop the redundant "Open file at this commit" icon for the uncommitted node only.

**Technical approach**: Frontend-only change in the webview, with a tiny additive hook on the backend so the selective-stash path that includes untracked files does `git add` + `git stash push` atomically. No new services, no new state stores. Existing components (`FilePickerDialog`, `StashDialog`, `DiscardAllDialog`, `CommandPreview`, `FileChangeShared`, `GitStashService`) are extended; no duplicates are created.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-radio-group`), Tailwind CSS (webview); esbuild (extension host); existing `GitExecutor`/`GitStashService` (backend)
**Storage**: N/A — transient Zustand state + dialog-local React state only. No new persisted UI state; no new `globalState` keys.
**Testing**: Vitest (unit tests for pure helpers: count/enable-rule logic, default-radio rule, default-stash-message builder, command-preview builder for the stash-with-untracked case)
**Target Platform**: VS Code Extension Host (node18 CJS) + webview (ESM, React 18), VS Code 1.80+
**Project Type**: VS Code extension (dual-process: extension host + webview)
**Performance Goals**: No measurable regression on the uncommitted node. Radio/preview re-computation is O(selected files) and runs only on selection change. File list refresh after a successful action reuses the existing `sendInitialData` path.
**Constraints**: Webview MUST NOT spawn git processes (Constitution V). Must keep the dialog responsive during a running git command (busy state + disabled inputs, Close stays enabled). Must preserve the behavior of the whole-uncommitted-set discard flow (`DiscardAllDialog` defaults unchanged).
**Scale/Scope**: Touches ~6 webview files, 1–2 backend files, and `shared/messages.ts`. Expected net code delta <600 LOC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Performance First | **PASS** | No new list virtualization needed (file list is already small and non-virtualized in the picker). Radio enable/disable rules and command previews are pure functions of the current selection — O(selected). Busy state disables inputs, not the whole React tree. |
| II. Clean Code & Simplicity | **PASS** | Reuses `StashDialog`, `DiscardAllDialog`, `CommandPreview` (with additive props) rather than cloning. New pure helpers live in `webview-ui/src/utils/` with single responsibilities (`computeRadioAvailability`, `buildDefaultStashMessage`, `buildSelectiveStashCommandPreview`). No speculative abstractions. |
| III. Type Safety & Explicit Error Handling | **PASS** | One new request message (`stashSelected`) is added to `shared/messages.ts`. Backend path returns `Result<T, GitError>`. Failure propagates via the existing `error` response and is rendered in an inline banner. No exceptions thrown across the boundary. |
| IV. Library-First | **PASS** | Radio group uses `@radix-ui/react-radio-group` (already part of the Radix family in use). No new dependencies proposed. Command preview re-uses `CommandPreview`. |
| V. Dual-Process Architecture Integrity | **PASS** | All git work stays in `GitStashService`. The webview only sends the `stashSelected` request with `{ message?, paths, includeAdd }` and renders the `Result`. No `require('vscode')` and no git subprocess calls cross the boundary. |

**Initial Constitution Check: PASS (no deviations).**
**Post-Design Constitution Check** — re-evaluated at end of Phase 1 below: still **PASS**. No violations introduced by the design artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/038-uncommitted-node-ux/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities & transitions
├── quickstart.md        # Phase 1 — manual validation walkthrough
├── contracts/
│   ├── rpc-messages.md  # New RPC: stashSelected request
│   └── component-props.md # Extended props for CommandPreview, DiscardAllDialog, StashDialog
└── tasks.md             # Phase 2 — produced by /speckit.tasks (not by this command)
```

### Source Code (repository root)

This feature touches the following existing paths (no new directories):

```text
shared/
├── messages.ts                    # ADD request type: stashSelected (message?, paths, addUntrackedFirst, renamedPaths)

src/                               # Backend — esbuild
├── WebviewProvider.ts             # ADD case 'stashSelected' → GitStashService.stashSelected
└── services/
    └── GitStashService.ts         # ADD stashSelected(): git add + git stash push; single Result return

webview-ui/src/
├── components/
│   ├── FilePickerDialog.tsx       # Overhauled: radio group, single action button, busy state, error banner, auto-included renames
│   ├── StashDialog.tsx            # Change title to "Stash Everything" (controlled title prop, default preserves "Stash All Changes")
│   ├── DiscardAllDialog.tsx       # Add optional title/description/confirmLabel/commandPreview overrides (defaults unchanged)
│   ├── CommandPreview.tsx         # Add optional showCopyButton and showLabel props (defaults true — existing callers unchanged)
│   ├── FileChangeShared.tsx       # UNCOMMITTED_HASH gate: always show stage/unstage arrow; hide "Open file at this commit" button
│   └── UncommittedContextMenu.tsx # Rename menu label to "Stash Everything…" and pass override title to StashDialog
├── utils/
│   ├── gitCommandBuilder.ts       # ADD buildSelectiveStageCommand, buildSelectiveUnstageCommand,
│   │                              # buildSelectiveDiscardCommand, buildSelectiveStashCommand (handles add+stash case)
│   └── stashMessage.ts            # NEW: buildDefaultStashMessage(fileCount, branchName)
└── stores/
    └── graphStore.ts              # READ-ONLY: already exposes current branch + uncommitted files — no changes required

webview-ui/src/components/__tests__/   # (Vitest) — ADDED:
├── filePickerRadioRules.test.ts       # radio enable/disable + default rule + count formulas incl. dual-state files
├── gitCommandBuilder.stash.test.ts    # selective stash preview with/without untracked
└── stashMessage.test.ts               # default-message formatting
```

**Structure Decision**: This is a VS Code extension (dual-process) — the existing `src/` (extension host) + `webview-ui/src/` (webview) + `shared/` layout is already in place and is the correct structure per the project constitution. The feature does NOT introduce a new top-level directory.

## Complexity Tracking

> No Constitution Check violations. This section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
