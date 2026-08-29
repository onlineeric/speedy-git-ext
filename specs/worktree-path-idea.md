# Idea Spec — Worktree Folder Path: Nested vs Flattened

**Status:** idea / requirements only. No technical design here — a separate implementation spec will be written from this document.

**Origin:** [issue #189](https://github.com/onlineeric/speedy-git-ext/issues/189) by @nelson870708 — "Preserve branch directory structure when creating worktrees".

---

## 1. Problem

Branch names commonly use `/` as a namespace separator (`feat/branch1`, `exp/20260826-test`). When Speedy Git suggests a folder for a new worktree it currently flattens that separator to `-`:

```
Branch:    exp/20260826-test
Suggested: <base>/exp-20260826-test
```

The hierarchy in the branch name is lost. A user with many worktrees ends up with a flat list of long names instead of folders that mirror how they already organise their branches.

Flattening is Speedy Git's own invention — plain `git worktree add <base>/exp/20260826-test` works and creates the intermediate folders itself. But flat is not simply wrong either: other tools deliberately flatten so the folder tree is not full of single-child directories, and users have filed the mirror-image complaint against editors that nest. **This is a preference split, not a bug**, so the product answer is to let the user choose rather than to swap one convention for the other.

The Worktree folder box in the Create Worktree dialog is already free text, so a nested path is achievable today by typing it. This feature is about the *suggestion* — what the user gets without typing — which is what matters when creating worktrees repeatedly.

---

## 2. Goals

- Let the user pick between a nested and a flattened folder for each worktree they create, at the moment they create it, seeing both concrete paths.
- Let the user's preferred convention become the default with one low-ceremony click.
- Never silently destroy a path the user typed by hand.
- Keep the dialog's existing behaviour untouched for branch names that contain no `/`.
- Keep nested folder trees tidy over time, so choosing nested does not accumulate empty directories.

## 3. Non-goals

- Moving or renaming worktrees that already exist. Nothing on disk changes; only future suggestions do.
- Changing the worktree base path feature (`speedyGit.worktree.basePath`) or its `${repoName}` expansion.
- Offering more than two conventions, or per-level control of nesting. A branch `a/b/c` yields exactly two choices: `a/b/c` or `a-b-c`.

---

## 4. The choice in the Create Worktree dialog

### 4.1 When it appears

The choice appears **only when the name the folder is derived from contains a `/`**. That name depends on the branch mode already offered by the dialog:

| Branch mode | Folder derived from | Choice shown? |
| --- | --- | --- |
| Use existing branch | the branch name | when the branch name contains `/` |
| Create a new branch | the name typed in "New branch name" | when the typed name contains `/`, live as the user types |
| Detached HEAD | the short commit hash | never — a hash has no `/` |

When no `/` is present the dialog is exactly what it is today: the label "Worktree folder" and a single text box. The group appears and disappears as the user types a `/` into the new-branch name; the dialog grows and shrinks by those rows.

### 4.2 What it looks like

With the choice hidden (unchanged from today):

```
Worktree folder
[ /home/eric/repos/speedy-git-ext.worktrees/my-feature            ]
```

With the choice shown, for branch `feat/branch1`:

```
Worktree folder
(•) Nested path    [ /home/eric/repos/speedy-git-ext.worktrees/feat/branch1  ]
( ) Flatten path   [ /home/eric/repos/speedy-git-ext.worktrees/feat-branch1  ]   ← disabled
     Use Flatten path by default
```

- Two radio options, labelled **Nested path** and **Flatten path**, each with its own text box on the same row.
- The **selected** row's box is editable — this is the existing manual-override affordance, unchanged.
- The **unselected** row's box is disabled: readable, so the user can compare the two concrete paths, but not editable.
- The path used by the "Create Worktree" button and shown in the `git worktree add` command preview is always the **selected** row's box.
- On Windows the paths render with the platform's separators.

### 4.3 Which option starts selected

From the setting `speedyGit.worktree.folderNameStyle` (`'flat' | 'nested'`), **default `nested`**.

The selection **always resets to the configured value every time the dialog opens**. It is not remembered for the session. Making a choice stick is exactly what the "Use … by default" link is for — see §6.

---

## 5. Editing a path, and switching options

### 5.1 The rule

**At most one path can hold manual edits at a time: the currently selected one.** Leaving an option always restores it to its computed default. This keeps the model simple enough to hold in your head — there is never a hidden edit sitting in the row you are not looking at.

### 5.2 Switching with no edits

If the selected box still matches its computed default, switching radios is immediate and silent. The other box becomes editable and shows its computed default; the box you left becomes disabled.

A box counts as edited only when its text **differs from the path the app computed for it**. Typing something and deleting it again leaves nothing to discard, so no prompt.

### 5.3 Switching with edits — the discard confirmation

If the selected box has been edited and the user clicks the other radio, a small confirmation appears on top of the Create Worktree dialog:

```
Discard changed path?
Your edited worktree folder will be reset to the default
for the option you are switching to.

                              [ Cancel ]  [ Discard ]
                                           default / focused
```

- **Discard** is the focused, primary action — Enter proceeds with the switch. The user switches; the option they left is reset to its computed default and the option they arrive at shows its own computed default.
- **Cancel** aborts the switch. The selection stays where it was and the edited text is preserved exactly as typed. Nothing about the radio state changes — the radio must not visibly move and then move back.
- Dismissing the confirmation (Esc, clicking away) behaves as Cancel.

Consequence of §5.1: switching away and back gives you the default, never your old edit. That is intended and is what the confirmation warns about.

### 5.4 What does *not* prompt

Changing the branch mode, or typing in "New branch name", re-derives both paths and **silently discards any manual edit**. The branch name and mode are the source of truth for the suggestion; confirming on every keystroke would be unusable. The discard confirmation exists for the radio switch alone, which is a single deliberate click.

Cancelling or closing the whole Create Worktree dialog discards everything without a prompt, as it does today.

### 5.5 Collisions

Each option's suggested path is independently checked against existing folders, with the existing numeric-suffix fallback. The two suggestions may therefore look asymmetric:

```
already on disk: <base>/feat-branch1

(•) Nested path    [ <base>/feat/branch1   ]
( ) Flatten path   [ <base>/feat-branch1-2 ]
```

This is intended: only one path will be created, and each box should show a path that is genuinely free.

The manual override box is free text and is not policed. A user who selects "Flatten path" and then types slashes into the box gets what they typed.

---

## 6. Saving the preference — the "Use … by default" link

A small link sits **below** the radio rows and their boxes.

- **Small type**, quiet styling — deliberately not a button. This is a shortcut for people who notice it, not a call to action.
- **Visible only when** the choice is shown **and** the currently selected option differs from `speedyGit.worktree.folderNameStyle`.
- Text names the style, not the path: **"Use Nested path by default"** / **"Use Flatten path by default"**.
- Clicking it writes the setting. The link then disappears, because the selection now matches the default. A VS Code notification confirms the write.
- It saves the *style only*. Any text typed into the path box is a one-off for this worktree and is never saved.

**Where it writes:** User (global) settings normally. If the setting is already defined in workspace or folder settings, it writes there instead — otherwise the workspace value would keep winning, the link would not disappear, and the click would look broken.

---

## 7. Empty parent folders

Nested worktrees leave empty parents behind. Removing `<base>/exp/branch1` deletes only `branch1`; `<base>/exp/` remains forever. Over a year of short-lived branches this accumulates.

**When Speedy Git removes a worktree, it also removes the folders that removal just emptied:**

- Walk upward from the removed worktree folder, deleting each parent that is now **strictly empty**.
- Stop **before** the configured worktree base path. The base path itself is never deleted, and the walk never goes above it.
- Only applies when the removed worktree was **inside** the configured base path. A worktree the user placed somewhere custom is left entirely alone — those are folders the app did not choose.
- Never deletes a folder containing anything at all, including hidden files.
- **Silent.** No prompt, no notification, nothing added to the remove confirmation. These are empty folders the app created; cleaning them up is housekeeping, not an action worth reporting.
- Applies to removals performed through Speedy Git only.

**Pruning stale worktrees also sweeps the base path.** When the user runs Speedy Git's Prune action (for worktrees whose folders were deleted outside VS Code), the base path is additionally swept for empty directories, bottom-up, so parents orphaned by an external deletion are cleaned up too. The base path itself is never deleted, symlinked directories are never followed or deleted, and a directory containing anything at all — including hidden files — is left alone.

A flattened worktree's parent *is* the base path, so this behaviour is automatically a no-op for users who stay on "Flatten path".

---

## 7a. Worktree folder labels in the UI

Nesting introduces an ambiguity in existing UI: worktree folders are labelled by their last path segment, so `exp/branch1` and `feat/branch1` would both display as `branch1` in the Worktrees menu and in the detached-worktree badge.

**A worktree inside the configured base path is labelled by its path below that base path**, not by its last segment:

```
Worktrees
  exp/branch1
  feat/branch1
  scratch            (flat — unchanged)
  wt                 (a worktree outside the base path — last segment, as today)
```

A worktree located outside the base path keeps the current last-segment label, since there is no meaningful path to show it relative to. Full paths remain in tooltips, unchanged.

---

## 8. Configuration summary

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| `speedyGit.worktree.folderNameStyle` | `nested`, `flat` | `nested` | Which radio is selected when the Create Worktree dialog opens |

The setting has no effect anywhere else. It does not transform paths behind the user's back, and it does nothing when the branch name has no `/`.

Existing users upgrading will see a different *suggested* path for slashed branch names. Nothing on disk moves, and no existing worktree is affected.

---

## 9. Edge cases

| Case | Behaviour |
| --- | --- |
| Branch name with no `/` | No radios, no link. Single text box, exactly as today. |
| Detached HEAD worktree | Folder comes from a short hash — no `/`, so no choice is shown. |
| Worktree from a remote branch | The new-branch name already has the remote prefix stripped (`origin/feat/x` → `feat/x`), so the choice keys off `feat/x`. |
| Deeply nested name `a/b/c` | Two options only: `a/b/c` or `a-b-c`. |
| User types `/` then deletes it | Choice appears, then disappears. Any edit made while it was shown is discarded with the recompute (§5.4). |
| Branch `exp` and branch `exp/x` both existing | Impossible — git refuses to create both. The nested scheme's worst collision case cannot arise from branches. |
| Tag `exp` plus branch `exp/x` | Possible (separate namespaces). The nested path for the tag collides with an existing folder and falls back to `exp-2` via the normal suffix rule. |
| Base path does not exist yet | Git creates the whole chain, nested or not. |
| Removing a worktree the user placed outside the base path | No parent pruning at all. |
| Removing a flattened worktree | Its parent is the base path, which is never deleted — pruning is a no-op. |

---

## 10. Telemetry

Reviewed per project policy. **No new telemetry events for this feature.** The existing Create Worktree dialog outcome tracking is unchanged. No folder style, link click, discard outcome or manual-edit signal is recorded.

---

## 11. Release notes

This release **gets a What's New entry**, thanking @nelson870708 for raising [#189](https://github.com/onlineeric/speedy-git-ext/issues/189). Wording to be drafted during the release's What's New pass.

---

## 12. Open items for the implementation spec

- How the two suggested paths are computed and collision-checked together, and how the existing path-resolution flow accommodates two answers instead of one.
- Where the nested-vs-flat naming rule lives, and how a path derived from a branch name is kept from escaping the base path once `/` is admitted into folder names.
- How the empty-parent prune is sequenced with worktree removal and what it does when a folder cannot be deleted.
- Exact layout, spacing and control styling within the dialog's existing conventions.
