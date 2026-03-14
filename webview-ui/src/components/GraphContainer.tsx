import { useEffect, useMemo, useRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Submodule } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { CommitRow } from './CommitRow';
import { CherryPickConflictBanner } from './CherryPickConflictBanner';
import { RebaseConflictBanner } from './RebaseConflictBanner';
import { SearchWidget } from './SearchWidget';
import { SubmoduleBreadcrumb } from './SubmoduleBreadcrumb';

const ROW_HEIGHT = 28;
const OVERSCAN = 10;
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
  const { mergedCommits: commits, topology, maxVisibleRefs, setMaxVisibleRefs, submodules } = useGraphStore();
  const prefetching = useGraphStore((state) => state.prefetching);
  const hasMore = useGraphStore((state) => state.hasMore);
  const lastBatchStartIndex = useGraphStore((state) => state.lastBatchStartIndex);
  const selectedCommits = useGraphStore((state) => state.selectedCommits);
  const selectedCommitsSet = useMemo(() => new Set(selectedCommits), [selectedCommits]);
  const toggleSelectedCommit = useGraphStore((state) => state.toggleSelectedCommit);
  const selectCommitRange = useGraphStore((state) => state.selectCommitRange);
  const clearSelectedCommits = useGraphStore((state) => state.clearSelectedCommits);
  const setSelectionAnchor = useGraphStore((state) => state.setSelectionAnchor);
  const selectCommit = useGraphStore((state) => state.selectCommit);
  const selectedCommitIndex = useGraphStore((state) => state.selectedCommitIndex);
  const searchState = useGraphStore((state) => state.searchState);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setMaxVisibleRefs(computeMaxVisibleRefs(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setMaxVisibleRefs]);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const rangeEnd = virtualizer.range?.endIndex;

  useEffect(() => {
    if (!hasMore || prefetching) return;
    if (rangeEnd !== undefined && rangeEnd >= lastBatchStartIndex) {
      rpcClient.firePrefetch();
    }
  }, [rangeEnd, lastBatchStartIndex, prefetching, hasMore]);

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

  if (commits.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <CherryPickConflictBanner />
        <RebaseConflictBanner />
        <SubmoduleBreadcrumb />
        <div className="px-4 pt-3">
          <SearchWidget />
        </div>
        <SubmoduleSection submodules={submodules} />
        <div className="flex flex-1 items-center justify-center text-[var(--vscode-descriptionForeground)]">
          No commits found
        </div>
      </div>
    );
  }

  const graphWidth = Math.max(LANE_WIDTH * (topology.maxLanes + 1), 40);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CherryPickConflictBanner />
      <RebaseConflictBanner />
      <SubmoduleBreadcrumb />
      <div className="px-4 pt-3">
        <SearchWidget />
      </div>
      <SubmoduleSection submodules={submodules} />
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: totalSize }}>
          {virtualItems.map((virtualItem) => {
            const commit = commits[virtualItem.index];
            const currentMatch = searchState.matchIndices[searchState.currentMatchIndex];
            const isSelected = selectedCommit === commit.hash;
            const isMultiSelected = selectedCommitsSet.has(commit.hash);
            const isCurrentSearchMatch = currentMatch === virtualItem.index;
            const isSearchMatch = visibleMatchIndices.has(virtualItem.index);

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
                isSelected={isSelected}
                isMultiSelected={isMultiSelected}
                isSearchMatch={isSearchMatch}
                isCurrentSearchMatch={isCurrentSearchMatch}
                onClick={(event) => handleCommitClick(commit.hash, virtualItem.index, event)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
      {prefetching && (
        <div className="flex items-center justify-center py-2 text-xs text-[var(--vscode-descriptionForeground)]">
          Loading…
        </div>
      )}
    </div>
  );
}

function SubmoduleSection({ submodules }: { submodules: Submodule[] }) {
  if (submodules.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-[var(--vscode-panel-border)] px-4 py-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]">
        Submodules
      </div>

      <div className="space-y-1">
        {submodules.map((submodule) => (
          <SubmoduleRow key={submodule.path} submodule={submodule} />
        ))}
      </div>
    </div>
  );
}

function SubmoduleRow({ submodule }: { submodule: Submodule }) {
  const statusColor = getSubmoduleStatusColor(submodule.status);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          onClick={() => rpcClient.openSubmodule(submodule.path)}
          className="flex w-full items-center gap-3 rounded px-2 py-1 text-left text-sm hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{submodule.path}</span>
            <span className="block truncate text-xs text-[var(--vscode-descriptionForeground)]">
              {submodule.hash.slice(0, 7)}
              {submodule.describe ? ` · ${submodule.describe}` : ''}
            </span>
          </span>
          <span className="text-xs uppercase text-[var(--vscode-descriptionForeground)]">
            {submodule.status}
          </span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[190px] rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 shadow-lg">
          <ContextMenu.Item
            className="cursor-pointer px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={() => rpcClient.openSubmodule(submodule.path)}
          >
            Open Submodule
          </ContextMenu.Item>
          <ContextMenu.Item
            className="cursor-pointer px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={() => rpcClient.updateSubmodule(submodule.path)}
          >
            Update Submodule
          </ContextMenu.Item>
          <ContextMenu.Item
            className="cursor-pointer px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={() => rpcClient.initSubmodule(submodule.path)}
          >
            Initialize Submodule
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function getSubmoduleStatusColor(status: Submodule['status']): string {
  switch (status) {
    case 'clean':
      return 'var(--vscode-testing-iconPassed)';
    case 'dirty':
      return 'var(--vscode-testing-iconErrored)';
    case 'uninitialized':
      return 'var(--vscode-testing-iconQueued)';
  }
}
