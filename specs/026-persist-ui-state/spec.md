# Feature Specification: Persist UI State

**Feature Branch**: `026-persist-ui-state`
**Created**: 2026-03-30
**Status**: Draft
**Input**: User description: "Preserve the user's last-used commit details UI state across panel close/reopen, VS Code reload, and extension updates."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore Panel Position After Reopen (Priority: P1)

A user repositions the commit details panel from the default bottom position to the right side. They close the panel, then reopen it. The panel appears on the right side, exactly where they left it.

**Why this priority**: Panel position is the most visible and frequently adjusted UI preference. Losing it on every reopen is the primary frustration this feature addresses.

**Independent Test**: Can be tested by changing the panel position, closing the panel, reopening it, and verifying the position is restored.

**Acceptance Scenarios**:

1. **Given** the user has moved the panel to the right, **When** the panel is closed and reopened, **Then** the panel opens on the right side and the position toggle icon shows "Move to Bottom."
2. **Given** the user has the panel on the bottom (default), **When** the panel is closed and reopened, **Then** the panel opens on the bottom and the position toggle icon shows "Move to Right."

---

### User Story 2 - Restore All UI Preferences After VS Code Reload (Priority: P1)

A user has customized their commit details panel: positioned it on the right, switched file changes to tree view, and resized the panel. They reload VS Code. When they open the commit details panel again, all three preferences (position, view mode, and size) are restored.

**Implementation note**: US2 is an integration validation story. Its implementation is the persistence foundation (shared types, message contracts, extension host read/write, Zustand hydration) combined with the individual field persistence from US1, US3, and US4. US2 is validated end-to-end after all other stories are complete.

**Why this priority**: VS Code reload is a common event (extension updates, settings changes, workspace switching). Losing all UI preferences on reload undermines user trust and productivity.

**Independent Test**: Can be tested by setting all three preferences, reloading VS Code, opening the panel, and verifying all preferences are restored.

**Acceptance Scenarios**:

1. **Given** the user has set panel position to right, file view to tree, and resized the panel, **When** VS Code reloads, **Then** all three preferences are restored when the panel is next opened.
2. **Given** the user has never customized any preferences, **When** VS Code reloads, **Then** the panel opens with default settings (bottom position, list view, default sizes).

---

### User Story 3 - Restore File Change View Mode (Priority: P2)

A user switches the commit details file change view from the default list mode to tree mode. They close and reopen the panel. The file changes are displayed in tree mode.

**Why this priority**: View mode is a strong personal preference that rarely changes once set. Restoring it avoids repetitive toggling.

**Independent Test**: Can be tested by switching to tree view, closing the panel, reopening it, and verifying tree view is active.

**Acceptance Scenarios**:

1. **Given** the user has switched to tree view, **When** the panel is closed and reopened, **Then** file changes display in tree view and the view mode toggle icon reflects tree mode.
2. **Given** the user has switched back to list view, **When** the panel is closed and reopened, **Then** file changes display in list view and the view mode toggle icon reflects list mode.

---

### User Story 4 - Restore Panel Size (Priority: P2)

A user resizes the commit details panel to their preferred dimensions. When the panel is reopened (or VS Code reloads), the panel size is restored to the user's last-used dimensions, respecting the current panel position.

**Why this priority**: Panel size customization is a comfort preference. Restoring it prevents the user from re-dragging the resize handle every session.

**Independent Test**: Can be tested by resizing the panel, closing and reopening it, and verifying the size is approximately restored.

**Acceptance Scenarios**:

1. **Given** the user has resized the bottom panel height, **When** the panel is reopened in bottom position, **Then** the panel height matches the last saved value.
2. **Given** the user has resized the right panel width, **When** the panel is reopened in right position, **Then** the panel width matches the last saved value.
3. **Given** the user switches panel position from bottom to right, **When** the panel renders on the right, **Then** the right-side width uses the last saved right-side width (not the bottom height).

---

### Edge Cases

- What happens when saved state contains invalid values (e.g., negative dimensions, unrecognized position strings)? The system falls back to defaults.
- What happens when the saved state schema changes in a future extension update? The system detects the mismatch, falls back to defaults, and creates a fresh saved state.
- What happens when the user has never opened the commit details panel? No saved state exists; the panel uses built-in defaults and creates a saved state on first interaction.
- What happens when the saved panel size exceeds the current viewport? The system uses the saved value and lets the existing resize constraints handle clamping to valid bounds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist the commit details panel position (bottom or right) across panel close/reopen and VS Code reload.
- **FR-002**: System MUST persist the file change view mode (list or tree) across panel close/reopen and VS Code reload.
- **FR-003**: System MUST persist the panel height (when in bottom position) and panel width (when in right position) as separate values across panel close/reopen and VS Code reload.
- **FR-004**: System MUST restore all persisted UI preferences when the commit details panel is opened, delivering persisted state as part of the initial data so the panel renders with the correct state from the first frame (no flash of defaults).
- **FR-005**: System MUST fall back to default values when no saved state exists or when the saved state is invalid or corrupted.
- **FR-006**: System MUST update the persisted state immediately when the user changes any of the persisted preferences.
- **FR-007**: System MUST NOT replace or remove the existing live state management; persistence supplements the existing in-memory state.
- **FR-008**: System MUST include a version identifier in the persisted state to support future schema migrations.
- **FR-009**: System MUST validate persisted values on load and discard any that are outside acceptable ranges or of incorrect types.
- **FR-010**: System MUST ensure all status icons (view mode toggle icon, panel position toggle icon) correctly reflect the restored state after hydration.

### Key Entities

- **Persisted UI State**: Represents the user's saved UI preferences for the commit details panel. Contains: panel position, file view mode, bottom panel height, right panel width, and a schema version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Panel position, file view mode, and panel size are correctly restored after closing and reopening the panel, with 100% consistency.
- **SC-002**: Panel position, file view mode, and panel size are correctly restored after reloading VS Code, with 100% consistency.
- **SC-003**: When no saved state exists, the panel opens with default settings and the user experiences no errors or delays.
- **SC-004**: Changing a UI preference persists within 1 second, so that an immediate VS Code reload still captures the change.
- **SC-005**: Existing panel interactions (selecting commits, viewing diffs, resizing, toggling position) continue to work with no regressions.
- **SC-006**: Invalid or corrupted saved state is handled gracefully with no error dialogs or broken UI; defaults are silently applied.
- **SC-007**: After state restoration, all toolbar icons (view type toggle, panel position toggle) display the correct icon for the restored state, with 100% consistency.

## Clarifications

### Session 2026-03-30

- Q: Should persisted state be global (shared across all workspaces) or per-workspace? → A: Global — shared across all workspaces.
- Q: Should panel sizes be stored as pixels or percentage of viewport? → A: Pixels — raw pixel values from the resize handle.
- Q: Should persisted state be sent before first render to avoid a flash of defaults? → A: Yes — send persisted state with initial data payload, hydrate before first render.

## Assumptions

- The extension host storage mechanism is available and reliable for storing small amounts of data (a few hundred bytes).
- Panel size values are stored as pixel values and the existing resize logic already handles viewport clamping.
- The "list" and "tree" view modes and "bottom" and "right" panel positions are the only valid options for their respective settings.
- Persistence occurs within the extension host, not in user-visible settings files. Users do not need to manually edit persisted state.
- Persisted state is global (shared across all workspaces), not per-workspace.
