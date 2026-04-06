# Tasks: Replace Filter Panel Date/Time Picker with react-datepicker

**Input**: Design documents from `/specs/034-react-datepicker-filter/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependency and create supporting files

- [x] T001 Provide install command for developer to run: `cd webview-ui && pnpm add react-datepicker`
- [x] T002 [P] Create VS Code theme override styles for react-datepicker in `webview-ui/src/components/datepicker-overrides.css` — override `.react-datepicker`, `.react-datepicker__input-container input`, `.react-datepicker__header`, `.react-datepicker__day`, `.react-datepicker__time-input`, and calendar navigation elements to use VS Code CSS variables (`--vscode-input-background`, `--vscode-input-foreground`, `--vscode-input-border`, `--vscode-dropdown-background`, `--vscode-focusBorder`, `--vscode-list-activeSelectionBackground`, etc.). Keep the input compact (`text-xs`, `px-1 py-0.5`) to match existing filter panel styling.

**Checkpoint**: Dependencies installed, CSS theme file ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Conversion helpers and imports that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add Date↔ISO string conversion helper functions at the top of `webview-ui/src/components/FilterWidget.tsx`: (1) `parseISOToDate(iso: string | undefined): Date | null` — parses ISO string (e.g., `2025-03-15T14:30:00`) to Date or returns null; (2) `formatDateToISO(date: Date | null, defaultTime: string): string | undefined` — converts Date to ISO string (e.g., `2025-03-15T14:30:00`) using the provided default time (`00:00:00` for From, `23:59:59` for To) when only a date is selected, returns undefined if date is null. Use date-fns `format` (token: `yyyy-MM-dd'T'HH:mm:ss`) and `parse` functions.
- [x] T004 Add imports to `webview-ui/src/components/FilterWidget.tsx`: import `DatePicker` from `react-datepicker`, import `react-datepicker/dist/react-datepicker.css`, and import `./datepicker-overrides.css`.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 + 2 — Calendar Selection & Manual Typing (Priority: P1) 🎯 MVP

**Goal**: Replace the 4 native HTML date/time inputs with 2 react-datepicker combined fields. Users can select dates from a calendar or type dates/date-times manually with validation.

**Independent Test**: Open filter panel → click "From" field → select a date from calendar → verify commits filter. Type "2025-03-15" → verify filter applies. Type "abc" → verify red border and no filter applied.

### Implementation for User Story 1 + 2

- [x] T005 [US1] Replace the local state variables `fromDate`, `fromTime`, `toDate`, `toTime` (4 strings) with `fromDate` and `toDate` (2 `Date | null` values) in `webview-ui/src/components/FilterWidget.tsx`. Add a `fromValid` and `toValid` boolean state to track whether current input is valid.
- [x] T006 [US1] Replace the store sync `useEffect` (lines ~40-65 in current FilterWidget.tsx) to convert `filters.afterDate` / `filters.beforeDate` ISO strings to `Date` objects using `parseISOToDate` helper, updating the `fromDate` / `toDate` state in `webview-ui/src/components/FilterWidget.tsx`.
- [x] T007 [US1] Replace the 4 HTML `<input type="date">` and `<input type="time">` elements in the "Date range row" section (lines ~320-363 in current FilterWidget.tsx) with 2 `<DatePicker>` components in `webview-ui/src/components/FilterWidget.tsx`. Configure props: `selected={fromDate}`, `onChange` handler that calls `formatDateToISO` and applies filter, `dateFormat={["yyyy-MM-dd HH:mm", "yyyy-MM-dd"]}`, `placeholderText="YYYY-MM-DD HH:mm"`, `showTimeInput={true}`, `timeInputLabel="Time"`, `isClearable={true}`, `strictParsing={true}`, `autoComplete="off"`, `portalId="datepicker-portal"`. Add a `<div id="datepicker-portal" />` at the end of the FilterWidget return JSX to ensure the calendar popup is not clipped by overflow-hidden containers. Wrap each in a container with "From" / "To" labels matching existing layout. Note: `isClearable` and `showTimeInput` are configured here as part of core setup; their behavior is verified and styled in T010 (US3) and T011 (US4) respectively.
- [x] T008 [US2] Add validation logic in `webview-ui/src/components/FilterWidget.tsx`: use `onChangeRaw` to track raw input text and determine validity. When raw text is non-empty but the parsed Date is null (invalid input), set `fromValid`/`toValid` to false and apply red border class (`border-red-500`) to the input via `className` prop on DatePicker. When input is empty or valid, remove red border. Do NOT apply filters when invalid.
- [x] T009 [US1] Update the debounced filter application `useEffect` in `webview-ui/src/components/FilterWidget.tsx` to work with `Date | null` state instead of the old 4-string state. Use `formatDateToISO(fromDate, '00:00:00')` for afterDate and `formatDateToISO(toDate, '23:59:59')` for beforeDate. Preserve the 150ms debounce, skip-if-unchanged guard, and `setFilters` + `rpcClient.getCommits` calls.

**Checkpoint**: Core date picker works — calendar selection, manual typing, validation, and filter application all functional

---

## Phase 4: User Story 3 — Clear Date Filter Value (Priority: P2)

**Goal**: Users can clear a date filter value with a single click using the built-in clear button.

**Independent Test**: Set a "From" date → click the clear (x) button → verify field is empty and filter is removed.

### Implementation for User Story 3

- [x] T010 [US3] Verify and style the clear button (core prop `isClearable` already set in T007). In `webview-ui/src/components/FilterWidget.tsx`, confirm the `onChange(null)` callback correctly sets `fromDate`/`toDate` to null, which triggers the debounced effect to set `afterDate`/`beforeDate` to undefined in the store and re-fetch commits. Style the clear button via `webview-ui/src/components/datepicker-overrides.css` to match VS Code theme (`.react-datepicker__close-icon::after` pseudo-element).

**Checkpoint**: Clear button works on both From and To fields

---

## Phase 5: User Story 4 — Date and Time Using Picker (Priority: P2)

**Goal**: Users can set a time via the free-text time input inside the calendar popup, producing a combined date+time filter.

**Independent Test**: Open calendar → select a date → type "14:30" in the time input inside the popup → verify filter applies with that exact date-time.

### Implementation for User Story 4

- [x] T011 [US4] Verify and style the time input in the calendar popup (core prop `showTimeInput` already set in T007). In `webview-ui/src/components/FilterWidget.tsx`, confirm the time input renders correctly. Note: `showTimeInput` renders a native `<input type="time">` which follows browser locale — VS Code's Chromium webview typically uses 24h, but if 12h is observed, replace with a `customTimeInput` React component that renders `<input type="time" />` with explicit `step="60"` attribute for consistent 24h display. Style the time input via `webview-ui/src/components/datepicker-overrides.css` (`.react-datepicker__input-time-container`, `.react-datepicker-time__input input`) to match VS Code theme and fit within the calendar popup. Verify that when a time is set via the popup, the `onChange` callback receives a Date with the correct hours/minutes and the ISO string includes the time component.

**Checkpoint**: Time selection via calendar popup works alongside date selection

---

## Phase 6: User Story 5 — Context Menu Date Filter Compatibility (Priority: P2)

**Goal**: Right-click "Filter from/to this date" on a commit row correctly populates the react-datepicker fields.

**Independent Test**: Right-click a commit → select "Filter from this date" → verify the "From" DatePicker field shows that date.

### Implementation for User Story 5

- [x] T012 [US5] Verify the store sync `useEffect` (updated in T006) correctly handles external store changes from `webview-ui/src/components/DateContextMenu.tsx`. When the context menu calls `setFilters({ afterDate: "YYYY-MM-DDT00:00:00" })`, the subscription in FilterWidget must parse that ISO string to a Date and update the DatePicker's `selected` prop. Test both "Filter from this date" and "Filter to this date" context menu actions. Also verify that "Reset All" (which calls `resetAllFilters`) clears both DatePicker fields to null.

**Checkpoint**: All existing external date filter interactions (context menu, Reset All) work with the new DatePicker

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Build validation and final cleanup

- [x] T013 Run `pnpm typecheck` — zero TypeScript errors
- [x] T014 Run `pnpm lint` — zero ESLint errors
- [x] T015 Run `pnpm build` — clean build of both extension and webview
- [ ] T016 Manual smoke test via VS Code "Run Extension" launch config: (1) Open filter panel, select date from calendar, verify filtering; (2) Type "2025-03-15" in From field, verify filtering; (3) Type "2025-03-15 14:30" in From field, verify filtering; (4) Type "abc", verify red border and no filter; (5) Click clear button, verify filter removed; (6) Right-click commit → "Filter from this date", verify field populated; (7) Click "Reset All", verify both fields cleared; (8) Verify calendar popup positions correctly and doesn't clip; (9) Paste a date string from clipboard into the input field, verify it validates correctly; (10) Verify the time input in the calendar popup displays in 24-hour format

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 install must complete first)
- **US1+US2 (Phase 3)**: Depends on Foundational — this is the MVP
- **US3 (Phase 4)**: Depends on Phase 3 (DatePicker must exist to add clear behavior)
- **US4 (Phase 5)**: Depends on Phase 3 (DatePicker must exist to verify time input)
- **US5 (Phase 6)**: Depends on Phase 3 (DatePicker + store sync must exist)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1+US2 (P1)**: Can start after Foundational — no dependencies on other stories
- **US3 (P2)**: Builds on US1+US2 component — adds clear button behavior
- **US4 (P2)**: Builds on US1+US2 component — adds time input in popup
- **US5 (P2)**: Builds on US1+US2 store sync — verifies external compatibility
- **US3, US4, US5 are independent of each other** and can be done in any order after Phase 3

### Within Each Phase

- T001 and T002 can run in parallel (install vs CSS file)
- T003 and T004 are sequential (T004 imports depend on installed package from T001)
- T005 → T006 → T007 → T008 → T009 are sequential (each builds on the previous)
- T010, T011, T012 can run in parallel after Phase 3 (different concerns on same component, but different sections)

### Parallel Opportunities

```
Phase 1: T001 ‖ T002
Phase 2: T003 → T004 (sequential)
Phase 3: T005 → T006 → T007 → T008 → T009 (sequential, same file section)
Phase 4-6: T010 ‖ T011 ‖ T012 (independent P2 stories)
Phase 7: T013 ‖ T014 → T015 → T016 (typecheck/lint parallel, then build, then smoke test)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (install + CSS)
2. Complete Phase 2: Foundational (helpers + imports)
3. Complete Phase 3: User Stories 1 + 2 (core DatePicker)
4. **STOP and VALIDATE**: Test calendar selection, manual typing, validation independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1+US2 → Core picker works (MVP!)
3. US3 → Clear button works
4. US4 → Time input in popup works
5. US5 → Context menu compatibility verified
6. Polish → Build passes, smoke test passes

---

## Notes

- All implementation tasks modify `webview-ui/src/components/FilterWidget.tsx` — this is a single-file feature
- The only new file is `webview-ui/src/components/datepicker-overrides.css`
- No backend changes, no shared type changes, no store changes
- Agent MUST NOT install packages — T001 provides the command for the developer
- Commit after each phase checkpoint
