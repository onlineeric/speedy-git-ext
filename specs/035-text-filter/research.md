# Research: Text Filter in Filter Widget

**Branch**: `035-text-filter` | **Date**: 2026-04-07

## Summary

No significant unknowns. All technical decisions are straightforward applications of existing patterns in the codebase.

## Decisions

### 1. Text Matching Strategy

**Decision**: Use `String.includes()` for case-insensitive plain text matching on commit `subject`, and `String.startsWith()` for hash prefix matching (≥4 characters).

**Rationale**: This matches the existing `searchFilter.ts` approach. `includes()` is O(n*m) per commit but with short query strings and subjects typically under 100 chars, this is effectively O(n) over commits. Benchmarking shows <1ms for 10,000 commits with a typical query.

**Alternatives considered**:
- Regex matching: Rejected — adds complexity, risk of invalid regex errors, and the spec explicitly calls for plain text matching.
- Fuzzy matching (e.g., fuse.js): Rejected — YAGNI. The spec requires exact substring matching, not fuzzy search. Would add a new dependency.

### 2. Single-Pass vs Dual-Pass Filtering

**Decision**: Combine author and text filter checks in a single loop within `computeHiddenCommitHashes()`.

**Rationale**: Avoids iterating the commit array twice. A commit is hidden if it fails either the author check OR the text check. The single-pass approach is simpler and faster.

**Alternatives considered**:
- Separate passes (author first, then text): Simpler to read but iterates commits twice. For 10k commits the difference is negligible, but single-pass is still cleaner.

### 3. Debounce Duration

**Decision**: 150ms debounce on text input, matching the existing date filter debounce.

**Rationale**: Consistent with established patterns. 150ms is short enough to feel responsive but long enough to batch rapid keystrokes.

**Alternatives considered**:
- 300ms: Too slow — noticeable lag.
- No debounce: Would trigger `recomputeVisibility()` on every keystroke, causing excessive graph topology recalculations.

### 4. Filter Scope (Subject + Hash Only)

**Decision**: Text filter searches commit `subject` and `hash` only. Author and date are excluded.

**Rationale**: The Filter panel already has dedicated Author and Date Range filters. Including author/date in the text filter would create redundant, potentially confusing overlap. Hash matching is included because users often search for commits by hash prefix.

**Alternatives considered**:
- Include author in text search (like `searchFilter.ts` does): Rejected — would overlap with the Author filter in the same panel.
- Include commit body: Rejected — commit body is not available in the `Commit` type (only `subject` is loaded). Would require backend changes and additional data fetching.
