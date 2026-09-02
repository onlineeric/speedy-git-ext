# Search Improvement — Implementation Spec

Technical implementation spec for [`search-impl-idea.md`](./search-impl-idea.md).
Source: GitHub issue [#191](https://github.com/onlineeric/speedy-git-ext/issues/191) (@nelson870708).

Read the idea spec first — it holds the product rules and the *why*. This document holds the
*how*: file-by-file changes, function signatures, algorithms, styling tokens, lifecycle, error
handling, performance analysis and the test matrix.

---

## 1. Summary of the change

| | Before | After |
| --- | --- | --- |
| Query | one literal substring | whitespace-separated **terms**, AND-ed; `"quoted phrase"` is one literal term |
| Fields | subject, author name, hash prefix | + author email, local branch, tag, remote branch (qualified and bare), stash ref |
| Ref visibility | n/a | only badges the row actually renders can match (Show tags / Show remote branches respected) |
| Uncommitted row | matchable | never matches |
| Feedback | row background only | + inline match boxes in message / author / hash / ref badges, + ring on badges that matched without visible text |
| Match position | resets to first match on every recompute | preserved by commit hash while that commit still matches |
| Recompute | one 300 ms debounce over everything | 300 ms debounce for typing only; batch loads, filter changes and settings toggles recompute immediately |

**All frontend.** No backend service, no new RPC, no change to `shared/messages.ts`, no new git
invocation. The only `shared/` change is one field on `SearchState`.

## 2. Current implementation (starting point)

| File | Role today |
| --- | --- |
| `webview-ui/src/utils/searchFilter.ts` | `filterCommits(commits, query): number[]` — subject / author / hash-prefix, one literal query |
| `webview-ui/src/components/SearchWidget.tsx` | the search bar; one `useEffect` with a 300 ms `setTimeout` recomputes matches |
| `webview-ui/src/stores/graphStore.ts` | `searchState`, `setSearchQuery`, `setSearchMatches`, `nextMatch`, `prevMatch`, `openSearch`, `closeSearch` |
| `shared/types.ts` | `SearchState { isOpen, query, matchIndices, currentMatchIndex }` |
| `webview-ui/src/components/GraphContainer.tsx` | scroll-to-current-match effect, `visibleMatchIndices`, passes `isSearchMatch` / `isCurrentSearchMatch` to rows |
| `webview-ui/src/components/CommitTableRow.tsx` | row background from those two flags; renders the message, author, hash and ref badge cells |
| `webview-ui/src/utils/mergeRefs.ts` | `mergeRefs(refs)` → `DisplayRef[]`; merged-branch carries **qualified** `remoteNames` (`origin/main`) |
| `webview-ui/src/utils/inlineCodeRenderer.tsx` | `parseInlineCode(text)` → segments; `renderInlineCode(text)` → `ReactNode` |
| `webview-ui/src/components/RefLabel.tsx` | one ref badge; label from `getRefBadgeContent(displayRef).label` |
| `webview-ui/src/components/OverflowRefsBadge.tsx` | the `+N` badge and its popover |

Two facts that shape the design:

- **`mergedCommits` already excludes filter-hidden commits** (`computeMergedTopology` filters by
  `hiddenCommitHashes` before merging). "Search only what's visible" for the Filter panel is
  therefore free — no new code.
- **`mergedCommits` includes the uncommitted pseudo-row and stash pseudo-commits.** Excluding the
  uncommitted row must be explicit in the matcher.

## 3. New and changed files

### New

| File | Contents |
| --- | --- |
| `webview-ui/src/utils/searchQuery.ts` | `SearchTerm`, `parseSearchQuery` |
| `webview-ui/src/utils/searchHighlight.ts` | `HighlightSegment`, `buildHighlightSegments`, `buildPrefixHighlightSegments`, `refSearchMatchKind` |
| `webview-ui/src/components/HighlightedText.tsx` | renders segments as plain text + match boxes |
| `webview-ui/src/utils/__tests__/searchQuery.test.ts` | parser tests |
| `webview-ui/src/utils/__tests__/searchHighlight.test.ts` | segment-builder tests |

### Changed

| File | Change |
| --- | --- |
| `shared/types.ts` | `SearchState` gains `currentMatchHash: string \| null` |
| `webview-ui/src/utils/searchFilter.ts` | rewritten: term-based, eight fields, settings-aware |
| `webview-ui/src/utils/mergeRefs.ts` | new `filterDisplayRefsBySettings` (extracted from `CommitTableRow`) |
| `webview-ui/src/utils/themeColors.ts` | `SEARCH_MATCH_SURFACE_COLOR`, `SEARCH_MATCH_BORDER_COLOR` |
| `webview-ui/src/utils/inlineCodeRenderer.tsx` | `renderInlineCode(text, terms?)` |
| `webview-ui/src/stores/graphStore.ts` | `searchTerms` state; `setSearchMatches(indices, terms)`; hash-preserving current match |
| `webview-ui/src/components/SearchWidget.tsx` | split debounce; new "no results" and tip strings |
| `webview-ui/src/components/GraphContainer.tsx` | passes `searchTerms` to matched rows; scroll effect keys on match hash |
| `webview-ui/src/components/CommitTableRow.tsx` | uses `filterDisplayRefsBySettings`; threads `searchTerms` into the four cells |
| `webview-ui/src/components/RefLabel.tsx` | optional `searchTerms` (label highlight) and `searchRing` (badge outline) |
| `webview-ui/src/components/OverflowRefsBadge.tsx` | optional `searchTerms`; rings the `+N` badge when a hidden ref matches |
| `webview-ui/src/utils/__tests__/searchFilter.test.ts` | updated for the new signature; new cases |
| `docs/architecture.md` | entries for new/changed files; refresh "last reconciled" |
| `CLAUDE.md` | new entries under *Shared Logic — Reuse, Don't Reimplement* |
| `CHANGELOG.md` | feature entry |

## 4. Query parsing — `utils/searchQuery.ts`

```ts
/** One parsed search term. `text` is already lower-cased and never empty. */
export interface SearchTerm {
  text: string;
  /** True when the term came from a quoted run. Unused today; kept so a future
   *  qualifier syntax can tell `author:"John Smith"` from `author:John`. */
  quoted: boolean;
}

export function parseSearchQuery(query: string): SearchTerm[];
```

### Algorithm

Single left-to-right scan, no regex:

1. Walk characters, accumulating into a current term buffer.
2. `"` toggles an `inQuotes` flag and is **not** written to the buffer.
3. Whitespace (`\s`) **outside** quotes ends the current term; inside quotes it is a literal
   character.
4. End of input flushes the buffer — so an **unterminated quote is literal from the quote onward**
   (`"john fix` → the single term `john fix`), which is what keeps results stable while the user is
   mid-typing.
5. Empty buffers are discarded, so `""`, `"`, and runs of whitespace contribute nothing.
6. Terms are lower-cased once, here. Nothing downstream lower-cases again.
7. Duplicate terms are removed (`Set` on `text`), because `fix fix` is `fix` and the extra pass is
   pure cost.

### Quote adjacency (decided, not asked)

A quote anywhere inside a term toggles quoting for the rest of that term — shell semantics.
`foo"bar baz"` is the single term `foobar baz`, not two terms. Rationale: developers already read
quotes this way, and it is the behaviour a future `author:"John Smith"` needs. The cost is that a
literal `"` character cannot be searched; that is accepted (searching for a quote character in a
commit subject is not a real use case, and the fallback — a term containing it — would collide with
the phrase syntax).

### Reference stability

`parseSearchQuery` allocates a new array each call. Callers must not call it per render. The
canonical parse happens **once per recompute in `SearchWidget`**, and the resulting array is stored
in `graphStore.searchTerms`, so every consumer reads one stable reference (§7). This matters:
`CommitTableRow` is `React.memo`'d, and a fresh array identity every render would defeat it for
every row on screen.

## 5. Matching — `utils/searchFilter.ts` (rewritten)

```ts
export interface SearchSettings {
  showTags: boolean;
  showRemoteBranches: boolean;
}

/** Lower-cased, pre-extracted haystacks for one commit. */
export interface CommitSearchFields {
  subject: string;
  author: string;
  authorEmail: string;
  hash: string;
  abbreviatedHash: string;
  /** Every ref text the row can match on — badge labels, plus a merged badge's qualified remote names. */
  refTexts: string[];
}

export const MIN_HASH_TERM_LENGTH = 4;

export function buildCommitSearchFields(commit: Commit, settings: SearchSettings): CommitSearchFields | null;
export function commitMatchesTerms(fields: CommitSearchFields, terms: readonly SearchTerm[]): boolean;
export function filterCommits(commits: Commit[], terms: readonly SearchTerm[], settings: SearchSettings): number[];
```

`filterCommits` now takes **parsed terms**, not a raw string — the parse belongs to the caller so
the panel's count and the rows' highlights are guaranteed to come from the same term list.

### `buildCommitSearchFields`

Returns `null` for a commit that can never match, which is the uncommitted row only
(`commit.hash === UNCOMMITTED_HASH`). Stash pseudo-commits are ordinary participants.

`refTexts` is built from the **rendered** badges, not raw refs:

```
displayRefs = filterDisplayRefsBySettings(mergeRefs(commit.refs).displayRefs, settings)
for each displayRef:
  local-branch   → [localName]
  remote-branch  → [remoteName]                      // already qualified, e.g. "origin/main"
  merged-branch  → [localName, ...remoteNames]       // remoteNames already qualified
  tag            → [tagName]
  stash          → [stashRef]                        // e.g. "stash@{0}"
```

Notes:

- **The bare form of a remote branch is free.** A `remote-branch` badge's label *is* `origin/main`,
  and substring matching means `main` already hits it. No extra entry is needed.
- **A merged branch contributes its qualified remote names** even though the badge only shows the
  local name — the §3.1 exception the idea spec records. These are the entries that can produce a
  match with no visible text, handled by the ring in §9.4.
- With `showRemoteBranches: false`, `filterDisplayRefsBySettings` degrades a `merged-branch` to a
  `local-branch`, so its `remoteNames` disappear from `refTexts` and `origin/main` stops matching.
  That falls out of reusing the row's own filter, and is correct.

### `filterDisplayRefsBySettings` — extracted, shared

The exact `flatMap` currently inlined in `CommitTableRow`'s `useMemo` (drop hidden remote branches,
degrade merged→local when remotes are hidden, drop hidden tags) moves to `utils/mergeRefs.ts`:

```ts
export function filterDisplayRefsBySettings(
  displayRefs: DisplayRef[],
  settings: { showTags: boolean; showRemoteBranches: boolean },
): DisplayRef[];
```

`CommitTableRow` calls it instead of its inline copy. This is the mechanism that makes "only visible
badges match" true by construction — the matcher and the renderer run the same function, so they
cannot drift.

### `commitMatchesTerms`

```
every term t:
     subject.includes(t)
  || author.includes(t)
  || authorEmail.includes(t)
  || (t.length >= MIN_HASH_TERM_LENGTH && (hash.startsWith(t) || abbreviatedHash.startsWith(t)))
  || refTexts.some(r => r.includes(t))
```

- **All terms must match; each term may match any field**, and two terms may match the same field
  (`fix login` finds "fix the login bug").
- The 4-character hash floor is **per term**: in `fix a1b2c3d`, only `a1b2c3d` is hash-eligible.
- `terms.length === 0` → `filterCommits` returns `[]` (no matches), preserving today's empty-query
  behaviour.

### `mergeRefs` memoization

`mergeRefs` is called once per commit per recompute. A module-level
`WeakMap<Commit, DisplayRef[]>` caches its raw output keyed by commit object identity — safe because
a `Commit` is immutable and is replaced wholesale on reload. The **settings filter is applied after
the cache**, so toggling Show tags invalidates nothing and still produces correct results.

## 6. Highlight segments — `utils/searchHighlight.ts`

```ts
export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/** Substring highlighting, for subject / author / ref labels. */
export function buildHighlightSegments(text: string, terms: readonly SearchTerm[]): HighlightSegment[];

/** Prefix-only highlighting, for the hash cell. */
export function buildPrefixHighlightSegments(text: string, terms: readonly SearchTerm[]): HighlightSegment[];

export type RefSearchMatchKind = 'none' | 'label' | 'hidden';

/** Did this badge match, and is the matching text on the badge or only behind it? */
export function refSearchMatchKind(displayRef: DisplayRef, terms: readonly SearchTerm[]): RefSearchMatchKind;
```

### `buildHighlightSegments`

1. Lower-case `text` once.
2. For each term, collect every occurrence as an interval `[start, start + term.length)` via a
   repeated `indexOf` walk.
3. Sort intervals by start; merge overlapping **and adjacent** ones (so `ab` + `bc` over `abc`
   yields one box, not two touching boxes with a seam).
4. Emit alternating unmatched/matched segments over the **original-case** text.
5. **Fast path:** no intervals → return a single `[{ text, matched: false }]`. Callers may compare
   `segments.length === 1` to skip wrapping entirely and keep the existing single text node.

No occurrence cap — see §11.

### `buildPrefixHighlightSegments`

Used only by the hash cell, mirroring the matcher's prefix rule. A term qualifies when
`term.length >= MIN_HASH_TERM_LENGTH` and `text.toLowerCase().startsWith(term)`. The highlighted
range is `[0, min(term.length, text.length))`, so a query longer than the 7-char abbreviated hash
highlights the whole displayed hash. Multiple qualifying terms take the longest range.

### `refSearchMatchKind`

- `'label'` — `buildHighlightSegments(getRefBadgeContent(displayRef).label, terms)` produced a match.
- `'hidden'` — no label match, but a `merged-branch`'s `remoteNames` contain a term.
- `'none'` — otherwise.

## 7. Store — `graphStore.ts` and `shared/types.ts`

### `SearchState` (shared/types.ts)

```ts
export interface SearchState {
  isOpen: boolean;
  query: string;
  matchIndices: number[];
  currentMatchIndex: number;
  /**
   * Hash of the commit at `currentMatchIndex`. Lets the current match survive a
   * recompute (a batch load, a filter change, a settings toggle, or an edited
   * query) instead of snapping back to the first result. `null` when there is none.
   */
  currentMatchHash: string | null;
}
```

`defaultSearchState` gains `currentMatchHash: null`.

`SearchTerm` stays in the webview (`utils/searchQuery.ts`) — it never crosses the extension
boundary, so it does not belong in `shared/`.

### New store field

```ts
searchTerms: readonly SearchTerm[];   // default: EMPTY_SEARCH_TERMS (a frozen module constant)
```

Held at the store root rather than inside `SearchState`, so `shared/types.ts` stays free of a
webview-only type. It is written **in the same `set` call** as `matchIndices`, which is what
guarantees the panel's "N of M" and the rows' highlights always describe the same query.

### Changed actions

**`setSearchMatches(matchIndices: number[], terms: readonly SearchTerm[])`**

```
prevHash = state.searchState.currentMatchHash
currentMatchIndex = matchIndices.length > 0 ? 0 : -1
if (prevHash && matchIndices.length > 0):
    pos = matchIndices.findIndex(i => state.mergedCommits[i]?.hash === prevHash)
    if (pos >= 0) currentMatchIndex = pos
currentMatchHash = currentMatchIndex >= 0
    ? state.mergedCommits[matchIndices[currentMatchIndex]]?.hash ?? null
    : null
set({ searchState: { ...searchState, matchIndices, currentMatchIndex, currentMatchHash }, searchTerms: terms })
```

Preservation applies to **every** recompute, including an edited query — if the row you are sitting
on still matches after you type another character, you stay on it, as a text editor's find does.

**`nextMatch` / `prevMatch`** additionally set `currentMatchHash: commit?.hash ?? null`.

**`closeSearch`** and **`resetTopMenuGroup`** reset `searchTerms` to `EMPTY_SEARCH_TERMS` alongside
`defaultSearchState`. `setActiveToggleWidget`'s closing branch does the same.

**`setSearchQuery`** is unchanged — it only stores the raw string; terms arrive with the matches.

## 8. Lifecycle and debounce — `SearchWidget.tsx`

Today one `useEffect` with a 300 ms timeout covers every trigger. It splits by cause:

```tsx
const SEARCH_DEBOUNCE_MS = 300;   // exported for the tests

const lastQueryRef = useRef(searchState.query);

useLayoutEffect(() => {
  if (!searchState.isOpen) return;

  const run = () => {
    const terms = parseSearchQuery(useGraphStore.getState().searchState.query);
    const settings = { showTags, showRemoteBranches };
    setSearchMatches(filterCommits(commits, terms, settings), terms);
  };

  const queryChanged = lastQueryRef.current !== searchState.query;
  lastQueryRef.current = searchState.query;

  if (!queryChanged) { run(); return; }              // batch load / filter / settings → immediate

  const timeout = window.setTimeout(run, SEARCH_DEBOUNCE_MS);   // typing → debounced
  return () => window.clearTimeout(timeout);
}, [commits, searchState.isOpen, searchState.query, showTags, showRemoteBranches, setSearchMatches]);
```

Two deliberate choices:

- **`useLayoutEffect`, not `useEffect`, for the immediate path.** When `mergedCommits` changes, the
  existing `matchIndices` briefly point at old row positions. A passive effect would let one frame
  paint with highlights on the wrong rows; a layout effect recomputes before paint. The debounced
  path is inherently deferred and unaffected.
- **`showTags` / `showRemoteBranches` join the dependency list.** They now change what matches, so
  toggling them must re-run the search. They are read from `userSettings` via the store.

`SearchWidget` stays mounted while the panel is closed (it returns `null` after its hooks), so the
early `return` on `!isOpen` is the guard, exactly as today.

## 9. Rendering

### 9.1 Colors — `utils/themeColors.ts`

```ts
/** VS Code's box for matched text inside a list row — designed to stay legible on top of row
 *  and selection backgrounds. Falls back to the find-widget token on themes that omit it. */
export const SEARCH_MATCH_SURFACE_COLOR =
  'var(--vscode-list-filterMatchBackground, var(--vscode-editor-findMatchHighlightBackground))';
export const SEARCH_MATCH_BORDER_COLOR =
  'var(--vscode-list-filterMatchBorder, transparent)';
```

`list.filterMatch*` is chosen over the `editor.findMatch*` family because the **row background is
already painted from that family** (`CommitTableRow.tsx`), so an inline box using the same tokens
would be two semi-transparent overlays of one color and could read as barely-there.

> **Pre-existing quirk, left alone:** the row uses `findMatchHighlightBackground` for the *current*
> match and `findMatchBackground` for the others — inverted from VS Code's own convention. Not
> touched here; fixing it would change how every matched row looks today, which is outside this
> feature.

The match box style, defined once in `HighlightedText.tsx` and reused by `RefLabel`:

```ts
const SEARCH_MATCH_STYLE: React.CSSProperties = {
  backgroundColor: SEARCH_MATCH_SURFACE_COLOR,
  boxShadow: `inset 0 0 0 1px ${SEARCH_MATCH_BORDER_COLOR}`,
  borderRadius: '2px',
};
```

`box-shadow: inset` rather than `border`, so the box adds no width and cannot reflow the text it
wraps — important inside a truncating, virtualized row.

The badge ring for a match with no visible text:

```ts
const SEARCH_MATCH_RING_STYLE: React.CSSProperties = {
  boxShadow: `0 0 0 2px ${SEARCH_MATCH_SURFACE_COLOR}`,
};
```

Outer, not inset, so it does not consume the small badge's interior. Per the idea spec, **no tooltip
change** accompanies the ring.

Both constants are plain CSS values applied via inline `style`, never class strings — the
`themeColors` rule about Tailwind's JIT. No `theme-color-exception` marker is needed; these are
tokens.

### 9.2 `HighlightedText.tsx`

```tsx
interface HighlightedTextProps {
  text: string;
  terms: readonly SearchTerm[];
  /** 'substring' (default) or 'prefix' for the hash cell. */
  mode?: 'substring' | 'prefix';
}
```

Builds segments, returns the bare string when there is one unmatched segment (preserving today's
single text node), otherwise maps segments to `<span>`s with `SEARCH_MATCH_STYLE` on matched ones.
A `<span>` rather than `<mark>` — `<mark>` carries user-agent colors that would fight the theme.

### 9.3 Cell wiring — `CommitTableRow.tsx`

A new prop `searchTerms: readonly SearchTerm[]` is threaded into `renderColumn`.

| Cell | Change |
| --- | --- |
| `message` | `renderInlineCode(commit.subject, searchTerms)` |
| `author` | `<HighlightedText text={commit.author} terms={searchTerms} />` |
| `hash` | `<HighlightedText text={commit.abbreviatedHash} terms={searchTerms} mode="prefix" />` |
| ref badges | `searchTerms` and `searchRing` passed to each `RefLabel` (§9.4) |
| `date`, `signature`, `graph` | unchanged — not searchable |

The `title` attributes keep the raw, unhighlighted text.

**Zero-work guarantee for non-matching rows.** `GraphContainer` passes the real term array **only to
rows already flagged `isSearchMatch`**, and a frozen `EMPTY_SEARCH_TERMS` constant to every other
row:

```tsx
searchTerms={isSearchMatch ? searchTerms : EMPTY_SEARCH_TERMS}
```

Because that constant is reference-stable, non-matching rows see an unchanged prop and `React.memo`
skips them entirely when the query changes. Matching rows re-render, which they must.

### 9.4 `RefLabel.tsx`

Two new optional props:

```ts
searchTerms?: readonly SearchTerm[];   // highlights inside the label text
searchRing?: boolean;                  // outline the whole badge (matched with no visible text)
```

The label renders through `HighlightedText`. When `searchRing` is true, `SEARCH_MATCH_RING_STYLE`'s
`boxShadow` is composed onto the badge's existing style. The lane color, border and icons are
untouched — the box marks the matched characters and the lane color keeps its meaning on the rest.

`CommitTableRow` computes each badge's props from `refSearchMatchKind(displayRef, searchTerms)`:
`'label'` → pass terms; `'hidden'` → `searchRing`; `'none'` → neither.

### 9.5 `OverflowRefsBadge.tsx`

New optional `searchTerms`. If any ref in `hiddenRefs` has `refSearchMatchKind !== 'none'`, the `+N`
trigger gets `SEARCH_MATCH_RING_STYLE`. Inside the popover the badges are ordinary `RefLabel`s, so
passing `searchTerms` through gives them the same highlighting for free.

### 9.6 `inlineCodeRenderer.tsx`

```ts
export function renderInlineCode(text: string, terms?: readonly SearchTerm[]): ReactNode;
```

- **Fast path preserved:** no terms (or no matches) **and** no backtick → return the plain string,
  exactly as today.
- Otherwise `parseInlineCode(text)` first, then `buildHighlightSegments` **within each segment**.
  Code segments keep their `<code>` wrapper and are highlighted inside it, per the idea spec.

> **Accepted mismatch.** Matching runs against the raw `commit.subject` (backticks included);
> highlighting runs against the parsed segments (backticks stripped). A term that spans a backtick
> boundary — or contains a backtick — matches the row but highlights nothing. Rare, and the row
> highlight remains authoritative. Documented in the edge-case table.

### 9.7 `GraphContainer.tsx`

- Reads `searchTerms` from the store and passes it per §9.3.
- The scroll-to-current-match effect keys on **`searchState.currentMatchHash`** instead of
  `[currentMatchIndex, matchIndices]`. With hash preservation, `matchIndices` gets a new identity on
  every recompute; keeping the old dependencies would re-scroll the user back to the current match
  on every batch load, defeating the preservation it was paired with.

### 9.8 Panel strings — `SearchWidget.tsx`

Layout, buttons and shortcuts are unchanged. Two strings:

| | Before | After |
| --- | --- | --- |
| no results | `No results` | `No results in ${commits.length} loaded commits` |
| tip | `Tips: You can filter message in Filter Panel` | `Searches message, author, hash, branch, tag` |

`commits` is `mergedCommits` — the filter-applied rows actually scanned — so the number never
overstates the search. The `Type to search` and `N of M` strings are unchanged.

## 10. Error, exception and edge handling

There is **no error state and no failure path**, by construction:

- **The parser is total.** Every string yields a (possibly empty) term list. No invalid input, no
  throw, no error UI.
- **No regex**, so no invalid-pattern error and no catastrophic backtracking.
- **No async, no RPC, no I/O**, so nothing to time out, retry or report.
- **Defensive field reads.** Stash and pseudo-commits can carry empty `author` / `authorEmail`;
  every field is coerced with `?? ''` before `includes`.
- **Stale index safety.** All `mergedCommits[i]` reads use optional chaining. `nextMatch` /
  `prevMatch` already tolerate `undefined`; `setSearchMatches` and the scroll effect follow suit.
  The one-frame stale window is closed by `useLayoutEffect` (§8).
- **`maxVisibleRefs` of 0** (very narrow message column) puts every badge in the overflow: the row
  still matches and the `+N` badge rings.

## 11. Performance

No caps are imposed; the analysis is why.

- **Matching** is bounded by `mergedCommits` (default batch 500), behind the 300 ms typing debounce.
  Per commit: a `mergeRefs` call (WeakMap-cached after the first pass), then a handful of `includes`
  over short strings. Well under a millisecond for the whole scan — the same order as today's.
- **Highlighting** is bounded by *mounted* rows, not matches. The list is virtualized: viewport rows
  plus overscan (default 50) is roughly 80–130 rows. Each does ~10 `indexOf` scans over sub-100-char
  strings, memoized on `[commit, searchTerms]`, and only for rows already flagged `isSearchMatch`.
  Tens of microseconds per keystroke.
- **DOM cost** is the real one: a highlighted subject becomes 3–7 spans instead of one text node.
  Also bounded by mounted rows. The single-segment fast path keeps every unmatched string a plain
  text node.
- **Re-render cost** is contained by the `EMPTY_SEARCH_TERMS` sentinel (§9.3): a query change
  re-renders matching rows only.

The realistic worst case — a one-character term against a full 500-commit batch — touches ~130
mounted rows, not 500, and each row's subject yields at most a few dozen boxes. No cap earns its
complexity here.

## 12. Telemetry

**No new telemetry**, per the idea spec §7 — reviewed and declined. No change to
`shared/telemetry.ts` or `telemetry.json`. Existing search instrumentation is untouched.

## 13. Testing

Pure-util Vitest only. **No component tests** and no new test infrastructure — the repo has no
DOM environment, no React in the root package, and `vitest.config.ts` includes only `*.test.ts`;
standing that up is out of scope for this feature.

Everything that can be wrong lives in a pure function: the parser, the matcher, and the segment
builders. `HighlightedText` is a trivial `segments.map(...)` with no logic left to test.

### `utils/__tests__/searchQuery.test.ts`

| Case | Expectation |
| --- | --- |
| `''`, `'   '` | `[]` |
| `'fix'` | one term `fix` |
| `'John FIX'` | two terms, both lower-cased |
| `'  a   b  '` | two terms, no empties |
| `'"john fix"'` | one term `john fix`, `quoted: true` |
| `'"john fix'` (unterminated) | one term `john fix` |
| `'"'`, `'""'` | `[]` |
| `'foo"bar baz"'` | one term `foobar baz` |
| `'fix fix'` | one term (deduped) |
| `'a "b c" d'` | three terms: `a`, `b c`, `d` |

### `utils/__tests__/searchFilter.test.ts` (extended)

Existing cases are updated to the new `(commits, terms, settings)` signature. New cases:

| Case | Expectation |
| --- | --- |
| author email match | matches when the name does not |
| local branch name, substring | `feature` finds `feature/new-ui` |
| tag name, substring | `v1.2` finds `v1.2.0` |
| remote branch, qualified | `origin/main` matches |
| remote branch, bare | `main` matches `origin/main` |
| merged branch via hidden remote name | `origin/main` matches a `⑂☁ main` badge |
| tag with `showTags: false` | no match |
| remote branch with `showRemoteBranches: false` | no match |
| merged branch with `showRemoteBranches: false` | `main` matches, `origin/main` does not |
| uncommitted row | never matches, on any term |
| stash row | matches on its subject and on `stash@{0}` |
| two terms, different fields | `john fix` — author + subject |
| two terms, same field | `fix login` finds "fix the login bug" |
| one term matching, one not | no match (AND) |
| hash term of 3 chars | no hash match |
| hash term of 4+ chars, prefix | matches |
| hash term mid-hash | no match |
| `fix a1b2` | per-term hash floor: `fix` is not hash-eligible, `a1b2` is |
| empty term list | `[]` |
| result order | ascending row index |

### `utils/__tests__/searchHighlight.test.ts`

| Case | Expectation |
| --- | --- |
| no terms | one unmatched segment |
| no match | one unmatched segment (fast path) |
| single match mid-string | 3 segments |
| match at start / at end | 2 segments |
| multiple occurrences of one term | alternating segments |
| two overlapping terms | merged into one box |
| two adjacent terms | merged into one box, no seam |
| case-insensitive match | original case preserved in output |
| whole string matches | one matched segment |
| prefix mode, term shorter than text | leading box only |
| prefix mode, term longer than text | whole text boxed |
| prefix mode, term under 4 chars | no box |
| prefix mode, non-prefix term | no box |
| `refSearchMatchKind` on each `DisplayRef` variant | `none` / `label` / `hidden` as specified |

## 14. Documentation checklist

- [ ] `docs/architecture.md` — add the 3 new source files + 1 new test-bearing util; update entries
      for every changed file; refresh the "last reconciled" date.
- [ ] `CLAUDE.md`, *Shared Logic — Reuse, Don't Reimplement* — add `utils/searchQuery.ts`,
      `utils/searchFilter.ts` and `utils/searchHighlight.ts` (the term/AND/quote rule and the
      per-term hash floor are exactly the kind of subtle shared rule that section exists for), and
      `filterDisplayRefsBySettings` as the single source of truth for "which badges the row shows".
- [ ] `CHANGELOG.md` — feature entry for the release this ships in.
- [ ] **What's New — ask the maintainer, do not decide.** A contributor (@nelson870708) reported
      this, and the maintainer's recorded leaning is that a contributor's involvement always earns
      a credit in the entry. Per `CLAUDE.md`, `whatsNewEntries.tsx` is never edited on an agent's
      own judgement: raise the What's New pass before release and let the maintainer choose.

## 15. Out of scope

- Backend search, `git log --grep`, or any new RPC.
- Auto-loading further batches to widen the search.
- Commit message **body** search (not loaded; would need new backend data).
- Filtering/hiding rows by search, or merging search into the Filter panel.
- Field qualifiers (`author:`, `tag:`) and negation (`-term`) — deferred; `:` is reserved so
  qualifiers can land later without changing the meaning of existing literal terms.
- Match-case, whole-word and regex toggles.
- Any new control, dropdown or results list in the search panel.
- Fixing the inverted `findMatchBackground` / `findMatchHighlightBackground` row usage.
- Component-test infrastructure.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| Matcher and renderer disagree about which badges are visible | Both call `filterDisplayRefsBySettings`; drift is impossible without changing both |
| Panel count and row highlights describe different queries | `matchIndices` and `searchTerms` are written in one `set` call |
| `list.filterMatchBackground` undefined on some themes | Nested `var()` fallback to `editor.findMatchHighlightBackground` |
| A query change re-renders every mounted row | `EMPTY_SEARCH_TERMS` sentinel keeps non-matching rows memo-stable |
| Stale highlights for one frame after a batch load | Non-typing recompute runs in `useLayoutEffect`, before paint |
| Hash preservation defeated by the scroll effect | Scroll effect keys on `currentMatchHash`, not `matchIndices` |
