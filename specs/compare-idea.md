# Compare feature idea spec

> Brainstorm result. Captures the problem, scope decisions, and proposed UX for an A-vs-B compare feature in Speedy Git. Intended as input for the speckit full workflow.

## 1. Problem statement

Branch / commit / working-tree comparison is the biggest graph-specific gap between Speedy Git and competitors (Git Graph, Git History, GitLens). All three competitors make compare flows first-class. Speedy Git currently has no compare request or UI in the message contract — only single-commit details and file diffs (see `shared/messages.ts`).

The feature lets a user pick **two arbitrary points in history** and see everything that changed between them, instead of inspecting one commit at a time. Typical use cases:

- Review what a feature branch added vs `main` (PR-style diff).
- See what changed between two release tags.
- Check drift between local branch and `origin/...`.
- See what's different in the working tree compared to any past ref.
- Inspect what a range of commits introduced as a whole.

## 2. Comparison model — "A vs B"

### 2.1 Both sides are just "commit-ish"

In git, a **commit hash, branch, tag, `HEAD`, `HEAD~3`, `origin/main`** all resolve to a single commit. To `git diff`, they are interchangeable. So the matrix collapses: A and B are each just "any commit-ish (or sentinel)."

| Mix | Supported | Notes |
|---|---|---|
| commit vs commit | yes | `git diff <A> <B>` |
| branch vs branch | yes | PR-style use case |
| tag vs tag | yes | Release diff |
| commit vs branch | yes | All resolve to commits |
| branch vs tag | yes | Same |
| commit vs tag | yes | Same |
| Working Tree vs any ref | yes | Sentinel slot value |
| HEAD vs any ref | yes | Sentinel slot value |
| range vs range | no | Only via `git range-diff` (niche, skipped) |
| range vs single ref | no | A range is not a point |

### 2.2 What "range" means here

A range like `A..B` for diff purposes is just its endpoints — `git diff A..B` ≡ `git diff A B`. There is no separate "range vs X" comparison. A multi-commit graph selection is therefore reduced to:
- A = `<oldest>^` (parent of the oldest selected commit)
- B = `<newest>`

Both slots fill at once from a single multi-select action.

### 2.3 Two-dot vs three-dot toggle

A required toggle on the panel — biggest behavioral switch.

| Form | Command | Meaning |
|---|---|---|
| Two-dot | `git diff A B` (or `A..B`) | Endpoint-to-endpoint state diff |
| Three-dot | `git diff A...B` | What B added since branching off A (uses merge-base of A and B) |

Three-dot is what GitHub's PR "Files changed" tab uses and is what users typically want when comparing branches.

**Default rules:**
- Both sides are branches/tags → default to **three-dot**.
- Both sides are commits → default to **two-dot**.
- Always show the toggle so users can override.
- If either side is **Working Tree**, three-dot does not apply — disable that toggle option.

## 3. UX design

### 3.1 Compare toggle panel

A new toggle panel alongside the existing Filter and Search panels. Same framework as those.

Contents of the panel:
- **Slot A** ("Base") — single searchable combobox.
- **Slot B** ("Target") — single searchable combobox.
- **Swap ⇄ button** between A and B (direction matters: A is "removed" / old, B is "added" / new).
- **Two-dot / three-dot toggle**.
- **Compare button** — disabled when A or B empty, or A == B.
- **Clear** affordance per slot.

### 3.2 Slot input — one combobox, all sources

Each slot is a single searchable combobox that accepts any of:
- Sentinels: `Working Tree`, `HEAD`, `Index` (Index optional)
- Branches (local + remote)
- Tags
- A typed/pasted commit hash or `HEAD~3`-style ref
- Recently-used items at the top

One control, all sources. Slots can also be filled programmatically by right-click context menus.

### 3.3 Right-click flow

Two-step pattern matching Git Graph and JetBrains Git.

1. Right-click a commit / branch / tag → **"Select for compare"**. Fills slot A and (if not open) opens the compare panel.
2. Right-click another commit / branch / tag → **"Compare with selected"**. Fills slot B and immediately runs the compare.

Behavior rules:
- "Select for compare" always appears (lets the user override A at any time).
- "Compare with selected" appears whenever A is set; disabled only when the right-clicked target is identical to A.
- Multi-select commits → a separate menu item **"Compare these commits"** that fills A = `<oldest>^` and B = `<newest>` and runs the compare.

### 3.4 Toggle button states (matches Filter button standard)

The compare toggle button in the toolbar follows the existing **Filter button** convention — three states with distinct colors:

| State | Panel | A or B selected | Color |
|---|---|---|---|
| Idle | Closed | No | Normal (default) |
| Open | Open | (any) | Light blue |
| Pending state | Closed | Yes (A and/or B set) | Light yellow |

The light yellow signals "you have pending compare state here" so users don't lose track of A after closing the panel.

### 3.5 Visual feedback in the graph

- When A points to a commit visible in the graph, mark its row with a colored ring / "A" badge.
- When B is also set and visible, mark its row similarly with "B".
- Non-graph refs (e.g., Working Tree) get no graph marker — only the panel chip.

### 3.6 Result rendering

Reuse the existing **`CommitDetailsPanel`** — it already renders "list of changed files + per-file diff" for a single commit. A compare result has the same shape with two refs in the header instead of one. Maximum reuse, consistent UX.

A separate dedicated panel can be considered later if compare-specific affordances accumulate; not needed for v1.

### 3.7 Auto-trigger rules

- Right-click flow ("Compare with selected") → run compare immediately (user has committed intent).
- Combobox flow → require explicit click of the **Compare** button (user might still be editing).

### 3.8 State persistence

- **Within session:** keep A and B even after the panel is closed. Right-click "Compare with selected" must work without re-opening.
- **Across sessions:** clear A and B. The commit may no longer exist; stale state is worse than empty state.

## 4. Entry points

| Surface | "Select for compare" | "Compare with selected" | "Compare these commits" (multi) |
|---|---|---|---|
| Commit row context menu | yes | yes (when A set) | yes (when ≥2 selected) |
| Branch context menu | yes | yes (when A set) | n/a |
| Tag context menu | yes | yes (when A set) | n/a |
| Stash context menu | no | no | no |

## 5. Out of scope (cut for v1)

- **`git range-diff`** (range vs range) — niche, used by patch-series workflows almost no VS Code user does.
- **3+ non-contiguous commit selection** — collapse to first / last as a range; do not invent a new model.
- **Stash compare** — works in git but UX is awkward; ship without.
- **Index slot** as a first-class sentinel — include only if cheap.

## 6. Open questions

1. Slot label wording — "Base / Target", "Old / New", or just "A / B"? Leaning toward **Base / Target** with the swap arrow making direction explicit.
2. Should the multi-select right-click be a separate menu item ("Compare these commits") or overload "Select for compare"? Leaning **separate** for clearer intent.
3. Combobox UX — Radix combobox + custom data source? Confirm during planning.
4. Should `Index` be a selectable sentinel? Useful for "what have I staged?" but already covered by `git diff --staged`. Likely defer.
5. When the user picks a non-existing typed ref in the combobox, how to error? Inline validation vs error on Compare click.

## 7. Suggested high-level message contract (sketch)

Final shape to be designed in speckit planning.

```
type Ref =
  | { kind: "commit"; hash: string }
  | { kind: "branch"; name: string; remote?: string }
  | { kind: "tag"; name: string }
  | { kind: "head" }
  | { kind: "workingTree" }
  | { kind: "index" }       // optional
  | { kind: "raw"; expr: string }   // typed expressions like HEAD~3

type CompareMode = "two-dot" | "three-dot"

CompareRequest  { base: Ref; target: Ref; mode: CompareMode }
CompareResponse { files: FileChange[]; summary: { added: number; removed: number; ... } }

CompareFileRequest { base: Ref; target: Ref; path: string }
CompareFileResponse { patch: string }   // or structured hunks
```

Naming, transport, and reuse of existing diff types to be finalized in speckit `plan` step.

## 8. Implementation summary

Single feature delivers ~90% of competitor parity:

1. New **Compare** toggle panel (third panel alongside Filter / Search).
2. New right-click menu items on commit / branch / tag context menus.
3. Toggle button with 3-state coloring (matches Filter button standard).
4. New backend service / message: `CompareRequest` + `CompareFileRequest`.
5. Result rendered in existing `CommitDetailsPanel`.
6. Visual graph markers for A / B selections.
