# Feature Specification: Badge Lane Color Matching

**Feature Branch**: `019-badge-lane-color`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "Badge colors (branch, tag, stash, etc.) currently use fixed semantic colors unrelated to the graph. Change all badge colors to match the commit's lane/line color in the graph, so users can visually associate badges with the graph line they belong to."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Badge Colors Match Graph Lane (Priority: P1)

As a user viewing the git graph, I want every badge (branch, tag, stash) on a commit row to use the same color as that commit's graph lane, so I can instantly see which graph line the commit belongs to without tracing horizontally across the row.

**Why this priority**: This is the core value of the feature. Without it, badge colors are categorical (green=local, blue=remote, yellow=tag, purple=stash) and carry no spatial information about graph position. Users currently must visually trace from the badge across to the graph node to understand which branch line the commit sits on.

**Independent Test**: Can be fully tested by opening the extension on a repository with multiple branches and verifying that each commit's badges use the same color as its graph node circle and connecting lines.

**Acceptance Scenarios**:

1. **Given** a commit sits on a green graph lane, **When** the commit row renders with a local branch badge, **Then** the badge background uses the same green color as the graph lane (not the fixed categorical green).
2. **Given** a commit sits on a blue graph lane, **When** the commit row renders with a tag badge, **Then** the tag badge background uses the same blue color as the graph lane (not the fixed categorical yellow).
3. **Given** a commit sits on an orange graph lane, **When** the commit row renders with a remote branch badge, **Then** the remote branch badge background uses the same orange color as the graph lane.
4. **Given** a commit sits on a purple graph lane, **When** the commit row renders with a stash badge, **Then** the stash badge background uses the same purple color as the graph lane.

---

### User Story 2 - Distinguish Ref Types While Using Lane Colors (Priority: P2)

As a user, I want to still be able to distinguish between different ref types (local branch, remote branch, tag, stash) even though they all share the same lane color, so I don't lose the categorical information currently conveyed by the fixed badge colors.

**Why this priority**: If all badges on a commit use the same background color, users lose the ability to tell branch from tag from stash at a glance. A visual differentiator (such as the existing icons, border style, or label prefix) must remain.

**Independent Test**: Can be tested by looking at a commit that has multiple ref types (e.g., a local branch AND a tag) and confirming that the type of each badge is still distinguishable despite sharing the same background color.

**Acceptance Scenarios**:

1. **Given** a commit has both a local branch badge and a tag badge, **When** the badges render, **Then** each badge still clearly indicates its type through an existing visual cue (icon, border, or text prefix) even though both share the same lane color background.
2. **Given** a commit has a merged-branch badge (local + remote), **When** the badge renders, **Then** the merged-branch status remains visually distinguishable from a local-only branch badge (e.g., via the existing border indicator).

---

### User Story 3 - Badge Readability Across All Lane Colors (Priority: P2)

As a user, I want badge text to remain readable regardless of which lane color is used as the background, so I can always read badge labels without straining.

**Why this priority**: The 10-color graph palette includes both dark colors (indigo, purple) and bright colors (yellow, light green). Badge text must remain legible on all backgrounds.

**Independent Test**: Can be tested by inspecting badge text contrast on commits across all 10 default lane colors and verifying readability.

**Acceptance Scenarios**:

1. **Given** a commit sits on a lane with a light background color (e.g., yellow #FFEB3B), **When** the badge renders, **Then** the badge text uses a dark color that is clearly readable.
2. **Given** a commit sits on a lane with a dark background color (e.g., indigo #3F51B5), **When** the badge renders, **Then** the badge text uses a light color that is clearly readable.

---

### User Story 4 - Overflow Badge and HEAD Indicator Consistency (Priority: P3)

As a user, when there are more refs than can be displayed (overflow "+N" badge) or a HEAD indicator, I want these to also use the lane color for visual consistency.

**Why this priority**: Less impactful than the core badges, but inconsistency between regular badges and the overflow/HEAD indicators would look jarring.

**Independent Test**: Can be tested by viewing a commit with many refs that triggers the overflow badge, and verifying the "+N" badge and HEAD icon also match the lane color.

**Acceptance Scenarios**:

1. **Given** a commit on a red lane has more refs than `maxVisibleRefs`, **When** the overflow "+N" badge renders, **Then** it uses the same red lane color as the other badges on that row.
2. **Given** the HEAD commit sits on a cyan lane, **When** the HEAD icon renders, **Then** it uses the cyan lane color.

---

### User Story 5 - Badges Update When Line Colors Are Reconfigured (Priority: P2)

As a user, when I change my graph line color configuration, I want all badge colors to immediately update to match the new line colors, so badge and graph colors are never out of sync.

**Why this priority**: The graph color palette is user-configurable. If badge colors are derived from line colors at initial render but don't track config changes, badges would show stale colors after a palette change, breaking the core visual association.

**Independent Test**: Can be tested by changing the graph color palette in settings, then verifying that all badge colors on the graph update to match the new line colors without requiring a reload.

**Acceptance Scenarios**:

1. **Given** a user changes their graph color palette from the default to a custom set of colors, **When** the graph re-renders with the new palette, **Then** all badges on every commit row update to use the new lane colors from the updated palette.
2. **Given** a user removes all custom colors (resetting to defaults), **When** the graph re-renders, **Then** all badges revert to using the default palette colors matching their respective lanes.

---

### Edge Cases

- What happens when a user has customized the graph color palette to fewer than 10 colors? Badge colors should still correctly cycle through the custom palette (same as the graph does).
- What happens when a user has customized the graph palette to a single color? All badges across all lanes use that one color; ref type differentiation still works via icons/borders.
- How does the feature behave with the default fallback color (#4ec9b0) when no custom palette is set and `graphColors` is empty? Badges should use the same fallback color as the graph.
- What happens when the color palette is changed while the graph is visible? Badge colors must update in the same render cycle as the graph lines — no stale badge colors should be visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All ref badges (local branch, remote branch, merged branch, tag, stash) on a commit row MUST use the commit's graph lane color as their background color instead of the current fixed categorical colors.
- **FR-002**: Badge text color MUST automatically adjust (light or dark) to maintain readability against the lane color background.
- **FR-003**: Ref type MUST remain visually distinguishable through existing mechanisms (icons and/or border styles) when multiple badge types share the same lane color background.
- **FR-004**: The overflow refs badge ("+N") MUST use the commit's lane color for visual consistency.
- **FR-005**: The HEAD indicator MUST use the commit's lane color for visual consistency.
- **FR-006**: Badge colors MUST dynamically follow the current graph color palette at all times. When a user changes their line color configuration, badge colors MUST update to reflect the new palette immediately (on the same render cycle as the graph lines), using the same color resolution logic as the graph itself.
- **FR-007**: The merged-branch visual indicator (currently a distinct border) MUST remain visible and distinguishable when badge backgrounds change to lane colors.

### Key Entities

- **CommitNode**: Already contains `colorIndex` indicating which palette color the commit's lane uses. This is the source of truth for badge coloring.
- **DisplayRef**: Categorizes refs by type (local-branch, remote-branch, merged-branch, tag, stash). Type differentiation must be preserved visually.
- **Graph Color Palette**: User-configurable array of hex colors. Badge colors must follow the same palette and cycling logic as the graph.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of ref badges on any commit row visually match the color of that commit's graph lane node/line.
- **SC-002**: Badge text is readable (sufficient contrast) on all 10 default palette colors and any reasonable user-customized palette.
- **SC-003**: Users can still distinguish ref types (branch vs. tag vs. stash) at a glance through non-color visual cues.
- **SC-004**: No visual regression when users have customized graph color palettes — badges use the same custom colors as the graph.
- **SC-005**: When a user changes the graph color palette configuration, badge colors update immediately in sync with the graph lines — no stale colors are ever visible.

## Assumptions

- The existing icon-based and border-based differentiation for ref types (branch icon, tag icon, stash icon, merged-branch border) is sufficient to maintain type identification without relying on background color differences.
- The `CommitNode.colorIndex` data is already available or easily accessible in the component that renders badges (CommitRow), since GraphCell in the same row already uses it.
- A simple luminance-based heuristic (light text on dark backgrounds, dark text on light backgrounds) provides adequate contrast for readability without needing full WCAG AAA compliance calculations.
