# Idea Spec — Multiple Speedy Git Editor Tabs

**Status:** Product idea and requirements. A separate technical implementation spec will define the implementation.

**Date:** 2026-09-08

**Origin:** [GitHub issue #195 — Open multiple git graph tabs in one window](https://github.com/onlineeric/speedy-git-ext/issues/195), requested by @jinho9265.

## 1. Problem and reason

Speedy Git currently provides one graph per VS Code window. Opening it again returns to that graph. Users cannot keep separate investigations open or view a parent repository alongside its submodule without repeatedly changing the graph's repository and view context.

The issue requests multiple editor tabs with independent repository selection, filters, search, layout and scroll state. It specifically identifies parent/submodule and multi-root workspace workflows, correct repository-specific diffs and refreshes, and session-only tabs.

This proposal extends that idea: multiple tabs may show the same repository or submodule. One tab can explore a release branch while another searches development history. These are independent views of the same Git state, not separate checkouts.

## 2. Product decisions

- Use native VS Code editor tabs, with one Speedy Git graph in each.
- Allow any combination of supported repositories and submodules, including repeated views of the same repository or worktree.
- Preserve the existing Open Speedy Git action as a way to return to an existing graph.
- Provide an **Open New Graph Tab** icon button in the graph's top toolbar, next to the **Go to HEAD** button. It opens immediately; no repository-selection step is required.
- The toolbar button is the primary entry point for creating additional graphs. A Command Palette equivalent is optional, not required by this idea spec.
- Let VS Code handle tab closing, movement and side-by-side arrangement. No internal tab bar or dedicated Open to the Side action is needed.
- Allow all graph tabs to be closed. There is no minimum tab count.
- Keep the collection of open graph tabs session-only.

## 3. Goals and scope

Users can keep several investigations open, compare repositories visually using editor groups, and explore the same repository with different criteria. Each view preserves its own investigation context while reflecting changes to the underlying repository.

The familiar single-tab workflow remains available without additional steps. Creating additional tabs is explicit, so repeatedly using the existing opening action does not accumulate duplicates.

Out of scope:

- An internal Speedy Git tab bar or custom split-view system.
- Restoring the collection of graph tabs and their investigations after a VS Code window reload or restart.
- Giving two views of the same working tree independent checked-out branches.
- Combining histories from different repositories into one graph or adding cross-repository comparison operations.
- A custom tab-closing control or a requirement to retain one graph.

## 4. Opening, returning and closing

### Existing Open Speedy Git action

When no graph is open, open the first graph using the current initial repository selection and saved-default behavior.

When graphs are already open, return to the most recently active Speedy Git tab in that VS Code window. Preserve its repository, investigation state and editor-group placement. Merely returning to it must not retarget its repository based on another editor or repository selection elsewhere.

If the most recently active graph has closed, return to the most recently active remaining graph. If that ordering is unavailable, revealing any remaining Speedy Git graph is an acceptable fallback. Create a new graph only when none remains.

This return behavior applies to existing entry points whose purpose is opening Speedy Git.

### Open New Graph Tab toolbar button

Place an icon button next to Go to HEAD in every graph's top toolbar. Give it the tooltip and accessible name **Open New Graph Tab** so its purpose is clear without a text label.

Each click creates and focuses another native editor tab. Use the same initial repository-selection rules as opening the first graph, with no intermediate picker, confirmation or requirement to select a different repository.

The button creates a fresh investigation using normal initial defaults; it is not a duplicate-view action that promises to copy another tab's filters, search or scroll position. Users can change the repository and view criteria inside the new tab.

### Close and arrange

Users close a graph through the normal VS Code editor-tab close action. Closing one graph leaves all other graphs and their investigations intact. Closing the last graph is allowed; the next ordinary Open action creates a graph normally.

Users arrange graphs side by side using VS Code's normal editor-group controls or by dragging tabs. Speedy Git does not add its own arrangement workflow.

Closing a graph is not an instruction to undo repository changes or cancel a Git operation that has already started. Any operation still in progress must remain accurately represented in surviving affected views.

## 5. Product architecture and state ownership

The product has three scopes: an individual graph view, the Git state it displays, and extension-wide preferences. This describes user-visible ownership, not implementation components.

| Scope | Responsibility |
| --- | --- |
| Graph tab | Selected repository/submodule, branch and other filters, search, selected commit, comparison selection, details-panel view, column layout and scroll position |
| Repository or working tree | Actual branch/HEAD state, refs, working-tree changes, staged changes, stashes and ongoing Git operations, as applicable to that Git context |
| Extension preferences and account | Existing shared settings, theme behavior, consent and avatar authorization; opening another tab does not create another account or preference scope |

Changing view state in one tab must not change another open tab's view state, including another tab showing the same repository. Repository switching and submodule navigation apply only to the initiating tab.

Saved preferences may seed a new view, but live investigations remain independent. The technical spec must define how saved defaults are updated without making multiple open tabs compete over the same preference. Existing single-tab preference persistence must remain useful; session-only tabs do not mean discarding all existing saved settings.

## 6. Shared Git state and refresh behavior

After an operation changes repository state, all open views whose displayed data is affected must reflect the result. This includes checkout, creating or deleting tags, moving branches, fetch/pull, history changes, staging and other supported mutations. Changes made through terminals, VS Code or other tools must also become visible.

Visible affected views should update promptly without a manual refresh. Hidden views may defer loading, but must catch up when shown. Unrelated repositories should not reload merely because another tab performed an operation.

Affected views are not limited to exact repository matches: a submodule change may affect its parent's displayed status, and related worktrees may share branch or other repository state. Refresh behavior must follow what changed in the displayed data.

Refreshing must preserve each tab's filters, search, layout and investigation position wherever still valid. Search matches, counts, selected-commit details and comparison results must agree with the refreshed data. Preserve the user's place in history where possible, rather than unexpectedly jumping to the top.

If a selected commit, filtered branch or comparison target is no longer available, show an understandable empty/unavailable state or explicit fallback. Never silently substitute another target for a consequential action.

Two same-working-tree tabs always share checkout state. A checkout in one changes the current branch shown in both, even if their branch filters differ. Users requiring independent checkouts use separate worktrees.

## 7. Correctness and user confidence

- Every operation acts on the repository and target associated with the initiating view, regardless of which editor later receives focus.
- Conflicting Git operations initiated from different tabs must not proceed as though each tab had exclusive control. Affected views must communicate applicable busy or ongoing-operation state.
- A dialog may become stale when another tab or external tool changes the repository. Before a consequential action proceeds, changed assumptions must be checked; material changes require an explanation and renewed confirmation rather than silently changing the action's meaning.
- Diff and file views must resolve against their originating repository. Switching or closing graph tabs must not redirect an existing diff to another repository, including when repositories contain identical file names.
- Late results from a previous repository or investigation must not overwrite the tab's current view.
- Closing or refreshing one graph must not disrupt unrelated graphs.

## 8. Identification and usability

Editor-tab titles must identify Speedy Git and the displayed repository, for example `Speedy Git — my-repo`. Repository changes update that identity. Provide enough context to distinguish same-named repositories and parent/submodule views.

Repeated views of the same repository must be distinguishable with a lightweight instance label or equivalent. Exact title formatting belongs to the later design; identifiers must not imply separate working trees.

The repository, checked-out branch and active view criteria must remain understandable inside each graph. Users should be able to tell both which repository an operation affects and why two views show different history.

## 9. User workflows

### Return to an investigation

1. Open Speedy Git and search or filter history.
2. Work in another VS Code editor.
3. Use the existing Open Speedy Git action.
4. Return to the last active graph with its investigation preserved; no additional graph is created.

### Parent repository and submodule side by side

1. Open the parent repository's graph.
2. Click Open New Graph Tab next to Go to HEAD, then select the submodule through the existing in-graph repository navigation.
3. Move one tab to another editor group using VS Code.
4. Inspect both histories independently. A change affecting submodule and parent status becomes visible in both views.

### Two investigations of one repository

1. Open a repository and filter for release history.
2. Click Open New Graph Tab next to Go to HEAD and select the same repository if necessary.
3. Apply different filters and search in the second graph.
4. Create a tag, move a branch or check out a branch from either view.
5. Both reflect the resulting Git state while retaining their individual investigation criteria and position wherever valid.

### Independent repository switching and closing

1. With several graphs open, change the repository in one tab.
2. Other tabs retain their repositories and view state.
3. Close any graph using the VS Code tab close action.
4. Continue working in the remaining views, or close all of them and reopen normally later.

### Reload the window

1. Open multiple graphs with different investigations.
2. Reload the VS Code window.
3. The prior collection and investigations are not restored. Opening Speedy Git follows the normal first-graph behavior and saved defaults. This feature introduces no new automatic-open-on-startup behavior.

## 10. Performance, privacy and product measurement

Multiple graphs must preserve Speedy Git's responsive navigation and scrolling. Repository changes should not cause repeated disruptive reloads, and unused views should not create unnecessary background work. Resource use with several large histories must be evaluated before release; this idea spec does not promise unlimited tabs at negligible cost.

Review telemetry for the new user-initiated toolbar action using the existing consent and privacy policy. Measure only approved fixed action identifiers, outcomes and suitable counts. Do not collect repository identity, paths, branch names, search/filter content or other user/repository content. Background refreshes and typing are not new telemetry surfaces.

## 11. Product acceptance criteria

- Ordinary Open returns to the most recently active surviving graph, with another existing graph as an acceptable fallback; it creates a graph only when none is open.
- Every graph has an Open New Graph Tab icon button next to Go to HEAD, with a clear tooltip and accessible name.
- Clicking Open New Graph Tab immediately creates another graph without a picker and permits the same repository in multiple tabs.
- Native VS Code controls allow side-by-side placement and closing any or all graphs.
- Each tab's repository selection, filters, search, selection, layout and scroll remain independent.
- Git changes update every affected view while preserving valid investigation context; unrelated views remain undisturbed.
- Same-repository views consistently show shared checkout and operation state.
- Conflicting operations and stale confirmations cannot silently act using invalid assumptions.
- Diffs retain the correct repository identity across graph focus changes, repository switches and graph closure.
- Tab identity clearly distinguishes repositories and repeated views.
- Window reload does not restore the collection of graph tabs or their investigations.
- Opening multiple graphs does not multiply account authorization flows or alter the existing privacy policy.

## 12. Handoff to the technical spec

The technical spec should translate these product requirements into implementation architecture, state and preference handling, event propagation, operation coordination, lifecycle behavior, performance validation and test coverage. No internal class structure, messaging format, storage schema or code-change plan is prescribed here.

Resolve the exact initial repository-selection behavior by documenting the existing first-open rules, along with the saved-default policy and title disambiguation. These details must preserve immediate creation, predictable return-to-last-tab behavior and independent investigations.
