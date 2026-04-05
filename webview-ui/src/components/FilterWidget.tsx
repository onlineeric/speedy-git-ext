import { useCallback, useMemo, useState, useEffect } from 'react';
import type { Author } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { AuthorBadge } from './AuthorBadge';
import { AuthorAvatar } from './AuthorAvatar';
import { RefLabel } from './RefLabel';
import { getBranchLaneColorStyle } from '../utils/filterUtils';
import { toDisplayRef, combineBranchRefs } from '../utils/filterUtils';

// Stable module-level helpers for MultiSelectDropdown props (avoids inline arrow functions
// that would defeat React.memo on every render).
function getAuthorKey(author: Author): string {
  return author.email;
}

function getAuthorSearchText(author: Author): string {
  return `${author.name} ${author.email}`;
}

export function FilterWidget() {
  const filters = useGraphStore((s) => s.filters);
  const authorList = useGraphStore((s) => s.authorList);
  const setFilters = useGraphStore((s) => s.setFilters);
  const recomputeVisibility = useGraphStore((s) => s.recomputeVisibility);
  const resetAllFilters = useGraphStore((s) => s.resetAllFilters);
  const setActiveToggleWidget = useGraphStore((s) => s.setActiveToggleWidget);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const topology = useGraphStore((s) => s.topology);
  const graphColors = useGraphStore((s) => s.userSettings.graphColors);
  const branches = useGraphStore((s) => s.branches);

  // Date range local state
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');

  // Sync local date state with store (handles external changes like context menu and Reset All)
  useEffect(() => {
    const unsub = useGraphStore.subscribe((state, prevState) => {
      if (state.filters.afterDate !== prevState.filters.afterDate) {
        if (state.filters.afterDate) {
          const [date, time] = state.filters.afterDate.split('T');
          setFromDate(date);
          setFromTime(time === '00:00:00' ? '' : time);
        } else {
          setFromDate('');
          setFromTime('');
        }
      }
      if (state.filters.beforeDate !== prevState.filters.beforeDate) {
        if (state.filters.beforeDate) {
          const [date, time] = state.filters.beforeDate.split('T');
          setToDate(date);
          setToTime(time === '23:59:59' ? '' : time);
        } else {
          setToDate('');
          setToTime('');
        }
      }
    });
    return unsub;
  }, []);

  // Derive validation (time without date is invalid)
  const dateValidation = useMemo(
    () => ({ from: !fromTime || !!fromDate, to: !toTime || !!toDate }),
    [fromDate, fromTime, toDate, toTime],
  );

  // Debounced date filter application
  useEffect(() => {
    if (!dateValidation.from || !dateValidation.to) return;

    const afterDate = fromDate
      ? `${fromDate}T${fromTime || '00:00:00'}`
      : undefined;
    const beforeDate = toDate
      ? `${toDate}T${toTime || '23:59:59'}`
      : undefined;

    // Skip if store already matches (avoids unnecessary re-render loops on mount)
    const currentFilters = useGraphStore.getState().filters;
    if (currentFilters.afterDate === afterDate && currentFilters.beforeDate === beforeDate) return;

    const timer = setTimeout(() => {
      setFilters({ afterDate, beforeDate });
      rpcClient.getCommits({ ...useGraphStore.getState().filters, afterDate, beforeDate });
    }, 150);

    return () => clearTimeout(timer);
  }, [fromDate, fromTime, toDate, toTime, setFilters, dateValidation.from, dateValidation.to]);

  // Author dropdown helpers
  const selectedAuthors = useMemo(
    () => authorList.filter((a) => filters.authors?.includes(a.email)),
    [authorList, filters.authors],
  );

  // Stable callbacks: read current filter state from getState() inside the callback
  // so the dependency array is empty and the function reference never changes.
  const handleAuthorToggle = useCallback(
    (author: Author) => {
      const current = useGraphStore.getState().filters.authors ?? [];
      const exists = current.includes(author.email);
      const next = exists
        ? current.filter((e) => e !== author.email)
        : [...current, author.email];
      const authors = next.length > 0 ? next : undefined;
      setFilters({ authors });
      recomputeVisibility();
    },
    [setFilters, recomputeVisibility],
  );

  const handleAuthorClear = useCallback(() => {
    setFilters({ authors: undefined });
    recomputeVisibility();
  }, [setFilters, recomputeVisibility]);

  const handleAuthorRemove = useCallback(
    (email: string) => {
      const current = useGraphStore.getState().filters.authors ?? [];
      const next = current.filter((e) => e !== email);
      const authors = next.length > 0 ? next : undefined;
      setFilters({ authors });
      recomputeVisibility();
    },
    [setFilters, recomputeVisibility],
  );

  // Branch badge removal (accepts multiple names for combined local+remote badges)
  const handleBranchRemove = useCallback(
    (branchNames: string[]) => {
      const removeSet = new Set(branchNames);
      const current = useGraphStore.getState().filters.branches ?? [];
      const next = current.filter((b) => !removeSet.has(b));
      const branches = next.length > 0 ? next : undefined;
      setFilters({ branches });
      rpcClient.getCommits({ ...useGraphStore.getState().filters, branches });
    },
    [setFilters],
  );

  // Reset All handler
  const handleResetAll = useCallback(() => {
    const filters = useGraphStore.getState().filters;
    const hadStructuralFilters = !!(filters.branches?.length || filters.afterDate || filters.beforeDate);
    resetAllFilters({ preserveBranches: false });
    recomputeVisibility();
    // Only re-fetch from backend if structural filters were active
    if (hadStructuralFilters) {
      rpcClient.getCommits(useGraphStore.getState().filters);
    }
  }, [resetAllFilters, recomputeVisibility]);

  const hasAnyFilters = !!(filters.branches?.length || filters.authors?.length || filters.afterDate || filters.beforeDate);

  // Branch badges: combine local+remote into merged badges
  const branchBadges = useMemo(
    () => combineBranchRefs(filters.branches ?? [], branches),
    [filters.branches, branches],
  );

  const renderAuthorTrigger = useCallback(
    (selectedCount: number) => {
      const loading = useGraphStore.getState().authorListLoading;
      const authors = useGraphStore.getState().filters.authors;
      const list = useGraphStore.getState().authorList;
      let label: string;
      if (selectedCount === 0) {
        label = 'All Authors';
      } else if (selectedCount === 1) {
        const email = authors?.[0];
        label = list.find((a) => a.email === email)?.name ?? 'All Authors';
      } else {
        label = `${selectedCount} authors selected`;
      }
      return (
        <button
          className="px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[260px] flex items-center gap-1"
          title={label}
        >
          <span className="truncate">{loading ? 'Loading...' : label}</span>
          <svg className="ml-auto flex-shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      );
    },
    [],
  );

  const renderAuthorItem = useCallback(
    (author: Author, isSelected: boolean) => (
      <span className="flex items-center gap-2">
        <span className="w-4 flex-shrink-0 text-center">
          {isSelected ? '✓' : ''}
        </span>
        <AuthorAvatar author={author.name} email={author.email} />
        <span className="truncate">{author.name}</span>
        <span className="text-[var(--vscode-descriptionForeground)] truncate text-xs">{author.email}</span>
      </span>
    ),
    [],
  );

  return (
    <div className="px-4 py-2 text-sm border-b border-[var(--vscode-panel-border)] flex flex-col gap-2">
      {/* Header with Reset All and Close */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[var(--vscode-foreground)]">Filters</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAll}
            disabled={!hasAnyFilters}
            className="px-2 py-0.5 text-xs rounded border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset All
          </button>
          <button
            onClick={() => setActiveToggleWidget(null)}
            className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            title="Close filter panel"
            aria-label="Close filter panel"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Branch filter row */}
      <div className="flex gap-2">
        <span className="text-[var(--vscode-descriptionForeground)] w-16 flex-shrink-0 pt-0.5">Branches</span>
        <div className="flex-1 min-w-0">
          {branchBadges.length === 0 ? (
            <span className="text-[var(--vscode-descriptionForeground)]">All branches</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-[104px] overflow-y-auto">
              {branchBadges.map((badge) => {
                const colorStyle = getBranchLaneColorStyle(
                  badge.primaryName,
                  mergedCommits,
                  topology,
                  graphColors,
                );
                const removeBtnStyle: React.CSSProperties = colorStyle
                  ? { backgroundColor: colorStyle.backgroundColor, color: colorStyle.color, borderColor: colorStyle.borderColor }
                  : {};
                const removeBtnFallback = !colorStyle
                  ? 'border-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
                  : '';
                return (
                  <span key={badge.key} className="inline-flex items-stretch">
                    <RefLabel
                      displayRef={toDisplayRef(badge)}
                      laneColorStyle={colorStyle}
                      className="whitespace-nowrap !rounded-r-none"
                      style={{ borderRightWidth: 0 }}
                    />
                    <button
                      onClick={() => handleBranchRemove(badge.allNames)}
                      className={`flex-shrink-0 px-1 py-0.5 text-xs border rounded-r flex items-center hover:brightness-75 focus:outline-none ${removeBtnFallback}`}
                      style={{ ...removeBtnStyle, borderLeftWidth: 0 }}
                      title={`Remove ${badge.primaryName}`}
                      aria-label={`Remove ${badge.primaryName} from filter`}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Author filter row */}
      <div className="flex gap-2">
        <span className="text-[var(--vscode-descriptionForeground)] w-16 flex-shrink-0 pt-0.5">Authors</span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <MultiSelectDropdown<Author>
            items={authorList}
            selectedItems={selectedAuthors}
            onToggle={handleAuthorToggle}
            onClearAll={handleAuthorClear}
            getKey={getAuthorKey}
            getSearchText={getAuthorSearchText}
            renderItem={renderAuthorItem}
            renderTrigger={renderAuthorTrigger}
            placeholder="Filter authors..."
            clearAllLabel="All Authors"
          />
          {(filters.authors?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1 max-h-[104px] overflow-y-auto">
              {filters.authors!.map((email) => {
                const author = authorList.find((a) => a.email === email);
                return (
                  <AuthorBadge
                    key={email}
                    name={author?.name ?? email}
                    email={email}
                    onRemove={() => handleAuthorRemove(email)}
                  />
                );
              })}
            </div>
          ) : (
            <span className="text-[var(--vscode-descriptionForeground)]">All authors</span>
          )}
        </div>
      </div>

      {/* Date range row */}
      <div className="flex gap-2">
        <span className="text-[var(--vscode-descriptionForeground)] w-16 flex-shrink-0 pt-0.5">Dates</span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[var(--vscode-descriptionForeground)] text-xs w-8">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`px-1 py-0.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] ${
                dateValidation.from ? 'border-[var(--vscode-input-border)]' : 'border-red-500'
              }`}
            />
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className={`px-1 py-0.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] w-20 ${
                dateValidation.from ? 'border-[var(--vscode-input-border)]' : 'border-red-500'
              }`}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[var(--vscode-descriptionForeground)] text-xs w-8">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={`px-1 py-0.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] ${
                dateValidation.to ? 'border-[var(--vscode-input-border)]' : 'border-red-500'
              }`}
            />
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className={`px-1 py-0.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] w-20 ${
                dateValidation.to ? 'border-[var(--vscode-input-border)]' : 'border-red-500'
              }`}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
