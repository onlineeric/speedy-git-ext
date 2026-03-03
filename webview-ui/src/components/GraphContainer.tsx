import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGraphStore } from '../stores/graphStore';
import { CommitRow } from './CommitRow';
import { CherryPickConflictBanner } from './CherryPickConflictBanner';

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
  const { mergedCommits: commits, topology, maxVisibleRefs, setMaxVisibleRefs } = useGraphStore();
  const selectedCommits = useGraphStore((s) => s.selectedCommits);
  const selectedCommitsSet = useMemo(() => new Set(selectedCommits), [selectedCommits]);
  const toggleSelectedCommit = useGraphStore((s) => s.toggleSelectedCommit);
  const selectCommitRange = useGraphStore((s) => s.selectCommitRange);
  const clearSelectedCommits = useGraphStore((s) => s.clearSelectedCommits);
  const setSelectionAnchor = useGraphStore((s) => s.setSelectionAnchor);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setMaxVisibleRefs(computeMaxVisibleRefs(width));
    });
    observer.observe(el);
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

  const handleCommitClick = (hash: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      selectCommitRange(hash);
    } else if (e.ctrlKey || e.metaKey) {
      toggleSelectedCommit(hash);
    } else {
      clearSelectedCommits();
      setSelectionAnchor(hash);
      onSelectCommit(hash);
    }
  };

  if (commits.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <CherryPickConflictBanner />
        <div className="flex items-center justify-center flex-1 text-[var(--vscode-descriptionForeground)]">
          No commits found
        </div>
      </div>
    );
  }

  const graphWidth = Math.max(LANE_WIDTH * (topology.maxLanes + 1), 40);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <CherryPickConflictBanner />
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
      >
        <div
          className="relative w-full"
          style={{ height: totalSize }}
        >
          {virtualItems.map((virtualItem) => {
            const commit = commits[virtualItem.index];
            const isSelected = selectedCommit === commit.hash;
            const isMultiSelected = selectedCommitsSet.has(commit.hash);

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
                onClick={(e) => handleCommitClick(commit.hash, e)}
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
    </div>
  );
}
