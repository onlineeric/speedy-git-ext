# Tasks: Commit Node Hover Tooltip

**Input**: Design documents from `/specs/025-commit-node-tooltip/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. No test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Shared types, message contracts, and store infrastructure needed by all user stories

- [x] T001 [P] Add `WorktreeInfo`, `ExternalRef`, and `ContainingBranchesResult` type definitions in `shared/types.ts` — `WorktreeInfo` has fields: `path` (string), `head` (string), `branch` (string), `isMain` (boolean), `isDetached` (boolean). `ExternalRef` has fields: `label` (string), `url` (string | null), `type` ('pr-or-issue' | 'jira'). `ContainingBranchesResult` has fields: `branches` (string[]), `status` ('loaded' | 'loading' | 'error')
- [x] T002 [P] Add `getContainingBranches`/`containingBranches` and `getWorktreeList`/`worktreeList` message types in `shared/messages.ts` — request: `{ type: 'getContainingBranches'; payload: { hash: string } }`, response: `{ type: 'containingBranches'; payload: { hash: string; branches: string[]; status: 'loaded' | 'error' } }`. Also `{ type: 'getWorktreeList' }` and `{ type: 'worktreeList'; payload: { worktrees: WorktreeInfo[] } }`. Update `REQUEST_TYPES`, `RESPONSE_TYPES` maps, `isRequestMessage`, `isResponseMessage` type guards. Keep the existing `isCommitPushed`/`commitPushedResult` message types — they are still used by `CommitContextMenu.tsx` for drop commit safety checks
- [x] T003 Add tooltip state to Zustand store in `webview-ui/src/stores/graphStore.ts` — add state fields: `hoveredCommitHash: string | null`, `tooltipAnchorRect: DOMRect | null`, `worktreeList: WorktreeInfo[]`, `worktreeByHead: Map<string, WorktreeInfo>`, `containingBranchesCache: Map<string, ContainingBranchesResult>`. Add actions: `setHoveredCommit(hash, anchorRect)`, `setWorktreeList(list)` (also builds `worktreeByHead` map), `setContainingBranches(hash, result)`, `clearTooltipCaches()`. Call `clearTooltipCaches()` inside existing graph refresh actions to invalidate caches on data reload. Remove old `syncStatusCache` and `setSyncStatus` if they exist from the previous implementation
- [x] T004 Add `getContainingBranches()`, `getWorktreeList()` methods and response handlers in `webview-ui/src/rpc/rpcClient.ts` — send method: `getContainingBranches(hash: string) { this.send({ type: 'getContainingBranches', payload: { hash } }) }` and `getWorktreeList() { this.send({ type: 'getWorktreeList' }) }`. In `handleMessage` switch, add case `'containingBranches'` that calls `store.setContainingBranches(message.payload.hash, { branches: message.payload.branches, status: message.payload.status })` and case `'worktreeList'` that calls `store.setWorktreeList(message.payload.worktrees)`. Keep existing `commitPushedResult` handler and `isCommitPushed` send method — they are still used by `CommitContextMenu.tsx`

**Checkpoint**: Shared infrastructure ready — types, messages, store, and RPC wired up

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend services and message handling that MUST be complete before tooltip UI can fetch data

- [x] T005 Create `GitWorktreeService` in `src/services/GitWorktreeService.ts` — implement `listWorktrees(): Promise<Result<WorktreeInfo[]>>` that executes `git worktree list --porcelain` via `GitExecutor`, parses the porcelain output (blocks separated by blank lines, each block has `worktree <path>`, `HEAD <hash>`, `branch <ref>` or `detached` lines). First entry is the main worktree (`isMain: true`). Return `ok([])` on error (graceful degradation)
- [x] T006 Instantiate `GitWorktreeService` in `src/ExtensionController.ts` — create field `gitWorktreeService`, instantiate with `GitExecutor` and workspace path, pass to `WebviewProvider` via constructor/update method. Follow existing service instantiation pattern (same as `GitBranchService`, `GitDiffService`, etc.)
- [x] T007 Handle `getContainingBranches` and `getWorktreeList` messages in `src/WebviewProvider.ts` — add case `'getContainingBranches'` in message handler that runs `git branch -a --contains <hash> --format=%(refname:short)` via `GitExecutor`, strips `remotes/` from remote branches so `remotes/origin/main` becomes `origin/main`, filters symbolic `HEAD` refs, and posts `{ type: 'containingBranches', payload: { hash, branches, status } }`. On error/timeout, send `{ hash, branches: [], status: 'error' }`. Also add case `'getWorktreeList'` that calls `gitWorktreeService.listWorktrees()` and posts `{ type: 'worktreeList', payload: { worktrees } }`. Also add worktree list fetch in `sendInitialData()` so worktree data is sent proactively alongside commits and branches on graph load. Keep existing `isCommitPushed` handler — it is still used by `CommitContextMenu.tsx` for drop commit safety checks

**Checkpoint**: Backend services operational, containing branches + worktree message pipeline connected end-to-end

---

## Phase 3: User Story 1 — View Commit References on Hover (Priority: P1) 🎯 MVP

**Goal**: Display an interactive tooltip with all containing branches (via `git branch -a --contains`), containing HEAD, containing tags, and containing stashes when hovering over a commit node circle in the graph

**Independent Test**: Hover over a commit node circle deep in main's history → tooltip appears after 200ms showing short hash header, loading indicator for branches, then all containing branches (e.g., main, dev, feature/x) once fetched, plus HEAD, tags, and stashes whose pointed-to commits include the hovered commit. References render in split subsections (HEAD, Branches, Tags, Stashes) and each badge keeps the color of the source ref's lane. Move cursor into tooltip → stays open and scrollable. Move away → dismisses after 150ms. Scroll graph → immediate dismiss. Only one tooltip at a time. Re-hover same commit → cached branches shown instantly.

### Implementation for User Story 1

- [x] T008 [P] [US1] Create `useTooltipHover` custom hook in `webview-ui/src/hooks/useTooltipHover.ts` — manages 200ms show delay and 150ms dismiss delay using `useRef` timers. Exports: `onNodeMouseEnter(hash: string, anchorRect: DOMRect)` — starts 200ms timer, on fire calls `store.setHoveredCommit(hash, rect)`. `onNodeMouseLeave()` — starts 150ms dismiss timer, on fire calls `store.setHoveredCommit(null, null)`. `onTooltipMouseEnter()` — clears dismiss timer. `onTooltipMouseLeave()` — starts 150ms dismiss timer. `dismissImmediate()` — clears all timers, immediately sets hovered to null. Cleanup: clear all timers on unmount. Single-tooltip: entering a new node clears previous timers first
- [x] T009 [P] [US1] Create `CommitTooltip` component in `webview-ui/src/components/CommitTooltip.tsx` — uses Radix `Popover.Root` with controlled `open` state driven by `store.hoveredCommitHash !== null`. Uses `Popover.Portal` for rendering outside scroll container. `Popover.Anchor` positioned via a virtual element using `store.tooltipAnchorRect`. `Popover.Content` with `side="right"`, `align="center"`, `sideOffset={8}`, `collisionPadding={8}`, `avoidCollisions={true}`. Styling: `bg-[var(--vscode-editorHoverWidget-background)]`, `border border-[var(--vscode-editorHoverWidget-border)]`, `text-[var(--vscode-editorHoverWidget-foreground)]`, auto-width with `max-w-[min(800px,80vw)]`, auto-height with `max-h-[min(600px,80vh)]`, `overflow-y-auto`. No animation. Content: header showing `commit.abbreviatedHash`. **References section**: fetch containing branches from `store.containingBranchesCache.get(hash)` via `rpcClient.getContainingBranches(hash)`; show loading indicator while loading; show "Branch info unavailable" on error. Derive containing HEAD, tags, and stashes from already-loaded `mergedCommits` using `commitReachability`. Split visible references into subsections in this order: HEAD, Branches, Tags, Stashes, with divider lines between adjacent visible subsections. Parse containing branch names into display-ready refs using the existing `mergeRefs` pattern. Apply per-reference lane colors: branch badges use the lane color of the source branch tip, HEAD uses the current branch lane color, and tag/stash badges use the lane color of the commit they point to. Omit the references section if no refs are available and branch loading has completed successfully
- [x] T010 [US1] Add hover event handlers to SVG circle in `webview-ui/src/components/GraphCell.tsx` — on the `<circle>` element, add `onMouseEnter` handler that computes `DOMRect` from `event.currentTarget.getBoundingClientRect()` and calls the tooltip hover callback with `(commit.hash, rect)`. Add `onMouseLeave` handler that calls the tooltip leave callback. Accept hover callbacks as props: `onNodeMouseEnter?: (hash: string, rect: DOMRect) => void` and `onNodeMouseLeave?: () => void`
- [x] T011 [US1] Pass tooltip hover callbacks through `CommitRow` in `webview-ui/src/components/CommitRow.tsx` — accept `onNodeMouseEnter` and `onNodeMouseLeave` props, forward them to `GraphCell`. Ensure memoization is not broken (include callbacks in memo comparison or use stable refs)
- [x] T012 [US1] Integrate tooltip into `GraphContainer` in `webview-ui/src/components/GraphContainer.tsx` — instantiate `useTooltipHover` hook. Pass `onNodeMouseEnter`/`onNodeMouseLeave` callbacks to each `CommitRow`. Add passive scroll event listener on `containerRef.current` that calls `dismissImmediate()`. Render `<CommitTooltip />` component inside the container (outside the virtual scroll div). Look up the hovered commit from `store.mergedCommits` using `store.hoveredCommitHash` and pass it to `CommitTooltip`

**Checkpoint**: US1 complete — hovering over any commit node circle shows an interactive tooltip with short hash, all containing branches (loaded async with caching), containing HEAD, containing tags, and containing stashes. References are split into conditional subsections and preserve per-reference lane colors. Tooltip repositions within viewport. Single tooltip at a time. Scroll dismisses. 200ms show / 150ms dismiss delays work correctly.

---

## Phase 4: User Story 2 — View Worktree Status (Priority: P2)

**Goal**: Show active worktree path in tooltip when the commit is checked out in a worktree

**Independent Test**: Hover over a commit checked out in a worktree → tooltip shows worktree path. Hover over a commit not in any worktree → no worktree section shown. Commit in main working directory → shows "Primary Workspace" label.

### Implementation for User Story 2

- [x] T013 [US2] Request worktree data on graph load in `webview-ui/src/components/App.tsx` or `GraphContainer.tsx` — call `rpcClient.getWorktreeList()` during initial data load (alongside existing `getCommits`). This ensures `store.worktreeList` is populated before any tooltip hover occurs. If the call is already handled by `sendInitialData()` in backend (T007), this task only needs to handle the case where the frontend explicitly requests a refresh
- [x] T014 [US2] Add worktree section to `CommitTooltip` in `webview-ui/src/components/CommitTooltip.tsx` — after references section, add worktree section. Read `store.worktreeByHead.get(commit.hash)`: if found and `isMain` is true → show "Primary Workspace" with the path, if found and `isMain` is false → show "Worktree" label with the absolute path, if not found → omit the entire worktree section (do not render empty section). Style path as monospace text. Section order per FR-004: References → Worktree Status → External Links

**Checkpoint**: US2 complete — tooltip shows worktree status for commits checked out in worktrees, section omitted otherwise.

---

## Phase 5: User Story 3 — Access External System Links (Priority: P3)

**Goal**: Display clickable PR/issue links extracted from commit messages

**Independent Test**: Hover over a commit with `#42` in subject → tooltip shows clickable link to `https://github.com/{owner}/{repo}/issues/42`. Commit with no references → no external links section. Non-GitHub repo → `#42` shown but not linked.

### Implementation for User Story 3

- [x] T015 [P] [US3] Create external reference parser in `webview-ui/src/utils/externalRefParser.ts` — export `parseExternalRefs(subject: string, githubOwnerRepo: { owner: string; repo: string } | null): ExternalRef[]`. Parse `#\d+` patterns → for GitHub repos, generate URL `https://github.com/{owner}/{repo}/issues/{number}` (GitHub auto-redirects to PR if applicable). Parse `[A-Z]+-\d+` patterns (JIRA-style) → `type: 'jira'`, `url: null` (no base URL configured yet). Return empty array if no patterns found. Avoid matching `#\d+` inside URLs or code fences
- [x] T016 [US3] Add external links section to `CommitTooltip` in `webview-ui/src/components/CommitTooltip.tsx` — after worktree section, add external links section. Detect GitHub owner/repo using `GitHubAvatarService.parseGitHubRemote()` pattern applied to the first remote's `fetchUrl` from `store.remotes`. Call `parseExternalRefs(commit.subject, ownerRepo)`. If result is non-empty, render each ref: if `url` is not null → render as clickable link (opens in external browser via `rpcClient.openExternal(url)` or `vscode.env.openExternal()`), if `url` is null → render as plain text label (e.g., JIRA IDs without configured base URL). If no external refs found → omit section entirely

**Checkpoint**: US3 complete — tooltip shows clickable GitHub PR/issue links extracted from commit messages.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, performance validation, and final quality checks

- [x] T017 Handle edge case: commit with many containing branches in `webview-ui/src/components/CommitTooltip.tsx` — when a commit has 20+ containing branches, ensure the scrollable content area (`overflow-y-auto` with max-height) works correctly. All branches displayed without a cap, refs section scrolls independently within the tooltip's max height constraint
- [x] T018 Handle edge case: minimal tooltip content in `webview-ui/src/components/CommitTooltip.tsx` — when a commit has no containing branches (orphan/unreachable), no worktree, and no external links, the tooltip shows only the short hash header. Verify the tooltip still renders and positions correctly with minimal content
- [x] T019 Verify VS Code theme compatibility in `webview-ui/src/components/CommitTooltip.tsx` — test tooltip rendering in dark, light, and high contrast themes. Ensure all `--vscode-editorHoverWidget-*` CSS variables render correctly. Fix any fallback values needed for themes that don't define these variables, and ensure divider lines and ref badges remain readable with per-reference lane colors
- [x] T020 Run `pnpm typecheck && pnpm lint && pnpm build` to validate full build passes with all changes. Fix any TypeScript errors, lint warnings, or build failures
- [ ] T021 Run quickstart.md smoke test validation — open extension in VS Code debug host, perform all smoke test steps listed in `specs/025-commit-node-tooltip/quickstart.md`, verify all acceptance scenarios from spec.md pass. Also verify: (a) hovering over a partially-visible commit node (scrolled to edge) still triggers tooltip correctly, (b) empty repository or error state does not break tooltip functionality (no errors in console)
- [x] T022 Add a visual connector between the hovered commit node and `webview-ui/src/components/CommitTooltip.tsx` — render a non-interactive line/tail between the node anchor and tooltip body so the association is explicit. Use the hovered node lane color for the connector styling to match the graph color semantics

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001, T002 (shared types/messages) from Setup
- **User Story 1 (Phase 3)**: Depends on T003, T004 (store + RPC) from Setup + T007 (backend containing branches handler) from Foundational
- **User Story 2 (Phase 4)**: Depends on US1 (tooltip component exists, T009) + Foundational (T005-T007 backend worktree service)
- **User Story 3 (Phase 5)**: Depends on US1 (tooltip component exists, T009)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup (Phase 1) + Foundational backend (T007) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 tooltip component (T009) + Foundational backend (T005-T007)
- **User Story 3 (P3)**: Depends on US1 tooltip component (T009) being complete

### Within Each User Story

- Models/types before services
- Services before UI components
- Core component before section additions
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 can run in parallel (different shared files)
- T008 and T009 can run in parallel (different new files — hook and component)
- T015 can run in parallel with T013/T014 (different files, different stories)
- US2 and US3 can run in parallel after US1 (both just add sections to tooltip)

---

## Parallel Example: User Story 1

```bash
# Launch setup tasks in parallel (different files):
Task T001: "Add WorktreeInfo/ExternalRef/ContainingBranchesResult types in shared/types.ts"
Task T002: "Add containing branches + worktree message types in shared/messages.ts"

# After setup, launch US1 implementation in parallel (different new files):
Task T008: "Create useTooltipHover hook in webview-ui/src/hooks/useTooltipHover.ts"
Task T009: "Create CommitTooltip component in webview-ui/src/components/CommitTooltip.tsx"

# Then sequential integration (same files touched):
Task T010: "Add hover handlers to GraphCell.tsx"
Task T011: "Pass callbacks through CommitRow.tsx"
Task T012: "Integrate tooltip into GraphContainer.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T007) — can overlap with US1 frontend work
3. Complete Phase 3: User Story 1 (T008-T012)
4. **STOP and VALIDATE**: Hover over commit nodes → containing branches + refs tooltip works
5. Demo/validate with developer

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Interactive tooltip with containing branches + refs → **MVP!**
3. Add User Story 2 → Worktree awareness → Developer safety
4. Add User Story 3 → External links → Project management bridge
5. Polish → Edge cases, themes, build validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- No new packages needed — all dependencies already installed
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Spec change**: Branches now use "contains" semantics (git branch -a --contains), not decoration-only refs
- **Spec change**: HEAD, tags, and stashes now also use containment semantics within the loaded graph rather than direct-decoration-only semantics
- **Spec change**: References area is split into HEAD / Branches / Tags / Stashes subsections with dividers between visible groups
- **Spec change**: Tooltip badges use per-reference lane colors instead of a single hovered-commit color
- **Spec change**: Remote Sync Status section removed — sync info is derived from containing branches list
- **Spec change**: New `getContainingBranches` RPC replaces old `isCommitPushed` for tooltip data
