# Implementation Plan: Badge Lane Color Matching

**Branch**: `019-badge-lane-color` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/019-badge-lane-color/spec.md`

## Summary

Replace fixed categorical badge colors (green=branch, blue=remote, yellow=tag, purple=stash) with dynamic colors derived from each commit's graph lane. Badge background uses the same hex color as the commit's graph node/line, with auto-contrasting text. Ref type differentiation is preserved via existing icons and border styles. Badge colors dynamically track the user-configurable color palette.

## Technical Context

**Language/Version**: TypeScript 5.x (strict with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
**Primary Dependencies**: React 18, Zustand, @tanstack/react-virtual, @radix-ui/react-context-menu, Tailwind CSS
**Storage**: N/A (in-memory Zustand store)
**Testing**: Manual smoke test via VS Code "Run Extension" launch config
**Target Platform**: VS Code Extension (webview) — VS Code 1.80+
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: 60 fps scroll performance maintained; no additional per-row computation beyond O(1) color lookup
**Constraints**: Webview-only change; no backend modifications needed
**Scale/Scope**: Affects 5 files in `webview-ui/src/`, creates 1 new utility file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Color lookup is O(1) (palette index modulo). Luminance calculation is O(1) per badge render. No additional data fetching or computation. |
| II. Clean Code & Simplicity | PASS | Extracts shared `getColor` and adds `getLaneColorStyle` utility. No clever abstractions. Single responsibility maintained. |
| III. Type Safety & Explicit Error Handling | PASS | No new shared types needed. Existing `CommitNode.colorIndex` used as-is. No new error paths. |
| IV. Library-First | PASS | No new libraries needed. Luminance calculation is a ~10 line pure function — too small to warrant a library. |
| V. Dual-Process Architecture | PASS | All changes are webview-only (frontend). No backend changes. No new message types. |

**Post-Phase 1 Re-check**: All principles still PASS. No new shared types or message contracts introduced. The `colorUtils.ts` utility is webview-only.

## Project Structure

### Documentation (this feature)

```text
specs/019-badge-lane-color/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
webview-ui/src/
├── utils/
│   ├── colorUtils.ts        # NEW: getColor(), getContrastTextColor(), getLaneColorStyle()
│   └── refStyle.ts          # MODIFY: return layout-only classes (remove bg/text color classes)
├── components/
│   ├── CommitRow.tsx         # MODIFY: resolve lane color, pass to RefLabel + OverflowRefsBadge
│   ├── RefLabel.tsx          # MODIFY: accept laneColor prop, apply inline styles
│   ├── OverflowRefsBadge.tsx # MODIFY: accept laneColor prop, apply inline styles
│   └── GraphCell.tsx         # MODIFY: import getColor from colorUtils instead of inline
```

**Structure Decision**: This is a webview-only change. All modifications are within `webview-ui/src/`. One new file (`colorUtils.ts`) is created to extract and share the color resolution logic currently inline in GraphCell. No backend, shared type, or message contract changes.

## File Change Details

### 1. NEW: `webview-ui/src/utils/colorUtils.ts`

Extract and extend color utilities:
- `getColor(colorIndex: number, palette: string[]): string` — moved from GraphCell.tsx
- `getContrastTextColor(hexColor: string): string` — returns dark or light text color based on luminance
- `getLaneColorStyle(hexColor: string): { backgroundColor: string; color: string }` — returns inline style object for badges

### 2. MODIFY: `webview-ui/src/utils/refStyle.ts`

- `getRefStyle(type)` returns only layout/structural Tailwind classes (spacing, border for merged-branch) — removes `bg-*` and `text-*` color classes
- Merged-branch still gets `border` class but border color will be applied inline

### 3. MODIFY: `webview-ui/src/components/CommitRow.tsx`

- Read `userSettings.graphColors` from the Zustand store (same pattern as GraphCell)
- Look up `topology.nodes.get(commit.hash)` to get `colorIndex`
- Resolve hex color via `getColor(colorIndex, palette)`
- Pass `laneColor: string` prop to each `RefLabel` and `OverflowRefsBadge`
- Apply lane color to HEAD indicator icon

### 4. MODIFY: `webview-ui/src/components/RefLabel.tsx`

- Add `laneColor?: string` prop to `RefLabelProps`
- When `laneColor` provided: apply `getLaneColorStyle(laneColor)` as inline style
- When `laneColor` not provided: fall back to current Tailwind class behavior (defensive)
- Merged-branch border color uses laneColor with adjusted opacity

### 5. MODIFY: `webview-ui/src/components/OverflowRefsBadge.tsx`

- Add `laneColor?: string` prop
- Replace hardcoded amber classes with inline styles derived from `getLaneColorStyle(laneColor)`
- Popover content: pass `laneColor` to internal RefLabel renders

### 6. MODIFY: `webview-ui/src/components/GraphCell.tsx`

- Import `getColor` from `colorUtils.ts` instead of defining it inline
- No other changes needed
