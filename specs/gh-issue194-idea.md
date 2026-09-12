# Idea Spec — Create Fixup and Squash Commits

**Date:** 2026-09-12

**Status:** Discussion draft. Confirmed decisions are recorded below; remaining recommendations are proposals.

**Origin:** [GitHub issue #194](https://github.com/onlineeric/speedy-git-ext/issues/194), requested by @nelson870708. The maintainer acknowledged the request for investigation and the roadmap.

## Problem and intent

The issue requests graph context-menu actions for creating fixup and squash commits without copying a hash into a terminal. It asks that the target be reachable from the current branch's HEAD and that detached HEAD be excluded.

The proposed UX combines these actions into one dialog in the existing Create group, adds explanations, and optionally includes unstaged tracked changes and untracked files. The purpose is to prepare a correction for later history cleanup while keeping normal graph browsing fast.

## Git semantics that shape the design

| Choice | Git option | Effect when autosquashed later |
| --- | --- | --- |
| Fixup | `--fixup=<hash>` | Fold in changes; retain the target message. |
| Squash | `--squash=<hash>` | Fold in changes; combine messages for review. |
| Fixup and replace message | `--fixup=amend:<hash>` | Fold in changes; replace the target message. |

These create new commits at HEAD. Plain `--amend` takes no target hash and immediately replaces HEAD; it belongs in the existing Amend Last Commit workflow. A possible later message-only choice is `--fixup=reword:<hash>`, which ignores staged changes. `-a` includes modified/deleted tracked files, including unstaged portions of partially staged files, but excludes untracked files. [Git commit documentation](https://git-scm.com/docs/git-commit)

Autosquash reorders marked commits and changes their rebase actions. Its selected range must include the target; a root target needs `--root`. Standard markers use subjects, so duplicate subjects can make target matching ambiguous even when creation used a hash. Users should review the resulting todo list. [Git rebase documentation](https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---autosquash)

## Proposed entry point

- Add **Create Fixup / Squash Commit…** to the Create group, after Create Branch Here and Create Tag Here.
- Offer the same action from the commit row and ref-badge Create menus. The selected commit is the target regardless of which badge opened the menu.
- Use one dialog, initially selecting Fixup. Do not persist the mode or inclusion checkboxes between openings in the initial design.
- Keep the existing Amend Last Commit action separate.

This name exposes the terms the requester will look for and avoids suggesting that a new commit is inserted directly at the clicked row. The third mode is explained inside the dialog.

## Proposed dialog

Title: **Create Fixup / Squash Commit**.

Show the target's abbreviated hash and subject, plus the current branch receiving the new commit. Keep these visible while choosing options.

Always show this short explanation:

> Creates a new commit on your current branch. The selected commit stays unchanged until you run an autosquash rebase.

Use radio choices with plain descriptions:

- **Fixup — keep target message** (default): “Add these changes to the target during autosquash.”
- **Squash — combine messages**: “Add these changes and review the combined commit message during autosquash.”
- **Fixup — replace target message**: “Add these changes and use the replacement message during autosquash.”

### Message fields

- Fixup needs no editable message field for the initial feature. Show the generated title as a read-only preview.
- Squash offers an **Additional message** multiline field. Recommend allowing it to be empty rather than inventing a message requirement beyond Git's generated title.
- Replacement-message mode offers a required **Replacement commit message** multiline field, prefilled with the target's complete message, including body and trailers. Preserve user edits when switching modes within the same dialog.
- Keep the generated marker separate from editable text so users cannot accidentally remove it. Show the final message preview with its actual prefix (`fixup!`, `squash!`, or `amend!`).
- Do not open an external editor or silently accept an unedited message because the extension's Git editor is a no-op. The technical spec must establish a supported message-input path for each mode; amend-fixup cannot simply inherit every ordinary commit message flag.

### Included changes

Always show **Staged changes: N files — included**, including zero. Creating a new commit normally consumes staged work; an extra opt-in for staged changes would make the common path cumbersome.

Optional checkboxes, both initially off:

- **Also include unstaged changes to tracked files (`-a`)**. Show the applicable file count and explain that this includes all unstaged portions of partially staged files.
- **Also include untracked files**. Show only when eligible files exist, with a count. Include non-ignored untracked files only; never force-add ignored files or silently add a nested repository as a gitlink.

The options are independent: selecting untracked files must not implicitly include unstaged changes to existing tracked files. Do not implement that combination using an indiscriminate “stage everything” operation.

Provide a compact, expandable read-only list of the affected paths, with links to the existing change-review workflow where practical. Keep file/hunk selection in the existing staging UI. Counts for staged and unstaged categories may overlap; a combined file total must deduplicate paths.

If there are no included content changes, explain what to stage or select and disable creation for the initial three-mode design. A dedicated message-only mode remains an open scope decision.

Show a live command preview, including any explicit staging step needed for untracked files. Use the existing dialog styling and a mode-specific primary button: **Create Fixup Commit**, **Create Squash Commit**, or **Create Message-Replacing Fixup**. Cancel closes without staging or committing anything.

## Availability and correctness

- Require a checked-out local branch, a real target commit reachable from HEAD, no unresolved conflicts, and no merge/rebase/cherry-pick/revert in progress. HEAD itself is a valid target.
- Membership means ancestry, not a branch decoration or a first-parent-only test. A commit can belong to several branches.
- Exclude stash pseudo-commits and the uncommitted node.
- Recommend excluding merge commits as targets in the first version: replaying and autosquashing into a merge requires a separate product design. This is a proposed restriction beyond the issue, requiring maintainer agreement. Ordinary commits behind merges remain eligible for creation, with no promise that a later rebase preserves topology automatically.
- A root commit may be targeted; explain the later root-inclusive rebase requirement.
- Keep temporarily unavailable actions disabled consistently with surrounding menu items. Empty staging does not disable opening the dialog: the inclusion options may supply changes.
- Filtered or partially loaded history must not falsely establish that a commit is outside the branch. Resolve uncertain ancestry on demand through Git without loading all history into the graph.
- Validate repository identity, branch identity, expected HEAD, target existence/reachability and operation state again before mutation. Switching to a different branch on the same hash also invalidates the dialog's destination.
- Refresh inclusion information at confirmation. Material differences require renewed review rather than silently widening the approved set. Do not claim this eliminates every race with external tools; the technical spec must define the snapshot and locking strategy.
- Never retarget to a new repository or branch after navigation. Late responses must stay associated with their original request.

## Running, success and failure

- Disable duplicate submission and conflicting extension operations while work runs.
- Follow the existing amend workflow's longer hook wait, progress and cancellation UX. Preserve normal hooks and signing configuration; no new bypass switches.
- On success, refresh graph and working-tree status and select the new commit where visible. Do not alter filters just to reveal it; explain when the active filters hide it.
- On failure, retain the dialog, entered message and choices. Refresh actual status before retrying.
- Including untracked files may stage them before the commit runs. If the commit fails, report any files that remain staged; do not blindly reset the index, which may also contain prior or external staging changes. Opening or cancelling before execution must never stage files.
- After timeout/cancellation, inspect actual repository state and report completion or uncertainty. A moved HEAD alone is insufficient proof that this particular request succeeded when external commits are possible. Avoid duplicate commits on retry.
- No automatic push, force push, amend or rebase follows creation. A published target does not itself make this new commit a history rewrite.

## Completing the autosquash workflow

Investigation of the current implementation found that `GitRebaseService.interactiveRebase` supplies a custom todo list; the dialog currently handles manually selected squash/fixup actions. Adding `--autosquash` to the command alone would not establish a correct integrated workflow because the custom sequence editor supplies the final list.

**Confirmed scope:** complete commit creation and clearly explain the separate autosquash step. Autosquash integration in Speedy Git's interactive-rebase dialog is a separate follow-up, outside this feature. Do not claim that the current interactive-rebase UI automatically recognizes the new markers.

A contextual help example can show `git rebase -i --autosquash <target>^`, with `--root` for a root target. Label it as an example that requires reviewing the range and topology; do not execute it from this dialog. Later rebasing can conflict and rewriting already-published history may require coordination and a force push.

**Separate follow-up:** an Autosquash option in the interactive-rebase dialog that previews the reordered entries, supports replacement-message fixups, resolves targets within the chosen range, preserves message bodies, and fits existing conflict continuation. Its design and implementation belong in a separate spec; this commit-creation feature does not depend on it shipping.

## Performance requirements

- No extra Git commands, message reads or status scans during row rendering, scrolling or initial graph loading.
- Preserve lazy context-menu construction and memoized rows. Use the existing cached reachability infrastructure where it can give a reliable answer; perform uncertain checks only for the opened menu/dialog.
- Fetch full message data only when replacement-message mode needs it. Reuse that result within the dialog.
- Fetch status on demand; keep expensive path lists collapsed and virtualize large lists if necessary. Do not read diffs or file contents merely to compute counts.
- No full-history fetch or topology recompute for checkbox changes. Command/message previews are local dialog state.
- Scope asynchronous results and cancellation to the originating repository/request. Coalesce the normal refresh after completion.

## Telemetry review

Review and instrument the menu action, dialog confirmed/cancelled outcome, and commit operation result/duration through existing closed catalogs and helpers. Represent mode and selected inclusion options only through approved fixed enums/booleans or catalog actions supported by the existing schema. Update `telemetry.json` and focused tests during implementation.

Never transmit target hashes, subjects/messages, paths, branch/repository identity, hook output or user input. Do not track typing, preview changes, status refreshes or ancestry checks.

## Product acceptance examples

1. Staged hunks only, default Fixup: creates one correction commit and leaves unstaged hunks untouched.
2. Tracked checkbox on: includes unstaged tracked modifications/deletions, with the partial-staging consequence visible before confirmation.
3. Untracked checkbox alone: includes eligible new files and staged changes while preserving unrelated unstaged tracked changes.
4. Squash: preserves entered additional message and the generated marker.
5. Replacement-message fixup: preserves the full edited message and leaves the original target unchanged until later autosquash.
6. Filtered/incomplete graph: on-demand ancestry validation reaches the correct eligibility result without a full-history load.
7. Branch/repository/HEAD changes, conflicts, hook failure and cancellation: no silent retargeting, lost message or automatic duplicate retry.
8. Large histories and many changed files: opening the feature does not add per-row work or degrade scrolling.
9. A later Git autosquash, in a suitable range, produces the expected content and message for each supported mode. Include duplicate-subject and root-target cases in validation.

## Confirmed decisions

- **Third mode: fixup with replacement message** — confirmed by the maintainer on 2026-09-12. Use `--fixup=amend:<hash>` to create a new commit whose replacement message is applied during later autosquash. Immediate Amend Last Commit remains a separate workflow.
- **Commit creation only; autosquash integration is a separate follow-up** — confirmed by the maintainer on 2026-09-12. Include guidance about the later autosquash step, without enhancing or invoking the interactive-rebase workflow in this feature.

## Decisions to resolve together

1. Confirm **Create Fixup / Squash Commit…** and the proposed default Fixup selection.
2. Keep three modes initially, or add **Reword only** (`--fixup=reword:<hash>`) for message-only corrections with all content controls disabled?
3. Agree on the merge-target restriction, detached-HEAD exclusion from the issue, and both inclusion options defaulting off.

No release version or What's New content is decided here. The contributor credit and release dialog belong to the maintainer's release pass.

## Handoff

After product decisions are settled, a technical spec should define message construction/editor handling, supported Git capability checks, staging and snapshot semantics, request correlation, lifecycle ownership, timeout verification, and focused validation. This document does not authorize implementation or changes to repository history.
