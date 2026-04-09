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
├── WebviewProvider.ts   # Add getUncommittedChanges handler, modify getCommitDetails for UNCOMMITTED hash, modify openDiff for uncommitted files (resolve HEAD to real hash for git-show:// URI)
└── services/
    └── GitDiffService.ts  # getUncommittedDetails() refactored; added getUncommittedSummary() returning files + separate staged/unstaged/untracked counts

webview-ui/src/
├── stores/
│   └── graphStore.ts    # Add mergeUncommittedIntoCommits(), modify computeHiddenCommitHashes(), modify setCommits flow, auto-refresh details panel
├── rpc/
│   └── rpcClient.ts     # Add uncommittedChanges handler, add status param to openDiff()
├── components/
│   ├── CommitRow.tsx           # Add uncommitted node styling (italic + accent color) + context menu routing
│   ├── CommitTableRow.tsx      # Add uncommitted node styling + context menu routing + skip AuthorContextMenu for uncommitted
│   ├── GraphCell.tsx           # Add dashed circle + dashed edge rendering for uncommitted node
│   ├── CommitDetailsPanel.tsx  # Skip signature fetch for UNCOMMITTED hash, pass file status for uncommitted diffs
│   ├── FileChangeShared.tsx    # Redirect "open at commit" to openCurrentFile for uncommitted files
│   └── UncommittedContextMenu.tsx  # New: minimal context menu (Refresh only)
└── utils/
    ├── graphTopology.ts     # Add uncommitted node skip + post-loop finalization (stash pattern)
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
- **Staged/unstaged tracked files**: Left side = HEAD (resolved to actual commit hash via `getCommits({maxCount:1})`) via `git-show://HASH/...`, Right side = working directory file URI (`vscode.Uri.file()`). This shows combined changes against HEAD.
- **Untracked files**: Left side = empty content (`untitled:` scheme), Right side = working directory file URI. This shows "new file" diff.
- **Detection**: When `openDiff` receives `UNCOMMITTED_HASH`, the handler switches to this strategy instead of the normal commit-to-parent diff.

**Implementation note**: The `git-show://` content provider (`GitShowContentProvider`) validates the authority as a hex commit hash via `validateHash()`. Symbolic refs like `HEAD` are rejected, so the backend must resolve HEAD to its actual hash before constructing the URI. Similarly, the `untitled:` scheme is used for the empty left side of untracked files instead of `git-show://empty` which would also fail validation.

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

### D7: UNCOMMITTED_HASH Guard Rails

The synthetic `UNCOMMITTED` hash must never reach git commands that validate hashes. Multiple components needed guards:
- **`CommitDetailsPanel`**: `CommitSignatureSection` auto-fetches signature info for any displayed commit — skip for `UNCOMMITTED_HASH` to prevent `validateHash()` rejection.
- **`FileChangeShared`**: The "open at commit" action icon passes `commitHash` to `rpcClient.openFile()` — redirect to `openCurrentFile()` for uncommitted files.
- **`CommitTableRow`**: The author column wraps in `AuthorContextMenu` — skip for uncommitted to prevent "Add Author to filter" adding the placeholder `---` author.

**Principle**: Any frontend component that uses a commit hash for git operations must check for `UNCOMMITTED_HASH` and either skip the operation or provide a working-directory-aware alternative.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Topology miscalculation when uncommitted node at index 0 | Low | High | Follow stash pattern exactly; skip parent processing, post-loop finalize. Unit test topology with uncommitted node. |
| Performance regression with large uncommitted file counts | Low | Medium | getUncommittedDetails() runs three git commands — already optimized. File list in details panel uses existing rendering. No pagination needed for Phase 1. |
| Diff handler complexity for uncommitted files | Medium | Medium | Clear branching: if hash === UNCOMMITTED_HASH, use working-directory strategy. Existing GitShowContentProvider handles HEAD refs. |
| Auto-refresh flicker when details panel is open | Low | Low | Debounced refresh (1000ms) + fingerprint check prevents no-op updates. Panel content updates in-place. |
