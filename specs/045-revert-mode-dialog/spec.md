# Feature Specification: Revert Commit dialog with mode selection

**Feature Branch**: `045-revert-mode-dialog`
**Created**: 2026-05-22
**Status**: Draft
**Input**: User description: "Revert Commit dialog with mode selection (Commit now / Stage only / Edit message), modeled after CherryPickDialog with radio buttons, with command preview, replacing direct revert action in commit context menu."

## Clarifications

### Session 2026-05-22

- Q: Should the dirty-working-tree precondition apply to all three modes, or be relaxed for the non-committing modes (matching the cherry-pick policy)? → A: Strict for all three modes. The dirty-tree check that exists today for the current single-mode revert applies equally to **Commit now**, **Stage only**, and **Edit message**. Users must commit, stash, or discard local changes before any revert mode runs.
- Q: What text should the command preview show for **Edit message** mode? → A: Canonical/native. Show `git revert [-m N] <hash>` (no `--no-edit`, no `--no-commit`). This matches what a developer would type in a terminal to achieve the same outcome (editor opens) and stays consistent with the single-line previews for the other two modes. The actual internal execution (two-step `git revert --no-commit` + `git commit -m`) is an implementation detail and is not exposed in the preview.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Revert a commit and create the revert commit immediately (Priority: P1)

A developer right-clicks a commit, chooses **Revert Commit**, and confirms in the dialog with the default mode selected. The system creates a new revert commit on the current branch with git's default revert message. This preserves the behavior users have today, just behind a one-extra-click confirmation dialog.

**Why this priority**: This is the most common revert workflow and the only mode available today. It must keep working with the same outcome and the same level of guardrails (clean-tree check, conflict recovery via Continue/Abort).

**Independent Test**: Right-click a non-merge, non-root commit on a clean working tree, choose **Revert Commit**, accept the default mode, confirm. A new commit appears on top of the current branch whose changes are the inverse of the selected commit, with the message `Revert "<subject>"`.

**Acceptance Scenarios**:

1. **Given** a clean working tree and a non-merge commit, **When** the user opens the Revert Commit dialog and confirms with the default mode, **Then** a new revert commit is created and the graph refreshes.
2. **Given** a clean working tree and a merge commit, **When** the user opens the Revert Commit dialog, **Then** the dialog shows mainline-parent options and only enables the confirm button after a parent is chosen.
3. **Given** the revert produces conflicts in this mode, **When** git pauses the revert, **Then** the dialog closes, an error is shown explaining that conflicts occurred, and the Commit context menu offers **Continue Revert** and **Abort Revert** options for recovery.
4. **Given** the selected commit introduces no net change relative to the current branch, **When** the user confirms, **Then** the dialog shows a friendly "already reverted / nothing to revert" message and does not create an empty commit.

---

### User Story 2 - Revert without committing, leaving inverse changes staged (Priority: P2)

A developer wants to review the inverse changes, combine them with other edits, or amend an existing commit instead of producing a standalone revert commit. They open the Revert Commit dialog, choose **Stage only**, and confirm. The inverse changes are applied to the working tree and index without producing a commit. The developer then handles the commit themselves via the VS Code Source Control panel.

**Why this priority**: Unlocks workflows that the current single-mode revert cannot serve (bundle revert with other changes, inspect the diff before committing, drop part of the revert). This is the highest-value new mode and the smaller behavioral departure from today's flow.

**Independent Test**: From a clean working tree, open the dialog, select **Stage only**, confirm. The Source Control panel shows the inverse of the selected commit as staged changes. No new commit appears on the graph.

**Acceptance Scenarios**:

1. **Given** a clean working tree, **When** the user selects **Stage only** and confirms, **Then** the inverse of the selected commit is staged, no new commit is produced, and the Source Control panel shows the staged changes.
2. **Given** the revert produces conflicts in this mode, **When** git pauses, **Then** an error explains that conflicts occurred and instructs the user to resolve them in the Source Control panel and commit manually. The graph does **not** enter a revert-in-progress state, and Continue/Abort options are not offered for this revert.
3. **Given** the selected commit introduces no net change, **When** the user confirms, **Then** a friendly "nothing to revert" message is shown and nothing is staged.

---

### User Story 3 - Revert with a custom commit message (Priority: P3)

A developer wants to write a non-default commit message for the revert (e.g., to reference a ticket, explain rationale). They open the Revert Commit dialog, choose **Edit message**, and a text area appears pre-filled with git's default revert message. They edit the message and confirm. The system applies the inverse changes and creates a new commit with the user's message.

**Why this priority**: Useful for teams that require ticket references or rich rationale in revert commits, but the same outcome can be achieved by amending after a default revert, so this is the most easily deferred mode.

**Independent Test**: From a clean working tree, open the dialog, select **Edit message**, edit the pre-filled message, confirm. A new commit appears on the graph whose message matches what the user typed and whose changes are the inverse of the selected commit.

**Acceptance Scenarios**:

1. **Given** a clean working tree and the user has selected **Edit message**, **When** the message text area is empty or whitespace-only, **Then** the confirm button is disabled.
2. **Given** a clean working tree, **When** the user selects **Edit message**, edits the pre-filled text, and confirms, **Then** a new commit is created with exactly the message the user provided and the inverse changes of the selected commit.
3. **Given** the revert produces conflicts in this mode, **When** git pauses after applying inverse changes but before committing, **Then** an error explains that conflicts occurred, the user is asked to resolve them and commit manually, and the dialog's custom message is **not** lost silently — it is offered for the user to copy.

---

### Edge Cases

- **Merge commit + any mode**: The mainline-parent picker appears in the same dialog. The selected parent is forwarded to git for all three modes.
- **Root commit or stash pseudo-commit**: The Revert Commit menu item is disabled (existing behavior preserved).
- **Operation already in progress** (cherry-pick, rebase, or prior revert paused): The dialog can be opened, but confirming surfaces a clear error and does not start the revert. (Same gate as today's flow.)
- **Dirty working tree on any mode**: All three modes refuse to run with the same explanatory error used today ("Working tree has uncommitted changes. Commit, stash, or discard them before reverting."). The user must clean the tree first.
- **Commit-now mode + conflict**: `REVERT_HEAD` is set; existing Continue Revert / Abort Revert flow recovers.
- **Stage-only or Edit-message mode + conflict**: `REVERT_HEAD` is NOT set by git (these modes don't engage git's revert state machine). The user resolves conflicts and commits manually via the SCM panel; the dialog/menu must not pretend a revert-in-progress state exists.
- **Edit-message mode + nothing to revert**: Inverse changes are empty after applying; no commit is produced; a friendly message is shown.
- **Edit-message mode + commit hook failure**: The inverse changes remain staged; the hook's error is surfaced; the user can fix and re-commit manually.
- **Cancelling the dialog**: No git command is executed; no state changes.
- **Re-opening the dialog**: The mode the user picked last time is pre-selected (matching how the cherry-pick dialog persists its options).
- **Long pre-filled message**: The text area scrolls vertically; the dialog itself does not change size.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Commit context menu MUST replace the existing direct-action **Revert Commit** item with an action that opens a new **Revert Commit** dialog. The menu item label, position, and enable/disable conditions (no root, no stash pseudo-commit) remain unchanged.
- **FR-002**: The Revert Commit dialog MUST present a mode selector implemented as a group of three radio buttons in this exact order:
  1. **Commit now** — labeled with the description first, then the equivalent git flag (`--no-edit`) shown in a muted/monospaced style.
  2. **Stage only** — labeled with the description first, then the flag (`--no-commit`).
  3. **Edit message** — labeled with the description first, then "(no flag; opens editor natively)".
- **FR-003**: The dialog MUST default to **Commit now** the first time it is opened, and on subsequent opens MUST default to the mode the user last confirmed with.
- **FR-004**: For merge commits, the dialog MUST show a mainline-parent picker in the same dialog (one merged dialog, not two sequential dialogs). The confirm button MUST stay disabled until a parent is chosen.
- **FR-005**: The dialog MUST show a live, single-line command preview that updates as the user changes the mode and (for merge commits) the mainline parent. Preview content per mode is defined in the Command Preview Policy section below.
- **FR-006**: The command preview MUST be selectable text and offer a Copy button (matching the existing `CommandPreview` component behavior).
- **FR-007**: When **Edit message** is selected, the dialog MUST display a multi-line text area pre-filled with the standard git default revert message format: `Revert "<subject of reverted commit>"` on the first line, a blank line, then `This reverts commit <full-40-char-hash>.`
- **FR-008**: When **Edit message** is selected, the confirm button MUST be disabled whenever the message text area is empty or contains only whitespace.
- **FR-009**: When the user confirms **Commit now**, the system MUST execute the equivalent of `git revert --no-edit [-m <N>] <hash>` and refresh the graph on success.
- **FR-010**: When the user confirms **Stage only**, the system MUST execute the equivalent of `git revert --no-commit [-m <N>] <hash>`. No new commit is created. The Source Control panel reflects the staged inverse changes.
- **FR-011**: When the user confirms **Edit message**, the system MUST apply the inverse changes and create a new commit whose message is exactly the text the user typed (preserving leading/trailing newlines as the user entered them, except trailing whitespace on the very last line which is trimmed). The system MUST NOT silently mutate the message.
- **FR-012**: When **Edit message** mode applies the inverse changes successfully but yields no staged changes (empty revert), the system MUST surface a "nothing to revert" message and MUST NOT create an empty commit. The user's typed message MUST NOT be lost — it is offered back so they can retry or copy it.
- **FR-013**: When **Commit now** mode produces a conflict, the system MUST behave exactly as today: surface a conflict error, set the revert-in-progress UI state, and ensure the Commit context menu offers **Continue Revert** and **Abort Revert** items.
- **FR-014**: When **Stage only** or **Edit message** mode produces a conflict, the system MUST surface a conflict error explaining that conflicts must be resolved in the Source Control panel and committed manually, MUST NOT enter the revert-in-progress UI state, and MUST NOT offer Continue/Abort menu items for this revert.
- **FR-015**: If another git operation (cherry-pick, rebase, or in-progress revert) is already in progress, confirming in the dialog MUST surface a friendly error and MUST NOT start the revert.
- **FR-016**: All three modes MUST refuse to run when the working tree is dirty, surfacing the same explanatory error used by today's revert flow. There is no relaxation for **Stage only** or **Edit message** — users must commit, stash, or discard local changes first.
- **FR-017**: Cancelling the dialog (Escape, clicking outside, or clicking Cancel) MUST execute no git command and MUST leave repository state untouched.
- **FR-018**: The dialog visual style, button labels, focus order, and keyboard navigation MUST match the Cherry-Pick dialog conventions (Radix Dialog, VS Code theme tokens, Cancel/primary-action buttons aligned right).
- **FR-019**: The dialog MUST be dismissible by Escape and by clicking the overlay (matching Cherry-Pick dialog behavior).
- **FR-020**: All three modes MUST validate the commit hash before invoking git (existing `validateHash` precondition preserved).

### Command Preview Policy

The command preview shows the canonical git command line a developer would type in a terminal to achieve the same outcome:

| Mode | Preview shown |
| --- | --- |
| Commit now | `git revert --no-edit [-m N] <abbrev-hash>` |
| Stage only | `git revert --no-commit [-m N] <abbrev-hash>` |
| Edit message | `git revert [-m N] <abbrev-hash>` |

`[-m N]` only appears when the selected commit is a merge commit (and is filled with the chosen parent number). The hash is shown in its 7-character abbreviated form for readability.

### Key Entities

- **Revert mode**: One of three values — `Commit now`, `Stage only`, `Edit message` — chosen via radio button.
- **Revert request**: A bundle of `{ commit hash, revert mode, mainline parent (if merge commit), custom message (if Edit message mode) }` constructed by the dialog and passed to the backend for execution.
- **Last-used revert mode**: The most recently confirmed revert mode, persisted in the webview store for the lifetime of the session so the dialog reopens with it pre-selected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can complete each of the three revert flows (Commit now, Stage only, Edit message) from menu-open to final state in under 15 seconds on a clean working tree against a 500-commit local repository.
- **SC-002**: 100% of revert operations that succeed today (single non-merge commit, clean tree, no conflict) continue to succeed after this change, with identical end-state on the graph (same revert commit on `HEAD`).
- **SC-003**: Reverts producing conflicts in **Commit now** mode continue to recover successfully through the existing Continue Revert / Abort Revert menu items in 100% of cases that recover today.
- **SC-004**: When **Stage only** mode finishes successfully, the changes the user sees in the Source Control panel exactly equal `git diff HEAD` of the inverse of the selected commit — verified against `git show -R <hash>`.
- **SC-005**: When **Edit message** mode finishes successfully, the new commit's message exactly equals the text the user typed in the dialog (after normalizing only trailing whitespace on the last line).
- **SC-006**: The dialog is keyboard-fully-operable — a user can open the menu, navigate to **Revert Commit**, switch modes, edit the message (in Edit message mode), and confirm without touching the mouse, in under 10 keystrokes for the default flow.
- **SC-007**: No regression in test coverage — `GitRevertService` retains coverage of every existing behavior and gains coverage of each new mode's success path, conflict path, and empty-revert path.

## Assumptions

- **Single-commit revert only**: This feature does not introduce multi-select revert. The dialog operates on exactly one commit at a time, matching today's scope.
- **No `--no-verify` escape hatch**: Commit hooks always run for the second-step commit in Edit message mode. If a hook fails, the user resolves it manually. Adding a hook-bypass toggle is out of scope.
- **No GPG/SSH signing toggle**: Signing follows the user's `commit.gpgsign` / `tag.gpgsign` git config; the dialog does not expose a signing override.
- **Persistence of last-used mode is session-scoped**: The remembered mode lives in the Zustand store (in-memory for the session). Persisting across VS Code restarts is out of scope.
- **The existing `RevertParentDialog` is superseded**: The merge-commit mainline-parent picker is consolidated into the new dialog and the old standalone dialog is removed.
- **Existing Continue Revert / Abort Revert flow is untouched**: These context menu items continue to operate against git's `REVERT_HEAD` state and only appear after a Commit-now mode conflict.
- **Operation-in-progress guard is unchanged**: The dialog uses the existing `getOperationInProgressError` gate when the user confirms.
- **Speedy Git scope holds**: This feature is graph-UI only; it does not introduce any editor-side commands or status-bar integration (per project boundary).
