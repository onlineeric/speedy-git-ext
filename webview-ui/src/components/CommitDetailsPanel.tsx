import { memo, useState, useCallback, useRef } from 'react';
import type { CommitDetails, FileChange, DetailsPanelPosition } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { formatRelativeDate } from '../utils/formatDate';

const MIN_SIZE = 120;
const DEFAULT_BOTTOM_HEIGHT = 280;
const DEFAULT_RIGHT_WIDTH = 400;

export const CommitDetailsPanel = memo(function CommitDetailsPanel() {
  const {
    commitDetails,
    detailsPanelOpen,
    detailsPanelPosition,
    setDetailsPanelOpen,
    toggleDetailsPanelPosition,
  } = useGraphStore();

  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const resizing = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizing.current = true;

      const startPos = detailsPanelPosition === 'bottom' ? e.clientY : e.clientX;
      const startSize = detailsPanelPosition === 'bottom' ? bottomHeight : rightWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizing.current) return;
        const delta = startPos - (detailsPanelPosition === 'bottom' ? moveEvent.clientY : moveEvent.clientX);
        const newSize = Math.max(MIN_SIZE, startSize + delta);
        if (detailsPanelPosition === 'bottom') {
          setBottomHeight(newSize);
        } else {
          setRightWidth(newSize);
        }
      };

      const handleMouseUp = () => {
        resizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [detailsPanelPosition, bottomHeight, rightWidth]
  );

  if (!detailsPanelOpen || !commitDetails) {
    return null;
  }

  const isBottom = detailsPanelPosition === 'bottom';
  const panelStyle = isBottom
    ? { height: bottomHeight, minHeight: MIN_SIZE }
    : { width: rightWidth, minWidth: MIN_SIZE };

  return (
    <div
      className={`flex flex-col border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] ${
        isBottom ? 'border-t' : 'border-l'
      }`}
      style={panelStyle}
    >
      <ResizeHandle position={detailsPanelPosition} onMouseDown={handleResizeStart} />
      <PanelHeader
        details={commitDetails}
        position={detailsPanelPosition}
        onClose={() => setDetailsPanelOpen(false)}
        onTogglePosition={toggleDetailsPanelPosition}
      />
      <PanelBody details={commitDetails} />
    </div>
  );
});

function ResizeHandle({
  position,
  onMouseDown,
}: {
  position: DetailsPanelPosition;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const isBottom = position === 'bottom';
  return (
    <div
      className={`flex-shrink-0 ${
        isBottom
          ? 'h-1 cursor-row-resize hover:bg-[var(--vscode-focusBorder)]'
          : 'w-1 cursor-col-resize hover:bg-[var(--vscode-focusBorder)] absolute left-0 top-0 bottom-0 z-10'
      }`}
      onMouseDown={onMouseDown}
    />
  );
}

function PanelHeader({
  details,
  position,
  onClose,
  onTogglePosition,
}: {
  details: CommitDetails;
  position: DetailsPanelPosition;
  onClose: () => void;
  onTogglePosition: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--vscode-panel-border)] flex-shrink-0">
      <span className="font-mono text-xs text-[var(--vscode-textLink-foreground)]">
        {details.abbreviatedHash}
      </span>
      <span className="flex-1 text-sm truncate" title={details.subject}>
        {details.subject}
      </span>
      <button
        onClick={onTogglePosition}
        className="px-1.5 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
        title={`Move panel to ${position === 'bottom' ? 'right' : 'bottom'}`}
      >
        {position === 'bottom' ? '\u2b95' : '\u2b07'}
      </button>
      <button
        onClick={onClose}
        className="px-1.5 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
        title="Close panel"
      >
        \u2715
      </button>
    </div>
  );
}

function PanelBody({ details }: { details: CommitDetails }) {
  return (
    <div className="flex-1 overflow-auto">
      <CommitMetadata details={details} />
      <FileChangesList details={details} />
    </div>
  );
}

function CommitMetadata({ details }: { details: CommitDetails }) {
  return (
    <div className="px-3 py-2 text-xs space-y-1 border-b border-[var(--vscode-panel-border)]">
      <MetadataRow label="Hash" value={details.hash} mono copyable />
      {details.parents.length > 0 && (
        <MetadataRow
          label={details.parents.length > 1 ? 'Parents' : 'Parent'}
          value={details.parents.map((p) => p.slice(0, 7)).join(', ')}
          mono
        />
      )}
      <MetadataRow
        label="Author"
        value={`${details.author} <${details.authorEmail}>`}
      />
      <MetadataRow label="Date" value={formatRelativeDate(details.authorDate)} />
      {details.committer !== details.author && (
        <MetadataRow
          label="Committer"
          value={`${details.committer} <${details.committerEmail}>`}
        />
      )}
      {details.body && (
        <div className="pt-1">
          <span className="text-[var(--vscode-descriptionForeground)] whitespace-pre-wrap">
            {details.body}
          </span>
        </div>
      )}
    </div>
  );
}

function MetadataRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    if (copyable) {
      rpcClient.copyToClipboard(value);
    }
  };

  return (
    <div className="flex gap-2">
      <span className="w-16 flex-shrink-0 text-[var(--vscode-descriptionForeground)]">
        {label}:
      </span>
      <span
        className={`truncate ${mono ? 'font-mono' : ''} ${
          copyable ? 'cursor-pointer hover:text-[var(--vscode-textLink-foreground)]' : ''
        }`}
        title={copyable ? `Click to copy: ${value}` : value}
        onClick={handleCopy}
      >
        {value}
      </span>
    </div>
  );
}

function FileChangesList({ details }: { details: CommitDetails }) {
  const handleFileClick = (file: FileChange) => {
    if (file.status === 'deleted') {
      // For deleted files, show the file at parent revision
      const parentHash = details.parents[0];
      if (parentHash) {
        rpcClient.openFile(parentHash, file.path);
      }
    } else {
      rpcClient.openDiff(details.hash, file.path, details.parents[0]);
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          {details.files.length} file{details.files.length !== 1 ? 's' : ''} changed
        </span>
        {details.stats.additions > 0 && (
          <span className="text-xs text-green-400">+{details.stats.additions}</span>
        )}
        {details.stats.deletions > 0 && (
          <span className="text-xs text-red-400">-{details.stats.deletions}</span>
        )}
      </div>
      <div className="space-y-0.5">
        {details.files.map((file) => (
          <FileChangeRow
            key={file.path}
            file={file}
            onClick={() => handleFileClick(file)}
          />
        ))}
      </div>
    </div>
  );
}

function FileChangeRow({
  file,
  onClick,
}: {
  file: FileChange;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-1 py-0.5 text-xs rounded cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]"
      onClick={onClick}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      <FileStatusBadge status={file.status} />
      <span className="flex-1 truncate font-mono">
        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      </span>
      {file.additions !== undefined && file.additions > 0 && (
        <span className="text-green-400">+{file.additions}</span>
      )}
      {file.deletions !== undefined && file.deletions > 0 && (
        <span className="text-red-400">-{file.deletions}</span>
      )}
    </div>
  );
}

function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  const config = getStatusConfig(status);
  return (
    <span
      className={`w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded ${config.className}`}
      title={config.label}
    >
      {config.letter}
    </span>
  );
}

function getStatusConfig(status: FileChange['status']): {
  letter: string;
  label: string;
  className: string;
} {
  switch (status) {
    case 'added':
      return { letter: 'A', label: 'Added', className: 'text-green-400 bg-green-900/40' };
    case 'modified':
      return { letter: 'M', label: 'Modified', className: 'text-blue-400 bg-blue-900/40' };
    case 'deleted':
      return { letter: 'D', label: 'Deleted', className: 'text-red-400 bg-red-900/40' };
    case 'renamed':
      return { letter: 'R', label: 'Renamed', className: 'text-yellow-400 bg-yellow-900/40' };
    case 'copied':
      return { letter: 'C', label: 'Copied', className: 'text-purple-400 bg-purple-900/40' };
    case 'untracked':
      return { letter: 'U', label: 'Untracked', className: 'text-gray-400 bg-gray-900/40' };
    default:
      return { letter: '?', label: 'Unknown', className: 'text-gray-400 bg-gray-900/40' };
  }
}
