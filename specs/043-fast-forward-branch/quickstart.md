# Quickstart — Manual smoke test

**Feature**: Fast-forward Local Branch from Remote
**Branch**: `043-fast-forward-branch`
**Date**: 2026-05-08

This is the manual validation path the developer should walk after implementation, before declaring the feature complete. It complements `pnpm typecheck` / `pnpm lint` / `pnpm build` and the unit tests; those gates are listed at the bottom.

## Prerequisites

1. A local clone of any repo with at least one remote configured (`origin`).
2. At least two local branches (e.g., `main`, `dev`).
3. The remote tip of one local branch is **ahead** of the local copy. To set this up deterministically using the test repo, see step 0.

### Step 0 — Set up a behind-branch fixture (optional, repeatable)

```bash
# In a scratch repo or a dedicated test repo:
git checkout dev
git checkout -b feature-x
# make a commit, then push it
git commit --allow-empty -m "remote-only commit" && git push -u origin feature-x
# back to dev, then advance feature-x on the remote one more time
git checkout dev
git push origin dev:feature-x   # adds another commit to remote feature-x
# now reset the local feature-x to be one commit behind the remote
git fetch origin
git update-ref refs/heads/feature-x refs/heads/feature-x@{1}
```

Local `feature-x` is now behind `origin/feature-x`. Currently checked-out branch is `dev`.

## Happy path — fast-forward a non-checked-out, behind, local branch

1. Launch the extension: VS Code → Run and Debug → "Run Extension" (from `.vscode/launch.json`).
2. In the Extension Development Host, open the test repo and run **Speedy Git: Show Graph** (or click the toolbar icon).
3. Wait for the graph to load. Verify both `dev` (current) and `feature-x` badges are visible.
4. Right-click the **`feature-x`** badge.
5. **Verify**: the menu shows **"Fast-forward Local Branch from Remote"** between the existing branch actions.
6. Click it. **Verify**: the dialog opens with:
    - Title: "Fast-forward Local Branch from Remote" (or equivalent).
    - Body: a sentence explaining that the local branch will be updated to the remote tip without checkout.
    - Command preview: `git fetch origin feature-x:feature-x`.
    - Confirm and Cancel buttons.
7. Click **Confirm**. **Verify**:
    - A success toast appears (e.g., "Fast-forward completed").
    - The `feature-x` badge moves up the graph to the remote tip (or the graph reloads with the new ref).
    - The current branch indicator stays on `dev`.
    - No stash entry was created (open the stash list to confirm — it is unchanged).
    - The working tree is unchanged (`git status` outside the host shows no modifications).

## Cancel path

1. Repeat steps 1–4 above on a fresh stale `feature-x`.
2. Open the dialog, then click **Cancel**.
3. **Verify**: the dialog closes, no fetch is performed, the graph state is unchanged, no toast appears.

## Visibility — option appears only on the right badges

Open each of the following badge contexts via right-click and verify presence/absence of the menu item:

| Badge context                                 | Menu item should… |
|-----------------------------------------------|-------------------|
| Local-only branch badge (no matching remote)  | Appear            |
| Merged-branch badge (local + remote, same name) | Appear          |
| Currently checked-out local branch            | NOT appear        |
| Remote-only branch badge                      | NOT appear        |
| Tag badge                                     | NOT appear        |
| Stash badge                                   | NOT appear        |
| Uncommitted-changes node                      | NOT appear        |

## Error paths

### A — Remote ref doesn't exist (local-only branch)

1. Create a local branch with no matching remote (`git checkout dev && git checkout -b ghost-branch`).
2. In the graph, right-click the `ghost-branch` badge.
3. **Verify**: menu item still appears (per spec Q1 "always show in local-branch context").
4. Click it, confirm the dialog. **Verify**: an error toast surfaces git's message (e.g., `fatal: couldn't find remote ref refs/heads/ghost-branch`). Local branch `ghost-branch` is unchanged.

### B — Diverged branch (non-fast-forward)

1. Have a local branch ahead of the remote on at least one commit, while the remote is also ahead on a different commit (true divergence).
   - One way: `git checkout feature-x && git commit --allow-empty -m "local-only" && git checkout dev`, then in another clone advance origin/feature-x.
2. Right-click the `feature-x` badge, confirm the dialog.
3. **Verify**: an error toast surfaces git's rejection (`! [rejected] feature-x -> feature-x (non-fast-forward)`). Local `feature-x` is unchanged. No force option is offered.

### C — Network failure

1. Disconnect network or set an unreachable remote URL.
2. Trigger the action.
3. **Verify**: error toast surfaces git's network/auth error. Local branch unchanged. UI is not stuck in a loading state.

## Multi-remote disambiguation

1. Add a second remote (`git remote add upstream <url>`); fetch it so `upstream/feature-x` shows up in the graph.
2. Open the dialog on `feature-x`.
3. **Verify**: command preview shows `git fetch origin feature-x:feature-x` (origin is preferred over upstream — spec FR-008). No remote-picker UI appears.
4. Confirm. **Verify**: success toast, branch advances.

## No-op (already up to date)

1. Ensure `feature-x` local already matches `origin/feature-x`.
2. Trigger the action and confirm.
3. **Verify**: success toast, no branch movement, no error.

## Concurrent-operation guard

1. Trigger a long-running operation that sets `loading` or `rebaseInProgress` (e.g., start an interactive rebase but don't finish).
2. While that is active, open the context menu on a local branch.
3. **Verify**: the "Fast-forward Local Branch from Remote" item does not appear, or is disabled (per FR-009).

## Automated gates

After manual smoke passes, run from repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All four MUST exit clean before declaring the feature ready for review.
