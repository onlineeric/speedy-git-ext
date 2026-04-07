# Batch Pre-fetch Logic

Technical reference for the commit batch loading, pre-fetching, and filtered-fetch system.

## Overview

Commits are loaded in batches from the backend (`git log`) and cached in the frontend Zustand store. When filters (text, author) hide most cached commits, additional batches are automatically fetched so the user sees enough visible rows. A cap prevents runaway fetching when filters are extremely selective.

---

## Logic Summary (If-Then Rules)

### Initial Load

```
WHEN backend responds with initial commits (type: 'commits'):
  -> Store commits, recompute visibility, reset all fetch state
  -> Immediately fire prefetch for batch 2
```

### Prefetch Trigger Decision

```
WHEN scroll position changes (useEffect re-evaluates):
  IF no more commits on backend (hasMore = false) -> DO NOTHING
  IF already fetching (prefetching = true)        -> DO NOTHING

  IF client-side filters are active (hiddenCommitHashes.size > 0):
    IF visible rows remaining below viewport < overScan threshold (default 20):
      IF gap indicator is showing -> DO NOTHING (wait for user to scroll past it)
      ELSE                        -> FIRE PREFETCH
  ELSE (no filters):
    IF scroll reached last batch boundary (rangeEnd >= lastBatchStartIndex):
      -> FIRE PREFETCH
```

### Fire Prefetch

```
WHEN firePrefetch() is called:
  IF hasMore = false OR prefetching = true -> DO NOTHING (guard)
  ELSE:
    -> Set prefetching = true
    -> Send loadMoreCommits to backend with:
         skip = commits.length (total cached, including hidden)
         generation = current fetchGeneration
         filters = { branches, afterDate, beforeDate } only (NOT author/text)
```

### Batch Response Handling

```
WHEN backend responds with commitsAppended:
  IF response.generation != store.fetchGeneration:
    -> Set prefetching = false (unlock)
    -> DISCARD response data (stale)
    -> STOP (scroll trigger will re-evaluate and fire new fetch if needed)

  ELSE (generation matches):
    -> Append new commits to store
    -> Recompute hidden hashes and merged topology with current filters
    -> Count how many new commits are visible after filtering

    IF new visible count > 0:
      -> Reset consecutiveEmptyBatches = 0
      -> Reset filteredOutCount = 0
      -> Hide gap indicator
    ELSE (entire batch filtered out):
      -> Increment consecutiveEmptyBatches
      -> Add batch size to filteredOutCount
      IF consecutiveEmptyBatches >= 3:
        -> Show gap indicator

    -> Set prefetching = false (unlock)
    -> Set hasMore based on whether backend returned a full batch

    IF consecutiveEmptyBatches > 0 AND < 3 AND hasMore:
      -> AUTO-RETRY: fire prefetch again immediately
    IF consecutiveEmptyBatches >= 3:
      -> STOP auto-fetching, wait for user action
```

### Gap Indicator & User Resume

```
WHEN gap indicator is visible AND user scrolls to absolute bottom:
  -> Reset consecutiveEmptyBatches = 0
  -> Hide gap indicator
  -> Fire prefetch (resume fetching cycle)
```

### Filter Change (Text / Author)

```
WHEN user changes text filter (after 150ms debounce):
  -> Update filters.textFilter in store
  -> Call recomputeVisibility():
       Recompute hiddenCommitHashes against ALL cached commits
       Recompute mergedCommits (visible only) and topology
       Increment fetchGeneration (invalidates in-flight requests)
       Reset consecutiveEmptyBatches = 0
       Reset filteredOutCount = 0
       Hide gap indicator
  -> Scroll trigger useEffect re-evaluates with new state
     (if few visible rows remain, fires new prefetch)
```

### Filter Change (Branch / Date)

```
WHEN user changes branch or date filter:
  -> Send getCommits to backend with new filters (full reload)
  -> Backend responds with type: 'commits'
  -> setCommits() resets ALL fetch state (same as initial load)
  -> Immediate prefetch fires for batch 2
```

### Error Handling

```
WHEN backend responds with prefetchError:
  -> Show error message to user
  -> Set prefetching = false (unlock, prevents stuck state)
```

### Loading Indicator Display

```
IF prefetching = true  -> Show "Loading..." below commit list
IF prefetching = false -> Hide "Loading..."

IF showGapIndicator = true AND hasMore = true:
  -> Show "{N} commits filtered out of {total} loaded — keep scrolling down to fetch next batch"
```

---

## Key State (graphStore.ts)

| Field | Type | Default | Purpose |
|---|---|---|---|
| `commits` | `Commit[]` | `[]` | **All** fetched commits (unfiltered). Backend source of truth. |
| `mergedCommits` | `Commit[]` | `[]` | **Visible** commits after hiding + stash merge. Drives the virtualizer. |
| `hiddenCommitHashes` | `Set<string>` | `new Set()` | Hashes hidden by client-side filters (author, text). |
| `hasMore` | `boolean` | `true` | `false` when backend returns fewer commits than `batchSize`. |
| `prefetching` | `boolean` | `false` | `true` while a `loadMoreCommits` request is in-flight. Guards against duplicate requests. |
| `fetchGeneration` | `number` | `0` | Monotonically increasing counter. Incremented on full reload (`setCommits`) and on visibility recomputation (`recomputeVisibility`). Used to discard stale in-flight responses. |
| `lastBatchStartIndex` | `number` | `0` | Index in `commits[]` where the last appended batch starts. Used for scroll-based trigger without filters. |
| `consecutiveEmptyBatches` | `number` | `0` | Count of consecutive fetched batches where **zero** new commits passed the visibility filter. |
| `filteredOutCount` | `number` | `0` | Running total of commits filtered out across consecutive empty batches. Displayed in the gap indicator. |
| `showGapIndicator` | `boolean` | `false` | `true` when `consecutiveEmptyBatches >= 3`. Pauses auto-fetch and shows a user prompt. |
| `filters` | `GraphFilters` | `{ maxCount }` | Active filters. `branches`, `afterDate`, `beforeDate` go to backend. `authors`, `textFilter` are client-side only. |

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `batchCommitSize` | `500` | Number of commits per backend batch. Configurable via `speedyGit.batchCommitSize`. |
| `overScan` | `20` | Virtual scroll overscan rows. Also used as the proximity threshold for filtered prefetch trigger. |

---

## Filter Classification

| Filter | Applied Where | Affects Backend Query | Triggers |
|---|---|---|---|
| `branches` | Backend | Yes (`git log branch1 branch2`) | `getCommits` (full reload) |
| `afterDate` / `beforeDate` | Backend | Yes (`--after` / `--before`) | `getCommits` (full reload) |
| `authors` | Client-side | No | `recomputeVisibility()` |
| `textFilter` | Client-side | No | `recomputeVisibility()` |

**Key distinction**: Client-side filters (author, text) never change what the backend returns. They only control which cached commits are visible in `mergedCommits`. Backend filters (branches, dates) trigger a full reload via `getCommits`, which resets all fetch state.

---

## Data Flow: Initial Load

```
1. Frontend sends: { type: 'getCommits', payload: { filters } }

2. Backend (WebviewProvider.ts:657-676):
   - Calls GitLogService.getCommits({ ...filters, maxCount: batchSize })
   - Returns up to `batchSize` (500) commits
   - Sends: { type: 'commits', payload: { commits, totalLoadedWithoutFilter } }

3. Frontend (rpcClient.ts:46-53):
   - Calls store.setCommits(commits)
   - Immediately calls this.firePrefetch()  <-- auto-prefetch of batch 2

4. store.setCommits (graphStore.ts:374-411):
   - Recomputes hiddenCommitHashes from current filters
   - Recomputes mergedCommits and topology
   - Resets: hasMore=true, prefetching=false, lastBatchStartIndex=0
   - Increments fetchGeneration
   - Resets: consecutiveEmptyBatches=0, filteredOutCount=0, showGapIndicator=false
```

After `setCommits`, the immediate `firePrefetch()` call ensures batch 2 is fetched right away, so users have 2 batches (1000 commits) ready before they even scroll.

---

## Data Flow: Prefetch (Load More Commits)

### Step 1: Trigger

Prefetch is triggered from three places:

#### A. Immediate prefetch after initial load (rpcClient.ts:52)
```typescript
case 'commits':
  store.setCommits(message.payload.commits);
  this.firePrefetch();  // <-- immediate batch 2 fetch
```

#### B. Scroll-based trigger (GraphContainer.tsx:109-129)
A `useEffect` monitors scroll position via `virtualizer.range.endIndex`:

```typescript
useEffect(() => {
  if (!hasMore || prefetching) return;          // guard: nothing to fetch or already fetching
  if (rangeEnd === undefined) return;

  const hasVisibilityFilter = hiddenCommitHashes.size > 0;
  if (hasVisibilityFilter) {
    // WITH filters: trigger when visible rows are nearly exhausted
    const threshold = userSettings.overScan;     // default: 20
    if (rangeEnd >= commits.length - threshold) {
      if (!showGapIndicator) {                   // don't auto-fetch when gap indicator showing
        rpcClient.firePrefetch();
      }
    }
  } else {
    // WITHOUT filters: trigger when scroll reaches the last batch boundary
    if (rangeEnd >= lastBatchStartIndex) {
      rpcClient.firePrefetch();
    }
  }
}, [rangeEnd, lastBatchStartIndex, prefetching, hasMore,
    hiddenCommitHashes.size, commits.length, userSettings.overScan, showGapIndicator]);
```

Dependencies: `rangeEnd`, `lastBatchStartIndex`, `prefetching`, `hasMore`, `hiddenCommitHashes.size`, `commits.length`, `userSettings.overScan`, `showGapIndicator`.

**Without filters**: Fires when the user's visible scroll range reaches `lastBatchStartIndex`. Example: 500 commits loaded, `lastBatchStartIndex = 0`. User scrolls to row 0+ (i.e. any scroll) -> triggers. After batch 2 appended, `lastBatchStartIndex = 500`. User scrolls to row 500+ -> triggers batch 3.

**With filters**: Fires when fewer than `overScan` (20) visible rows remain below the current view. Since filters reduce `mergedCommits.length`, this triggers much sooner. Example: 1000 commits cached, filter leaves 50 visible. Scrolling to row 30+ (50 - 20 threshold) triggers prefetch.

#### C. Auto-retry after empty batch (rpcClient.ts:62-70)
After a batch arrives with zero visible commits, automatically fetches the next batch (up to the cap):

```typescript
case 'commitsAppended': {
  // ... append commits, update state ...
  const updatedStore = useGraphStore.getState();
  if (
    updatedStore.consecutiveEmptyBatches > 0 &&
    updatedStore.consecutiveEmptyBatches < 3 &&   // cap: 3 consecutive empty batches
    updatedStore.hasMore
  ) {
    this.firePrefetch();
  }
}
```

### Step 2: Send Request

```typescript
// rpcClient.ts:498-505
firePrefetch() {
  const store = useGraphStore.getState();
  if (!store.hasMore || store.prefetching) return;   // guard: duplicate prevention
  store.setPrefetching(true);                         // lock
  // Author/text filtering is client-side — never pass to backend
  const { branches, afterDate, beforeDate } = store.filters;
  this.loadMoreCommits(store.commits.length, store.fetchGeneration, { branches, afterDate, beforeDate });
}
```

- `skip` = `store.commits.length` (total cached, including hidden)
- `generation` = current `fetchGeneration` (for staleness detection)
- Only backend-relevant filters (`branches`, `afterDate`, `beforeDate`) are sent

### Step 3: Backend Processing

```typescript
// WebviewProvider.ts:678-691
case 'loadMoreCommits': {
  const batchSize = this.getBatchSize();                              // default: 500
  const { skip, generation, filters } = message.payload;
  const result = await this.gitLogService.getCommits({ ...filters, maxCount: batchSize, skip });
  if (result.success) {
    this.postMessage({
      type: 'commitsAppended',
      payload: {
        commits: result.value.commits,
        hasMore: result.value.commits.length >= batchSize,            // false if fewer than batchSize returned
        generation,                                                   // echoed back for staleness check
        totalLoadedWithoutFilter: result.value.totalLoadedWithoutFilter,
      },
    });
  } else {
    this.postMessage({ type: 'prefetchError', payload: { error: result.error } });
  }
}
```

### Step 4: Response Handling

```typescript
// rpcClient.ts:54-71
case 'commitsAppended': {
  // Staleness check: discard if generation doesn't match
  if (message.payload.generation !== store.fetchGeneration) {
    store.setPrefetching(false);   // unlock so new fetches can proceed
    break;
  }
  store.appendCommits(message.payload.commits, message.payload.totalLoadedWithoutFilter);
  store.setHasMore(message.payload.hasMore);
  store.setPrefetching(false);     // unlock
  // Auto-retry if batch was empty but cap not reached
  const updatedStore = useGraphStore.getState();
  if (
    updatedStore.consecutiveEmptyBatches > 0 &&
    updatedStore.consecutiveEmptyBatches < 3 &&
    updatedStore.hasMore
  ) {
    this.firePrefetch();
  }
}
```

### Step 5: Append & Visibility Check

```typescript
// graphStore.ts:413-456
appendCommits: (newCommits, totalLoadedWithoutFilter) => {
  const allCommits = [...commits, ...newCommits];
  const hiddenCommitHashes = computeHiddenCommitHashes(allCommits, filters);
  const { mergedCommits, topology } = computeMergedTopology(allCommits, stashes, filters, hiddenCommitHashes);

  // Count how many new commits pass the visibility filter
  const newVisibleCount = newCommits.filter(c => !hiddenCommitHashes.has(c.hash)).length;
  const prevEmpty = get().consecutiveEmptyBatches;
  const prevFilteredOut = get().filteredOutCount;

  let consecutiveEmptyBatches: number;
  let filteredOutCount: number;
  let showGapIndicator: boolean;

  if (newVisibleCount > 0) {
    // At least one visible commit -> reset counters
    consecutiveEmptyBatches = 0;
    filteredOutCount = 0;
    showGapIndicator = false;
  } else {
    // Entire batch filtered out -> increment counter
    consecutiveEmptyBatches = prevEmpty + 1;
    filteredOutCount = prevFilteredOut + newCommits.length;
    showGapIndicator = consecutiveEmptyBatches >= 3;   // cap reached
  }

  set({
    commits: allCommits,
    mergedCommits,
    topology,
    hiddenCommitHashes,
    lastBatchStartIndex: commits.length,    // where this batch starts in the full array
    consecutiveEmptyBatches,
    filteredOutCount,
    showGapIndicator,
    // ...
  });
}
```

---

## Empty Batch Cap & Gap Indicator

### Purpose

When a selective filter (e.g. text="unit tests for cache") hides most commits, each fetched batch may yield zero visible rows. Without a cap, the system would fetch endlessly. The cap of **3 consecutive empty batches** pauses auto-fetching and asks the user to take action.

### Flow

```
Batch N arrives -> 0 visible commits -> consecutiveEmptyBatches = 1
  -> auto-retry fires (1 < 3)
Batch N+1 arrives -> 0 visible commits -> consecutiveEmptyBatches = 2
  -> auto-retry fires (2 < 3)
Batch N+2 arrives -> 0 visible commits -> consecutiveEmptyBatches = 3
  -> showGapIndicator = true
  -> auto-retry does NOT fire (3 is not < 3)
  -> UI shows: "1500 commits filtered out of 2500 loaded - keep scrolling down to fetch next batch"
```

At any point, if a batch yields >= 1 visible commit, all counters reset to 0.

### Gap Indicator UI (GraphContainer.tsx:320-326)

```tsx
{showGapIndicator && hasMore && (
  <div className="...">
    {filteredOutCount} commit{filteredOutCount !== 1 ? 's' : ''} filtered out of {allCommitsCount} loaded
    {' — keep scrolling down to fetch next batch'}
  </div>
)}
```

### Scroll-Past-Gap-Indicator (GraphContainer.tsx:132-155)

When the gap indicator is visible, user must scroll to the absolute bottom to resume fetching:

```typescript
useEffect(() => {
  if (!showGapIndicator || !hasMore || prefetching) return;
  if (rangeEnd < commits.length - 1) return;

  const handleScroll = () => {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    if (atBottom) {
      useGraphStore.setState({
        consecutiveEmptyBatches: 0,    // reset counter
        showGapIndicator: false,       // hide indicator
      });
      rpcClient.firePrefetch();        // resume fetching
    }
  };
  el.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();  // check immediately in case already at bottom
  return () => el.removeEventListener('scroll', handleScroll);
}, [showGapIndicator, hasMore, prefetching, rangeEnd, commits.length]);
```

---

## Loading Indicator (GraphContainer.tsx:328-332)

```tsx
{prefetching && (
  <div className="...">Loading...</div>
)}
```

Displayed whenever `prefetching === true`. Shows below the commit list. Disappears when `setPrefetching(false)` is called (either on successful response, generation mismatch, or prefetch error).

---

## Visibility Filter Application (Client-Side)

### Text Filter Input (FilterWidget.tsx:104-118)

```typescript
// 150ms debounce on text input
useEffect(() => {
  const textFilter = messageText || undefined;
  const currentFilters = useGraphStore.getState().filters;
  if (currentFilters.textFilter === textFilter) return;

  const timer = setTimeout(() => {
    setFilters({ textFilter });       // update filters.textFilter in store
    recomputeVisibility();            // recompute hidden hashes
  }, 150);
  return () => clearTimeout(timer);
}, [messageText, setFilters, recomputeVisibility]);
```

### Hidden Hash Computation (graphStore.ts:40-68)

```typescript
function computeHiddenCommitHashes(commits: Commit[], filters: GraphFilters): Set<string> {
  // AND semantics: a commit must pass ALL active filters to be visible
  // Stash entries are NEVER hidden (always visible regardless of filters)

  for (const commit of commits) {
    if (commit.refs.some(r => r.type === 'stash')) continue;       // skip stashes

    // Author filter: commit.authorEmail must be in the included set
    if (includedAuthors && !includedAuthors.has(commit.authorEmail)) {
      hidden.add(commit.hash);
      continue;
    }
    // Text filter: commit.subject must contain the text, OR hash starts with text (4+ chars)
    if (hasTextFilter) {
      const subjectMatch = commit.subject.toLowerCase().includes(textLower);
      const hashMatch = textLower.length >= 4 && commit.hash.startsWith(textLower);
      if (!subjectMatch && !hashMatch) {
        hidden.add(commit.hash);
      }
    }
  }
  return hidden;
}
```

### Recompute Visibility (graphStore.ts:678-696)

```typescript
recomputeVisibility: () => {
  const { commits, stashes, filters } = get();
  const hiddenCommitHashes = computeHiddenCommitHashes(commits, filters);
  const { mergedCommits, topology } = computeMergedTopology(commits, stashes, filters, hiddenCommitHashes);
  set({
    hiddenCommitHashes,
    mergedCommits,
    topology,
    selectedCommitIndex,
    fetchGeneration: get().fetchGeneration + 1,   // invalidate in-flight requests
    consecutiveEmptyBatches: 0,                   // reset empty batch counter
    filteredOutCount: 0,
    showGapIndicator: false,
  });
}
```

**Important**: `recomputeVisibility` increments `fetchGeneration`. This invalidates any in-flight prefetch response (the generation in the response won't match). The response handler detects the mismatch and discards the stale data, but still resets `prefetching = false` so new fetches can proceed.

### Merged Topology (graphStore.ts:259-270)

```typescript
function computeMergedTopology(commits, stashes, filters, hiddenHashes) {
  // Visible commits: used for rendering (mergedCommits)
  const visibleCommits = hiddenHashes?.size > 0
    ? commits.filter(c => !hiddenHashes.has(c.hash))
    : commits;
  const mergedCommits = mergeStashesIntoCommits(visibleCommits, stashes, filters);

  // ALL commits (including hidden): used for topology calculation
  // This ensures graph lanes are correctly reserved even for hidden commits
  const allWithStashes = mergeStashesIntoCommits(commits, stashes, filters);
  return {
    mergedCommits,
    topology: calculateTopology(allWithStashes, hiddenHashes, mergedCommits),
  };
}
```

---

## Generation Staleness Check

`fetchGeneration` prevents stale batch responses from corrupting the store.

### When fetchGeneration increments

| Action | Location | Why |
|---|---|---|
| `setCommits()` | graphStore.ts:399 | Full reload (new base data). Any in-flight prefetch from the old data set is stale. |
| `recomputeVisibility()` | graphStore.ts:691 | Client-side filter changed. The `skip` value in any in-flight request was based on the old `commits.length`, which is still correct, but the generation bump allows the response handler to re-evaluate visibility with the new filter state. |

### How staleness is handled (rpcClient.ts:55-57)

```typescript
if (message.payload.generation !== store.fetchGeneration) {
  store.setPrefetching(false);   // always unlock to prevent stuck state
  break;                         // discard stale batch data
}
```

After `setPrefetching(false)`, the scroll-based trigger useEffect re-evaluates (since `prefetching` is in its dependency array) and fires a new fetch with the current `fetchGeneration` if needed.

---

## Error Handling (rpcClient.ts:92-95)

```typescript
case 'prefetchError':
  store.setError(message.payload.error.message);
  store.setPrefetching(false);   // unlock so UI doesn't get stuck
```

Backend errors (WebviewProvider.ts:693-710) also offer a "Retry" dialog. If the user clicks Retry and it succeeds, a `commitsAppended` message is sent with the original `generation`.

---

## Full Lifecycle Example

### Scenario: Text filter on a 20k-commit repo

```
T0: Initial load
    Backend returns 500 commits (batch 1)
    setCommits() called -> fetchGeneration = 1
    firePrefetch() called immediately -> prefetching = true
    Backend starts loading batch 2 (skip=500)

T1: Batch 2 arrives
    commitsAppended (gen=1, matches) -> appendCommits() called
    commits[] now has 1000 entries, mergedCommits has 1000 visible
    setPrefetching(false)
    No auto-retry needed (all visible)

T2: User types "unit tests for cache"
    After 150ms debounce:
    setFilters({ textFilter: "unit tests for cache" })
    recomputeVisibility() called
      -> hiddenCommitHashes: 980 of 1000 hidden
      -> mergedCommits: 20 visible
      -> fetchGeneration = 2
      -> consecutiveEmptyBatches = 0

T3: Scroll-based trigger fires
    rangeEnd (~20) >= commits.length (20) - threshold (20) -> condition met
    showGapIndicator = false -> firePrefetch()
    prefetching = true, sends loadMoreCommits(skip=1000, gen=2)

T4: Batch 3 arrives (gen=2, matches)
    appendCommits: 500 new commits, 0 pass text filter
    consecutiveEmptyBatches = 1, showGapIndicator = false
    Auto-retry fires (1 < 3) -> firePrefetch()

T5: Batch 4 arrives (gen=2, matches)
    0 visible -> consecutiveEmptyBatches = 2
    Auto-retry fires (2 < 3) -> firePrefetch()

T6: Batch 5 arrives (gen=2, matches)
    0 visible -> consecutiveEmptyBatches = 3
    showGapIndicator = true
    Auto-retry does NOT fire (3 is not < 3)
    UI shows: "1500 commits filtered out of 3500 loaded — keep scrolling down to fetch next batch"

T7: User scrolls to bottom
    Scroll-past-gap handler fires
    Resets consecutiveEmptyBatches = 0, showGapIndicator = false
    firePrefetch() -> cycle continues from T4 pattern
```

### Scenario: Filter applied while prefetch in-flight

```
T0: Initial load -> setCommits() -> fetchGeneration = 1
T1: firePrefetch() -> sends loadMoreCommits(gen=1), prefetching = true
T2: User types filter -> recomputeVisibility() -> fetchGeneration = 2
T3: Batch 2 response arrives with gen=1
    gen 1 != fetchGeneration 2 -> mismatch
    setPrefetching(false) -> discard data
T4: Scroll-based trigger re-evaluates (prefetching changed)
    Conditions met -> firePrefetch() with gen=2
    Normal flow continues
```

---

## Guard Conditions Summary

| Guard | Location | Prevents |
|---|---|---|
| `!hasMore \|\| prefetching` | `firePrefetch()` (rpcClient.ts:500) | Fetching when all commits loaded, or duplicate concurrent requests |
| `!hasMore \|\| prefetching` | Scroll trigger (GraphContainer.tsx:110) | Same, at the trigger level |
| `!showGapIndicator` | Scroll trigger (GraphContainer.tsx:119) | Auto-fetching past the 3-batch cap |
| `generation mismatch` | Response handler (rpcClient.ts:55) | Stale batch data from prior filter/reload state |
| `consecutiveEmptyBatches < 3` | Auto-retry (rpcClient.ts:63) | Runaway fetching when filter is very selective |

---

## File Reference

| File | Key Lines | Responsibility |
|---|---|---|
| `graphStore.ts` | 40-68 | `computeHiddenCommitHashes` - client-side filter logic |
| `graphStore.ts` | 259-270 | `computeMergedTopology` - visible commits + topology |
| `graphStore.ts` | 374-411 | `setCommits` - full reload, resets all fetch state |
| `graphStore.ts` | 413-456 | `appendCommits` - batch append, empty-batch tracking |
| `graphStore.ts` | 678-696 | `recomputeVisibility` - filter change, generation bump |
| `rpcClient.ts` | 46-53 | `commits` handler - initial load + immediate prefetch |
| `rpcClient.ts` | 54-71 | `commitsAppended` handler - staleness check, auto-retry |
| `rpcClient.ts` | 92-95 | `prefetchError` handler |
| `rpcClient.ts` | 498-505 | `firePrefetch` - guard, lock, send request |
| `GraphContainer.tsx` | 109-129 | Scroll-based prefetch trigger (with/without filters) |
| `GraphContainer.tsx` | 132-155 | Scroll-past-gap-indicator handler |
| `GraphContainer.tsx` | 320-326 | Gap indicator UI |
| `GraphContainer.tsx` | 328-332 | Loading indicator UI |
| `FilterWidget.tsx` | 104-118 | Text filter debounce + recomputeVisibility call |
| `WebviewProvider.ts` | 657-676 | Backend `getCommits` handler |
| `WebviewProvider.ts` | 678-710 | Backend `loadMoreCommits` handler |
| `WebviewProvider.ts` | 1634-1637 | `getBatchSize` - reads from settings, default 500 |
