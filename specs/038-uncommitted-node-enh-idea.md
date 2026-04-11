# Uncommitted Node Enhancements Idea

## Overview

We already implemented uncommitted node display on graph and related features. Now we need to enhance it.

## Enhancements for Uncommitted Node

1. On right-click menu, rename "Stash All Changes" to **"Stash Everything…"** (note the ellipsis). Reason: the original label looked too similar to "Stage All Changes" and confused users. When clicked, it must pop up a confirmation dialog with:
    - A text input for the stash message.
    - A "Stash" action button and a "Cancel" button.
    - This makes the intent unambiguous and gives users a chance to back out if they misclicked.
    - **Reuse the existing `StashDialog` component** (`webview-ui/src/components/StashDialog.tsx`) — it already provides exactly this layout (title, description, optional message input, `CommandPreview`, Cancel + Stash buttons). The only change needed is to update the dialog title from "Stash All Changes" to "Stash Everything".
2. On commit details panel, **only for the uncommitted node**, the Stage / Unstage arrow button next to each file should be always displayed, even if the mouse is not hovering on the file line. Other action icons (Copy path, Open file, Open current version) remain hover-only as they are today. This rule applies only to the uncommitted node; regular commits are unchanged (they don't have stage/unstage arrows anyway).
3. On commit details panel for the uncommitted node, remove the "Open file at this commit" icon button. Reason: for the uncommitted node it behaves identically to "Open current version", so it is redundant. On regular commits the button remains unchanged. Implementation note: the button is rendered unconditionally in `FileChangeShared.tsx` (~line 158) — the fix is to gate it on `commitHash !== UNCOMMITTED_HASH` so only the uncommitted-node case loses the button; all other commits are unaffected.

## Enhancements on "Select files for..." dialog

The dialog has 2 sections: a multi-select files section and an action buttons section. This change only affects the action buttons section — it is replaced by a radio-group + single action button layout.

### Radio options

Four radio buttons, one per line:
1. **Stage** — applies to selected *unstaged* files.
2. **Unstage** — applies to selected *staged* files.
3. **Discard** — applies to selected *unstaged* files.
4. **Stash with message** — applies to *all* selected files (both staged and unstaged). This row occupies two lines: the radio on the first line, and a text input field for the stash message on the second line.

Each radio row displays a developer-friendly git command preview next to the label, so users can see exactly what will run.

### Action button / Close button

Two buttons at the bottom:
- A single **action button** whose label and behavior change based on the selected radio.
- A **Close** button.

The action button label follows the pattern `<ActionName> (<count>)` where `<count>` is the number of files that the selected action will actually affect:
- **Stage (N)** — N = number of selected *unstaged* files.
- **Unstage (N)** — N = number of selected *staged* files.
- **Discard (N)** — N = number of selected *unstaged* files.
- **Stash (N)** — N = total number of selected files (staged + unstaged).

Example: with 2 unstaged and 3 staged files selected, the action button reads `Stage (2)`, `Unstage (3)`, `Discard (2)`, or `Stash (5)` depending on the selected radio.

### UI layout sketch
```
(x) Stage     [command preview] [copy button]
( ) Unstage   [command preview]
( ) Discard   [command preview]
( ) Stash with message   [command preview]
    Stash message: <text input field>
--------------------------------
<action button> <close button>
```

### UI / behavior rules

**Command preview and copy button**
- Every radio row shows its command preview, including unselected and disabled rows.
- For disabled rows, the preview is rendered greyed out.
- Only the **selected** row shows the copy button next to its command preview.
- Reuse the existing `CommandPreview` component rather than building a new one. The component must be enhanced with:
    - A prop to hide the copy button (e.g., `showCopyButton?: boolean`, default `true`).
    - A prop to hide the "Command preview:" label (e.g., `showLabel?: boolean`, default `true`), since the radio label already identifies each row.

**Radio enable/disable rules (based on the file selection in the upper section)**
- No file selected → all four radios disabled.
- Only unstaged files selected → `Unstage` disabled; `Stage`, `Discard`, `Stash` enabled.
- Only staged files selected → `Stage` and `Discard` disabled; `Unstage` and `Stash` enabled.
- Mixed selection → all four enabled.
- `Stash` is enabled whenever at least one file is selected.

**Default selected radio**
- If `Stage` is available → default to `Stage`.
- Else if `Unstage` is available → default to `Unstage`.
- (Because `Stage` or `Unstage` is always available whenever any file is selected, one of them will always be the default.)
- When nothing is selected, no radio is selected.

**Stash message input field**
- Disabled when the `Stash` radio is not selected.
- If the user clicks the disabled text input, auto-select the `Stash` radio and enable the field (so the click feels natural).
- The message is **optional**. If left empty, auto-generate a stash message in the format `Stash of <N> files from <branch>` (e.g., `Stash of 5 files from dev`). No matching helper exists in the codebase today, so a small utility should be added (e.g., `buildDefaultStashMessage(fileCount, branchName)` in `webview-ui/src/utils/`).

**Action button visibility**
- Hide the action button entirely when no radio is selected (i.e., when no files are selected). Only the Close button is shown in that state.

### Stash edge cases (resolve now)

- **Untracked files**: When the user selects untracked files and runs Stash, first `git add` those untracked paths so they become trackable, then stash them along with the rest. The end result is that untracked files participate in the stash just like modified files. (Alternative of passing `-u` only works for "stash everything untracked", not a selected subset, so the add-then-stash flow is required for selective stashing.)
- **Renamed files**: `git stash push -- <pathspec>` does not handle renames cleanly when only one side of the rename is in the pathspec. Decision: **when the Stash action runs, always include all renamed files in the stash**, even if they were not selected in the upper section. This avoids broken half-rename stash entries. Show an **inline info text** under the Stash radio row (always visible whenever any renamed files exist in the uncommitted set), wording along the lines of: *"Note: renamed files are always stashed as a pair and cannot be partially selected."*

### Discard confirmation dialog

Reuse `DiscardAllDialog` for the per-file discard confirmation too, but parameterize it so the caller can override the hardcoded text. Extend its props with optional `title`, `description`, and `confirmLabel` overrides (defaulting to the current "Discard All Unstaged Changes" wording for backward compatibility). For the `FilePickerDialog` discard flow, pass a message that reflects the selected file count and untracked count, e.g.:

- Title: `Discard Selected Changes`
- Description: `This will permanently discard <N> file(s).` plus, if any are untracked, append `<M> untracked file(s) will be permanently deleted. This cannot be undone.`
- Confirm label: `Discard (N)`

This keeps a single dialog component and avoids creating a near-duplicate.
