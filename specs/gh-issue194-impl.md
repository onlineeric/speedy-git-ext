# Implementation Spec — Correction Commits and Interactive Autosquash

Date: 2026-09-12

Status: **Specification complete for implementation planning. Twenty-seven explicit clarification answers are recorded; the maintainer delegated all remaining decisions to the assistant. Product choices and technical architecture are resolved below. Runtime/platform validation is required during implementation; this document is not evidence that those tests have passed.**

Product context: [gh-issue194-idea.md](gh-issue194-idea.md). This document defines implementation contracts, ownership, failure handling, and validation. The clarification record and native-Git policy below govern the design. The idea spec has been synchronized with these decisions and the newly expanded rebase scope. Technical defaults not individually chosen by the maintainer are identified as implementation choices. This spec authorizes neither implementation nor Git history changes. No release version or What's New entry is assigned.

## Clarifications

### Session 2026-09-12

- Q: Must included content changes since opening the dialog trigger another confirmation? → A: No. Commit the current staged changes; each selected checkbox additionally authorizes the current tracked unstaged or eligible untracked changes at execution time. Do not compare content, metadata, or path sets against the earlier display or require another confirmation because they changed.
- Q: Should the feature include a fourth, Reword-only mode? → A: No. Keep three modes—Fixup, Squash, and replacement-message Fixup—with no dedicated Reword-only mode. The initial answer also accepted requiring content changes, but the later native-Git rule supersedes that requirement for amend-fixup, which Git allows to be content-empty. The maintainer corrected B to A before incorporation.
- Q: Should merge commits be allowed as targets? → A: Follow Git’s native target support. Git allows merge targets, so allow them here. Later CLI autosquash can fold the correction into the merge using `--rebase-merges`; no separate manual-integration requirement is imposed.
- Q: Should detached HEAD be allowed? → A: Yes. The maintainer also established a project-wide rule: every feature should follow the corresponding native Git command’s behavior, not impose additional product restrictions.
- Q: What should happen after successful creation? → A: Close the dialog, refresh graph/status, select the new commit where visible, and show a success notification. Autosquash guidance appears before creation; no completion screen.
- Q: What should Stop waiting do during execution? → A: Close the dialog and let Git continue in the background, then notify on completion. Prevent duplicate submission while it runs. Do not signal Git to terminate or impose the proposed 60-second commit timeout.
- Q: What if branch or HEAD changes in the same repository before Create? → A: Keep the selected target and entered message; execute at the repository’s current HEAD. Update the displayed destination when detected. Do not invalidate the dialog, require reopening, or request another confirmation for that change. Repository switching remains a separate lifecycle decision.
- Q: How should external openForRepo behave while a modal is open? → A: Reject that invocation immediately, leave the modal and repository unchanged, and never queue or execute it after the modal closes. The maintainer also specified a future multi-tab direction: independent tabs may show the same or different repositories; a different-repository open will later open a new tab. That future behavior is outside this feature’s implementation scope.
- Q: Should mode and inclusion choices reset on each fresh opening? → A: Yes. Start with Fixup and both inclusion checkboxes off. Retrying a failed operation preserves its existing choices and entered message; do not persist last-used choices between fresh openings.
- Q: How should a failed background operation restore access to its draft? → A: Show a failure notification with a Reopen dialog action. Preserve the message and choices in memory; reopen only on that explicit action and never retry automatically.
- Q: Should Reopen dialog return to the original repository if another repository is displayed? → A: Yes. The explicit action opens the original repository and restores its draft. If another modal blocks navigation, reject immediately without queuing. Future multi-tab routing will locate/open the appropriate tab instead.
- Additional direction during rebase clarification: prefer target hashes, not target subjects, in newly generated fixup/squash marker lines. Use a full target object ID as the implementation default. The delegated final decision uses the same full-hash format for amend-fixup. Dropdown behavior is settled below.
- Q: How should automatically recognized fixup/squash action dropdowns behave? → A: Use editable automatic defaults: preselect Git’s action, allow immediate changes, retain manual Fixup, and preserve explicit overrides instead of automatically reapplying the detected action. No per-row Unlock or global autosquash action locks.
- Q: How should the Autosquash checkbox be initialized? → A: On each fresh Interactive Rebase opening, follow the repository’s effective Git `rebase.autoSquash` configuration; off when unset. Allow a per-rebase checkbox override.
- Q: What happens when Autosquash is toggled after manual plan edits? → A: Rebuild the plan for the requested mode. If manual actions, messages or ordering have changed, first confirm discarding those edits; cancelling keeps the current checkbox and entire plan unchanged. Rebuild without a discard confirmation when no manual edits exist.
- Q: How should the selected commit be included in the interactive-rebase range? → A: Add an Include selected commit checkbox, initially off. Preserve the existing exclusive-base behavior when unchecked; including a root commit uses Git’s `--root`.
- Q: How should dragging rows behave after autosquash? → A: Move only the dragged row. Recompute and display the resulting fold destination, validate the edited plan, and preserve manual edits. Do not move the target’s correction group automatically.
- Q: What happens to corrections when their target is changed to Drop? → A: Change only the selected target row to Drop. Keep correction actions and order unchanged, display their effective destination from the edited todo, and reject an invalid plan if no preceding eligible commit remains. Do not automatically drop corrections, convert them to Pick or skip them.
- Q: How should Preserve merges be initialized? → A: Follow the repository’s effective Git `rebase.rebaseMerges` configuration on each fresh opening, off when unset, with a per-rebase override. Explain corrections whose merge targets are omitted; never automatically enable preservation because of detected targets.
- Q: Which parent defines the base when including a selected merge? → A: Show a parent selector defaulting to the first parent. Display each parent’s hash and subject and allow choosing any of the merge’s parents.
- Q: How should merge topology be reviewed and edited? → A: Keep commit rows and add an editable Git todo view. Ordinary edits use familiar row controls; topology edits use Git syntax. Both views represent the same reviewed plan.
- Q: Which commands should the Git todo editor accept? → A: Support the full native todo command set available in the installed Git, including explicitly user-entered exec commands, edit/break pauses and update-ref. Do not limit the editor to commit actions and topology instructions.
- Q: What should happen if the current branch or HEAD changes after preview? → A: Show an inline error, prevent execution and keep the dialog open with every draft available for copying. Keep invalidation latched; allow review navigation/copying but disable plan changes. Close only on explicit Cancel, then require a fresh opening. No in-dialog rebuild or automatic recovery. Detect same-hash branch changes as well as HEAD changes.
- Q: What should the dialog do after Start is accepted? → A: Close only after backend acceptance. Use the main-view rebase status and continuation controls for running, conflicts, edit/break pauses and command failures. Rejection before starting keeps the draft open; do not add a running progress dialog or Stop waiting flow for rebase.
- Q: Where should messages requested by Git during rebase execution be edited? → A: Use an in-app message dialog initialized with Git’s actual full proposed message and an explicit submit action. Messages already reviewed before Start remain part of the plan; requests still needing input during execution use this dialog.
- Q: What happens when the runtime message dialog closes without submission? → A: Close for now: preserve the draft and pending editor request, leave Git waiting without an input timeout, and offer Edit message in the originating worktree’s rebase banner. Closing neither submits the message nor aborts the rebase.
- Q: Should in-progress rebase drafts and recovery information survive VS Code reload/restart? → A: Persist them locally and restore recovery controls when the repository is reopened. Inspect actual Git/process state first; continue only explicitly. Never automatically rerun commands or assume a running process either stopped or survived.
- Q: What happens to an edited combined message when its group changes? → A: Preserve the edited text alongside the new proposal and require an explicit choice in Message Review. Unchanged groups keep their edits without another prompt.

### Delegated decisions — 2026-09-12

The maintainer instructed: “from now all question take your best suggestion.” No further product questions are required. These are assistant-selected decisions under that instruction, not additional individually answered questions:

- Use full target hashes for all three generated markers, including `amend!`; invoke a controlled editor in the original commit operation for every mode.
- Offer an advanced cousin-mode selector when Preserve merges is enabled, defaulting to effective Git configuration (otherwise `no-rebase-cousins`).
- Use installed Git to generate and validate todos in an isolated scratch repository; never start a preview rebase in the user's worktree. Section 19 defines isolation and fidelity.
- Keep the complete native todo as the authoritative plan. Use native syntax validation without replay, and retain opaque supported instructions without destructive row conversion.
- Expose native Continue, Skip, Abort, Quit, Edit remaining todo and Show current patch as applicable. Use existing staging/amend/terminal surfaces to resolve edit stops; do not automatically stage, amend, skip or retry exec.
- Use a terminal-backed executor mode for real rebase processes, preserving native interactive exec/hook input and output; keep main-view progress and in-app Git message editing. Section 21 defines the runner and recoverable editor bridge.
- Persist accepted rebase records locally and reconcile after restart without replay; retain ambiguous drafts until explicit dismissal. Creation-only drafts remain session-local.
- Keep scope to the described workflow and shared infrastructure it needs. No automatic push, unrelated feature rewrite, multi-tab implementation, package installation or release-note decision.

## 1. Scope and decision status

Confirmed from the idea spec:

- Create a new correction commit at HEAD, attached or detached; leave the target unchanged. Advance the current branch only when HEAD is attached.
- Include replacement-message fixup using `--fixup=amend:<hash>`.
- Keep immediate Amend Last Commit separate.
- Include autosquash in the existing Interactive Rebase dialog so the complete workflow is available inside Speedy Git. This supersedes the earlier separate-follow-up boundary. Creation does not automatically start rebase; users review and explicitly start the later rebase.
- Three modes: Fixup, Squash, Fixup with replacement message; no dedicated reword-only mode. Follow native empty-content semantics: amend-fixup can be content-empty, while ordinary fixup/squash retain Git’s normal rejection unless a native operation state permits otherwise. Do not add `--allow-empty` or a fourth mode.
- Allow merge targets, following Git’s native behavior. Merge-aware CLI autosquash guidance is included; integrated rebase UI work is now included under section 18.
- Success closes the dialog and shows a notification; graph/status refresh and visible new-commit selection follow. Show contextual autosquash guidance before creation, not in a completion screen.
- Stop waiting dismisses the running dialog without cancelling the execution; keep the mutation lease and notify when Git completes. No automatic commit timeout.
- Branch/HEAD changes within the same repository before submission are accepted: keep the target/message, refresh the destination display, and use current HEAD without another confirmation.
- With a modal open, reject `openForRepo` without changing repository, closing the dialog, queuing or scheduling a later action. Once the modal closes, only a fresh user invocation may switch repositories.
- Fresh openings always default to Fixup with both inclusion checkboxes off. A failed-operation retry retains mode, options and message; no last-used-choice persistence.
- Background failure shows a notification with `Reopen dialog`, retaining the draft in memory. Neither reopening nor retry happens automatically.

Implementation choices derived from the idea spec and native-Git rule:

- Menu label `Create Fixup / Squash Commit…`, after Create Branch Here and Create Tag Here. This wording was retained from the idea spec rather than asked as a separate cosmetic question.
- Allow any resolvable target commit, including a real stash commit; exclude only graph placeholders that have no backing commit object. No ancestry/branch-decoration eligibility logic.
- Empty additional squash text is valid. Require non-whitespace replacement text before submission, consistent with the native command without `--allow-empty-message`; Git/hook cleanup remains authoritative afterwards.
- Version support is checked per selected mode/required flag rather than imposing Git 2.32 on ordinary fixup/squash. Preserve installed Git configuration and native errors.
- External interruption is reported as uncertain when it cannot be attributed; normal Stop waiting does not interrupt Git. Background failure recovery is fully defined in section 10.

Confirmed during clarification: inclusion is category-based authorization of current changes at execution time. No content fingerprints, snapshot approval tokens, or renewed confirmation for changes in included contents or paths. Fresh status is for enumeration, display, and execution eligibility only.

Creation triggers no automatic push, force push, rebase, stash, index reset or signing/hook override. A later user-confirmed autosquash rebase in the existing dialog is now in scope. Dependency installation and release-file modification remain outside this specification task.

### Native Git compatibility — confirmed direction

The maintainer’s project-wide native-Git rule takes precedence over earlier provisional restrictions. Detached HEAD and non-ancestor targets are allowed. Do not call ancestry a creation prerequisite: Git uses the target to construct the correction message; later autosquash can only match a target included in its todo range. Do not add an ancestry probe just to open or submit this feature.

Creation behavior reconciliation is complete for this feature: no blanket empty-content/paused-operation/embedded-repository bans, no forced cleanup override, and no all-mode Git 2.32 gate. The checkbox maps to an explicit native add step for current untracked paths; it does not imply force-adding ignored files. A three-mode UI does not authorize adding `--allow-empty`. Existing application features are not being rewritten as part of this documentation task; the project-wide policy is recorded in repository instructions for subsequent work.

## 2. Existing code and reuse boundaries

| Existing code | Reuse / required change |
| --- | --- |
| `webview-ui/src/components/useCommitMenuItems.tsx` | Add one shared Create item for row and ref-badge menus; dispatch an open request instead of owning the dialog under the row. |
| `webview-ui/src/utils/commitReachability.ts` | Not required for this feature’s creation eligibility. Neither ancestry nor first-parent membership gates a native fixup/squash target. |
| `src/services/GitCommitService.ts` | Keep commit creation in this service; reuse full-message reading without copying the existing amend RPC's correlation behavior. |
| `src/services/GitDiffService.ts` | Extract/reuse porcelain parsing as appropriate. Do not use `getUncommittedSummary` as the authoritative confirmation read: it runs numstats, may collapse untracked directories, and substitutes empty status data on error. |
| `src/services/GitIndexService.ts` | Add literal, explicitly enumerated path staging support where reusable. Existing `git add -- ...paths` does not disable Git pathspec expansion. |
| `src/services/GitExecutor.ts` | All Git processes still go through this executor. Add an explicit opt-in no-timeout execution option for this workflow; preserve existing callers’ timeout behavior. Observe normal process completion independently of dialog visibility. |
| `src/services/GitRebaseService.ts` | Replace temporary counter-based editors and expand planning/execution under sections 18–22; keep the ordinary non-interactive rebase entry point's meaning. |
| `src/webview/OperationGuard.ts` | Do not invoke its blanket paused-operation rejection for correction creation. Git governs state/option compatibility; the separate mutation coordinator prevents simultaneous extension mutations. Existing callers are not rewritten here. |
| `src/webview/handlers/branchCheckoutHandlers.ts` | Reuse the principles of retaining original services, acquiring before awaiting, and matching request IDs. Checkout's private busy flag is insufficient as a shared mutation guard. |
| `webview-ui/src/App.tsx` | Own the dialog once, independently of virtualized rows and lazy menus. |
| Shared dialog, theme, copy, telemetry utilities | Reuse existing primitives. No independent styling or free-form telemetry schema. |

The existing amend interruption check treats any HEAD movement as success. Do not copy that inference into this feature.

## 3. Creation ownership and implementation files

Names below are concrete implementation locations; keep each file focused and adjust names if implementation discovers an existing equivalent.

- `shared/types.ts`: correction mode, status presentation, result unions, request/session IDs.
- `shared/messages.ts`: correlated correction requests and responses.
- `shared/errors.ts`: any new standardized error codes, kept in the runtime catalog.
- `src/services/GitCommitService.ts`: validate destination/target and execute correction commits.
- `src/services/gitCommitStatus.ts`: focused authoritative status acquisition and inclusion enumeration; uses `GitExecutor`, never its own Git spawn.
- `src/utils/gitStatusParsers.ts`: shared porcelain-v2 parsing if extracted from `GitDiffService`; preserve existing summary behavior for existing consumers.
- `src/services/gitCommitMessage.ts`: message construction and temporary editor lifecycle.
- `src/webview/handlers/correctionCommitHandlers.ts`: typed read/execute/dismiss/result dispatch.
- `src/webview/CorrectionCommitSessionStore.ts`: backend session records, current status presentation, active requests, bounded terminal-result retention.
- `src/webview/RepositoryMutationCoordinator.ts`: synchronous acquisition/release across conflicting extension mutations; explicit lifetime independent of current navigation.
- `src/webview/WebviewRuntime.ts` plus a shared frontend modal-state helper: panel-scoped active-modal tracking for the external repository-open guard. Reuse existing lifecycle mechanisms if available rather than track correction dialogs alone.
- `src/ExtensionController.ts`: guard `openForRepo` before any repository/service mutation or reload; rejected invocations are discarded.
- `webview-ui/src/components/CorrectionCommitDialog.tsx`: dialog UI and editable state.
- `webview-ui/src/utils/correctionCommit.ts`: pure mode/message/availability/presentation decisions; split only if responsibilities warrant it.
- `webview-ui/src/stores/graphStore.ts`: one dialog descriptor and active operation identity; never persist messages or status data to `globalState`.
- `webview-ui/src/rpc/rpcClient.ts`: request maps and correlated result application.

Own correction execution/session records and mutation coordination at extension lifetime (`ExtensionController`) so closing a panel does not dispose an active execution. Inject these capabilities through `WebviewProvider` and `WebviewRequestContext`, and do not pass the provider to handlers. Repo-bound service references are resolved at request start and retained for that execution, never captured when handlers are constructed.

## 4. Identity and data contracts

Use full object IDs for execution; short hashes are presentation only. Backend validates all incoming hashes, enum values, booleans, and session references. Do not hardcode 40 characters in new protocol types; use the repository's existing validation and explicitly test supported object formats.

```ts
type CorrectionMode = 'fixup' | 'squash' | 'amend';

interface CorrectionOptions {
  mode: CorrectionMode;
  includeUnstagedTracked: boolean;
  includeUntracked: boolean;
  additionalMessage: string;
  replacementMessage: string;
}

interface CorrectionDestination {
  repoPath: string; // local routing only; never telemetry
  branchRef: string | null; // full refs/heads/... identity; null means detached HEAD
  observedHead: string | null; // null for unborn HEAD; observation only, never a precondition
  targetHash: string;
}

type CorrectionExecutionResult =
  | { kind: 'created'; commitHash: string | null; notice?: string }
  | { kind: 'failed'; error: GitError; stagedPaths: string[] }
  | { kind: 'uncertain'; error: GitError; stagedPaths: string[] };
```

`created.commitHash === null` means Git exited successfully but the exact resulting object could not be attributed reliably, for example after concurrent external history changes. Report creation but do not select an assumed HEAD. A refresh failure after successful creation must remain a successful creation with a refresh notice, not become a retryable commit failure.

The destination’s `branchRef` and `observedHead` are observations refreshed from current repository state, not approval tokens or execution preconditions. Neither field is an expected-value assertion in the Create payload. The target hash stays fixed even when the checked-out branch changes.

Backend session data additionally holds: session ID, navigation generation, retained service identity, originating panel identity, canonical worktree/git-directory identity, target metadata, optional cached full message, latest status presentation, and terminal execution records. Backend enumerates eligible paths from fresh status using the submitted category options; the client does not submit an approved path list.

Correlate three different lifetimes explicitly:

- `sessionId`: one dialog opening.
- `requestId`: one RPC, including separate reads; prevents late reads overwriting newer state.
- `executionId`: one Create attempt; duplicate delivery returns the existing result or running status and never repeats the mutation.

Correction status data and terminal results are session-only. Bounded retention: keep the active session and unresolved execution; retain up to 32 resolved executions until extension-host disposal. Closing a panel must not erase active execution records or a background failure draft. Do not evict a running/uncertain execution or an unrecovered failure draft to satisfy the terminal-success cache bound. Resolved successes may be evicted only after their sessions are closed; a closed/unknown session rejects execution rather than recreating it, so replaying an evicted ID cannot commit again. Extension-host restart loses this ledger; do not promise cross-restart exactly-once execution.

## 5. RPC protocol

Requests, all registered in the exhaustive router map:

| Request | Payload / behavior |
| --- | --- |
| `prepareCorrectionCommit` | `{ requestId, repoPath, targetHash }`; validate current repository, allocate session, resolve destination/eligibility/status; no mutation. |
| `getCorrectionCommitMessage` | `{ requestId, sessionId }`; full message only on first entry to replacement mode, cached in that session. |
| `refreshCorrectionCommit` | `{ requestId, sessionId }`; refresh status and current branch/HEAD in the session’s repository; preserve target/message and never switch the session to another repository. |
| `createCorrectionCommit` | `{ requestId, sessionId, executionId, options }`; enumerate current included changes and execute at most once. |
| `dismissCorrectionCommit` | `{ requestId, sessionId, executionId }`; detach the UI from that execution without aborting, resolving it as cancelled, or releasing the mutation lease. |
| `getCorrectionCommitResult` | `{ requestId, sessionId, executionId }`; reconcile an interrupted wait without creating another commit. |
| `closeCorrectionCommit` | `{ requestId, sessionId }`; release idle review resources; cannot erase an active/uncertain execution. |

Responses use dedicated `correctionCommitPrepared`, `correctionCommitMessage`, `correctionCommitStatus`, `correctionCommitProgress`, `correctionCommitResult`, and `correctionCommitError` types. Include `requestId` and `sessionId` whenever allocated, and `executionId` for execution messages. Read errors before allocation still echo the initiating request ID.

Never resolve this feature through `pendingDialogAction`, generic `success`, or hash-only `pendingCommitMessages`. An unrelated RPC error must not reject this dialog's promise. Register pending reads before sending. Reject and remove pending reads on navigation/disposal; a client-side timeout means transport uncertainty, not proof that Git failed.

## 6. Eligibility and preparation

No new Git work on initial graph loading, render, scrolling, or unopened menus.

Opening the lazy menu uses only relevant known state. Ancestry never gates creation, so filtered or incomplete history requires no ancestry lookup. The dialog shows `Checking target…` while validating target existence and destination.

Preparation sequence:

1. Check request repository against the active repository; retain services and navigation generation.
2. Resolve canonical worktree identity and HEAD attachment using `git symbolic-ref --quiet HEAD`; a detached result is valid and maps to `branchRef: null`. Distinguish that expected exit status from command failure.
3. Read HEAD if it exists (unborn HEAD is not a blanket rejection) and resolve the target to its actual commit object. Use validated full commit hashes from backend metadata, peeling annotated refs where necessary. A real stash commit is a valid target; a synthetic uncommitted node is not. No initial commit can be targeted in a repository with no target object at all.
4. Read target subject and real parent metadata; determine merge/root status. A shallow boundary is not proof that the underlying commit is a root.
5. Do not check ancestry for creation. A commit on another branch is a valid target if Git can resolve it. Missing target objects are errors; shallow traversal is not a reason to reject an existing target. Preserve meaningful Git exit statuses instead of parsing localized stderr.
6. Read operation state for accurate presentation and error handling. Do not reject solely because merge/rebase/cherry-pick/revert state exists when the native command permits committing in that state. Git still enforces unresolved-index and option compatibility errors. Validate this matrix before implementation; a normal commit can complete a pending merge, so do not promise a single-parent result in that state.
7. Acquire on-demand status data and supported-Git information; recheck identity after asynchronous reads before publishing readiness.

HEAD and merge commits are valid targets. Parent count never disables this feature. A completed merge target is distinct from an in-progress merge. Do not reuse a blanket operation-state ban: the selected Git command decides whether that state permits creation. Neither parent count nor ancestry restricts creation. No remote/published-state queries are required: this operation appends history.

## 7. Included changes and execution-time status

Authoritative status uses porcelain v2, NUL-delimited output, explicit `--untracked-files=all`, and `--ignore-submodules=dirty` to count pointer changes without recursively scanning dirty submodule contents. Avoid numstat and diff-body reads for counts. Preserve original/renamed paths, index/worktree status, file modes, and submodule flags in parsed records. Parse unmerged records directly rather than swallowing them.

Read unmerged index entries using NUL-delimited Git output where needed for conflict checks. Do not read or compare staged blob IDs, raw index bytes, file metadata or file contents to detect changes since the dialog opened. Git performs its normal index/content processing when adding and committing.

Inclusion rules:

- Staged index changes always participate in content modes.
- `includeUnstagedTracked` uses normal `git commit -a` semantics, including unstaged parts of partially staged paths and index-known additions/intent-to-add where Git treats them as eligible.
- `includeUntracked` adds only the explicit eligible untracked file list. It does not enable `-a`.
- Count staged and unstaged categories separately; deduplicate the combined affected path list. A staged rename is displayed as old → new without losing either path's meaning.
- Existing submodule pointer changes may participate. Dirty files inside a submodule do not become parent-repository content. Never recursively stage inside submodules.
- Let Git handle embedded repositories natively: include their reported untracked path in the explicit add list and retain Git’s warning if it records a gitlink. Mark the path as an embedded repository in the list when recognized, and explain that its files are not recursively included. Do not recursively enumerate beneath `.git` directory/file boundaries or add `--no-warn-embedded-repo`. An embedded repository without a usable checked-out commit may fail naturally. Ignored paths remain excluded unless already tracked; no force-add flag is introduced.
- Preserve symlinks as symlinks; do not follow them outside the repository for enumeration.
- Honor sparse-checkout rules; do not add `--sparse`, force-add ignored paths, or clear skip-worktree/assume-unchanged flags.
- Counts do not prove a nonempty resulting commit. In particular, `-a` can cancel a staged modification with an unstaged reversal. Do not disable Create solely because displayed counts are zero: hooks or operation state can affect committability, and `--fixup=amend:` natively permits content-empty commits (including Git 2.32). Ordinary fixup/squash normally reject empty content without `--allow-empty`; let Git report that result rather than add a diff scan or dry-run validation pass. Show a staging hint for ordinary modes with zero displayed changes, not a new execution restriction.

### Inclusion policy — confirmed 2026-09-12

The Create action authorizes current staged changes plus the categories selected by the two checkboxes. Counts and path lists describe the last status read; they are informative, not an immutable approval snapshot.

- Neither checkbox selected: commit the current index. Do not compare staged contents with their earlier state.
- Tracked checkbox selected: additionally include current tracked unstaged changes through Git's normal `-a` behavior.
- Untracked checkbox selected: freshly enumerate and explicitly add all currently eligible non-ignored untracked files, even if they appeared after the dialog opened.
- Both selected: combine both categories with current staged changes.
- Do not compare file contents, metadata, paths, or counts against the initial display to trigger another confirmation. Do not read/harden an index fingerprint or allocate snapshot approval tokens.
- Native Git conflicts/option errors, invalid repository identity or missing target can still prevent execution. A changed branch/HEAD in the same repository is not an error. Empty-content rejection follows the selected Git mode, not a blanket UI rule. These are execution failures, not content-review prompts.
- Checkbox changes remain local; status reads occur on preparation, explicit refresh, submission and failure recovery. No diff-body scans or file-content hashes are added for this feature's validation.

Once untracked files have been enumerated for the add command, files appearing after that enumeration are not guaranteed to be included. Likewise, multiple Git commands cannot provide an atomic view against terminal tools. Do not retry or broaden staging automatically to chase external changes. Hooks and Git retain their ordinary behavior.

## 8. Serialization and navigation

Acquire the extension mutation lease synchronously before the first execution await. Release in `finally` only after the execution state is safely recorded. Do not hold Git's `.git/index.lock` across commands: Git itself needs that lock.

The lease must be checked by conflicting paths, not merely by the new dialog. Inventory and cover checkout, stash, stage/unstage/discard, amend, reset, merge, rebase, cherry-pick, revert, pull, and relevant submodule/worktree mutations. Read-only graph loads, comparisons, and message reads stay available. Account for shared refs across linked worktrees; canonical common-directory identity is the conservative serialization boundary within one extension host. Other extension hosts and terminal tools remain external actors.

Do not reset active leases during repository navigation. Retain original services throughout staging/commit/reconciliation. Every UI response is checked against session and repository generation; never refresh or select a commit in a newly navigated repository because an old operation completed.

Confirmed dialog lifetime within one repository: retain target, options and draft text across ordinary refresh, row unmount, branch checkout and HEAD movement. Update destination from normal status/graph refresh and read current destination on submission; never compare it with an opening-time branch/hash to reject execution. In-flight operations continue against their original repository even after Stop waiting or panel closure.

### External repository-open guard — confirmed 2026-09-12

The dialog is modal within the webview, so the graph's repository selector is inaccessible behind it. The external VS Code Source Control title action is different: `ExtensionController.openForRepo` currently calls `switchActiveRepo`, replaces services, and reloads the existing graph without consulting dialog state.

- While a modal dialog is open in the existing graph panel, reject `openForRepo` before `switchActiveRepo`, `reinitServices`, `showGraph`, repo-list publication or reload. Leave current repository, dialog, draft and any active Git operation unchanged.
- Reject the command invocation itself; do not cancel the open dialog or its operation. Show `Close the dialog before switching repositories.`
- **No queue, deferred callback, retry timer, pending repository path, or automatic replay after dialog closure.** Closing the modal only releases the restriction. The user must invoke the command again if they still want it.
- Track modal activity per panel, covering existing modal dialogs as well as this feature. Account for nested modals with identities/counting so closing one cannot report idle while another remains open. Clear disposed-panel state without affecting other panels or active background operations.
- Frontend/backend modal state requires a typed lifecycle message or existing equivalent, correlated to the panel lifetime. Establish the modal state before an external command can act on a displayed dialog; do not rely only on a correction-execution busy flag. Verify opening/closing/disposal ordering and rapid external invocations in focused tests.
- Stop waiting closes the modal, so a newly invoked `openForRepo` may then navigate normally while the earlier accepted operation continues in its original repository.

Implement ordering with a small panel-local navigation/modal lease: the shared modal primitive requests `acquireModal { requestId, modalId }` and renders open only after the backend records the lease and acknowledges it. Closing releases that modal ID; nested modals acquire distinct IDs. The host obtains a navigation lease synchronously before the first `openForRepo` await; acquisition fails immediately while any modal lease exists, and no failed invocation is retained. If navigation already holds the lease, reject a modal-open request for the old repository/session rather than display it against replaced services. Release navigation after success/failure. Panel disposal releases its modal/navigation state; a late acknowledgement cannot reopen a disposed or cancelled modal. Include these lifecycle RPCs in the exhaustive message map without tracking them as Git operations. Reuse this shared primitive across the app's modal dialogs; avoid one-off per-dialog copies. This handshake orders concurrent events; it never stores a rejected repository open for later execution.

### Future multi-tab direction — design constraint, not implementation scope

The maintainer plans independent app tabs that can display either the same or different repositories. A future `openForRepo` for a different repository will open a new tab instead of replacing the current tab's repository. Do not implement multi-tab routing in this feature and do not preemptively apply the future routing rule to today's single-panel application.

Keep modal state, dialog draft, navigation generation, filters and UI selection panel-local. Keep running operation ownership at extension lifetime, correlated to both originating panel and repository/worktree. Repository mutation coordination is shared across tabs that operate on the same repository; separate tabs must not accidentally bypass a running operation's guard. Do not use a global modal flag that would later block opening an independent tab. A result cannot close or select in another tab merely because that tab displays the same repository.

## 9. Git execution and message handling

Before **any staging**, resolve available selected-command capability information, verify session/repository/target validity, and enumerate current inclusion paths. Apply only operation-state restrictions imposed by that command. Read current branch/HEAD for destination presentation and completion evidence, not as an opening-time equality check. Git determines the actual destination when the command executes; do not try to freeze HEAD across external commands. Fresh included paths or contents do not require another confirmation. Keep the lease across explicit add and commit.

Untracked staging uses an exact list of current Git-reported untracked paths, global literal pathspec handling, and NUL-separated pathspec input where supported. Use individual files for ordinary directories; preserve Git-reported embedded-repository entries as paths. Never use a broad directory wildcard:

```text
git --literal-pathspecs add --pathspec-from-file=- --pathspec-file-nul
# stdin: current eligible untracked paths separated by NUL
```

The preview describes that explicit file-list step; it must not present a broad `git add .` approximation. Enumerate non-ignored untracked paths immediately before staging; Git decides any ignore/type changes after that read. On add failure or external interruption, refresh the actual index because a partial change must not be assumed impossible. Never automatically unstage to roll back.

Mode commands, with optional `-a` only when selected:

| Mode | Command and message path |
| --- | --- |
| Fixup | `git commit [ -a ] --fixup=<full-target-hash> --edit`; controlled editor writes `fixup! <full-target-hash>` plus final newline. No user-editable message field. |
| Squash | `git commit [ -a ] --squash=<full-target-hash> --edit`; controlled editor writes `squash! <full-target-hash>` plus an optional blank line and full additional text. Do not pass `-m`, `-F`, `-C` or `-c`. |
| Replacement fixup | `git commit [ -a ] --fixup=amend:<full-target-hash> --edit`; controlled editor writes `amend! <full-target-hash>`, a blank line, and the full replacement message. Do not pass `-F`, `-m`, `-C` or `-c`. |

The prepared replacement message is `amend! <full-target-hash>`, a blank line, then the edited full replacement message. The hash remains the original target object ID even if the replacement subject changes. Applying the same marker format to amend-fixup is the delegated consistency decision. Supply the complete edited text, including body and trailers, to Git without truncation. Do not force `--cleanup=whitespace` or override `commit.cleanup`: normal Git cleanup/configuration may remove comment lines or normalize whitespace. The preview is the prepared message, not a guarantee of the final stored bytes; add the note `Git cleanup and hooks may modify this message.` Reject whitespace-only replacement text and NUL input. Do not silently truncate text.

Fetch `%B` only when replacement mode is first selected. Cache the result within the session, preserve independent squash/replacement edits when switching, and never let a late fetch replace edited text. The existing helper trims trailing newlines; document that normalization rather than promising byte-identical commit-message round trips.

The temporary editor must:

- Use an extension-created private temporary directory and file permissions suitable for commit-message data.
- Put message contents in a file, never executable shell source, CLI `-m`, logs, or environment values.
- Pass only controlled paths to the editor script, quote all paths, handle Windows Git shell conventions, spaces and non-ASCII paths.
- Write to Git's supplied message path and fail on I/O errors; never silently fall back to the no-op editor.
- Clean up after the Git process has finished using the files, including failure paths; do not remove files while an interrupted process may still need them.
- Preserve inherited hook/signing and cleanup configuration. The controlled editor writes the user’s complete prepared replacement at Git’s normal editor phase; this is an intentional full-message edit and can replace earlier `prepare-commit-msg` edits. Do not pretend it appends or preserves unknown hook text. `commit-msg` runs afterwards and may change/reject that message. Hash-marker construction for ordinary fixup/squash also requires a controlled message-input/editing path; document its native cleanup and prepare-commit-msg interaction instead of pretending it is the flag’s unchanged default. Do not create a commit then amend it merely to change its marker. Integration tests cover both hook phases and configured cleanup.

Use the existing Git-shell path/quoting conventions for a minimal editor script that copies the extension-created message file to Git's first argument, with both paths quoted and the copy exit code propagated. The message file path may be passed through a dedicated environment variable; message text must not be. Create the directory with `fs.mkdtemp` under the OS temporary directory and keep script/message cleanup attached to the backend execution's `finally`, not React unmount. The creation editor needs no counter or rebase state. The expanded rebase workflow has separate editor-lifecycle requirements in section 18. Validate Windows Git shell invocation and paths containing spaces/quotes before shipping.

Capability policy: retain ordinary fixup/squash when supported even if amend-fixup is unavailable. Reuse `GitConfigService.getGitVersion` and parse numeric components with vendor suffixes; known Git versions below 2.32 disable only replacement mode with a Git-upgrade explanation. For an unrecognized version, inspect read-only `git commit -h` capability output when possible; treat unknown as unknown rather than falsely declaring support or imposing a global minimum. If support cannot be established, let the selected native command report its error; a preceding add can leave paths staged and uses the normal failure-recovery contract. Do not silently emulate an unsupported mode with a different command.

Use `git add --pathspec-from-file=- --pathspec-file-nul` when supported (Git 2.25+). For older/unknown support, use literal argv path batches with a conservative platform command-length bound, preserving the exact enumerated list and `--` separator. Stop on the first failing add batch and report actual staging; never restage a broad directory as fallback. Existing porcelain-v2 support is a repository baseline; do not introduce an unrelated compatibility rewrite. Cache capability reads per Git executable identity for the extension session, not per rendered row.

## 10. Execution state machine, background work and recovery

Frontend states: `preparing → ready → submitting → created`, with `failed`, `invalidated`, and `uncertain` branches. `background` means the dialog has been dismissed while the backend execution is still running; it is not a terminal result. Confirmation is disabled outside `ready`/retryable failure state. Execution progress distinguishes validation, adding untracked files, committing/hooks, and reconciling; do not display invented percentages.

### Waiting and dismissal — confirmed 2026-09-12

- Cancel before submission closes the dialog without mutation.
- After submission, `Stop waiting` closes the dialog while the accepted execution continues, including any remaining explicit-add/commit phases. It does not signal Git, cancel a hook, or roll back the index.
- Keep the backend execution ID, draft options/message, temporary editor files, and mutation lease until actual completion. Reopening the feature while it runs must not create a duplicate operation.
- Do not impose the proposed 60-second commit timeout or the executor’s default 30-second timeout on commit. Explicit-add processes can also run user clean filters; they must not be terminated solely because the UI stopped waiting. Use no automatic timeout for the mutating add/commit phases; read-only preparation calls may retain their existing timeout.
- Add an explicit executor option such as `timeout: null` to mean no timer. Omitted timeout preserves existing 30-second behavior. Never use an arbitrary enormous timeout as a substitute. Do not attach a dialog-close/navigation AbortSignal to execution.
- Escape/backdrop dismissal while running must either be disabled or route through exactly the same background transition, never through cancellation. Use the explicit Stop waiting button; disable running-state Escape/backdrop dismissal.
- Observe actual Git process completion. A dismissed dialog must not cause the execute handler to return early and report telemetry success before Git has exited.

### Completion delivery

Retain execution ownership at extension lifetime, independent of panel disposal/navigation. Deliver the terminal result to the originating panel and matching active webview session where possible; repository identity alone is insufficient for future same-repository tabs. If the dialog was dismissed or the original panel/repository is no longer displayed, use a VS Code notification so background completion remains visible. Send one user-visible terminal notification, not duplicate webview and VS Code notifications.

On background success, refresh/select only when the original repository is still displayed and a new commit hash is reliably known. Otherwise notify without switching repositories.

On background failure, preserve the target, mode, entered messages and inclusion choices in memory. Show a VS Code failure notification with a `Reopen dialog` action and report any files left staged by the explicit add. Dismissing or ignoring the notification does not open a dialog, navigate, or retry. Clicking the action restores the failed draft, refreshes current status/destination, and requires an explicit Create click to retry with a new execution ID. This is recovery of the existing draft, not a fresh opening that resets options. Do not automatically pop the failed modal back over the user's work.

The notification action resolves the retained execution/session record rather than capturing a disposed React component or stale service instance. If its original repository is still displayed, restore the draft in the originating panel. Otherwise, the explicit click authorizes opening the original repository in today's single-panel application (creating/revealing the panel if needed), then restoring the retained draft after matching repository readiness. Check the modal guard before navigation or restoration: if another modal is open, reject immediately with no overwrite, queue or replay. Keep the draft available for a later explicit attempt. Never apply it to the currently displayed repository merely because that repository is active. If the repository/target is unavailable, report the error and preserve the draft; do not fall back to another repository or commit.

For future multi-tab routing, the same explicit action will locate/open the appropriate repository tab without replacing an unrelated tab. That router is outside this feature. Retained correction-creation drafts are not persisted across extension-host restart; in-progress rebase drafts follow section 21.

A successful Git exit is evidence of command completion. A failure of graph refresh afterwards remains a successful commit with a refresh notice, not a retryable commit error. Do not blindly return current HEAD as the created commit when external tools may have changed it.

### External interruption and uncertainty

Normal Stop waiting does not require cancellation reconciliation because Git continues to a real exit result. Keep `uncertain` for external process termination, extension-host loss, or a result that cannot be established. HEAD movement alone does not prove this execution succeeded; unchanged HEAD at one instant does not prove an external hook has stopped.

Do not automatically retry after disconnection/restart. In a live host, retain a still-running lease until process completion; after an observed externally interrupted process exit, release the process lease but keep that execution terminally uncertain and non-replayable. Disable retry on the uncertain session, show the observed outcome and Git-output access, and allow closing it. A later fresh user-initiated creation remains a new command, not recovery proof; do not promise it cannot duplicate an unobserved external result. The in-memory ledger does not provide cross-restart exactly-once behavior. Observe and report available evidence without claiming a content fingerprint proves request ownership. An unresolved execution cannot be turned into a retryable failure just because a timer elapsed.

On any failure after explicit staging, report the paths from this request that are actually still staged, separately from pre-existing staged changes. Do not claim exclusive ownership if external staging is indistinguishable. Refresh status before an explicit retry, which uses current staged changes and retained inclusion categories with no additional content-review approval.

Extension-host shutdown can interrupt observation of Git and is distinct from closing the panel. Do not promise background survival across application exit or persist user message contents automatically to globalState. No Stop/kill operation is added by this feature.

## 11. Dialog and success behavior

- Initialize a fresh dialog session with mode `fixup`, `includeUnstagedTracked: false`, `includeUntracked: false`, and empty additional squash text. Fetch the selected target's full message lazily on first entry to replacement mode. Do not seed any choice from a previously closed fresh session, another repository, or another panel. Switching modes in the same session and recovering a failed operation preserve edits and choices; neither counts as a fresh opening.
- Target hash/subject and destination remain visible. Show the receiving branch when attached, or `Detached HEAD — no branch will advance` when detached. Explain that creation appends at HEAD and later autosquash changes the target.
- Native accessible radio/checkbox/textarea controls, associated labels/descriptions, keyboard navigation and focus management through existing Radix patterns.
- Staged count is always shown, including zero. Explain partial staging beside the tracked inclusion option. Show the untracked checkbox when eligible paths exist or the option is already selected. If paths disappear, keep the selected category and display zero rather than silently changing user intent; a fresh execution enumerates any new paths. A fresh dialog with no eligible paths may hide the unchecked option.
- A collapsed, read-only affected-path list includes category badges and rename/submodule descriptions. Use a bounded scroll area; virtualize expanded lists above 200 paths with the installed react-virtual library. Do not mount rows while collapsed, and do not render thousands of hidden rows.
- Command and message previews are local computations. Label internal editor/file-list handling honestly; the preview is explanatory, not a shell-ready command containing user messages.
- The change-review link opens the existing diff editor for a selected included path without dismissing the draft; staging stays in the existing staging UI. Returning after staging refreshes displayed status without a separate approval step.
- Primary button labels follow the idea spec. Cancel before execution makes no changes. Use existing shared button, dialog, inline-message and theme-color primitives.
- On an attributed `created` result for the active session, close the dialog and show a success notification, then coalesce one graph/status reload. A successful Git exit with an unknown resulting hash still closes the dialog and reports creation; skip selection rather than guess. Do not wait for a refresh to succeed before recognizing creation. Root/merge/duplicate-marker autosquash guidance is available before submission; no completion screen is shown.
- Select the attributed new commit only if it is actually present and visible in the refreshed graph. Preserve active filters, do not fetch full history just to select it, and do not select a different current HEAD. If absent, say it is not visible in the current view; do not blame filters without evidence.
- Autosquash help is explanatory only: `git rebase -i --autosquash <target>^`, or `git rebase -i --autosquash --root` for an actual root. For merge targets use the `--rebase-merges` example in section 12 rather than the linear-rebase example. Warn that range/topology must be reviewed and the enhanced Interactive Rebase dialog provides the integrated path. Keep ordinary Rebase Current Branch onto This Commit distinct; it does not become autosquash implicitly.

## 12. Special target and repository cases

- Merge targets: all three creation modes accept a merge commit as the target and create an ordinary correction commit at HEAD. Default linear rebase omits merge commits, so an unmatched correction normally remains a separate pick (subject ambiguity can also match a different commit). For a merge target `M`, show the contextual CLI example `git rebase -i --rebase-merges --autosquash M^1`. The chosen range must include the merge. Git can place the correction immediately after the merge todo instruction and fold it into the recreated merge. Review the todo and resolve conflicts as usual; original merge resolutions/manual changes may need reapplication. This is not a promise that every topology rebases conflict-free.
- Duplicate subjects: newly generated fixup/squash markers use full target hashes to avoid ordinary same-subject ambiguity. Continue accepting subject-based markers from native Git/other tools, using Git’s matching order without a full-history scan. Do not describe hash markers as immune to stale targets or every pathological Git matching case.
- Targets already named `fixup!`, `squash!`, or `amend!` remain supported. Let Git generate the marker and apply its nested-marker matching during later autosquash; do not create a new target restriction. Use the same general todo-review guidance, not a separate mandatory confirmation.
- Empty/multiline target subject: use Git's actual subject formatting for marker consistency. Do not invent a different subject that would break matching; provide an actionable limitation if a target cannot be safely represented.
- Multiple replacement fixups: explain only if needed that final autosquash message choice depends on sequence order; creation does not reserve future ordering.
- Root in a shallow clone: distinguish true zero-parent object metadata from truncated traversal. A missing target causes validation failure; do not read or require unrelated ancestor objects for creation, and do not fetch objects automatically.
- Renames, case-only renames, newline/tab/non-ASCII/pathspec filenames, symlinks, executable-bit changes, binary/large files, intent-to-add and staged deletion plus recreated path all need Git-based validation.
- Read-only filesystem, missing identity/signing key, failing hooks, stale index locks, unavailable Git, sparse checkouts, linked worktrees and submodule navigation return ordinary actionable failures without bypass switches.

## 13. Telemetry and logging

Add `createCorrectionCommit` to the tracked operation catalog. Reads, status comparisons, previews, typing, mode switches, and dismiss-control RPCs are not tracked Git operations.

Add menu action `createCorrectionCommit` on existing row/badge surfaces and dialog ID `correctionCommit`. Use `useDialogTelemetry` for one confirmed/cancelled event per open cycle. Confirmation means the first submitted Create intent; a later retry does not create a second dialog outcome, while each actual execution attempt has its own operation result. Restore the session’s already-reported outcome latch on draft recovery so remounting the dialog does not emit a second outcome for that same session. Stop waiting after confirmation does not emit cancelled. Duration still covers Git’s actual execution; the existing telemetry duration clamp applies without stopping the operation.

Mode/inclusion instrumentation uses existing fixed UI action schema: one of `correctionModeFixup`, `correctionModeSquash`, `correctionModeAmend`, and checked-only `correctionIncludeTracked` / `correctionIncludeUntracked` on submission. This measures aggregate option usage without correlating all options on one event. No per-operation option-combination analysis is added in this feature; aggregate fixed actions match the existing schema without extending property shapes.

Update router `classifyFailureResponse` for dedicated correction failures and uncertain results so they are not silently counted as success. Use standardized error codes for invalid repository/session, unsupported Git, invalid target, and uncertain outcome where existing codes do not describe them. Validation-only rejection must remain distinguishable from actual successful creation.

Update `shared/telemetry.ts`, `telemetry.json`, backend validators and focused tests together. Never send message text, names, paths, hashes, repository identity, request IDs, hook output or exception details. Avoid logging message contents and full status lists locally too; normal existing Git command logging is not telemetry.

## 14. Validation plan

Unit/service tests with mocked executor:

- Eligibility allows attached and detached HEAD, non-ancestor targets, incomplete graphs, merge/root targets, and rejects missing target objects. No ancestry probes are performed.
- Status parser handles ordinary/rename/unmerged/untracked records and whitespace/newline-containing filenames and NUL record delimiters correctly; status failure never becomes a clean status.
- Inclusion options preserve independence, deduplicate paths, preserve native embedded-repository gitlink behavior and account for existing submodule pointers.
- Changed staged contents, tracked edits and newly eligible untracked paths since opening are included according to the selected categories without content/metadata comparison or renewed confirmation. Unchecked categories remain excluded. No fingerprint or snapshot-approval RPC is introduced.
- No staging/commit occurs on failed capability, invalid repo/session, Git-incompatible state, invalid input or pre-execution cancellation.
- Same-repository branch checkout, external commit and attached/detached transitions before Create preserve target/message, update the destination, and execute against current HEAD without reopening or confirmation. No expectedHead comparison is added.
- `openForRepo` while any modal is open returns without switching repository, replacing services, reloading, closing the dialog or altering Git execution. Closing the modal afterwards causes no follow-up action; a fresh invocation then works. Cover nested modals and panel disposal, and ensure future panel identities cannot cross-apply responses.
- Duplicate execution IDs, late reads, unrelated errors, dismissal of a different request, navigation and component unmount cannot cross-resolve operations.
- Every mutation route required by the lease inventory refuses overlap; read-only routes remain available.
- Message input includes bodies/trailers/comment lines without truncation; final Git cleanup follows configuration. Mode switches preserve edits, and late full-message reads cannot overwrite user text. No implicit cleanup/allow-empty/hook-bypass switches are added.
- Fresh openings reset mode and both inclusion flags regardless of previous session/repository choices; same-session mode switches and failed-operation recovery retain edits and choices.
- A known successful commit followed by failed refresh remains success; unrelated HEAD movement after external interruption remains uncertain.
- Successful creation closes the active dialog and notifies once; refresh selects only the known new commit if visible. A late result for an old session cannot close a newly opened dialog. Autosquash guidance is accessible before submission, with no completion screen.
- Stop waiting closes the UI without aborting Git, releasing the lease or deleting editor files; completion notifies once even after panel closure. Add/commit have no automatic timeout. Duplicate execution remains blocked while in background.
- A failed background operation shows `Reopen dialog` without automatically opening it. Clicking restores the original target/message/mode/options and refreshed status, but performs no add/commit. Retry uses a new execution ID; ignoring the notification causes no action.
- Reopen dialog after repository navigation explicitly returns to the original repository before restoring its draft. An intervening modal rejects the action with no queued replay. A missing repository/target reports an error without retargeting or losing the draft.
- Explicit add failure and commit-hook failure refresh actual staging; no rollback command is issued.
- Telemetry classifies each result correctly and rejects all content-bearing properties.

Git integration validation during implementation, using disposable fixtures only when authorized under repository Git restrictions:

1. In ordinary commit state, each mode creates a child of HEAD at execution time and leaves the selected target unchanged. During a native Git state that changes commit parents (such as completing a merge), preserve native parent/state behavior rather than assert a single-parent result.
2. Later CLI autosquash in a suitable range yields expected content and complete messages for all supported modes.
3. Staged-only partial hunks preserve unstaged hunks; `-a` includes the complete tracked state; untracked-only leaves unrelated tracked edits untouched.
4. Empty squash addition, content-empty amend-fixup, ordinary empty fixup/squash Git rejection, whitespace/comment/trailer replacement messages under default and configured cleanup, changed replacement subject, Unicode and shell-metacharacter messages.
5. Staged change cancelled by unstaged reversal; intent-to-add; file deletion/recreation; rename; binary; executable bit; symlink.
6. Duplicate subjects, nested markers, root, HEAD, merge targets in all three modes with later `--rebase-merges --autosquash`, ordinary commit behind a merge, shallow boundary and absent target. Verify the recreated merge retains its parents/topology, incorporates the correction, and applies the selected message semantics; also show that default linear rebase omits the target merge.
7. Existing submodule pointer vs dirty-only state; embedded normal repository and linked worktree; ignored files; sparse checkout.
8. User hooks that reject, edit the message, modify the index, run longer than 60 seconds, outlive externally terminated Git, or complete after Stop waiting; configured signing remains honored.
9. External checkout to another branch or between attached/detached HEAD at the same hash, external commit and index edit. Invoke the Source Control openForRepo action while a modal is open: it is rejected, and closing the dialog does not later switch repositories. After Stop waiting, a fresh repository-open action succeeds without retargeting the background operation.
10. Linux/macOS and Git for Windows editor/pathspec handling; Git below 2.32 retains ordinary modes, 2.32 supports amend-fixup, current Git, vendor/unknown version strings and literal argv staging fallback. Unborn HEAD with an existing target on another ref is handled according to Git.

Do not run the destructive test-repo generators or modify the maintainer's hand-made test repository. Do not install packages. Provide manual commands if needed for missing tooling. Integration fixtures must not be created through mutating Git commands until that test work is authorized.

UI/manual validation: both menu surfaces, disabled explanations, keyboard/focus, light/dark/high-contrast themes, dialog survival across row unmount/refresh, hidden-result behavior, long hooks, and expanded lists with thousands of paths. Confirm no per-row Git calls or additional graph topology computation.

Implementation checks: focused Vitest tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; broaden tests when shared parser/executor/router changes warrant it. Specs alone do not require application build/test execution.

## 15. Implementation order and completion gates

Use all recorded answers and delegated decisions, including the later native-Git supersession rules. Section 23 is the authoritative dependency order for the combined feature: prove the native command/planner foundation, implement creation and shared ownership, implement dual-view planning, then runtime execution/recovery and cross-cutting checks. Do not ship creation UI that claims an integrated completion workflow while the rebase path is unfinished.

During implementation, update `docs/architecture.md` for every added/renamed/repurposed file and refresh its reconciled date. Update repository agent instructions for new subsystem objects, RPC conventions, persistent operation ownership and the shared mutation invariant. Preserve whichever hard-link/separate-file layout the checkout actually uses rather than assuming it.

This spec file is excluded from the architecture map under repository rules. Writing it requires no architecture-map update. No package version, changelog release heading or What's New entry is chosen by this document.

Creation and interactive-autosquash specification decisions are complete. Sections 18–23 define the combined implementation and its required native/platform validation. Multi-tab implementation, release assignment, and changes to unrelated existing feature semantics remain outside scope.

## 16. Reference evidence

- [Git commit documentation](https://git-scm.com/docs/git-commit): correction modes, staged/`-a` behavior, squash message flags and cleanup.
- [Git commit implementation](https://github.com/git/git/blob/master/builtin/commit.c): incompatible amend-fixup message flags; editor construction and empty-commit handling require version-specific validation.
- [Git rebase documentation](https://git-scm.com/docs/git-rebase): subject/hash autosquash matching, replacement fixups and root-inclusive ranges.
- [Git status documentation](https://git-scm.com/docs/git-status): explicit untracked enumeration, porcelain and submodule policies.
- [Git add documentation](https://git-scm.com/docs/git-add): literal/NUL pathspec input and staging behavior.
- Installed Git release notes `/usr/share/doc/git/RelNotes/2.32.0.txt`: introduction of amend/reword fixup modes.

References were inspected during the preceding evaluation. Runtime Git/autosquash experiments have not been performed in this drafting session; do not describe the proposed commands as integration-tested.

- [Git upstream rebase-merges tests](https://github.com/git/git/blob/master/t/t3430-rebase-merges.sh): the `post-rewrite hook and fixups work for merges` case creates a fixup targeting a merge and rebases with `--autosquash -r`. Source inspected during clarification; no local history mutation was performed.


## 17. Coverage and implementation handoff

Twenty-seven explicit answers and the final delegated decisions govern both documents. The first eleven creation answers retain their recorded supersession rules. No product clarification is outstanding. The duplicate Close for now and persistence answers received during finalization reconfirm their existing records; they are not counted twice.

| Area | Status |
| --- | --- |
| Functional scope and native behavior | Resolved: three correction modes, editable autosquash and full native todo, including merges/root. |
| Data model and lifecycle | Defined: correlated plans, worktree operation ownership, editor requests and local recovery records. |
| Interaction and recovery | Resolved: defaults, rebuild decisions, stale copy-only dialog, banner continuation and runtime messages. |
| Performance and reliability | Defined: on-demand native planning, sparse scratch index, asynchronous bounded presentation and non-replayed recovery. |
| Privacy and telemetry | Defined: closed action catalogs, no Git/user content, local-only recovery. |
| Git/platform integration | Design selected; implementation must pass native parity, isolation, shell/path and restart tests. No runtime experiments performed here. |
| Constraints and terminology | Resolved: native Git behavior; no fourth creation mode, automatic rewrite/push or multi-tab implementation. |
| Completion criteria | Ordered milestones and acceptance matrix in sections 15 and 23; final status depends on their actual results. |

Implementation may adjust internal file names/types when existing abstractions fit better, but not the confirmed behavior. Do not use that flexibility to add confirmations, background retries, branch/ancestry restrictions or queued repository opens.


## 18. Integrated autosquash — product and behavior contracts

The maintainer now requires the complete correction-creation → interactive-autosquash workflow inside Speedy Git. This supersedes all earlier descriptions of autosquash integration as a separate follow-up. The existing creation choices remain valid. The rebase extension is a separately user-confirmed history rewrite, not an automatic consequence of creating a correction.

### 18.1 Current implementation findings

| Location | Current behavior / required consequence |
| --- | --- |
| `InteractiveRebaseRow.tsx` | `ACTIONS` already includes `pick`, `squash`, `fixup`, `drop`, `reword`. Manual Fixup currently exists. Hiding it for ordinary rows is a product change, not simply displaying a previously unsupported action. |
| `useCommitMenuItems.tsx` / `commitMenuAvailability.ts` | Interactive rebase currently sits under `canRebase`, which requires an attached branch and excludes its HEAD. Split interactive availability from ordinary rebase-onto availability so HEAD/root/detached entry points can open the enhanced dialog. Keep ordinary rebase-onto behavior outside this scope. |
| `InteractiveRebaseDialog.tsx` | Step 1 edits actions/order, step 2 edits combined squash messages, step 3 confirms. Local state starts with the supplied entries and has no autosquash matching or reordering. |
| `GitRebaseService.getRebaseCommits` | Reads `baseHash..HEAD` with `--ancestry-path`, so the clicked base is excluded. This is not a general native rebase todo generator; it may also omit relevant side-branch commits. |
| `GitRebaseService.interactiveRebase` | Runs `git rebase -i <base>` and a sequence editor overwrites Git's todo with the supplied entries. Adding `--autosquash` alone is insufficient: the overwrite discards Git's planned actions/order. |
| `RebaseAction` / todo serialization | Only plain `fixup` exists; replacement-message correction needs `fixup -C`. A type-safe flag/action representation and correct serializer are required. |
| `buildSquashMessages` | Combines full pick/reword/squash messages; all fixups currently contribute nothing. It cannot model replacement-message fixups or mixed squash/replacement ordering correctly. |
| `writeTempScripts` | Queues all reword messages first and all squash-group messages afterwards. This is not actual editor invocation order for interleaved groups and will need an execution-ordered design. |
| `activeTmpDir` / rebase state | Rebase editor resources live on a repo-bound service and state paths assume `.git` is a directory. Repo navigation/service replacement and linked worktrees need durable per-worktree continuation ownership. |
| Existing RPCs | `getRebaseCommits`/`rebaseCommits` lack request/repository/plan correlation. A stale reply must not populate a newer rebase dialog. |

### 18.2 Marker behavior and row presentation

The automatic action belongs to the **correction commit**, not the original target:

| Correction subject | Git todo action | Readable label | Message effect |
| --- | --- | --- | --- |
| `fixup! <target-hash>` (also native subject markers) | `fixup <correction-hash>` | Fixup | Keep target/group message. |
| `squash! <target-hash>` (also native subject markers) | `squash <correction-hash>` | Squash | Include correction message in the editable combined message. |
| `amend! <specifier>` | `fixup -C <correction-hash>` | Fixup — replace message | Use the replacement message with native Git ordering semantics. |

The target is normally `pick` (or a `merge` instruction in a merge-preserving plan). The correction must appear immediately after its matched target/group, not stay at the end of the list. Show the matched target hash/subject near each automatic action so the pairing is understandable.

Example, oldest-first plan order:

```text
pick   A  Add feature
fixup  C  fixup! <full-hash-of-A>
pick   B  Unrelated change
```

Here C was created after B, but moves after A. A remains Pick; C receives Fixup. Setting A to Fixup would fold A into an earlier commit and perform the wrong operation.

**Confirmed dropdown policy:** preselect Git’s automatic action and leave the correction dropdown editable. Preserve the existing manual Fixup option. Users can immediately choose Pick, Reword, Drop or another supported action; no Unlock step or autosquash-dependent action lock. Preserve explicit overrides through renders, review steps and execution. Show the matched target and automatic/manual origin; validate the edited plan without silently resetting user choices.

### 18.2a Hash markers and cancelling correction intent

New fixup/squash marker titles use `fixup! <full-target-hash>` / `squash! <full-target-hash>`, with no target subject appended to the first line. Full IDs avoid abbreviation collisions; the UI may display a short hash plus the separately resolved target subject. Autosquash still reads **commit-message text**: a hash is the specifier inside that message, not an out-of-band relationship. Git supports hash specifiers, but its creation flags do not produce this representation by default. The message-input path must deliberately construct/edit the title in the original commit operation, preserve mode behavior/hooks/signing, and be tested against CLI autosquash.

Tradeoff: target hashes change when a target is independently amended/rebased. If the marker still names the old object and that object is not in the selected todo, it may not match; do not silently fall back to a guessed new target. Within one normal autosquash operation, Git matches original todo hashes before replay rewrites them, so that operation itself is not the stale-hash problem. External subject markers remain supported. Git considers exact subject matches before commit-name lookup; do not promise a custom hash-first matching policy that differs from Git for a pathological subject equal to a hash.

Cancelling a correction has three distinct meanings:

- **Pick** instead of Fixup/Squash: keep the correction as its own commit in this rebase. Its marker message is unchanged, so a future autosquash may recognize it again.
- **Reword** instead of Fixup/Squash, then remove the marker and supply an ordinary message: keep the correction as a separate commit and remove its future autosquash intent once the rebase actually runs. Merely typing a new message into the dialog does not mutate history or automatically change an already generated todo action; the action must be Reword too.
- **Drop**: omit the correction’s changes from the rewritten history. This differs from keeping the changes as a normal commit.

Changing an action leaves its current row position intact. Dragging moves only the selected row under the confirmed policy below. Repeated automatic recomputation must never replace a user’s Reword/Pick override with Fixup because the stored original message still has a marker.

Acceptance cases: an automatically selected Fixup can become Reword with an ordinary message; a Squash can become Pick; either can become Drop. After navigating to review and back, the chosen action/message remains intact. Execution serializes the reviewed override rather than the initially detected action. Invalid grouping yields an actionable validation error rather than an automatic action reset.

### 18.3 Plan model

Keep user-selected rebase options separate from derived rows. The backend must provide one correlated authoritative plan identified by `planId`, originating panel/repository, base/range choice, observed HEAD and selected rebase options. A correction session is not itself a rebase plan, and no history is rewritten while merely opening the dialog.

Extend shared types with structured information, not display strings used as commands:

- Range choice capable of ordinary upstream and `--root`; do not use a fake hash sentinel for root.
- Autosquash choice initialized on each fresh opening from the originating repository’s effective Git `rebase.autoSquash` boolean; default false only when unset. Resolve through Git’s configuration handling, including applicable configuration scopes/includes, rather than parsing configuration files manually. Treat malformed values/read failures as actionable configuration errors rather than silently treating them as unset. The checkbox overrides this plan only: do not write Git configuration or persist the last checkbox choice as the next opening’s default. Retain the chosen value during this dialog session; background configuration changes must not silently regenerate its edited plan.
- Carry the resolved autosquash boolean in the correlated plan request/options and keep the reviewed plan authoritative at execution. A later config read or second autosquash pass must not overwrite manual todo edits. An explicit checkbox change follows the confirmed rebuild contract below; ordinary renders/configuration refreshes never trigger it.
- Preserve merges initializes from the originating repository’s effective `rebase.rebaseMerges` configuration on each fresh opening; unset/false means off. Resolve via Git configuration handling, honoring applicable scopes/includes, and surface invalid values rather than silently substituting defaults. Keep the enabled state and configured cousin mode as separate typed plan options so an explicit `rebase-cousins` or `no-rebase-cousins` value is not reduced to a boolean and lost. Enabling without a configured mode uses Git’s default `no-rebase-cousins`; show an advanced selector with Preserve original branch points (`no-rebase-cousins`) and Rebase cousin branches (`rebase-cousins`). Preserve the current choice while the checkbox is off; changing it while enabled uses the existing option-rebuild contract. Show both the explanation and literal native mode in the advanced control.
- Preserve merges is a per-rebase override only; do not write Git configuration, persist last-used overrides or change it after marker detection. Use the same plan-option rebuild/discard contract as Autosquash/range changes. Explicit false must countermand configured preservation at execution; explicit true must retain the selected effective mode. Preview and execution use the same resolved options, rather than re-reading changed configuration and silently changing topology.
- Per correction: detected marker kind, matched target if any, automatic/manual action origin, and the explicit action override, if any; no autosquash-derived action lock.
- `fixup` message behavior represented as a fixed enum or flag, serializing to plain `fixup`, `fixup -C`, or any explicitly supported manual variation. Do not encode whitespace-containing commands as unchecked arbitrary action strings.
- A plan model capable of `label`, `reset`, `merge` and relevant generated control instructions when preserving merges. The existing flat `RebaseEntry[]` of pick-like commits cannot faithfully represent that topology.
- A stable group identity for retained message edits when moving through Configure/Message/Confirm steps. A full JSON string of every entry is not a reliable definition of whether a particular group's edited message should be discarded.

**Confirmed Autosquash toggle contract:** derive whether manual edits exist by comparing the current semantic plan to its generated baseline: actions, order, reword text and combined/replacement message edits. A change followed by an exact undo is clean; focus, selection and navigation between review steps are not edits. Keep one active draft, not separate On/Off drafts.

- With no manual edits, request a fresh plan for the requested Autosquash value without a discard prompt.
- With manual edits, explain that changing Autosquash rebuilds the plan and discards edited actions, ordering and messages. Continue only on explicit confirmation. Cancelling leaves the checkbox, rows, messages and review state unchanged.
- Keep the current draft until replacement planning succeeds. On success, atomically adopt the new checkbox value, correlated plan and generated baseline; reset message-review caches and return to Configure. On failure, preserve the old mode/draft and show the planning error. Do not lose edits merely because regeneration failed.
- Serialize toggle/regeneration requests and reject stale replies by plan/request identity. Disable Start while replacement planning is unresolved. Do not reapply autosquash to manual overrides unless the user explicitly requests and accepts this rebuild.

Validate commands, hashes, control labels, plan ownership and supported options on the backend before execution. Never accept free-form shell commands from a marker subject. Git markers are commit data, not executable instructions.

### 18.4 Range, matching and ordering

Interactive entry-point implementation: give Start Interactive Rebase from Here its own availability decision instead of inheriting `canRebase`. Allow real selected commits at HEAD, root and in detached HEAD; reject only synthetic/nonexistent targets and active-operation states in which native Start cannot run. Native preparation decides candidate/range errors without graph ancestry filtering. Use Edit remaining todo for an existing paused rebase. This change applies to both row and badge entry points and does not broaden the separate ordinary rebase-onto action.

**Confirmed range UI:** keep Start Interactive Rebase from Here and add an **Include selected commit** checkbox, initially off on every fresh opening. The selected commit remains a stable original full object ID in the plan request. Checkbox state is dialog-local and independent of Autosquash; do not automatically check either option because a correction marker exists.

- Unchecked: use the selected commit as the excluded upstream/base, preserving the existing entry-point meaning.
- Checked for an ordinary non-root commit: use its parent as upstream so the selected commit is eligible for replay. Show both the selected commit and effective base in the range summary; do not describe the base itself as replayed.
- Checked for a true root: use a structured root-range option serialized to `--root`, with no fabricated parent/base hash. A shallow boundary with unavailable parents is not proof of a true root; report missing history instead of silently choosing root mode.
- Checked for a merge: show a parent selector, defaulting to the first parent on a fresh opening. List all parents in the commit object’s parent order, each with its ordinal, displayed hash and subject; do not sort by subject/hash or infer first parent from graph layout. Use the chosen parent’s full object ID as the effective upstream. The selector is shown when Include selected commit is checked for a merge, independently of Preserve merges; selecting a parent does not enable preservation. Preserve merges follows effective Git configuration with an explicit user override. Do not claim the merge is included in a linear plan that omits it. When a correction’s intended merge target is demonstrably omitted because preservation is off, explain that reason and point to Preserve merges; do not enable it automatically. Keep the correction’s native unmatched action, and do not invent a different matching rule for ambiguous markers.
- A correction’s target must actually occur in the generated todo to be matched. Show unmatched corrections as normal Pick under native behavior; never silently expand the range to find their targets. Do not change the meaning of the separate ordinary Rebase Current Branch onto This Commit action.

Parent-selection implementation contract: keep the selected merge ID, parent index and resolved parent ID in the correlated range model; backend verifies that the selected parent actually belongs to that merge and is available. Missing parent history must produce an actionable planning error, not an automatic fetch, alternate parent or root fallback. Support merges with more than two parents. Parent changes use the same option rebuild/discard transition; cancellation/failure retains the old selection and draft. The parent choice changes the upstream range, not the order or identity of the merge’s parents. Preserve the choice while inclusion is temporarily off in the same dialog, but it has no effect until inclusion is enabled again; fresh openings reset it to first parent.

Implementation choice: range changes use the same rebuild/discard contract as Autosquash changes because they replace the same edited plan. Cancelled confirmation or failed planning retains the old range, checkbox and complete draft. Reuse one plan-options transition rather than duplicating edit-loss logic. Root entry-point availability must allow opening a dialog that can select Include selected commit, even when the initial exclusive range has no rows; keep Start unavailable until there is a valid executable plan.


Matching must follow native autosquash semantics for full/abbreviated hashes, exact subjects, prefix matching and nested markers. The requested hash marker persists its target specifier in the correction commit’s message; there is no separate Git fixup-target metadata field. Native `git commit --fixup=<hash>` still generates a subject-based marker by default, so recognize commits made in terminals/other tools too. Duplicate subjects use Git's behavior; show the resolved target instead of choosing an invented 'nearest' or 'unique only' rule. An unmatched marker remains a normal pick under native behavior; do not fabricate a target or set an invalid first-row Fixup.

Initial autosquash planning must retain the order of multiple corrections as Git would and handle chains/mixed fixup/squash/amend markers.

**Confirmed drag policy:** move only the dragged row, whether it is a target or a correction. Do not carry adjacent corrections along, snap a correction back to its marker target, or regenerate automatic ordering after a manual move. Treat the new order as a manual plan edit under the rebuild/discard contract.

- Derive each active Fixup/Squash row’s effective fold destination from the current todo order/actions, not its original message marker. Display that destination after every move or action change. Keep the originally matched target as detection metadata, distinct from the effective destination; if they differ, the UI must not claim the original pairing still applies.
- Preserve action overrides and entered messages. Recompute grouping and validation synchronously from the edited plan; do not issue Git planning requests per drag. Keep group-message draft retention separate from row-message retention when group membership changes; section 20 defines message review when group membership changes.
- A legal manual change of destination is allowed even when it differs from the marker. An invalid todo, such as a leading fixup with no preceding commit to fold into, displays an actionable validation error and prevents execution until corrected; never silently change the action or order to repair it.
- For example, `Pick X, Pick A, Fixup C, Pick B` becomes `Pick X, Fixup C, Pick B, Pick A` when A alone moves to the end. C now folds into X, and its displayed effective destination must change from A to X. With no X, the analogous move leaves a leading Fixup and must fail validation.

**Confirmed target-drop behavior:** changing a target to Drop changes only that row; keep every correction’s action, order and entered message intact. Do not cascade Drop, convert corrections to Pick, skip them or restore the original target. Recompute effective fold destinations and validation using the same derivation as dragging/action changes. For example, in `pick X; drop A; fixup C`, C originally may have named A in its marker, but the executable `fixup C` instruction applies C and folds it into the preceding retained commit X. It does not look up A again or become a no-op because A is dropped. C may conflict because A’s changes were omitted. With no preceding eligible commit, the fixup is invalid rather than silently skipped. Marker matching happens during autosquash planning; the edited todo controls execution. See [Git interactive rebase documentation](https://git-scm.com/docs/git-rebase#_interactive_mode).

The maintainer selected commit rows plus an editable Git todo view for topology editing. Full native todo command support is confirmed; sections 20–21 define pause/continuation and editor recovery. The individual-row drag rule does not authorize inventing or omitting topology instructions to make an invalid merge plan executable.

Do not infer rebase candidates from the visible/filtered graph or `--ancestry-path` alone. Git can omit patch-equivalent commits or apply configured rebase options. Preview and execution must agree on the actual todo and range.

**Confirmed dual-view editing:** Configure provides Commit rows and Git todo views over one plan, not independent drafts. Keep ordinary action dropdowns, reword fields and individual-row dragging. Display topology instructions in sequence in the row view so it never presents a flattened history that differs from execution; use readable summaries of `label`, `reset` and `merge`, with Git todo editing for topology operands. A merge instruction must not masquerade as an ordinary Pick row.

Implementation contracts:

- Represent todo instructions as an ordered, typed syntax model with stable instruction identity; commit hash alone cannot identify a line when the same commit appears more than once. Preserve comments, blank lines, operands and instructions not editable through ordinary dropdowns. Use a parser for Git todo grammar, not whitespace splitting of the whole line: messages and command tails may contain spaces. Support native commands/aliases/options available in the installed Git rather than a feature-specific subset.
- Row changes update only their corresponding instructions. Moving a commit row moves that instruction alone while other instructions retain their relative order. Recompute topology-aware validation and effective fold destinations; do not use a flat previous-row scan across `reset`/`merge` boundaries. Never invent topology repairs or silently remove text-only instructions.
- Text edits update the shared plan when syntactically valid. Preserve incomplete/invalid text verbatim as the active draft, show line diagnostics, and prevent review/execution or editing a stale row projection until repaired. Do not silently run the last valid plan while newer invalid text is visible. Cancel/close and explicitly confirmed rebuild remain possible.
- Switching views alone never regenerates autosquash, discards manual edits, or prompts. Preserve row-entered full reword/group messages as separate message drafts associated with stable instructions/groups; todo-line descriptive subjects are not replacement commit messages. Changed group membership follows the preserve-and-review contract in section 20.
- Treat any unpreserved text edit, including custom comments, as work requiring the established discard confirmation before option-driven rebuilding; exact undo to the original draft is clean. This extends the semantic dirty check so comments cannot be silently lost.
- Backend validates the submitted todo and its correlated plan/repository independently. Serialize the reviewed shared plan for execution; never replace text edits with a newly generated row-only todo. Provide no free-form shell execution through marker parsing. Explicitly user-entered native `exec` instructions are supported and remain visible in the reviewed todo; Git executes them only after the user starts or continues the rebase.

**Confirmed full native todo support:** include installed-Git support for pick/reword/edit/squash/fixup/drop, fixup message flags, exec, break, label/reset/merge and update-ref, including native abbreviations and applicable operands. Version-dependent availability follows native scratch validation with the installed Git; the parser and row projection must not silently remove commands merely because a dropdown cannot represent them. Surface genuinely unsupported/invalid syntax with line diagnostics. Section 19 defines native validation for commands the local parser cannot interpret. Keep such valid instructions opaque in the row view; never reject a native-valid todo just because a row control is unavailable.

- Preserve an explicit exec command tail as text for Git’s todo interpreter; never evaluate it during parsing, preview, validation, row rendering or speculative planning. Never interpolate it into the extension’s own shell invocation. Marker subjects and displayed commit descriptions never become exec instructions. Confirmation shows executable instructions as part of the reviewed plan, and telemetry never includes their text or output.
- `edit` and `break` create native paused states, not success/failure completion. Retain plan/editor resources across pauses; native exec failures, conflict stops and user-requested pauses need distinguishable state and continuation handling. Respect applicable native rescheduling behavior instead of silently retrying commands.
- `update-ref` retains native ref-update semantics; no new rule limits execution to only the current branch. Display affected refs locally in the reviewed todo; never transmit their names in telemetry. Validate with Git’s native ref rules and supported syntax, not a feature-specific ref allowlist.
- Arbitrary exec commands and manual edits while paused can change HEAD, history or files. The preview must not promise exact future content or fold destinations across such instructions. Mark affected predictions as runtime-dependent instead of guessing or running commands to discover the answer. A subsequent known reset may restore a statically identifiable destination. Static validation should reject proven invalidity without treating an unknown runtime outcome as a product prohibition.
- Make advanced instructions visible in the row sequence as text-editable summaries; preserve them through ordinary row operations. Continue to keep full reword/group message drafts separate from todo descriptive text.

### 18.5 Backend plan generation and execution

The implementation must choose a verifiable way to obtain a Git-equivalent preview and then execute the reviewed plan. There is no supported `git rebase --dry-run` interface to assume. Starting and aborting a rebase in the user's working tree merely to populate a dialog is not acceptable preview behavior: it can touch hooks, state, refs or autostash.

Use installed Git to generate the native todo in an isolated scratch repository, and capture it before replay. Validate edits with native `--edit-todo` in a scratch-only copy of captured native state. Section 19 specifies the algorithm, environment fidelity, cancellation and fail-closed behavior. Do not ship a custom approximation based on visible graph rows or use a real-worktree start/abort preview.

At execution, the sequence editor must preserve the plan that was reviewed, including merge/control entries and selected automatic/manual actions. It must not overwrite a Git-generated autosquash plan with the old all-pick list, or autosquash a manually edited plan a second time. Use the confirmed latched stale-plan handling below if branch/HEAD changes after preview; the creation decision to follow current HEAD does not automatically decide how a reviewed history-rewrite plan changes.

**Confirmed stale-plan behavior:** when the current branch identity or HEAD differs from the preview, show an inline error, reject Start and keep the dialog/draft available until the user explicitly cancels. Do not offer in-dialog rebuilding or automatically regenerate the plan.

Implementation contract:

- Before starting any rebase mutation, under the repository operation lease, compare the originating worktree’s current HEAD object ID and attached branch identity (or detached state) with the preview. Switching branches at the same hash still changes the rewrite destination. Detecting drift is separate from inspecting file contents; the correction-creation current-HEAD/no-content-confirmation policy remains unchanged.
- Latch the dialog into an invalidated state. Show: `The current branch or HEAD changed after this rebase plan was prepared. Copy any text you want to keep, then cancel and reopen Interactive Rebase.` Disable Start and plan-changing controls. Do not automatically re-enable execution if HEAD later returns to its previous value.
- Preserve the complete todo draft, including invalid text, full reword messages, group-message edits, order and option selections. Keep view switching, read-only review navigation, scrolling, text selection and copy available, including drafts outside the current step. Use selectable read-only fields rather than disabled text fields that prevent copying. Keep the dialog open; Escape/backdrop must not discard it in this state. Cancel is the explicit close action.
- No automatic retry, rebuild, navigation, draft transfer or execution. Closing and reopening prepares a fresh plan. This deliberately trades recovery convenience for a smaller lifecycle and preserves the user’s chance to back up edits.
- Tests cover attached/detached changes, same-hash branch switching, preserved text across review steps, copy accessibility, latched invalidation, explicit cancellation and fresh reopening. An external Git process can still race after a preflight check; execution must also validate its native sequence-editor context before accepting the old todo. Do not claim the extension’s operation lease locks out external Git.

Normal rebase errors/conflicts, autostash/configuration, hooks, signing and merge behavior follow Git. No automatic push follows. The confirmed rebase lifecycle below closes the dialog after backend acceptance; do not apply the creation-only Stop waiting dialog flow.

**Confirmed start and main-view lifecycle:** retain the dialog/draft while a correlated Start request awaits acceptance, preventing duplicate submission. Acceptance means the backend has validated ownership/options and stale-plan preconditions, acquired execution ownership and retained the reviewed plan/resources. Post a dedicated acceptance response before starting the owned execution; it is not a success/completion notification. Close only the originating matching dialog. A rejected Start leaves its draft open; stale rejection uses the latched copy-only behavior, while other errors retain the appropriate editable draft.

- Running rebase belongs to the originating worktree and survives dialog closure/repository navigation. Render its status through an expanded main-view rebase banner, not a modal. Keep duplicate/conflicting operations guarded; no rebase Stop waiting button or process cancellation on UI dismissal. Bound status updates to avoid per-output-line rendering.
- Replace the existing banner’s unconditional `Rebase paused due to conflict` with states for running, conflicted, intentional edit/break pause, failed exec, message input needed, other/unknown pause, completed, aborted and failed-before-start. Also distinguish quit, a finished rebase with autostash-application conflicts, and interrupted/uncertain execution. An unexpected process interruption is not proof of completion or failure-before-start. Use native worktree rebase state and executor outcome to determine transitions; exit code zero from an edit/break stop or Continue does not alone mean completed.
- Extend shared status/RPC types and the current history handlers, which currently set idle on successful Continue. Keep Continue/Abort unavailable while an execution is still running, except the explicitly coordinated pending-editor abort in section 20; re-check native state before a paused-state action. Native continuation controls are defined in section 20; restart recovery follows the confirmed persistence contract below.
- On an accepted execution failing before a rebase state is established, notify with the Git error and retain its submitted plan/message drafts for recovery design; never reopen or retry automatically. If Git is paused, retain all continuation resources and show its actual reason. On actual completion, refresh graph/status and notify once. Results cannot change another repository’s banner or close another dialog.
- Opening another tab/repository cannot transfer operation ownership. When viewing the original worktree again, obtain its current operation state. The future multi-tab model shares operation state per worktree while keeping view state panel-local.

### 18.6 Messages, conflicts and continuation

Keep the current message-review step, but expand its model to distinguish a combined squash message from a replacement fixup message. Ordinary fixup ignores its own message. `amend!` supplies the replacement body using native `fixup -C`; copying its complete marker commit message into the final target would leave the marker behind incorrectly. Multiple replacement fixups and later squash contributions must follow Git's sequence semantics, not a simple concatenation.

Generate editor inputs in actual plan/editor invocation order. Test interleaved reword and squash groups, mixed plain/replacement fixups, hook edits, conflict stops before message editing and repeated Continue. An unmatched message-editor invocation must not silently consume an unrelated next message or use a no-op editor and declare success.

**Confirmed runtime message editor:** handle Git editor requests through an extension-owned bridge and an in-app message dialog, not the executor’s no-op editor or an external text editor. Initialize from the actual message buffer supplied by the native editor invocation, including its complete body/trailers and any Git-generated guidance. Never synthesize a subject-only replacement or acknowledge the editor merely because the dialog opened.

- Give each editor invocation a unique request ID tied to the worktree/rebase execution, separate from instruction identity and message-draft identity. Repeated calls, conflicts and retries cannot be matched by a blind global counter. Backend owns the trusted editor-file reference; frontend submits text and request identity, never an arbitrary filesystem path.
- Provide one explicit **Submit message** action. Validate request ownership/liveness, write the submitted full text to the correct Git editor file, then acknowledge that editor invocation. Keep the editor’s exit status pending until submission is accepted. Native cleanup, hook validation, empty-message rules and subsequent errors remain Git’s; do not silently bypass them. A write failure preserves the draft and keeps the request unresolved.
- Git waiting for input is a distinct running-operation state, not an idle lease release or completed rebase. Prevent a duplicate Continue from starting a competing Git process. No automatic input timeout is permitted: the editor bridge and owning rebase invocation must not inherit the executor’s default 30-second kill timer while awaiting user input. Use an explicit operation-specific timeout policy without changing ordinary read-command timeouts; arbitrary native exec/hook execution likewise must not be mistaken for an input timeout.
- Preserve pre-reviewed full messages when they can be reliably matched to the actual invocation and remain applicable; otherwise surface Git’s actual proposed message for review. Do not overwrite a new conflict-resolution message or a hook-modified proposal with an old cached message merely because a counter advanced. Distinguish new/repeated message requests from ordinary fixup operations that require no editor.
- Apply the existing modal/navigation guard when presenting the dialog. If another modal, another repository or a disposed panel prevents presentation, retain the request and expose pending input through the operation’s notification/status; do not switch repositories, close another dialog or auto-submit. Keep drafts out of telemetry, including submitted text and native message contents.
- **Confirmed Close for now:** dismiss only the runtime message dialog. Retain its full edited draft, request identity and pending native editor invocation in backend-owned operation state; keep the mutation lease. Do not acknowledge the editor, signal Git, release the execution as idle or impose a user-input timeout. Escape/backdrop dismissal, if enabled for this dialog, must take this same non-submitting path.
- Show **Edit message** in the original worktree’s banner while input is pending. Reopening restores the latest edited draft, not the original proposal. The UI must synchronize unsent edits with operation-owned memory so view unmount/navigation cannot lose them; do not send per-keystroke telemetry or use configuration/global UI settings for message text. Submission synchronously sends the complete latest draft regardless of debounced draft synchronization.
- Reopening is explicit: after Close for now, refreshes/status updates must not reopen the dialog automatically. Reuse one pending editor request and permit at most one active editor presentation per request; stale dialogs cannot submit to a subsequent request. If native execution ends or the editor request is cancelled externally, preserve the draft for copying and reject stale submission instead of recreating an editor process.
- Extension-host restart uses the confirmed reconciliation contract below; explicit interruption of an outstanding native editor requires coordinated process handling. Ordinary dialog/panel closure is not extension shutdown and must leave the live request waiting. An Abort request during a live editor wait needs coordinated editor cancellation and child-process exit before running native abort; do not launch a competing mutation or treat dismissal as Abort.

**Confirmed persistent rebase recovery:** save in-progress rebase message drafts and continuation information locally, surviving extension-host restart and VS Code reload/closure. Restore recovery controls only after reconciling the record with the actual originating worktree. Recovery itself never runs Continue, reruns exec, submits a message, starts a fresh rebase or aborts one.

Implementation contracts:

- Use versioned operation records and editor resources in extension-owned local storage, scoped by canonical worktree identity and operation ID. Do not put full message/todo text into VS Code configuration, synchronized settings, telemetry or general persisted UI state. Keep linked worktrees distinct. Protect stored files with appropriate local permissions and atomic replacement; schema validation and migration must not execute stored command text.
- Persist the accepted reviewed todo/options, initial repository/HEAD identity, operation phase, full message drafts, editor-request association and bridge/resource ownership information needed to reconcile. Durably establish the operation record/resources before accepting Start. Flush draft updates at explicit Close for now and Submit boundaries; debounced background persistence must not claim to preserve keystrokes lost to an abrupt crash before the last successful write. Surface persistence failure while keeping the live draft available.
- On repository opening/recovery, inspect native rebase state using Git git-path queries, actual process/bridge liveness and operation ownership. Do not assume `.git` is a directory or use a PID alone as proof of ownership. A surviving editor wait may reconnect only to its verified original request; a stopped process must use the actual native paused state and an explicit user action. If ownership/state is ambiguous, preserve drafts for copying and explain the uncertainty instead of automatically resuming.
- Distinguish extension-owned rebases from externally started/replaced ones. Never apply an old cached message, todo or continuation command to another rebase merely because it is in the same worktree. An externally changed/finished rebase invalidates old active controls while retaining recoverable drafts until the user can handle them.
- The file-backed persistent bridge in section 21 supports authenticated reconnection to a surviving runner/request and exits with a native editor failure when its owning Git/runner is gone. Do not leave an unreachable child waiting forever. The no-input-timeout rule applies to an available user input path, not to pretending an orphaned editor can still be served. Implement the platform runner contract in section 21 and test abrupt shutdown before declaring recovery implemented.
- Preserve resources while a native rebase is paused. Remove execution resources after verified completion/abort/quit and no live editor consumer remains; do not erase unresolved or ambiguous recovery records through generic temp cleanup. Stale records with copyable drafts need explicit dismissal before deletion. Never promise cross-restart exactly-once execution: determine and display available evidence without replaying an uncertain action.
- Persistence applies to accepted/in-progress rebases and their message drafts. The earlier correction-creation session-only retention remains unchanged; this does not add persistence for every unopened/unsubmitted dialog draft.


### 18.7 UI, telemetry, performance and tests

- Configure: initialize Autosquash from effective Git configuration, allow a per-rebase override, explain autosquash, show reordered rows and target associations, preselect editable automatic actions, retain manual Fixup and preserve explicit action/message overrides.
- Message review: retain full bodies/trailers, expose the message effect of replacement corrections, and preserve edits on Back/Next when their group membership remains compatible.
- Confirm: show effective range, root/merge options and resulting action summary. Starting the rebase is an explicit user action separate from correction creation.
- Keep the ordinary Rebase Current Branch onto This Commit action unchanged unless explicitly selected as an entry-point change during clarification.
- Reuse shared dialog/theme primitives and the panel-local modal guard. Keep rebase plans above virtualized graph rows so scrolling cannot discard them.
- Extend existing `interactiveRebase` operation telemetry and fixed UI catalogs for autosquash/merge-preservation selections as needed. Never send markers, messages, hashes, ranges or target identifiers.
- Do all planning only on opening/changing the rebase options, not graph rendering/loading. No full-history fetch into graphStore merely to build a plan. Large plans need bounded rendering; measure the planner separately from graph topology.
- Add pure planner/serializer/message tests and backend RPC/lifecycle tests, plus native Git integration comparisons for each marker, multiple corrections, duplicates, nested/unmatched markers, missing/out-of-range target, root, merged branches, merge targets, staged/dirty worktrees, conflicts and continuation.
- Existing manually selected Pick/Reword/Squash/Fixup/Drop behavior needs regression coverage, with changes only where the maintainer explicitly chooses them.

Autosquash initialization tests: unset/false starts unchecked, true starts checked, applicable Git configuration precedence is honored, malformed configuration is surfaced, checkbox changes do not write configuration, and fresh reopen re-reads configuration instead of retaining the previous override. Configuration refresh during an open dialog must preserve its edits and selected checkbox value.

Autosquash toggle tests: clean plans rebuild without prompting; action/order/message edits require confirmation; exact undo restores clean status; cancellation preserves all state; successful confirmed rebuild resets overrides and message caches; planning failure preserves the original draft; stale responses cannot replace a newer plan.

Range tests: fresh openings exclude the selected commit; including a non-root uses its parent; including a true root uses `--root`; shallow boundaries do not fabricate roots; range changes retain the old draft on cancellation/failure; Autosquash and inclusion choices remain independent; single-root history can open the dialog and enable inclusion. Merge range tests cover first-parent initialization, selecting each parent including an octopus merge’s later parents, actual object parent ordering, full-ID backend validation, unavailable parent history, checkbox independence and parent-change cancellation/failure preserving the prior draft.

Drag tests: moving a target leaves its corrections in place; moving a correction never carries adjacent rows; effective destinations update after moves/actions; original marker targets never override edited ordering; legal retargeting remains executable; a leading fixup is visibly invalid and cannot execute; row action/message edits survive dragging.

Target-drop tests: `Pick X, Pick A, Fixup C` becomes `Pick X, Drop A, Fixup C`, with X shown as C’s destination. Apply the same rule to Squash and replacement Fixup; preserve messages and order, including multiple corrections. Without a preceding eligible commit, show an invalid-plan error and prevent execution. Restoring A’s action recomputes destinations without changing correction actions. No automatic extra confirmation is required for this dropdown edit; the normal review/start workflow remains.

Merge-preservation option tests: unset/false starts off; true and supported configured cousin modes start on with their semantics retained; effective scope precedence is honored; overrides do not write configuration; disabling counters configured preservation; target detection never changes the checkbox; explain a provably omitted merge target; cancellation/failure of rebuilding preserves the prior mode and draft.

Dual-view tests: row/text round trips preserve actions, ordering, comments, topology operands and separate message drafts; duplicate commit references retain distinct instruction identities; switching views does not rerun autosquash; invalid text is retained and cannot execute a stale valid plan; row changes never delete text-only instructions; topology-aware destinations and diagnostics follow reset/merge instructions.

Full-todo tests: native aliases and supported flags round-trip; exec tails remain intact and never execute during preview; version-incompatible instructions are diagnosed; edit/break retain paused operation state; exec failures do not report completed success; update-ref survives serialization; runtime-dependent destinations are not fabricated or automatically rejected. Integration validation must use only explicitly authorized isolated test fixtures, never execute arbitrary user commands as a preview experiment.

Rebase lifecycle tests: no close before matching acceptance; rejection preserves the draft; duplicate Start is prevented; late acceptance cannot close a newer dialog; running/paused status remains tied to the original worktree; edit/break and successful Continue while still paused never become idle; genuine completion notifies once; accepted failures do not automatically reopen/retry; navigation and panel closure do not cancel execution.

Runtime message tests: full Git proposal is displayed without truncation; submission is correlated to the live invocation; duplicate/stale/wrong-worktree submissions cannot acknowledge another editor; file-write failure preserves the draft; no-op editor cannot silently accept a message; message input does not become operation completion; actual editor requests supersede guessed counter ordering; unavailable presentation retains the request without navigation or auto-submission.

Close-for-now tests: closing does not submit, abort or release the live execution; a wait beyond the normal executor timeout remains pending; Edit message restores the latest draft; repeated refreshes do not reopen it; navigation/panel unmount preserves edits; stale or duplicate presentations cannot submit to another invocation; completed external execution invalidates submission while preserving copyable text.

Restart recovery tests: paused rebase and saved full drafts survive host reload; recovery never executes Git mutations or exec commands automatically; surviving and exited child processes take different verified paths; same-worktree replacement rebases reject stale records; linked worktrees remain distinct; corrupt records/storage failures preserve available user text and do not guess ownership; completed/aborted operations clean up only after live consumers finish.

### 18.8 Readiness

Product clarification is complete under the maintainer’s delegation. The following sections finalize planning, messages, continuation, process ownership, RPCs and verification. They authorize a concrete implementation plan, not a claim of tested application behavior. Native integration and platform milestones must pass before the feature ships.

## 19. Native planning and todo validation

### 19.1 Chosen approach and source boundary

Use an isolated, disposable repository to run the **installed Git's** interactive plan generation. Its sequence editor captures the generated todo and native planning state, then exits unsuccessfully before any todo instruction is replayed. That controlled exit is an expected capture result only when a matching, complete capture record exists. Other errors remain planning failures. Root planning may create a temporary synthetic object; it belongs only to the scratch object database.

Git's current `complete_action` prepares update-ref/autosquash entries and invokes the sequence editor before `checkout_onto` and replay. Native `--edit-todo` parses and writes the remaining list without replaying it. Those boundaries are the basis of this design, not a claim that `git rebase` offers dry-run mode. Test the boundaries on supported Git versions. [Git sequencer source](https://github.com/git/git/blob/master/sequencer.c), [Git rebase entry points](https://github.com/git/git/blob/master/builtin/rebase.c)

Do not run `git worktree add`, clone with shared mutable metadata, make temporary refs, invoke hooks, stash, checkout or reset in the user's repository for preview. All scratch mutations are implementation internals against extension-owned temporary storage. This documentation task has not executed them.

### 19.2 Snapshot and scratch construction

1. Resolve Git executable/version, canonical worktree/git/common-directory identity, object format, current HEAD and full symbolic branch identity. Read native commit metadata, effective relevant configuration and ref/worktree information through Git, using NUL/batch formats. Recheck HEAD/branch after collection; if changed, return the stale-plan state instead of publishing an incoherent plan. Do not inspect staged/worktree contents to compare against a previous approval.
2. Create a private scratch root with a fresh repository, using the same object format, an empty template directory and its own gitdir, common dir, index, refs, logs and worktree. All Git invocations still pass through GitExecutor. No source gitdir is linked as the scratch gitdir/common dir.
3. Borrow source object storage only through read-only object lookup via Git alternates, with all object writes directed into the scratch repository. Include transitive alternate lookup as Git normally resolves it. Preserve applicable shallow boundaries and replacement refs in private metadata. Do not copy the source index, worktree changes, stash state or rebase state into a new-plan scratch repository.
4. Materialize ref names/OIDs into private scratch refs, preserving symbolic HEAD/branch identity. Preserve local/remote refs needed for revision resolution and native decoration/update-ref behavior, with scratch-only writes. Snapshot checked-out branch occupancy from `git worktree list --porcelain -z` and native branch reservations in other worktrees’ rebase/bisect state; represent it with scratch-only worktree metadata that points exclusively to private placeholder worktrees, so native update-refs excludes branches checked out elsewhere. Never reuse a source worktree's live `gitdir` link. Resolve branch/ref comparisons to full IDs after native parsing; do not infer from displayed decorations.
5. Seed a clean index from the HEAD tree using sparse checkout with an exclude-all non-cone pattern (`/*` followed by `!/*`) and the corresponding `read-tree` index update in the scratch repository. The goal is tree/index metadata with skipped worktree entries, not a checkout of repository blobs. Verify with native scratch status that the index matches HEAD and no materialized tracked content is needed. If a supported version cannot construct this state, report the preparation failure; do not silently copy the user's whole working tree. [Git sparse read-tree behavior](https://git-scm.com/docs/git-read-tree#_sparse_checkout)
6. Effective source configuration is resolved in its source context, including conditional includes, before values are transferred. Build a reviewed planning configuration adapter, preserving native rebase options, instruction format/abbreviation, comment syntax, label-length limits, ref-update behavior and applicable revision/diff semantics. Explicit dialog overrides win. Do not copy raw config files/includes, `core.worktree`, repository-format paths, executable helpers, remote URLs or hooks into the scratch repo. In particular, preserve `rebase.updateRefs`, `rebase.missingCommitsCheck`, `rebase.forkPoint`, `rebase.instructionFormat`, `rebase.abbreviateCommands` and `rebase.maxLabelLength`; default values must come from installed Git, not an incomplete second default table.
7. Sandbox Git's environment through a new explicit replacement-environment option in GitExecutor: clear inherited Git repository/index/object/config overrides before setting scratch-owned ones. Disable ambient global/system configuration and templates for scratch calls; set the private hooks directory, disable automatic maintenance, fsmonitor, credential helpers, external diff/textconv/filter programs, signing and rerere. Do not attach source remote configuration; disable lazy fetching and protocol access. Avoid paths/commands in Git debug logs for sensitive configuration snapshots. These sandbox overrides apply only to planning, never real execution.
8. Collect any deterministic metadata needed for planning fidelity (for example relevant reflog/fork-point or attribute inputs) without invoking user programs. If local object/history/config information is unavailable, fail with an explanation; never fetch, execute a helper or substitute a guessed plan. Git may read blobs internally for patch-equivalence decisions; this is on-demand native rebase planning, not a staged-content confirmation check. Sparse setup alone does not prove zero object I/O.

This is O(refs + index entries + Git's selected revision walk), with no full commit history transfer to graphStore and no blob checkout. Object databases may change externally during planning; missing objects invalidate the scratch result rather than authorizing repairs to the source repository. Any optimization must retain source-state isolation and native todo parity.

### 19.3 Capture, comparison and validation

- Invoke native `git rebase --interactive` with the selected upstream or `--root`, explicit resolved autosquash and merge-mode options where supported, and the captured planning configuration. Use a private sequence-editor helper with a request-specific capture destination. No user todo/exec text is executed by this helper.
- The helper captures the raw generated todo, required native rebase metadata and initial plan context before returning a deliberate nonzero result. Save a private validation seed before Git cleans up its scratch state. Check capture identity and completeness, not localized error text or a particular error message. A native empty/no-op plan remains a valid representation; do not reject merely because there are zero ordinary commit rows. Entirely deleting the todo follows Git's native abort/nothing-to-do semantics, distinct from explicit Drop entries.
- Retain the original generated todo as the comparison baseline. Parse recognized instructions into a lossless document with stable line identities; resolve abbreviated commit operands through scratch Git while retaining the user's original spelling for display. Support native command abbreviations, comment characters and CRLF/LF input. Descriptive todo text is not executable or a message edit. Reject NUL input; do not arbitrarily split/truncate commit descriptions or exec command tails.
- For native validation, restore a private copy of the captured native state in a scratch validation session and invoke **`git rebase --edit-todo`**, using a helper that supplies the submitted text and returns success. This validates commands and writes the native todo without replay. Capture normalized validated instructions and diagnostics. Preserve the user’s comments/formatting as the editable document; normalization supplies the execution model rather than destructively rewriting their text on every keystroke. Use the native missing-commit-check policy against the original todo where applicable. Unknown-to-UI instructions accepted by installed Git remain opaque text rows with runtime-dependent effects, not an app prohibition.
- Debounce native validation after text input (initial implementation: 300 ms), cancel obsolete scratch work and correlate every result to document revision. Local syntax checks give immediate feedback; Start requires native validation of exactly the current revision. Never execute the previous valid document when newer text is invalid or awaiting validation. Switching views is local. Row changes update local projections immediately and validate at the review boundary; they do not regenerate autosquash.
- Clean up scratch resources on close/rebuild/cancellation after their owned Git/helper processes have exited. Cache only within an unchanged plan-input snapshot; do not cache native validation across document revisions. Cancelled planning has no source-repository rollback because the source was never mutated. Cleanup removes only a verified private scratch root, never paths supplied by a todo or Git output.
- Read-only planning retains cancellable command timeouts and a user-visible preparation state; long/large histories can time out with a retryable preparation error. No hard cap silently truncates the todo. Render commit/instruction lists virtually and load full message bodies on demand in batches. Large raw text can use a plain text editor backed by an immutable document; do not add a new editor package without maintainer installation.

### 19.4 Real execution and stale inputs

Before acceptance, acquire the common-directory execution lease, recheck current branch/HEAD, native operation state and plan ownership, and verify relevant plan-generation inputs have not changed. A branch/HEAD mismatch enters the confirmed copy-only stale dialog. Other changes that make the reviewed plan inaccurate, such as relevant ref occupancy when update-refs is enabled or a changed planning option, use the same non-rebuilding invalidation mechanism with a precise reason. Preserve live execution-only configuration such as hooks and signing instead of silently disabling it to match scratch settings.

Real Start invokes native rebase in the source worktree with the reviewed options and a controlled sequence editor. The editor first compares the native-generated baseline to the saved baseline after normalizing full OIDs, command aliases and irrelevant comments/abbreviations. Compare topology operands, candidate instructions and generated ref updates, not just a commit count. Only then replace it with the validated reviewed document. Do not run autosquash again after installing manual edits. No user exec instructions are inserted for tracking.

An external Git process can still race after preflight, and Git may run pre-rebase hooks or autostash before the editor. If baseline/original-context validation fails at that point, the editor returns nonzero without replaying the stale document. Report an accepted execution failure, inspect native state and retain the saved draft; do not claim nothing was touched or run an invented rollback. Native hook and autostash effects remain Git's. This is why pre-acceptance stale rejection and post-acceptance interruption are distinct states.

If the installed version cannot demonstrate isolated planning/validation parity, fail with a clear capability/planning error and preserve the dialog. Do not fall back to the old `--ancestry-path` approximation. This is a validation milestone, not a new product choice left for the implementer.

## 20. Message review and native continuation

### 20.1 Pre-start message review

Retain Configure → **Messages** → Confirm, renaming the old Squash Messages step because it also covers replacement/reword messages. Skip the Messages step when there are no applicable items. Each item shows its contributing instructions, effective group target and message behavior; full text is selectable and copyable. No automatic editor invocation is inferred from one fixed list of all rewords followed by all squashes.

Use a pure message-group reducer over the current validated todo. Group identity includes the stable lead instruction, ordered contributing instruction IDs and message-affecting flags; drop/comment instructions do not contribute text. Preserve identity when an unchanged whole sequence is merely relocated. `reset`, merge topology, edit/break and exec boundaries must be considered; runtime-dependent groups are explicitly deferred to Git's actual editor request. For a deterministic group under ordinary cleanup:

| Sequence after the lead | Proposed message effect |
| --- | --- |
| Plain Fixup only | Keep the lead message; no correction text. |
| Squash | Combine the lead and squash messages, excluding their generated marker titles as native editing normally does. |
| Replacement Fixup `-C` without a preceding Squash | Use its replacement message; later such replacements supersede earlier ones. |
| Replacement Fixup then Squash | Retain that replacement and append subsequent squash contributions. |
| Squash then replacement Fixup | Follow Git's mixed-series behavior: `-C` after Squash contributes to the combined message rather than blindly deleting every earlier contribution. |

This is a semantic proposal, not a promise of the final bytes after configured cleanup/hooks or earlier runtime edits. Test mixed sequences against installed Git. Preserve full bodies/trailers and native amend-marker stripping; an ordinary message that happens to contain similar text is not globally sanitized. Do not claim that all `fixup -C` combinations reduce to “last message always wins.” [Git message accumulation](https://github.com/git/git/blob/master/sequencer.c)

An unedited `fixup -C` remains native non-editing replacement. Show its resulting message for review. If the user explicitly chooses **Edit replacement message**, explain that this changes the instruction to `fixup -c`; update both row/text views and retain the new draft for that actual editor invocation. Never claim an unchanged `-C` accepts a separately edited message without an editor. Support `merge -c`/`-C` distinctly in the text view as well.

### 20.2 Changed groups: preserve and review

Confirmed by the maintainer after delegation: changing a group does not immediately discard edited text or interrupt every drag. Keep all affected old drafts in a recoverable collection and regenerate the new semantic proposals. Mark affected groups **Message needs review**. In Messages, show the relevant prior edited draft(s), identified by their former group, alongside the new proposal; the user must explicitly **Keep edited text** or **Use new proposal** for each affected surviving group before Confirm/Start. They may edit either candidate before accepting it.

- Unchanged groups and full per-row reword messages retain edits without another prompt.
- A split does not silently copy one old combined message into every new group; offer the old draft as a selectable candidate for each relevant group. A merge of groups offers each old draft separately, never concatenates manually authored text automatically.
- If every member is dropped or no editable-message group survives, keep orphaned text in a copyable Previous message drafts section until the dialog closes. It cannot block execution solely because there is no destination for that old text. Do not attach it to an unrelated group.
- Exact undo can recover the original group/draft association without another review if the accepted message inputs are identical. A new group edit after review invalidates only its affected decisions.
- A confirmed option-driven rebuild follows the already accepted discard contract and resets all prior manual plan/message drafts. The affected-group review does not override that explicit discard authorization.

### 20.3 Runtime message association

The actual native editor invocation is authoritative. Match it using the operation's canonical todo version, ordered native done/todo cursor, current-fixup state and instruction occurrence identity, not hash alone or a global counter. Do not write tracking exec commands or marker comments into user messages. Version-specific rebase state readers belong in one adapter and degrade to a generic native message request when association is uncertain.

An applicable explicit pre-reviewed edit may fill its intended invocation when the original proposal still matches the reviewed message inputs. After conflicts, externally changed todo, user exec, edit stops, or unrecognized hook-modified content, open the runtime dialog with **Git's current full proposal**; keep earlier drafts available to copy/apply explicitly. It is acceptable to request runtime review when reliable automatic association is unavailable; it is not acceptable to silently consume the next saved message. Unedited native proposals are not overwritten by the UI's speculative concatenation.

### 20.4 Main-view controls and operation states

Use one banner/status model for extension-owned and observed native rebases, with ownership-specific recovery details. Promote primary Continue only when a native paused state is known and no Git/editor process is still running. Git remains the authority on whether that continuation can succeed; a status hint is not permission to stage or mutate implicitly.

| State | Controls and behavior |
| --- | --- |
| Running command/hook/exec | Show status and Show terminal/output. No competing Continue/Skip/Abort/Quit. Users can interrupt through the owned terminal explicitly; after exit, reconcile before enabling another mutation. |
| Waiting for message | Edit message reopens its request. Abort is an explicit coordinated action: cancel that editor invocation, wait for the Git process to exit, re-read native state, then run native abort if a rebase still exists. Failure to stop does not launch a competing abort. |
| Conflict or stopped patch | Continue, Skip current commit, Abort; Show current patch opens the existing read-only diff surface. Resolve/stage through existing SCM controls; no auto-stage or auto-skip. |
| Intentional edit/break | Explain why it stopped; Continue, Abort and applicable advanced controls. Existing commit/amend/staging/terminal actions handle edits. Do not claim an unmodified edit stop is a conflict. |
| Failed exec | Show native command failure locally, Continue and Edit remaining todo. Respect native reschedule-failed-exec: Continue may retry a scheduled command or proceed after a failed unscheduled command. Never silently implement a custom retry. |
| Other/unknown native stop | Show available native state/output, Continue/Abort and advanced controls when no process owns the worktree. Avoid guessing a conflict reason. |
| Finished with autostash conflicts | Explain that rebase replay finished but restoring stashed changes conflicted; expose SCM/diff guidance. No misleading Continue Rebase if native rebase state is gone. |
| Interrupted/uncertain recovery | Preserve drafts and native state details; allow copying and explicit reconciliation. Do not execute an assumed continuation while process ownership is unknown. |
| Completed/aborted/quit | Refresh and notify once, then release active state and eligible resources. Quit means leave current HEAD/index/worktree as Git does; never call it rollback. |

Advanced paused-state controls include **Edit remaining todo**, **Quit rebase** and **Show current patch** where installed Git supports them. Continue/Skip/Abort/Quit map directly to their native flags. Skip/Abort/Quit use the application's existing destructive-action confirmation style, stating the specific effect; no content scans or second approval of staged changes are introduced. Full native todo support does not require a dropdown entry for every command: text-only commands remain available in Git todo.

Edit remaining todo operates through native `git rebase --edit-todo` and the sequence-editor bridge; it opens the same dual-view editor on the **remaining** native document. Disable initial range/autosquash/merge-option rebuilding for this paused edit session. Save changes only on explicit Apply todo; closing cancels the editor without changing the remaining plan. Compare native remaining todo/done/HEAD context before apply; external changes produce a copy-only error. Saving never implicitly continues; update persisted associations and return to the banner. Previously completed instruction/message records remain immutable history.

Keep process leases separate from native paused-operation ownership. Release the active common-directory process lease after a command has actually exited, but retain the rebase recovery record. While paused, permit native resolution actions (stage, edit/amend, explicit commit) through fresh leases instead of blocking all mutations forever. Conflicting new operations continue to use native operation guards. An edit/exec stop may change HEAD intentionally; the pre-start stale-plan rule must not invalidate legitimate continuation after the rebase has begun.

## 21. Process, editor bridge and persistent recovery implementation

### 21.1 Execution modes

Extend GitExecutor with explicit execution policies while preserving defaults for existing callers:

- Ordinary captured reads: existing default timeout, cancellation and bounded returned output.
- Correction add/commit: captured execution with `timeout: null`, owned completion and editor temp files; no timeout on hooks/clean filters. Preserve stdout/stderr for native failure reporting without treating HEAD movement alone as success.
- Real rebase Start/Continue/Skip/Abort/Quit/Edit todo: an owned terminal-backed runner with no automatic wall-clock timeout. This supports native interactive exec programs and hook/signing prompts, which pipe-only stdin cannot reproduce. The in-app banner remains the progress UI; terminal access is an additional Show terminal action, not a replacement message editor.
- Scratch planning/validation: captured, cancellable, finite-timeout execution with a **replacement** environment and strict scratch path ownership. Never inherit a real-operation editor or terminal session.

GitExecutor remains the sole public Git launch boundary. Its bundled terminal runner is an internal implementation of that boundary, not a second domain service that spawns Git independently. Add structured process outcome (`spawnFailed`, exit code, signal/terminal loss, completed vs still-owned) and streaming output/status hooks where needed. Do not resolve a cancelled/terminated mutation as finished until owned child/stdio completion has been reconciled. Keep a bounded output tail for errors; route full user-facing output to the terminal rather than buffering unlimited output from `exec` in memory.

### 21.2 Terminal runner

Package a small dependency-free CommonJS runner and editor helper as additional esbuild outputs, compatible with the extension's existing Node target. Start the runner through `vscode.window.createTerminal` using explicit `shellPath`/`shellArgs` and the extension-host Node-compatible executable, not a concatenated user-shell command. Desktop Electron hosting requires its supported Node mode; remote hosts use their Node executable. Remove launcher-only Node-mode environment overrides from the spawned Git environment unless they were already present in the captured user environment. Check this launch path on desktop, remote and Git for Windows. Do not assume `node` is installed separately on PATH and do not require newer terminal shell-integration APIs than the declared VS Code baseline.

The runner receives only a private operation-record path, reads its locally protected capability and a validated argv/env/cwd job, and spawns the selected Git executable with `stdio: inherit` in the VS Code terminal. Thus user `exec` commands retain a real terminal and execute in Git's shell context. Never interpolate messages, refs or exec tails into the launch command; they belong to native argv/todo/message files. Keep source hooks, signing, cleanup and user environment for actual execution except the explicit app editor overrides. Do not apply scratch isolation overrides to the real runner.

Write atomic runner-start/child-exit records with operation identity and a random run nonce. A PID is supplementary diagnostic evidence, not ownership proof. The extension observes records via filesystem notifications with a coalesced fallback while operations are active. Opening/closing the graph does not stop the terminal. Offer Show terminal without stealing focus on every status update; runtime in-app editor requests retain their own modal rules. Closing the owned terminal is an explicit process interruption and must enter reconciliation, not a fabricated successful completion.

### 21.3 Editor transport

Choose a **private file-backed request/response bridge**, owned by the runner and persisted alongside the operation, so a surviving terminal can reconnect after extension-host reload without retaining a stale socket. Each native editor helper invocation:

1. Reads the operation capability and verifies its live runner association.
2. Records a unique invocation ID, editor kind (message or sequence), proposed buffer and backend-only native file path in an atomic request envelope. Do not allow the webview to nominate that path. Enforce operation/gitdir containment for standard native editor files; nested user exec Git operations use an explicit runtime request with their verified actual invocation context, never guessed original instruction association.
3. Waits for a matching signed response, checking that the runner/relevant child still exists. Poll only while an actual request is pending (initial 250 ms interval); extension-side view updates remain coalesced. There is no timeout merely because the user has not responded or the extension host is reloading while the runner survives.
4. On submitted text, verifies the response/request revision, writes the exact accepted text to Git's supplied file and exits zero only after success. On explicit editor cancellation/abort coordination it exits nonzero. A lost owning runner causes failure, not an unreachable infinite wait or automatic successful submission.
5. Emits a consumption result. Mark requests consumed durably and reject duplicate/stale submissions. A crash between native consumption and acknowledgement requires state reconciliation; do not blindly resend just because an acknowledgement was lost.

Use a per-operation random capability, private filesystem permissions and validated relative record names. Reject symlink/path replacement when reading bridge control files. Serialize mutations of request revisions so rapid typing/Close/Submit cannot reorder saved drafts. `Close for now` flushes the latest full draft before acknowledging dismissal; persistence failure keeps a copyable draft and reports that saving failed. No path or message from a commit is executable helper source.

For explicit Abort while waiting for a message, show the normal abort confirmation, send a cancellation response to that editor request, wait for owned Git exit and re-read native state before invoking `--abort`. If the process continues running or state is uncertain, report it and preserve recovery; do not kill unrelated child processes or delete editor resources underneath them. Runtime native exec programs receive terminal input through their terminal, not a fake commit-message dialog.

### 21.4 Recovery record and cleanup

Use a versioned record under extension-local storage, independent of panel state:

```ts
interface RebaseRecoveryRecord {
  schemaVersion: 1;
  operationId: string;
  worktreeIdentity: string;
  commonDirIdentity: string;
  originalHead: string;
  originalBranchRef: string | null;
  planId: string;
  planRevision: number;
  phase: RebasePhase;
  reviewedTodoFile: string; // controlled relative storage path
  messageDraftsFile: string;
  activeRunId: string | null;
  activeEditorRequestId: string | null;
  terminalOutcome: 'completed' | 'aborted' | 'quit' | 'failed' | 'uncertain' | null;
}
```

Keep capability secrets and native editor paths in backend-only sidecars, never RPC/telemetry. User-visible copies expose messages and Git instructions, not those secrets. Persist new operations before acceptance and phase transitions atomically; read schema before trusting paths. Recovery records contain user text locally by design and must not enter Settings Sync or generic globalState persistence.

On repository opening, reconcile record ownership with its canonical worktree, native rebase identity/context and live runner/request. Restore the correct banner and Edit message access, without opening a modal automatically. If the process exited and Git remains paused, offer native controls only after no live owner remains. If a terminal/helper survived, reconnect to that run rather than launching another Git process. If the rebase was changed/finished externally, retire active controls and preserve unmatched drafts for explicit copy/dismissal. Reject corrupted or future-incompatible records without interpreting their command text; present an actionable recovery error.

After known completion/abort/quit and no live consumers, clean editor/execution resources. Keep only the minimal bounded terminal outcome needed to deduplicate same-session messages. Uncertain/orphaned records are not evicted by a generic size/age policy; expose explicit Dismiss saved recovery after copying. Never delete native Git rebase state as cleanup. A normal VS Code crash can lose the latest unsaved keystrokes or interrupt a command; persistent records provide recovery evidence, not exactly-once execution or a guarantee that every process survives shutdown.

## 22. Shared contracts, ownership and instrumentation

### 22.1 Plan and runtime types

Add focused shared types, re-exported from `shared/types.ts` where existing imports require it:

```ts
type RebaseRange =
  | { kind: 'upstream'; selectedCommit: string; includeSelected: false; upstream: string }
  | { kind: 'upstream'; selectedCommit: string; includeSelected: true;
      parentIndex: number; upstream: string }
  | { kind: 'root'; selectedCommit: string; includeSelected: true };

type RebaseMergeMode = 'off' | 'no-rebase-cousins' | 'rebase-cousins';

type RebasePhase =
  | 'accepted' | 'running' | 'waiting-message' | 'editing-todo'
  | 'paused-conflict' | 'paused-edit' | 'paused-break' | 'paused-exec'
  | 'paused-other' | 'completed' | 'completed-autostash-conflicts'
  | 'aborted' | 'quit' | 'failed' | 'uncertain';

interface RebasePlan {
  planId: string;
  revision: number;
  worktreeIdentity: string;
  originalHead: string;
  originalBranchRef: string | null;
  range: RebaseRange;
  autosquash: boolean;
  mergeMode: RebaseMergeMode;
  todoText: string;
  validatedRevision: number | null;
  instructions: RebaseInstruction[];
  diagnostics: RebaseDiagnostic[];
}
```

`parentIndex` is zero-based in the protocol and displayed as parent 1/2/… in UI. Every upstream choice is verified against the selected immutable object on the backend. Normal upstream selection still excludes that upstream; root mode carries no invented hash.

`RebaseInstruction` is a discriminated union for ordinary commit actions with fixed fixup message flags, exec command tails, break/noop, label/reset, merge flags/parents and update-ref operands, plus opaque native-valid commands and comment/blank lines. Every instruction has its own stable ID and raw span. `RebaseDiagnostic` carries fixed severity/code plus a user-local message and line/column span; only fixed codes are eligible for telemetry. Execution records hold native context and baseline/config fingerprints privately; do not send configuration content to telemetry.

The renderer derives matched marker target, current effective fold destination (`known` / `none` / `runtime-dependent`) and manual/automatic origin. Backend validates native syntax independently; the UI is not an authority for command eligibility. Text spans are preserved across row edits, and message draft IDs never depend only on a commit hash.

### 22.2 Correlated RPCs

Register every request in `shared/messages.ts` and the exhaustive router. Keep lifecycle RPCs distinct from tracked mutations. Use one request-response envelope that echoes request ID, originating panel lifetime and plan/operation identity where available; no generic success resolves an unrelated pending request.

| Request | Principal payload and response |
| --- | --- |
| `prepareInteractiveRebase` | requestId, repoPath, selectedCommit; allocates planId and loads defaults/range/generated todo. Returns a correlated plan or preparation error. |
| `rebuildInteractiveRebase` | requestId, planId, expectedRevision, range/autosquash/mergeMode; client has completed any required discard decision. Atomic plan replacement on success only. |
| `validateRebaseTodo` | requestId, planId, revision, full text; returns native diagnostics/model for that exact revision. Read-only with respect to source. |
| `getRebaseMessageProposals` | requestId, planId, validated revision; returns on-demand full proposals/group identities. No user text in logs/telemetry. |
| `interactiveRebase` | replace existing payload with requestId, planId, validatedRevision, executionId and accepted message drafts. Sends `interactiveRebaseAccepted` separately from phase/outcome updates. |
| `getRebaseOperation` | requestId, repoPath/operationId; reconcile status and pending editor metadata without advancing Git. |
| `saveRebaseMessageDraft` | requestId, operationId, editorRequestId, expectedDraftRevision, full text; persists and acknowledges a new revision. |
| `submitRebaseMessage` | same identities plus complete text; validates live ownership, persists and resolves that invocation once. |
| `closeRebaseMessage` | identities plus latest text/revision; flushes draft, marks presentation dismissed, does not resolve native editor. |
| `continueRebase`, `abortRebase` | migrate existing payloads to requestId, operationId/native context token and unique commandAttemptId; revalidate state and execute once. |
| `skipRebase`, `quitRebase`, `editRebaseTodo` | same correlated native control shape; never treat an old operation token as authority over a replacement rebase. |
| `applyRebaseTodo`, `cancelRebaseTodoEdit` | pending sequence-editor request plus validated remaining-document revision/text; apply/cancel only that editor request. Apply does not Continue. |
| `showRebasePatch`, `showRebaseTerminal` | requestId and operation identity; reuse existing diff/editor/terminal facilities, no mutation. |
| `closeRebasePlan`, `dismissRebaseRecovery` | explicit lifetime/record dismissal; cannot erase an active Git/editor process or pending draft without the specified lifecycle handling. |

A handler may post acceptance promptly and continue awaiting its owned Git command so existing router operation middleware measures actual command duration. Separate initial Start acceptance from final operation result; do not emit a successful operation event just because acceptance was sent. Intentional native pauses are successful command execution with fixed paused-state UI metadata, not a “rebase completed” notification. Continuation attempts have separate IDs/results; duplicate delivery never starts a second process. Runtime status updates are one-way and checked against repository/panel generation before rendering.

### 22.3 Implementation file responsibilities

Reuse existing files where the responsibility fits; these concrete boundaries prevent a new oversized provider/service:

| Location | Responsibility |
| --- | --- |
| `shared/rebase.ts` | Plan, instruction, diagnostics, state and editor-request types; re-export needed types. |
| `shared/gitTodo.ts` | Lossless text grammar/projection utilities, stable span edits and conservative local diagnostics; no Git/process calls. |
| `src/services/GitRebaseService.ts` | Native command construction and delegation to planner/executor/state reader; ordinary rebase command remains distinct. |
| `src/services/rebase/RebasePlanner.ts` | Snapshot → native scratch plan/validation, correlated cancellation and baseline comparison. |
| `src/services/rebase/RebaseSandbox.ts` | Private repository/environment/ref/index construction and guarded cleanup. |
| `src/services/rebase/RebaseStateReader.ts` | Git-path resolution and version-aware native state interpretation, including non-conflict pauses/autostash outcomes. |
| `src/services/rebase/RebaseMessagePlan.ts` | Full-message grouping/proposals and safe association with real editor context. |
| `src/services/GitExecutor.ts` plus `src/services/gitRuntime/` | Captured/terminal execution policies and packaged runner/editor helpers; one Git launch boundary. |
| `src/webview/RebaseOperationCoordinator.ts` | Extension-lifetime operation/editor identities, leases, acceptance, continuation and status delivery. |
| `src/services/rebase/RebaseRecoveryStore.ts` | Atomic local records/drafts/schema/cleanup, independent of navigation. |
| `src/webview/handlers/historyHandlers.ts` or focused `rebaseHandlers.ts` | Stateless request routing; resolve current services per request, retain per-execution handles. |
| `webview-ui/src/components/InteractiveRebaseDialog.tsx` and `InteractiveRebaseRow.tsx` | Existing Configure/Messages/Confirm UI, expanded rows, inclusion/merge options and stale copy-only state. |
| `webview-ui/src/components/RebaseTodoEditor.tsx` | Text input and line diagnostics over the same document, no independent draft plan. |
| `webview-ui/src/components/RebaseMessageDialog.tsx` | Runtime full message editor, durable Close for now and explicit Submit. |
| `webview-ui/src/components/RebaseConflictBanner.tsx` | Repurpose/rename to `RebaseStatusBanner.tsx`, covering the full native state model and controls. |
| `webview-ui/src/stores/rebaseStore.ts` | Panel-local plan/document/message-review UI state; graphStore retains only graph-facing status/selectors as needed. |
| `webview-ui/src/App.tsx` and RPC client | Own rebase dialogs once above lazy menus/virtual rows, correlate events and reject stale responses. |
| Existing build config/package file lists | Include standalone runner/editor artifacts in the VSIX; no new package dependency is required by this design. |

Inject coordinator/recovery capabilities through the established request context rather than passing WebviewProvider to handlers. Update architecture map and repository agent orientation during actual implementation for these new objects/types; spec edits alone do not add map entries.

### 22.4 Telemetry review

Keep existing operation IDs for `interactiveRebase`, `continueRebase` and `abortRebase`; add allowlisted `skipRebase`, `quitRebase` and applied todo-edit operations where they actually mutate native state. Do not track scratch preparation, validation, draft saving, polling or raw editor invocations as user Git operations. No duplicate wrapper/helper operation events.

Extend fixed UI actions for submitted autosquash, merge mode, include-selected, todo-view choice, runtime message submit/close/reopen, recovery dismissal and explicit native controls. Reuse existing `dialogOutcome` helpers with one outcome per opening; runtime Close for now is a dialog dismissal, never a cancelled rebase operation. Plan acceptance marks that dialog confirmed; validation rejection does not mark a successful operation. Use existing bucket helpers for plan magnitudes, fixed phase/error codes and consent-gated transmission. Update `shared/telemetry.ts`, backend validators, `telemetry.json` and focused catalog tests together.

Never transmit todo text, exec commands/output, message drafts, hashes, paths, ref names, author data, configuration values, tokens, record identifiers or exception text/stacks. Do not instrument text keystrokes, drag motions, polling or graph refresh. Selecting a mode/checkbox is recorded as the reviewed fixed option on submission, not as a stream of every edit. Native output stays in the user's terminal/output view; it is not telemetry.

## 23. Delivery milestones and verification evidence

The specification has enough product detail and a selected technical design to implement without further user questions. Deliver the following in dependency order; each milestone includes meaningful tests of its boundary rather than tests that merely mirror its code.

1. **Native command/parity foundation:** validate all three hash-marker editor invocations and native empty/state behavior; implement executor policies and isolated scratch capture/validation. Prove no source changes, user-helper execution, network fetch or todo replay on preview. Compare installed Git's generated todo across linear/root/merge/octopus/shallow/replace/duplicate-subject/update-refs cases, both cousin modes and relevant configuration. No UI depends on an unverified approximate planner.
2. **Typed plans and creation:** implement shared contracts, correction reads/staging/editor service, leases/modal guard and correlated RPCs. Add the App-owned correction dialog and both menu entry points. Verify no content confirmation/fingerprint, current-HEAD creation, explicit untracked staging, non-timeout background behavior and draft recovery.
3. **Interactive plan UI:** implement native plan preparation, row/text synchronization, inclusion/parent/cousin options, editable defaults, individual drag/drop, group-message preservation and stale copy-only state. Validate native syntax for the exact submitted revision and keep arbitrary exec dormant during preview.
4. **Owned execution and runtime editing:** package terminal runner and file bridge; implement durable acceptance, runtime messages, Close for now, banner states and native controls. Test interleaved editor requests, conflicts, `edit`/`break`, exec failures/rescheduling, terminal input, signals and update-ref behavior. Confirm no automatic content staging/amending/retry or premature idle state.
5. **Restart recovery:** cover clean reload, abrupt host/terminal loss, surviving child, lost acknowledgement, unknown ownership, external completion/abort/replacement rebase, linked worktrees and concurrent panels. Verify saved text remains copyable and no mutation is automatically replayed. Confirm native pause state permits intentional staging/amend/commit resolution through short leases.
6. **Cross-cutting validation:** update telemetry catalogs, map/agent instructions for new architecture, and VSIX artifact packaging. Run focused tests, typecheck, lint and both extension/webview build. Check UI keyboard/focus/copy behavior on light/dark/high-contrast themes and large plans/path lists; verify no graph hot-path regression.

Native comparison fixtures must be isolated and use only benign, explicitly authored test commands/hooks. Do not run arbitrary user todo text to test a parser. This spec-writing session has not run mutating Git experiments, installed dependencies, modified the maintainer's test repositories or changed application code. Future implementation tests that require Git mutations remain subject to the repository's explicit authorization rules; provide manual commands if that authorization is absent.

Required environment matrix: current supported Linux/macOS/Git for Windows, declared VS Code minimum and current desktop, a remote extension host, SHA-1/SHA-256 where supported, linked worktrees, and Git versions around mode/flag availability. Preserve ordinary creation modes on older Git even when merge/replacement/ref-update features are unavailable. Native unsupported-option errors remain actionable; never silently emulate another command.

Performance verification measures source Git spawn counts, scratch index setup, todo generation/validation latency, cancellation cleanup, object I/O, RPC payloads, memory and virtual rendering separately from graph topology. Large histories are not preloaded into graphStore, full message reads are on demand, and arbitrary command output is not retained without bounds. An isolation/parity/platform failure blocks shipping the affected path until fixed; it does not authorize a guessed plan, user-repository preview mutation or unreviewed package installation.

Completion means all implemented paths pass the applicable tests and the installed extension includes its runner/editor resources. Documentation completeness and runtime correctness are separate: the former is established here; the latter must be demonstrated during implementation. No release version, What's New entry, commit, stage, push or publication is part of this handoff.
