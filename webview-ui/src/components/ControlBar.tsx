import { useState, useEffect } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { RemoteManagementDialog } from './RemoteManagementDialog';
import { RepoSelector } from './RepoSelector';
import { MultiBranchDropdown } from './MultiBranchDropdown';
import { CloudIcon, FilterIcon, CompareIcon, SettingsIcon, SearchIcon, RefreshIcon, FetchIcon } from './icons';

const TOGGLE_BUTTON_COLORS = {
  inactive: 'text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100',
  active: 'text-yellow-500 opacity-100',
  filtered: 'text-red-500 opacity-100',
} as const;

export function ControlBar() {
  const { branches, filters, setFilters, mergedCommits, loading, totalLoadedWithoutFilter, setActiveToggleWidget, activeToggleWidget } = useGraphStore();
  const graphFilters = useGraphStore((state) => state.filters);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  // Reconcile selected branches when branch list changes (e.g., after fetch/prune)
  useEffect(() => {
    const currentFilters = useGraphStore.getState().filters;
    const selected = currentFilters.branches;
    if (!selected || selected.length === 0) return;
    const branchNames = new Set(
      branches.flatMap((b) => [b.name, ...(b.remote ? [`${b.remote}/${b.name}`] : [])]),
    );
    const valid = selected.filter((name) => branchNames.has(name));
    if (valid.length !== selected.length) {
      const newBranches = valid.length > 0 ? valid : undefined;
      setFilters({ branches: newBranches });
      rpcClient.getCommits({ ...currentFilters, branches: newBranches });
    }
  }, [branches, setFilters]);

  const handleBranchToggle = (branch: string) => {
    const current = filters.branches ?? [];
    const next = current.includes(branch)
      ? current.filter((b) => b !== branch)
      : [...current, branch];
    // When last branch is deselected, clear to "All Branches"
    const newBranches = next.length > 0 ? next : undefined;
    setFilters({ branches: newBranches });
    rpcClient.getCommits({ ...filters, branches: newBranches });
  };

  const handleClearSelection = () => {
    setFilters({ branches: undefined });
    rpcClient.getCommits({ ...filters, branches: undefined });
  };

  const handleRefresh = () => {
    rpcClient.refresh(filters);
  };

  const [fetching, setFetching] = useState(false);

  const handleFetch = () => {
    setFetching(true);

    rpcClient.fetch(undefined, true, filters);

    // Reset after success/error response or timeout (30s safety net)
    const timeout = setTimeout(() => setFetching(false), 30_000);
    const prevSuccess = useGraphStore.getState().successMessage;
    const prevError = useGraphStore.getState().error;
    const unsub = useGraphStore.subscribe((state) => {
      if (state.successMessage !== prevSuccess || state.error !== prevError) {
        setFetching(false);
        clearTimeout(timeout);
        unsub();
      }
    });
  };

  const iconButtonClass =
    'flex items-center justify-center p-1.5 rounded focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--vscode-toolbar-hoverBackground)]';
  const iconClass = 'w-6 h-6';

  const filterHasBranchFilter = (graphFilters.branches?.length ?? 0) > 0;
  const filterColor =
    activeToggleWidget === 'filter'
      ? TOGGLE_BUTTON_COLORS.active
      : filterHasBranchFilter
        ? TOGGLE_BUTTON_COLORS.filtered
        : TOGGLE_BUTTON_COLORS.inactive;
  const searchColor =
    activeToggleWidget === 'search' ? TOGGLE_BUTTON_COLORS.active : TOGGLE_BUTTON_COLORS.inactive;
  const compareColor =
    activeToggleWidget === 'compare' ? TOGGLE_BUTTON_COLORS.active : TOGGLE_BUTTON_COLORS.inactive;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <RepoSelector />

      <MultiBranchDropdown
        branches={branches}
        selectedBranches={filters.branches ?? []}
        onBranchToggle={handleBranchToggle}
        onClearSelection={handleClearSelection}
      />

      <button
        onClick={() => setActiveToggleWidget('filter')}
        className={`${iconButtonClass} ${filterColor}`}
        title="Filter"
      >
        <FilterIcon className={iconClass} />
      </button>

      <button
        onClick={handleRefresh}
        className={`${iconButtonClass} ${TOGGLE_BUTTON_COLORS.inactive}`}
        title="Refresh"
      >
        <RefreshIcon className={iconClass} />
      </button>

      <button
        onClick={handleFetch}
        disabled={fetching || loading}
        className={`${iconButtonClass} ${TOGGLE_BUTTON_COLORS.inactive}`}
        title="Fetch all remotes"
      >
        <FetchIcon className={iconClass} />
      </button>

      <button
        onClick={() => setActiveToggleWidget('compare')}
        className={`${iconButtonClass} ${compareColor}`}
        title="Compare"
      >
        <CompareIcon className={iconClass} />
      </button>

      <button
        onClick={() => setActiveToggleWidget('search')}
        className={`${iconButtonClass} ${searchColor}`}
        title="Search commits"
      >
        <SearchIcon className={iconClass} />
      </button>

      <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)] px-1">
        {totalLoadedWithoutFilter !== null ? totalLoadedWithoutFilter : mergedCommits.length} loaded
      </span>

      <button
        onClick={() => setRemoteDialogOpen(true)}
        aria-label="Manage Remotes"
        className={`${iconButtonClass} ${TOGGLE_BUTTON_COLORS.inactive}`}
        title="Manage Remotes"
      >
        <CloudIcon className={iconClass} />
      </button>

      <button
        onClick={() => rpcClient.openSettings()}
        aria-label="Open extension settings"
        className={`${iconButtonClass} ${TOGGLE_BUTTON_COLORS.inactive}`}
        title="Extension settings"
      >
        <SettingsIcon className={iconClass} />
      </button>

      <RemoteManagementDialog open={remoteDialogOpen} onClose={() => setRemoteDialogOpen(false)} />
    </div>
  );
}
