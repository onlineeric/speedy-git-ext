import { useEffect, useRef } from 'react';
import { useGraphStore } from './stores/graphStore';
import { rpcClient } from './rpc/rpcClient';
import { ControlBar } from './components/ControlBar';
import { GraphContainer } from './components/GraphContainer';
import { CommitDetailsPanel } from './components/CommitDetailsPanel';
import { ToastContainer } from './components/ToastContainer';

export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { loading, detailsPanelOpen, detailsPanelPosition, mergedCommits, selectedCommitIndex, searchState } = useGraphStore();
  const setSelectedCommit = useGraphStore((state) => state.setSelectedCommit);
  const setCommitDetails = useGraphStore((state) => state.setCommitDetails);
  const setDetailsPanelOpen = useGraphStore((state) => state.setDetailsPanelOpen);
  const moveSelection = useGraphStore((state) => state.moveSelection);
  const selectCommit = useGraphStore((state) => state.selectCommit);
  const openSearch = useGraphStore((state) => state.openSearch);
  const closeSearch = useGraphStore((state) => state.closeSearch);

  useEffect(() => {
    rpcClient.initialize();
    rpcClient.getSettings();
    rpcClient.getSubmodules();
    rootRef.current?.focus();
  }, []);

  const selectedCommit = useGraphStore((state) => state.selectedCommit);

  const handleCommitSelect = (hash: string | undefined) => {
    setSelectedCommit(hash);
    if (hash) {
      rpcClient.getCommitDetails(hash);
    } else {
      setCommitDetails(undefined);
    }
  };

  const isLoadingRepo = useGraphStore((state) => state.isLoadingRepo);
  const isBottom = detailsPanelPosition === 'bottom';
  const showPanel = detailsPanelOpen;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isFormControl = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openSearch();
      return;
    }

    if (isFormControl) {
      if (event.key === 'Escape' && searchState.isOpen) {
        closeSearch();
      }
      return;
    }

    if (!event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      rpcClient.refresh(useGraphStore.getState().filters);
      return;
    }

    if (event.key === 'Escape') {
      if (detailsPanelOpen) {
        setDetailsPanelOpen(false);
        return;
      }
      if (searchState.isOpen) {
        closeSearch();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
      const nextIndex = Math.min(
        mergedCommits.length - 1,
        selectedCommitIndex >= 0 ? selectedCommitIndex + 1 : 0
      );
      const nextCommit = mergedCommits[nextIndex];
      if (nextCommit) {
        handleCommitSelect(nextCommit.hash);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
      const nextIndex = Math.max(0, selectedCommitIndex >= 0 ? selectedCommitIndex - 1 : 0);
      const nextCommit = mergedCommits[nextIndex];
      if (nextCommit) {
        handleCommitSelect(nextCommit.hash);
      }
      return;
    }

    if (event.key === 'Enter') {
      const index = selectedCommitIndex >= 0 ? selectedCommitIndex : 0;
      const commit = mergedCommits[index];
      if (commit) {
        selectCommit(index);
        handleCommitSelect(commit.hash);
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <ControlBar />
      <div className={`flex flex-1 overflow-hidden ${isBottom ? 'flex-col' : 'flex-row'}`}>
        <div className="relative flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[var(--vscode-descriptionForeground)]">
              Loading commits...
            </div>
          ) : (
            <GraphContainer
              selectedCommit={selectedCommit}
              onSelectCommit={handleCommitSelect}
            />
          )}
          {isLoadingRepo && (
            <div
              aria-busy="true"
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'var(--vscode-editor-background)', opacity: 0.7 }}
            >
              <span className="text-sm text-[var(--vscode-descriptionForeground)]">Switching repository…</span>
            </div>
          )}
        </div>
        {showPanel && <CommitDetailsPanel />}
      </div>
      <ToastContainer />
    </div>
  );
}
