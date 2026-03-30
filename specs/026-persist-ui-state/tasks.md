# Tasks: Persist UI State

**Input**: Design documents from `/specs/026-persist-ui-state/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story. US1 (position restore) and US2 (full reload restore) share foundational infrastructure; US2 is validated as an integration outcome after US1, US3, and US4 are complete.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in descriptions

---

## Phase 1: Foundational (Shared Types & Message Contracts)

**Purpose**: Define the shared data model and message contracts that all user stories depend on. No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: All user stories depend on these types and messages.

**Note**: This design preserves Zustand as the live state store (FR-007). Persistence supplements existing state management — it does not replace it.

- [ ] T001 [P] Add `PersistedUIState` interface and `DEFAULT_PERSISTED_UI_STATE` constant to `shared/types.ts` — fields: `version` (number, default 1), `detailsPanelPosition` (DetailsPanelPosition, default 'bottom'), `fileViewMode` (FileViewMode, default 'list'), `bottomPanelHeight` (number, default 280), `rightPanelWidth` (number, default 400)
- [ ] T002 [P] Add `persistedUIState` response type and `updatePersistedUIState` request type to `shared/messages.ts` — add to RequestMessage/ResponseMessage unions, REQUEST_TYPES/RESPONSE_TYPES enums, and type guards
- [ ] T003 Add `bottomPanelHeight` and `rightPanelWidth` fields with setters (`setBottomPanelHeight`, `setRightPanelWidth`) and a `hydratePersistedUIState` action to the Zustand store in `webview-ui/src/stores/graphStore.ts` — defaults: bottomPanelHeight=280, rightPanelWidth=400; hydratePersistedUIState accepts a PersistedUIState and sets all four fields (position, viewMode, height, width)
- [ ] T004 Add `persistedUIState` case to the message handler switch in `webview-ui/src/rpc/rpcClient.ts` — on receiving `persistedUIState` response, call `store.hydratePersistedUIState(payload.uiState)`
- [ ] T005 Add a `persistUIState` helper method to `webview-ui/src/rpc/rpcClient.ts` that sends an `updatePersistedUIState` request with a partial state payload to the extension host
- [ ] T006 Add `loadPersistedUIState()` private method to `src/WebviewProvider.ts` — reads from `this.context.globalState.get('speedyGit.uiState')`, validates shape and version (if stored version !== current version, discard and return defaults), type-checks each field, clamps sizes to >= 120px MIN_SIZE, falls back to per-field defaults for any invalid value, returns a valid `PersistedUIState`
- [ ] T007 Add `savePersistedUIState()` private method to `src/WebviewProvider.ts` — merges partial update into current state and writes to `this.context.globalState.update('speedyGit.uiState', mergedState)`
- [ ] T008 Send persisted UI state to webview during initialization in `src/WebviewProvider.ts` — call `loadPersistedUIState()` and post `persistedUIState` message in `sendInitialData()`, before other initial data messages
- [ ] T009 Handle `updatePersistedUIState` request in the message handler switch in `src/WebviewProvider.ts` — call `savePersistedUIState()` with the received partial state

**Checkpoint**: Shared types defined, message contracts in place, extension host can read/write/send persisted state, webview can receive and hydrate. Foundation ready.

---

## Phase 2: User Story 1 — Restore Panel Position After Reopen (Priority: P1) 🎯 MVP

**Goal**: When the user toggles panel position (bottom/right), the preference is persisted and restored when the panel is reopened.

**Independent Test**: Toggle panel to right → close panel → reopen panel → verify panel is on the right and toggle icon shows "Move to Bottom."

- [ ] T010 [US1] Update `toggleDetailsPanelPosition` action in `webview-ui/src/stores/graphStore.ts` to call `rpcClient.persistUIState({ detailsPanelPosition: newPosition })` after toggling
- [ ] T011 [US1] Confirm the position toggle icon in `webview-ui/src/components/CommitDetailsPanel.tsx` derives its state from the store's `detailsPanelPosition`; if any hardcoded default overrides the hydrated value, fix it so the icon reflects the restored state

**Checkpoint**: Panel position persists across close/reopen. US1 fully functional.

---

## Phase 3: User Story 2 — Restore All UI Preferences After VS Code Reload (Priority: P1)

**Goal**: After VS Code reloads, all persisted preferences (position, view mode, sizes) are restored on the next panel open.

**Independent Test**: Set position=right, viewMode=tree, resize panel → reload VS Code → open panel → verify all three preferences restored.

- [ ] T012 [US2] Ensure `persistedUIState` message is sent before other initial data in `src/WebviewProvider.ts` `sendInitialData()` so hydration happens before first render — adjust message ordering if needed
- [ ] T013 [US2] Ensure `hydratePersistedUIState` in `webview-ui/src/stores/graphStore.ts` sets all four fields atomically and that the store initializes with defaults before hydration (no flash of undefined values) — fix if any field is left as undefined during hydration

**Checkpoint**: Full reload scenario works. US2 is an integration validation of the persistence pipeline. If US1, US3, US4 persist correctly and T008/T012 ensure early hydration, this should pass.

---

## Phase 4: User Story 3 — Restore File Change View Mode (Priority: P2)

**Goal**: When the user switches file view mode (list/tree), the preference is persisted and restored.

**Independent Test**: Switch to tree view → close panel → reopen → verify tree view is active and toggle icon reflects tree mode.

- [ ] T014 [US3] Update `setFileViewMode` action in `webview-ui/src/stores/graphStore.ts` to call `rpcClient.persistUIState({ fileViewMode: newMode })` after setting the mode
- [ ] T015 [US3] Confirm the file view mode toggle icon in `webview-ui/src/components/CommitDetailsPanel.tsx` derives its state from the store's `fileViewMode`; if any hardcoded default overrides the hydrated value, fix it so the icon reflects the restored mode

**Checkpoint**: File view mode persists across close/reopen and reload. US3 fully functional.

---

## Phase 5: User Story 4 — Restore Panel Size (Priority: P2)

**Goal**: Panel height (bottom) and width (right) are persisted on resize end and restored on reopen.

**Independent Test**: Resize bottom panel height → close → reopen → verify height matches. Switch to right → resize width → close → reopen → verify width matches.

- [ ] T016 [US4] Refactor `CommitDetailsPanel.tsx` to read `bottomPanelHeight` and `rightPanelWidth` from the Zustand store instead of local `useState` — remove the local `bottomHeight`/`rightWidth` state variables, use `useGraphStore` selectors instead
- [ ] T017 [US4] Update the resize mouse-move handler in `webview-ui/src/components/CommitDetailsPanel.tsx` to call `store.setBottomPanelHeight()` or `store.setRightPanelWidth()` (replacing local setState calls)
- [ ] T018 [US4] Add persistence call on resize end (mouse-up) in `webview-ui/src/components/CommitDetailsPanel.tsx` — call `rpcClient.persistUIState({ bottomPanelHeight })` or `rpcClient.persistUIState({ rightPanelWidth })` at the end of the drag, not during the drag
- [ ] T019 [US4] Ensure that switching panel position in `webview-ui/src/components/CommitDetailsPanel.tsx` uses the correct stored dimension — bottom position reads `bottomPanelHeight`, right position reads `rightPanelWidth` (independent values, not shared); fix if either dimension cross-references the wrong field

**Checkpoint**: Panel sizes persist across close/reopen and reload. US4 fully functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and build verification across all stories.

- [ ] T020 [P] Confirm edge case: first-time user with no saved state — `loadPersistedUIState()` returns defaults, panel renders normally, first user action creates persisted state; fix if defaults are not written on first change
- [ ] T021 Run `pnpm typecheck` to verify zero TypeScript errors
- [ ] T022 Run `pnpm lint` to verify zero ESLint errors
- [ ] T023 Run `pnpm build` to verify clean build of extension and webview
- [ ] T024 Manual smoke test via VS Code "Run Extension" launch config — test all four user stories end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1 completion.
- **US2 (Phase 3)**: Depends on Phase 1 completion. Full validation requires US1 + US3 + US4 to also be complete.
- **US3 (Phase 4)**: Depends on Phase 1 completion. Can run in parallel with US1/US4.
- **US4 (Phase 5)**: Depends on Phase 1 completion. Can run in parallel with US1/US3.
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent after foundation. Position persistence only.
- **US2 (P1)**: Integration story — validates that the init/hydration pipeline works for all fields. Best validated after US1 + US3 + US4.
- **US3 (P2)**: Independent after foundation. View mode persistence only.
- **US4 (P2)**: Independent after foundation. Size persistence only (largest change — refactors component state to store).

### Within Each User Story

- Store changes before component changes
- Persistence wiring before icon/UI verification

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- US1, US3, US4 can all run in parallel after foundation (different concerns, minimal file overlap — US1/US3 both touch graphStore.ts actions but different functions)
- T020 and T021 can run in parallel
- T021, T022, T023 should run sequentially (build depends on types)

---

## Parallel Example: Foundation Phase

```bash
# Launch shared type and message contract tasks together:
Task T001: "Add PersistedUIState interface to shared/types.ts"
Task T002: "Add message types to shared/messages.ts"
```

## Parallel Example: User Stories After Foundation

```bash
# After foundation is complete, these stories can start in parallel:
Task T010: US1 - Position persistence in graphStore.ts
Task T014: US3 - View mode persistence in graphStore.ts
Task T016: US4 - Size refactor in CommitDetailsPanel.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001–T009)
2. Complete Phase 2: US1 — Position persistence (T010–T011)
3. **STOP and VALIDATE**: Toggle position, close/reopen, verify restored
4. This alone delivers visible value

### Incremental Delivery

1. Foundation → all types and plumbing in place
2. Add US1 → position persists → validate
3. Add US3 → view mode persists → validate
4. Add US4 → sizes persist → validate (biggest change)
5. Validate US2 → full reload test → all preferences restored
6. Polish → validation, edge cases, build checks

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US2 is an integration validation story, not a separate implementation — it passes when US1 + US3 + US4 all persist correctly and hydration happens before first render
- Panel sizes persist on mouse-up (end of drag), not during drag, to avoid excessive writes
- Validation logic is part of T006 (foundational), not deferred to polish
