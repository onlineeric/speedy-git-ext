# UI Contracts: Compare Refs (A vs B)

**Feature**: `042-compare-refs`

This document captures the webview-facing contracts that are not RPC messages: component props,
context-menu surface, and panel layout.

---

## CompareWidget (toggle-panel sibling of FilterWidget / SearchWidget)

```tsx
// webview-ui/src/components/CompareWidget.tsx
export function CompareWidget(): JSX.Element;
```

**Reads from `graphStore`**:

- `compareSelection: CompareSelection`
- `comparePanelUI: { loading, inlineError }`
- `branches: Branch[]` (for the slot dropdown's branch items)
- Tag list (already loaded via existing graph state)
- Recently-used items (from `compareSelection.recents`)

**Renders**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [ Base ▼ ]   ⇄   [ Target ▼ ]    ◯ 2-dot ⦿ 3-dot   [ Compare ]      │
│                                                                      │
│ <inline error / "No common ancestor" notice when applicable>         │
└──────────────────────────────────────────────────────────────────────┘
```

- Each slot is a `FilterableSingleSelectDropdown<SlotValue>` (Decision 6).
- The slot's trigger renders a chip showing the kind icon + label (FR-006).
- The ✕ clear affordance lives inside each slot's chip (FR-003).
- The mode toggle disables three-dot when either slot's `kind === 'workingTree'` (FR-011)
  with a tooltip.
- The Compare button is disabled when:
  - Either slot is `null` (FR-021), OR
  - The two slots are structurally equal (data-model §2 equality, FR-021), OR
  - `comparePanelUI.loading === true` (no double-dispatch).
- Inline error string from `comparePanelUI.inlineError` renders below the controls in red text.
  No toast (FR-034).

---

## ControlBar Compare button

The button already exists in `ControlBar.tsx` line 156 with `style={{ display: 'none' }}`. The
implementation removes the inline `display:none` and computes the color:

```ts
const compareSelection = useGraphStore(s => s.compareSelection);
const anySlotFilled = compareSelection.a !== null || compareSelection.b !== null;
const compareColor =
  activeToggleWidget === 'compare'
    ? TOGGLE_BUTTON_COLORS.active                            // light blue (open)
    : anySlotFilled
      ? TOGGLE_BUTTON_COLORS.filtered                        // light yellow (pending)
      : TOGGLE_BUTTON_COLORS.inactive;                       // default (idle)
```

The reuse of `TOGGLE_BUTTON_COLORS.filtered` matches the FilterWidget's "filters applied"
convention (FR-002 — light yellow for pending).

---

## CommitDetailsPanel — compare-result rendering

`CommitDetailsPanel` reads:

```ts
const compareResult = useGraphStore(s => s.compareResult);
const commitDetails = useGraphStore(s => s.commitDetails);
```

Rendering precedence:

1. If `compareResult !== null` → render compare layout (header + file list + per-file diff
   handler wired to `openCompareDiff`).
2. Else if `commitDetails !== null` → render existing single-commit layout (unchanged).
3. Else → render "no selection" placeholder (existing).

**Compare-mode header**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Compare:  Base [main]   →   Target [feature/x]    ⦿ 3-dot           │
│   42 files changed   +1,203  −576                                   │
│   ⓘ No common ancestor; showing endpoint diff   (only when fallback)│
└──────────────────────────────────────────────────────────────────────┘
```

The header renders chips for the two `SlotValue`s (same chip component used in the panel).
The mode badge (`2-dot` / `3-dot`) is read-only here — the toggle in the panel is the only edit
point.

**Loading indicator** (FR-025a): The panel shows the same spinner used for single-commit details
loading. While `comparePanelUI.loading === true`, render the spinner with a Cancel button (FR-025b)
that dispatches `cancelCompare`.

**File list**: Reuses the existing `FileChange[]` renderer (status icon, +/− counts,
binary/rename/mode-change indicators). Virtualization (FR-025) is inherited because the existing
file list is already virtualized for large diffs.

**File-row click**: Dispatches `openCompareDiff` (instead of `openDiff`) with the resolved hashes
from `compareResult.aResolvedHash` / `bResolvedHash`. For working-tree side, hash field is `null`.

---

## Context menus — additions

### CommitContextMenu

Add two menu items above the existing items:

| Item | Visible when | Disabled when | Action |
|---|---|---|---|
| **Set as Compare Base** | Always | Never | `setSlotA({ kind: 'commit', hash })` |
| **Compare with Base** | `compareSelection.a !== null` | `compareSelection.aResolvedHash === hash` (or structural same-hash) | `setSlotB({ kind: 'commit', hash })` + dispatch `compareRefs` immediately (FR-019) |

**Multi-selection** (≥2 commits): replace the two single-commit items with:

| Item | Visible when | Action |
|---|---|---|
| **Compare these commits** | `selectedCommits.length >= 2` | Find oldest/newest by graph index; if oldest has parent, set `a = { kind: 'commit', hash: <oldestParent> }`, else `a = { kind: 'emptyTree' }`; `b = { kind: 'commit', hash: <newest> }`; dispatch `compareRefs` (FR-015 + FR-016) |

For single selection (`selectedCommits.length === 1`), only the original two items appear.

### BranchContextMenu

Same two items as CommitContextMenu, but using `{ kind: 'branch', name, remote? }` instead of
`{ kind: 'commit', hash }`. The slot stores the branch name so future ref movement is reflected
(spec edge case "branch label").

### TagContextMenu

If a separate tag context menu exists (or tags are reached via the same commit menu), expose the
two items using `{ kind: 'tag', name }`. (Implementation note: tags currently render as labels
on commit rows; the context menu opened from a tag chip should pre-select tag-flavored slot
values rather than commit-flavored.)

### UncommittedContextMenu

Add the two items using `{ kind: 'workingTree' }` (FR-018). The mode toggle's three-dot disable
rule (FR-011) automatically engages because the slot is `workingTree`.

### StashContextMenu

**No changes** — stash compare is out of scope for v1 (FR-017, spec §Out of Scope). Do not add
any compare items to this menu.

### AuthorContextMenu / DateContextMenu

**No changes** — out of scope.

---

## Graph row markers (FR-026 — FR-028)

The existing `CommitRow` / `CommitTableRow` components read:

```ts
const aResolvedHash = useGraphStore(s => s.compareSelection.aResolvedHash);
const bResolvedHash = useGraphStore(s => s.compareSelection.bResolvedHash);
```

…and render a small "A" or "B" badge to the left of the commit hash chip when the row's
`commit.hash === aResolvedHash` or `=== bResolvedHash`. Both badges may show on the same row
(if A and B resolved to the same hash, but FR-021 prevents the user from clicking Compare in
that case so this is rare; render both anyway).

The badge does not replace existing branch / tag / HEAD chips (FR-027).

The "Uncommitted" pseudo-row never gets the marker (FR-028) — slot chips in the panel are the
only indicator there.

---

## Toggle-panel three-state contract (FR-002 recap)

For the Compare toolbar button only (Filter and Search remain unchanged):

| `activeToggleWidget` | `anySlotFilled` | Color |
|---|---|---|
| `'compare'` | (any) | `TOGGLE_BUTTON_COLORS.active` (light blue) |
| not `'compare'` | true | `TOGGLE_BUTTON_COLORS.filtered` (light yellow) |
| not `'compare'` | false | `TOGGLE_BUTTON_COLORS.inactive` (default) |

---

## Accessibility & keyboard

- Slot dropdowns inherit keyboard nav from `FilterableSingleSelectDropdown` (existing).
- The mode toggle is a radio group with `aria-disabled` on three-dot when disabled.
- The Compare button has `aria-disabled` reflecting its disabled state.
- The Cancel affordance during loading is a button with visible text "Cancel" (not just an icon).
- No new keyboard shortcuts in v1 (spec §Out of Scope).

---

## What this document does NOT specify

- Pixel-exact spacing / typography — defer to existing FilterWidget / SearchWidget conventions.
- Exact icon glyphs — use the existing icon library (`CompareIcon` already imported in
  `ControlBar.tsx`).
- Animations — use existing panel-open transition (no compare-specific motion).
