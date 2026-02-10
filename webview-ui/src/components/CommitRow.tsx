import { memo } from 'react';
import type { Commit } from '@shared/types';
import type { GraphTopology } from '../utils/graphTopology';
import { GraphCell } from './GraphCell';
import { formatRelativeDate } from '../utils/formatDate';

interface CommitRowProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  graphWidth: number;
  rowHeight: number;
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
  isSelected,
  onClick,
  style,
}: CommitRowProps) {
  const bgClass = isSelected
    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
    : index % 2 === 0
    ? 'bg-transparent'
    : 'bg-[var(--vscode-list-hoverBackground)]/30';

  return (
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
          {commit.refs.slice(0, 3).map((ref) => (
            <span
              key={`${ref.type}-${ref.name}`}
              className={`px-1.5 py-0.5 text-xs rounded ${getRefStyle(ref.type)}`}
              title={ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
            >
              {ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
            </span>
          ))}
          {commit.refs.length > 3 && (
            <span className="px-1 text-xs text-[var(--vscode-descriptionForeground)]">
              +{commit.refs.length - 3}
            </span>
          )}
        </div>
      )}

      <span className="flex-1 truncate text-sm" title={commit.subject}>
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
});

function getRefStyle(type: string): string {
  switch (type) {
    case 'head':
      return 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]';
    case 'branch':
      return 'bg-green-700/60 text-green-100';
    case 'remote':
      return 'bg-blue-700/60 text-blue-100';
    case 'tag':
      return 'bg-yellow-700/60 text-yellow-100';
    default:
      return 'bg-gray-700/60 text-gray-100';
  }
}
