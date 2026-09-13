# Implementation Spec — Fixup/Squash Commits and Autosquash (issue #194)

**Target version:** 5.16.0 (already set in `package.json`)
**Design source:** `specs/gh-issue194-idea.md`. Every decision below was confirmed there, and the git
behaviour it relies on was verified in scratch repos. Read that doc for the *why*; this doc is the
*how*.
**Delivery:** one release, all parts together. Tasks are ordered so shared building blocks land
before the features that use them.

## Conventions every task follows

- **Git, not our own rules.** Where git allows something, we allow it; where git refuses, the UI
  says so up front (disabled, never hidden) or surfaces git's own error.
- **Command Preview on everything new or changed.** Every preview string comes from the **same
  pure function** that builds the backend's args, so the preview can never describe a different
  command.
- **Pure logic in utils with Vitest tests** (`__tests__/` beside the code); components stay thin.
- **Theme tokens only**; warnings use `dialogWarningClassName`, buttons use the shared variants.
- **Hidden-but-rendered** conditional sections where a dialog would otherwise jump in height.
- **RPCs:** add to `shared/messages.ts`, register the handler in the `WebviewMessageRouter` map, and
  resolve services via `context.services` at request time. Mutating handlers call the operation
  guard first.
- **Docs in the same change:** `docs/architecture.md` for every file added or repurposed (plus its
  "last reconciled" date), and `CLAUDE.md` → *Shared Logic* for the new shared utils named below.
- Run `pnpm typecheck`, `pnpm lint` and `pnpm test` at the end of each task.

---

## Task 1 — Git version util and RPC

**Goal:** one place that knows the installed git version and answers "does it support X".

- **New `shared/gitVersion.ts`** (pure):
  - `parseGitVersion(raw: string): GitVersion | null`. It accepts `2.43.0`,
    `2.39.3 (Apple Git-145)` and `2.45.1.windows.1`, and returns `null` when it can't parse.
  - `GIT_FEATURE_VERSIONS = { fixupAmendReword: [2, 32], nonInteractiveAutosquash: [2, 44] }`.
  - `supportsGitFeature(version: GitVersion | null, feature): boolean`. **An unknown version
    returns `true`**, so it fails open.
  - A **separate** `usesNonInteractiveAutosquash(version)` that returns `false` for an unknown
    version. Choosing a command must pick the form that works everywhere, which is the opposite
    default from gating UI, so it gets its own function to keep the two defaults from being
    confused.
- **Backend:**
  - Cache the version on `WebviewRuntime` (`gitVersion: GitVersion | null | undefined`, where
    `undefined` means not read yet). It is read via the existing, unused
    `GitConfigService.getGitVersion()` at most once per panel, and never on the commit-load path.
  - Expose it through a helper on the request context, so both the RPC and the rebase handler
    share one read.
- **RPC:** request `getGitVersion` → response `gitVersion { raw: string | null }`. The webview
  parses it with the same shared util, and stores it in `graphStore` once loaded.
- Tests: `shared/__tests__/gitVersion.test.ts` covers parsing variants, garbage input, boundaries
  (2.31.9 / 2.32.0, 2.43.x / 2.44.0) and both unknown-version defaults.

## Task 2 — Editor-script helper, extracted from `GitRebaseService`

**Goal:** one mechanism for "git will open an editor; supply this text instead".

- **New `src/services/gitEditorScripts.ts`**:
  - Temp dir creation and cleanup.
  - Writing a `#!/bin/sh` script with mode `0o755`.
  - `toShellPath`.
  - The env-var indirection for paths, which avoids path injection.
- Move `GitRebaseService.writeTempScripts`'s script writing onto it. **Interactive rebase behaviour
  must not change**, and its existing tests must stay green.
- Add a **message-replacing editor for Task 5**: a script that keeps the first line of `$1`
  (git's `amend! <subject>`), then writes a blank line and the contents of `$SPEEDY_MESSAGE_FILE`.
- Tests: script content and env wiring (unit), plus one scratch-repo integration-style test if the
  existing service tests have a pattern for it.

## Task 3 — Shared rebase todo builder

**Goal:** the backend's todo file and the dialog's preview are the same text.

- **New `shared/rebaseTodo.ts`**: `buildRebaseTodoLines(entries: RebaseEntry[]): string[]`, which
  returns `"<action> <hash> <subject>"` lines exactly as `writeTempScripts` produces them today.
- `GitRebaseService` uses it; nothing else changes.
- Tests: action/hash/subject formatting, including subjects containing `#` and unicode.

## Task 4 — Autosquash matching util

**Goal:** git's autosquash rules, stated once, used by both rebase dialogs.

- **New `webview-ui/src/utils/autosquash.ts`** (pure). **Port the matching from git's
  `todo_list_rearrange_squash` (`sequencer.c`)** rather than re-inventing it, and verify against a
  scratch repo:
  - A commit is autosquashable when its subject starts with `fixup! `, `squash! ` or `amend! `.
    Repeated prefixes (`fixup! fixup! X`) are skipped to reach the target text.
  - Target lookup, **earlier in the list only**: an exact subject match (the first occurrence
    wins); else, if the text has no space, a commit whose hash starts with it; else the first
    commit whose subject *starts with* the text.
  - `fixup!`/`squash!` commits are themselves matchable targets, which is how chains attach.
- API (names indicative):
  - `findAutosquashLinks(entries)` → `{ links: Array<{ hash, targetHash, kind: 'fixup' | 'squash'
    | 'amend' }>, unmatched: string[], ambiguousSubjects: string[] }`.
    - `unmatched`: autosquashable commits whose target is not in the list.
    - `ambiguousSubjects`: a link resolved by subject while 2+ entries share that subject.
  - `applyAutosquash(entries, links)` → the new entry list, in git's order:
    - each commit moves directly after its target's chain;
    - `fixup!` → `fixup`, `squash!` → `squash`;
    - `amend!` → `fixup`, and its target becomes `reword` with `rewordMessage` = the `amend!`
      commit's message below its first line (leading blank lines trimmed). The last `amend!` for a
      target wins.
  - `revertAutosquash(currentEntries, originalEntries, links)` → autosquash commits go back to
    their original index and to `pick`; targets that autosquash turned into `reword` go back to
    `pick` with no `rewordMessage`; all other entries keep their current order and edits.
- Tests: every fixture from the idea doc (the fixup + squash + amend! plan), nested prefixes,
  prefix-of-subject matching, hash matching, duplicate subjects, a target outside the list, an
  `amend!` created by `--fixup=reword:` (empty body), apply-then-revert round trip, and revert
  after unrelated manual drags.

---

## Task 5 — "Create Fixup Commit..." (commit menu + dialog + backend)

### Backend

- **`GitCommitService.createFixupCommit(options)`** with `options = { kind: 'fixup' | 'squash' |
  'amend' | 'reword', targetHash, includeAllTracked, message?, abortSignal }`:
  - `validateHash(targetHash)`; always the full hash.
  - Args come from a **new shared pure `buildFixupCommitArgs`** in `shared/fixupCommit.ts`:
    - fixup: `commit [-a] --fixup=<hash>`
    - squash: `commit [-a] --squash=<hash> [-m <message>]`
    - amend: `commit [-a] --fixup=amend:<hash>`
    - reword: `commit --fixup=reword:<hash>`. Never `-a`: git refuses it.
  - amend/reword run with the Task 2 **message-replacing editor** as `GIT_EDITOR` (git refuses both
    `-m` and `-F` there). fixup and squash use the executor's default no-op editor.
  - Hooks run, so reuse the amend's `AMEND_TIMEOUT_MS`, `abortSignal`, and the "describe what an
    interrupted commit actually did" approach:
    - read HEAD before running;
    - after a cancel or timeout, a new HEAD whose parent is the old HEAD means the commit was made.
  - Refuse with git's error; don't pre-validate what git validates.
- **RPCs:** `createFixupCommit { kind, targetHash, includeAllTracked, message? }` and
  `cancelFixupCommit`.
  - The handler checks the operation guard first, and posts success followed by
    `refreshCoordinator.reload()`, mirroring `amendCommit`.
  - Generalize `runtime.activeAmendController` into one `activeCommitController` shared by both
    flows. They cannot run at once, and one field avoids two copies of the cancel wiring.

### Webview

- **Menu:** in `useCommitMenuItems.tsx` `commitItems`, directly below "Amend Last Commit...", add
  **"Create Fixup Commit..."**.
  - Availability goes in `utils/commitMenuAvailability.ts` as a new `canCreateFixup`: any real
    commit, excluding stash pseudo-commits and the uncommitted row.
  - Disabled while an operation is in progress.
  - Row and badge variants. Single commit only.
- **Extract from `AmendCommitDialog`** before building the new dialog:
  - the hook-wait phase and its timer, as a hook (e.g. `hooks/useCommitHookWait.ts`);
  - any shared pieces of the running/cancel footer.

  `AmendCommitDialog` must keep its behaviour.
- **New `components/FixupCommitDialog.tsx`.** Layout per the idea doc, top to bottom:
  1. Target: short hash and subject.
  2. Yellow warning when the target is **not reachable from HEAD**. Use
     `getReachabilityChecker(commits).isReachableFromHead`: it won't be applied by autosquash on
     this branch.
  3. Kind radio: Fixup / Squash / Amend / Reword.
     - Amend and Reword are disabled when `!supportsGitFeature(version, 'fixupAmendReword')`, with
       the note "Requires git 2.32+ — you have X".
     - Fetch the version lazily on open.
  4. Include radio: "Staged changes only (N)" / "All tracked changes, `-a` (N staged + M
     modified)". Disabled for Reword.
  5. Message:
     - Fixup: nothing.
     - Squash: an "Add a message" checkbox that enables a textarea.
     - Amend / Reword: a required textarea prefilled from `getCommitMessage`.
  6. Yellow untracked-files warning when `untrackedCount > 0` and kind ≠ Reword.
  7. Nothing-to-commit note:
     - Fixup and Squash are disabled when the selected include option covers 0 files.
     - When staged + modified = 0, open with Reword preselected. If Reword is unavailable, nothing
       is preselected and Confirm is disabled.
  8. `CommandPreview` via **`buildFixupCommitCommand`** in `utils/gitCommandBuilder.ts`, a thin
     wrapper over the shared `buildFixupCommitArgs`. The message shows as a placeholder
     (`-m <message>`); for amend/reword a note says the message is supplied through git's editor.
  9. Hook-wait notice with Cancel.
- The dialog is owned where `AmendCommitDialog` is (`dialogs` from `useCommitMenuItems`), and is
  rendered only while open.
- Decision logic (which kinds are enabled, preselection, confirm-enabled) lives in a **pure util**,
  e.g. `utils/fixupCommitOptions.ts`, with tests. The component only renders it.

### Telemetry

Operation events carry a fixed property set, so options are separate UI actions emitted on confirm,
the same pattern as `amendIncludeStaged`.

- `TRACKED_OPERATION_LIST`: `createFixupCommit`. `cancelFixupCommit` is a control message, not an
  operation.
- `UI_ACTIONS`:
  - menu: `createFixupCommit`;
  - on confirm: `fixupKindFixup` | `fixupKindSquash` | `fixupKindAmend` | `fixupKindReword`, plus
    `fixupIncludeAllTracked` and `fixupSquashMessage` when those are on.
- `DIALOG_IDS`: `createFixupCommit`.
- Update `telemetry.json` and the telemetry tests.

## Task 6 — Basic rebase autosquash (`RebaseConfirmDialog`)

### Backend

- **Shared pure `buildRebaseArgs({ targetRef, ignoreDate, autosquash, gitVersion })`** in
  `shared/rebaseCommand.ts`:
  - not autosquash: `rebase [--ignore-date] <ref>`, unchanged from today;
  - autosquash with `usesNonInteractiveAutosquash(version)`: `rebase --autosquash [--ignore-date]
    <ref>`;
  - otherwise: `rebase -i --autosquash --empty=drop [--ignore-date] <ref>`, with
    `needsNoOpSequenceEditor: true`.
- `GitRebaseService.rebase(targetRef, { ignoreDate, autosquash, gitVersion })` uses it. It sets
  `GIT_SEQUENCE_EDITOR: 'true'` only for the `-i` form. Conflict handling is unchanged.
- `rebase` RPC payload gains `autosquash?: boolean`. The handler passes the cached git version from
  Task 1.
- **New read RPC `getRebaseRangeCommits { upstream }` → `rebaseRangeCommits { upstream, entries }`.**
  - It runs `git log --no-merges -z --format=… <upstream>..HEAD` with `validateRefName`.
  - It is needed because `getRebaseCommits` uses `--ancestry-path` with a hash only, which returns
    nothing when the rebase target is on another branch, and the badge menu passes a ref name.
  - Extract the `%H\x1f%h\x1f%s\x1f%B` record parsing from `getRebaseCommits` so both RPCs use it.
  - The response echoes `upstream`, so the dialog ignores a stale reply.

### Webview

- `RebaseConfirmDialog` gains an **"Autosquash fixup/squash commits"** checkbox next to "Ignore
  date". It is unchecked by default, and `onConfirm` becomes `(options: { ignoreDate, autosquash })`.
  Update both callers: `useCommitMenuItems.tsx` and `BranchContextMenu.tsx`.
- **When ticked:**
  - Fetch the range once (per dialog open) and the git version.
  - Show the count ("N fixup/squash commits will be applied"), plus yellow warnings for `unmatched`
    and `ambiguousSubjects` from Task 4's `findAutosquashLinks`.
  - While loading, keep the space reserved: hidden-but-rendered, no height jump.
- `buildRebaseCommand` in `gitCommandBuilder.ts` becomes a thin wrapper over `buildRebaseArgs`, so
  the preview shows the exact version-chosen command (including `-i … --empty=drop` on older or
  unknown git).
- Telemetry: UI action `rebaseAutosquash`, emitted on confirm when ticked. Update `telemetry.json`
  and the tests.

## Task 7 — Interactive rebase: autosquash, groups, preview, message fix

- **Rename** the menu label "Start Interactive Rebase from Here" → **"Interactive Rebase onto This
  Commit"** in `useCommitMenuItems.tsx` (row and badge variants). The telemetry id
  `interactiveRebase` is unchanged.
- **`InteractiveRebaseDialog`, step 1:**
  - **Autosquash checkbox** above the list: "Autosquash fixup/squash/amend commits (N)".
    - When the entries arrive, compute `findAutosquashLinks`. If `links.length > 0`, **check it
      and apply `applyAutosquash` immediately**; otherwise the checkbox is **disabled**.
    - Keep the original entries (as received) so unchecking can call `revertAutosquash`.
    - Tooltip: unchecking returns those commits to their original place and to `pick`, and resets
      edits made to them.
  - **Group indicator:** a bracket joining each `pick`/`reword` row with the `squash`/`fixup` rows
    directly below it, derived from the current list for *all* groups. Put the derivation in a pure
    util (e.g. `utils/rebaseGroups.ts`, returning each row's position: `lead` / `member` / `last` /
    `none`) with tests. `InteractiveRebaseRow` renders the bracket from that value with theme
    tokens only.
  - **Warnings:** yellow `unmatched` and `ambiguousSubjects` warnings, from the same util as Task 6.
- **Step 2:** fix `utils/rebaseSquashMessages.ts` so that a `squash` entry whose subject starts with
  `squash! ` contributes its message **without that first line** (and the blank lines after it), as
  git does. Add tests.
- **Command Preview:**
  - Every step: `CommandPreview` at the bottom with `git rebase -i <base>`, from a new
    `buildInteractiveRebaseCommand` in `gitCommandBuilder.ts`. Never `--autosquash`.
  - Step 3 only: a read-only, monospace, multi-line "Todo list" box filled from Task 3's
    `buildRebaseTodoLines(entries)`, with the note "Messages from step 2 are supplied when git asks
    for them".
- **Paused on an empty commit** (backend + banner):
  - When a rebase stops (`REBASE_CONFLICT` path in `postRebaseResult` and `continueRebase`), and
    `getConflictInfo` finds **no conflicted files and a clean index and worktree**, the rebase
    stopped at a commit that became empty.
  - Add a flag to `RebaseConflictInfo` (e.g. `stoppedOnEmptyCommit: boolean`), set in
    `getConflictInfo`.
  - The error toast and `RebaseConflictBanner` then read "Rebase paused — git stopped at a commit
    that became empty. Continue or abort." instead of "paused due to conflict".
  - No `--empty` flag is added to the interactive rebase; pausing matches git.
- Telemetry: UI action `interactiveRebaseAutosquash`, emitted on Start when checked. Update
  `telemetry.json` and the tests.

## Task 8 — Release items

- **What's New:** add a `5.16.0` entry in `components/whatsNewEntries.tsx` that thanks
  **@nelson870708** for requesting the feature in issue #194 and covers the new fixup commit dialog
  and autosquash. **Draft it and confirm the wording and items with Eric before finalizing**; per
  `CLAUDE.md`, the maintainer decides entry content item by item.
- **CHANGELOG:** 5.16.0 entry (use the `update-changelog` skill) with the features, the rename of
  "Start Interactive Rebase from Here", the squash-message fix and the empty-commit pause message.
- **Docs:**
  - `docs/architecture.md`: every new or repurposed file from Tasks 1–7.
  - `CLAUDE.md` *Shared Logic*: `shared/gitVersion.ts`, `utils/autosquash.ts`,
    `shared/rebaseTodo.ts` and `src/services/gitEditorScripts.ts`, each with the rule it encodes.
    Examples: "unknown version fails open for UI and picks the universal form for commands";
    "autosquash matching ported from git, used by both rebase dialogs".

---

## Manual verification (Run Extension against `~/repos/test-repo`)

1. Create each fixup kind against a commit below HEAD, and confirm `git log` shows `fixup!` /
   `squash!` / `amend!` commits with the expected messages. Confirm the preview matches what ran.
2. Nothing staged: Fixup/Squash are disabled, Reword is preselected and creates an empty `amend!`
   commit.
3. Untracked file present: warning shown; the file is not in the commit.
4. Target on another branch: yellow not-an-ancestor warning.
5. Basic rebase with Autosquash, from a commit below the targets: all applied. From the target
   itself: an `unmatched` warning, and after running, the fixup remains, as git does.
6. Interactive rebase: checkbox pre-checked, rows grouped under targets, `amend!` target shows
   `reword` with the new message; uncheck restores the original order; the step 3 todo box matches
   the rows.
7. Interactive rebase that hits an empty commit: the banner shows the empty-commit wording.
8. If an old git is available (e.g. a container with git < 2.32 / < 2.44): Amend/Reword disabled
   with the version note; the basic-rebase preview shows the `-i --empty=drop` form.
