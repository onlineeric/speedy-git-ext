# Idea: Uncommitted Changes Node

Show uncommitted changes as a first-class node in the git graph, so users can see working-tree state at a glance and inspect changed files just like any real commit.

## Motivation

Git Graph currently only shows committed history. Users frequently need to see what's changed in their working tree — staged, unstaged, and untracked files — without leaving the graph view. Other git graph tools (GitLens, Git Graph by mhutchie, GitKraken, Fork, SourceTree) all show an "uncommitted changes" or "working tree" node at the top of the graph. This is a widely expected feature.

## Existing Backend Support

`GitDiffService.getUncommittedDetails()` (`src/services/GitDiffService.ts:140`) already collects:
- **Staged changes** via `git diff --cached --name-status -z`
- **Unstaged changes** via `git diff --name-status -z`
- **Untracked files** via `git ls-files --others --exclude-standard -z`

It merges them into a `FileChange[]` with proper status mapping (added, modified, deleted, renamed, copied, untracked). Unstaged changes take precedence over staged when a file appears in both.

What's missing: this data is not exposed through the webview message protocol (`shared/messages.ts`) and not surfaced in the UI.

## Phase 1 Scope (Current)

### Graph Node

Display a synthetic "Uncommitted Changes" node at the **top of the graph** (index 0, above all commits and stashes).

| Field             | Value                                          |
|-------------------|------------------------------------------------|
| `hash`            | A well-known constant, e.g. `"UNCOMMITTED"`    |
| `abbreviatedHash` | `"---"`                                        |
| `parents`         | `[HEAD commit hash]` (the current branch tip)  |
| `author`          | `"---"`                                        |
| `authorEmail`     | `""`                                           |
| `authorDate`      | `Date.now()` (always newest)                   |
| `subject`         | `"Uncommitted Changes"` (or file count summary)|
| `refs`            | `[{ name: 'Uncommitted Changes', type: 'uncommitted' }]` |

### Visibility Rules

- **Always visible** when uncommitted changes exist (staged, unstaged, or untracked files present).
- **Hidden** when the working tree is clean (no changes at all).
- **Not affected by filters** — bypass author filter, date filter, text filter, and branch filter. Same treatment as stash nodes in `computeHiddenCommitHashes()`.
- Should **disappear automatically** when the working tree becomes clean (e.g. after a commit, stash, or checkout). The `GitWatcherService` file-system watcher already triggers refreshes that will handle this.

### Visual Appearance

- The node should be **visually distinct** from regular commits so it's immediately recognizable:
  - Different node style (e.g. dashed circle outline, or filled with a distinct color/icon).
  - The subject text could be italic or use a muted/accent color.
- Should connect to HEAD via a graph edge (dashed line to indicate it's not a real commit).
- Should sit on the **same lane as HEAD** since it's logically "above" the current branch tip.

### Commit Details Panel

When the uncommitted node is clicked/selected, the **Commit Details Panel** should open and display file changes **exactly like a real commit**, including:

- **File list**: all staged + unstaged + untracked files, shown in both list and tree view modes.
- **File status badges**: added, modified, deleted, renamed, untracked — using existing `FileStatusBadge` component.
- **Diff support**: clicking a file should open a diff view:
  - For staged/unstaged files: diff against HEAD.
  - For untracked files: show the full file content (or a "new file" diff).
- **Stats**: total additions/deletions across all changes (if available from the backend).
- **Metadata section**: show "Uncommitted Changes" as subject, `"---"` for author/hash, current timestamp for date.

### Data Flow

1. **New message type**: Add `getUncommittedChanges` to `RequestMessage` and `uncommittedChanges` (with `FileChange[]` payload) to `ResponseMessage` in `shared/messages.ts`.
2. **WebviewProvider handler**: On `getUncommittedChanges`, call `gitDiffService.getUncommittedDetails()` and respond.
3. **Synthetic commit creation**: Follow the existing **stash merging pattern** in `graphStore.ts` (`mergeStashesIntoCommits`). Create a similar function that:
   - Converts the `FileChange[]` into a synthetic `Commit` object.
   - Prepends it at index 0 of the merged commits array.
   - Sets `parents: [headCommitHash]` so topology connects it to HEAD.
4. **Commit details for uncommitted node**: When `getCommitDetails` is called with hash `"UNCOMMITTED"`, the backend should call `getUncommittedDetails()` and return a `CommitDetails` object with the file list and stats. This makes the details panel work transparently.
5. **Topology**: The graph algorithm processes commits top-to-bottom (newest first). The uncommitted node at index 0 will naturally get assigned to the HEAD lane. Its single parent edge connects down to HEAD.
6. **Refresh lifecycle**: `GitWatcherService` already watches for file changes. On refresh, re-fetch uncommitted status. If clean, omit the node. If dirty, include/update it.

### Type Changes

- Add `'uncommitted'` to `RefType` union in `shared/types.ts`.
- Components that switch on `ref.type` (CommitRow, CommitTableRow, context menus) need to handle the new type.
- Consider adding an `isUncommitted(commit)` helper (check `commit.hash === 'UNCOMMITTED'`) for readability.

### Context Menu

- The uncommitted node should **not** show the standard `CommitContextMenu` (no checkout, reset, cherry-pick, revert, etc. — these don't apply to uncommitted changes).
- For Phase 1: either show **no context menu**, or a minimal one with just "Refresh".
- Phase 2 will add meaningful actions (see below).

## Phase 2 (Future)

Actions available from the uncommitted node's context menu or details panel:

- **Stash**: stash all changes (or selected files).
- **Discard changes**: discard all or selected unstaged changes.
- **Stage / Unstage**: stage or unstage individual files.
- **Compare to commit**: diff working tree against any selected commit.
- **Compare to branch**: diff working tree against a branch tip.
- **Commit**: open VS Code's built-in SCM commit flow (or a quick-commit dialog).

## Phase 2+ (Future Ideas)

- Show **staged vs unstaged** as separate visual indicators (e.g. two sub-sections in the details panel, or separate badge counts).
- Show change **summary in the node label** (e.g. "3 staged, 2 unstaged, 1 untracked").
- Keyboard shortcut to quickly jump to the uncommitted node.
- Right-click a file in the details panel to open, stage, unstage, or discard it.

## Reference: How Other Tools Handle This

| Tool          | Behavior |
|---------------|----------|
| **GitKraken** | Shows "// WIP" node at top with file count, dashed connection to HEAD |
| **Fork**      | "Uncommitted Changes" row at top, shows staged/unstaged tabs in details |
| **SourceTree** | "Uncommitted changes" at top, file list with stage/unstage checkboxes |
| **Git Graph (mhutchie)** | Shows "Uncommitted Changes" as top row with asterisk marker |
| **GitLens**   | Shows working tree changes inline in the graph |

## Key Implementation Notes

- The **stash pattern** (`mergeStashesIntoCommits` in `graphStore.ts:214`) is the exact blueprint. The uncommitted node is another synthetic commit, but inserted at index 0 instead of at its parent position.
- The backend method `getUncommittedDetails()` already handles the hard part (merging staged/unstaged/untracked). The work is mostly wiring it through the message protocol and building the UI integration.
- Use a **well-known constant hash** (e.g. `"UNCOMMITTED"`) so all layers can identify this node cheaply without parsing refs.
- The `openDiff` handler in `WebviewProvider` will need to handle the `"UNCOMMITTED"` hash specially — diff against HEAD instead of diffing between commits.
