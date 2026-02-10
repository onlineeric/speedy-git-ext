import { useEffect, useCallback } from 'react';
import { useGraphStore } from './stores/graphStore';
import { rpcClient } from './rpc/rpcClient';
import { ControlBar } from './components/ControlBar';
import { GraphContainer } from './components/GraphContainer';
import { CommitDetailsPanel } from './components/CommitDetailsPanel';

export function App() {
  const { loading, error, successMessage, detailsPanelOpen, detailsPanelPosition } = useGraphStore();

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

  const isBottom = detailsPanelPosition === 'bottom';
  const showPanel = detailsPanelOpen;

  return (
    <div className="flex flex-col h-full">
      <ControlBar />
      {error && (
        <div className="px-4 py-2 text-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)]">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="px-4 py-1 text-xs text-[var(--vscode-terminal-ansiGreen)] bg-[var(--vscode-editor-background)]">
          {successMessage}
        </div>
      )}
      <div className={`flex-1 overflow-hidden flex ${isBottom ? 'flex-col' : 'flex-row'}`}>
        <div className="flex-1 overflow-hidden">
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
        </div>
        {showPanel && <CommitDetailsPanel />}
      </div>
    </div>
  );
}
