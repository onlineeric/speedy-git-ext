# Quickstart: Uncommitted Node UX Polish

Manual validation walkthrough. Follow top-to-bottom on a working tree that has
a mix of file kinds. A convenient setup script is included at the end.

## Prerequisites

```bash
pnpm install
pnpm build
# In VS Code, launch "Run Extension (Watch)" from .vscode/launch.json
```

Open a repo with a working tree that contains at least:

- 2 unstaged modified files
- 2 staged modified files
- 1 untracked file
- 1 renamed file
- (Optional) 1 dual-state file (staged + re-edited in working tree)

See the **Setup script** at the bottom of this file for one way to produce
that state deterministically.

## Story 1 — "Select files for…" dialog overhaul (P1)

1. Right-click the uncommitted node → **Select files for…** → dialog opens.
2. **No selection**:
   - All four radios are disabled, none selected.
   - Only the **Close** button is visible at the bottom (no action button).
   - (Verifies FR-011, FR-024.)
3. Select **only unstaged** files:
   - `Stage`, `Discard`, `Stash` are enabled; `Unstage` is disabled.
   - `Stage` is selected by default.
   - Action button label shows `Stage (<N>)` where `<N>` matches the selected unstaged count.
   - (Verifies FR-012, FR-016, FR-019/FR-020.)
4. Select **only staged** files:
   - `Unstage`, `Stash` are enabled; `Stage`, `Discard` are disabled.
   - `Unstage` is selected by default.
   - Action button label shows `Unstage (<N>)`.
   - (Verifies FR-013, FR-017, FR-021.)
5. Select **2 unstaged + 3 staged** files:
   - All four radios are enabled.
   - Cycle through the radios and confirm label updates:
     - `Stage (2)`, `Unstage (3)`, `Discard (2)`, `Stash (5)`.
   - (Verifies FR-014, FR-019 – FR-023.)
6. **Dual-state file alone**: select a single file that has both staged and
   unstaged changes.
   - All four radios are enabled.
   - `Stage (1)`, `Unstage (1)`, `Discard (1)`, `Stash (1)`.
   - (Verifies FR-015a.)
7. **Every row shows its command preview**, even disabled rows (greyed out on
   disabled rows). Only the currently selected row has a copy button. (FR-025 – FR-027.)
8. **Stash message input**:
   - With the Stash radio not selected, the input is disabled.
   - Click the disabled input → the Stash radio auto-selects and the input
     becomes editable and focused. (FR-029, FR-030.)
9. **Empty message auto-fill**: With Stash selected, leave the message blank,
   click the action button → stash is created with the auto-generated message
   `Stash of <N> files from <branch>`. Verify by opening the stash list.
   (FR-031, FR-032.)
10. **Untracked in selective stash**:
    - Include the untracked file in the selection, select Stash, click the
      action button.
    - The Stash row preview should show the `&&`-joined form:
      `git add -- <paths> && git stash push -m "<msg>" -- <paths>`
      (FR-028a.)
    - After success, apply the stash — the untracked file reappears in the
      working tree. (SC-004.)
    - The copy button on the Stash row copies the exact `&&`-joined string.
      Paste into a terminal as a sanity check. (FR-028c.)
11. **Renamed files**: with a renamed file present in the uncommitted set,
    open the dialog. The Stash row shows an always-visible inline note:
    *"Note: renamed files are always stashed as a pair and cannot be
    partially selected."* Run Stash with a selection that excludes the
    renamed file. Inspect the resulting stash entry — both sides of the
    rename are present. (FR-034, FR-035, SC-005.)
12. **Discard confirmation** (per-file scope): select 2 files (1 untracked +
    1 modified), pick Discard, click the action button.
    - Confirmation dialog title: `Discard Selected Changes`.
    - Description mentions 2 files AND 1 untracked file will be permanently
      deleted. (FR-037, FR-038.)
    - Confirm button label: `Discard (2)`. (FR-039.)
    - After confirm, files are discarded. The dialog stays open and refreshes.
13. **Busy state**: click the action button and watch the button label switch
    to a spinner + "Working…", the file-list checkboxes and radio group go
    disabled, and the **Close** button remains enabled. (FR-I01 – FR-I03.)
14. **Failure path**: force a failure (e.g., create a file whose path can't
    be staged due to .gitignore interactions, OR temporarily corrupt the
    index to trigger a real git error). The dialog stays open with selection
    and radio preserved, an inline error banner appears at the top, and the
    error includes the raw git message. For the add-then-stash case, the
    banner names which step failed and the current tree state. (FR-F01 – FR-F03.)
15. **Post-success refresh**: after any successful action, the dialog stays
    open and the file list refreshes. The user's file selection is
    **preserved** (pruned only for paths that no longer exist), so they can
    immediately run another action on the same set — e.g. Stage a subset,
    then click the (now-auto-selected) **Unstage** radio to undo, without
    re-ticking any checkbox. Paths that disappear after a Discard/Stash are
    silently dropped. (FR-P01, FR-P02.)

## Story 2 — "Stash Everything…" confirmation (P2)

1. Right-click the uncommitted node. Verify the menu item labeled
   **Stash Everything…** (with trailing ellipsis), not "Stash All Changes".
   (FR-001, SC-001.)
2. Click it → the existing `StashDialog` opens with title "Stash Everything".
3. Cancel → nothing happens, working tree unchanged. (FR-003.)
4. Open again, type a message, click Stash → the entire working tree is
   stashed with that message. (FR-002, SC-007.)

## Story 3 — Always-visible stage/unstage arrow (P3)

1. Open the uncommitted node → details panel renders.
2. Without hovering any row, confirm the stage/unstage arrow is visible on
   every file row. (FR-004, SC-006.)
3. Without hovering, the copy-path / open-file / open-current icons remain
   hidden. (FR-006.)
4. Select a regular commit (non-uncommitted) → file-row icon behavior is
   unchanged from the previous version (all icons are hover-only). (FR-007.)

## Story 4 — Redundant "Open file at this commit" icon (P4)

1. On the uncommitted node, confirm the "Open file at this commit" icon is
   absent from every file row. (FR-005, SC-008.)
2. On any regular commit, confirm the icon is still present and still opens
   the file at that commit. (FR-007.)

## Validation gates

After manual testing, run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

All four MUST pass cleanly per constitution "Build & Validation Gates".

## Setup script (optional, deterministic working-tree state)

```bash
# From a scratch repo:
echo 'A' > unstaged-a.txt
echo 'B' > unstaged-b.txt
echo 'C' > staged-a.txt
echo 'D' > staged-b.txt
git add staged-a.txt staged-b.txt

# dual-state: stage then re-edit
echo 'DS' > dual.txt
git add dual.txt
echo 'DS-edited' >> dual.txt

# untracked
echo 'U' > untracked.txt

# renamed
echo 'R' > will-rename.txt
git add will-rename.txt
git commit -m 'seed for 038 test' || true
git mv will-rename.txt renamed.txt
```
