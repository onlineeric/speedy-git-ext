# Quickstart: Text Filter in Filter Widget

**Branch**: `035-text-filter` | **Date**: 2026-04-07

## What This Feature Does

Adds a "Message" text input field to the Filter panel that hides commits whose message doesn't match the typed text. Works like SourceTree's search-as-filter: instead of highlighting matches, non-matching commits are removed from the graph view.

## Files to Modify (3 files)

1. **`shared/types.ts`** — Add `textFilter?: string` to `GraphFilters`
2. **`webview-ui/src/stores/graphStore.ts`** — Extend `computeHiddenCommitHashes()` with text matching
3. **`webview-ui/src/components/FilterWidget.tsx`** — Add Message input row with debounce and clear button

## Key Patterns to Follow

- **Author filter in `computeHiddenCommitHashes()`** (graphStore.ts:40-52): Same stash-skip, same Set-based hiding, same AND semantics.
- **Date filter debounce in `FilterWidget.tsx`** (lines 91-108): Same 150ms `setTimeout` in `useEffect`, same `setFilters()` + action pattern.
- **Row layout in `FilterWidget.tsx`** (lines 298-332): Same `flex gap-2` with `w-16` label + `flex-1` content pattern.

## Build & Test

```bash
pnpm typecheck    # Verify type changes compile
pnpm lint         # ESLint check
pnpm build        # Full build
pnpm test         # Run unit tests
```

Then use VS Code "Run Extension" launch config for manual smoke test:
1. Open a repo with many commits
2. Open Filter panel → type text in Message field
3. Verify non-matching commits are hidden, graph topology updates with dotted lines
4. Verify clear button works, Reset All clears the text
5. Verify combining with Author/Date/Branch filters
