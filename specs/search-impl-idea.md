# search improvement idea spec

this spec only log product idea, workflow, feature, requirements, edge cases, like product spec. No technical details, we are going to use this idea spec to create another implementation spec with technical details.

Source: GitHub issue [#191 — Expand Search Scope Beyond Commit Messages](https://github.com/onlineeric/speedy-git-ext/issues/191), reported by @nelson870708.

---

## 1. Problem

The reporter asks for search to match branch names, tag names, authors, commit messages and
commit hashes, because in a large repo you usually remember *who* wrote a commit, or *which
branch/tag* it belongs to, rather than the exact message text.

The issue slightly overstates today's gap. Search already matches:

- commit subject
- author **name**
- commit hash (full or abbreviated, 4+ characters, prefix only)

The real gaps are:

1. **Ref names are not searchable at all** — branch and tag badges are invisible to search.
2. **Author email is not searchable** — only the display name is.
3. **The query is one literal string.** Typing `john fix` searches for the literal text
   `john fix` and finds nothing, even though the user means "a commit by john about a fix".
   This is the deeper usability problem behind the issue.

## 2. Scope of this change

**In scope** — the set of commits a search matches, and how the query is interpreted.

**Out of scope**, deliberately:

- No backend change. Search continues to work from data already loaded in the graph batch.
- No commit message *body* search. Only the subject line is loaded; matching the body would
  require new backend data on every commit, which is a real cost on large repos.
- No new controls in the search panel — no toggles, no dropdowns, no results list. The panel keeps
  its current layout; only its wording and its results change.
- No change to the Filter panel.

## 3. What a search matches

A commit matches when the query matches any of these, all case-insensitive:

| Field | Rule |
| --- | --- |
| Commit subject | substring |
| Stash message | substring (a stash row's subject is its message) |
| Author name | substring |
| Author email | substring |
| Commit hash | prefix match on the full or abbreviated hash, **4+ characters only** |
| Local branch name | substring |
| Tag name | substring |
| Remote branch name | substring, against **both** the bare name and the qualified `remote/name` form — `main` and `origin/main` both find `origin/main` |

Notes on the edges of that table:

- **Hash keeps its 4-character floor and stays prefix-only.** This mirrors how git itself resolves
  abbreviated hashes, and stops short hex-ish words (`add`, `face`, `beef`) from lighting up
  unrelated commits.
- **Ref names match as substrings**, exactly like the message does — `feature` finds
  `feature/new-ui`, `v1.2` finds `v1.2.0`. One rule for every field, nothing to explain.
- **The "Uncommitted changes" row never matches.** Its subject is generated text like
  "3 staged, 2 unstaged", so a search for `staged` would surface it oddly, and it sits at the top
  of the graph where it never needs finding.

### 3.1 Only visible refs can match

If a ref badge is hidden by the View settings — **Show tags** off, or **Show remote branches**
off — its name does **not** match. Those settings read as "I don't care about these refs", and a
row that lights up with nothing on screen explaining why is worse than no match at all.

**Columns are different.** Turning off the Author, Hash or Message *column* is a layout choice
about screen width, not a statement about what matters, so hidden columns do not affect matching.

There is one accepted asymmetry: **author email matches even though only the name is displayed**
in the Author column. The email is what a user actually remembers and types
(`john.smith@corp.com`, or just `john.smith` when the display name is "John Smith"), and it is
already visible on hover, so the match is explicable.

### 3.2 Only visible rows can match

A commit hidden by the Filter panel is not searched, is not counted, and cannot be reached by
Next/Prev. Filters decide what exists on screen; search finds within that.

## 4. How the query is written

### 4.1 The pattern

The query is split on whitespace into **terms**. A commit matches when **every** term matches that
commit somewhere. Different terms may match different fields, and two terms may also match the
same field.

```
john fix          → author contains "john"  AND  something contains "fix"
fix login         → both terms may hit the subject: matches "fix the login bug"
v1.2 release      → a tag contains "v1.2"   AND  the subject contains "release"
origin/main       → one term, matches the qualified remote branch name
a1b2c3d           → one term, hash prefix
```

A quoted term is one literal string, spaces included:

```
"john fix"        → matches only text literally containing "john fix"
```

This is the idiom developers already have in their fingers from GitHub, Gmail, Jira and Slack, and
it is the whole of the syntax. There is no regex, no case toggle, no whole-word toggle, and no
fuzzy/subsequence matching.

Rationale for what was rejected: **regex** needs its own error state and would have to be applied
across eight different fields; **fuzzy matching** (`jfix` finding `john…fix`) produces matches whose
reason is invisible to the user, which contradicts §3.1.

### 4.2 Term rules

- **Each rule in §3 applies per term, not to the whole query.** In particular, the 4-character
  hash floor is evaluated per term: in `fix a1b2c3d`, `a1b2c3d` may match a hash but `fix` may not.
- **An unterminated quote is literal from the quote onward.** While typing `"john fix`, the query
  behaves as the literal `john fix`, so results do not flash between meanings mid-keystroke.
- **Duplicate terms are harmless** — `fix fix` behaves as `fix`.
- **An empty or whitespace-only query matches nothing**, as today.
- **A query of only quote characters** (`"`, `""`) matches nothing rather than erroring.

### 4.3 Reserved characters, for the future

`:` is **reserved**. Field qualifiers (`author:john`, `tag:v1.2`, `branch:feature`, `msg:"hot fix"`)
are a natural later addition on top of this pattern, and they layer on without breaking anything —
but the day they arrive, a literal term containing a colon changes meaning. Stating the
reservation now means that later change is not a breaking one.

Negation (`-revert` to exclude) was considered and deferred for the same reason it is awkward:
`-` is common inside branch names (`feature/new-ui-fix`), so reserving a leading dash would need
its own quoting rule for a payoff that can wait.

## 5. What the user sees

### 5.1 The graph

- **The matching row is highlighted**, as today.
- **The matched text is highlighted inside the cell** — in the message, the author name, the
  abbreviated hash, and inside the ref badge itself. With up to eight fields able to match, the row
  highlight alone no longer says *why* the row matched, and the inline highlight does.
- With multiple terms, **every term's match is highlighted**, in every cell where it lands.

### 5.2 The search panel

The layout, the buttons and the keyboard shortcuts are unchanged. Two strings change:

- **No results** becomes an honest statement that search covers only what is loaded — e.g.
  *"No results in N loaded commits"*. Because search never reaches past the loaded batches, a bare
  "No results" reads as a bug to a user who knows the commit exists; this tells them scrolling
  further will bring it into range.
- **The trailing tip** currently reads *"Tips: You can filter message in Filter Panel"*. It should
  instead name what is searchable, so the widened scope is discoverable at all — e.g.
  *"Searches message, author, hash, branch and tag"*.

### 5.3 Navigation

Unchanged: matches are ordered by graph row order, top to bottom, and Next/Prev (F3 / Shift+F3)
cycles through them with the "N of M" counter. **A commit that matches on several fields is still
one result.**

## 6. Not changing

- Search remains limited to **commits already loaded** in the graph. It does not auto-load further
  batches, and it does not fall back to a repo-wide git query.
- Search remains **highlight-and-jump**. It never hides rows; there is no "show only matches" mode.
  The Filter panel stays the only thing that hides rows.
- **A branch or tag name matches only the commit carrying that badge** — the branch tip, or the
  tagged commit — not every commit reachable from it. Highlighting a whole branch's history is what
  the Filter panel's branch filter is for.
- Debounce behaviour and the Ctrl+F / Esc shortcuts are unchanged.

## 7. Telemetry

**No new telemetry.** Reviewed and deliberately declined: the interesting signal (which of the new
fields users actually search) is close to the query content itself, and the existing search
instrumentation is sufficient.

## 8. Edge cases to cover

| Case | Expected |
| --- | --- |
| Query is empty / whitespace only | No matches, no "no results" complaint |
| Query is `"` or `""` | No matches, no error |
| Unterminated quote while typing | Treated as a literal from the quote onward |
| Single-character term | Matches as a substring wherever it can; it cannot match a hash |
| 1–3 hex character term | Never matches a hash; may still match text |
| Term matches only a hidden tag (Show tags off) | No match |
| Term matches only a filtered-out commit | No match, and it is not counted |
| Term matches the Uncommitted row's generated subject | No match |
| Query matches `main` where `origin/main` exists | Matches, via the bare form of the remote name |
| Commit matches on subject *and* author *and* a tag | Counted once; all three highlight |
| Many terms (5+) over a full 500-commit batch | Still responsive; search runs on the loaded set only |
| A stash row whose message matches | Matches like any other row |
