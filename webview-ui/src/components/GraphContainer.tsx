import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { CommitRow } from './CommitRow';
import { CommitTableHeader } from './CommitTableHeader';
import { CommitTableRow } from './CommitTableRow';
import { CherryPickConflictBanner } from './CherryPickConflictBanner';
import { RebaseConflictBanner } from './RebaseConflictBanner';
import { TogglePanel } from './TogglePanel';
import { CommitTooltip } from './CommitTooltip';
import { useTooltipHover } from '../hooks/useTooltipHover';
import { resolveCommitTableLayout } from '../utils/commitTableLayout';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 16;

interface GraphContainerProps {
  selectedCommit: string | undefined;
  onSelectCommit: (hash: string | undefined) => void;
}

function computeMaxVisibleRefs(width: number): number {
  if (width < 700) return 2;
  if (width < 900) return 3;
  if (width < 1200) return 5;
  return 7;
}

export function GraphContainer({ selectedCommit, onSelectCommit }: GraphContainerProps) {
  const { mergedCommits: commits, topology, maxVisibleRefs, setMaxVisibleRefs } = useGraphStore();
  const prefetching = useGraphStore((state) => state.prefetching);
  const hasMore = useGraphStore((state) => state.hasMore);
  const lastBatchStartIndex = useGraphStore((state) => state.lastBatchStartIndex);
  const hiddenCommitHashes = useGraphStore((state) => state.hiddenCommitHashes);
  const showGapIndicator = useGraphStore((state) => state.showGapIndicator);
  const filteredOutCount = useGraphStore((state) => state.filteredOutCount);
  const allCommitsCount = useGraphStore((state) => state.commits.length);
  const selectedCommits = useGraphStore((state) => state.selectedCommits);
  const commitListMode = useGraphStore((state) => state.commitListMode);
  const commitTableLayout = useGraphStore((state) => state.commitTableLayout);
  const selectedCommitsSet = useMemo(() => new Set(selectedCommits), [selectedCommits]);
  const toggleSelectedCommit = useGraphStore((state) => state.toggleSelectedCommit);
  const selectCommitRange = useGraphStore((state) => state.selectCommitRange);
  const clearSelectedCommits = useGraphStore((state) => state.clearSelectedCommits);
  const setSelectionAnchor = useGraphStore((state) => state.setSelectionAnchor);
  const selectCommit = useGraphStore((state) => state.selectCommit);
  const selectedCommitIndex = useGraphStore((state) => state.selectedCommitIndex);
  const searchState = useGraphStore((state) => state.searchState);
  const hoveredCommitHash = useGraphStore((state) => state.hoveredCommitHash);
  const userSettings = useGraphStore((state) => state.userSettings);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const { onNodeMouseEnter, onNodeMouseLeave, onTooltipMouseEnter, onTooltipMouseLeave, dismissImmediate } = useTooltipHover();

  const hoveredCommit = useMemo(
    () => hoveredCommitHash ? commits.find((c) => c.hash === hoveredCommitHash) : undefined,
    [hoveredCommitHash, commits]
  );

  // Stable callback refs to avoid breaking CommitRow memoization
  const stableOnNodeMouseEnter = useCallback(
    (hash: string, rect: DOMRect) => onNodeMouseEnter(hash, rect),
    [onNodeMouseEnter]
  );
  const stableOnNodeMouseLeave = useCallback(() => onNodeMouseLeave(), [onNodeMouseLeave]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = (width: number) => {
      setContainerWidth(width);
      setMaxVisibleRefs(computeMaxVisibleRefs(width));
    };

    updateWidth(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width ?? element.clientWidth ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setMaxVisibleRefs, commits.length]);

  // Dismiss tooltip on scroll
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handleScroll = () => dismissImmediate();
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [dismissImmediate]);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: userSettings.overScan,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const rangeEnd = virtualizer.range?.endIndex;

  useEffect(() => {
    if (!hasMore || prefetching) return;
    if (rangeEnd === undefined) return;

    const hasVisibilityFilter = hiddenCommitHashes.size > 0;
    if (hasVisibilityFilter) {
      // With visibility filters: trigger based on visible row proximity to end
      const threshold = userSettings.overScan;
      if (rangeEnd >= commits.length - threshold) {
        // If gap indicator is showing, don't auto-prefetch — wait for scroll-past
        if (!showGapIndicator) {
          rpcClient.firePrefetch();
        }
      }
    } else {
      // Without visibility filters: use existing batch-boundary trigger
      if (rangeEnd >= lastBatchStartIndex) {
        rpcClient.firePrefetch();
      }
    }
  }, [rangeEnd, lastBatchStartIndex, prefetching, hasMore, hiddenCommitHashes.size, commits.length, userSettings.overScan, showGapIndicator]);

  // Trigger prefetch when client-side filter hides ALL cached commits (virtualizer has 0 items)
  useEffect(() => {
    if (commits.length > 0) return;           // scroll trigger handles this case
    if (!hasMore || prefetching) return;
    if (hiddenCommitHashes.size === 0) return; // no filter active; genuinely 0 commits loaded
    if (showGapIndicator) return;              // gap cap reached; "Load more" button handles this
    rpcClient.firePrefetch();
  }, [commits.length, hasMore, prefetching, hiddenCommitHashes.size, showGapIndicator]);

  // Scroll-past-gap-indicator: when user scrolls to the very bottom with gap showing, reset and fetch
  useEffect(() => {
    if (!showGapIndicator || !hasMore || prefetching) return;
    if (rangeEnd === undefined) return;
    if (rangeEnd < commits.length - 1) return;

    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
      if (atBottom) {
        // Reset gap state and trigger next batch
        useGraphStore.setState({
          consecutiveEmptyBatches: 0,
          showGapIndicator: false,
        });
        rpcClient.firePrefetch();
        el.removeEventListener('scroll', handleScroll);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    // Check immediately only if content overflows (user can actually scroll)
    if (el.scrollHeight > el.clientHeight) {
      handleScroll();
    }
    return () => el.removeEventListener('scroll', handleScroll);
  }, [showGapIndicator, hasMore, prefetching, rangeEnd, commits.length]);

  useEffect(() => {
    if (selectedCommitIndex >= 0) {
      virtualizer.scrollToIndex(selectedCommitIndex, { align: 'auto' });
    }
  }, [selectedCommitIndex, virtualizer]);

  useEffect(() => {
    const currentMatch = searchState.matchIndices[searchState.currentMatchIndex];
    if (currentMatch !== undefined) {
      virtualizer.scrollToIndex(currentMatch, { align: 'auto' });
    }
  }, [searchState.currentMatchIndex, searchState.matchIndices, virtualizer]);

  const visibleMatchIndices = useMemo(() => {
    const visibleSet = new Set<number>();
    const viewportIndices = new Set(virtualItems.map((item) => item.index));
    for (const matchIndex of searchState.matchIndices) {
      if (viewportIndices.has(matchIndex)) {
        visibleSet.add(matchIndex);
      }
    }

    const currentMatchIndex = searchState.matchIndices[searchState.currentMatchIndex];
    if (currentMatchIndex !== undefined) {
      visibleSet.add(currentMatchIndex);
    }

    return visibleSet;
  }, [searchState.currentMatchIndex, searchState.matchIndices, virtualItems]);

  const handleCommitClick = (hash: string, index: number, event: React.MouseEvent) => {
    if (event.shiftKey) {
      selectCommitRange(hash);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleSelectedCommit(hash);
      return;
    }

    clearSelectedCommits();
    setSelectionAnchor(hash);
    selectCommit(index);
    onSelectCommit(hash);
  };

  const graphWidth = Math.max(LANE_WIDTH * (topology.maxLanes + 1), 40);
  const resolvedTableLayout = useMemo(
    () =>
      resolveCommitTableLayout({
        layout: commitTableLayout,
        containerWidth,
      }),
    [commitTableLayout, containerWidth]
  );
  const tableMode = commitListMode === 'table';

  const filters = useGraphStore((state) => state.filters);
  const loading = useGraphStore((state) => state.loading);

  const hasActiveFilter = !!(filters.branches?.length || filters.authors?.length || filters.afterDate || filters.beforeDate || filters.textFilter);
  const isEmpty = commits.length === 0;

  const handleLoadMore = useCallback(() => {
    useGraphStore.setState({
      consecutiveEmptyBatches: 0,
      showGapIndicator: false,
    });
    rpcClient.firePrefetch();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CherryPickConflictBanner />
      <RebaseConflictBanner />
      <TogglePanel />
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--vscode-descriptionForeground)]">
          {loading || prefetching
            ? 'Loading…'
            : showGapIndicator && hasMore
              ? <>
                  <span>{filteredOutCount} commit{filteredOutCount !== 1 ? 's' : ''} filtered out of {allCommitsCount} loaded</span>
                  <button
                    className="px-3 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                    onClick={handleLoadMore}
                  >
                    Load more commits
                  </button>
                </>
              : hasActiveFilter
                ? 'No commits match the current filters'
                : 'No commits found'}
        </div>
      ) : (
        <>
          {tableMode && (
            <div className="overflow-hidden bg-[var(--vscode-editor-background)]">
              <CommitTableHeader layout={resolvedTableLayout} />
            </div>
          )}
          <div
            ref={containerRef}
            className={`flex-1 bg-[var(--vscode-list-background)] ${tableMode ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'}`}
          >
            <div
              className={`relative ${tableMode ? '' : 'w-full'}`}
              style={{
                height: totalSize,
                width: tableMode ? resolvedTableLayout.tableWidth : undefined,
                minWidth: tableMode ? resolvedTableLayout.minimumTableWidth : undefined,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const commit = commits[virtualItem.index];
                const currentMatch = searchState.matchIndices[searchState.currentMatchIndex];
                const isSelected = selectedCommit === commit.hash;
                const isMultiSelected = selectedCommitsSet.has(commit.hash);
                const isCurrentSearchMatch = currentMatch === virtualItem.index;
                const isSearchMatch = visibleMatchIndices.has(virtualItem.index);
                const rowStyle = {
                  position: 'absolute' as const,
                  top: 0,
                  left: 0,
                  width: tableMode ? resolvedTableLayout.tableWidth : '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualItem.start}px)`,
                };

                if (tableMode) {
                  return (
                    <CommitTableRow
                      key={commit.hash}
                      commit={commit}
                      commits={commits}
                      index={virtualItem.index}
                      topology={topology}
                      rowHeight={ROW_HEIGHT}
                      layout={resolvedTableLayout}
                      maxVisibleRefs={maxVisibleRefs}
                      userSettings={userSettings}
                      isSelected={isSelected}
                      isMultiSelected={isMultiSelected}
                      isSearchMatch={isSearchMatch}
                      isCurrentSearchMatch={isCurrentSearchMatch}
                      onClick={(event) => handleCommitClick(commit.hash, virtualItem.index, event)}
                      onNodeMouseEnter={stableOnNodeMouseEnter}
                      onNodeMouseLeave={stableOnNodeMouseLeave}
                      style={rowStyle}
                    />
                  );
                }

                return (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    commits={commits}
                    index={virtualItem.index}
                    topology={topology}
                    graphWidth={graphWidth}
                    rowHeight={ROW_HEIGHT}
                    maxVisibleRefs={maxVisibleRefs}
                    userSettings={userSettings}
                    isSelected={isSelected}
                    isMultiSelected={isMultiSelected}
                    isSearchMatch={isSearchMatch}
                    isCurrentSearchMatch={isCurrentSearchMatch}
                    onClick={(event) => handleCommitClick(commit.hash, virtualItem.index, event)}
                    onNodeMouseEnter={stableOnNodeMouseEnter}
                    onNodeMouseLeave={stableOnNodeMouseLeave}
                    style={rowStyle}
                  />
                );
              })}
            </div>
          </div>
          <CommitTooltip
            commit={hoveredCommit}
            onMouseEnter={onTooltipMouseEnter}
            onMouseLeave={onTooltipMouseLeave}
          />
          {showGapIndicator && hasMore && (
            <div className="flex items-center justify-center gap-3 py-3 px-4 text-xs text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
              <span>
                {filteredOutCount} commit{filteredOutCount !== 1 ? 's' : ''} filtered out of {allCommitsCount} loaded
              </span>
              <button
                className="px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                onClick={handleLoadMore}
              >
                Load more commits
              </button>
            </div>
          )}
          {prefetching && (
            <div className="flex items-center justify-center py-2 text-xs text-[var(--vscode-descriptionForeground)]">
              Loading…
            </div>
          )}
        </>
      )}
    </div>
  );
}

