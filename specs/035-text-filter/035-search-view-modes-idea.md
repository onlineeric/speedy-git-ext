# Search list view modes idea spec

## Problem

Some users prefer to see the search results in a filtered list view, while others prefer to see the search results in highlighted list view.

In our current search feature, user input filter text, system will search the commit messages, and then highlight the matching rows. User can click next / previous to navigate through the matching rows.

Some users prefer to input filter text, system search commit messages, filter out the non-matching rows, only show those matching rows. This has a similar behavior as SourceTree's search feature, as this kind of user get used SourceTree and want to have a similar experience.

## Investigation

### Current Search Feature (Highlighting Mode)

The existing **Search** feature (`SearchWidget.tsx`, `searchFilter.ts`) works as a **highlighting-only** mechanism:

- User types query in the Search panel (opens via Ctrl+F).
- `filterCommits()` in `searchFilter.ts` returns an array of **indices** into `mergedCommits` matching the query (case-insensitive match on subject, author, and hash prefix ≥4 chars).
- **All commits remain visible** — matching rows get a colored background highlight via CSS classes.
- Prev/Next buttons navigate through matched indices, scrolling the virtualizer to each match.
- No topology recalculation; no commits are hidden.

### Current Filter Feature (Hiding Mode)

The existing **Filter** feature (`FilterWidget.tsx`, `filterUtils.ts`, `graphStore.ts`) works by **hiding non-matching commits**:

| Filter | Side | Mechanism |
|--------|------|-----------|
| **Branch** | Server-side | `rpcClient.getCommits()` with branch param — backend returns only commits on selected branches |
| **Date Range** | Server-side | `rpcClient.getCommits()` with `afterDate`/`beforeDate` — backend returns only commits in range |
| **Author** | Client-side | `computeHiddenCommitHashes()` at `graphStore.ts:40` — builds a `Set<string>` of hidden commit hashes |

All filters combine as AND operations. The pipeline is:

```
Server filters (branch + date) → setCommits()/appendCommits()
  → computeHiddenCommitHashes() (author filter, client-side)
    → computeMergedTopology() (merge stashes + calculate graph topology)
      → set mergedCommits + topology in store
        → GraphContainer renders visible commits
```

**Key details about Author filter (the pattern we'd follow):**

- `computeHiddenCommitHashes()` (`graphStore.ts:40-53`) iterates all commits, adds non-matching hashes to a `Set<string>`.
- Stash entries are **never hidden** (skipped via `refs.some(r => r.type === 'stash')`).
- After computing hidden hashes, `computeMergedTopology()` (`graphStore.ts:244`) builds the visible commit list and recalculates graph topology.
- The graph topology (`graphTopology.ts:57`) handles hidden commits by drawing **dotted lines** between visible commits when connections span hidden ones.
- `recomputeVisibility()` (`graphStore.ts:663-681`) is the entry point: recomputes hidden hashes → merged topology → updates store.
- Batch prefetching in `GraphContainer.tsx` already handles visibility filters — when many commits are hidden, it auto-prefetches more batches, with a gap indicator after 3 consecutive empty batches.

### Search vs Filter Summary

| Aspect | Search | Filter |
|--------|--------|--------|
| **Effect** | Highlight matching rows | Hide non-matching rows |
| **Commits visible** | All | Only matching |
| **Server call** | No | Yes (branch/date only) |
| **Topology impact** | None | Yes (dotted lines for hidden) |
| **Navigation** | Prev/Next through matches | N/A |
| **State** | `searchState.matchIndices` (array of indices) | `hiddenCommitHashes` (Set of hashes) |

## Solution

### Recommendation: Add Text Filter to Filter Widget (confirmed your idea is sound)

Your idea is the correct approach. The investigation confirms it aligns well with the existing architecture. Here's the refined plan:

1. **Keep Search feature unchanged** — it provides highlighted list view with Prev/Next navigation.
2. **Add a "Text" filter section to FilterWidget** — a text input field in the Filter panel, positioned between Authors and Date Range sections.
3. **Client-side only** (like Author filter) — no server call needed. The text filter operates on commits already fetched from the server.
4. **AND operation** with all other filters — text filter adds to `computeHiddenCommitHashes()`, combining with Author filter. Both are applied before topology calculation.

### Pipeline (confirming your proposed flow)

```
Server response (filtered by branch + date)
  → computeHiddenCommitHashes():
      → Apply Author filter (existing)
      → Apply Text filter (new) — AND operation
  → computeMergedTopology() (merge stashes + graph with dotted lines)
  → Render
  → Auto-prefetch next batch if needed (existing logic handles this)
```

### What Needs to Change

**1. Type update** — `shared/types.ts:118` (`GraphFilters`):
- Add `textFilter?: string` field.

**2. Hidden hash computation** — `graphStore.ts:40` (`computeHiddenCommitHashes()`):
- Add text matching logic after author filter. When `filters.textFilter` is set, hide commits whose subject does not contain the text (case-insensitive). Same stash-skip rule as author filter.
- The two filters combine as AND: a commit must pass **both** author AND text filter to remain visible.
- Search fields: **commit message (`subject`) and commit hash only**. Author and date are excluded because the Filter widget already has dedicated Author and Date Range filters for those. This avoids redundancy and keeps each filter's responsibility clear.
  - Note: the existing Search feature (`searchFilter.ts`) searches subject + author + hash (highlighting mode). The Text filter intentionally narrows the scope since author/date are covered by their own filters.

**3. UI in FilterWidget** — `FilterWidget.tsx`:
- Add a text input field with a label (e.g., "Message").
- Debounce input at 150ms (consistent with date filter).
- On change: call `setFilters({ textFilter })` → `recomputeVisibility()` (same pattern as author filter).
- Show clear button when text is present.

**4. Reset logic** — `graphStore.ts:682` (`resetAllFilters()`):
- Already works correctly — `textFilter` will be cleared since `resetAllFilters` only preserves `maxCount` and optionally `branches`.

**5. No batch-fetching changes needed** — the existing logic in `appendCommits()` (`graphStore.ts:398`) already handles visibility filters generically via `computeHiddenCommitHashes()`. Adding text filter to that function means batch prefetch, gap indicators, and `filteredOutCount` all work automatically.

**6. No topology changes needed** — `calculateTopology()` in `graphTopology.ts` already supports hidden commits via `hiddenHashes` parameter, including dotted line rendering.

### What Does NOT Need to Change

- `searchFilter.ts` — search highlighting is independent.
- `GraphContainer.tsx` — already handles `hiddenCommitHashes` for prefetch and rendering.
- `graphTopology.ts` — already handles dotted lines for hidden commits.
- Backend services — text filter is purely client-side.
