# Tasks: Text Filter in Filter Widget

**Input**: Design documents from `/specs/035-text-filter/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story. US2 (combine filters) and US4 (stash visibility) require no additional implementation beyond US1's foundational work — they are inherently satisfied by the architecture.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Type Definition)

**Purpose**: Add the new filter field to the shared type used by both store and UI

- [x] T001 Add `textFilter?: string` field to `GraphFilters` interface in `shared/types.ts`

**Checkpoint**: Type compiles — `pnpm typecheck` passes

---

## Phase 2: User Story 1 — Filter Commits by Message Text (Priority: P1) — MVP

**Goal**: Users can type text in a Message filter field and see only commits whose message or hash matches, with all non-matching commits hidden from the graph.

**Independent Test**: Open Filter panel → type text in Message field → verify only matching commits are visible, graph topology shows dotted lines for hidden connections.

### Implementation for User Story 1

- [x] T002 [US1] Extend `computeHiddenCommitHashes()` in `webview-ui/src/stores/graphStore.ts` to hide commits not matching `filters.textFilter` (case-insensitive `subject` includes OR hash `startsWith` when text ≥4 chars). Combine with author filter in single pass. Skip stash entries (existing pattern).
- [x] T003 [US1] Add "Message" text input row to `webview-ui/src/components/FilterWidget.tsx` after the Dates section. Use local `useState` for input text, `useEffect` with 150ms debounce calling `setFilters({ textFilter })` then `recomputeVisibility()`. Follow the same row layout pattern as Authors/Dates rows (`flex gap-2`, `w-16` label, `flex-1` content).
- [x] T004 [US1] Update `hasAnyFilters` check in `webview-ui/src/components/FilterWidget.tsx` (line 173) to include `|| !!filters.textFilter` so Reset All button appears when text filter is active.
- [x] T005 [US1] Sync local text input state with store in `webview-ui/src/components/FilterWidget.tsx` — add `useEffect` subscriber (same pattern as date sync at lines 73-89) to handle external clears (e.g., Reset All, context menu actions).

**Checkpoint**: User Story 1 fully functional — typing text hides non-matching commits, graph updates with dotted lines, Reset All clears the text filter.

---

## Phase 3: User Story 2 — Combine Text Filter with Other Filters (Priority: P1)

**Goal**: Text filter works as AND operation with Author, Branch, and Date Range filters.

**Independent Test**: Set Author filter + type text in Message field → verify only commits matching both criteria appear.

### Implementation for User Story 2

No additional implementation tasks required. The AND combination is inherently handled by:
- T002: `computeHiddenCommitHashes()` applies both author and text filters in a single pass — a commit is hidden if it fails either check.
- Server-side filters (branch, date) are applied before `computeHiddenCommitHashes()` runs, so they combine naturally.

**Checkpoint**: Verify combining Author + Message + Date filters shows only commits matching all criteria.

---

## Phase 4: User Story 3 — Clear Text Filter (Priority: P2)

**Goal**: Users can quickly clear the text filter with a single-click clear button without clearing other filters.

**Independent Test**: Set Message filter → click clear button → verify text is removed and commits reappear (other filters remain active).

### Implementation for User Story 3

- [x] T006 [US3] Add clear button (x icon) to the Message text input in `webview-ui/src/components/FilterWidget.tsx`. Show only when text is non-empty. On click: clear local state, which triggers debounced `setFilters({ textFilter: undefined })` + `recomputeVisibility()`.

**Checkpoint**: Clear button appears when text is present, disappears when empty, clears only the text filter.

---

## Phase 5: User Story 4 — Stash Entries Remain Visible (Priority: P2)

**Goal**: Stash entries are never hidden by the text filter, consistent with existing filter behavior.

**Independent Test**: Have stash entries → apply Message filter that doesn't match any stash → verify stashes remain visible.

### Implementation for User Story 4

No additional implementation tasks required. Stash visibility is inherently handled by T002 — the existing `commit.refs.some(r => r.type === 'stash')` skip pattern in `computeHiddenCommitHashes()` applies to all visibility filters including the new text filter.

**Checkpoint**: Verify stash entries remain visible regardless of text filter value.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup

- [x] T007 Run `pnpm typecheck && pnpm lint && pnpm build` to verify all changes compile and pass linting
- [ ] T008 Run quickstart.md smoke test validation via VS Code "Run Extension" launch config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 (T001 must complete before T002-T005)
- **Phase 3 (US2)**: No implementation — verification only after Phase 2
- **Phase 4 (US3)**: Depends on Phase 2 (T003 must exist before adding clear button)
- **Phase 5 (US4)**: No implementation — verification only after Phase 2
- **Phase 6 (Polish)**: Depends on all implementation phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (T001). Core feature — MVP.
- **US2 (P1)**: No additional implementation. Verified by US1 implementation.
- **US3 (P2)**: Depends on US1 (needs the input field from T003).
- **US4 (P2)**: No additional implementation. Verified by US1 implementation (T002 stash-skip).

### Within User Story 1

- T002 (store logic) and T003 (UI input) can proceed in parallel after T001
- T004 (hasAnyFilters) depends on T003 (same file, same component)
- T005 (store sync) depends on T003 (same file, needs the local state)

### Parallel Opportunities

- T002 and T003 can run in parallel (different files: `graphStore.ts` vs `FilterWidget.tsx`)
- T004 and T005 are sequential within `FilterWidget.tsx` (same file)

---

## Parallel Example: User Story 1

```text
# After T001 completes, launch in parallel:
Task T002: "Extend computeHiddenCommitHashes() in graphStore.ts"
Task T003: "Add Message text input row in FilterWidget.tsx"

# Then sequentially in FilterWidget.tsx:
Task T004: "Update hasAnyFilters check"
Task T005: "Add store sync useEffect"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001)
2. Complete Phase 2: User Story 1 (T002-T005)
3. **STOP and VALIDATE**: Test filtering, topology, Reset All
4. Delivers core value — users can filter commits by message text

### Incremental Delivery

1. T001 → Type definition ready
2. T002-T005 → US1 complete → US2 + US4 verified → Deploy (MVP!)
3. T006 → US3 complete → Clear button UX improvement
4. T007-T008 → Polish → Full validation

---

## Notes

- Only 3 files are modified: `shared/types.ts`, `graphStore.ts`, `FilterWidget.tsx`
- No new files, no new packages, no backend changes
- US2 and US4 are "free" — they work automatically due to the existing architecture
- Total implementation tasks: 6 (T001-T006), plus 2 validation tasks (T007-T008)
- Estimated parallelizable: T002 + T003 (different files)
