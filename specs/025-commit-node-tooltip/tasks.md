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

- [ ] T001 [P] Add `WorktreeInfo` and `ExternalRef` type definitions in `shared/types.ts` — `WorktreeInfo` has fields: `path` (string), `head` (string), `branch` (string), `isMain` (boolean), `isDetached` (boolean). `ExternalRef` has fields: `label` (string), `url` (string | null), `type` ('pr-or-issue' | 'jira')
- [ ] T002 [P] Add `getWorktreeList` request and `worktreeList` response message types in `shared/messages.ts` — request: `{ type: 'getWorktreeList' }`, response: `{ type: 'worktreeList'; payload: { worktrees: WorktreeInfo[] } }`. Update `REQUEST_TYPES`, `RESPONSE_TYPES` maps, `isRequestMessage`, `isResponseMessage` type guards
- [ ] T003 Add tooltip state to Zustand store in `webview-ui/src/stores/graphStore.ts` — add state fields: `hoveredCommitHash: string | null`, `tooltipAnchorRect: DOMRect | null`, `worktreeList: WorktreeInfo[]`, `worktreeByHead: Map<string, WorktreeInfo>`, `syncStatusCache: Map<string, 'pushed' | 'local' | 'loading' | 'error'>`. Add actions: `setHoveredCommit(hash, anchorRect)`, `setWorktreeList(list)` (also builds `worktreeByHead` map), `setSyncStatus(hash, status)`, `clearTooltipCaches()`. Call `clearTooltipCaches()` inside existing graph refresh actions to invalidate caches on data reload
- [ ] T004 Add `getWorktreeList()` method and `worktreeList` response handler in `webview-ui/src/rpc/rpcClient.ts` — send method: `getWorktreeList() { this.send({ type: 'getWorktreeList' }) }`. In `handleMessage` switch, add case `'worktreeList'` that calls `store.setWorktreeList(message.payload.worktrees)`. Also update the existing `'commitPushedResult'` handler to call `store.setSyncStatus(hash, pushed ? 'pushed' : 'local')` for tooltip caching

**Checkpoint**: Shared infrastructure ready — types, messages, store, and RPC wired up

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend service and message handling that MUST be complete before tooltip UI can fetch data

**Note**: US3 (Worktree Status) depends on this phase. US1, US2, and US4 can proceed after Setup (Phase 1) without waiting for this phase.

- [ ] T005 Create `GitWorktreeService` in `src/services/GitWorktreeService.ts` — implement `listWorktrees(): Promise<Result<WorktreeInfo[]>>` that executes `git worktree list --porcelain` via `GitExecutor`, parses the porcelain output (blocks separated by blank lines, each block has `worktree <path>`, `HEAD <hash>`, `branch <ref>` or `detached` lines). First entry is the main worktree (`isMain: true`). Return `ok([])` on error (graceful degradation)
- [ ] T006 Instantiate `GitWorktreeService` in `src/ExtensionController.ts` — create field `gitWorktreeService`, instantiate with `GitExecutor` and workspace path, pass to `WebviewProvider` via constructor/update method. Follow existing service instantiation pattern (same as `GitBranchService`, `GitDiffService`, etc.)
- [ ] T007 Handle `getWorktreeList` message and send worktree data on graph load in `src/WebviewProvider.ts` — add case `'getWorktreeList'` in message handler that calls `gitWorktreeService.listWorktrees()` and posts `{ type: 'worktreeList', payload: { worktrees } }`. Also add worktree list fetch in `sendInitialData()` so worktree data is sent proactively alongside commits and branches on graph load

**Checkpoint**: Backend worktree service operational, message pipeline connected end-to-end

---

## Phase 3: User Story 1 — View Commit References on Hover (Priority: P1) 🎯 MVP

**Goal**: Display an interactive tooltip with commit references (branches, tags, HEAD, stashes) when hovering over a commit node circle in the graph

**Independent Test**: Hover over a commit node circle → tooltip appears after 200ms showing short hash header and all refs. Move cursor into tooltip → stays open. Move away → dismisses after 150ms. Scroll graph → immediate dismiss. Only one tooltip at a time.

### Implementation for User Story 1

- [ ] T008 [P] [US1] Create `useTooltipHover` custom hook in `webview-ui/src/hooks/useTooltipHover.ts` — manages 200ms show delay and 150ms dismiss delay using `useRef` timers. Exports: `onNodeMouseEnter(hash: string, anchorRect: DOMRect)` — starts 200ms timer, on fire calls `store.setHoveredCommit(hash, rect)`. `onNodeMouseLeave()` — starts 150ms dismiss timer, on fire calls `store.setHoveredCommit(null, null)`. `onTooltipMouseEnter()` — clears dismiss timer. `onTooltipMouseLeave()` — starts 150ms dismiss timer. `dismissImmediate()` — clears all timers, immediately sets hovered to null. Cleanup: clear all timers on unmount. Single-tooltip: entering a new node clears previous timers first
- [ ] T009 [P] [US1] Create `CommitTooltip` component in `webview-ui/src/components/CommitTooltip.tsx` — uses Radix `Popover.Root` with controlled `open` state driven by `store.hoveredCommitHash !== null`. Uses `Popover.Portal` for rendering outside scroll container. `Popover.Anchor` positioned via a virtual element using `store.tooltipAnchorRect`. `Popover.Content` with `side="right"`, `align="center"`, `sideOffset={8}`, `collisionPadding={8}`, `avoidCollisions={true}`. Styling: `bg-[var(--vscode-editorHoverWidget-background)]`, `border border-[var(--vscode-editorHoverWidget-border)]`, `text-[var(--vscode-editorHoverWidget-foreground)]`, auto-width with `max-w-[min(800px,80vw)]`, auto-height with `max-h-[min(600px,80vh)]`, `overflow-y-auto`. No animation. Content for US1: header showing `commit.abbreviatedHash`, then refs section listing all `commit.refs` grouped by type (HEAD, branches, tags, stashes) with visual distinction (different colors/icons per ref type). Follow existing branch badge pattern from `CommitRow.tsx` for branch display (local-only, remote-only, paired format). Wire `onMouseEnter`/`onMouseLeave` to `useTooltipHover` callbacks. Omit refs section if commit has no refs
- [ ] T010 [US1] Add hover event handlers to SVG circle in `webview-ui/src/components/GraphCell.tsx` — on the `<circle>` element, add `onMouseEnter` handler that computes `DOMRect` from `event.currentTarget.getBoundingClientRect()` and calls the tooltip hover callback with `(commit.hash, rect)`. Add `onMouseLeave` handler that calls the tooltip leave callback. Accept hover callbacks as props: `onNodeMouseEnter?: (hash: string, rect: DOMRect) => void` and `onNodeMouseLeave?: () => void`
- [ ] T011 [US1] Pass tooltip hover callbacks through `CommitRow` in `webview-ui/src/components/CommitRow.tsx` — accept `onNodeMouseEnter` and `onNodeMouseLeave` props, forward them to `GraphCell`. Ensure memoization is not broken (include callbacks in memo comparison or use stable refs)
- [ ] T012 [US1] Integrate tooltip into `GraphContainer` in `webview-ui/src/components/GraphContainer.tsx` — instantiate `useTooltipHover` hook. Pass `onNodeMouseEnter`/`onNodeMouseLeave` callbacks to each `CommitRow`. Add passive scroll event listener on `containerRef.current` that calls `dismissImmediate()`. Render `<CommitTooltip />` component inside the container (outside the virtual scroll div). Look up the hovered commit from `store.mergedCommits` using `store.hoveredCommitHash` and pass it to `CommitTooltip`

**Checkpoint**: US1 complete — hovering over any commit node circle shows an interactive tooltip with short hash and all refs (branches, tags, HEAD, stashes). Tooltip repositions within viewport. Single tooltip at a time. Scroll dismisses. 200ms show / 150ms dismiss delays work correctly.

---

## Phase 4: User Story 2 — Check Remote Sync Status (Priority: P2)

**Goal**: Add a "Pushed to Remote" or "Local Only" indicator to the tooltip with loading state

**Independent Test**: Hover over a pushed commit → tooltip shows "Pushed to Remote" after brief loading. Hover over a local-only commit → shows "Local Only". Re-hover same commit → cached result shown instantly. Hover during fetch → loading indicator visible in sync status section.

### Implementation for User Story 2

- [ ] T013 [US2] Add sync status section to `CommitTooltip` in `webview-ui/src/components/CommitTooltip.tsx` — below the refs section, add a "Sync Status" section. Read `store.syncStatusCache.get(commit.hash)`: if `'pushed'` → show "Pushed to Remote" indicator, if `'local'` → show "Local Only" indicator, if `'loading'` → show a loading spinner/indicator text, if `'error'` → show "Sync status unavailable", if cache miss → call `store.setSyncStatus(hash, 'loading')` and `rpcClient.isCommitPushed(hash)` via a `useEffect` triggered when `hoveredCommitHash` changes and cache has no entry. Section uses VS Code theme colors. Omit section header if data not yet requested (initial render before effect fires should show loading)
- [ ] T014 [US2] Handle sync status error case in `webview-ui/src/rpc/rpcClient.ts` — in the existing `isCommitPushed` Promise-based method, add error handling: if the promise rejects or backend returns an error response, call `store.setSyncStatus(hash, 'error')`. Also ensure the `commitPushedResult` handler (updated in T004) correctly maps `pushed: true` → `'pushed'` and `pushed: false` → `'local'`

**Checkpoint**: US2 complete — tooltip shows sync status with loading indicator, cached results on re-hover, graceful error handling.

---

## Phase 5: User Story 3 — View Worktree Status (Priority: P3)

**Goal**: Show active worktree path in tooltip when the commit is checked out in a worktree

**Independent Test**: Hover over a commit checked out in a worktree → tooltip shows worktree path. Hover over a commit not in any worktree → no worktree section shown. Commit in main working directory → shows "Primary Workspace" label.

### Implementation for User Story 3

- [ ] T015 [US3] Request worktree data on graph load in `webview-ui/src/components/App.tsx` or `GraphContainer.tsx` — call `rpcClient.getWorktreeList()` during initial data load (alongside existing `getCommits`). This ensures `store.worktreeList` is populated before any tooltip hover occurs. If the call is already handled by `sendInitialData()` in backend (T007), this task only needs to handle the case where the frontend explicitly requests a refresh
- [ ] T016 [US3] Add worktree section to `CommitTooltip` in `webview-ui/src/components/CommitTooltip.tsx` — after sync status section, add worktree section. Read `store.worktreeByHead.get(commit.hash)`: if found and `isMain` is true → show "Primary Workspace" with the path, if found and `isMain` is false → show "Worktree" label with the absolute path, if not found → omit the entire worktree section (do not render empty section). Style path as monospace text

**Checkpoint**: US3 complete — tooltip shows worktree status for commits checked out in worktrees, section omitted otherwise.

---

## Phase 6: User Story 4 — Access External System Links (Priority: P4)

**Goal**: Display clickable PR/issue links extracted from commit messages

**Independent Test**: Hover over a commit with `#42` in subject → tooltip shows clickable link to `https://github.com/{owner}/{repo}/issues/42`. Commit with no references → no external links section. Non-GitHub repo → `#42` shown but not linked.

### Implementation for User Story 4

- [ ] T017 [P] [US4] Create external reference parser in `webview-ui/src/utils/externalRefParser.ts` — export `parseExternalRefs(subject: string, githubOwnerRepo: { owner: string; repo: string } | null): ExternalRef[]`. Parse `#\d+` patterns → for GitHub repos, generate URL `https://github.com/{owner}/{repo}/issues/{number}` (GitHub auto-redirects to PR if applicable). Parse `[A-Z]+-\d+` patterns (JIRA-style) → `type: 'jira'`, `url: null` (no base URL configured yet). Return empty array if no patterns found. Avoid matching `#\d+` inside URLs or code fences
- [ ] T018 [US4] Add external links section to `CommitTooltip` in `webview-ui/src/components/CommitTooltip.tsx` — after worktree section, add external links section. Detect GitHub owner/repo using `GitHubAvatarService.parseGitHubRemote()` pattern applied to the first remote's `fetchUrl` from `store.remotes`. Call `parseExternalRefs(commit.subject, ownerRepo)`. If result is non-empty, render each ref: if `url` is not null → render as clickable link (opens in external browser — verify `rpcClient.openExternal(url)` exists; if not, add `openExternal` request message type in `shared/messages.ts` and handler in `WebviewProvider.ts` using `vscode.env.openExternal()`), if `url` is null → render as plain text label (e.g., JIRA IDs without configured base URL). If no external refs found → omit section entirely

**Checkpoint**: US4 complete — tooltip shows clickable GitHub PR/issue links extracted from commit messages.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, performance validation, and final quality checks

- [ ] T019 Handle edge case: commit with many refs in `webview-ui/src/components/CommitTooltip.tsx` — when a commit has 10+ refs, ensure the scrollable content area (`overflow-y-auto` with max-height) works correctly. Refs section should scroll independently within the tooltip's max height constraint
- [ ] T020 Handle edge case: minimal tooltip content in `webview-ui/src/components/CommitTooltip.tsx` — when a commit has no refs, no sync status cached, no worktree, and no external links, the tooltip shows only the short hash header. Verify the tooltip still renders and positions correctly with minimal content
- [ ] T021 Verify VS Code theme compatibility in `webview-ui/src/components/CommitTooltip.tsx` — test tooltip rendering in dark, light, and high contrast themes. Ensure all `--vscode-editorHoverWidget-*` CSS variables render correctly. Fix any fallback values needed for themes that don't define these variables
- [ ] T022 Run `pnpm typecheck && pnpm lint && pnpm build` to validate full build passes with all changes. Fix any TypeScript errors, lint warnings, or build failures
- [ ] T023 Run quickstart.md smoke test validation — open extension in VS Code debug host, perform all smoke test steps listed in `specs/025-commit-node-tooltip/quickstart.md`, verify all acceptance scenarios from spec.md pass. Also verify: (a) hovering over a partially-visible commit node (scrolled to edge) still triggers tooltip correctly, (b) empty repository or error state does not break tooltip functionality (no errors in console)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001, T002 (shared types/messages) from Setup
- **User Story 1 (Phase 3)**: Depends on T003 (store) from Setup — BLOCKS on Foundational only if worktree data is needed, but US1 core tooltip works without backend
- **User Story 2 (Phase 4)**: Depends on US1 (tooltip component exists) + T004 (RPC sync cache)
- **User Story 3 (Phase 5)**: Depends on US1 (tooltip component exists) + Foundational (T005-T007 backend worktree service)
- **User Story 4 (Phase 6)**: Depends on US1 (tooltip component exists)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup (Phase 1) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 tooltip component (T009) being complete
- **User Story 3 (P3)**: Depends on US1 tooltip component (T009) + Foundational backend (T005-T007)
- **User Story 4 (P4)**: Depends on US1 tooltip component (T009) being complete

### Within Each User Story

- Models/types before services
- Services before UI components
- Core component before section additions
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 can run in parallel (different shared files)
- T008 and T009 can run in parallel (different new files — hook and component)
- T017 can run in parallel with T015/T016 (different files, different stories)
- US2 and US4 can run in parallel after US1 (both just add sections to tooltip)

---

## Parallel Example: User Story 1

```bash
# Launch setup tasks in parallel (different files):
Task T001: "Add WorktreeInfo/ExternalRef types in shared/types.ts"
Task T002: "Add worktree message types in shared/messages.ts"

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
4. **STOP and VALIDATE**: Hover over commit nodes → refs tooltip works
5. Demo/validate with developer

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Interactive tooltip with refs → **MVP!**
3. Add User Story 2 → Sync status indicator → Enhanced value
4. Add User Story 3 → Worktree awareness → Developer safety
5. Add User Story 4 → External links → Project management bridge
6. Polish → Edge cases, themes, build validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- No new packages needed — all dependencies already installed
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
