import { memo } from 'react';
import type { Commit } from '@shared/types';
import type { GraphTopology } from '../utils/graphTopology';
import { GraphCell } from './GraphCell';
import { CommitContextMenu } from './CommitContextMenu';
import { BranchContextMenu } from './BranchContextMenu';
import { StashContextMenu } from './StashContextMenu';
import { OverflowRefsBadge } from './OverflowRefsBadge';
import { getRefStyle } from '../utils/refStyle';
import { formatRelativeDate } from '../utils/formatDate';

interface CommitRowProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  graphWidth: number;
  rowHeight: number;
  maxVisibleRefs?: number;
  isSelected: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}

export const CommitRow = memo(function CommitRow({
  commit,
  commits,
  index,
  topology,
  graphWidth,
  rowHeight,
  maxVisibleRefs = 3,
  isSelected,
  onClick,
  style,
}: CommitRowProps) {
  const isStash = commit.refs.some((r) => r.type === 'stash');
  const stashIndex = isStash ? parseStashIndex(commit.refs) : -1;

  const bgClass = isSelected
    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
    : index % 2 === 0
    ? 'bg-transparent'
    : 'bg-[var(--vscode-list-hoverBackground)]/30';

  const row = (
    <div
      className={`flex items-center gap-2 px-2 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] ${bgClass}`}
      style={style}
      onClick={onClick}
    >
      <GraphCell
        commit={commit}
        commits={commits}
        index={index}
        topology={topology}
        width={graphWidth}
        height={rowHeight}
      />

      <span
        className="w-16 flex-shrink-0 font-mono text-xs text-[var(--vscode-textLink-foreground)]"
        title={commit.hash}
      >
        {commit.abbreviatedHash}
      </span>

      {commit.refs.length > 0 && (
        <div className="flex gap-1 flex-shrink-0">
          {commit.refs.slice(0, maxVisibleRefs).map((ref) => (
            <BranchContextMenu key={`${ref.type}-${ref.name}`} refInfo={ref} commitHash={commit.hash}>
              <span
                className={`px-1.5 py-0.5 text-xs rounded ${getRefStyle(ref.type)}`}
                title={ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
              >
                {ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
              </span>
            </BranchContextMenu>
          ))}
          <OverflowRefsBadge
            hiddenRefs={commit.refs.slice(maxVisibleRefs)}
            commitHash={commit.hash}
          />
        </div>
      )}

      <span
        className={`flex-1 truncate text-sm ${isStash ? 'italic text-[var(--vscode-descriptionForeground)]' : ''}`}
        title={commit.subject}
      >
        {commit.subject}
      </span>

      <span className="w-28 flex-shrink-0 text-xs text-[var(--vscode-descriptionForeground)] truncate" title={commit.author}>
        {commit.author}
      </span>

      <span className="w-24 flex-shrink-0 text-xs text-[var(--vscode-descriptionForeground)] text-right">
        {formatRelativeDate(commit.authorDate)}
      </span>
    </div>
  );

  if (isStash) {
    return (
      <StashContextMenu commit={commit} stashIndex={stashIndex}>
        {row}
      </StashContextMenu>
    );
  }

  return (
    <CommitContextMenu commit={commit}>
      {row}
    </CommitContextMenu>
  );
});

function parseStashIndex(refs: Commit['refs']): number {
  for (const ref of refs) {
    if (ref.type === 'stash') {
      const match = ref.name.match(/\{(\d+)\}/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 0;
}
