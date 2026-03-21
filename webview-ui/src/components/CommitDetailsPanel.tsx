import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { CommitDetails, FileChange, DetailsPanelPosition, CommitSignatureInfo } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { formatRelativeDate } from '../utils/formatDate';
import { ListViewIcon, TreeViewIcon } from './icons';
import { FileChangesTreeView } from './FileChangesTreeView';
import { FileStatusBadge, FileChangeIndicators, FileActionIcons } from './FileChangeShared';

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
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizing.current = true;

      const startPos = detailsPanelPosition === 'bottom' ? event.clientY : event.clientX;
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
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  const isBottom = position === 'bottom';
  return (
    <div
      className={`flex-shrink-0 ${
        isBottom
          ? 'h-1 cursor-row-resize hover:bg-[var(--vscode-focusBorder)]'
          : 'absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize hover:bg-[var(--vscode-focusBorder)]'
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
    <div className="flex items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-1.5 flex-shrink-0">
      <span className="font-mono text-xs text-[var(--vscode-textLink-foreground)]">
        {details.abbreviatedHash}
      </span>
      <span className="flex-1 truncate text-sm" title={details.subject}>
        {details.subject}
      </span>
      <button
        onClick={onTogglePosition}
        className="rounded px-1.5 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
        title={`Move panel to ${position === 'bottom' ? 'right' : 'bottom'}`}
      >
        {position === 'bottom' ? '\u2b95' : '\u2b07'}
      </button>
      <button
        onClick={onClose}
        className="rounded px-1.5 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
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
      <CommitSignatureSection hash={details.hash} />
      <FileChangesList details={details} />
    </div>
  );
}

function CommitMetadata({ details }: { details: CommitDetails }) {
  return (
    <div className="space-y-1 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs">
      <MetadataRow label="Hash" value={details.hash} mono copyable />
      {details.parents.length > 0 && (
        <MetadataRow
          label={details.parents.length > 1 ? 'Parents' : 'Parent'}
          value={details.parents.map((parent) => parent.slice(0, 7)).join(', ')}
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
          <span className="whitespace-pre-wrap text-[var(--vscode-descriptionForeground)]">
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

function CommitSignatureSection({ hash }: { hash: string }) {
  const signature = useGraphStore((state) => state.signatureCache[hash]);
  const loading = useGraphStore((state) => !!state.signatureLoading[hash]);

  useEffect(() => {
    const store = useGraphStore.getState();
    if (hash in store.signatureCache || store.signatureLoading[hash]) {
      return;
    }
    rpcClient.getSignatureInfo(hash);
  }, [hash]);

  if (loading) {
    return (
      <div className="border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)]">
        Loading signature verification...
      </div>
    );
  }

  if (!signature) {
    return null;
  }

  const statusConfig = getSignatureStatusConfig(signature);

  return (
    <div className="space-y-1 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={statusConfig.className}>{statusConfig.label}</span>
        <span className="uppercase text-[var(--vscode-descriptionForeground)]">
          {signature.format}
        </span>
      </div>
      {signature.verificationUnavailable ? (
        <div className="text-[var(--vscode-descriptionForeground)]">Verification unavailable</div>
      ) : (
        <>
          {signature.signer && <MetadataRow label="Signer" value={signature.signer} />}
          {signature.keyId && <MetadataRow label="Key ID" value={signature.keyId} mono />}
        </>
      )}
    </div>
  );
}

function getSignatureStatusConfig(signature: CommitSignatureInfo): { label: string; className: string } {
  if (signature.verificationUnavailable) {
    return {
      label: 'Verification Unavailable',
      className: 'font-medium text-[var(--vscode-editorWarning-foreground)]',
    };
  }

  switch (signature.status) {
    case 'good':
      return { label: 'Verified', className: 'font-medium text-green-400' };
    case 'bad':
      return { label: 'Invalid Signature', className: 'font-medium text-red-400' };
    default:
      return { label: 'Unverified', className: 'font-medium text-yellow-400' };
  }
}

function FileChangesList({ details }: { details: CommitDetails }) {
  const fileViewMode = useGraphStore((state) => state.fileViewMode);
  const setFileViewMode = useGraphStore((state) => state.setFileViewMode);

  const handleFileClick = (file: FileChange) => {
    if (file.status === 'deleted') {
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
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
          {details.files.length} file{details.files.length !== 1 ? 's' : ''} changed
        </span>
        <span className="flex items-center gap-0.5">
          <button
            className={`rounded p-0.5 ${fileViewMode === 'list' ? 'text-yellow-400' : 'text-[var(--vscode-descriptionForeground)]'} hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
            onClick={() => setFileViewMode('list')}
            title="List view"
          >
            <ListViewIcon size={16} />
          </button>
          <button
            className={`rounded p-0.5 ${fileViewMode === 'tree' ? 'text-yellow-400' : 'text-[var(--vscode-descriptionForeground)]'} hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
            onClick={() => setFileViewMode('tree')}
            title="Tree view"
          >
            <TreeViewIcon size={16} />
          </button>
        </span>
      </div>
      {fileViewMode === 'list' ? (
        <div className="space-y-0.5">
          {details.files.map((file) => (
            <FileChangeRow
              key={file.path}
              file={file}
              onFileNameClick={() => handleFileClick(file)}
              commitHash={details.hash}
              parentHash={details.parents[0]}
            />
          ))}
        </div>
      ) : (
        <FileChangesTreeView
          files={details.files}
          commitHash={details.hash}
          parentHash={details.parents[0]}
          onFileNameClick={handleFileClick}
        />
      )}
    </div>
  );
}

function FileChangeRow({
  file,
  onFileNameClick,
  commitHash,
  parentHash,
}: {
  file: FileChange;
  onFileNameClick: () => void;
  commitHash: string;
  parentHash?: string;
}) {
  const fileTitle = file.oldPath
    ? `${file.path} ← ${file.oldPath}`
    : file.path;

  return (
    <div
      className="group flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
      title={fileTitle}
    >
      <FileStatusBadge status={file.status} />
      <span
        className="cursor-pointer truncate font-mono hover:text-[var(--vscode-textLink-foreground)] hover:underline"
        onClick={onFileNameClick}
      >
        {file.path}
        {file.oldPath && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            {' ← '}{file.oldPath}
          </span>
        )}
      </span>
      <FileChangeIndicators file={file} />
      <FileActionIcons
        file={file}
        commitHash={commitHash}
        parentHash={parentHash}
      />
    </div>
  );
}
