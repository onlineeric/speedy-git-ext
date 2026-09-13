# Idea Spec — Create Fixup and Squash Commits

**Date:** 2026-09-12

**Status:** Discussion draft. Confirmed decisions are recorded below; remaining recommendations are proposals.

**Origin:** [GitHub issue #194](https://github.com/onlineeric/speedy-git-ext/issues/194), requested by @nelson870708. The maintainer acknowledged the request for investigation and the roadmap.

## Problem and intent

The current Git workflow in the extension does not provide a straightforward way to create fixup or squash commits directly from the UI. Users must manually perform these actions via the command line, which interrupts the seamless experience the extension aims to provide.

## Eric's idea for start brainstorming

This is my idea, but I want to discuss, improve it. 
I want to provide a simple, direct, easy to use and easy to understand way for users to create fixup and squash commits from the UI, and then use our existing rebase function to automatically apply them.

### Phase 1
Create new menu on the right click menu in the "Create" group.
The menu name should be something like "Create Fixup/Squash Commit with this commit hash".
then popup a dialog to confirm the action and provide options, such as choosing between fixup or squash, allow `-a` for stage all tracked files.
If there are untracked files on local, provide a warning message to user, suggest user to verify, because they will be ignored by this commit, or user need to manually Add them first (`git add -A`).
We do not provide add untracked files from this dialog, since git command will ignore them unless they are explicitly added.
I prefer always use commit hash instead of commit message or other identifiers, so the command should be something like `git commit --fixup <commit-hash>` or `git commit --squash <commit-hash>`.

### Phase 2
Use our existing Rebase function to automatically apply the fixup or squash commits by `--autosquash`. 
We currently have 2 rebase functions in the extension:
- Rebase current branch onto this (commit)
- Start interactive rebase from here

we need to evaluate how to make autosquash as a option, such as a checkbox in UI, or on the menu.

## Phase 1 — Design

Confirmed with Eric on 2026-09-13 unless marked **Proposal**.

### Verified git behaviour (git 2.43, scratch repo)

These facts drive the dialog; they were tested, not assumed.

| Command | Needs something to commit? | `-a` allowed? | `-m` / `-F` allowed? | Message when no editor edits it |
| --- | --- | --- | --- | --- |
| `--fixup=<hash>` | Yes ("nothing to commit") | Yes | n/a (not offered) | `fixup! <subject>` |
| `--squash=<hash>` | Yes | Yes | `-m` yes → `squash! <subject>` + blank line + text | `squash! <subject>` |
| `--fixup=amend:<hash>` | **No** — succeeds with an empty index | Yes | **No** — `-m` and `-F` are both refused | `amend! <subject>` + target's full message |
| `--fixup=reword:<hash>` | **No** — staged changes are ignored and stay staged | **No** — refused | **No** | `amend! <subject>` + target's full message |

- `amend:` and `reword:` take their message **only through the editor**: git opens it prefilled with
  `amend! <subject>`, a blank line, then the target's full message. At autosquash the text below the
  title line replaces the target's message.
- `amend:` / `reword:` need git 2.32+. See "Git version gate" below.

### Menu

- **"Create Fixup Commit..."** in the commit group, directly below "Amend Last Commit...". Not in
  the Create group: branch and tag are created *at* the commit, but a fixup commit is created on
  HEAD and only *targets* the commit.
- Shown on every real commit row and on badge menus (which share `useCommitMenuItems`). Hidden on
  stash rows and the uncommitted row.
- Disabled (not hidden) while another operation is in progress, like Amend.
- Single-commit only; no multi-select variant.

### Dialog

One dialog for all four kinds. Layout, top to bottom:

1. **Target** — short hash and subject of the commit.
2. **Not-an-ancestor warning** (yellow, `dialogWarningClassName`) — shown when the target is not an
   ancestor of HEAD: autosquash on the current branch will never apply this commit. A warning only;
   the commit can still be created, because git allows it. Merge-commit targets are allowed with no
   extra warning in Phase 1.
3. **Kind** (radio):
   - Fixup — add changes; the target keeps its message
   - Squash — add changes; messages are combined
   - Amend — add changes and replace the target's message
   - Reword — replace the target's message only
4. **Include** (radio, disabled for Reword because git refuses `-a` there and ignores the index):
   - Staged changes only (N files)
   - All tracked changes, `-a` (N staged + M modified)
5. **Message**:
   - Fixup: no message input. A fixup's message is discarded at autosquash.
   - Squash: an "Add a message" checkbox (`-m`), which enables a textarea. Unchecked commits with
     plain `squash! <subject>`, which is what git's editor template gives when accepted unchanged.
   - Amend / Reword: a required textarea prefilled with the target's full message (existing
     `getCommitMessage` RPC). Confirm is disabled while it is empty, matching git's "an empty
     message aborts the commit".
6. **Untracked-files warning** — shown when `untrackedCount > 0` and the kind can include content
   (not Reword): untracked files are not included, not even by `-a`, so add them first
   (`git add`). The dialog never adds files itself.
7. **Nothing-to-commit note** — see below.
8. **Command preview** — the exact `git commit ...` command.
9. **Hook wait / cancel** — same behaviour as the Amend dialog.

**Keeping the dialog height stable:** the conditional sections (warnings, message area) use the
always-rendered-but-hidden pattern where they would otherwise make the dialog jump as the kind
changes.

### Nothing to commit

Follows git exactly: only Fixup and Squash need content.

- If the selected include option covers 0 files, Fixup and Squash are disabled with a note that
  there is nothing to commit, and Amend / Reword remain available.
- When there are no staged or modified files at all, the dialog opens with **Reword** preselected,
  so the only action git would accept is the one already chosen. If Reword is unavailable (git older
  than 2.32), nothing is preselected and Confirm stays disabled.
- Counts come from the store and may be slightly stale; the backend command is the real check,
  and a git refusal is shown as an error.

### How the message reaches git (backend)

"Match the git workflow" here means: where git would open an editor, we collect that text in the
dialog first. The interactive rebase already works this way: it collects reword/squash messages up
front, and `GitRebaseService` supplies them through a scripted `GIT_EDITOR` (`editor.sh` + message
files in a temp dir, `toShellPath` for Windows).

- Fixup: `git commit [-a] --fixup=<fullHash>`, default no-op editor.
- Squash: `git commit [-a] --squash=<fullHash> [-m <message>]`, default no-op editor.
- Amend / Reword: `git commit [-a] --fixup=amend:<fullHash>` or `--fixup=reword:<fullHash>` with a
  scripted `GIT_EDITOR` that **keeps git's own first line** (`amend! <subject>`, which autosquash
  matches on) and replaces everything below it with the dialog's message. Extract the temp-dir
  editor-script helper out of `GitRebaseService` so both features share it, rather than duplicating
  it.
- Always the full hash, never a subject or other identifier.
- New RPC(s) in `shared/messages.ts`; `OperationGuard` check before running, as for Amend.

### Git version gate

Amend and Reword are **disabled when git is older than 2.32**. This shows git's own limit up front;
it adds no rule on top of git.

- The Amend and Reword radios stay visible but disabled, with a note naming the requirement and the
  detected version (e.g. "Requires git 2.32+ — you have 2.30.1").
- The version comes from the existing, currently unused `GitConfigService.getGitVersion()`. It is
  read once and cached on the backend (the git binary does not change per repo), then fetched
  lazily when the dialog opens. It is never read on the commit-load path.
- Parsing is a pure util with Vitest tests, e.g. `supportsFixupAmend(version)`. It must handle
  vendor suffixes such as `2.39.3 (Apple Git-145)` and `2.45.1.windows.1`.
- **Fail open:** if the version is unknown (lookup failed, or the string can't be parsed), Amend
  and Reword stay enabled and git's own error is shown if it refuses. A parsing gap must never lock
  users out of a working feature.

### Reuse from the Amend dialog

`AmendCommitDialog` already has the staged-count checkbox, `CommandPreview`, the "waiting on commit
hooks" phase with cancel, and dialog telemetry. Extract the shared pieces instead of copying them.

### Telemetry

- Menu item: `createFixupCommit`.
- Dialog outcome via `useDialogTelemetry`.
- Enum `kind`: `fixup | squash | amend | reword`; booleans `includeAllTracked` and (squash)
  `hasMessage`.
- Never the hash, subject or message text.

### Known limitation carried into Phase 2

Git writes the target's **subject**, not its hash, into the title (`fixup! <subject>`), and
autosquash matches on it. If two commits in the rebase range share a subject, the fixup can attach
to the wrong one. Phase 2 should detect duplicate subjects in the range.






