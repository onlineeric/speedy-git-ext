import { useState, useEffect } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { RemoteManagementDialog } from './RemoteManagementDialog';
import { RepoSelector } from './RepoSelector';
import { SubmoduleSelector } from './SubmoduleSelector';
import { MultiBranchDropdown } from './MultiBranchDropdown';
import { addAllLocalBranches } from '../utils/branchSelection';
import { CommitListSettingsPopover } from './CommitListSettingsPopover';
import { ToolbarIconButton, RemoteButtonToggleItem } from './ToolbarIconButton';
import {
  CloudIcon,
  FilterIcon,
  CompareIcon,
  SettingsIcon,
  SearchIcon,
  RefreshIcon,
  FetchIcon,
  ToolbarSeparatorIcon,
  WorktreeIcon,
} from './icons';

/**
 * Panel-toggle telemetry actions (049-usage-telemetry). The four toggle
 * buttons are the panel toggles, so a click is tracked once as a
 * `panelToggle` open/close — not additionally as a plain toolbar click.
 */
const PANEL_TOGGLE_ACTIONS = {
  filter: { open: 'filterOpen', close: 'filterClose' },
  search: { open: 'searchOpen', close: 'searchClose' },
  compare: { open: 'compareOpen', close: 'compareClose' },
  worktree: { open: 'worktreeOpen', close: 'worktreeClose' },
} as const;

const TOGGLE_BUTTON_COLORS = {
  inactive: 'text-[var(--vscode-icon-foreground)] opacity-70 hover:opacity-100',
  active: 'text-sky-400 opacity-100',
  filtered: 'text-yellow-400 opacity-100',
  processing: 'text-yellow-400 opacity-100',
} as const;

export function ControlBar() {
  const { branches, filters, setFilters, mergedCommits, loading, totalLoadedWithoutFilter, setActiveToggleWidget, activeToggleWidget, isRefreshing } = useGraphStore();
  const graphFilters = useGraphStore((state) => state.filters);
  const isCurrentLinkedWorktree = useGraphStore((state) => state.worktreeList.some((wt) => wt.isCurrent && !wt.isMain));
  const showRemoteButton = useGraphStore((state) => state.userSettings.toolbarShowRemoteButton);
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

  const applyBranchFilter = (newBranches: string[] | undefined) => {
    setFilters({ branches: newBranches });
    rpcClient.getCommits({ ...filters, branches: newBranches });
  };

  const handleBranchToggle = (branch: string) => {
    const current = filters.branches ?? [];
    const next = current.includes(branch)
      ? current.filter((b) => b !== branch)
      : [...current, branch];
    // When last branch is deselected, clear to "All Branches"
    applyBranchFilter(next.length > 0 ? next : undefined);
  };

  const handleClearSelection = () => {
    applyBranchFilter(undefined);
  };

  const handleSelectAllLocalBranches = () => {
    const next = addAllLocalBranches(filters.branches ?? [], branches);
    if (next) applyBranchFilter(next);
  };

  const handleToggleWidget = (widget: keyof typeof PANEL_TOGGLE_ACTIONS) => {
    const isClosing = activeToggleWidget === widget;
    trackUiInteraction('panelToggle', PANEL_TOGGLE_ACTIONS[widget][isClosing ? 'close' : 'open']);
    setActiveToggleWidget(widget);
  };

  const handleRefresh = () => {
    trackUiInteraction('toolbar', 'refresh');
    useGraphStore.getState().setIsRefreshing(true);
    rpcClient.refresh(filters);
  };

  const [fetching, setFetching] = useState(false);

  const handleFetch = () => {
    trackUiInteraction('toolbar', 'fetch');
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

  const iconClass = 'w-6 h-6';

  const hasAnyFilter = (graphFilters.branches?.length ?? 0) > 0
    || (graphFilters.authors?.length ?? 0) > 0
    || !!graphFilters.afterDate
    || !!graphFilters.beforeDate;
  const filterColor =
    activeToggleWidget === 'filter'
      ? TOGGLE_BUTTON_COLORS.active
      : hasAnyFilter
        ? TOGGLE_BUTTON_COLORS.filtered
        : TOGGLE_BUTTON_COLORS.inactive;
  const searchColor =
    activeToggleWidget === 'search' ? TOGGLE_BUTTON_COLORS.active : TOGGLE_BUTTON_COLORS.inactive;
  const worktreeColor =
    activeToggleWidget === 'worktree'
      ? TOGGLE_BUTTON_COLORS.active
      : isCurrentLinkedWorktree
        ? TOGGLE_BUTTON_COLORS.filtered
        : TOGGLE_BUTTON_COLORS.inactive;
  const worktreeTitle = isCurrentLinkedWorktree ? 'You are in a Worktree' : 'Worktrees';
  // FR-002 (042-compare-refs): three-state Compare toolbar color (idle / open / pending).
  const compareSelection = useGraphStore((state) => state.compareSelection);
  const anyCompareSlotFilled = compareSelection.a !== null || compareSelection.b !== null;
  const compareColor =
    activeToggleWidget === 'compare'
      ? TOGGLE_BUTTON_COLORS.active
      : anyCompareSlotFilled
        ? TOGGLE_BUTTON_COLORS.filtered
        : TOGGLE_BUTTON_COLORS.inactive;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <RepoSelector />
      <SubmoduleSelector />

      <MultiBranchDropdown
        branches={branches}
        selectedBranches={filters.branches ?? []}
        onBranchToggle={handleBranchToggle}
        onClearSelection={handleClearSelection}
        onSelectAllLocalBranches={handleSelectAllLocalBranches}
      />

      <ToolbarIconButton
        label="Filter"
        icon={<FilterIcon className={iconClass} />}
        onClick={() => handleToggleWidget('filter')}
        className={filterColor}
        title="Filter"
      />

      <ToolbarIconButton
        label="Search"
        icon={<SearchIcon className={iconClass} />}
        onClick={() => handleToggleWidget('search')}
        className={searchColor}
        title="Search commits"
      />

      <ToolbarIconButton
        label="Compare"
        icon={<CompareIcon className={iconClass} />}
        onClick={() => handleToggleWidget('compare')}
        className={compareColor}
        title="Compare refs (Base vs Target)"
      />

      <ToolbarIconButton
        label="Worktrees"
        icon={<WorktreeIcon className={iconClass} />}
        onClick={() => handleToggleWidget('worktree')}
        className={worktreeColor}
        title={worktreeTitle}
      />

      <ToolbarSeparatorIcon className="h-6 w-4 text-[var(--vscode-panel-border)] opacity-90" />

      <ToolbarIconButton
        label="Refresh"
        icon={<RefreshIcon className={`${iconClass}${isRefreshing ? ' animate-spin' : ''}`} />}
        onClick={handleRefresh}
        className={isRefreshing ? TOGGLE_BUTTON_COLORS.processing : TOGGLE_BUTTON_COLORS.inactive}
        title="Refresh"
      />

      <ToolbarIconButton
        label="Fetch"
        icon={<FetchIcon className={iconClass} />}
        onClick={handleFetch}
        disabled={fetching || loading}
        className={fetching ? TOGGLE_BUTTON_COLORS.processing : TOGGLE_BUTTON_COLORS.inactive}
        title="Fetch all remotes"
      />

      <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)] px-1">
        {totalLoadedWithoutFilter !== null ? totalLoadedWithoutFilter : mergedCommits.length} loaded
      </span>

      <CommitListSettingsPopover />

      {showRemoteButton && (
        <ToolbarIconButton
          label="Remote"
          icon={<CloudIcon className={iconClass} />}
          onClick={() => {
            trackUiInteraction('toolbar', 'remote');
            setRemoteDialogOpen(true);
          }}
          aria-label="Manage Remotes"
          className={TOGGLE_BUTTON_COLORS.inactive}
          title="Manage Remotes"
          extraMenuItems={<RemoteButtonToggleItem />}
        />
      )}

      <ToolbarIconButton
        label="Settings"
        icon={<SettingsIcon className={iconClass} />}
        onClick={() => {
          trackUiInteraction('toolbar', 'settings');
          rpcClient.openSettings();
        }}
        aria-label="Open extension settings"
        className={TOGGLE_BUTTON_COLORS.inactive}
        title="Extension settings"
        extraMenuItems={<RemoteButtonToggleItem />}
      />

      <RemoteManagementDialog open={remoteDialogOpen} onClose={() => setRemoteDialogOpen(false)} />
    </div>
  );
}
