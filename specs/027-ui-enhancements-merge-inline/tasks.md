# Tasks: UI Enhancements for Merge Dialog and Inline Code Rendering

**Input**: Design documents from `/specs/027-ui-enhancements-merge-inline/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: No test tasks included — not explicitly requested in feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No project-level setup needed — this is an existing project with all tooling in place.

*No tasks in this phase.*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared inline code parsing utility that User Stories 1 and 3 both depend on.

- [ ] T001 Create inline code rendering utility in `webview-ui/src/utils/inlineCodeRenderer.tsx`. Export three things: (1) `parseInlineCode()` that splits text on backtick pairs into segments of `{ text, isCode }`, (2) `renderInlineCode(text: string): React.ReactNode` convenience function that returns React nodes (`<span>` for plain text, `<code>` with grey background for code), and (3) `InlineCode` React component for wrapping static known text in inline code style (for reuse in MergeDialog labels). Handle edge cases: unpaired backticks render as literal characters, empty backtick pairs (``) render as two literal backtick characters. Use `bg-[var(--vscode-textCodeBlock-background)]` and `font-mono rounded px-1` for styling in a single place.

**Checkpoint**: Foundation ready — `renderInlineCode()` can be imported by CommitRow, CommitDetailsPanel, and MergeDialog.

---

## Phase 3: User Story 1 - Inline Code in Commit Messages (Priority: P1) MVP

**Goal**: Backtick-delimited text in commit messages renders with grey background inline code styling across the commit list and details panel.

**Independent Test**: Create commits with backtick-wrapped text, verify they render with grey background in both commit list and details panel.

### Implementation for User Story 1

- [ ] T002 [P] [US1] Update commit subject rendering in `webview-ui/src/components/CommitRow.tsx` to use `renderInlineCode()` instead of plain text for `commit.subject`. Ensure `truncate` behavior and `title` attribute still work correctly (title should show raw text with backticks for copy-ability). Verify messages without backticks render unchanged (FR-003).
- [ ] T003 [P] [US1] Update commit subject rendering in `webview-ui/src/components/CommitDetailsPanel.tsx` header section to use `renderInlineCode()` for `details.subject`. Keep existing `truncate` and `title` behavior.
- [ ] T004 [US1] Update commit body rendering in `webview-ui/src/components/CommitDetailsPanel.tsx` body section to use `renderInlineCode()` for `details.body`. Preserve `whitespace-pre-wrap` formatting — the body may contain newlines that must be retained.

**Checkpoint**: Commit messages with backticks now render with inline code styling across the entire UI. Messages without backticks render unchanged.

---

## Phase 4: User Story 2 - Add --squash Option to Merge Dialog (Priority: P1)

**Goal**: A `--squash` checkbox appears in the merge dialog as the first option, updates the command preview, and passes the squash flag through to the backend.

**Independent Test**: Open merge dialog, toggle --squash, verify command preview updates and merge executes with squash flag.

### Implementation for User Story 2

- [ ] T005 [US2] Add `squash` state variable (default `false`) to `webview-ui/src/components/MergeDialog.tsx`. Add a checkbox for --squash positioned as the first option (above --no-commit and --no-ff). Pass `squash` in the `onConfirm()` options object. Pass `squash` to `buildMergeCommand()` for command preview. The --squash checkbox operates independently with no coupling to other checkboxes. Reset `squash` state in `handleOpenChange` alongside existing state resets.

**Checkpoint**: --squash checkbox works end-to-end — the existing `rpcClient.mergeBranch()`, message types, and backend handler already support the `squash` flag.

---

## Phase 5: User Story 3 - Updated Merge Option Labels with Inline Code Styling (Priority: P2)

**Goal**: Merge dialog option labels display git flags (--squash, --no-commit, --no-ff) with inline code styling (grey background).

**Independent Test**: Open merge dialog and verify git flags in labels render with grey background inline code style.

### Implementation for User Story 3

- [ ] T006 [US3] Update all three checkbox labels in `webview-ui/src/components/MergeDialog.tsx`: import `InlineCode` component from `webview-ui/src/utils/inlineCodeRenderer.tsx` and use it to wrap the "--squash", "--no-commit", and "--no-ff" flag text in each label. Update label text to: "--no-commit: No commits, stage changes only" and "--no-ff: Create a new commit even if fast forward is possible". This reuses the same styling as commit message inline code (DRY).

**Checkpoint**: All three merge options show git flags with inline code styling. Descriptive text remains plain.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup across all stories.

- [ ] T007 Run `pnpm typecheck` and fix any TypeScript errors
- [ ] T008 Run `pnpm lint` and fix any ESLint errors
- [ ] T009 Run `pnpm build` and verify clean build of both extension and webview
- [ ] T010 Run quickstart.md validation — smoke test all three features via VS Code "Run Extension" launch config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Empty — no setup needed
- **Foundational (Phase 2)**: T001 — BLOCKS User Stories 1 and 3 (they use `renderInlineCode()`)
- **User Story 1 (Phase 3)**: Depends on T001. T002 and T003 can run in parallel (different files), T004 depends on T003 (same file).
- **User Story 2 (Phase 4)**: No dependency on T001 — can start immediately after Phase 1 (or in parallel with Phase 2)
- **User Story 3 (Phase 5)**: Depends on T001 (for styling consistency) and T005 (--squash checkbox must exist to style its label)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001) only — no cross-story dependencies
- **User Story 2 (P1)**: Independent — can start immediately, no dependency on T001
- **User Story 3 (P2)**: Depends on T001 (styling) and T005 (squash checkbox exists)

### Parallel Opportunities

- T002 and T003 can run in parallel (different files: CommitRow vs CommitDetailsPanel)
- T005 can run in parallel with T001, T002, T003, T004 (different file, no dependency on inline code utility)
- User Story 2 can be implemented entirely in parallel with User Stories 1 and the foundational phase

---

## Parallel Example: User Story 1

```bash
# After T001 completes, launch T002 and T003 in parallel:
Task: "Update CommitRow.tsx subject rendering with renderInlineCode()"
Task: "Update CommitDetailsPanel.tsx subject rendering with renderInlineCode()"

# Then T004 sequentially (same file as T003):
Task: "Update CommitDetailsPanel.tsx body rendering with renderInlineCode()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001 — inline code utility)
2. Complete Phase 3: User Story 1 (T002-T004 — commit message rendering)
3. **STOP and VALIDATE**: Test inline code rendering independently
4. Proceed to remaining stories

### Incremental Delivery

1. T001 (foundational utility) → Ready
2. T002-T004 (US1: inline code in commits) → Test independently → MVP!
3. T005 (US2: squash checkbox) → Test independently
4. T006 (US3: label styling) → Test independently
5. T007-T010 (polish) → Final validation

### Optimal Parallel Execution

With parallel capability:
1. Start T001 and T005 in parallel (different files, no dependency)
2. After T001: Start T002 + T003 in parallel
3. After T003: Start T004
4. After T001 + T005: Start T006
5. T007-T010 sequentially for validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable
- Total: 10 tasks (1 foundational, 3 US1, 1 US2, 1 US3, 4 polish)
- No new packages needed — all styling uses existing Tailwind + VS Code theme variables
- No backend changes — squash is already fully wired through RPC and backend
