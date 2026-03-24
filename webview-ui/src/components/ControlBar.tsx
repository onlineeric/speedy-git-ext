import { useState } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { RemoteManagementDialog } from './RemoteManagementDialog';
import { RepoSelector } from './RepoSelector';
import { FilterableBranchDropdown } from './FilterableBranchDropdown';
import { CloudIcon } from './icons';

export function ControlBar() {
  const { branches, filters, setFilters, mergedCommits, loading, totalLoadedWithoutFilter, searchState, openSearch, closeSearch } = useGraphStore();
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  const handleBranchSelect = (branch: string | undefined) => {
    setFilters({ branch });
    rpcClient.getCommits({ ...filters, branch });
  };

  const handleRefresh = () => {
    rpcClient.refresh(filters);
  };

  const handleFetch = () => {
    rpcClient.fetch(undefined, true, filters);
  };

  const buttonSecondaryClass =
    'px-3 py-1 text-sm bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] rounded hover:bg-[var(--vscode-button-secondaryHoverBackground)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <RepoSelector />

      <FilterableBranchDropdown
        branches={branches}
        selectedBranch={filters.branch}
        onBranchSelect={handleBranchSelect}
      />

      <button
        onClick={handleRefresh}
        className="px-3 py-1 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] focus:outline-none"
        title="Refresh"
      >
        Refresh
      </button>

      <button
        onClick={handleFetch}
        disabled={loading}
        className={buttonSecondaryClass}
        title="Fetch all remotes"
      >
        Fetch
      </button>

      <button
        onClick={() => (searchState.isOpen ? closeSearch() : openSearch())}
        className={buttonSecondaryClass}
        title="Search commits"
      >
        Search
      </button>

      <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)]">
        {totalLoadedWithoutFilter !== null ? totalLoadedWithoutFilter : mergedCommits.length} loaded commits
      </span>

      <button
        onClick={() => setRemoteDialogOpen(true)}
        aria-label="Manage Remotes"
        className={buttonSecondaryClass}
        title="Manage Remotes"
      >
        <CloudIcon />
      </button>

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
