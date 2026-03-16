# Feature Specification: Checkout Commit (Detached HEAD)

**Feature Branch**: `012-checkout-commit-detached-head`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "when user right click on a row, not on a branch label, there should be a menu 'Checkout this commit'. When checkout a commit instead of a branch, will result in a 'detached HEAD' state, so after click on this menu, should popup a dialog to confirm 'Checkout commit [short commit id] will result in detached HEAD, continue?' to confirm or cancel."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checkout Commit via Right-Click Menu (Priority: P1)

A developer is browsing the git graph and wants to inspect the exact state of the repository at a specific past commit. They right-click on a commit row (not on a branch label) and select "Checkout this commit" from the context menu. A confirmation dialog appears warning them that this will result in a detached HEAD state. They confirm, and the repository is checked out to that commit.

**Why this priority**: This is the core feature. Without the context menu item and the checkout action, no other stories are meaningful. Delivers immediate, standalone value for developers who need to inspect historical states.

**Independent Test**: Can be fully tested by right-clicking any commit row, confirming the dialog, and verifying the repo HEAD moves to the selected commit hash.

**Acceptance Scenarios**:

1. **Given** the git graph is open and commits are visible, **When** the user right-clicks on any commit row (not on a branch/tag label), **Then** a context menu appears containing a "Checkout this commit" option.
2. **Given** the user has selected "Checkout this commit" from the context menu, **When** the confirmation dialog appears, **Then** it displays the message "Checkout commit [short hash] will result in detached HEAD. Continue?" with Confirm and Cancel buttons.
3. **Given** the confirmation dialog is shown, **When** the user clicks Confirm, **Then** the repository HEAD moves to the selected commit hash and the graph updates to reflect the new HEAD position.
4. **Given** the confirmation dialog is shown, **When** the user clicks Cancel, **Then** the dialog closes with no changes made to the repository.

---

### User Story 2 - Checkout Commit with Dirty Working Tree (Priority: P2)

A developer has uncommitted local changes and tries to checkout a commit. The system detects the dirty working tree and offers the option to stash changes before proceeding, consistent with how branch checkouts handle this scenario.

**Why this priority**: Prevents data loss for users with uncommitted work. Required for the feature to be safe and production-ready, but the basic checkout flow (Story 1) can be demonstrated without it.

**Independent Test**: Can be tested by making a local change, then right-clicking a commit and selecting "Checkout this commit" — confirm the detached HEAD dialog, then verify the stash prompt appears before the checkout completes.

**Acceptance Scenarios**:

1. **Given** the repository has uncommitted changes, **When** the user confirms the detached HEAD dialog, **Then** the system detects the dirty state (via backend `checkoutCommitNeedsStash` response) and presents a stash-and-checkout option before proceeding.
2. **Given** the user chooses to stash and proceed, **When** the checkout completes, **Then** the stash is created and the repository HEAD is moved to the selected commit in detached HEAD state.
3. **Given** the user declines to stash, **Then** the checkout is cancelled and no changes are made.

---

### User Story 3 - Checkout Commit Already at HEAD (Priority: P3)

A developer right-clicks on the commit that is already the current HEAD. The "Checkout this commit" option is still available but checking out the current HEAD into detached state is a valid (if uncommon) use case and should work correctly.

**Why this priority**: Edge case handling that improves robustness but does not block the primary use case.

**Independent Test**: Right-click on the commit marked as HEAD and select "Checkout this commit" — should follow the same confirmation flow and succeed.

**Acceptance Scenarios**:

1. **Given** the user right-clicks the commit currently at HEAD, **When** they select "Checkout this commit", **Then** the standard detached HEAD confirmation dialog appears.
2. **Given** the user confirms, **Then** the repository enters detached HEAD state at the current commit hash.

---

### Edge Cases

- What happens when the checkout fails due to a git error (e.g., locked index, permission issue)? The system should display an error notification with the git error message.
- What happens if the commit hash becomes invalid between right-click and confirm (e.g., rebase in another terminal)? The checkout attempt fails gracefully with an error message.
- How does the graph reflect detached HEAD state after a successful commit checkout? The HEAD indicator in the graph should move to show the detached HEAD at the checked-out commit.
- What if the user right-clicks on a branch label (RefInfo)? The "Checkout this commit" item must NOT appear — branch checkouts use the existing branch checkout flow via BranchContextMenu.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The commit row context menu MUST include a "Checkout this commit" option when the user right-clicks on a commit row (not on a branch/tag label).
- **FR-002**: Upon selecting "Checkout this commit", the system MUST display a confirmation dialog that identifies the commit by its short hash and explicitly warns that the result will be a detached HEAD state.
- **FR-003**: The confirmation dialog MUST provide two actions: Confirm (proceed with checkout) and Cancel (dismiss with no changes).
- **FR-004**: When the user confirms, the system MUST check out the repository to the selected commit hash, resulting in detached HEAD state.
- **FR-005**: When the user cancels, the system MUST close the dialog and leave the repository unchanged.
- **FR-006**: If the working tree has uncommitted changes, the system MUST detect this after the user confirms the detached HEAD dialog (via a `checkoutCommitNeedsStash` backend response, consistent with the existing `checkoutNeedsStash` branch checkout pattern) and offer to stash changes before completing the checkout.
- **FR-007**: After a successful commit checkout, the graph view MUST update to reflect the new HEAD position.
- **FR-008**: If the checkout operation fails, the system MUST display a clear error notification with sufficient detail for the user to understand what went wrong.
- **FR-009**: The "Checkout this commit" menu item MUST NOT appear in the branch label context menu (BranchContextMenu) — it is exclusively available in the commit row context menu (CommitContextMenu).
- **FR-010**: The "Checkout this commit" menu item MUST be disabled (non-interactive) when any git operation is in progress (loading, rebase, cherry-pick, or revert), consistent with the guard applied to Revert Commit and Drop Commit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can initiate a commit checkout from right-click to confirmed detached HEAD state in under 5 seconds on a healthy repository.
- **SC-002**: 100% of commit checkout attempts that succeed result in the graph HEAD indicator accurately reflecting the detached HEAD position.
- **SC-003**: 100% of commit checkout attempts with a dirty working tree present the stash prompt (after the user confirms the detached HEAD dialog) before completing the checkout, preventing accidental data loss.
- **SC-004**: The confirmation dialog copy clearly communicates detached HEAD to users unfamiliar with the concept — the short hash is always visible in the dialog message.
- **SC-005**: No regression in existing branch checkout behavior — all existing branch checkout flows continue to work correctly after this feature is added.

## Clarifications

### Session 2026-03-16

- Q: When the working tree is dirty, should the stash prompt appear before or after the detached HEAD confirmation dialog? → A: Detached HEAD confirmation is shown first. After the user confirms, the backend attempts checkout and returns `checkoutCommitNeedsStash` if the tree is dirty, triggering the stash dialog — consistent with the existing `checkoutNeedsStash` branch checkout pattern.
- Q: Should "Checkout this commit" be disabled when a git operation is in progress? → A: Yes, disabled when `isOperationInProgress` (loading, rebase, cherry-pick, revert in progress) — consistent with Revert Commit and Drop Commit behavior.

## Assumptions

- The short commit hash displayed in the confirmation dialog uses the standard 7-character abbreviated hash format (same as used elsewhere in the graph).
- The stash-and-checkout flow reuses the existing stash infrastructure already in place for branch checkouts.
- Detached HEAD state is not further explained in the dialog beyond the warning message — users who need more context can consult git documentation.
- The "Checkout this commit" menu item is always shown for all commits in the commit row context menu (no filtering by commit age or reachability).
