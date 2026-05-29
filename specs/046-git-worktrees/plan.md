# Implementation Plan: Git Worktree Management

**Branch**: `046-git-worktrees` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/046-git-worktrees/spec.md`

## Summary

Turn the existing read-only worktree plumbing into full create / open / list / remove management, driven from the graph UI (6 new RPC request types + 1 new response). Users right-click a branch (local or remote-only), commit, or tag → **Create worktree…**, confirm a dialog (branch-mode + editable path + live command preview), and the worktree opens in a **new IDE window**. A new **Worktree panel** (toggle in `ControlBar`, widget in `TogglePanel`) lists every worktree with open / reveal / remove actions and a panel-level **Prune** (with confirmation). A **graph-row badge** marks commits that are a worktree HEAD and supports multiple worktrees per commit. Removal goes through a confirm dialog with optional branch deletion (safe `-d`, escalate to `-D` on retry).

**Technical approach**: Extend `GitWorktreeService` with `addWorktree` / `removeWorktree` / `pruneWorktrees` and enrich `listWorktrees` with an `isCurrent` flag (path-match against the active repo). Branch deletion **reuses** `GitBranchService.deleteBranch` (no duplication). Path composition (basePath token + `..` resolution, anchored to the **main** worktree, sanitize + collision suffix) lives backend in a `resolveWorktreePath` helper exposed via RPC, keeping Node `path` logic out of the webview (Principle V). Open / reveal use new thin RPC handlers that call `vscode.commands.executeCommand('vscode.openFolder', …, { forceNewWindow: true })` and `revealFileInOS`. The collision-prone `worktreeByHead: Map<head, WorktreeInfo>` becomes `Map<head, WorktreeInfo[]>`. Two new dialogs (`CreateWorktreeDialog`, `RemoveWorktreeDialog`) follow the existing `*Dialog.tsx` + `CommandPreview` pattern; Prune reuses `ConfirmDialog`. Every successful add/remove/prune explicitly re-requests the worktree list + a graph refresh (watcher is unreliable for `.git/worktrees`).

## Technical Context

**Language/Version**: TypeScript 5.x (strict: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**:
- Backend: `vscode` host API (`commands.executeCommand`, `Uri`), Node 18 `child_process` via existing `GitExecutor`, Node `path`
- Webview: React 18, Zustand, `@radix-ui/react-context-menu`, `@radix-ui/react-alert-dialog`
**Storage**: N/A for app state. New persistent setting `speedyGit.worktree.basePath` (already registered in `package.json`) read via the existing settings provider. Worktree list is transient store state.
**Testing**: Vitest unit tests for `GitWorktreeService` (add/remove/prune/list-isCurrent parsing), the path-composition helper (sanitize, token expansion, main-anchor, collision suffix), and `gitCommandBuilder` worktree builders. Manual smoke test via "Run Extension".
**Target Platform**: VS Code 1.80+ (and forks: Cursor, etc.) on macOS / Linux / Windows; webview in sandboxed Chromium.
**Project Type**: VS Code extension — Node.js extension host (`src/`) + React webview (`webview-ui/src/`) over `postMessage` RPC, shared contracts in `shared/`.
**Performance Goals** (Principle I):
- Context-menu and dialog open: NO synchronous git call. Path suggestion via one async RPC that does not block dialog render.
- Badge lookup: O(1) per row via the pre-built `worktreeByHead` map (now array-valued) — no per-row git calls.
- Worktrees stored OUTSIDE the watched tree (sibling default) so a second full checkout never enters file-watcher / search / build traversal.
**Constraints**:
- Worktrees MUST live outside the working tree (sibling default path).
- Path composition MUST anchor to the **main** worktree, never the current one.
- The **main** and the **current** worktree MUST be non-removable.
- Refresh after add/remove/prune MUST be explicit (do not rely on `GitWatcherService`).
- All git failures surfaced as `Result<T, GitError>` with readable messages.
**Scale/Scope**: ~3 backend service methods + 6 new RPC request types (`addWorktree`, `removeWorktree`, `pruneWorktree`, `resolveWorktreePath`, `openWorktree`, `revealWorktree`) plus 1 new response (`worktreePathResolved`); 2 new dialogs, 1 panel widget, 1 row badge + context menu; store map-shape change; settings plumbing. Branch deletion reuses the existing `deleteBranch` RPC. No new dependencies. Est. ~350 LOC backend, ~600 LOC webview, ~150 LOC tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|-----------|-------|
| I. Performance First | ✅ PASS | Worktrees kept outside watched tree (sibling default) — protects watcher/search/build. Badge lookup O(1) from pre-built map. No git call on menu/dialog open; path suggestion is a single non-blocking RPC. Explicit refresh reuses existing `sendInitialData`. |
| II. Clean Code & Simplicity | ✅ PASS | Branch deletion reuses `GitBranchService.deleteBranch` (no new delete path). Prune reuses `ConfirmDialog`. Only two genuinely-new dialogs (create needs branch-mode/path inputs; remove needs force + nested branch-delete + retry — neither fits `ConfirmDialog`). No speculative lock/unlock (deferred per spec). |
| III. Type Safety & Explicit Error Handling | ✅ PASS | New service methods return `Result<T, GitError>`. New RPC variants added to `shared/messages.ts` unions; `WorktreeInfo` gains `isCurrent`; `UserSettings` gains `worktreeBasePath`. Branch-not-merged reuses existing `BRANCH_NOT_FULLY_MERGED` error code for the `-D` retry flow. |
| IV. Library-First & Purpose-Built Tools | ✅ PASS | Porcelain parsing already block-based (no regex). Ref sanitization is simple character mapping, not structured parsing. No new packages. Open/reveal use built-in VS Code commands, not shell. |
| V. Dual-Process Architecture Integrity | ✅ PASS | All git I/O + Node `path` composition stay backend in `GitWorktreeService` / helper. Webview only sends RPC and renders. `vscode.openFolder` / `revealFileInOS` invoked from the extension host, never the webview. New shared types in `shared/`. |

**Gate result**: All five principles satisfied. No Complexity Tracking entries required.

**One accepted limitation** (not a violation): VS Code exposes no API to enumerate folders open in *other* windows, so FR-017's "open in another window" warning is delivered as a static informational caution in the remove dialog rather than a detected condition. The *current* window's worktree IS detectable (path match) and is blocked from removal. See research.md R6.

## Project Structure

### Documentation (this feature)

```text
specs/046-git-worktrees/
├── plan.md              # This file
├── spec.md              # Feature spec (post-clarify)
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — entities, types, store shape, RPC map
├── quickstart.md        # Phase 1 — manual smoke-test recipe
├── contracts/
│   └── rpc-worktree.md  # RPC request/response contracts for all worktree ops
├── checklists/
│   └── requirements.md  # From /speckit-specify (complete)
└── tasks.md             # Generated by /speckit-tasks (NOT created here)
```

### Source Code (touched files)

```text
shared/
├── types.ts                     # WorktreeInfo +isCurrent; UserSettings +worktreeBasePath; DEFAULT_USER_SETTINGS
└── messages.ts                  # +RequestMessage: addWorktree, removeWorktree, pruneWorktree,
                                 #   resolveWorktreePath, openWorktree, revealWorktree
                                 # +ResponseMessage: worktreePathResolved (reuse success/error/worktreeList)

src/
├── services/
│   └── GitWorktreeService.ts    # +addWorktree, +removeWorktree, +pruneWorktrees;
                                 #   listWorktrees enriched with isCurrent; +resolveWorktreePath helper
├── utils/
│   └── gitValidation.ts         # +worktree path / new-branch-name validation (reuse validateRefName)
└── WebviewProvider.ts           # +RPC dispatch cases; explicit refresh after add/remove/prune;
                                 #   openFolder + revealFileInOS command calls; branch-delete via GitBranchService

webview-ui/src/
├── components/
│   ├── ControlBar.tsx           # +Worktree toggle button
│   ├── TogglePanel.tsx          # +render WorktreeWidget when active
│   ├── WorktreeWidget.tsx       # NEW — list rows, open/reveal/remove, panel-level prune
│   ├── CreateWorktreeDialog.tsx # NEW — source, branch-mode, path, command preview, open-in-new-window note
│   ├── RemoveWorktreeDialog.tsx # NEW — force warning, delete-branch + nested force, retry on unmerged
│   ├── BranchContextMenu.tsx    # +"Create worktree…" (local + remote-only)
│   ├── CommitContextMenu.tsx    # +"Create worktree…" (commit / tag badge)
│   ├── CommitRow.tsx / GraphCell# +worktree badge on rows whose head is a worktree HEAD
│   └── WorktreeBadgeMenu.tsx    # NEW — badge context menu, N "Open in new window" targets
├── stores/
│   └── graphStore.ts            # worktreeByHead → Map<string, WorktreeInfo[]>; setWorktreeList + setBatchData
├── rpc/
│   └── rpcClient.ts             # +addWorktree, removeWorktree, pruneWorktree, resolveWorktreePath,
                                 #   openWorktree, revealWorktree; handle worktreePathResolved
└── utils/
    └── gitCommandBuilder.ts     # +buildAddWorktreeCommand, buildRemoveWorktreeCommand, buildPruneWorktreeCommand
```

**Structure Decision**: Existing dual-process layout (`src/` backend, `webview-ui/src/` frontend, `shared/` contracts). The feature slots onto the established service + RPC + dialog + context-menu + toggle-widget patterns; no structural change.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
