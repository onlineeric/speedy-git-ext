# Implementation Plan: UI Panel & Toolbar Polish

**Branch**: `021-ui-panel-toolbar-polish` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/021-ui-panel-toolbar-polish/spec.md`

## Summary

Seven small UI improvements to the commit details panel and toolbar: fix right-side panel resize by adding `relative` positioning, add max width cap (200px minimum graph area), reorganize toolbar buttons (Refresh → Fetch → Search, move Manage Remotes to cloud icon), clear commit state on repo switch, and improve panel header buttons (SVG icons, labels, larger click targets).

## Technical Context

**Language/Version**: TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand, Tailwind CSS, Vite (webview build), esbuild (extension build)
**Storage**: N/A (in-memory Zustand store)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension API (1.80+), webview (browser sandbox)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Smooth 60fps resize dragging, instant state clearing on repo switch
**Constraints**: No new dependencies. All SVG icons hand-crafted following existing pattern.
**Scale/Scope**: 4 files modified, ~100 lines changed, 0 new files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Resize uses existing mouse event pattern (no new listeners). State clearing is synchronous `set()`. |
| II. Clean Code & Simplicity | PASS | No new abstractions. Icons follow existing pattern. Minimal changes per file. |
| III. Type Safety & Explicit Error Handling | PASS | No new shared types needed. Existing `DetailsPanelPosition` type covers all cases. |
| IV. Library-First | PASS | No new packages. Hand-crafted SVGs follow established project pattern (9 existing icons). |
| V. Dual-Process Architecture | PASS | All changes are webview-only (frontend). No backend changes. No new message types. |

**Post-Phase 1 Re-check**: All gates still pass. No new patterns, abstractions, or contracts introduced.

## Project Structure

### Documentation (this feature)

```text
specs/021-ui-panel-toolbar-polish/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: root cause analysis and design decisions
├── data-model.md        # Phase 1: state changes (no new entities)
├── quickstart.md        # Phase 1: files to modify and validation steps
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files modified)

```text
webview-ui/src/
├── components/
│   ├── icons/
│   │   └── index.tsx          # Add CloudIcon, CloseIcon, MoveRightIcon, MoveBottomIcon
│   ├── CommitDetailsPanel.tsx  # Fix resize, update header buttons
│   └── ControlBar.tsx          # Reorder buttons, cloud icon for Manage Remotes
└── stores/
    └── graphStore.ts           # Clear commit state on repo switch
```

**Structure Decision**: Existing VS Code extension structure (backend in `src/`, frontend in `webview-ui/src/`). All changes are in the webview frontend layer. No new files created.

## Implementation Details

### Change 1: Fix Right-Side Panel Resize (FR-001, FR-002)

**Root cause**: The `CommitDetailsPanel` container div lacks `position: relative`, so the absolutely-positioned `ResizeHandle` (for right position) doesn't position within the panel. It floats relative to a higher ancestor.

**Fix**:
- Add `relative` to the panel container's className
- In `handleResizeStart`, read the parent container's width to compute max allowed panel width (`containerWidth - 200`)
- Apply `Math.min(maxWidth, newSize)` alongside the existing `Math.max(MIN_SIZE, ...)` constraint

### Change 2: Toolbar Button Reorganization (FR-003, FR-004, FR-005, FR-010)

**New ControlBar order** (left → right):
1. `RepoSelector` (conditional)
2. `FilterableBranchDropdown`
3. **Refresh** button (primary) — moved before Fetch
4. **Fetch** button (secondary) — moved after Refresh
5. **Search** button (secondary) — stays last of action buttons
6. `ml-auto` spacer + loaded commits count text
7. **CloudIcon button** (Manage Remotes) — new icon-only button
8. **Settings gear** button (⚙) — unchanged
9. `RemoteManagementDialog` (hidden, render-only) — unchanged

### Change 3: Clear State on Repo Switch (FR-006)

Modify `setActiveRepo` in graphStore.ts to add these fields to the `set()` call:
```
selectedCommit: undefined,
selectedCommitIndex: -1,
selectedCommits: [],
lastClickedHash: undefined,
commitDetails: undefined,
detailsPanelOpen: false,
```

### Change 4: Panel Header Button Improvements (FR-007, FR-008, FR-009)

**Move button**: Replace Unicode arrows (⇥/⇩) with `MoveRightIcon`/`MoveBottomIcon` SVG + text label ("Move to right" / "Move to bottom"). Increase padding for larger click target.

**Close button**: Replace Unicode `✕` with `CloseIcon` SVG. Increase padding to match move button sizing.

**Both buttons**: Increase from `px-1.5 py-0.5 text-xs` to `px-2 py-1 text-xs` with `gap-1` for icon+label spacing.

### New SVG Icons

4 new icons added to `webview-ui/src/components/icons/index.tsx`, following existing `IconProps` pattern (12×12 viewBox, `currentColor`, `aria-hidden`):

- **CloudIcon**: Cloud shape for Manage Remotes button
- **CloseIcon**: X shape for panel close button
- **MoveRightIcon**: Right-pointing arrow for "Move to right"
- **MoveBottomIcon**: Down-pointing arrow for "Move to bottom"

## Complexity Tracking

> No constitution violations. No complexity tracking needed.
