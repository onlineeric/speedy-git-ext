/**
 * Search query → terms.
 *
 * A query is whitespace-separated **terms**, AND-ed: a commit matches when every
 * term matches it somewhere (see `searchFilter.ts`). A `"quoted run"` is one
 * literal term, spaces included — the idiom already in developers' fingers from
 * GitHub, Gmail, Jira and Slack, and the whole of the syntax. There is no regex,
 * no case toggle, no whole-word toggle and no fuzzy matching.
 *
 * `:` is **reserved** for a future field-qualifier syntax (`author:john`,
 * `tag:v1.2`). Stating the reservation now means adding qualifiers later is not a
 * breaking change to what a literal term means.
 */

/** One parsed search term. `text` is already lower-cased and never empty. */
export interface SearchTerm {
  text: string;
  /**
   * True when the term came from a quoted run. Unused today; kept so a future
   * qualifier syntax can tell `author:"John Smith"` from `author:John`.
   */
  quoted: boolean;
}

/** Shared empty term list. Reference-stable, so a `React.memo`'d row that is not a search match never re-renders on a query change. */
export const EMPTY_SEARCH_TERMS: readonly SearchTerm[] = Object.freeze([]);

/**
 * Splits a query into terms. Total — every string yields a (possibly empty) list,
 * so there is no invalid input and no error state.
 *
 * A quote anywhere inside a term toggles quoting for the rest of that term (shell
 * semantics): `foo"bar baz"` is the single term `foobar baz`. An **unterminated**
 * quote is literal from the quote onward (`"john fix` → `john fix`), which is what
 * keeps results from flashing between meanings while the user is mid-typing.
 *
 * Allocates a new array per call — callers must not call it per render. The
 * canonical parse happens once per recompute in `SearchWidget` and is stored in
 * `graphStore.searchTerms`, so every consumer reads one stable reference.
 */
export function parseSearchQuery(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  const seen = new Set<string>();
  let buffer = '';
  let inQuotes = false;
  let sawQuote = false;

  const flush = () => {
    if (buffer.length === 0) {
      sawQuote = false;
      return;
    }
    const text = buffer.toLowerCase();
    buffer = '';
    const quoted = sawQuote;
    sawQuote = false;
    // `fix fix` is `fix`; the duplicate pass would be pure cost.
    if (seen.has(text)) return;
    seen.add(text);
    terms.push({ text, quoted });
  };

  for (const char of query) {
    if (char === '"') {
      inQuotes = !inQuotes;
      sawQuote = true;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      flush();
      continue;
    }
    buffer += char;
  }

  flush();
  return terms;
}
