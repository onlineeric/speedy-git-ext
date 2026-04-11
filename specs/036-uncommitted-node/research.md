# Research: Uncommitted Changes Node

**Feature**: 036-uncommitted-node | **Date**: 2026-04-09

## R1: Stash Pattern as Blueprint

**Decision**: Follow the existing stash-node pattern for synthetic commit injection, topology handling, filter bypass, and context menu routing.

**Rationale**: The stash pattern is a proven, production-tested approach within this codebase for adding non-commit nodes to the graph. It handles all the same concerns: synthetic commit creation, lane assignment without disrupting topology, filter exemption, and dedicated context menus. Reusing this pattern minimizes risk and keeps the code consistent.

**Alternatives considered**:
- **Custom node type outside commit array**: Would require changes to virtual scrolling, row rendering, and topology — high risk, high effort for no benefit.
- **Backend-generated synthetic commit**: Would push frontend concern (graph presentation) into backend, violating Principle V (dual-process architecture).

## R2: Diff Strategy for Uncommitted Files

**Decision**: Use HEAD as left side and working directory file URI as right side for tracked files. Use empty content as left side for untracked files.

**Rationale**: The existing `openDiffEditor()` uses `git-show://` URI scheme which calls `git show HASH:path`. For HEAD, this works directly (`git show HEAD:path`). For the working directory, VS Code's `vscode.Uri.file()` provides the current file content without any git command. This is the simplest approach that works with VS Code's built-in diff editor.

**Alternatives considered**:
- **Staged vs unstaged separate diffs**: Would diff staged against index, unstaged against HEAD. More accurate but adds complexity; deferred to Phase 2 per spec scope.
- **Custom diff provider**: Unnecessary — VS Code's built-in `vscode.diff` command handles URI-based diffs natively.

## R3: Data Fetch Timing

**Decision**: Fetch uncommitted status during the existing refresh cycle (parallel with commits, branches, stashes) via `sendInitialData()`.

**Rationale**: Adding `getUncommittedDetails()` to the existing parallel fetch batch in `sendInitialData()` adds negligible latency. The three git commands it runs (`git diff --cached`, `git diff`, `git ls-files --others`) are lightweight for typical working trees. No separate polling mechanism needed — the file watcher already triggers refreshes on `.git/index` changes.

**Alternatives considered**:
- **Separate polling interval**: Adds complexity, potential race conditions with main refresh, and violates YAGNI. The file watcher already covers all relevant change events.
- **On-demand fetch only**: Would mean the node appears late (after user interaction) rather than immediately on graph load. Doesn't meet SC-001 (identify within 1 second).

## R4: Uncommitted Node Identifier

**Decision**: Use string constant `UNCOMMITTED` as the hash. Export from `shared/types.ts` as `UNCOMMITTED_HASH`.

**Rationale**: A well-known constant is the simplest way to identify the synthetic node across all layers. String `UNCOMMITTED` cannot collide with real SHA-1/SHA-256 hashes (which are hex-only). Exporting from shared/types.ts ensures both backend and frontend use the same value.

**Alternatives considered**:
- **UUID or random string**: No benefit over a deterministic constant; harder to debug.
- **Special prefix like `0000000`**: Could theoretically collide with abbreviated hashes; less readable in logs.

## R5: Subject Line Format

**Decision**: Dynamic categorized count: "Uncommitted Changes (3 staged, 2 modified, 1 untracked)". Zero-count categories omitted.

**Rationale**: Confirmed in clarification session. Categorized counts give users immediate insight without clicking the node. The data is already available from `getUncommittedDetails()` — just needs counting by status category. The categories map to: staged (from `git diff --cached`), modified/deleted/renamed (from `git diff`), untracked (from `git ls-files --others`).

**Category mapping**:
- "staged": count of files from the staged diff (all statuses)
- "modified": count of unstaged files with status 'modified'
- "deleted": count of unstaged files with status 'deleted'
- "untracked": count of files with status 'untracked'
- Other unstaged statuses (renamed, copied) included by their status name

## R6: Visual Distinction Approach

**Decision**: Dashed node circle + dashed edge to HEAD + italic subject with accent color + unique ref badge color.

**Rationale**: Dashed elements are a widely understood visual convention for "provisional" or "not-yet-committed" state (used by GitKraken, diagramming tools). Combined with italic text (already used for stashes) and a distinct color, this creates a clear visual hierarchy: solid = committed, dashed = uncommitted, italic = synthetic. The accent color should differ from both the 8 cycling lane colors and the stash styling color to avoid confusion.

**Alternatives considered**:
- **Different shape (diamond, square)**: Would require significant changes to GraphCell SVG rendering; circles are the only shape in the current graph.
- **Icon overlay**: Would add complexity to SVG rendering and might not scale well at 28px row height.

## R7: Branch Filter Integration

**Decision**: Uncommitted node respects branch filter — only shown when HEAD branch is in the active filter. Bypasses author, date, and text filters.

**Rationale**: Confirmed in clarification session. When a user filters to view a specific branch, showing unrelated working tree changes at the top is confusing. The uncommitted node logically belongs to the current branch. Author/date/text filters are bypassed because the node has no real author or date, and hiding it by text search would be unexpected.

**Implementation approach**: Check branch filter in `mergeUncommittedIntoCommits()` before injecting the node, rather than in `computeHiddenCommitHashes()`. This avoids creating and immediately hiding the node.

## R8: UNCOMMITTED_HASH Guard Rails

**Decision**: Any frontend component that uses a commit hash for git operations must check for `UNCOMMITTED_HASH` and either skip the operation or provide a working-directory-aware alternative.

**Rationale**: Discovered during smoke testing. The synthetic `UNCOMMITTED` string fails `validateHash()` (which expects hex-only, 4-40 chars). Multiple components blindly pass the selected commit hash to backend operations:
- `CommitSignatureSection` auto-fetches `getSignatureInfo(hash)` on render
- `FileChangeShared.handleOpenAtCommit` calls `openFile(commitHash, path)`
- `CommitTableRow` wraps the author column in `AuthorContextMenu` (adds `---` to filter)
- `openDiffEditor` used symbolic `HEAD` in `git-show://` URI (provider validates as hash)

**Mitigation pattern**: Guard with `hash === UNCOMMITTED_HASH` at the call site. For diff, resolve HEAD to actual hash. For file open, redirect to `openCurrentFile()`. For signature/author, skip entirely.
