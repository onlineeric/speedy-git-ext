# Research: Multi-Branch Filter Selection

**Feature**: 028-multi-branch-filter  
**Date**: 2026-03-31

## R1: Git log with multiple branch refs

**Decision**: Use positional ref arguments (`git log branch1 branch2 branch3`)

**Rationale**: Git log natively accepts multiple refs as positional arguments and shows commits reachable from any of them (union). This is the simplest, most performant approach — no regex patterns or `--branches` flag needed.

**Alternatives considered**:
- `--branches=<pattern>`: Only works with glob patterns, not arbitrary branch names. Would require constructing a regex that matches exact names, which is fragile.
- Multiple `git log` calls merged in frontend: Wasteful, complex deduplication, breaks pagination.

## R2: Component approach for multi-select dropdown

**Decision**: Extend existing `FilterableBranchDropdown` component. No new library.

**Rationale**: The current component already implements text filtering, keyboard navigation, Radix Popover integration, and VS Code theming (~360 lines). Multi-select requires changing the selection model (toggle instead of replace) and adding checkbox indicators. This is ~50 lines of change, not a new component.

**Alternatives considered**:
- `react-select` (~30KB): Heavy, complex theming to match VS Code variables, designed for form inputs.
- `downshift` (~12KB): Headless but multi-select requires significant wiring; adds dependency for what we mostly have.
- `cmdk` (~7KB): Command palette style, wrong UX pattern for checkbox multi-select.

## R3: Type change strategy (branch → branches)

**Decision**: Rename `branch?: string` to `branches?: string[]` in `GraphFilters` interface. Empty array or undefined = all branches.

**Rationale**: Clean break from old type. TypeScript strict mode will surface every callsite that needs updating at compile time. No need for backward compatibility since this is an internal type.

**Alternatives considered**:
- Keep `branch` and add `branches` alongside: Confusing dual fields, complex merge logic.
- Use `branch?: string | string[]`: Union types create ambiguity at every consumer site.

## R4: Dropdown open/close behavior change

**Decision**: Dropdown stays open on branch click (toggle). Closes on Escape, click-outside, or "All Branches" selection.

**Rationale**: Multi-select requires the dropdown to stay open for iterative selection. The existing `selectBranch` function currently closes on selection (line 146-148 of FilterableBranchDropdown.tsx). Change to toggle without close.

**Note**: "All Branches" clears selection but also keeps the dropdown open per spec (User Story 4, Acceptance Scenario 3).

## R5: Graph update timing

**Decision**: Update graph immediately after each toggle (per clarification session).

**Rationale**: User expects instant feedback. The existing single-branch filter already triggers a fetch per selection, so the backend can handle this pattern. No debouncing needed.

## R6: Trigger button label

**Decision**: "All Branches" when empty, branch name when 1 selected, "{N} branches selected" when 2+.

**Rationale**: Matches spec FR-007. Simple, readable, no truncation issues with large numbers.
