# Feature Specification: v2.0 UI Reorganization — Control Bar & Toggle Panel

**Feature Branch**: `030-v2`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: User description: "v2.0.0 UI reorganization — rearrange control bar, icon buttons, TogglePanel with Filter/Search/Compare widgets, button toggle states"

## Clarifications

### Session 2026-04-02

- Q: When the SearchWidget panel closes, should the active search state (highlighted rows) be cleared or kept? → A: The SearchWidget highlights commit rows (does not filter them). Closing the panel clears the highlights — same as current behavior. The widget is reused as-is with no behavioral changes; it simply moves into the TogglePanel.
- Q: Should the TogglePanel's open/closed state persist across VS Code session reload? → A: No persistence — panel always starts closed on every session/reload.
- Q: Should the TogglePanel open/close with a visual transition or instantly? → A: Instant show/hide, no animation — performance first.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Icon Buttons with Tooltips (Priority: P1)

A developer opens the git graph. All interactive buttons in the control bar (Filter, Search, Refresh, Fetch, Compare, Manage Remotes, Settings) display as icon-only buttons. Hovering any icon button shows a tooltip with its function name.

**Why this priority**: This is the foundational visual change that all other stories build on. Without icon buttons, the control bar remains cluttered. Delivers a cleaner UI even before toggle panels are added.

**Independent Test**: Can be fully tested by opening the graph panel and verifying each button renders as an icon with a readable tooltip on hover, with no regression in click behavior.

**Acceptance Scenarios**:

1. **Given** the graph panel is open, **When** the user looks at the control bar, **Then** Filter, Search, Refresh, Fetch, Compare, Manage Remotes, and Settings all display as icon-only buttons (no visible text labels).
2. **Given** any icon button is in the control bar, **When** the user hovers over it for a brief moment, **Then** a tooltip appears identifying the button's function.
3. **Given** icon buttons replace text buttons, **When** the user clicks Refresh or Fetch, **Then** the operation executes exactly as before (no regression).

---

### User Story 2 - Toggle Panel with Single Active Widget (Priority: P1)

A developer clicks the Search button. A panel appears below the control bar (above the commit list), displaying the Search widget. Clicking Search again collapses the panel and clears all row highlights. Clicking Filter while Search is active closes the Search widget and opens the Filter placeholder instead.

**Why this priority**: The TogglePanel is the core new interaction model. It must work correctly — only one widget visible at a time, height auto-adjusting — before individual widget content matters.

**Independent Test**: Can be tested by toggling each of the three buttons (Filter, Search, Compare) and confirming only one panel is visible at a time, the commit list shifts down accordingly, and closing restores the layout.

**Acceptance Scenarios**:

1. **Given** no toggle panel is open, **When** the user clicks Search, **Then** the TogglePanel appears showing the SearchWidget and the commit list shifts down to accommodate it.
2. **Given** the SearchWidget is open with highlighted rows, **When** the user clicks Search again, **Then** the panel collapses, highlights are cleared, and the commit list returns to its previous position.
3. **Given** the SearchWidget is open, **When** the user clicks Filter, **Then** the SearchWidget closes (highlights cleared), the FilterWidget opens, and the panel height adjusts to the new widget's height.
4. **Given** any widget is open, **When** the user clicks Compare, **Then** the CompareWidget placeholder panel appears (showing "Compare" label) replacing any currently open widget.

---

### User Story 3 - Button Toggle State Colors (Priority: P2)

A developer uses the Filter and Search buttons. Each button clearly communicates its current state through color: gray when inactive, highlighted (yellow/orange) when the panel is open and active. The Filter button additionally shows a distinct "filter active" color (purple/red) when filters are applied but its panel is closed. Search and Compare buttons have only two states (inactive/active) since they carry no persistent applied state.

**Why this priority**: Visual feedback prevents confusion about what is active. The three-state color system is important for the Filter button especially, since a user needs to know at a glance if filtering is affecting the commit list.

**Independent Test**: Can be tested by (a) clicking Filter to open → check active color, (b) closing Filter with no filters applied → check returns to gray, (c) applying a filter and closing panel → check filter-active color appears on Filter button.

**Acceptance Scenarios**:

1. **Given** no toggle panel is open and no filters applied, **When** the user views the control bar, **Then** all three toggle buttons (Filter, Search, Compare) display in their default/inactive color (gray).
2. **Given** a toggle panel is open, **When** the user looks at the corresponding button (Filter, Search, or Compare), **Then** that button displays in the active color (yellow or orange).
3. **Given** the Filter button's panel is closed but filters are currently applied, **When** the user views the control bar, **Then** the Filter button displays in the filter-active color (purple or red), distinct from both inactive and active states.
4. **Given** all three toggle buttons exist, **When** the color tokens for button states are defined, **Then** the same color constants for `inactive` and `active` states are used consistently across all three buttons.

---

### User Story 4 - Filter and Compare Placeholder Panels (Priority: P3)

A developer clicks Filter or Compare for the first time. Each opens a placeholder panel that clearly identifies what kind of widget it is, without full functionality yet. The existing Search widget is reused as-is inside the TogglePanel with identical highlight behavior.

**Why this priority**: Placeholder panels are the minimum viable content for Filter and Compare, allowing the full toggle interaction model to be completed and tested without requiring full widget implementations.

**Independent Test**: Can be tested by clicking Filter (sees "Filter" label in panel) and clicking Compare (sees "Compare" label in panel), while confirming Search still highlights commit rows normally.

**Acceptance Scenarios**:

1. **Given** the user clicks Filter, **When** the FilterWidget panel opens, **Then** a placeholder label or text identifying it as the "Filter" panel is visible.
2. **Given** the user clicks Compare, **When** the CompareWidget panel opens, **Then** a placeholder label or text identifying it as the "Compare" panel is visible.
3. **Given** the SearchWidget is open inside the TogglePanel, **When** the user types a search query, **Then** matching commit rows are highlighted exactly as they were before the v2 changes.

---

### Edge Cases

- What happens when the TogglePanel is open and the user resizes the VS Code panel? The commit list height should recalculate and remain below the TogglePanel.
- What happens if the user opens the Filter panel while the commit list is scrolled partway down? The scroll position should be preserved or adjust gracefully so the commit list remains usable.
- What happens when the graph panel is very narrow? Icon buttons should remain clickable and tooltips should not overflow the panel boundary.
- How does the CherryPickConflictBanner or RebaseConflictBanner interact with the TogglePanel when both are visible? Both should stack vertically without overlapping.
- When the SearchWidget panel is closed (by any means), all row highlights are immediately cleared — no residual highlighted state remains in the commit list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display Filter, Search, Refresh, Fetch, Compare, Manage Remotes, and Settings as icon-only buttons in the control bar (no text labels).
- **FR-002**: System MUST show a tooltip identifying each icon button's function when hovered.
- **FR-003**: System MUST render a TogglePanel area between the control bar and the commit list that shows only one widget at a time.
- **FR-004**: Users MUST be able to open the TogglePanel by clicking Filter, Search, or Compare buttons.
- **FR-005**: Users MUST be able to close the TogglePanel by clicking the currently active toggle button a second time.
- **FR-006**: System MUST automatically switch the visible widget when the user clicks a different toggle button while a panel is already open.
- **FR-007**: System MUST auto-adjust the TogglePanel height to match the active widget's content height, with the commit list repositioning below it.
- **FR-008**: System MUST display toggle buttons in visually distinct states: inactive (gray) and active/panel-open (yellow or orange) for all three toggle buttons; additionally, the Filter button MUST display a filter-applied/panel-closed state (purple or red) when filters are active.
- **FR-009**: All three toggle buttons MUST share the same color constants for their `inactive` and `active` states, defined in one place.
- **FR-010**: Filter button MUST display the filter-active color when filters are applied and the panel is closed.
- **FR-011**: The FilterWidget placeholder MUST display a text label identifying it as the Filter panel.
- **FR-012**: The CompareWidget placeholder MUST display a text label identifying it as the Compare panel.
- **FR-013**: The existing SearchWidget MUST be reused as-is inside the TogglePanel; its commit row highlight behavior MUST be preserved without modification. Closing the panel clears highlights (existing behavior unchanged).
- **FR-014**: Refresh and Fetch button behavior MUST be preserved without regression.

### Key Entities

- **TogglePanel**: A container that renders at most one child widget at a time; collapses entirely when no widget is active.
- **FilterWidget**: A placeholder widget (v2.0) that will house commit filtering controls in a future version.
- **SearchWidget**: The existing search widget, relocated into the TogglePanel. Highlights matching commit rows; closing the panel clears highlights. No behavioral changes from current implementation.
- **CompareWidget**: A placeholder widget (v2.0) that will house branch/commit comparison controls in a future version.
- **ToggleButtonState**: A state model driving toggle button appearance. Filter uses three values (`inactive`, `active`, `filtered`); Search and Compare use two (`inactive`, `active`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All seven control bar buttons render as icon-only with no visible text labels across all VS Code themes (dark, light, high contrast).
- **SC-002**: Every icon button displays a native tooltip (title attribute) on hover, consistent with VS Code's built-in hover behavior, in all button states (active, inactive, filtered).
- **SC-003**: Clicking any toggle button opens or closes the TogglePanel with no perceptible delay on standard hardware.
- **SC-004**: Only one widget is ever visible in the TogglePanel at a time — opening a second widget always closes the first.
- **SC-005**: The commit list never overlaps the TogglePanel at any panel height or VS Code window size.
- **SC-006**: The Filter button displays three visually distinguishable colors across its three states (inactive, active, filter-applied), identifiable without hover in all supported VS Code themes.
- **SC-007**: Zero regressions: closing the SearchWidget panel clears all row highlights; Refresh and Fetch execute identically to pre-v2 behavior; verified by manual smoke test.
- **SC-008**: Button state color constants are defined in a single location; changing a color token updates all buttons that share that state.

## Assumptions

- The Filter and Compare widgets will contain only placeholder content in v2.0; full implementations are out of scope for this feature.
- Icon selection for new buttons (Filter, Compare) will use custom SVG components following the existing pattern in `icons/index.tsx`, consistent with all other icons in the extension (the project has no Codicons dependency).
- "Auto-adjusted height" means the TogglePanel uses natural/content height (not a fixed pixel value), and the commit list reflows below it.
- Tooltip behavior follows patterns already established in the codebase (consistent with existing buttons).
- Existing conflict banners (CherryPick, Rebase) and SubmoduleBreadcrumb stack above the TogglePanel in the vertical layout order and are not affected by this change.
- Button color constants will be defined as shared values (CSS custom properties or equivalent) so they apply consistently across all VS Code themes.
- The TogglePanel does not persist its open/closed state. It always starts closed when the VS Code panel is opened or reloaded — no globalState or workspace storage is used for this feature.
- The TogglePanel appears and disappears instantly with no animation or transition — consistent with VS Code's native UI patterns and the project's performance-first principle.
