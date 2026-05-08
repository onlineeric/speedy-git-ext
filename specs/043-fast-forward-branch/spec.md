# Feature Specification: Fast-forward Local Branch from Remote

**Feature Branch**: `043-fast-forward-branch`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "add a new feature Fast-forward Local Branch from Remote. this feature is similar to Pull for a local branch, but not checkout the branch, only pull remote commits into local. In this case I don't need to check out a local branch and I can update it to latest commit on the remote. The git command will be `fetch origin branch-A:branch-A`, which my current checked out branch is not branch-A, so branch-A updated to latest commit on the remote. On the UI, when right click on a local branch, add a new option to the right click menu 'Fast-forward Local Branch from Remote', click on it, display a common dialog like other command dialog. On the dialog, display a message to explain the action. Display the Command preview same as other dialog. This new option should only appear when the right click on branch badge is a Local branch, not a remote branch, not a mix of local and remote branch badge. There is a question that when right click on a local branch, do we have info on hand that we know this branch has a remote branch or not? Performance first."

## Clarifications

### Session 2026-05-08

- Q: How should the system decide whether to show the menu item on a local branch badge? → A: Always show on any local-branch context (including merged-branch badges) — no client-side filter on whether a remote counterpart exists. If no remote ref matches at fetch time, surface git's error verbatim. This overrides the original spec input's "not on a mix of local and remote" constraint, on the basis that the merged-branch case is exactly when fast-forward is meaningful and that filtering adds visibility logic without preventing the rare "stale list" failure anyway. The currently checked-out branch remains excluded (git rejects `fetch X:X` for the current branch; "Pull Branch" already handles that case).
- Q: Which remote should the dialog use for the fetch command when multiple (or zero) remote counterparts exist? → A: Auto-pick deterministically: prefer the remote named `origin` if present in the loaded remote list; otherwise use the first remote in alphabetical order. The dialog displays no remote-selector control. If the repo has zero remotes, fall back to literal `origin` in the command preview and let git surface the error.
- Q: What should happen when the local branch has diverged from the remote (non-fast-forward rejection)? → A: Surface git's rejection message verbatim through the standard error-toast path; the local branch is left unchanged. The dialog offers no "force" option; the user must resolve manually (e.g., reset/rebase via terminal, or delete + re-checkout). No pre-detection of divergence is performed (would require an extra git call that conflicts with the performance-first principle).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fast-forward a non-checked-out local branch from its remote (Priority: P1)

A developer is working on a feature branch and notices that another local branch (e.g., `dev` or `main`) has progressed on the remote. They want to bring that local branch up to date with the remote without leaving their current branch (no checkout, no stashing of uncommitted work).

The developer right-clicks the local branch badge in the graph and selects "Fast-forward Local Branch from Remote." A dialog appears with a brief explanation and a live command preview (e.g., `git fetch origin dev:dev`). After confirming, the local branch is updated in place to match its remote counterpart, and the graph refreshes to reflect the new tip. The user's current branch and working tree remain untouched.

**Why this priority**: This is the core value of the feature — it removes the friction of "stash → checkout → pull → checkout back → unstash" that users currently endure to keep secondary branches up to date. It must work end-to-end on its own to deliver any value.

**Independent Test**: With a repo that has a local branch behind its remote counterpart and the user currently on a different branch, right-click the stale local branch, confirm the dialog, and verify the local branch hash advances to the remote tip while the current branch and working tree are unchanged.

**Acceptance Scenarios**:

1. **Given** a local branch `feature-x` exists with a matching remote counterpart that is ahead, **and** the user is currently on a different branch (`dev`), **When** the user right-clicks the `feature-x` badge and confirms the fast-forward dialog, **Then** `feature-x` is updated to the remote tip, no checkout occurs, and the graph reflects the new commit.
2. **Given** the user has uncommitted changes in the working tree on the current branch, **When** the user fast-forwards a different local branch from its remote, **Then** the working tree is preserved unchanged and no stash is created.
3. **Given** the local branch is already at the same commit as its remote, **When** the user triggers the fast-forward, **Then** the system reports "already up to date" without error and the graph state is unchanged.

---

### User Story 2 - Clear intent via confirmation dialog with command preview (Priority: P2)

A cautious developer wants to understand what command will be run before any action is taken. When they trigger the menu option, the dialog clearly explains that this updates the local branch to match its remote (no working-tree side effects) and shows the exact git command that will execute.

**Why this priority**: Builds trust and reduces fear of "what just happened?" — particularly important for an operation that mutates a branch the user is not currently on. Required for parity with other operation dialogs in the extension (e.g., Push, Merge, Rebase).

**Independent Test**: Trigger the menu option on a qualifying local branch and verify that the dialog shows: (a) a plain-language explanation of the action, (b) the target branch name, and (c) a live command preview matching the actual git command that will be executed.

**Acceptance Scenarios**:

1. **Given** the user right-clicks a qualifying local branch, **When** the dialog opens, **Then** the dialog title names the action, the body explains that the local branch will be updated to its remote tip without checkout, and a command preview shows the exact git command (e.g., `git fetch origin feature-x:feature-x`).
2. **Given** the dialog is open, **When** the user clicks Cancel, **Then** no git command is executed and the dialog closes.

---

### User Story 3 - Menu option appears only when applicable (Priority: P2)

The menu option should only be visible in contexts where the operation is meaningful and likely to succeed. The user should not see the option on remote-only badges, on the currently checked-out branch (where the operation is rejected by git), or on tags/stashes/uncommitted nodes.

**Why this priority**: An option that appears but always fails (or that appears in nonsensical contexts) erodes trust in the UI. Filtering visibility client-side using already-loaded branch data preserves the "performance first" principle by avoiding any synchronous git call when the user opens the context menu.

**Independent Test**: Open the context menu on each badge variant in a test repo (local-only, remote-only, merged local+remote, tag, stash, uncommitted, currently-checked-out branch) and verify the option appears only on the correct subset.

**Acceptance Scenarios**:

1. **Given** a local branch badge whose branch has a remote counterpart visible in the loaded branch list, **When** the user right-clicks it, **Then** the "Fast-forward Local Branch from Remote" option appears.
2. **Given** a remote-only branch badge, a tag, a stash entry, or the uncommitted-changes node, **When** the user right-clicks it, **Then** the option does **not** appear.
3. **Given** the badge represents the currently checked-out local branch, **When** the user right-clicks it, **Then** the option does **not** appear (the existing "Pull Branch" action covers this case, and `git fetch origin X:X` is rejected for the current branch).
4. **Given** a local branch with no matching remote counterpart, **When** the user right-clicks it, **Then** the option **still** appears. **When** the user confirms the dialog, **Then** the system runs the fetch, git returns "couldn't find remote ref ...", and the error is surfaced to the user verbatim with the local branch unchanged.

---

### Edge Cases

- **Diverged branches (non-fast-forward)**: If the local branch has commits that the remote does not, `git fetch <remote> <branch>:<branch>` is rejected by git. The system surfaces git's rejection message verbatim via the standard error-toast path; the local branch is left unchanged and no force option is offered. The user must resolve manually (e.g., reset/rebase via terminal, or delete + re-checkout the branch from the remote).
- **Multiple remotes**: A local branch may have counterparts on multiple remotes (e.g., both `origin/feature-x` and `upstream/feature-x`). The dialog auto-picks `origin` if present, else the first remote alphabetically — no remote-selector UI is shown. Users who need to fetch from a non-default remote can do so via terminal.
- **Stale loaded branch list**: The webview's branch list is fetched at load/refresh time, so it can briefly diverge from on-disk reality (e.g., the remote ref was just deleted in another tool). The fetch may fail; the user must see a clean error and the branch list should be refreshed afterwards.
- **Remote unreachable / auth failure**: Network or credentials can fail. The error path should mirror existing extension conventions (toast / error surface) without leaving the UI in a loading state.
- **Single-commit no-op**: When the local branch already matches the remote tip, the operation completes silently as a no-op and the user gets a brief "already up to date" indication.
- **Concurrent operations**: If a long-running operation (push, pull, rebase, merge) is in progress, the menu option should be disabled to avoid interleaving git commands.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a context-menu item labeled "Fast-forward Local Branch from Remote" that appears when the user right-clicks on a branch badge whose underlying ref is a **local branch** (i.e., the badge is a local-branch or merged-branch display ref) and that is **not** the currently checked-out branch.
- **FR-002**: System MUST hide the menu item on the following badges: remote-only branches, tags, stashes, the uncommitted-changes node, and the currently checked-out local branch.
- **FR-003**: System MUST NOT make any synchronous git call or extension-host round-trip when the context menu is opened. Visibility is decided purely from data already in the webview store, so opening the menu remains instant.
- **FR-004**: When the user clicks the menu item, the system MUST open a modal confirmation dialog consistent with other operation dialogs (Push, Merge, Rebase) that contains:
  - a title naming the action,
  - a plain-language explanation that the local branch will be updated to its remote tip without checkout and without affecting the working tree,
  - a live command preview showing the exact git command that will run (`git fetch <remote> <branch>:<branch>`),
  - Confirm and Cancel buttons.
- **FR-005**: On confirmation, the system MUST execute `git fetch <remote> <branch>:<branch>` against the chosen remote and report success or failure to the user via the standard error/toast surface used by other operations.
- **FR-006**: After a successful fast-forward, the system MUST refresh the graph so the local branch badge advances to its new tip; after a failure, the system MUST not change graph state and MUST surface git's error message verbatim (or wrapped in an actionable form).
- **FR-007**: System MUST NOT change the currently checked-out branch, MUST NOT modify the working tree, and MUST NOT create or apply a stash as part of this operation.
- **FR-008**: System MUST resolve the target remote deterministically as follows: if a remote named `origin` exists in the loaded remote list, use `origin`; otherwise use the first remote in alphabetical order. If the repo has zero remotes, the command preview MUST still render with literal `origin` and execution MUST surface git's resulting error verbatim.
- **FR-009**: While a long-running git operation is in progress, the menu item MUST be disabled.

### Key Entities *(include if feature involves data)*

- **Local branch ref**: The user's locally tracked branch (name, current tip hash, "is current" flag). Already present in the loaded branch list.
- **Matching remote ref**: A remote branch with the same short name as the local branch (e.g., `origin/feature-x` matching local `feature-x`). Already present in the loaded branch list when the remote was fetched at startup. Used both to gate menu visibility and to construct the `git fetch` command.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can update a stale, non-checked-out local branch to its remote tip in **under 5 seconds** of total interaction time (right-click → confirm → completion), assuming a healthy network connection.
- **SC-002**: Opening the context menu on a branch badge introduces **no perceptible delay** beyond today's behavior — visibility logic adds no synchronous git calls and no extra round-trips to the extension host.
- **SC-003**: The menu item appears on **100%** of qualifying local-branch badges (any local-branch or merged-branch display ref that is not the current branch) and on **0%** of disqualifying badges (remote-only, tag, stash, uncommitted, current branch) across a representative test repo.
- **SC-004**: For users who currently keep multiple branches up to date, the operation reduces the steps from the typical "stash → checkout → pull → checkout → unstash" sequence (5 steps) to **1 confirmation click**.
- **SC-005**: When the operation fails (diverged branch, network, auth), **100%** of failures surface a user-readable error and leave the local branch and working tree unchanged.

## Assumptions

- The webview's currently loaded branch list (`Branch[]` in the Zustand store) contains both local and remote refs and is the authoritative source for visibility decisions, matching the existing convention used by `mergeRefs` and `getBranchCheckoutState`.
- "Has a remote counterpart" is determined by **name match** between a local branch name and a remote ref's `name` field — the same heuristic the merged-branch badge already relies on. Configured upstream-tracking (which can map a local branch to a differently named remote branch) is out of scope for v1; if that scenario matters, the user can use `Pull Branch` after checkout instead.
- The existing dialog/command-preview component pattern (used by Push, Merge, Rebase, Cherry-Pick dialogs) is reusable for this feature; no new dialog primitive is required.
- The auto-refresh / file watcher will pick up the ref change after `git fetch <remote> <branch>:<branch>` and refresh the graph; if not, an explicit refresh call after success is acceptable.
- This feature does not interact with submodules, tags, or signed refs — it operates on standard branch refs only.
- Out of scope for v1: pruning of remote-tracking refs, multiple-branch batch fast-forward, any UI to configure default remote for the operation.

