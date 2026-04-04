# Quickstart: Advanced Filter Panel

**Feature Branch**: `032-advanced-filter-panel`
**Date**: 2026-04-04

## Implementation Order

### Phase 1: Foundation (shared types + backend)

1. **Extend `shared/types.ts`** — Add `Author` interface, extend `GraphFilters` with `authors`, `afterDate`, `beforeDate`.
2. **Extend `shared/messages.ts`** — Add `getAuthors` request, `authorList` response, update `loadMoreCommits` filter types, update exhaustive maps.
3. **Extend `GitLogService`** — Add `getAuthors()` method, update `getCommits()` to handle `authors[]`, `afterDate`, `beforeDate` flags.
4. **Extend `WebviewProvider`** — Handle `getAuthors` message, pass new filter fields through to `GitLogService`.

### Phase 2: Generic Components (frontend, no feature wiring)

5. **Create `MultiSelectDropdown`** — Extract generic multi-select from `MultiBranchDropdown`. Generic type, render props, keyboard nav, search.
6. **Refactor `MultiBranchDropdown`** — Consume `MultiSelectDropdown<Branch>` internally. Verify no regressions.
7. **Create `AuthorBadge`** — Shared badge component (avatar + name + optional X).

### Phase 3: Filter Panel UI (frontend)

8. **Extend `graphStore.ts`** — Add `authorList`, `authorListLoading`, `resetAllFilters()` action, update `setRepos`/`setActiveRepo` to use centralized reset.
9. **Extend `rpcClient.ts`** — Add `getAuthors()` method, handle `authorList` response, update `getCommits()` signature.
10. **Rewrite `FilterWidget`** — Three-section panel: branch badges, author dropdown + badges, date range fields + Reset All.
11. **Update `ControlBar`** — Unhide filter button, update filter color logic for all filter types.
12. **Update `CommitDetailsPanel`** — Replace plain-text author with `AuthorBadge`.

### Phase 4: Context Menus & Polish (frontend)

13. **Update `CommitTableRow`** — Add context menu triggers on author and date cells.
14. **Update `CommitContextMenu`** — Add author filter and date filter menu items.
15. **Update `BranchContextMenu`** — Add branch filter menu items.
16. **Add empty state** — Show "No commits match the current filters" in `GraphContainer`/`CommitTable` when filtered results are empty.

### Phase 5: Validation

17. `pnpm typecheck` — Zero TypeScript errors.
18. `pnpm lint` — Zero ESLint errors.
19. `pnpm build` — Clean build.
20. Manual smoke test via VS Code "Run Extension".

## Key Files Reference

| File | Action | What Changes |
|------|--------|-------------|
| `shared/types.ts` | Modify | Add `Author`, extend `GraphFilters` |
| `shared/messages.ts` | Modify | Add `getAuthors`/`authorList`, update types |
| `src/services/GitLogService.ts` | Modify | Add `getAuthors()`, extend `getCommits()` |
| `src/WebviewProvider.ts` | Modify | Handle `getAuthors`, pass new filters |
| `webview-ui/src/components/MultiSelectDropdown.tsx` | Create | Generic multi-select dropdown |
| `webview-ui/src/components/AuthorBadge.tsx` | Create | Shared author badge |
| `webview-ui/src/components/FilterWidget.tsx` | Rewrite | Full filter panel |
| `webview-ui/src/components/MultiBranchDropdown.tsx` | Modify | Refactor to use MultiSelectDropdown |
| `webview-ui/src/components/ControlBar.tsx` | Modify | Unhide button, update colors |
| `webview-ui/src/components/CommitDetailsPanel.tsx` | Modify | AuthorBadge for author display |
| `webview-ui/src/components/CommitTableRow.tsx` | Modify | Context menu triggers |
| `webview-ui/src/components/CommitContextMenu.tsx` | Modify | Author/date filter items |
| `webview-ui/src/components/BranchContextMenu.tsx` | Modify | Branch filter items |
| `webview-ui/src/components/GraphContainer.tsx` | Modify | Empty state |
| `webview-ui/src/stores/graphStore.ts` | Modify | Author list, centralized reset |
| `webview-ui/src/rpc/rpcClient.ts` | Modify | getAuthors, authorList handling |

## Critical Design Decisions

1. **Server-side filtering**: All filters (author, date, branch) are applied via git flags — no client-side filtering of loaded commits.
2. **Centralized reset**: A single `resetAllFilters()` action in the store prevents partial reset bugs.
3. **Generic MultiSelectDropdown**: Shared between branch and author dropdowns to avoid duplication.
4. **No new packages**: Uses Chromium native date input and existing Radix UI.
5. **Transient state**: All filters reset on session/panel open — no persistence.
