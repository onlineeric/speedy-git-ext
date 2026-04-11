# Research: Uncommitted Node Features

## R1: Git Commands for Staging Operations

**Decision**: Use standard git porcelain commands via GitExecutor for all staging operations.

**Commands identified**:
- Stage files: `git add -- <paths>`
- Stage all: `git add -A`
- Unstage files: `git reset HEAD -- <paths>`
- Unstage all: `git reset HEAD`
- Discard unstaged (tracked): `git checkout -- <paths>`
- Discard unstaged (untracked): `git clean -f -- <paths>`
- Discard all unstaged (tracked): `git checkout -- .`
- Discard all unstaged (untracked): `git clean -fd`
- Stash with message: `git stash push --include-untracked -m "<message>"`
- Stash without message: `git stash push --include-untracked`

**Rationale**: These are standard, well-tested git commands. All are fast operations on the local index/working tree (no network I/O). The existing GitExecutor with 30s timeout is more than sufficient.

**Alternatives considered**: Using `git update-index` for lower-level staging — rejected as unnecessary complexity for no performance benefit.

## R2: Separating Staged vs Unstaged File Data

**Decision**: Modify `getUncommittedSummary()` to return separate `stagedFiles` and `unstagedFiles` arrays instead of a merged `files` array. Add a `stageState` field to `FileChange` type.

**Rationale**: The backend already runs separate git commands for staged (`git diff --cached`) and unstaged (`git diff`) changes. Currently, results are merged with unstaged taking precedence. Simply returning them as separate lists requires minimal backend change and gives the frontend exactly what it needs.

**Alternatives considered**:
- Adding a `stageState` field only and keeping a single array — rejected because it complicates frontend filtering and doesn't handle partially staged files cleanly.
- Sending three separate arrays (staged, unstaged, untracked) — considered but untracked files naturally belong in the unstaged category for display purposes. Decision: include untracked in the unstaged array with their existing `'untracked'` status.

## R3: Conflict State Detection

**Decision**: Detect conflict state by checking for sentinel files in `.git/` directory and listing conflicted files via `git diff --name-only --diff-filter=U`.

**Detection logic**:
- `.git/MERGE_HEAD` exists → merge conflict
- `.git/REBASE_HEAD` or `.git/rebase-merge/` or `.git/rebase-apply/` exists → rebase conflict
- `.git/CHERRY_PICK_HEAD` exists → cherry-pick conflict
- Conflicted files: `git diff --name-only --diff-filter=U`

**Rationale**: File existence checks are near-instant. The `--diff-filter=U` flag is the standard way to list unmerged files. This approach is used by VS Code's built-in git extension and other git GUIs.

**Alternatives considered**: Parsing `git status --porcelain` for `UU`/`AA`/`DD` markers — viable but more complex to parse and provides less structured output.

## R4: Staged File Content Viewing

**Decision**: Use `git show :<path>` to retrieve the staged (index) version of a file, as opposed to `git show <hash>:<path>` for committed versions or reading the working tree directly.

**Rationale**: The `:` prefix (no commit hash) is git's standard syntax for the index/staging area. This is the exact content that would be committed. The existing `openDiff` and `openFile` RPC handlers can be extended with a `staged` flag to select this behavior.

**Alternatives considered**: Using `git diff --cached` to show the diff — this shows the diff, not the file content. The `git show :` approach gives the full file content which is needed for the content provider.

## R5: Refresh Strategy After Mutations

**Decision**: Trigger explicit refresh via `sendInitialData()` after every mutation operation, consistent with the existing pattern used by checkout, merge, rebase, stash apply/pop/drop, etc.

**Rationale**: The existing codebase already uses `sendInitialData()` after every write operation (confirmed in WebviewProvider.ts for mergeBranch, checkoutBranch, applyStash, popStash, dropStash, rebase, etc.). This is the established pattern and ensures complete UI consistency. The `GitWatcherService` file watcher provides supplementary refresh for external changes but is not relied upon as the primary refresh mechanism for extension-initiated mutations.

**Alternatives considered**: Relying solely on file watcher for refresh — rejected because it introduces latency and potential missed events. The explicit refresh pattern is already proven in the codebase.

## R6: New Backend Service vs Extending Existing

**Decision**: Create a new `GitIndexService` for staging, unstaging, and discarding operations. Keep conflict detection in `GitDiffService` since it's a read operation related to diff/status.

**Rationale**: Single responsibility principle — `GitDiffService` is for reading diff/status data. Staging/unstaging/discarding are write operations on the git index. A dedicated `GitIndexService` keeps the separation clean and follows the pattern of other services (GitBranchService for branch ops, GitStashService for stash ops, etc.).

**Alternatives considered**: Adding methods to `GitDiffService` — rejected because it would mix read and write responsibilities. Adding to `GitStashService` — rejected because staging/discarding are not stash operations.

## R7: File Picker Dialog Design

**Decision**: Build as a Radix UI Dialog component with grouped checkboxes (staged/unstaged sections), consistent with existing dialog patterns (CherryPickDialog, DropCommitDialog). Action buttons at the bottom, disabled when no files selected.

**Rationale**: Follows existing extension dialog patterns. Radix UI Dialog provides accessibility and portal rendering. Grouping by staged/unstaged status (per clarification Q3) gives users context about each file's current state.

**Alternatives considered**: VS Code's native `QuickPick` API — rejected because it would require backend-driven UI which breaks the webview-first architecture pattern.
