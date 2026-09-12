# Idea Spec — Correction Commits and Interactive Autosquash

**Date:** 2026-09-12

**Status:** Specification complete. Twenty-seven explicit clarification answers and the maintainer’s delegation of remaining choices are reflected here and in [gh-issue194-impl.md](gh-issue194-impl.md). Implementation and native/platform validation have not been performed in this documentation task.

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

Autosquash reorders marked commits and changes their rebase actions. Its selected range must include the target; a root target needs `--root`. Native creation flags generate subject-based markers even when passed a hash. The maintainer prefers new fixup/squash markers containing only the full target hash after the prefix, which native autosquash supports. This avoids ordinary duplicate-subject ambiguity, but a target independently rewritten before the rebase may leave a stale hash. Continue supporting native subject markers from other tools. Users should review the resulting todo list. [Git rebase documentation](https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---autosquash)

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
- Generate fixup/squash marker titles with the full target hash rather than its subject; use the same scheme for amend-fixup under the delegated consistency decision. Keep the generated marker separate from editable text so users cannot accidentally remove it during creation. Show the prepared message preview with its actual prefix (`fixup!`, `squash!`, or `amend!`). Git’s configured cleanup and hooks may modify the final stored message; do not silently override that configuration.
- Do not open an external editor or silently accept an unedited message because the extension's Git editor is a no-op. The implementation spec specifies `--edit` and a controlled message editor for each mode; amend-fixup cannot simply inherit every ordinary commit message flag.

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

**Updated confirmed scope:** complete the whole workflow inside Speedy Git by enhancing the existing Interactive Rebase dialog with autosquash planning and execution. This supersedes the earlier separate-follow-up decision. Creation does not start rebase automatically; the user later reviews and starts it in the dialog. The ordinary Rebase Current Branch onto This Commit command does not automatically become autosquash.

The enhanced dialog must detect `fixup!`, `squash!` and `amend!` corrections, resolve targets within the selected range, move corrections after their targets, and assign `fixup`, `squash` and `fixup -C` respectively. The original target normally stays Pick. Root and merge targets require appropriate range/root/merge-preserving handling. Preserve full messages and support conflict continuation for the actual reviewed plan.

**Dropdown policy, confirmed:** preselect Git’s automatic action and allow immediate dropdown changes, preserving existing manual Fixup. No per-row Unlock or global autosquash action locks. Preserve explicit action/message overrides through review and execution; do not reapply a detected action over a manual choice. Pick keeps the correction separate for this rebase; Reword plus removal of the marker also removes its future autosquash intent. Drop instead omits the correction’s changes. Validate edited grouping without silently resetting choices.

**Autosquash default, confirmed:** on each fresh opening, initialize the checkbox from the repository’s effective Git `rebase.autoSquash` setting, off when unset. Users may override it for this rebase without changing Git configuration or persisting a last-used default. Preserve that selection during the open dialog. Toggling rebuilds the plan. If actions, ordering or messages have manual edits, confirm discarding them first; cancellation preserves the checkbox and entire draft. Clean plans rebuild without a discard prompt. Adopt the replacement only when planning succeeds; errors preserve the current draft. Do not keep separate On/Off drafts.

**Range selection, confirmed:** make the interactive entry point available for real HEAD/root commits and detached HEAD independently of ordinary rebase-onto availability. Add Include selected commit, initially off on each fresh opening. Unchecked preserves the existing exclusive-base behavior; checked includes an ordinary selected commit by using its parent as upstream, or uses `--root` for a true root. Keep this choice independent of Autosquash. Show the effective range; never silently expand it to find correction targets. For a selected merge, show a parent selector when inclusion is checked: default to its first parent, show all parents with hashes and subjects, and use the chosen parent as the upstream base. This does not automatically enable Preserve merges. As a shared implementation choice, changing range uses the same rebuild/discard handling as changing Autosquash.

**Dragging, confirmed:** move only the dragged row, including when it is a correction’s target. Preserve manual actions/messages and derive the displayed fold destination from the edited todo order. Do not move groups automatically or snap corrections back to their marker targets. Allow legal destination changes; visibly reject invalid plans such as a leading Fixup without silently repairing them.

**Dropping a target, confirmed:** Drop changes only the selected row. Its corrections retain their actions, order and messages; show their effective fold destination in the edited plan. If no preceding eligible commit remains, show a validation error and prevent execution. Do not cascade Drop, convert corrections to Pick or silently skip them.

**Preserve merges, confirmed:** initialize from effective Git `rebase.rebaseMerges` configuration on each fresh opening, off when unset, retaining the configured mode. Allow a per-rebase override without writing configuration. Explain corrections whose merge targets are omitted when preservation is off; never automatically enable it. Reuse the plan-option rebuild/discard behavior when it changes. An included merge uses the explicit parent selector described above; parent changes share the plan rebuild/discard handling.

**Merge editing, confirmed:** retain commit rows and add an editable Git todo view for full topology control. Both views share one plan; switching views preserves edits and never reapplies autosquash. Show topology instructions in the row sequence, retaining full Git syntax in the text view. Preserve invalid text with diagnostics and prevent executing a stale row representation. Support the full native todo command set available in the installed Git, including explicit exec commands, edit/break pauses and update-ref. Commands execute only during the explicitly started/continued rebase, never during preview. Use native continuation controls and retain terminal access for interactive exec/hook input; no todo command runs during planning.

**Stale-plan behavior, confirmed:** on a changed branch/HEAD, show an error, prevent execution and keep the dialog open so all entered text remains available for copying. Require explicit Cancel and a fresh opening; no rebuild flow or automatic recovery. Keep the invalid state latched and preserve access to text across both views and all review steps. This is distinct from correction creation’s accepted current-HEAD behavior.

**Start lifecycle, confirmed:** close the rebase dialog only after correlated backend acceptance; keep rejected submissions open with their drafts. Show running and paused states in the main view using extended rebase status/continuation controls, distinguishing conflicts, edit/break pauses and command failures. No progress modal or Stop waiting flow for rebase. Acceptance is not completion; paused Git operations retain their resources.

**Runtime message editing, confirmed:** when Git requests message input during execution, show an in-app dialog containing its actual full proposed message and an explicit Submit message action. Keep applicable pre-reviewed messages associated with their real editor invocations; do not blindly replay cached messages over new proposals. Native cleanup/hooks still apply. Close for now dismisses the dialog without submitting or aborting: retain its edited draft and pending Git editor request without an input timeout. An explicit Edit message banner action restores the draft; refreshes never automatically reopen it. Persist in-progress rebase drafts and recovery information locally across reload/restart. On reopening the repository, inspect Git and process state before restoring recovery controls; never automatically continue, submit or rerun commands. Preserve ambiguous recovery drafts for copying. This does not change correction creation’s session-only retention.

Use Configure → Messages → Confirm, extending the old Squash Messages step to cover replacement/reword messages and skipping it when nothing needs review. When group changes affect an edited message, preserve the old text alongside the new proposal and require Keep edited text / Use new proposal; unchanged groups retain edits. Deleted groups leave their old drafts available for copying. An explicit edit of a non-editing replacement Fixup changes `-C` to `-c`, visibly in both views, so Git actually requests that edit.

The advanced merge option exposes both native cousin modes, defaulting to configured behavior. Native Continue, Skip, Abort, Quit, Edit remaining todo and Show current patch are available as appropriate. Editing remaining todo never implicitly continues. Runtime pauses release only finished-process leases so normal SCM staging/amend/commit resolution can proceed; pending editor processes keep their ownership.

Native Git generates and validates plans in an isolated private scratch repository, using borrowed read-only object access and a sparse index without checking out the source files. Capture the todo before replay; no user hooks, exec commands, source refs/index/worktree changes or fetching occur during preview. Real execution verifies the generated baseline before installing the reviewed todo. A terminal-backed runner supports interactive native commands while keeping progress in the main view and commit messages in the app. Detailed isolation, correlation and restart contracts are in implementation sections 19–22.

Keep CLI help as an optional explanation/fallback, not the only supported completion path.

## Performance requirements

- No extra Git commands, message reads or status scans during row rendering, scrolling or initial graph loading.
- Preserve lazy context-menu construction and memoized rows. Target validation is on demand; no reachability infrastructure or ancestry probe is needed for creation.
- During correction creation, fetch full message data only when replacement-message mode needs it. During rebase review, batch full-message reads for applicable groups on demand. Reuse results within the corresponding dialog.
- Fetch status on demand; keep expensive path lists collapsed and virtualize large lists if necessary. Do not read diffs or file contents merely to compute counts.
- Correction inclusion checkboxes update local previews without Git reads. Rebase option changes explicitly rebuild an isolated native plan; they do not reload full history into graphStore or recompute graph topology. Native validation is debounced and correlated to the current todo revision.
- Scope asynchronous results and dialog dismissal to the originating repository/request; panel closure must not cancel background execution. Coalesce the normal refresh after completion.

## Telemetry review

Review and instrument creation and rebase menu/dialog actions, native Start/Continue/Skip/Abort/Quit/todo-edit operations, runtime message outcomes and explicit recovery actions through existing closed catalogs and helpers. Represent mode and selected inclusion options only through approved fixed enums/booleans or catalog actions supported by the existing schema. Update `telemetry.json` and focused tests during implementation.

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
10. The integrated dialog generates the same todo as native Git for selected options, including merged histories, both cousin modes, native subject/hash markers and ref-update behavior. Source repository state and user programs remain untouched during preview.
11. Row/text edits, drag/drop and message review preserve user intent; invalid text never executes a stale model. Stale branch/HEAD errors keep all draft text copyable until Cancel.
12. Native pauses, runtime message dismissal, exec input/failure and restart recovery preserve operation identity without automatic submission/replay. Full native todo and linked-worktree recovery are verified on supported platforms.

## Confirmed decisions

- **Preserve affected message drafts for review** — when a group changes, show prior edited text and the new proposal and require a choice; unchanged groups need no renewed review.
- **Persistent in-progress rebase recovery** — retain drafts locally across reload/restart, reconcile native/process state, and resume only on explicit action.
- **Close runtime messages for now** — preserve the pending request and draft, leave Git waiting without an input timeout, and reopen explicitly through Edit message.
- **In-app runtime message editor** — display Git’s full proposed message and submit explicitly; never silently accept through a no-op editor.
- **Close rebase dialog after backend acceptance** — show progress and native pause reasons in the main view; rejected starts preserve the dialog/draft.
- **Stale rebase plans stay open for copying** — on branch/HEAD change, disable execution and plan changes, preserve all drafts/review access until explicit Cancel, and require reopening; no rebuild or automatic recovery.
- **Full native todo support** — include installed-Git commands, aliases and options, including explicit exec, edit/break and update-ref; never execute todo commands during preview.
- **Commit rows plus Git todo** — ordinary row controls and editable Git syntax share one plan, preserving topology and manual edits.
- **Merge parent selector** — when including a selected merge, default to its first parent and allow any parent, displaying hashes and subjects.
- **Preserve merges follows Git configuration** — off when unset; allow a per-rebase override and explain omitted merge targets without automatically enabling preservation.
- **Drop only the selected target** — keep correction actions/order/messages and update effective destinations; invalid fixups prevent execution.
- **Drag individual rows** — move only the dragged row, show its resulting fold destination, and validate the edited plan without restoring automatic grouping.
- **Include selected commit** — initially off, preserving the existing excluded base; including a true root uses `--root`.
- **Autosquash toggle rebuilds the plan** — confirm discarding manual action/order/message edits, if any; cancellation or planning failure preserves the original mode and draft.
- **Autosquash follows Git configuration** — initialize from effective `rebase.autoSquash` on each fresh opening, off when unset; permit a per-rebase override without writing configuration.
- **Editable automatic rebase actions** — preselect Git’s detected action and allow immediate changes. Retain manual Fixup and preserve overrides through review/execution; no action locks.
- **Hash-based marker preference** — the maintainer prefers full target hashes instead of target subjects in newly generated fixup/squash titles. They remain commit-message markers understood by Git; native subject-based markers from other tools must still work. The delegated final choice uses the same format for amend-fixup.
- **Reopen returns to the original repository** — confirmed 2026-09-12. The explicit notification action opens the original repository and restores the draft; another modal rejects it immediately with no queued follow-up.
- **Background failure recovery is user initiated** — confirmed 2026-09-12. Notify with Reopen dialog and preserve the draft in memory. Do not reopen or retry automatically.
- **Reset choices on fresh openings** — confirmed 2026-09-12. Start with Fixup and both inclusion checkboxes off. Failed-operation retries retain their existing choices and entered message.
- **Reject external repository opens during a modal, without replay** — confirmed 2026-09-12. Reject `openForRepo` immediately; do not close the dialog, switch repositories, queue the invocation or act on it after the dialog closes. A later switch requires a fresh invocation.
- **Future independent tabs** — the maintainer plans tabs showing the same or different repositories, with a different-repository open creating a new tab. Keep state ownership compatible with that direction; multi-tab implementation remains outside this feature.
- **Use current HEAD on submission** — confirmed 2026-09-12. Same-repository branch/HEAD changes update the displayed destination while preserving target/message. No stale-HEAD rejection, reopening or renewed confirmation; repository switching is separate.
- **Stop waiting continues in background** — confirmed 2026-09-12. Close the running dialog without cancelling Git; notify when it completes and prevent duplicate submission while running. No automatic commit timeout.
- **Close on success** — confirmed 2026-09-12. Close the dialog, notify, refresh graph/status, and select the new commit where visible. Show autosquash guidance before creation; no completion screen.
- **Native Git behavior across all features; detached HEAD allowed** — confirmed 2026-09-12. Follow the corresponding Git command rather than add product restrictions. This also removes the issue’s target-ancestry requirement. This policy also governs empty-content commits, paused-operation states, embedded repositories, message cleanup and mode-specific Git support.
- **Merge targets allowed** — confirmed by the maintainer’s instruction on 2026-09-12 to follow Git’s native target support. Git supports creation and later merge-preserving autosquash; include contextual CLI guidance and the integrated interactive-rebase workflow added to this scope.
- **Three modes** — confirmed by the maintainer on 2026-09-12. Include Fixup, Squash, and replacement-message Fixup. Do not add Reword only in this feature. The later native-Git rule supersedes the initial blanket content-change requirement: amend-fixup permits content-empty creation without adding a fourth mode.
- **Current changes, no content-review confirmation** — confirmed by the maintainer on 2026-09-12. Commit current staged changes and, when selected, current tracked unstaged and/or eligible untracked changes. No content/metadata/path-set comparison with the initial display and no renewed confirmation. Fresh status still determines inclusion and detects conflicts.

- **Third mode: fixup with replacement message** — confirmed by the maintainer on 2026-09-12. Use `--fixup=amend:<hash>` to create a new commit whose replacement message is applied during later autosquash. Immediate Amend Last Commit remains a separate workflow.
- **Complete workflow including interactive autosquash** — scope expanded by the maintainer after the initial 11-question clarification pass. Enhance the existing Interactive Rebase dialog to complete correction creation and later autosquash in-app. This supersedes the earlier creation-only/follow-up split; creation still does not start rebase automatically.

## Clarification outcome

Clarification is complete: twenty-seven explicit answers are recorded, and the maintainer authorized the assistant to choose the remaining details. Message preservation was also explicitly confirmed after that delegation. Menu wording **Create Fixup / Squash Commit…** is retained. The implementation spec defines native planning/validation, shared plan types and RPCs, message/terminal helpers, persistent recovery and ordered delivery milestones. Native parity, isolation and cross-platform tests remain implementation work, not unresolved product questions.

No release version or What's New content is decided here. The contributor credit and release dialog belong to the maintainer's release pass.

## Handoff

[gh-issue194-impl.md](gh-issue194-impl.md) defines message construction/editor handling, mode-specific Git capability checks, staging and execution-time inclusion semantics, request correlation, lifecycle ownership, background completion and external-interruption handling, and focused validation. Implement and validate those contracts before treating the feature as complete. This document does not authorize implementation or changes to repository history.
