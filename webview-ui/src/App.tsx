import { useEffect, useRef } from 'react';
import { useGraphStore } from './stores/graphStore';
import { rpcClient } from './rpc/rpcClient';
import { ControlBar } from './components/ControlBar';
import { GraphContainer } from './components/GraphContainer';
import { CommitDetailsPanel } from './components/CommitDetailsPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastContainer } from './components/ToastContainer';

export function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { detailsPanelOpen, detailsPanelPosition, mergedCommits, selectedCommitIndex } = useGraphStore();
  const activeToggleWidget = useGraphStore((state) => state.activeToggleWidget);
  const setActiveToggleWidget = useGraphStore((state) => state.setActiveToggleWidget);
  const setSelectedCommit = useGraphStore((state) => state.setSelectedCommit);
  const setCommitDetails = useGraphStore((state) => state.setCommitDetails);
  const setDetailsPanelOpen = useGraphStore((state) => state.setDetailsPanelOpen);
  const moveSelection = useGraphStore((state) => state.moveSelection);
  const selectCommit = useGraphStore((state) => state.selectCommit);
  const searchState = useGraphStore((state) => state.searchState);
  const nextMatch = useGraphStore((state) => state.nextMatch);
  const prevMatch = useGraphStore((state) => state.prevMatch);

  useEffect(() => {
    rpcClient.initialize();
    rpcClient.getSettings();
    rpcClient.getSubmodules();
    rootRef.current?.focus();
  }, []);

  const selectedCommit = useGraphStore((state) => state.selectedCommit);
  const pendingCommitCheckout = useGraphStore((state) => state.pendingCommitCheckout);
  const pendingCheckoutCommit = pendingCommitCheckout
    ? mergedCommits.find((commit) => commit.hash === pendingCommitCheckout.hash)
    : undefined;
  const pendingCheckoutAbbreviatedHash = pendingCheckoutCommit?.abbreviatedHash
    ?? pendingCommitCheckout?.hash.slice(0, 7);

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
      const isClosing = activeToggleWidget === 'search';
      setActiveToggleWidget('search');
      if (isClosing) {
        rootRef.current?.focus();
      }
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      if (searchState.isOpen) {
        if (event.shiftKey) {
          prevMatch();
        } else {
          nextMatch();
        }
        const hash = useGraphStore.getState().selectedCommit;
        if (hash) {
          rpcClient.getCommitDetails(hash);
        }
      }
      return;
    }

    if (isFormControl) {
      if (event.key === 'Escape' && activeToggleWidget !== null) {
        setActiveToggleWidget(null);
        rootRef.current?.focus();
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
      if (activeToggleWidget !== null) {
        setActiveToggleWidget(null);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
      const nextHash = useGraphStore.getState().selectedCommit;
      if (nextHash) {
        rpcClient.getCommitDetails(nextHash);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
      const nextHash = useGraphStore.getState().selectedCommit;
      if (nextHash) {
        rpcClient.getCommitDetails(nextHash);
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
          <GraphContainer
            selectedCommit={selectedCommit}
            onSelectCommit={handleCommitSelect}
          />
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
      <ConfirmDialog
        open={pendingCommitCheckout !== null}
        onConfirm={() => {
          const checkout = useGraphStore.getState().pendingCommitCheckout;
          useGraphStore.getState().setPendingCommitCheckout(null);
          if (checkout) {
            rpcClient.stashAndCheckoutCommit(checkout.hash);
          }
        }}
        onCancel={() => useGraphStore.getState().setPendingCommitCheckout(null)}
        title="Stash Changes"
        description={`You have uncommitted changes. Stash them and checkout commit ${pendingCheckoutAbbreviatedHash ?? 'selected commit'}?`}
        confirmLabel="Stash & Checkout"
        variant="warning"
      />
      <ToastContainer />
    </div>
  );
}
