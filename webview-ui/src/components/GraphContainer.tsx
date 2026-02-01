import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGraphStore } from '../stores/graphStore';
import { CommitRow } from './CommitRow';

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

export function GraphContainer() {
  const { commits, selectedCommit, setSelectedCommit } = useGraphStore();
  const containerRef = useRef<HTMLDivElement>(null);

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
              index={virtualItem.index}
              isSelected={isSelected}
              onClick={() => setSelectedCommit(commit.hash)}
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
