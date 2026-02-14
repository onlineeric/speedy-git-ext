import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGraphStore } from '../stores/graphStore';
import { CommitRow } from './CommitRow';

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

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
        No commits found
      </div>
    );
  }

  const graphWidth = Math.max(LANE_WIDTH * (topology.maxLanes + 1), 40);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto"
    >
      <div
        className="relative w-full"
        style={{ height: totalSize }}
      >
        {virtualItems.map((virtualItem) => {
          const commit = commits[virtualItem.index];
          const isSelected = selectedCommit === commit.hash;

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
              onClick={() => onSelectCommit(commit.hash)}
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
  );
}
