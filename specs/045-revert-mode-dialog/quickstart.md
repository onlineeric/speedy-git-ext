# Quickstart — Manual smoke test

**Feature**: Revert Commit dialog with mode selection
**Branch**: `045-revert-mode-dialog`
**Date**: 2026-05-22

This is the manual validation path to walk after implementation, before declaring the feature complete. Complements the unit-test suite and the automated gates listed at the bottom.

## Prerequisites

1. A local clone of any repo with several commits, including:
   - At least one non-merge, non-root commit suitable for reverting cleanly.
   - At least one merge commit (so the parent picker can be exercised).
   - At least one commit whose changes are already overridden by a later commit (so the empty-revert path can be exercised). Optional but useful.
2. A clean working tree at the start of each test.

## Happy path A — Commit now mode (replicates today's behavior)

1. Launch the extension: VS Code → Run and Debug → "Run Extension".
2. In the Extension Development Host, open the test repo and run **Speedy Git: Show Graph**.
3. Right-click a non-merge commit a few rows below `HEAD`.
4. **Verify**: the menu shows **Revert Commit** (enabled).
5. Click it. **Verify** the dialog:
   - Title: `Revert Commit`.
   - Commit summary: `<abbrev-hash> — <subject>`.
   - Three radio buttons in this exact order: **Commit now** (selected), **Stage only**, **Edit message**. Each label shows description first, then the git flag in muted/mono style.
   - No mainline-parent picker (non-merge commit).
   - Command preview: `git revert --no-edit <abbrev-hash>`. Copy button works.
   - Cancel + Revert buttons.
6. Click **Revert**.
7. **Verify**: a success toast appears; the graph refreshes with a new revert commit on top of the current branch. The commit message is `Revert "<subject>"`.

## Happy path B — Stage only mode

1. From a clean working tree, repeat steps 1–4 above on a different non-merge commit.
2. Switch the radio to **Stage only**.
3. **Verify**: command preview updates to `git revert --no-commit <abbrev-hash>`.
4. Click **Revert**.
5. **Verify**:
   - A success toast indicating the inverse changes are staged.
   - The graph does **not** show a new commit.
   - The VS Code Source Control panel shows the inverse changes as staged.
   - Switching to a terminal: `git diff --cached` shows the inverse of `git show <hash>`.
6. Commit manually from the SCM panel (or run `git commit -m "my custom message"` in the terminal).
7. **Verify**: the new commit now appears on the graph after a refresh.

## Happy path C — Edit message mode

1. From a clean working tree, repeat steps 1–4 on a different non-merge commit.
2. Switch the radio to **Edit message**.
3. **Verify**:
   - A multi-line text area appears, pre-filled with:
     ```
     Revert "<subject>"

     This reverts commit <full-40-char-hash>.
     ```
   - Command preview updates to `git revert <abbrev-hash>` (no flag).
4. Replace the text with: `Revert PR #42 — broke checkout in WSL`.
5. Click **Revert**.
6. **Verify**: success toast; a new commit appears on top of the current branch with the exact message you typed. The diff is the inverse of the selected commit.

### Empty-message validation

1. Re-open the dialog, switch to **Edit message**, and select-all + delete the text in the area (so it's empty).
2. **Verify**: the **Revert** button is disabled.
3. Type a single non-whitespace character. **Verify**: button enables. Replace with only whitespace (spaces, newlines). **Verify**: button disables again.

## Merge-commit path — all three modes inline the parent picker

1. Right-click a merge commit.
2. **Verify**: the dialog now shows a mainline-parent radio group between the commit summary and the mode radios. Parent commits are listed `Parent 1: <abbrev> — <subject>` etc.
3. Until a parent is picked, the **Revert** button is disabled (regardless of mode selected).
4. Pick `Parent 1`. **Verify**: button enables and command preview becomes `git revert -m 1 --no-edit <abbrev-hash>` (Commit now) / `git revert -m 1 --no-commit <abbrev-hash>` (Stage only) / `git revert -m 1 <abbrev-hash>` (Edit message).
5. Confirm with each mode in turn (use three different merge commits or reset between attempts).
6. **Verify** each outcome matches Happy paths A/B/C, with the merge inverse applied.

## Visibility — menu item appears on the right contexts

| Commit context                                | Menu item should… |
|-----------------------------------------------|-------------------|
| Regular non-merge commit                      | Appear, enabled  |
| Merge commit                                  | Appear, enabled  |
| Root commit (no parents)                      | NOT appear       |
| Stash pseudo-commit                           | NOT appear       |
| Uncommitted-changes node                      | NOT appear       |

(Same gates as today's flow.)

## Persistence — last-used mode is remembered

1. Open the dialog, switch to **Stage only**, confirm. Wait for success.
2. Open the dialog on a different commit.
3. **Verify**: **Stage only** is pre-selected.
4. Reload the extension (close + reopen the Extension Development Host).
5. Open the dialog.
6. **Verify**: **Commit now** is pre-selected (state is session-only by design).

## Cancel & Escape

1. Open the dialog. Click **Cancel** → dialog closes; no toast; no graph change.
2. Open again. Press `Esc` → dialog closes; no toast; no graph change.
3. Open again. Click outside the dialog (on the overlay) → dialog closes; no toast; no graph change.

## Keyboard-only flow (SC-006)

Verify a developer can complete the default revert without touching the mouse, in ≤10 keystrokes for the most common path:

1. Focus a commit row in the graph (e.g., via Tab navigation from the toolbar; depending on graph focus behavior, focusing the row may not be possible — in that case start with the commit selected via prior mouse click but DO NOT use the mouse from this point on).
2. Press `Shift+F10` (or the context-menu key) to open the commit context menu. **Verify** the menu opens with focus on the first item.
3. Use `↓` arrows to navigate to **Revert Commit**, press `Enter`.
4. **Verify** the dialog opens with the keyboard focus on the **Commit now** radio (or on the first interactive element per Radix Dialog default).
5. Press `Tab` until the **Revert** button is focused (skip the radio group since Commit-now is the default). Press `Enter`.
6. **Verify** the revert completes — success toast appears, graph refreshes.

The default flow (steps 2 → 3 → 5 → 6) is approximately 4–6 keystrokes for a non-merge commit with the default mode pre-selected. Mode-switching adds `↓`/`↑` keystrokes within the radio group.

Repeat for **Stage only** (insert one `↓` after step 4 to move to the second radio, then `Tab` to Revert) and **Edit message** (two `↓` arrows, then `Tab` to the textarea to type, then `Tab` to Revert). **Verify** total keystrokes for each flow stay within reasonable bounds for the spec's "operable without mouse" intent.

## Error paths

### A — Dirty working tree (strict for all three modes per Q1)

1. Make an uncommitted edit to any file (do NOT stage it). `git status` shows the change.
2. Open the dialog on any commit, select **Commit now**, confirm. **Verify**: error toast says "Working tree has uncommitted changes…". No revert happens.
3. Repeat with **Stage only**. **Verify**: same error toast — strict policy applies equally.
4. Repeat with **Edit message** (after typing a message). **Verify**: same error toast.

### B — Empty revert (target commit's changes already absent)

1. Find or create a commit whose changes are subsequently undone by a later commit on the same branch.
2. Try **Commit now** on the target. **Verify**: error toast "This commit introduces no changes relative to the current branch. The revert is already present."
3. Repeat with **Stage only** and **Edit message**. **Verify**: same error toast for both. In **Edit message** mode, the typed message is NOT lost (the dialog re-opens with the message preserved, OR the user has the message in their clipboard from the dialog's text area).

### C — Conflict on Commit now mode (existing flow)

1. Construct a setup where reverting a commit conflicts with the current branch tip (e.g., a later commit modifies the same lines).
2. Right-click the target, **Commit now**, confirm.
3. **Verify**:
   - Error toast surfaces the conflict.
   - `git status` from a terminal shows `REVERT_HEAD` set and conflicted files.
   - Right-clicking ANY commit now shows **Continue Revert** and **Abort Revert** items on the menu.
4. Resolve conflicts in the SCM panel, stage them.
5. Click **Continue Revert** from the menu. **Verify**: a new revert commit appears; menu items go away.

### D — Conflict on Stage only mode (no recovery flow)

1. Same setup as C, but choose **Stage only**.
2. **Verify**:
   - Error toast says conflicts must be resolved in the SCM panel and committed manually.
   - `git status` from a terminal shows conflicted files but **no** `REVERT_HEAD`.
   - The commit-context menu does **NOT** show Continue Revert / Abort Revert.
3. Resolve manually (edit conflict markers, stage, commit). **Verify**: lifecycle is purely SCM-driven from this point.

### E — Conflict on Edit message mode (no recovery flow)

1. Same setup, choose **Edit message**, type a message, confirm.
2. **Verify**: same as D — error toast, no `REVERT_HEAD`, no Continue/Abort items.
3. Manual resolution via SCM. The user's typed message is on their clipboard / in the closed dialog only; the spec does not require automatic re-population (FR-012's "not lost silently" means the message text is visible in the (failed) dialog and the user can copy it before dismissing).

### F — Another operation in progress

1. Start an interactive rebase but don't finish (or have a cherry-pick paused).
2. Right-click a commit, open the dialog (any mode), confirm.
3. **Verify**: error toast says another git operation is already in progress. No revert happens.

## Automated gates

After all manual smoke tests pass, run from repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All four MUST exit clean before declaring the feature ready for review.
