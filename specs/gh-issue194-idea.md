# Idea Spec — Create Fixup and Squash Commits

**Date:** 2026-09-12

**Status:** Clarified product design. Eleven answers and the maintainer’s native-Git policy are incorporated; implementation details and validation requirements are in [gh-issue194-impl.md](gh-issue194-impl.md).

**Origin:** [GitHub issue #194](https://github.com/onlineeric/speedy-git-ext/issues/194), requested by @nelson870708. The maintainer acknowledged the request for investigation and the roadmap.

## Problem and intent

The issue requests graph context-menu actions for creating fixup and squash commits without copying a hash into a terminal. It originally asked that the target be reachable from the current branch’s HEAD and that detached HEAD be excluded. The maintainer subsequently chose native Git behavior across all features, superseding those two restrictions: detached HEAD and non-ancestor targets are allowed.

The UX combines these actions into one dialog in the existing Create group, adds explanations, and optionally includes unstaged tracked changes and untracked files. The purpose is to prepare a correction for later history cleanup while keeping normal graph browsing fast.

## Git semantics that shape the design

| Choice | Git option | Effect when autosquashed later |
| --- | --- | --- |
| Fixup | `--fixup=<hash>` | Fold in changes; retain the target message. |
| Squash | `--squash=<hash>` | Fold in changes; combine messages for review. |
| Fixup and replace message | `--fixup=amend:<hash>` | Fold in changes; replace the target message. |

These create new commits at HEAD. Plain `--amend` takes no target hash and immediately replaces HEAD; it belongs in the existing Amend Last Commit workflow. A possible later message-only choice is `--fixup=reword:<hash>`, which ignores staged changes. `-a` includes modified/deleted tracked files, including unstaged portions of partially staged files, but excludes untracked files. [Git commit documentation](https://git-scm.com/docs/git-commit)

Autosquash reorders marked commits and changes their rebase actions. Its selected range must include the target; a root target needs `--root`. Standard markers use subjects, so duplicate subjects can make target matching ambiguous even when creation used a hash. Users should review the resulting todo list. [Git rebase documentation](https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---autosquash)

## Entry point

- Add **Create Fixup / Squash Commit…** to the Create group, after Create Branch Here and Create Tag Here.
- Offer the same action from the commit row and ref-badge Create menus. The selected commit is the target regardless of which badge opened the menu.
- Use one dialog. Every fresh opening selects Fixup with both inclusion checkboxes off (confirmed). Do not persist last-used choices between openings. Mode switches within the dialog and retries after failure preserve entered messages and choices.
- Keep the existing Amend Last Commit action separate.

This name exposes the terms the requester will look for and avoids suggesting that a new commit is inserted directly at the clicked row. The third mode is explained inside the dialog.

## Dialog

Title: **Create Fixup / Squash Commit**.

Show the target's abbreviated hash and subject, plus the destination: the current branch, or `Detached HEAD — no branch will advance`. Keep these visible while choosing options.

Always show this short explanation:

> Creates a new commit at HEAD (on your current branch when attached). The selected commit stays unchanged until you run an autosquash rebase.

Use radio choices with plain descriptions:

- **Fixup — keep target message** (default): “Add these changes to the target during autosquash.”
- **Squash — combine messages**: “Add these changes and review the combined commit message during autosquash.”
- **Fixup — replace target message**: “Add these changes and use the replacement message during autosquash.”

### Message fields

- Fixup needs no editable message field for the initial feature. Show the generated title as a read-only preview.
- Squash offers an **Additional message** multiline field. Allow it to be empty, consistent with Git’s generated title.
- Replacement-message mode offers a required **Replacement commit message** multiline field, prefilled with the target's complete message, including body and trailers. Preserve user edits when switching modes within the same dialog.
- Keep the generated marker separate from editable text so users cannot accidentally remove it. Show the prepared message preview with its actual prefix (`fixup!`, `squash!`, or `amend!`). Git’s configured cleanup and hooks may modify the final stored message; do not silently override that configuration.
- Do not open an external editor or silently accept an unedited message because the extension's Git editor is a no-op. The technical spec must establish a supported message-input path for each mode; amend-fixup cannot simply inherit every ordinary commit message flag.

### Included changes

Always show **Staged changes: N files — included**, including zero. Creating a new commit normally consumes staged work; an extra opt-in for staged changes would make the common path cumbersome.

Optional checkboxes, both initially off:

- **Also include unstaged changes to tracked files (`-a`)**. Show the applicable file count and explain that this includes all unstaged portions of partially staged files.
- **Also include untracked files**. Show only when eligible files exist, with a count. Include current non-ignored untracked paths using native Git add behavior. Do not force-add ignored files. Embedded repositories may be recorded as gitlinks by Git; label them where recognized and retain Git’s warning, without recursively adding their internal files or imposing an extra confirmation.

The options are independent: selecting untracked files must not implicitly include unstaged changes to existing tracked files. Do not implement that combination using an indiscriminate “stage everything” operation.

Provide a compact, expandable read-only list of the affected paths, with links to the existing change-review workflow where practical. Keep file/hunk selection in the existing staging UI. Counts for staged and unstaged categories may overlap; a combined file total must deduplicate paths.

Empty-content behavior follows the selected native Git mode; do not disable all three modes merely because counts are zero or add `--allow-empty` silently. A dedicated Reword-only mode remains outside this feature’s confirmed scope.

Show a live command preview, including any explicit staging step needed for untracked files. Use the existing dialog styling and a mode-specific primary button: **Create Fixup Commit**, **Create Squash Commit**, or **Create Message-Replacing Fixup**. Cancel closes without staging or committing anything.

## Availability and correctness

- Allow attached and detached HEAD and any real target commit accepted by Git, including one outside HEAD’s ancestry. HEAD itself is a valid target. Git’s selected command determines operation-state validity; do not impose a blanket paused-operation restriction without reconciling it with native behavior.
- Branch decorations, ancestry and first-parent membership do not gate creation. Later autosquash requires the intended target to be present in its selected range.
- Exclude synthetic graph placeholders with no backing commit object, including the uncommitted node. A real stash commit hash is a valid target under the native-Git rule; do not reject it solely because of its graph decoration.
- Allow merge commits as targets, following Git’s native behavior (confirmed 2026-09-12). A later CLI `git rebase -i --rebase-merges --autosquash <merge>^1` can fold the correction into the merge when the range includes it. Default linear rebase omits merge commits. Explain the merge-preserving option and normal range/conflict considerations; do not require manual integration as a blanket rule. Ordinary commits behind merges also remain eligible. An in-progress merge is a separate command-state case whose behavior must follow the selected Git command.
- A root commit may be targeted; explain the later root-inclusive rebase requirement.
- Keep temporarily unavailable actions disabled consistently with surrounding menu items. Empty staging does not disable opening the dialog: the inclusion options may supply changes.
- Filtered or partially loaded history does not restrict target eligibility. Validate target existence without loading full history or probing ancestry.
- Validate repository identity and target existence before mutation and follow native operation-state handling. If branch or HEAD changed in the same repository, keep the target/message, update the displayed destination and create at current HEAD. Do not reject, require reopening, or ask for another confirmation because branch/HEAD changed, including an attached/detached transition or branch switch at the same hash.
- Refresh status at execution to enumerate current included changes and check conflicts. The Create action authorizes current staged changes plus the current categories selected by the inclusion checkboxes. Do not compare contents, metadata, or path sets with the earlier display and do not require another confirmation when they change. Counts and path lists are informational. Repository/target validation and native operation-state handling still apply; branch/HEAD observations update the destination rather than gate it; this is not an atomic snapshot against external tools.
- While the modal is open, reject external `openForRepo` invocations immediately, leaving the current repository/dialog unchanged. Do not queue, defer or replay the rejected action when the dialog closes. The graph’s own repository selector is already blocked by the modal. After Stop waiting closes the dialog, a fresh repository-open action can navigate while background Git remains in its original repository. Within the same repository, current branch/HEAD is the destination; late responses remain associated with their original request.

## Running, success and failure

- Disable duplicate submission and conflicting extension operations while work runs.
- Let commit/hooks/signing run without an automatic timeout. After submission, **Stop waiting** closes the dialog and lets the accepted execution finish in the background; notify on completion and keep duplicate/conflicting submissions blocked while it runs. Preserve normal hooks and signing configuration. Cancel before submission still makes no changes.
- On success, close the dialog, show a success notification, refresh graph and working-tree status, and select the new commit where visible. Do not alter filters just to reveal it; explain when the current view does not show it. Autosquash guidance is available before creation; do not show a completion screen.
- On failure, retain the dialog, entered message and choices. Refresh actual status before retrying.
- If Stop waiting already closed the dialog, show a failure notification with **Reopen dialog**. Preserve the draft in memory and restore it only when the user clicks that action; never reopen or retry automatically. An explicit retry retains the message/options and uses fresh status.
- Clicking Reopen dialog explicitly returns to the original repository if necessary, then restores the draft. If another modal blocks it, reject immediately with no queue or replay. Future multi-tab routing will locate/open the appropriate tab; that routing change is outside this feature.
- Including untracked files may stage them before the commit runs. If the commit fails, report any files that remain staged; do not blindly reset the index, which may also contain prior or external staging changes. Opening or cancelling before execution must never stage files.
- After external interruption or loss of the execution result, inspect actual repository state and report completion or uncertainty. Stop waiting does not interrupt Git and normally reports its eventual exit result. A moved HEAD alone is insufficient proof that this particular request succeeded when external commits are possible. Avoid duplicate commits on retry.
- No automatic push, force push, amend or rebase follows creation. A published target does not itself make this new commit a history rewrite.

## Completing the autosquash workflow

Investigation of the current implementation found that `GitRebaseService.interactiveRebase` supplies a custom todo list; the dialog currently handles manually selected squash/fixup actions. Adding `--autosquash` to the command alone would not establish a correct integrated workflow because the custom sequence editor supplies the final list.

**Confirmed scope:** complete commit creation and clearly explain the separate autosquash step. Autosquash integration in Speedy Git's interactive-rebase dialog is a separate follow-up, outside this feature. Do not claim that the current interactive-rebase UI automatically recognizes the new markers.

A contextual help example can show `git rebase -i --autosquash <target>^`, with `--root` for a root target. For a merge target, show `git rebase -i --rebase-merges --autosquash <target>^1`; ordinary linear rebase omits the merge target. Label it as an example that requires reviewing the range and topology; do not execute it from this dialog. Later rebasing can conflict and rewriting already-published history may require coordination and a force push.

**Separate follow-up:** an Autosquash option in the interactive-rebase dialog that previews the reordered entries, supports replacement-message fixups, resolves targets within the chosen range, preserves message bodies, and fits existing conflict continuation. Its design and implementation belong in a separate spec; this commit-creation feature does not depend on it shipping.

## Performance requirements

- No extra Git commands, message reads or status scans during row rendering, scrolling or initial graph loading.
- Preserve lazy context-menu construction and memoized rows. Target validation is on demand; no reachability infrastructure or ancestry probe is needed for creation.
- Fetch full message data only when replacement-message mode needs it. Reuse that result within the dialog.
- Fetch status on demand; keep expensive path lists collapsed and virtualize large lists if necessary. Do not read diffs or file contents merely to compute counts.
- No full-history fetch or topology recompute for checkbox changes. Command/message previews are local dialog state.
- Scope asynchronous results and dialog dismissal to the originating repository/request; panel closure must not cancel background execution. Coalesce the normal refresh after completion.

## Telemetry review

Review and instrument the menu action, dialog confirmed/cancelled outcome, and commit operation result/duration through existing closed catalogs and helpers. Represent mode and selected inclusion options only through approved fixed enums/booleans or catalog actions supported by the existing schema. Update `telemetry.json` and focused tests during implementation.

Never transmit target hashes, subjects/messages, paths, branch/repository identity, hook output or user input. Do not track typing, preview changes, status refreshes or ancestry checks.

## Product acceptance examples

1. Staged hunks only, default Fixup: creates one correction commit and leaves unstaged hunks untouched.
2. Tracked checkbox on: includes unstaged tracked modifications/deletions, with the partial-staging consequence visible before confirmation.
3. Untracked checkbox alone: includes eligible new files and staged changes while preserving unrelated unstaged tracked changes.
4. Squash: supplies entered additional text and Git’s generated marker without truncation; final cleanup and hook behavior follow Git configuration.
5. Replacement-message fixup: supplies the complete edited message, respects Git cleanup/hooks, allows content-empty creation as Git does, and leaves the original target unchanged until later autosquash.
6. Filtered/incomplete graph and targets outside HEAD’s ancestry remain eligible without ancestry probes or a full-history load. Detached HEAD creation advances HEAD without advancing a branch.
7. Same-repository branch/HEAD changes preserve target/message and use current HEAD without reopening or another confirmation. Repository navigation must not silently change repositories; conflicts, hook failure, background completion and external interruption must not lose the draft or trigger automatic duplicate retries.
8. Large histories and many changed files: opening the feature does not add per-row work or degrade scrolling.
9. A later Git autosquash, in a suitable range, produces the expected content and message for each supported mode. Include duplicate-subject and root-target cases in validation.

## Confirmed decisions

- **Reopen returns to the original repository** — confirmed 2026-09-12. The explicit notification action opens the original repository and restores the draft; another modal rejects it immediately with no queued follow-up.
- **Background failure recovery is user initiated** — confirmed 2026-09-12. Notify with Reopen dialog and preserve the draft in memory. Do not reopen or retry automatically.
- **Reset choices on fresh openings** — confirmed 2026-09-12. Start with Fixup and both inclusion checkboxes off. Failed-operation retries retain their existing choices and entered message.
- **Reject external repository opens during a modal, without replay** — confirmed 2026-09-12. Reject `openForRepo` immediately; do not close the dialog, switch repositories, queue the invocation or act on it after the dialog closes. A later switch requires a fresh invocation.
- **Future independent tabs** — the maintainer plans tabs showing the same or different repositories, with a different-repository open creating a new tab. Keep state ownership compatible with that direction; multi-tab implementation remains outside this feature.
- **Use current HEAD on submission** — confirmed 2026-09-12. Same-repository branch/HEAD changes update the displayed destination while preserving target/message. No stale-HEAD rejection, reopening or renewed confirmation; repository switching is separate.
- **Stop waiting continues in background** — confirmed 2026-09-12. Close the running dialog without cancelling Git; notify when it completes and prevent duplicate submission while running. No automatic commit timeout.
- **Close on success** — confirmed 2026-09-12. Close the dialog, notify, refresh graph/status, and select the new commit where visible. Show autosquash guidance before creation; no completion screen.
- **Native Git behavior across all features; detached HEAD allowed** — confirmed 2026-09-12. Follow the corresponding Git command rather than add product restrictions. This also removes the issue’s target-ancestry requirement. This policy also governs empty-content commits, paused-operation states, embedded repositories, message cleanup and mode-specific Git support.
- **Merge targets allowed** — confirmed by the maintainer’s instruction on 2026-09-12 to follow Git’s native target support. Git supports creation and later merge-preserving autosquash; include contextual CLI guidance without implementing rebase integration.
- **Three modes** — confirmed by the maintainer on 2026-09-12. Include Fixup, Squash, and replacement-message Fixup. Do not add Reword only in this feature. The later native-Git rule supersedes the initial blanket content-change requirement: amend-fixup permits content-empty creation without adding a fourth mode.
- **Current changes, no content-review confirmation** — confirmed by the maintainer on 2026-09-12. Commit current staged changes and, when selected, current tracked unstaged and/or eligible untracked changes. No content/metadata/path-set comparison with the initial display and no renewed confirmation. Fresh status still determines inclusion and detects conflicts.

- **Third mode: fixup with replacement message** — confirmed by the maintainer on 2026-09-12. Use `--fixup=amend:<hash>` to create a new commit whose replacement message is applied during later autosquash. Immediate Amend Last Commit remains a separate workflow.
- **Commit creation only; autosquash integration is a separate follow-up** — confirmed by the maintainer on 2026-09-12. Include guidance about the later autosquash step, without enhancing or invoking the interactive-rebase workflow in this feature.

## Clarification outcome

The product decisions are resolved. The proposed menu wording **Create Fixup / Squash Commit…** is retained as an implementation choice; Git semantics follow the maintainer’s project-wide instruction rather than additional eligibility restrictions. Readiness, error recovery, supported command flags and tests are defined in the implementation spec.

No release version or What's New content is decided here. The contributor credit and release dialog belong to the maintainer's release pass.

## Handoff

[gh-issue194-impl.md](gh-issue194-impl.md) defines message construction/editor handling, mode-specific Git capability checks, staging and execution-time inclusion semantics, request correlation, lifecycle ownership, background completion and external-interruption handling, and focused validation. Implement and validate those contracts before treating the feature as complete. This document does not authorize implementation or changes to repository history.
