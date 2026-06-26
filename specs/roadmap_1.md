# Speedy Git Roadmap Gap Analysis

Date: 2026-06-18

## Context

Speedy Git is already a mature Git graph and history UI. The current implementation covers most common graph-centered Git workflows:

- Fast commit graph browsing with virtual scrolling, batch loading, branch lanes, table rows, avatars, HEAD/ref labels, and persisted layout.
- Search and filtering by message, hash, author, branch, and date.
- Commit details with changed-file lists, file tree/list views, per-file stats, and VS Code diff integration.
- Branch, tag, stash, remote, submodule, multi-repo, and worktree workflows.
- Fetch, pull, push, checkout, merge, fast-forward, reset, cherry-pick, revert, rebase, interactive rebase, and drop commit.
- Compare refs across commits, branches, tags, expressions, and working tree, including two-dot and PR-style three-dot modes.
- Uncommitted change workflows at file level: stage, unstage, discard, stash selected files, and conflict-state detection.
- Commit signing verification with a dedicated optional Signature column.
- GitHub avatars and basic external reference links in commit tooltips.

The remaining gaps are less about basic Git graph capability and more about daily commit creation, fine-grained working-tree control, code investigation, team/provider workflows, and safety/recovery.

## Competitor Signals

The priority order below was compared against current public feature descriptions from popular Git graph/UI tools:

- [GitLens VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens): markets blame annotations, CodeLens, repository navigation, rich visualizations, comparison commands, PR workflows, and provider integrations.
- [GitLens Core Features](https://help.gitkraken.com/gitlens/gitlens-features/): documents Commit Graph, Launchpad PRs, Visual File History, AI commit messages/explanations/changelogs, integrations, and powerful compare commands.
- [Git Graph VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph): overlaps heavily with Speedy Git's graph/actions, but also lists persistent file-review state and annotated tag details.
- [GitKraken Desktop Committing Changes](https://help.gitkraken.com/gitkraken-desktop/commits/): treats commit creation, amend, commit templates, co-authors, and commit-and-push as core workflows.
- [GitKraken Desktop Staging](https://help.gitkraken.com/gitkraken-desktop/staging/): documents line/hunk-level stage, unstage, and discard.
- [GitKraken Desktop Diffs, File History, and Blame](https://help.gitkraken.com/gitkraken-desktop/diff/): documents diff modes, file history, blame, and patch workflows.
- [GitKraken Desktop Pull Requests](https://help.gitkraken.com/gitkraken-desktop/pull-requests/): covers create, review, filter, comment, and merge PRs across GitHub, GitLab, Bitbucket, and Azure DevOps.
- [GitKraken Desktop Branching and Merging](https://help.gitkraken.com/gitkraken-desktop/branching-and-merging/): documents merge conflict editor, external merge tools, conflict prevention, branch pinning, and smart branch visibility.
- [Fork](https://git-fork.com/): lists commit/amend, line-by-line staging, file history, blame, conflict resolving, reflog recovery, Git-flow, Git LFS, submodules, stashes, and interactive rebase.
- [Tower](https://www.git-tower.com/): markets pull requests, single-line staging, conflict wizard, Git LFS, Git-flow, file history, blame, worktrees, workflows, automatic stashing/fetching, stacked branches, and AI commits.
- [SourceTree](https://www.atlassian.com/software/sourcetree): highlights Git LFS, Git-flow, and submodules.
- [SmartGit Features](https://www.smartgit.dev/features/): highlights clean commit history, conflict solver, smart branching, customizable visual history, distributed reviews, GitHub integration, Jira/GitLab/Bitbucket/Gerrit integrations, Git LFS, and external tools.

## Prioritized Missing Features

| Rank | Missing feature | Priority rationale | Suggested first slice |
|---:|---|---|---|
| 1 | Commit creation, amend, commit-and-push, commit templates, co-authors, sign-off, skip-hooks | Highest-frequency daily workflow. Speedy Git already exposes WIP and staging, but final commit creation/amend is delegated to VS Code SCM. Competitors treat commit/amend as a core UI feature. | Add a focused Commit panel for staged changes with message input, commit, amend previous commit, commit-and-push, sign-off, and command preview. |
| 2 | Line/hunk-level stage, unstage, and discard | Very common for producing clean commits. Current implementation is path-level only via `git add -- <paths>`, `git reset HEAD -- <paths>`, checkout, and clean. Competitors consistently advertise line or hunk staging. | Add diff-backed hunk actions first, then line selection after the diff viewer model is stable. |
| 3 | Pull request integration | High team-workflow value and very visible in GitLens, GitKraken, SmartGit, Fork, and modern Git clients. Speedy Git has PR-style compare and autolinks, but no authenticated PR workflow. | Start with GitHub: detect branch PR, create/open PR, show PR status/checks/review state badges, then expand providers later. |
| 4 | Conflict resolution UX | Less frequent than committing, but critical when needed. Speedy Git has conflict-aware continue/abort flows, but not a resolver or guided conflicted-file workflow. | Add conflicted-files panel with open VS Code Merge Editor, take current/incoming, mark resolved, continue/abort guidance. |
| 5 | File history and blame | Common investigation/debugging workflow. GitLens, Fork, GitKraken, SmartGit, and Tower all expose file history/blame prominently. | Right-click a file in commit details or uncommitted changes -> Show File History / Blame Current File. |
| 6 | Advanced commit search | Current search is strong for loaded commits, but large repos need direct Git-backed search by path, changed text, commit range, author, branch, and ref. | Add search modes: message/hash/author, file path touched, pickaxe text, and range. Display matches in graph with jump markers. |
| 7 | Reflog and recovery tools | Safety feature that pairs naturally with Speedy Git's history-editing power. Users who reset/drop/rebase need a visible recovery path. Fork explicitly lists reflog-based recovery. | Add reflog viewer with restore branch here, create branch from entry, copy hash, and clear warnings around destructive operations. |
| 8 | Git LFS support | Important for game, design, media, data, and monorepo teams. SourceTree, Fork, Tower, GitKraken, and SmartGit all list LFS support. | Detect LFS availability and tracked files, show LFS badges, support LFS pull, track pattern, untrack pattern, and prune with warnings. |
| 9 | Graph navigation at scale: minimap, scroll markers, pin/hide/solo branches, smart visibility, pushed/unpushed indicators | Fits Speedy Git's performance-first positioning. Competitors use minimaps, branch visibility, pinning, and pushed/pending markers to reduce noise in large histories. | Add pushed/unpushed indicators and branch pin/hide/solo first; minimap can follow once graph metadata is exposed cleanly. |
| 10 | Persistent code-review checklist for commit/compare details | Git Graph supports marking reviewed files in commit/compare views. This would strengthen Speedy Git's compare panel without requiring full PR integration. | Add "Start Review" for commit/compare results, bold unreviewed files, persist reviewed file state per repo/ref pair. |
| 11 | Patch workflows | Useful for offline review, support handoff, and cross-repo sharing. GitKraken documents create/apply patch workflows. | Add create patch from commit/range/compare result and apply patch through VS Code file picker. |
| 12 | Git-flow, workflow helpers, and stacked-branch support | Advertised by SourceTree, Tower, Fork, and SmartGit, but lower priority than PR integration because many teams now use GitHub/GitLab flow. | Add branch naming/workflow templates first; consider full Git-flow only if requested by users. |
| 13 | AI assist: commit messages, branch explanations, working-tree explanations, changelog from selected commits | Increasingly popular in GitLens, GitKraken, and Tower, but not necessary for a strong Git graph. Good later differentiator because Speedy Git already leans into AI-ready worktrees. | Start with local/provider-configurable AI commit message generation from staged diff; keep it optional. |

## Recommended Roadmap Slices

1. **Working Tree & Commit Panel**
   - Commit creation, amend, commit-and-push, sign-off, skip-hooks.
   - Hunk-level stage/unstage/discard.
   - Commit message history/templates and co-authors.

2. **Investigation Tools**
   - File history.
   - Blame.
   - Advanced Git-backed search by path, changed text, and ranges.

3. **Team Review**
   - GitHub PR create/open/status/checks.
   - PR badges on branches/commits.
   - Persistent reviewed-file checklist for compare results.

4. **Safety & Recovery**
   - Guided conflict resolution.
   - Reflog viewer and restore/create-branch recovery actions.
   - Stronger undo affordances for recent local operations where Git supports safe rollback.

5. **Large/Complex Repo Support**
   - Git LFS detection and actions.
   - Branch pin/hide/solo and smart visibility.
   - Graph minimap and navigation markers.

## Notes

- Avoid building a full provider platform first. A small GitHub PR slice will validate demand and data model shape before adding GitLab, Bitbucket, Azure DevOps, or enterprise variants.
- Commit/amend and hunk staging should come before PRs because PR workflows depend on creating clean local commits.
- Reflog should be implemented before adding more destructive history-editing affordances.
- Git-flow support should remain below PR/provider work unless user feedback specifically shows demand from release-heavy teams.
