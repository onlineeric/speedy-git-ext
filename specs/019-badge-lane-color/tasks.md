# Tasks: Badge Lane Color Matching

**Input**: Design documents from `/specs/019-badge-lane-color/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: No automated tests requested. Manual smoke test via VS Code "Run Extension" launch config.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Shared Color Utilities)

**Purpose**: Extract and create shared color utilities that all user stories depend on. Ensure no regression in existing graph rendering.

- [x] T001 Create color utility module with `getColor()`, `getContrastTextColor()`, and `getLaneColorStyle()` in `webview-ui/src/utils/colorUtils.ts`
  - Extract `getColor(colorIndex: number, palette: string[]): string` (currently inline in GraphCell.tsx — returns `palette[colorIndex % palette.length]`)
  - Implement `getContrastTextColor(hexColor: string): string` — parse hex to RGB, compute relative luminance via `0.2126*R + 0.7152*G + 0.0722*B` (after linearization: `channel <= 0.03928 ? channel/12.92 : ((channel+0.055)/1.055)^2.4`), return `'#1a1a1a'` if luminance > 0.5, else `'#f5f5f5'`
  - Implement `getLaneColorStyle(hexColor: string): { backgroundColor: string; color: string; borderColor: string }` — returns inline style object with background at 60% opacity (use `hexColor + '99'` for hex alpha), contrasting text color, and border color matching the hex
  - Follow TypeScript strict mode: export all functions with explicit return types, no unused parameters

- [x] T002 Update `webview-ui/src/components/GraphCell.tsx` to import `getColor` from `webview-ui/src/utils/colorUtils.ts`
  - Remove the inline `getColor` function definition (currently around lines 20-22)
  - Add import: `import { getColor } from '../utils/colorUtils'`
  - No other changes — verify graph rendering is unchanged

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm build` must pass. Graph rendering must look identical to before.

---

## Phase 2: User Story 1 — Badge Colors Match Graph Lane (Priority: P1) 🎯 MVP

**Goal**: All ref badges (branch, tag, stash) use the commit's graph lane color as background instead of fixed categorical colors.

**Independent Test**: Open extension on a multi-branch repo. Verify each commit's badges use the same color as its graph node circle/line.

### Implementation for User Story 1

- [x] T003 [P] [US1] Update `getRefStyle()` in `webview-ui/src/utils/refStyle.ts` to return layout-only Tailwind classes
  - Remove all `bg-*` and `text-*` color classes from each ref type case
  - Keep structural classes: for all types retain only layout classes (will be applied alongside inline color styles)
  - For `'merged-branch'`: keep `border` class (border color will be set via inline style)
  - The function should return only spacing/layout/border-structure classes — no color information
  - Ensure the function still handles all 5 DisplayRefType cases with no default fallthrough

- [x] T004 [P] [US1] Update `RefLabel` component in `webview-ui/src/components/RefLabel.tsx` to accept and apply lane color
  - Add `laneColor?: string` to `RefLabelProps` interface
  - When `laneColor` is provided: call `getLaneColorStyle(laneColor)` from `colorUtils.ts` and apply as inline `style` prop on the outer `<span>`
  - When `laneColor` is not provided: fall back to existing Tailwind class behavior (defensive — keeps component reusable)
  - For `'merged-branch'` type: apply `borderColor` from `getLaneColorStyle()` result to make the merged-branch border use the lane color
  - Import `getLaneColorStyle` from `'../utils/colorUtils'`

- [x] T005 [US1] Update `CommitRow` component in `webview-ui/src/components/CommitRow.tsx` to resolve lane color and pass to RefLabel
  - Read `userSettings.graphColors` from the Zustand store via `useGraphStore` (same selector pattern as GraphCell)
  - Build palette: `const palette = graphColors.length > 0 ? graphColors : ['#4ec9b0']` (same fallback as GraphCell)
  - Look up commit's node: `const node = topology.nodes.get(commit.hash)`
  - Resolve hex color: `const laneColor = node ? getColor(node.colorIndex, palette) : undefined`
  - Pass `laneColor={laneColor}` prop to each `<RefLabel>` render in the visible refs loop
  - Import `getColor` from `'../utils/colorUtils'`
  - Ensure the component remains memoized — `laneColor` derivation is O(1) and stable for a given commit/palette

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm build` must pass. All branch, tag, and stash badges should now use their commit's lane color. Icons must still be visible for type differentiation.

---

## Phase 3: User Story 2+3 — Ref Type Distinction & Readability (Priority: P2)

**Goal**: Verify that ref types remain distinguishable via icons/borders despite sharing lane colors, and that badge text is readable on all palette colors.

**Independent Test**: Find a commit with both a branch and a tag badge — confirm icons differentiate them. Check badges on commits across different lane colors — confirm text is always readable (dark text on light backgrounds, light text on dark backgrounds).

### Implementation for User Stories 2 & 3

- [x] T006 [US2] Verify and adjust ref type visual differentiation in `webview-ui/src/components/RefLabel.tsx`
  - Confirm that `getRefIcon()` returns distinct icons for each ref type (BranchIcon, TagIcon, etc.) — no code change expected, just verification
  - Confirm merged-branch border is visible against the lane color background — the border color from `getLaneColorStyle()` should provide sufficient contrast
  - If merged-branch border needs differentiation: consider using a lighter/darker shade or a white semi-transparent border instead of the lane color border, so merged branches stand out from local-only branches
  - Adjust if needed to ensure the `border` class on merged-branch badges creates a visible distinction

- [x] T007 [US3] Verify text contrast across all 10 default palette colors in `webview-ui/src/utils/colorUtils.ts`
  - Verify `getContrastTextColor()` returns appropriate text color for each of the 10 default colors:
    - Light text (#f5f5f5) for dark backgrounds: Red (#F44336), Blue (#2196F3), Purple (#9C27B0), Deep Orange (#FF5722), Indigo (#3F51B5)
    - Dark text (#1a1a1a) for light backgrounds: Yellow (#FFEB3B), Light Green (#8BC34A)
    - Verify remaining colors (Green #4CAF50, Orange #FF9800, Cyan #00BCD4) — adjust threshold if needed
  - If any color produces poor contrast: adjust the luminance threshold or the text color values

**Checkpoint**: All badge types remain visually distinguishable. Text is readable on all lane colors. `pnpm typecheck && pnpm lint && pnpm build` must pass.

---

## Phase 4: User Story 4 — Overflow Badge & HEAD Indicator (Priority: P3)

**Goal**: The overflow "+N" badge and HEAD icon use the lane color for visual consistency with the other badges.

**Independent Test**: View a commit with 4+ refs to trigger overflow badge — verify "+N" badge matches lane color. Check the HEAD commit — verify HEAD icon uses lane color.

### Implementation for User Story 4

- [x] T008 [P] [US4] Update `OverflowRefsBadge` in `webview-ui/src/components/OverflowRefsBadge.tsx` to accept and apply lane color
  - Add `laneColor?: string` to `OverflowRefsBadgeProps` interface
  - When `laneColor` is provided: replace hardcoded amber classes (`border-amber-500 text-amber-400 hover:border-amber-400 hover:text-amber-300`) with inline style using `getLaneColorStyle(laneColor)` — keep `cursor-pointer font-medium` and layout classes
  - Pass `laneColor` to each internal `<RefLabel>` render inside the popover content
  - Import `getLaneColorStyle` from `'../utils/colorUtils'`

- [x] T009 [P] [US4] Update HEAD indicator in `webview-ui/src/components/CommitRow.tsx` to use lane color
  - Find the HEAD icon render (currently uses `className="text-[var(--vscode-badge-foreground)]"`)
  - When `laneColor` is available: apply inline `style={{ color: laneColor }}` to the HEAD icon, replacing the CSS variable
  - When `laneColor` is not available: keep the existing CSS variable fallback

- [x] T010 [US4] Pass `laneColor` to `OverflowRefsBadge` in `webview-ui/src/components/CommitRow.tsx`
  - Find the `<OverflowRefsBadge>` render and add `laneColor={laneColor}` prop
  - This connects the resolved lane color to the overflow badge component

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm build` must pass. Overflow badge and HEAD icon match the lane color.

---

## Phase 5: User Story 5 — Dynamic Config Tracking (Priority: P2)

**Goal**: Badge colors update immediately when the user changes their graph color palette configuration.

**Independent Test**: Change `speedyGit.graphColors` in VS Code settings. Verify badges and graph lines update to the new colors in sync.

### Implementation for User Story 5

- [x] T011 [US5] Verify reactive palette tracking in `webview-ui/src/components/CommitRow.tsx`
  - Confirm that `useGraphStore((state) => state.userSettings.graphColors)` is read via a Zustand selector (not destructured from a larger object), so React re-renders CommitRow when graphColors changes
  - Confirm that the palette → laneColor derivation is inside the component body (not memoized with stale dependencies)
  - If the selector is not granular enough: adjust to select only `graphColors` to minimize re-renders
  - No code change expected if the Zustand selector pattern is correct — this is a verification task

**Checkpoint**: Change graph colors in settings. Verify badges update in sync with graph lines. No stale colors visible.

---

## Phase 6: Polish & Validation

**Purpose**: Final build validation and cleanup

- [x] T012 Run `pnpm typecheck` — zero TypeScript errors
- [x] T013 Run `pnpm lint` — zero ESLint errors
- [x] T014 Run `pnpm build` — clean build of both extension and webview
- [ ] T015 Manual smoke test via VS Code "Run Extension":
  - Open on a repo with multiple branches — badges match lane colors
  - Verify different ref types (branch, tag, stash) have distinct icons
  - Verify text readability on all visible lane colors
  - Find a commit with 4+ refs — verify overflow badge uses lane color
  - Check HEAD commit — verify HEAD icon uses lane color
  - Change `speedyGit.graphColors` in settings — verify badges update immediately
  - Reset to default colors — verify badges revert correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start here
- **Phase 2 (US1)**: Depends on Phase 1 (T001, T002). T003 and T004 can run in parallel. T005 depends on T003 and T004.
- **Phase 3 (US2+US3)**: Depends on Phase 2. Verification/adjustment tasks.
- **Phase 4 (US4)**: Depends on Phase 1. T008 and T009 can run in parallel. T010 depends on T008.
- **Phase 5 (US5)**: Depends on Phase 2. Verification task.
- **Phase 6 (Polish)**: Depends on all previous phases.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — core MVP
- **US2 (P2)**: Depends on US1 — verifies type differentiation after color change
- **US3 (P2)**: Depends on Foundational — verifies contrast function correctness
- **US4 (P3)**: Depends on Foundational — independent from US1 (different files)
- **US5 (P2)**: Depends on US1 — verifies reactive palette tracking

### Parallel Opportunities

**Within Phase 1:**
- T001 must complete before T002

**Within Phase 2 (US1):**
- T003 and T004 can run in parallel (different files: refStyle.ts vs RefLabel.tsx)
- T005 depends on both T003 and T004

**Across Phases:**
- Phase 4 (US4: T008, T009) can run in parallel with Phase 2 (US1) after Phase 1 completes
- Phase 3 (US2+US3) and Phase 5 (US5) must wait for Phase 2

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001, T002)
2. Complete Phase 2: User Story 1 (T003, T004, T005)
3. **STOP and VALIDATE**: Open extension — all badges should match lane colors
4. This delivers the core feature value

### Incremental Delivery

1. Phase 1 → Foundational utilities ready
2. Phase 2 → US1: Core badge coloring (MVP!)
3. Phase 3 → US2+US3: Verify type distinction + readability
4. Phase 4 → US4: Overflow + HEAD consistency
5. Phase 5 → US5: Verify config tracking
6. Phase 6 → Final validation

---

## Notes

- All changes are webview-only — no backend modifications needed
- No new packages required — no install commands needed
- Follow TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Follow project coding preferences: clean, readable, self-documenting code with explicit types
- DRY: `getColor()` is extracted once into `colorUtils.ts` and shared between GraphCell and CommitRow
- Single responsibility: `colorUtils.ts` handles color math only; `refStyle.ts` handles layout classes only
- Inline styles for dynamic colors, Tailwind for static layout — consistent with React best practices for computed values
