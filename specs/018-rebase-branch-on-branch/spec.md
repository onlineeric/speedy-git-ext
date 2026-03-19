# Feature Specification: Rebase Branch on Branch Badge Context Menu

**Feature Branch**: `018-rebase-branch-on-branch`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "When I am on a branch, right click on another branch's badge, I have no rebase option. If I right click on that another branch row, off the badge area, I can see 'Rebase current branch on this commit'. Add 'Rebase current branch on this branch' menu to right click on branch badge."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rebase current branch onto another branch via badge (Priority: P1)

As a developer on a feature branch, I want to right-click on another branch's badge in the git graph and see a "Rebase Current Branch onto This" option, so I can rebase my work onto a target branch without needing to use the command line or right-click the commit row instead.

**Why this priority**: This is the core request. Currently the rebase option on the branch badge is hidden in scenarios where the commit-level rebase is available, creating an inconsistent and confusing user experience. Users expect to see rebase on the branch badge just as they see it on the commit row.

**Independent Test**: Can be fully tested by checking out a branch, right-clicking another branch's badge, and verifying the rebase menu item appears and works. Delivers the ability to rebase onto a branch directly from its badge.

**Acceptance Scenarios**:

1. **Given** I am on branch `feature-A` and branch `feature-B` exists at a different commit, **When** I right-click on `feature-B`'s badge, **Then** I see "Rebase Current Branch onto This" in the context menu.
2. **Given** I am on branch `feature-A` and branch `main` is an ancestor of my current branch, **When** I right-click on `main`'s badge, **Then** I see "Rebase Current Branch onto This" in the context menu (the ancestor restriction should be relaxed to match commit-row behavior).
3. **Given** I am on branch `feature-A`, **When** I right-click on `feature-A`'s own badge, **Then** I do NOT see the rebase option (cannot rebase a branch onto itself).
4. **Given** a rebase is already in progress, **When** I right-click on any branch badge, **Then** the rebase option is NOT shown.
5. **Given** I am in detached HEAD state (no current local branch), **When** I right-click on a branch badge, **Then** the rebase option is NOT shown.

---

### User Story 2 - Consistent behavior between branch badge and commit row rebase (Priority: P2)

As a developer, I want the rebase option on a branch badge to behave identically to the "Rebase current branch on this commit" option on the commit row, so that I have a predictable experience regardless of where I right-click.

**Why this priority**: Consistency between the two context menus prevents confusion. Users currently see rebase on the commit row but not the branch badge in the same scenario, which suggests the feature is missing.

**Independent Test**: Can be tested by comparing the rebase availability on a branch badge vs. its corresponding commit row across multiple scenarios and verifying they are consistent.

**Acceptance Scenarios**:

1. **Given** any branch badge where the corresponding commit row shows "Rebase current branch on this commit", **When** I right-click the branch badge, **Then** I also see the rebase option.
2. **Given** a branch badge rebase is triggered, **When** the rebase completes, **Then** the result is identical to rebasing onto the same commit via the commit row.

---

### Edge Cases

- What happens when the target branch points to the same commit as HEAD? The rebase option should be hidden (same as the isHeadCommit check on commit rows).
- What happens when there are uncommitted changes? The existing dirty-working-tree check in the backend still applies and shows an appropriate error.
- What happens for remote-only branches? The rebase option should still appear, using the remote branch ref (e.g., `origin/main`).
- What happens for tags? Tags are not branches; the rebase option should not appear for tags (existing behavior is correct).
- What happens when git rebase is a no-op (rebasing onto an ancestor)? Git handles this gracefully with "Current branch is up to date."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The branch badge context menu MUST show a "Rebase Current Branch onto This" option when the user is on a local branch and right-clicks a different branch's badge.
- **FR-002**: The rebase option on the branch badge MUST be available for both local and remote branches.
- **FR-003**: The rebase option MUST be hidden when the target branch is the current branch.
- **FR-004**: The rebase option MUST be hidden when the target branch points to the same commit as HEAD.
- **FR-005**: The rebase option MUST be hidden when a rebase, cherry-pick, or revert operation is already in progress.
- **FR-006**: The rebase option MUST be hidden when the user is in detached HEAD state (no current local branch).
- **FR-007**: The visibility conditions for the rebase option on the branch badge MUST be consistent with the visibility conditions for "Rebase current branch on this commit" on the commit row, except adapted for branch-level context (checking branch identity instead of commit hash equality).
- **FR-008**: Selecting the rebase option MUST open the existing rebase confirmation dialog with the "Ignore Date" option.
- **FR-009**: The rebase MUST use the branch display name (or remote branch ref) as the target ref, not the commit hash, so git resolves the current tip of the branch.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can initiate a rebase from the branch badge context menu in all scenarios where the commit-row rebase is also available.
- **SC-002**: The rebase option appears consistently between branch badge and commit row menus for the same target, eliminating user confusion.
- **SC-003**: No new dialogs or workflows are introduced; the feature reuses the existing rebase confirmation dialog and backend workflow.

## Assumptions

- The existing rebase backend and confirmation dialog are reused without modification.
- The only change needed is adjusting the visibility condition in the branch badge context menu to relax the ancestor/merged-commit check, aligning it with the commit-row rebase visibility logic.
- The underlying git rebase command handles no-op cases (rebasing onto an ancestor) gracefully.
