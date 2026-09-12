# Implementation Spec — Create Fixup and Squash Commits

Date: 2026-09-12

Status: **Implementation specification complete after 11 clarification answers. Ready for implementation planning; implementation is not authorized by this document.**

Product context: [gh-issue194-idea.md](gh-issue194-idea.md). This document defines implementation contracts, ownership, failure handling, and validation. The clarification record and native-Git policy below govern the design. The idea spec has been synchronized with these decisions. Technical defaults not individually chosen by the maintainer are identified as implementation choices. This spec authorizes neither implementation nor Git history changes. No release version or What's New entry is assigned.

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

## 1. Scope and decision status

Confirmed from the idea spec:

- Create a new correction commit at HEAD, attached or detached; leave the target unchanged. Advance the current branch only when HEAD is attached.
- Include replacement-message fixup using `--fixup=amend:<hash>`.
- Keep immediate Amend Last Commit separate.
- Do not implement, invoke, or imply automatic autosquash in the existing interactive-rebase UI.
- Three modes: Fixup, Squash, Fixup with replacement message; no dedicated reword-only mode. Follow native empty-content semantics: amend-fixup can be content-empty, while ordinary fixup/squash retain Git’s normal rejection unless a native operation state permits otherwise. Do not add `--allow-empty` or a fourth mode.
- Allow merge targets, following Git’s native behavior. Merge-aware CLI autosquash guidance is included; integrated rebase UI work remains out of scope.
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

No automatic push, force push, rebase, stash, index reset, hook bypass, signing override, dependency installation, or release-file modification is part of this feature.

### Native Git compatibility — confirmed direction

The maintainer’s project-wide native-Git rule takes precedence over earlier provisional restrictions. Detached HEAD and non-ancestor targets are allowed. Do not call ancestry a creation prerequisite: Git uses the target to construct the correction message; later autosquash can only match a target included in its todo range. Do not add an ancestry probe just to open or submit this feature.

Native behavior reconciliation is complete for this feature: no blanket empty-content/paused-operation/embedded-repository bans, no forced cleanup override, and no all-mode Git 2.32 gate. The checkbox maps to an explicit native add step for current untracked paths; it does not imply force-adding ignored files. A three-mode UI does not authorize adding `--allow-empty`. Existing application features are not being rewritten as part of this documentation task; the project-wide policy is recorded in repository instructions for subsequent work.

## 2. Existing code and reuse boundaries

| Existing code | Reuse / required change |
| --- | --- |
| `webview-ui/src/components/useCommitMenuItems.tsx` | Add one shared Create item for row and ref-badge menus; dispatch an open request instead of owning the dialog under the row. |
| `webview-ui/src/utils/commitReachability.ts` | Not required for this feature’s creation eligibility. Neither ancestry nor first-parent membership gates a native fixup/squash target. |
| `src/services/GitCommitService.ts` | Keep commit creation in this service; reuse full-message reading without copying the existing amend RPC's correlation behavior. |
| `src/services/GitDiffService.ts` | Extract/reuse porcelain parsing as appropriate. Do not use `getUncommittedSummary` as the authoritative confirmation read: it runs numstats, may collapse untracked directories, and substitutes empty status data on error. |
| `src/services/GitIndexService.ts` | Add literal, explicitly enumerated path staging support where reusable. Existing `git add -- ...paths` does not disable Git pathspec expansion. |
| `src/services/GitExecutor.ts` | All Git processes still go through this executor. Add an explicit opt-in no-timeout execution option for this workflow; preserve existing callers’ timeout behavior. Observe normal process completion independently of dialog visibility. |
| `src/services/GitRebaseService.ts` | Existing temporary message-editor scripts are a design precedent, not a dependency on the rebase workflow. |
| `src/webview/OperationGuard.ts` | Do not invoke its blanket paused-operation rejection for correction creation. Git governs state/option compatibility; the separate mutation coordinator prevents simultaneous extension mutations. Existing callers are not rewritten here. |
| `src/webview/handlers/branchCheckoutHandlers.ts` | Reuse the principles of retaining original services, acquiring before awaiting, and matching request IDs. Checkout's private busy flag is insufficient as a shared mutation guard. |
| `webview-ui/src/App.tsx` | Own the dialog once, independently of virtualized rows and lazy menus. |
| Shared dialog, theme, copy, telemetry utilities | Reuse existing primitives. No independent styling or free-form telemetry schema. |

The existing amend interruption check treats any HEAD movement as success. Do not copy that inference into this feature.

## 3. Ownership and proposed files

Names below are proposed concrete implementation locations; keep each file focused and adjust names if implementation discovers an existing equivalent.

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

Status data and terminal results are session-only. Proposed bounded retention: keep the active session and unresolved execution; retain up to 32 resolved executions until extension-host disposal. Closing a panel must not erase active execution records or a background failure draft. Do not evict a running/uncertain execution or an unrecovered failure draft to satisfy the terminal-success cache bound. Resolved successes may be evicted only after their sessions are closed; a closed/unknown session rejects execution rather than recreating it, so replaying an evicted ID cannot commit again. Extension-host restart loses this ledger; do not promise cross-restart exactly-once execution.

## 5. RPC protocol

Proposed requests, all registered in the exhaustive router map:

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
| Fixup | `git commit --fixup=<target>`; generated marker, no editable message. |
| Squash | `git commit --squash=<target> -F -`; stdin contains only additional text, including empty text if selected. Verify empty input behavior against supported Git versions. |
| Replacement fixup | `git commit --fixup=amend:<target>`; override `GIT_EDITOR` with a controlled editor writing the prepared complete message. Neither `-F` nor `-m` is valid here. |

Prepared replacement message is `amend! <original target subject>`, a blank line, then the edited full replacement message. The marker continues to reference the original target subject even if the replacement subject changes. Supply the complete edited text, including body and trailers, to Git without truncation. Do not force `--cleanup=whitespace` or override `commit.cleanup`: normal Git cleanup/configuration may remove comment lines or normalize whitespace. The preview is the prepared message, not a guarantee of the final stored bytes; add the note `Git cleanup and hooks may modify this message.` Reject whitespace-only replacement text and NUL input. Do not silently truncate text.

Fetch `%B` only when replacement mode is first selected. Cache the result within the session, preserve independent squash/replacement edits when switching, and never let a late fetch replace edited text. The existing helper trims trailing newlines; document that normalization rather than promising byte-identical commit-message round trips.

The temporary editor must:

- Use an extension-created private temporary directory and file permissions suitable for commit-message data.
- Put message contents in a file, never executable shell source, CLI `-m`, logs, or environment values.
- Pass only controlled paths to the editor script, quote all paths, handle Windows Git shell conventions, spaces and non-ASCII paths.
- Write to Git's supplied message path and fail on I/O errors; never silently fall back to the no-op editor.
- Clean up after the Git process has finished using the files, including failure paths; do not remove files while an interrupted process may still need them.
- Preserve inherited hook/signing and cleanup configuration. The controlled editor writes the user’s complete prepared replacement at Git’s normal editor phase; this is an intentional full-message edit and can replace earlier `prepare-commit-msg` edits. Do not pretend it appends or preserves unknown hook text. `commit-msg` runs afterwards and may change/reject that message. For ordinary fixup/squash the message follows their native input/hook path. Integration tests cover both hook phases and configured cleanup.

Use the existing Git-shell path/quoting conventions for a minimal editor script that copies the extension-created message file to Git's first argument, with both paths quoted and the copy exit code propagated. The message file path may be passed through a dedicated environment variable; message text must not be. Create the directory with `fs.mkdtemp` under the OS temporary directory and keep script/message cleanup attached to the backend execution's `finally`, not React unmount. No editor counter or rebase state is needed. Validate Windows Git shell invocation and paths containing spaces/quotes before shipping.

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

For future multi-tab routing, the same explicit action will locate/open the appropriate repository tab without replacing an unrelated tab. That router is outside this feature. Retained drafts are not persisted across extension-host restart.

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
- Autosquash help is explanatory only: `git rebase -i --autosquash <target>^`, or `git rebase -i --autosquash --root` for an actual root. For merge targets use the `--rebase-merges` example in section 12 rather than the linear-rebase example. Warn that range/topology must be reviewed and current Speedy Git interactive rebase does not automatically implement this workflow.

## 12. Special target and repository cases

- Merge targets: all three creation modes accept a merge commit as the target and create an ordinary correction commit at HEAD. Default linear rebase omits merge commits, so an unmatched correction normally remains a separate pick (subject ambiguity can also match a different commit). For a merge target `M`, show the contextual CLI example `git rebase -i --rebase-merges --autosquash M^1`. The chosen range must include the merge. Git can place the correction immediately after the merge todo instruction and fold it into the recreated merge. Review the todo and resolve conflicts as usual; original merge resolutions/manual changes may need reapplication. This is not a promise that every topology rebases conflict-free.
- Duplicate subjects: retain Git's normal generated subject markers; do not promise exact later targeting. Show contextual review guidance, with no full-history subject scan during menu use.
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
- Status parser handles ordinary/rename/unmerged/untracked records and filenames containing whitespace/NUL delimiters correctly; status failure never becomes a clean status.
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

1. Use the 11 recorded clarification answers and the native-behavior decisions above; do not reopen settled product choices merely because the original issue requested narrower behavior.
2. Validate message editor, supported Git flags, category-based inclusion, background lifetime and external-interruption strategy before building dependent UI.
3. Implement shared contracts, authoritative reads and focused service tests.
4. Implement mutation/session ownership, route inventory and correlated RPC handling.
5. Implement exact staging and commit execution with recovery; validate actual Git semantics where authorized.
6. Implement App-owned dialog, shared menu entry and current-view selection behavior.
7. Instrument telemetry, run relevant checks and complete platform/manual validation.
8. Update `docs/architecture.md` for every added/repurposed file and refresh its reconciled date. Update `CLAUDE.md` and `AGENTS.md` (they are separate files in this checkout) for the new subsystem objects, RPC convention and shared mutation invariant.

This spec file is excluded from the architecture map under repository rules. Writing it requires no architecture-map update. No package version, changelog release heading or What's New entry is chosen by this document.

The product clarification pass is complete. The implementation must still validate actual Git/platform behavior and pass the tests above before the feature is complete; this document does not claim those runtime checks have run. Multi-tab implementation, release assignment, and changes to unrelated existing feature semantics remain outside scope.

## 16. Reference evidence

- [Git commit documentation](https://git-scm.com/docs/git-commit): correction modes, staged/`-a` behavior, squash message flags and cleanup.
- [Git commit implementation](https://github.com/git/git/blob/master/builtin/commit.c): incompatible amend-fixup message flags; editor construction and empty-commit handling require version-specific validation.
- [Git rebase documentation](https://git-scm.com/docs/git-rebase): subject/hash autosquash matching, replacement fixups and root-inclusive ranges.
- [Git status documentation](https://git-scm.com/docs/git-status): explicit untracked enumeration, porcelain and submodule policies.
- [Git add documentation](https://git-scm.com/docs/git-add): literal/NUL pathspec input and staging behavior.
- Installed Git release notes `/usr/share/doc/git/RelNotes/2.32.0.txt`: introduction of amend/reword fixup modes.

References were inspected during the preceding evaluation. Runtime Git/autosquash experiments have not been performed in this drafting session; do not describe the proposed commands as integration-tested.

- [Git upstream rebase-merges tests](https://github.com/git/git/blob/master/t/t3430-rebase-merges.sh): the `post-rewrite hook and fixups work for merges` case creates a fixup targeting a merge and rebases with `--autosquash -r`. Source inspected during clarification; no local history mutation was performed.


## 17. Clarification coverage and remaining implementation work

Eleven questions were answered and integrated into both specs. No additional product decision is needed for the initial implementation; remaining technical defaults follow existing repository conventions and the native-Git policy rather than introducing more preference questions.

| Area | Status |
| --- | --- |
| Functional scope and native command behavior | Resolved: three modes, native targets/state/content semantics, creation only. |
| Data model and lifecycle | Resolved: correlated panel/repository/session/execution identity; current HEAD; background retention. |
| Interaction and recovery | Resolved: fresh defaults, close on success, Stop waiting, explicit draft recovery, reject modal-blocked navigation without replay. |
| Performance and reliability | Defined: no per-row work, on-demand status, no content comparisons, Git-native execution, correlated at-most-once attempts. |
| Privacy and telemetry | Defined: existing fixed catalogs, aggregate mode/options, no user/repository content. |
| Git/platform integration and edge cases | Defined validation work: editor/cleanup/hooks, capability fallbacks, pathspecs, actual autosquash and external interruption. Not runtime-validated in this documentation task. |
| Constraints and terminology | Resolved: native behavior across features; no new mode/rebase integration/multi-tab implementation or agent Git mutation authority. |
| Completion criteria | Defined: focused tests, relevant build/type/lint checks, platform/manual validation and architecture/instruction updates. |

Implementation may adjust internal file names/types when existing abstractions fit better, but not the confirmed behavior. Do not use that flexibility to add confirmations, background retries, branch/ancestry restrictions or queued repository opens.
