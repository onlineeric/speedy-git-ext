# Feature Specification: Branch Checkout & Delete Dialog Improvements

**Feature Branch**: `023-branch-dialog-improvements`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "Fix branch checkout pull dialog for diverged local/remote branches, and add remote deletion option to branch delete dialog"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pull Dialog for Diverged Local Branch Checkout (Priority: P1)

A user has a local branch at one commit and its remote counterpart at a different commit (e.g., the remote moved forward after a merge on the server). When the user right-clicks the local branch badge in the graph and selects "Checkout", the system should recognize that a remote counterpart exists on a different commit and show the checkout-with-pull dialog, giving the user the option to pull the latest remote changes after checkout.

**Why this priority**: Without this, users checking out a diverged local branch may unknowingly work on outdated code, leading to unnecessary merge conflicts or duplicated work. This is the most fundamental checkout scenario that needs correction.

**Independent Test**: Can be tested by creating a local branch, advancing its remote counterpart to a different commit (e.g., via a merge on the remote), then right-clicking the local branch badge and choosing "Checkout". The pull dialog should appear.

**Acceptance Scenarios**:

1. **Given** a local branch `feature-x` at commit A and remote branch `origin/feature-x` at commit B (where A ≠ B), **When** the user right-clicks the local `feature-x` badge and selects "Checkout", **Then** the checkout-with-pull dialog is displayed with options to pull or not pull.
2. **Given** a local branch `feature-x` at commit A with NO remote counterpart, **When** the user right-clicks the local `feature-x` badge and selects "Checkout", **Then** the checkout happens directly without any dialog (existing behavior preserved).
3. **Given** a local branch `feature-x` at commit A and remote branch `origin/feature-x` at the same commit A, **When** the user right-clicks the local `feature-x` badge and selects "Checkout", **Then** the checkout-with-pull dialog is still displayed (since the remote branch exists, offering the option to pull any new changes).

---

### User Story 2 - Pull Dialog for Remote Branch Checkout with Existing Local Branch (Priority: P1)

A user right-clicks a remote branch badge (e.g., `origin/feature-y`) to check it out. If there is already a local branch `feature-y` pointing to a different commit, the system should show the checkout-with-pull dialog instead of silently creating a new tracking branch or overwriting the local branch. This allows the user to decide whether to pull the remote changes into the existing local branch.

**Why this priority**: This is a complementary scenario to Story 1 — checking out from the remote side when a local counterpart already exists at a different commit. Getting this wrong could silently discard local work or cause confusing branch state.

**Independent Test**: Can be tested by having a local branch `feature-y` at commit A and a remote branch `origin/feature-y` at commit B, then right-clicking the remote `origin/feature-y` badge and choosing "Checkout". The pull dialog should appear.

**Acceptance Scenarios**:

1. **Given** a remote branch `origin/feature-y` at commit B and an existing local branch `feature-y` at commit A (where A ≠ B), **When** the user right-clicks `origin/feature-y` and selects "Checkout", **Then** the checkout-with-pull dialog is displayed.
2. **Given** a remote branch `origin/feature-y` at commit B and NO existing local branch `feature-y`, **When** the user right-clicks `origin/feature-y` and selects "Checkout", **Then** a local tracking branch is created directly without any dialog (existing behavior preserved).

---

### User Story 3 - Delete Local Branch with Optional Remote Deletion (Priority: P2)

When a user right-clicks a local branch and selects "Delete Branch", the delete confirmation dialog should include an option (checkbox) to also delete the corresponding remote branch. This checkbox should be unchecked by default to prevent accidental remote deletion. The git command preview should update dynamically to reflect whether the remote deletion is included.

**Why this priority**: Currently, deleting both local and remote branches requires two separate context menu actions. Combining them into a single dialog with an opt-in remote delete saves time and reduces the chance of orphaned remote branches. This is a P2 because it is a workflow improvement rather than a correctness fix.

**Independent Test**: Can be tested by right-clicking a local branch that has a remote counterpart, selecting "Delete Branch", and verifying the dialog shows an "Also delete remote branch" checkbox. Testing both with and without the checkbox selected.

**Acceptance Scenarios**:

1. **Given** a local branch `feature-z` with remote counterpart `origin/feature-z`, **When** the user selects "Delete Branch" from the context menu, **Then** the delete confirmation dialog shows an "Also delete remote branch" checkbox (unchecked by default).
2. **Given** the delete dialog is open with the remote-delete checkbox unchecked, **When** the user confirms deletion, **Then** only the local branch is deleted (command: `git branch -d feature-z`).
3. **Given** the delete dialog is open with the remote-delete checkbox checked, **When** the user confirms deletion, **Then** both the local branch and the remote branch are deleted (commands: `git branch -d feature-z` and `git push origin --delete feature-z`).
4. **Given** a local branch `feature-z` with NO remote counterpart, **When** the user selects "Delete Branch" from the context menu, **Then** the delete confirmation dialog does NOT show the remote-delete checkbox.
5. **Given** the delete dialog with remote-delete checkbox, **When** the user toggles the checkbox on and off, **Then** the command preview updates dynamically to show or hide the `git push origin --delete feature-z` command.
6. **Given** the force-delete scenario (branch not fully merged), **When** the force-delete dialog appears, **Then** it also includes the remote-delete checkbox option if a remote counterpart exists.

---

### Edge Cases

- What happens when the user checks out a local branch whose remote counterpart was deleted but the fetch hasn't refreshed yet? The system should rely on the currently known branch list — if the remote is not in the list, no pull dialog is shown.
- What happens when deleting a local branch with remote-delete checked but the remote deletion fails (e.g., permission denied)? The system should report the remote deletion failure while acknowledging the local branch was already deleted.
- What happens when there are multiple remotes with the same branch name (e.g., `origin/feature-z` and `upstream/feature-z`)? The remote-delete checkbox should specify which remote branch will be deleted (the primary/tracking remote).
- What happens when the local branch delete succeeds but the network is unavailable for remote delete? The error should be shown to the user clearly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show the checkout-with-pull dialog when checking out a local branch that has a remote counterpart, regardless of whether the local and remote are on the same or different commits.
- **FR-002**: System MUST show the checkout-with-pull dialog when checking out a remote branch that already has a local counterpart, regardless of commit position.
- **FR-003**: System MUST NOT show the checkout-with-pull dialog when checking out a local branch with no remote counterpart (local-only branch).
- **FR-004**: System MUST NOT show the checkout-with-pull dialog when checking out a remote branch with no local counterpart — it should create a tracking branch directly (existing behavior).
- **FR-005**: System MUST display an "Also delete remote branch" checkbox in the delete branch confirmation dialog when the local branch has a remote counterpart.
- **FR-006**: The "Also delete remote branch" checkbox MUST be unchecked by default.
- **FR-007**: The command preview in the delete dialog MUST update dynamically when the remote-delete checkbox is toggled.
- **FR-008**: When remote-delete is selected, the system MUST execute both local and remote branch deletion.
- **FR-009**: The remote-delete checkbox MUST NOT appear when the local branch has no remote counterpart.
- **FR-010**: If the local branch deletion triggers a force-delete prompt (unmerged branch), the force-delete dialog MUST also include the remote-delete option if a remote counterpart exists.
- **FR-011**: If remote branch deletion fails after successful local branch deletion, the system MUST report the remote deletion error to the user.

### Key Entities

- **Branch Checkout State**: Represents whether a branch is local-only, remote-only, or has both local and remote counterparts (dual). Determines which dialog flow to use.
- **Delete Branch Options**: Represents the user's choices for branch deletion — whether to force-delete and whether to also delete the remote counterpart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users checking out a local branch with a diverged remote counterpart are always presented with the pull option before checkout completes.
- **SC-002**: Users checking out a remote branch with an existing local counterpart are always presented with the pull option before checkout completes.
- **SC-003**: Users can delete a local branch and its remote counterpart in a single dialog interaction, reducing the required steps from two separate operations to one.
- **SC-004**: The command preview in the delete dialog always accurately reflects the commands that will be executed, including the remote-delete command when the checkbox is selected.
- **SC-005**: No accidental remote branch deletions occur — the remote-delete option defaults to unchecked and requires explicit user opt-in.

## Assumptions

- The existing `getBranchCheckoutState` function logic for detecting 'dual' branches (matching local/remote names) is correct and reliable. Issues 1 and 2 may already be partially working if this logic functions properly; verification is needed during implementation.
- The primary remote for a branch is determinable from the branch data (typically `origin`). When multiple remotes exist, the tracking remote is used.
- The existing `CheckoutWithPullDialog` component can be reused as-is for the checkout scenarios — no changes to its UI are needed.
- The delete dialog enhancement (remote-delete checkbox) will build on the existing `ConfirmDialog` component, potentially requiring an extension to support additional interactive elements (checkbox).
