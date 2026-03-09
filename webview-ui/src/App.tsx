import { useEffect, useCallback } from 'react';
import { useGraphStore } from './stores/graphStore';
import { rpcClient } from './rpc/rpcClient';
import { ControlBar } from './components/ControlBar';
import { GraphContainer } from './components/GraphContainer';
import { CommitDetailsPanel } from './components/CommitDetailsPanel';
import { ToastContainer } from './components/ToastContainer';

export function App() {
  const { loading, detailsPanelOpen, detailsPanelPosition } = useGraphStore();

  useEffect(() => {
    rpcClient.initialize();
  }, []);

  const selectedCommit = useGraphStore((s) => s.selectedCommit);
  const handleCommitSelect = useCallback(
    (hash: string | undefined) => {
      const store = useGraphStore.getState();
      store.setSelectedCommit(hash);
      if (hash) {
        rpcClient.getCommitDetails(hash);
      } else {
        store.setCommitDetails(undefined);
      }
    },
    []
  );

  const isLoadingRepo = useGraphStore((s) => s.isLoadingRepo);
  const isBottom = detailsPanelPosition === 'bottom';
  const showPanel = detailsPanelOpen;

  return (
    <div className="flex flex-col h-full">
      <ControlBar />
      <div className={`flex-1 overflow-hidden flex ${isBottom ? 'flex-col' : 'flex-row'}`}>
        <div className="flex-1 overflow-hidden relative">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
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
