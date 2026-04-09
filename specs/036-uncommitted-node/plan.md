# Implementation Plan: Uncommitted Changes Node

**Branch**: `036-uncommitted-node` | **Date**: 2026-04-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/036-uncommitted-node/spec.md`

## Summary

Add a synthetic "Uncommitted Changes" node at the top of the git graph when the working tree has changes. The node displays a dynamic subject line with categorized file counts, connects to HEAD via a graph edge, and opens the existing commit details panel with full file inspection and diff support. Implementation follows the proven stash-node pattern: synthetic commit injection, topology post-processing, filter bypass, and dedicated context menu handling.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 18, Zustand, @tanstack/react-virtual, Radix UI, Tailwind CSS (webview); esbuild (extension host)
**Storage**: N/A (in-memory Zustand state only)
**Testing**: Vitest (unit tests)
**Target Platform**: VS Code Extension (1.80+), cross-platform (Windows, macOS, Linux)
**Project Type**: VS Code extension (dual-process: Node.js backend + React webview)
**Performance Goals**: <5% graph render time increase (SC-005); no additional latency beyond existing watcher debounce (SC-004)
**Constraints**: Must follow dual-process architecture (Principle V); all git I/O via GitExecutor with 30s timeout; graph topology stays in webview
**Scale/Scope**: Typical working trees up to hundreds of changed files; 500+ commit graphs with virtual scrolling

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Uncommitted node is one synthetic commit added at index 0. No additional git commands during render — data fetched once during refresh cycle. Virtual scrolling unaffected. Topology adds O(1) post-processing (same as stash pattern). |
| II. Clean Code & Simplicity | PASS | Follows existing stash pattern (mergeStashesIntoCommits blueprint). No new abstractions — extends existing patterns. Single `UNCOMMITTED_HASH` constant, one helper function, minimal conditional logic. |
| III. Type Safety & Explicit Error Handling | PASS | New `'uncommitted'` RefType added to shared/types.ts. New message types added to shared/messages.ts with compile-time maps. getUncommittedDetails() already returns Result<T, GitError>. |
| IV. Library-First & Purpose-Built Tools | PASS | No new dependencies required. All rendering uses existing React/Tailwind/Radix stack. Git data fetched via existing GitDiffService. |
| V. Dual-Process Architecture | PASS | Backend: GitDiffService.getUncommittedDetails() handles git I/O. Frontend: synthetic commit injection, topology, rendering. Communication via messages.ts protocol only. Shared types in shared/types.ts. |
| Agent Restrictions | PASS | No auto-installs. No commits/merges/pushes. |

**Gate result: ALL PASS** — no violations, no complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/036-uncommitted-node/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
shared/
├── types.ts             # Add 'uncommitted' to RefType, UNCOMMITTED_HASH constant
└── messages.ts          # Add getUncommittedChanges/uncommittedChanges message types

src/
├── WebviewProvider.ts   # Add getUncommittedChanges handler, modify getCommitDetails for UNCOMMITTED hash, modify openDiff for uncommitted files
└── services/
    └── GitDiffService.ts  # getUncommittedDetails() already exists; add getUncommittedCommitDetails() wrapper

webview-ui/src/
├── stores/
│   └── graphStore.ts    # Add mergeUncommittedIntoCommits(), modify computeHiddenCommitHashes(), modify setCommits flow
├── components/
│   ├── CommitRow.tsx        # Add uncommitted node styling (italic + accent color)
│   ├── CommitTableRow.tsx   # Add uncommitted node styling
│   ├── GraphCell.tsx        # Add dashed edge rendering for uncommitted node
│   ├── CommitDetailsPanel.tsx  # Handle UNCOMMITTED hash for details fetch + auto-update
│   └── UncommittedContextMenu.tsx  # New: minimal context menu (Refresh only)
└── utils/
    ├── graphTopology.ts     # Add uncommitted node skip + post-loop finalization (stash pattern)
    ├── filterUtils.ts       # Exempt uncommitted from author/text filters; respect branch filter
    └── uncommittedUtils.ts  # New: isUncommitted() helper, buildUncommittedSubject(), UNCOMMITTED_HASH constant re-export
```

**Structure Decision**: Follows existing architecture exactly. One new component (UncommittedContextMenu), one new utility file (uncommittedUtils.ts). All other changes are modifications to existing files following established patterns.

## Design Decisions

### D1: Follow the Stash Pattern

The stash node implementation is the exact blueprint:
- **Synthetic commit creation**: `mergeStashesIntoCommits()` at `graphStore.ts:214` converts StashEntry → Commit. We create `mergeUncommittedIntoCommits()` that converts FileChange[] → Commit at index 0.
- **Topology post-processing**: Stashes skip parent processing in main loop (`graphTopology.ts:136-148`) and finalize connections in post-loop (`graphTopology.ts:301-314`). Uncommitted node follows identical pattern.
- **Filter bypass**: Stashes bypass author/text filters via `computeHiddenCommitHashes()` (`graphStore.ts:52`). Uncommitted node adds same check plus branch filter awareness.
- **Context menu routing**: Stash rows wrap in `StashContextMenu` instead of `CommitContextMenu`. Uncommitted rows wrap in `UncommittedContextMenu`.

### D2: Diff Strategy for Uncommitted Files

The existing `openDiffEditor()` (`WebviewProvider.ts:1504-1517`) uses `git-show://` URI scheme with commit hashes. For uncommitted files:
- **Staged/unstaged tracked files**: Left side = `HEAD` via `git-show://HEAD/...`, Right side = working directory file URI (`vscode.Uri.file()`). This shows combined changes against HEAD.
- **Untracked files**: Left side = empty content (file doesn't exist in HEAD), Right side = working directory file URI. This shows "new file" diff.
- **Detection**: When `openDiff` receives `UNCOMMITTED_HASH`, the handler switches to this strategy instead of the normal commit-to-parent diff.

### D3: Uncommitted Data Fetch Timing

Uncommitted status is fetched during the refresh cycle alongside commits, branches, and stashes — not as a separate polling mechanism. The `sendInitialData()` method in WebviewProvider already fetches multiple data types in parallel. Adding `getUncommittedDetails()` to this parallel batch keeps latency minimal.

The webview receives uncommitted data via a new `uncommittedChanges` response message and stores it in the Zustand store. The synthetic commit is created and merged in the store action, not on the backend.

### D4: Auto-Update Details Panel

When the uncommitted node is selected and a refresh occurs:
1. The store receives new uncommitted data and updates the synthetic commit.
2. If `selectedCommitHash === UNCOMMITTED_HASH`, the details panel re-fetches via `getCommitDetails(UNCOMMITTED_HASH)` — the backend handler (D2 getCommitDetails modification) transparently calls `getUncommittedDetails()` and returns a synthetic CommitDetails. This avoids special-case logic in the frontend.
3. The panel stays open with updated content — no selection reset.

### D5: Visual Distinction

- **Node circle**: Dashed stroke (strokeDasharray) instead of solid, using a dedicated accent color distinct from the 8 cycling lane colors.
- **Edge to HEAD**: Dashed line (strokeDasharray: '4 3') to indicate non-real commit relationship.
- **Subject text**: Italic style + description foreground color (same pattern as stash nodes, but with different color for distinction).
- **Ref badge**: "Uncommitted Changes" badge with unique background color (not matching branch, tag, or stash badge colors).

### D6: Branch Filter Awareness

Unlike stashes (which bypass all filters), the uncommitted node respects the branch filter:
- In `computeHiddenCommitHashes()`: skip hiding for author/text filters (like stashes).
- Separately, in `mergeUncommittedIntoCommits()`: only inject the node if no branch filter is active OR the HEAD branch is in the active branch filter set.
- This requires passing the current HEAD branch name and active branch filter to the merge function.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Topology miscalculation when uncommitted node at index 0 | Low | High | Follow stash pattern exactly; skip parent processing, post-loop finalize. Unit test topology with uncommitted node. |
| Performance regression with large uncommitted file counts | Low | Medium | getUncommittedDetails() runs three git commands — already optimized. File list in details panel uses existing rendering. No pagination needed for Phase 1. |
| Diff handler complexity for uncommitted files | Medium | Medium | Clear branching: if hash === UNCOMMITTED_HASH, use working-directory strategy. Existing GitShowContentProvider handles HEAD refs. |
| Auto-refresh flicker when details panel is open | Low | Low | Debounced refresh (1000ms) + fingerprint check prevents no-op updates. Panel content updates in-place. |
