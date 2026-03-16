# Feature Specification: Fix Checkout with Uncommitted Changes Behavior

**Feature Branch**: `013-fix-checkout-stash`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "The current checkout behavior forces users to stash uncommitted changes before checkout. Git's default behavior allows checkout with uncommitted changes if they don't conflict with the target. The extension should match git's default behavior."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checkout Branch with Non-Conflicting Uncommitted Changes (Priority: P1)

As a developer, when I have uncommitted changes that don't conflict with the target branch, I want to checkout the branch without being forced to stash, so that my in-progress work carries over to the new branch just like it does with the `git checkout` command.

**Why this priority**: This is the core bug fix. The current behavior deviates from standard git behavior and forces unnecessary stashing, which disrupts the developer's workflow.

**Independent Test**: Can be fully tested by making non-conflicting changes in a file, then checking out another branch via the context menu. The checkout should succeed silently with changes preserved in the working tree.

**Acceptance Scenarios**:

1. **Given** I have uncommitted changes in files that don't exist or aren't modified on the target branch, **When** I checkout a branch via the context menu, **Then** the checkout succeeds and my uncommitted changes remain in the working tree.
2. **Given** I have uncommitted changes in files that exist on the target branch but the changes don't conflict, **When** I checkout the branch, **Then** the checkout succeeds and my changes remain in the working tree.
3. **Given** I have no uncommitted changes, **When** I checkout a branch, **Then** the checkout succeeds as before (no behavior change).

---

### User Story 2 - Checkout Branch with Conflicting Uncommitted Changes (Priority: P1)

As a developer, when I have uncommitted changes that conflict with the target branch, I want to be notified and given options to resolve the conflict, so that I don't lose my work.

**Why this priority**: Equally critical — this handles the conflict case where git would normally reject the checkout. Users need a clear way to proceed.

**Independent Test**: Can be tested by modifying a file that differs between the current and target branch, then attempting checkout. A dialog should appear offering to stash and checkout.

**Acceptance Scenarios**:

1. **Given** I have uncommitted changes that conflict with the target branch, **When** I attempt checkout, **Then** a dialog appears informing me that my changes conflict and offering "Stash & Checkout" or "Cancel".
2. **Given** the conflict dialog is shown, **When** I choose "Stash & Checkout", **Then** my changes are stashed and the branch is checked out.
3. **Given** the conflict dialog is shown, **When** I choose "Cancel", **Then** nothing changes and I remain on my current branch with my uncommitted changes intact.

---

### User Story 3 - Checkout Commit (Detached HEAD) with Uncommitted Changes (Priority: P1)

As a developer, when I checkout a specific commit and have non-conflicting uncommitted changes, I want the checkout to succeed without forcing a stash, matching git's default behavior for `git checkout <hash>`.

**Why this priority**: Same bug exists for commit checkout as for branch checkout. Both must be fixed together for consistent behavior.

**Independent Test**: Can be tested by making non-conflicting changes, then checking out a commit via the context menu. The checkout should succeed with changes preserved.

**Acceptance Scenarios**:

1. **Given** I have non-conflicting uncommitted changes, **When** I checkout a commit via the context menu, **Then** the checkout succeeds in detached HEAD mode and my changes remain in the working tree.
2. **Given** I have conflicting uncommitted changes, **When** I checkout a commit, **Then** a dialog appears offering "Stash & Checkout" or "Cancel".

---

### Edge Cases

- What happens when the user has staged changes (in the index) that conflict? The behavior should match git: git rejects the checkout if staged changes conflict, and the same dialog should appear.
- What happens when the user has both staged and unstaged changes? Defer to git's behavior — attempt checkout and only show dialog if git rejects it.
- What happens if the stash operation itself fails (e.g., untracked files issue)? An error message should be shown to the user.
- What happens if checkout fails for a reason other than conflicts (e.g., invalid ref)? An appropriate error message should be shown, distinct from the conflict dialog.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST attempt the checkout operation directly without pre-checking for a dirty working tree. The checkout should only be blocked if git itself rejects it due to conflicts.
- **FR-002**: System MUST detect when git rejects a checkout due to conflicting uncommitted changes (by interpreting git's error output).
- **FR-003**: When git rejects checkout due to conflicts, the system MUST show a dialog offering "Stash & Checkout" or "Cancel".
- **FR-004**: When git checkout succeeds with uncommitted changes (no conflicts), the system MUST NOT show any stash dialog and MUST proceed normally.
- **FR-005**: The conflict-handling behavior MUST apply consistently to both branch checkout and commit checkout operations.
- **FR-006**: The dialog message MUST clearly communicate that the user has conflicting changes and that stashing is needed to proceed.
- **FR-007**: After a successful "Stash & Checkout", the UI MUST refresh to reflect the new branch/commit state.
- **FR-008**: When checkout fails for non-conflict reasons (e.g., invalid ref, network error), the system MUST show an error message without offering the stash option.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Checking out a branch with non-conflicting uncommitted changes succeeds without any dialog, matching `git checkout` behavior.
- **SC-002**: Checking out a commit with non-conflicting uncommitted changes succeeds without any dialog, matching `git checkout <hash>` behavior.
- **SC-003**: Checking out with conflicting changes shows a dialog offering stash or cancel, and both options work correctly.
- **SC-004**: Zero regression in checkout behavior when working tree is clean (no uncommitted changes).

## Assumptions

- Git's error output for conflicting checkout contains the substring `"would be overwritten by checkout"` that can be reliably detected to distinguish conflict errors from other errors. This substring is stable across git versions since 2.0.
- The existing stash-and-checkout flow (stash, checkout, refresh UI) remains correct and does not need changes — only the trigger condition changes.
- The "Checkout with Pull" flow should also follow the same pattern: attempt checkout first, only stash if conflicts arise.
