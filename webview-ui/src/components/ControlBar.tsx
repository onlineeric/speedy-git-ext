import { useState } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { RemoteManagementDialog } from './RemoteManagementDialog';
import { RepoSelector } from './RepoSelector';

export function ControlBar() {
  const { branches, filters, setFilters, mergedCommits, loading, totalLoadedWithoutFilter } = useGraphStore();
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branch = e.target.value || undefined;
    setFilters({ branch });
    rpcClient.getCommits({ ...filters, branch });
  };

  const handleRefresh = () => {
    rpcClient.refresh(filters);
  };

  const handleFetch = () => {
    rpcClient.fetch(undefined, true, filters);
  };

  const localBranches = branches.filter((b) => !b.remote);
  const remoteBranches = branches.filter((b) => b.remote);

  const buttonSecondaryClass =
    'px-3 py-1 text-sm bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] rounded hover:bg-[var(--vscode-button-secondaryHoverBackground)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <RepoSelector />

      <select
        value={filters.branch ?? ''}
        onChange={handleBranchChange}
        className="px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
      >
        <option value="">All Branches</option>
        {localBranches.length > 0 && (
          <optgroup label="Local">
            {localBranches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
                {branch.current ? ' *' : ''}
              </option>
            ))}
          </optgroup>
        )}
        {remoteBranches.length > 0 && (
          <optgroup label="Remote">
            {remoteBranches.map((branch) => (
              <option key={`${branch.remote}/${branch.name}`} value={`${branch.remote}/${branch.name}`}>
                {branch.remote}/{branch.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <button
        onClick={handleFetch}
        disabled={loading}
        className={buttonSecondaryClass}
        title="Fetch all remotes"
      >
        Fetch
      </button>

      <button
        onClick={() => setRemoteDialogOpen(true)}
        className={buttonSecondaryClass}
        title="Manage remotes"
      >
        Manage Remotes...
      </button>

      <button
        onClick={handleRefresh}
        className="px-3 py-1 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] focus:outline-none"
        title="Refresh"
      >
        Refresh
      </button>

      <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)]">
        {totalLoadedWithoutFilter !== null ? totalLoadedWithoutFilter : mergedCommits.length} loaded commits
      </span>

      <button
        onClick={() => rpcClient.openSettings()}
        aria-label="Open extension settings"
        className={buttonSecondaryClass}
        title="Extension settings"
      >
        ⚙
      </button>

      <RemoteManagementDialog open={remoteDialogOpen} onClose={() => setRemoteDialogOpen(false)} />
    </div>
  );
}
