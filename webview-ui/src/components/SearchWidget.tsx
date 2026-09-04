import { useLayoutEffect, useRef } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { filterCommits } from '../utils/searchFilter';
import { parseSearchQuery } from '../utils/searchQuery';
import { buttonPrimaryClassName, buttonSecondaryClassName } from './dialogStyles';

export const SEARCH_DEBOUNCE_MS = 300;

export function SearchWidget() {
  const commits = useGraphStore((state) => state.mergedCommits);
  const searchState = useGraphStore((state) => state.searchState);
  const showTags = useGraphStore((state) => state.userSettings.showTags);
  const showRemoteBranches = useGraphStore((state) => state.userSettings.showRemoteBranches);
  const closeSearch = useGraphStore((state) => state.closeSearch);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const setSearchMatches = useGraphStore((state) => state.setSearchMatches);

  const lastQueryRef = useRef(searchState.query);

  // The debounce belongs to typing alone. A batch load, a filter change or a
  // Show tags / Show remote branches toggle must recompute at once — and in a
  // layout effect, because until it runs the existing `matchIndices` point at old
  // row positions, and a passive effect would let one frame paint highlights on
  // the wrong rows.
  useLayoutEffect(() => {
    if (!searchState.isOpen) {
      return undefined;
    }

    const run = () => {
      const terms = parseSearchQuery(useGraphStore.getState().searchState.query);
      setSearchMatches(filterCommits(commits, terms, { showTags, showRemoteBranches }), terms);
    };

    const queryChanged = lastQueryRef.current !== searchState.query;
    lastQueryRef.current = searchState.query;

    if (!queryChanged) {
      run();
      return undefined;
    }

    const timeout = window.setTimeout(run, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [commits, searchState.isOpen, searchState.query, showTags, showRemoteBranches, setSearchMatches]);

  if (!searchState.isOpen) {
    return null;
  }

  const totalMatches = searchState.matchIndices.length;
  const currentMatch = totalMatches > 0 ? searchState.currentMatchIndex + 1 : 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 shadow-sm">
      {/* The heading carries what search reaches, so the widened scope is stated
          before the box rather than trailing after the buttons. */}
      <span className="text-sm font-semibold text-[var(--vscode-foreground)]">
        Searches message, author, hash, branch and tag
      </span>

      <div className="flex items-center gap-3">
        <input
          autoFocus
          type="text"
          value={searchState.query}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search commits (Ctrl+F)"
          className="min-w-0 flex-1 max-w-[640px] rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-sm text-[var(--vscode-input-foreground)] outline-none"
        />

        {/* Search never reaches past the loaded batches, so a bare "No results" reads
            as a bug to a user who knows the commit exists — say what was scanned. */}
        <span className="min-w-[70px] shrink-0 text-xs text-[var(--vscode-descriptionForeground)]">
          {totalMatches > 0
            ? `${currentMatch} of ${totalMatches}`
            : searchState.query.trim()
              ? `No results in ${commits.length} loaded commits`
              : 'Type to search'}
        </span>
      </div>

      {/* How the words in a query combine — the half that changes what a user types,
          since a space is AND rather than a literal. "Somewhere on the commit" is the
          load-bearing part: two words may land on two different fields. */}
      <span className="text-xs italic text-[var(--vscode-descriptionForeground)]">
        Every word must appear somewhere on the commit; quote words to search them as one
        phrase: &quot;fix login&quot;
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => rpcClient.navigateMatch('prev')}
          disabled={totalMatches === 0}
          className={`${buttonSecondaryClassName} text-xs`}
        >
          Prev (Shift+F3)
        </button>

        <button
          type="button"
          onClick={() => rpcClient.navigateMatch('next')}
          disabled={totalMatches === 0}
          className={`${buttonPrimaryClassName} text-xs`}
        >
          Next (F3)
        </button>

        <button
          type="button"
          onClick={closeSearch}
          className={`${buttonSecondaryClassName} text-xs`}
        >
          Close (Esc)
        </button>
      </div>
    </div>
  );
}
