# Uncommitted Node Features Idea

## Overview

We already implemented uncommitted node display on graph. Now we need to implement all related features: context menu operations, staged/unstaged separation in the details panel, and per-file actions.

## Context Menu Features

On right-click of the uncommitted node, show the following:

- **Stash all changes** — confirm dialog with message input
- **Stage all changes** — only if there are unstaged changes, confirm dialog
- **Unstage all changes** — only if there are staged changes, confirm dialog
- **Discard all changes** — confirm dialog (destructive, should warn clearly)
- **Select files for...** — opens a multi-select file picker dialog, with action buttons: Stage, Unstage, Stash, Discard. User selects files first, then picks the action.
- **Open Source Control Panel** — opens VS Code / Cursor native Source Control panel

## Commit Details Panel

### Sections

When the uncommitted node is selected, the details panel splits file changes into separate sections:

**Normal state (no conflicts):**
1. **Staged Changes** (X files staged)
2. **Unstaged Changes** (X files changed)

**Conflict state (mid-merge, mid-rebase, mid-cherry-pick):**
1. **Merge Conflicts** (X files)
2. **Staged Changes** (X files staged)
3. **Unstaged Changes** (X files changed)

- Untracked files appear in the **Unstaged Changes** section. Staging an untracked file adds tracking and stages it.
- Only the top section header has the 2 view buttons (list/tree), which control all sections.

### Section Header Actions

Each section header includes a bulk action button:
- **Staged Changes** header → "Unstage All" button
- **Unstaged Changes** header → "Stage All" button
- **Merge Conflicts** header → no action buttons (user resolves conflicts in VS Code native windows)

### Per-File Action Buttons

Next to the existing 3 buttons (copy path, open file in this version, open file in current version):

- **Staged files**: Add an **unstage button** (down arrow icon) to unstage the file
- **Unstaged files**: Add a **stage button** (up arrow icon) to stage the file, and a **discard button** (trash/revert icon) to discard changes. Discard requires confirmation.
- **Conflict files**: Only show an **open file button** — no stage/unstage/discard. User should resolve conflicts entirely through VS Code's native merge editor and Source Control panel.

### File Content Behavior

- The "open file in this version" button for **staged files** should open the staged version, not the working tree version.

## Merge Conflict Handling

The extension only **displays** conflict state — it does **not** handle any conflict resolution actions:
- No "Continue Merge/Rebase/Cherry-Pick" actions
- No "Abort Merge/Rebase/Cherry-Pick" actions
- No "Mark as Resolved" actions
- Conflict files only have an "open file" button to let users resolve in VS Code natively
- Detection: backend checks for `.git/MERGE_HEAD`, `.git/REBASE_HEAD`, or `.git/CHERRY_PICK_HEAD`, and lists conflicted files via `git diff --name-only --diff-filter=U`

## Implementation Notes

### New Backend RPC Messages

The following RPC message types do not exist yet and must be added:
- `stageFiles` / `unstageFiles` — stage or unstage specific files (supports both single and batch)
- `stageAll` / `unstageAll` — stage or unstage all changes
- `discardFiles` / `discardAll` — discard changes for specific files or all
- `stashChanges` — stash all changes with an optional message
- `getConflictState` — detect if repo is in a conflicted state and list conflicted files

### Auto-Refresh

After any staging/unstaging/stashing/discarding operation, the uncommitted node's summary text and details panel must refresh immediately. Verify that `GitWatcherService` filesystem watching provides snappy UX, or trigger explicit refresh after operations.

### Dialogs

All dialogs should show developer-friendly command-line preview (consistent with existing dialogs using `CommandPreview` component).

### No Drag-and-Drop

Files cannot be dragged between staged/unstaged sections.
