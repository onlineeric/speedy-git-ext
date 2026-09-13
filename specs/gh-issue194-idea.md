# Idea Spec — Create Fixup and Squash Commits

**Date:** 2026-09-12

**Status:** Design confirmed with Eric on 2026-09-13 — Phase 1, Phase 2 (basic and interactive rebase), the git version policy and release notes. Ready for implementation planning.

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

## Git version policy (applies to every phase)

Confirmed with Eric on 2026-09-13.

Only two git versions matter to this feature. Where our UI offers something that the user's git
cannot do, it is **disabled, never hidden**, with a note naming the required and detected versions.
Where git offers an equivalent older form, we **pick the command by version** instead of disabling
anything. This shows git's own limits up front; it adds no rule on top of git.

| Version | What it introduced that this feature touches | How we handle older git |
| --- | --- | --- |
| **2.32** | `--fixup=amend:` / `--fixup=reword:`, `-m` with `--fixup`, and `fixup -C` / `fixup -c` in the rebase todo list | Disable the dependent UI (today: Phase 1's Amend/Reword kinds only; the interactive rebase avoids `fixup -C`) |
| **2.44** | `--autosquash` for non-interactive rebase (older git silently ignores it) | Use the interactive form instead (see Basic rebase) |

- **Nothing older is gated.** For example, `--fixup`/`--squash` date from git 1.7.3, and `--empty`
  from 2.26. On a git that old, git's own error is shown as-is, with no special handling.
- The version comes from the existing, currently unused `GitConfigService.getGitVersion()`. It is
  read once and cached on the backend (the git binary does not change per repo), and fetched lazily
  by the dialogs that need it. It is never read on the commit-load path.
- Parsing and the comparisons are a pure util with Vitest tests. It must handle vendor suffixes such
  as `2.39.3 (Apple Git-145)` and `2.45.1.windows.1`.
- **Fail open:** if the version is unknown (lookup failed, or the string can't be parsed), nothing
  is disabled and git's own error is shown if it refuses. Where the command is chosen by version,
  an unknown version takes the form that works on every version. A parsing gap must never lock
  users out of a working feature.

## Phase 1 — Design

Confirmed with Eric on 2026-09-13.

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

Amend and Reword are disabled below git 2.32, following the feature-wide **Git version policy**
above. The radios stay visible but disabled, with a note such as "Requires git 2.32+ — you have
2.30.1".

### Reuse from the Amend dialog

`AmendCommitDialog` already has the staged-count checkbox, `CommandPreview`, the "waiting on commit
hooks" phase with cancel, and dialog telemetry. Extract the shared pieces instead of copying them.

### Telemetry

- Menu item: `createFixupCommit`.
- Dialog outcome via `useDialogTelemetry`.
- Enum `kind`: `fixup | squash | amend | reword`; booleans `includeAllTracked` and (squash)
  `hasMessage`.
- Never the hash, subject or message text.

### Known limitation carried into Phase 2 (addressed below)

Git writes the target's **subject**, not its hash, into the title (`fixup! <subject>`), and
autosquash matches on it. If two commits in the rebase range share a subject, the fixup can attach
to the wrong one. Phase 2 should detect duplicate subjects in the range.

## Phase 2 — Design

### Basic rebase ("Rebase Current Branch onto This Commit")

Confirmed with Eric on 2026-09-13.

#### Verified git behaviour (git 2.43, scratch repo)

- The existing flow is **not** direct. It opens `RebaseConfirmDialog` ("Ignore date" checkbox plus
  command preview), which the badge menu's ref rebase also uses.
- **Before git 2.44, `git rebase --autosquash <base>` without `-i` is silently ignored.** It reports
  "Successfully rebased" and leaves the `fixup!` commits untouched. Git 2.44 release notes: "`git
  rebase --autosquash` is now enabled for non-interactive rebase".
- `git rebase -i --autosquash <base>` with a no-op `GIT_SEQUENCE_EDITOR` squashes correctly on 2.43.
- The rebase runs with our no-op `GIT_EDITOR`, so git's prepared messages are accepted unchanged. A
  squash keeps `<target message>` + blank line + `<squash note>`, and the `squash!` title line is
  dropped. The terminal would open an editor here; anyone who wants to edit the combined message
  uses the interactive rebase.
- **The clicked commit is the base and is not rewritten.** A fixup whose target *is* the clicked
  commit (or anything below it) stays a plain `fixup!` commit, and git still reports success.
- `rebase.autoSquash=true` in the user's config applies to `-i` only, so an unticked checkbox (which
  runs plain `git rebase`) is unaffected by it.
- **A commit that becomes empty** (its changes are already in the new base) is handled differently:
  plain `git rebase` drops it and finishes, while `git rebase -i` **stops** with "Could not apply …
  becomes empty" and leaves the rebase paused. `git rebase -i --empty=drop` matches the plain
  behaviour.

#### Design

- **No submenu.** Add an **"Autosquash fixup/squash commits"** checkbox to `RebaseConfirmDialog`,
  next to "Ignore date". The badge menu's rebase gets it for free.
- **Unticked:** today's command, unchanged: `git rebase [--ignore-date] <base>`.
- **Ticked**, with the command chosen by git version (nothing is disabled):
  - **git 2.44+:** `git rebase --autosquash [--ignore-date] <base>`, the same command a user would
    type.
  - **Older than 2.44, or version unknown:** `git rebase -i --autosquash --empty=drop
    [--ignore-date] <base>` with a no-op `GIT_SEQUENCE_EDITOR`. `--empty=drop` keeps it from pausing
    where the 2.44+ command would finish.
  - The command preview shows whichever command will actually run.
- **While ticked, the dialog also shows** the items below. `RebaseConfirmDialog` fetches no commits
  today, so ticking the box lazily fetches the commits in `<base>..HEAD` once, reusing the existing
  `getRebaseCommits` RPC:
  - A count: "N fixup/squash commits will be applied".
  - A yellow warning for each `fixup!` / `squash!` / `amend!` commit whose target is not in the
    rebased range: it won't be applied; rebase from an earlier commit.
  - A yellow warning when two commits in the range share a subject, because autosquash matches by
    subject and may pick the wrong one.
  - The matching logic is a pure util with Vitest tests, and it must follow git's own rules: a
    subject match first, then a hash-prefix match, and nested `fixup! fixup! X` resolving to `X`.
- Telemetry: a boolean `autosquash` on the existing rebase operation.

### Rename "Start Interactive Rebase from Here"

Confirmed with Eric on 2026-09-13. **This change will be made.**

- The item runs `git rebase -i <clicked-hash>`, which uses the clicked commit as the base
  (`<upstream>` in git's docs) and rewrites only the commits *after* it. The behaviour is correct;
  the label is misleading, because "from here" usually means "including this commit" (JetBrains'
  "Interactively Rebase from Here" does include it, via `<clicked>^`).
- We keep git's meaning, where the clicked commit is exactly the hash git receives, and rename the
  item to **"Interactive Rebase onto This Commit"**. This mirrors "Rebase Current Branch onto This
  Commit".
- Label only: `useCommitMenuItems.tsx`, on both the row and badge variants. The telemetry id
  `interactiveRebase` is unchanged. The past `CHANGELOG.md` entry that names the old label stays as
  history, and the release's CHANGELOG notes the rename.
- "Onto" can read as "move my branch" when the clicked commit is an ancestor. The interactive dialog
  already lists exactly which commits will be rewritten, which answers that.

### Interactive rebase ("Interactive Rebase onto This Commit")

Confirmed with Eric on 2026-09-13. Guiding constraint: this dialog is already complex, so every
addition must stay simple and self-explanatory. What the user sees must be exactly what runs.

#### Verified facts (git 2.43, scratch repo + code reading)

- **Passing `--autosquash` would do nothing here.** `InteractiveRebaseDialog` builds the whole todo
  list and `GitRebaseService`'s sequence editor copies it over git's own. Autosquash must therefore
  be applied **in the dialog**, as a rearrangement of the entries the user can see and adjust.
- Git's own autosquash plan, for reference:
  ```
  pick     A subject
  fixup    fixup! A subject
  fixup -C amend! A subject     # amend! → "fixup -C" (git 2.32+)
  pick     B subject
  squash   squash! B subject
  pick     C subject
  ```
- **No `fixup -C` is needed.** Making the target `reword` (message = the `amend!` commit's body,
  i.e. the text below its `amend! …` title line) and the `amend!` commit `fixup` produces the same
  result: an identical tree hash. It also works for the empty commits `--fixup=reword:` creates.
- In a squash, git **comments out** a `squash!` commit's title line in the combined message.
  `buildSquashMessages` currently includes the whole message, so it would keep that line.
- The dialog has no Command Preview. It runs a single `git rebase -i <base>`; the rows are the todo
  list git executes internally, not separate commands. The todo text is built in
  `GitRebaseService.writeTempScripts`.
- `isRebaseConflict` treats *any* paused rebase as a conflict, so a stop on a commit that became
  empty is reported as "paused due to conflict" even with no conflicted files.

#### Design

**Autosquash checkbox (step 1, above the list)**

- Label "Autosquash fixup/squash/amend commits (N)".
- **Checked by default** when the range contains at least one autosquashable commit, i.e. a
  `fixup!` / `squash!` / `amend!` commit whose target is in the list. **Disabled** (not hidden) when
  there are none.
- **Checked:** each autosquashable commit moves directly under its target, in git's order:
  - `fixup!` → `fixup`
  - `squash!` → `squash`
  - `amend!` → `fixup`, and its target becomes `reword` with the message prefilled from the
    `amend!` body. If several `amend!` commits share a target, the last one's message wins, as in
    git.
- **Unchecked:** the autosquash commits go back to their **original positions** and back to `pick`,
  and a target that autosquash turned into `reword` goes back to `pick` with its original message.
  Any action the user changed on those commits is reset too; everything else the user changed
  stays. The checkbox tooltip says so.
- Matching (subject first, then hash prefix, nested `fixup! fixup! X` → `X`) comes from the **same
  pure util** as the basic rebase's count and warnings, so git's rules live in one place.
- Works on every git version, so no version gate (only `reword`/`fixup`/`squash` are used).

**Group indicator (step 1)**

- A visual bracket joins each `pick`/`reword` row with the `squash`/`fixup` rows directly below it.
- Derived from the list itself, for **all** groups (not only autosquash ones), because that is what
  git does: a `squash`/`fixup` always merges into the row above it. It stays correct after manual
  drags.

**Warnings (step 1)** — reused from the basic rebase:

- Yellow warning for a `fixup!` / `squash!` / `amend!` commit whose target is not in the list: it
  stays `pick` and will not be applied; rebase from an earlier commit.
- Yellow warning when two commits in the list share a subject.

**Squash messages (step 2)**

- Fix `buildSquashMessages` to drop a `squash!` commit's `squash! …` title line from the combined
  message, as git does.

**Command Preview**

- **Every step:** the one-line `CommandPreview` at the bottom: `git rebase -i <base>`. It never
  shows `--autosquash`, because we never pass it.
- **Step 3 (Confirm) only:** a read-only, monospace, multi-line "Todo list" box with the exact
  lines we send, e.g.
  ```
  reword 1a2b3c4 A subject
  fixup  9f8e7d6 fixup! A subject
  pick   5c6d7e8 B subject
  ```
  with a note: "Messages from step 2 are supplied when git asks for them". Running the command
  and pasting this list into the editor reproduces the rebase in a terminal.
- Move the todo-line building out of `GitRebaseService.writeTempScripts` into a shared pure
  function, so the preview and the backend cannot diverge.

**Paused on an empty commit**

- Git's `-i` stops when a commit becomes empty; we keep that (no `--empty=drop`), matching git.
- When the rebase is paused with **no conflicted files**, say "Rebase paused — git stopped at a
  commit that became empty. Continue or abort." instead of "paused due to conflict".

**Not done**

- No new `fixup -C` / `fixup -c` action.
- The user's `rebase.autoSquash` config is ignored, since our todo list replaces git's either way
  and the checkbox makes the choice explicit.

**Telemetry**

- Boolean `autosquash` (checkbox state at Start) on the existing `interactiveRebase` operation.

## Release

- **What's New dialog:** yes. The release that ships this gets an entry in `whatsNewEntries.tsx`
  that thanks @nelson870708 for requesting it in issue #194. The wording and which items appear are
  decided in the pre-release What's New pass with Eric.
- `CHANGELOG.md` also notes the rename of "Start Interactive Rebase from Here".
