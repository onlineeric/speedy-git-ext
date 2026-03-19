# Tasks: Auto-Refresh on Git State Changes

**Input**: Design documents from `/specs/016-auto-refresh/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested — test tasks omitted. Validation via manual smoke test per quickstart.md.

**Organization**: Tasks grouped by user story. US3 (Debounced and Non-Disruptive) is embedded in the Foundational phase since debouncing, drop policy, and defer-on-hidden are prerequisites for all auto-refresh behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Core Auto-Refresh Infrastructure)

**Purpose**: Create the watcher service, refresh guards, and visibility tracking that ALL user stories depend on. Includes US3 (debounce, drop, defer) since these are integral to the refresh infrastructure.

- [x] T001 [P] Create `GitWatcherService` in `src/services/GitWatcherService.ts` — skeleton class with: `vscode.EventEmitter<void>` for `onDidDetectChange`, 500ms debounce via `setTimeout`/`clearTimeout`, `dispose()` that cleans up timer and disposables, and a `setRepoPath(path)` method to update watched location
- [x] T002 [P] Add auto-refresh support to `src/WebviewProvider.ts` — add `isRefreshing` and `pendingRefresh` boolean flags, add `isPanelVisible` and `deferredRefresh` boolean flags, implement `triggerAutoRefresh()` method that: (a) returns early if panel not visible (sets `deferredRefresh=true`), (b) returns early if `isRefreshing` (sets `pendingRefresh=true`), (c) wraps `sendInitialData()` in `isRefreshing` guard, (d) after completion checks `pendingRefresh` and re-triggers if set
- [x] T003 Add visibility tracking to `src/WebviewProvider.ts` — subscribe to `panel.onDidChangeViewState` in the `show()` method to track `isPanelVisible`, and trigger deferred refresh when panel becomes visible again if `deferredRefresh` is true

**Checkpoint**: Core refresh infrastructure ready — `GitWatcherService` can emit events, `WebviewProvider` can handle them with proper guards

---

## Phase 2: User Story 1 — Auto-Refresh After VSCode Git Operations (Priority: P1) 🎯 MVP

**Goal**: When user performs git operations via VSCode's Source Control panel (commit, push, pull, sync, checkout, create/delete branch), the graph auto-updates.

**Independent Test**: Open Speedy Git Graph, commit via VSCode Source Control → graph shows new commit within ~2s without clicking refresh.

### Implementation for User Story 1

- [x] T004 [US1] Add VSCode git extension API subscription in `src/services/GitWatcherService.ts` — acquire `vscode.git` API v1 via `vscode.extensions.getExtension('vscode.git')`, subscribe to `repository.state.onDidChange` for each repository, and handle `onDidOpenRepository`/`onDidCloseRepository` for dynamic repo tracking. All events feed into the debounced change handler.
- [x] T005 [US1] Wire `GitWatcherService` into `src/ExtensionController.ts` — create `GitWatcherService` instance when `showGraph()` is first called, subscribe `gitWatcherService.onDidDetectChange` → `webviewProvider.triggerAutoRefresh()`, dispose watcher in `dispose()`, and call `setRepoPath()` when repo changes via `reinitServices()`

**Checkpoint**: Auto-refresh works for all VSCode Source Control operations. Graph updates within ~2s of commit/push/pull/checkout via SCM panel.

---

## Phase 3: User Story 2 — Auto-Refresh After External Git Operations (Priority: P2)

**Goal**: When user runs git commands in the terminal or via external tools, the graph detects the change and auto-updates.

**Independent Test**: Open Speedy Git Graph, run `git commit` in integrated terminal → graph shows new commit within ~3s.

### Implementation for User Story 2

- [x] T006 [US2] Add filesystem watchers in `src/services/GitWatcherService.ts` — use `vscode.workspace.createFileSystemWatcher` with a `RelativePattern` to watch `.git/HEAD`, `.git/refs/**`, `.git/index`, `.git/MERGE_HEAD`, `.git/REBASE_HEAD`. All watcher events (`onDidChange`, `onDidCreate`, `onDidDelete`) feed into the same debounced change handler. Implement `disposeFileWatchers()` and recreate watchers when repo path changes via `setRepoPath()`.
- [x] T007 [US2] Handle graceful degradation in `src/services/GitWatcherService.ts` — if VSCode git extension is unavailable (FR-011), skip git API subscription silently and rely on filesystem watchers only. Log at debug level, no user-facing warning.

**Checkpoint**: Auto-refresh works for terminal git operations. Combined with US1, the graph stays current regardless of how git is used.

---

## Phase 4: User Story 4 — Manual Refresh Still Available (Priority: P3)

**Goal**: Existing manual refresh/fetch buttons continue to work normally alongside auto-refresh.

**Independent Test**: Click the refresh button while auto-refresh is active → graph performs a full refresh. Click refresh during an in-progress auto-refresh → request is dropped gracefully (no error, no double refresh).

### Implementation for User Story 4

- [x] T008 [US4] Ensure manual refresh compatibility and verify auto-refresh UX in `src/WebviewProvider.ts` — (a) verify that the existing `handleMessage` case for `'refresh'` correctly interacts with the `isRefreshing` drop guard (manual refresh should also be subject to the drop policy per FR-012), no code changes expected if `triggerAutoRefresh()` and the manual `refresh` handler both check `isRefreshing` consistently; (b) verify scroll position and selected commit are preserved after auto-refresh (FR-004, handled by existing `setCommits` in graphStore); (c) verify loading indicator appears and refresh/fetch buttons are disabled during auto-refresh (FR-010, handled by existing `loading` state); (d) verify commit details panel stays open during auto-refresh and closes only if the selected commit no longer exists (FR-013, handled by existing `setCommits` selection logic)

**Checkpoint**: Manual refresh and auto-refresh coexist. Drop policy applies uniformly to both trigger sources.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Disposal, build validation, and edge case handling

- [x] T009 Verify proper disposal in `src/ExtensionController.ts` and `src/services/GitWatcherService.ts` — ensure all event listeners, filesystem watchers, git API subscriptions, and debounce timers are cleaned up when extension deactivates, webview closes, or repo switches. Confirm `context.subscriptions` integration.
- [x] T010 Run `pnpm typecheck && pnpm lint && pnpm build` to validate zero errors across all changed files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — can start immediately
  - T001 and T002 can run in parallel (different files)
  - T003 depends on T002 (same file: WebviewProvider.ts)
- **Phase 2 (US1)**: Depends on Phase 1 completion
  - T004 depends on T001 (extends GitWatcherService)
  - T005 depends on T001 + T002 (wires both together)
- **Phase 3 (US2)**: Depends on Phase 1 completion (can run in parallel with Phase 2)
  - T006 depends on T001 (extends GitWatcherService)
  - T007 depends on T006
- **Phase 4 (US4)**: Depends on Phase 1 completion (specifically T002)
- **Phase 5 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — **MVP scope**
- **US2 (P2)**: Depends on Foundational only — independent of US1
- **US3 (P2)**: Embedded in Foundational — no separate dependency
- **US4 (P3)**: Depends on Foundational only — independent of US1/US2

### Parallel Opportunities

- T001 || T002 (different files: GitWatcherService.ts vs WebviewProvider.ts)
- Phase 2 (US1) || Phase 3 (US2) after Foundational completes (though both modify GitWatcherService.ts, they add independent methods)

---

## Parallel Example: Foundational Phase

```text
# These can run simultaneously (different files):
Task T001: "Create GitWatcherService in src/services/GitWatcherService.ts"
Task T002: "Add auto-refresh support to src/WebviewProvider.ts"

# Then sequentially (same file as T002):
Task T003: "Add visibility tracking to src/WebviewProvider.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Foundational (T001-T003)
2. Complete Phase 2: US1 — VSCode Git Operations (T004-T005)
3. **STOP and VALIDATE**: Smoke test per quickstart.md steps 1-2
4. Extension now auto-refreshes after VSCode SCM operations

### Incremental Delivery

1. Foundational → debounce + drop + defer infrastructure ready
2. Add US1 → auto-refresh for VSCode operations → Smoke test (MVP!)
3. Add US2 → auto-refresh for terminal operations → Smoke test
4. Add US4 → verify manual refresh compatibility → Smoke test
5. Polish → disposal, build validation → Ship

### Single Developer Flow

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 (debounce/non-disruptive) is embedded in Foundational because it's the core mechanism, not a separate feature layer
- No new shared types needed — auto-refresh reuses existing `sendInitialData()` flow
- No frontend changes required — webview cannot distinguish auto vs manual refresh
- Commit after each phase checkpoint
