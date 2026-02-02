import { useEffect } from 'react';
import { useGraphStore } from './stores/graphStore';
import { rpcClient } from './rpc/rpcClient';
import { ControlBar } from './components/ControlBar';
import { GraphContainer } from './components/GraphContainer';

export function App() {
  const { loading, error } = useGraphStore();

  useEffect(() => {
    rpcClient.initialize();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <ControlBar />
      {error && (
        <div className="px-4 py-2 text-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)]">
          {error}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
            Loading commits...
          </div>
        ) : (
          <GraphContainer />
        )}
      </div>
    </div>
  );
}
