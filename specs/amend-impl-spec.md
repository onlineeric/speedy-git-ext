# Implementation Spec: Amend Last Commit (5.12.0)

Date: 2026-08-24 — revised 2026-08-25 after a design review; revisions marked *(review 2026-08-25)*.
Product decisions: `specs/amend-idea.md` — that document owns *what* and *why*; this one owns *how*.
Where they disagree, the idea spec wins and this file is wrong.

Target release: **5.12.0**, containing two pieces built in order:

- **Part A** — the interactive-rebase reword/squash body-loss fix, which introduces the full-message
  read. Changelog only.
- **Part B** — Amend Last Commit. Gets the What's New entry.

Part A is a prerequisite: Part B's dialog needs the same raw-message read, and Part A is where it is
introduced.

---

## Part A — Full-message read, and the reword/squash body fix

### The defect

`RebaseEntry` (`shared/types.ts:507`) carries `subject` and no body. Two call sites then treat the
subject as if it were the whole message:

- `InteractiveRebaseRow.tsx:33` — prefills the reword box with `entry.rewordMessage ?? entry.subject`,
  and whatever is in that box is written verbatim as the commit's new message by
  `GitRebaseService.writeTempScripts` (`src/services/GitRebaseService.ts:238-241`).
- `InteractiveRebaseDialog.tsx:52,54` — `buildSquashMessages` joins `entry.subject` values, so a
  squash discards every body in the group as well.

Both silently drop bodies and trailers. Nothing in the codebase reads `%B` today.

### A.1 — `RebaseEntry` gains the full message

`shared/types.ts`:

```ts
export interface RebaseEntry {
  hash: string;
  abbreviatedHash: string;
  subject: string;
  /** Complete raw commit message (%B), trailing newline trimmed. */
  message: string;
  action: RebaseAction;
  rewordMessage?: string;
}
```

`subject` stays — the todo line is built as `${action} ${hash} ${subject}` and the row displays it.
Only the *message* semantics change.

### A.2 — `getRebaseCommits` reads `%B`

`src/services/GitRebaseService.ts:59-81`. Current format is `%H\x1f%h\x1f%s`, parsed by splitting
stdout on newlines. `%B` is multi-line, so newline-delimited parsing cannot work: switch the command
to NUL-delimited records.

- Args become `['log', '--reverse', '--ancestry-path', '-z', '--format=%H\x1f%h\x1f%s\x1f%B', `${baseHash}..HEAD`, '--']`
- Split stdout on `\0`, drop empties, then split each record on `\x1f` into 4 fields, rejoining any
  overflow into the message field (the message may itself contain `\x1f` in pathological cases; the
  subject cannot contain a newline, so field order is safe).
- Trim only trailing newlines from the message. Internal blank lines are content.

`validateHash` (`src/utils/gitValidation.ts`) stays as the first step, unchanged.

The `dropCommit` path (`historyHandlers.ts:182`) also calls `getRebaseCommits`; it ignores the new
field, so nothing else changes.

### A.3 — Call sites use the message

- `InteractiveRebaseRow.tsx:33` — `rewordMessage: action === 'reword' ? (entry.rewordMessage ?? entry.message) : undefined`
- `buildSquashMessages` — both the lead entry and each squashed entry contribute `entry.message`.

### A.4 — Extract `buildSquashMessages` for tests

It is currently module-private inside `InteractiveRebaseDialog.tsx`. Per the extract-for-tests rule,
move it to `webview-ui/src/utils/rebaseSquashMessages.ts` unchanged apart from the `message` switch,
and import it back. `validateStep1` stays where it is — it is dialog-step validation, not behaviour
worth isolating.

### A.5 — Tests

- `src/__tests__/GitRebaseService.test.ts` — parsing a NUL-delimited log whose messages contain blank
  lines, a `#` line, and a trailer; asserts `subject` and `message` are both correct and that a
  message is not truncated at its first newline.
- `webview-ui/src/utils/__tests__/rebaseSquashMessages.test.ts` — a squash group of two multi-paragraph
  commits produces a combined message containing both bodies.

### A.6 — Not in scope for Part A

Rewording a non-HEAD commit through a dedicated menu item. Part A fixes what the existing interactive
rebase dialog does; it adds no new entry points.

---

## Part B — Amend Last Commit

### B.1 — New backend service

New file `src/services/GitCommitService.ts`, constructed like every other service
(`workspacePath`, `log`, its own `GitExecutor`). Amend creates a commit; it is not index manipulation,
so it does not belong in `GitIndexService`. This also gives reword-of-older-commit a home later.

```ts
export interface AmendOptions {
  message: string;
  includeStaged: boolean;
  /** Hash the dialog was opened against; the amend is refused if HEAD has moved. */
  expectedHead: string;
  abortSignal?: AbortSignal;
}

export class GitCommitService {
  async getCommitMessage(hash: string): Promise<Result<string>>;
  async amendCommit(options: AmendOptions): Promise<Result<string>>;
}
```

**`getCommitMessage`** — `validateHash` first, then `git log -1 --format=%B <hash>`, trailing newlines
trimmed once. This is the same read Part A introduced, for a single commit.

**`amendCommit`** —

1. `git rev-parse HEAD`; if it differs from `expectedHead`, return a `HEAD_MOVED` error without
   running anything.
2. Write `message` to a file in a fresh `fs.mkdtempSync` directory (never `-m`): the message is
   multi-line, may contain quotes, backticks and non-ASCII, and `-F` also selects git's `whitespace`
   cleanup rather than `strip`, so a `#` at the start of a body line survives.
3. Run `git commit --amend -F <file>`, adding `--only` when `includeStaged` is false. Verified
   behaviour: `--amend --only -F` rewrites the message without absorbing the index, and leaves staged
   files staged.
4. `timeout: 60_000` (not the 30s default) and `abortSignal` passed through.
5. **On `CANCELLED` or `TIMEOUT`, re-read HEAD before reporting** *(review 2026-08-25)*. Killing git
   almost always means no commit was written — hooks run first — but the window between the commit
   object being written and the process exiting is real, and a wrong answer here is the worst
   possible one. So compare a fresh `git rev-parse HEAD` with `expectedHead` and return the outcome
   observed, not assumed: unchanged → the amend did not happen; changed → it did, despite the
   cancel. Both carry the same rider, that the hook process may still be running. Return this as a
   distinguishable result the dialog can word correctly (e.g. a `GitError` whose code stays
   `CANCELLED`/`TIMEOUT` but whose message states the observed outcome).
6. `finally` — remove the temp directory.

Do **not** pass an `env` override. `GitExecutor` already installs a no-op `GIT_EDITOR`, which is
exactly right here: `--amend` without `-F` would otherwise open an editor, silently accept the
unchanged message and "succeed". Hooks need the inherited environment.

### B.2 — New error code

`shared/errors.ts` — add `'HEAD_MOVED'` to `GIT_ERROR_CODES`. Telemetry validates error codes against
that runtime list, so a code invented outside it would be dropped at the funnel.

### B.3 — Service registration

- `src/webview/GitServiceRegistry.ts` — `gitCommitService: GitCommitService` in `GitServiceSet`.
- `src/webview/WebviewProvider.ts` — constructor parameter and `updateServices` parameter (two places,
  ~lines 66-72 and ~165-171).
- `src/ExtensionController.ts` — construct alongside the others (~line 179).
- `src/services/index.ts` — export it.

### B.4 — RPC surface

`shared/messages.ts`:

```ts
| { type: 'getCommitMessage'; payload: { hash: string } }
| { type: 'amendCommit'; payload: { message: string; includeStaged: boolean; expectedHead: string } }
| { type: 'cancelAmend'; payload: Record<string, never> }
```

Response:

```ts
| { type: 'commitMessage'; payload: { hash: string; message: string } }
```

Amend reports through the existing `success` / `error` responses.

Also required:

- Add all three request types to the request allowlist map (`shared/messages.ts` ~283-300) and
  `commitMessage` to the response map (~323).
- Add **`amendCommit` only** to `TRACKED_OPERATION_LIST` in `shared/telemetry.ts`. `getCommitMessage`
  is a read and `cancelAmend` is a control message; neither is an operation.

### B.5 — Handler

New file `src/webview/handlers/commitHandlers.ts`, registered in `WebviewMessageRouter`'s map (the
`satisfies RequestHandlerMap` makes a missing handler a compile error). Resolve services through
`context.services.current()` at request time — never captured at construction.

- `getCommitMessage` — service call, post `commitMessage` or `error`.
- `amendCommit` —
  1. `const blocked = await context.operationGuard.getOperationInProgressError()`; if non-null, post
     it as `error` and stop. The webview also disables the menu item, but its flags are only as fresh
     as the last refresh, so this catches an operation started in a terminal moments ago.
  2. Create an `AbortController`, store it on the handler module the way `compareHandlers.ts:8` does,
     and pass its signal into the service.
  3. On success: post `success`, then `await context.refreshCoordinator.reload()`. The reload alone
     is **not** enough to keep the selection — see B.8's *After a successful amend* *(review
     2026-08-25)*.
  4. On failure: post `error` with the `GitError` unchanged.
  5. Clear the stored controller in a `finally`.
- `cancelAmend` — abort the stored controller if present. The executor resolves the in-flight call
  with a `CANCELLED` GitError, which the amend path reports like any other failure.

### B.6 — Frontend: availability

`webview-ui/src/utils/commitMenuAvailability.ts` — add `canAmend` to `CommitMenuAvailability`.

It must key off the **head ref**, not `currentBranchHash`, and it must do so through the existing
helper rather than a second inline copy of the same predicate *(review 2026-08-25)*:

```ts
import { findHeadCommit, isStashPseudoCommit } from './commitRefs';
// …
const isCheckedOutTip = findHeadCommit([commit]) !== undefined;
// …
canAmend: isCheckedOutTip && !isStash,
```

Name it `isCheckedOutTip`, **not** `isHeadRef`. The file already has `isHeadCommit`, derived from
`currentBranchHash`, and the two deliberately disagree in detached HEAD — `isHeadCommit` is "the
current branch points here", `isCheckedOutTip` is "git has this commit checked out". Two similarly
named booleans that disagree in one specific case need names that say which case, or the file reads
as if it cannot decide what HEAD means. Add a comment saying detached HEAD is exactly that case.

`currentBranchHash` is `null` in detached HEAD, where git amends perfectly well — keying off it would
make the item vanish exactly there. Merge commits (parents preserved) and root commits are allowed;
no extra conditions.

Tests in `utils/__tests__/commitMenuAvailability.test.ts`: head row true; non-head false; stash false;
detached HEAD (head ref present, `currentBranchHash` null) **true**; merge and root commits true.

### B.7 — Frontend: command preview

`webview-ui/src/utils/gitCommandBuilder.ts` — `buildAmendCommand({ includeStaged }: AmendCommandOptions): string`,
following the existing builders' style. The force-push line reuses `buildPushCommand` with
`forceMode: 'force-with-lease'`, so the preview shows the real flag behind the plain checkbox label.

Tests in the existing `gitCommandBuilder` test file: message-only includes `--only`; include-staged
does not; both include `--amend`.

### B.8 — Frontend: the dialog

New `webview-ui/src/components/AmendCommitDialog.tsx`. Follow `PushDialog.tsx` for structure:
`Dialog.Content` with `dialogContentClassName` + `dialogContentStyle`, `dialogOverlayClassName`,
button variants from `dialogStyles.ts`, `CommandPreview`, and `useDialogTelemetry('amendCommit', open)`.

**The dialog opens immediately and fills in asynchronously** *(review 2026-08-25)*. It must not wait
on its inputs before rendering: the message textarea starts disabled with a loading state and becomes
editable when the message arrives, and every other element simply does not render until its input
does. Each input tolerates failure by omitting its element.

| Input | Source |
| --- | --- |
| Full message | new `rpcClient.getCommitMessage(hash)` |
| Staged count | `useGraphStore` → `uncommittedCounts.stagedCount` (already in the store) |
| Published | existing `rpcClient.isCommitPushed(hash)` (same call `useDropCommit` makes) |
| Signature | `useGraphStore` → `signaturePresence[hash]`, **not** the `getSignatureInfo` RPC *(review 2026-08-25)* |

The signature note only needs to know the commit *is* signed, and `signaturePresence`
(`graphStore.ts:130`) already holds that — it is populated for the Signature column. `getSignatureInfo`
runs `%G?` plus `cat-file` and can spawn gpg, which is the one input here slow enough to matter. If
presence is absent from the store (column never loaded, or a presence read failed), omit the note
rather than firing the RPC.

Elements, in order: message textarea; "Include N staged file(s)" checkbox (only when
`stagedCount > 0`, default **off**); published warning; signature note (only when signed);
"Force Push after amended" checkbox (only when published **and** a current local branch exists,
default off); command preview; buttons.

Confirm is disabled when the message trims to empty.

**The dialog stays open on every failure**, preserving the typed message *(review 2026-08-25)* — not
only on `HEAD_MOVED`. A `commit-msg` hook that rejects the message at second 40 must leave the user
holding their message, not send them back to retype it. The dialog closes on success, and on the
user's own cancel-the-dialog; an error never closes it.

**While running.** After ~3s show the "waiting on hooks" state with a Cancel button wired to
`rpcClient.cancelAmend()`. Cancel and the 60s ceiling both report **what B.1 step 5 observed**, never
a fixed sentence *(review 2026-08-25)*: HEAD unchanged means the commit was not created, HEAD changed
means the amend completed despite the cancel. Both add that the hook process itself keeps running —
we stopped waiting on it, we did not stop it. If the observed outcome says the amend completed, the
dialog closes and the graph reloads exactly as it does on the success path.

**After a successful amend**, the selection must follow to the rewritten commit *(review
2026-08-25)*. `refreshCoordinator.reload()` alone drops it: the amend always changes the hash, and
`graphStore.ts:529` keeps `selectedCommit` only when its hash still resolves
(`selectedCommitIndex >= 0 ? selectedCommit : undefined`), so an amend would clear the selection every
time. After the reloaded commits land, re-select via `findHeadCommitHash(commits)` from
`utils/commitRefs.ts` — the same head-ref predicate B.6 uses, so it is right in detached HEAD too, and
it needs no new hash plumbing through the `success` response (whose payload is a message string only).

**On success**, if force push was checked: call
`rpcClient.pushAsync(remote, branch, false, 'force-with-lease')` where `remote` comes from
`resolveDefaultRemote` and `branch` from the `useCurrentLocalBranch` selector. A push failure must
read as *"amended locally, force push rejected"* — never as a failed amend. Translate git's
`stale info` rejection into: the remote moved since the last fetch, fetch and check before force
pushing.

### B.9 — Frontend: the menu item

`webview-ui/src/components/useCommitMenuItems.tsx` — add a `useAmendCommit(commit)` cluster hook
beside `useDropCommit` (`:168`), returning `{ start, dialog }` in the same shape, and add its dialog
to the returned `dialogs` bundle.

The item goes in `commitItems`, rendered only when `isRowMenu && availability.canAmend`, with
`disabled={isOperationInProgress}` — matching checkout/merge/rebase. The badge menu (`variant: 'badge'`)
does not get it: the entry point is the commit row menu only.

`start` **opens the dialog first, then fetches** *(review 2026-08-25)*. Do not copy `useDropCommit`'s
resolve-then-open pattern here: that hook awaits one cheap call, whereas amend has several inputs, and
awaiting them all would hold the dialog shut behind the slowest one. See B.8 — the dialog renders at
once and fills in as answers arrive.

### B.10 — Telemetry

`sendOperation` carries a fixed property set (`operation`, `outcome`, `errorCode` + duration) and
`UiTelemetryEvent` is validated with `hasExactKeys`, so **there is nowhere to attach option booleans
as properties**. They are expressed as catalog actions instead:

- `TRACKED_OPERATION_LIST` += `'amendCommit'` — outcome and duration, via the router middleware.
- `DIALOG_IDS` += `'amendCommit'` — confirmed/cancelled, via `useDialogTelemetry`.
- `UI_ACTIONS` += `'amendCommit'` (menu item clicked), `'amendIncludeStaged'`, `'amendForcePush'`.
  The latter two are emitted on confirm **only when checked**, on the `commitMenu` surface. A plain
  message-only amend emits neither, so the message-only share is derivable from the operation count.
  Known limitation, accepted rather than worked around *(review 2026-08-25)*: the two arrive as
  independent counts, so one amend using both options is indistinguishable from two amends each using
  one. `specs/amend-idea.md`'s telemetry section was corrected to describe this shape — it previously
  called for "reviewed booleans", which the fixed property set has nowhere to carry.

Update `telemetry.json` and the focused telemetry tests. Nothing derived from repository content is
recorded: no message, no counts, no branch or remote names, no hashes.

### B.11 — Wording to be written during implementation

- HEAD moved: names no hashes; says the tip changed and the dialog must be reopened.
- Lease rejection: "the remote moved since your last fetch" phrasing, not `stale info`.
- Hook ceiling / cancel: states the commit was not created and the hook may still be running.

---

## Testing

Unit (Vitest — pure logic only, per the house rule):

- `commitMenuAvailability` — the `canAmend` cases in B.6.
- `gitCommandBuilder` — `buildAmendCommand` in both forms.
- `rebaseSquashMessages` — Part A.4.
- `GitRebaseService` — NUL-delimited `%B` parsing.
- `GitCommitService` — mocked executor: `--only` present/absent, `-F` always used, `expectedHead`
  mismatch short-circuits before any commit runs, temp dir removed on both paths.

Manual, against `~/repos/test-repo` (see CLAUDE.md for the repo layout):

1. Reword the tip; confirm body and trailers survive round-trip.
2. Stage a file, amend message-only, confirm the file is **still staged** and not in the commit.
3. Same again with the checkbox on; confirm the file is in the commit.
4. Detached HEAD — item present and works.
5. Merge commit as tip — parents preserved.
6. Start a rebase in a terminal, then right-click: item disabled; force the RPC through to confirm
   the backend guard also refuses.
7. Open the dialog, commit from VS Code's SCM view, then confirm: refused, dialog stays open, typed
   text intact.
8. Add a `pre-commit` hook that sleeps 10s: waiting state appears; Cancel ends the wait, and the
   reported outcome matches what HEAD actually shows (B.1 step 5).
9. Amend any commit and confirm the **selection lands on the rewritten tip**, not nowhere (B.8).
10. Add a `commit-msg` hook that always exits 1: the amend fails, the dialog **stays open**, and the
    typed message is still there.
11. Published branch: warning shows, force-push checkbox appears, `--force-with-lease` succeeds; then
    move the remote underneath and confirm the rejection message is the translated one.
12. Signed commit (if a signing key is configured): signature note shows.

## Documentation and release tasks

- `docs/architecture.md` — entries for `GitCommitService`, `commitHandlers.ts`, `AmendCommitDialog.tsx`,
  `rebaseSquashMessages.ts`; refresh the "last reconciled" date at the top. Required in the same
  change, per CLAUDE.md.
- `CLAUDE.md` — no change expected. A new service is inventory, which belongs in the architecture map;
  nothing here adds a new RPC convention, subsystem object or shared primitive worth listing.
- `package.json` → `5.12.0`; `CHANGELOG.md` entry covering **both** parts.
- What's New entry for 5.12.0: written during the maintainer's pre-release pass, not from this
  document. Amend only — fixes never appear in What's New.

## Risks and edge cases

- **Killing git does not kill its hooks.** Both the ceiling and Cancel leave a `pre-commit` process
  running, and lint-staged in particular keeps modifying files afterwards. Hence the wording rule.
- **`--only` during a conflicted revert destroys the revert state** — git's own behaviour, and the
  reason all four in-progress states are blocked. Do not "fix" the guard by narrowing it to what git
  refuses.
- **Detached HEAD amend moves nothing but HEAD.** Correct, and the force-push checkbox is hidden
  there because there is no branch to push.
- **A signed commit's signature is replaced**, not preserved — re-signed with the user's key if
  `commit.gpgsign` is set, dropped otherwise. Hence the note.
- **Amend keeps the original author** and records the amender as committer. Deliberately unsurfaced;
  `--reset-author` is out of scope.
- **The force push targets origin-or-first, which need not be the branch's upstream** *(review
  2026-08-25)*. `isCommitPushed` answers "exists on *some* remote", and `resolveDefaultRemote` picks
  `origin` else first-alphabetical, so a branch tracking a non-`origin` remote can have its amend
  force-pushed at the wrong one. Accepted for 5.12.0: `Branch` (`shared/types.ts:218-223`) carries no
  upstream field, and `PushDialog.tsx:29` already picks the remote exactly this way, so amend is
  consistent with the push UI the user already knows. Adding `%(upstream:remotename)` to `Branch` is
  the fix if this is ever reported; it is a shared-type change and out of scope here.
- **The `expectedHead` check narrows the race, it does not close it.** `rev-parse` and `commit` are
  two spawns, so a commit landing between them is still possible *(review 2026-08-25)*. The window is
  milliseconds against a user-driven risk measured in seconds, which is why the check is worth having
  — but do not describe it in user-facing text as a guarantee that HEAD cannot move.
- **`--force-with-lease` is only as strong as the remote-tracking ref.** Speedy Git's auto-refresh
  does not fetch (`RefreshCoordinator` re-reads local state only), but VS Code's `git.autofetch` does,
  and it erodes the lease. Do not describe the lease as an absolute guarantee in any user-facing text.
