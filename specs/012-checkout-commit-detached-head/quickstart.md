# Quickstart: Testing Checkout Commit (Detached HEAD)

## Prerequisites

- VS Code with the extension built and loaded via "Run Extension" launch config
- A git repo with multiple commits open in the Speedy Git Graph panel
- Optional: a second terminal for verifying git state

## Manual Test Flow

### Story 1: Basic Checkout (Clean Tree)

1. Open the graph, ensure no uncommitted changes (`git status` should be clean).
2. Right-click any commit row **not on a branch/tag label** — the context menu should show **"Checkout this commit"** at the top.
3. Click "Checkout this commit" — a confirmation dialog appears:
   > Checkout commit `<7-char hash>` will result in detached HEAD. Continue?
4. Click **Confirm** — the dialog closes, the graph refreshes, HEAD moves to the selected commit.
5. In terminal: `git status` should show `HEAD detached at <hash>`.
6. In terminal: `git log --oneline -1` should match the selected commit.

### Story 2: Checkout with Dirty Tree (Stash Flow)

1. Make a local change to any file (don't commit or stage it).
2. Right-click a commit row → "Checkout this commit" → confirm the detached HEAD dialog.
3. A second dialog appears:
   > You have uncommitted changes. Stash them and checkout the commit?
4. Click **Stash & Checkout** — both dialogs close, graph refreshes.
5. In terminal: `git stash list` should show a new stash entry.
6. In terminal: `git status` should show `HEAD detached at <hash>`.

### Story 3: Cancel at Detached HEAD Dialog

1. Right-click a commit → "Checkout this commit".
2. Click **Cancel** — dialog closes, no changes to the repo.

### Story 4: Cancel at Stash Dialog

1. Make a local change, then right-click a commit → "Checkout this commit" → confirm detached HEAD dialog.
2. Click **Cancel** on the stash dialog — dialog closes, dirty tree preserved, no checkout performed.

### Story 5: Operation In Progress (Disabled State)

1. Trigger a long-running operation (e.g., start a rebase on a large repo).
2. While `loading` is true, right-click a commit — "Checkout this commit" should appear grayed out (disabled).

### Story 6: Right-Click on Branch/Tag Label (Exclusion)

1. Right-click on a branch label (colored pill) on a commit row.
2. The `BranchContextMenu` opens — it should NOT contain "Checkout this commit".

## Build & Run

```bash
pnpm build          # Build both extension and webview
# Then press F5 in VS Code to launch the Extension Development Host
```
