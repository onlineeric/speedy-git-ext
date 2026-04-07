# Implementation Plan: Text Filter in Filter Widget

**Branch**: `035-text-filter` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-text-filter/spec.md`

## Summary

Add a "Message" text input field to the Filter Widget that hides non-matching commits (by commit message and hash prefix), following the same client-side visibility filter pattern already used by the Author filter. The text filter combines as an AND operation with all existing filters (Branch, Author, Date Range).

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: React 18, Zustand, Tailwind CSS
**Storage**: N/A (in-memory Zustand state only)
**Testing**: Vitest
**Target Platform**: VS Code Extension (webview)
**Project Type**: VS Code extension (desktop-app)
**Performance Goals**: Filter 10,000 commits in <200ms
**Constraints**: Client-side only; no new server calls; no new packages
**Scale/Scope**: Operates on loaded commits (default batch 500, up to 10k+)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Client-side `Set<string>` iteration matches existing Author filter pattern. Simple `includes()` on strings is O(n) over loaded commits — well within 200ms for 10k commits. Debounce (150ms) prevents redundant recalculations. |
| II. Clean Code & Simplicity | PASS | Extends existing `computeHiddenCommitHashes()` function with ~5 lines. New UI row follows identical pattern to Authors/Dates rows. No new abstractions. |
| III. Type Safety & Explicit Error Handling | PASS | New `textFilter` field added to `GraphFilters` in `shared/types.ts`. No new error paths — text matching is infallible. |
| IV. Library-First & Purpose-Built Tools | PASS | No new packages needed. Plain text matching via `String.includes()` is appropriate here (not structured data). |
| V. Dual-Process Architecture Integrity | PASS | Purely frontend change. No backend modifications. `shared/types.ts` updated for the shared `GraphFilters` type. |

**Agent Restrictions**: No packages to install. No git operations needed.

## Project Structure

### Documentation (this feature)

```text
specs/035-text-filter/
├── plan.md              # This file
├── research.md          # Phase 0 output (no unknowns — minimal)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
shared/
└── types.ts                         # Add textFilter field to GraphFilters

webview-ui/src/
├── stores/
│   └── graphStore.ts                # Add text matching to computeHiddenCommitHashes()
└── components/
    └── FilterWidget.tsx             # Add Message text input row with debounce + clear
```

**Structure Decision**: No new files or directories needed. All changes are additions to existing files, following established patterns.

## Complexity Tracking

No constitution violations. Table not needed.

## Detailed Design

### 1. Type Change — `shared/types.ts:118`

Add `textFilter?: string` to `GraphFilters` interface. This is the only shared type change.

### 2. Hidden Hash Computation — `graphStore.ts:40`

Extend `computeHiddenCommitHashes()` to also check `filters.textFilter`. After the existing author filter loop, add text matching:

- When `textFilter` is set and non-empty, iterate all commits (skipping stashes as existing code does).
- A commit is hidden if its `subject` does NOT contain the text (case-insensitive) AND its `hash` does NOT start with the text (when text length >= 4).
- Both author and text filters are AND — a commit must pass BOTH to remain visible. The simplest approach: the existing author loop already adds to the `hidden` set; add a second pass for text, OR combine both checks in a single pass.

**Single-pass optimization**: Combine author + text checks in one loop to avoid double iteration. A commit is hidden if it fails EITHER the author check OR the text check.

### 3. UI — `FilterWidget.tsx`

Add a "Message" row after the Dates section (before the datepicker portal div), matching the layout pattern of existing rows:

```
<div className="flex gap-2">
  <span className="... w-16 ...">Message</span>
  <div className="flex-1 ...">
    <input type="text" ... />  (with clear button when non-empty)
  </div>
</div>
```

**State management**:
- Local `useState` for the input text (immediate UI response).
- `useEffect` with 150ms debounce (same as date filter pattern) to call `setFilters({ textFilter })` then `recomputeVisibility()`.
- No server call needed (unlike branch/date filters).

**Clear button**: An "x" button inside or adjacent to the input, visible only when text is non-empty. On click: clear local state and filter.

**`hasAnyFilters` update**: Add `|| filters.textFilter` to the existing check at line 173, so the "Reset All" button appears when only a text filter is active.

**`handleResetAll` update**: No change needed — `resetAllFilters()` already clears all fields except `maxCount` (and optionally `branches`), so `textFilter` will be cleared automatically. However, `hadStructuralFilters` check at line 164 should NOT include `textFilter` (it's client-side, no re-fetch needed).

### 4. Existing Behavior — No Changes Needed

- `searchFilter.ts` — Search highlighting is independent; no changes.
- `GraphContainer.tsx` — Already handles `hiddenCommitHashes` for prefetch and rendering.
- `graphTopology.ts` — Already handles dotted lines for hidden commits via `hiddenHashes`.
- `resetAllFilters()` — Already works correctly for new fields.
- `appendCommits()` — Already calls `computeHiddenCommitHashes()` for new batches.
- Backend services — No changes (text filter is purely client-side).
