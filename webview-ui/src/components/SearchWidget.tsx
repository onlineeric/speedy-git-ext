import { useEffect } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { filterCommits } from '../utils/searchFilter';

export function SearchWidget() {
  const commits = useGraphStore((state) => state.mergedCommits);
  const searchState = useGraphStore((state) => state.searchState);
  const closeSearch = useGraphStore((state) => state.closeSearch);
  const nextMatch = useGraphStore((state) => state.nextMatch);
  const prevMatch = useGraphStore((state) => state.prevMatch);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const setSearchMatches = useGraphStore((state) => state.setSearchMatches);

  useEffect(() => {
    if (!searchState.isOpen) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setSearchMatches(filterCommits(commits, searchState.query));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [commits, searchState.isOpen, searchState.query, setSearchMatches]);

  if (!searchState.isOpen) {
    return null;
  }

  const totalMatches = searchState.matchIndices.length;
  const currentMatch = totalMatches > 0 ? searchState.currentMatchIndex + 1 : 0;

  const handleNext = () => {
    nextMatch();
    const hash = useGraphStore.getState().selectedCommit;
    if (hash) rpcClient.getCommitDetails(hash);
  };

  const handlePrev = () => {
    prevMatch();
    const hash = useGraphStore.getState().selectedCommit;
    if (hash) rpcClient.getCommitDetails(hash);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 shadow-sm">
      <input
        autoFocus
        type="text"
        value={searchState.query}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search commits (Ctrl+F)"
        className="min-w-[220px] rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-sm text-[var(--vscode-input-foreground)] outline-none"
      />

      <span className="min-w-[70px] text-xs text-[var(--vscode-descriptionForeground)]">
        {totalMatches > 0 ? `${currentMatch} of ${totalMatches}` : searchState.query.trim() ? 'No results' : 'Type to search'}
      </span>

      <button
        type="button"
        onClick={handlePrev}
        disabled={totalMatches === 0}
        className="rounded px-2 py-1 text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] disabled:opacity-50"
      >
        Prev (Shift+F3)
      </button>

      <button
        type="button"
        onClick={handleNext}
        disabled={totalMatches === 0}
        className="rounded px-2 py-1 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] disabled:opacity-50"
      >
        Next (F3)
      </button>

      <button
        type="button"
        onClick={closeSearch}
        className="rounded px-2 py-1 text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
      >
        Close (Esc)
      </button>

      <span className="whitespace-nowrap text-xs italic text-[var(--vscode-descriptionForeground)]">
        Tips: You can filter message in Filter Panel
      </span>
    </div>
  );
}
