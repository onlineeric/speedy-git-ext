import { useCallback, useEffect, useState } from 'react';
import type { CommitTableColumnId } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  computeAutoFitWidth,
  setCommitTableColumnPreferredWidth,
  type ResolvedCommitTableLayout,
} from '../utils/commitTableLayout';

interface CommitTableHeaderProps {
  layout: ResolvedCommitTableLayout;
}

interface ResizeSession {
  columnId: CommitTableColumnId;
  startX: number;
  startWidth: number;
  isReverse?: boolean;
}

const COLUMN_LABELS: Record<CommitTableColumnId, string> = {
  graph: 'Graph',
  hash: 'Hash',
  message: 'Message',
  author: 'Author',
  date: 'Date',
};

export function CommitTableHeader({ layout }: CommitTableHeaderProps) {
  const [resizeSession, setResizeSession] = useState<ResizeSession | null>(null);
  const updateCommitTableLayout = useGraphStore((state) => state.updateCommitTableLayout);

  const handleDoubleClick = useCallback((columnId: CommitTableColumnId) => {
    const { commits, topology, userSettings, commitTableLayout } = useGraphStore.getState();
    const autoWidth = computeAutoFitWidth(columnId, commits, topology, userSettings);
    const nextLayout = setCommitTableColumnPreferredWidth(commitTableLayout, columnId, autoWidth);
    updateCommitTableLayout(() => nextLayout);
    rpcClient.persistUIState({ commitTableLayout: nextLayout });
  }, [updateCommitTableLayout]);

  useEffect(() => {
    if (!resizeSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = event.clientX - resizeSession.startX;
      const effectiveDeltaX = resizeSession.isReverse ? -deltaX : deltaX;

      const nextWidth = Math.max(
        COMMIT_TABLE_MIN_WIDTHS[resizeSession.columnId],
        resizeSession.startWidth + effectiveDeltaX
      );
      updateCommitTableLayout((currentLayout) =>
        setCommitTableColumnPreferredWidth(currentLayout, resizeSession.columnId, nextWidth)
      );
    };

    const handlePointerUp = () => {
      const nextLayout = useGraphStore.getState().commitTableLayout;
      rpcClient.persistUIState({ commitTableLayout: nextLayout });
      setResizeSession(null);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
  }, [resizeSession, updateCommitTableLayout]);

  return (
    <div
      className="grid border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]"
      style={{
        gridTemplateColumns: layout.gridTemplateColumns,
        width: layout.tableWidth,
      }}
    >
      {layout.columns.map((column, index) => (
        <div
          key={column.id}
          className={`relative flex h-8 items-center px-2 ${index < layout.columns.length - 1 ? 'border-r border-[var(--vscode-panel-border)]' : ''}`}
        >
          <span className="truncate">{COLUMN_LABELS[column.id]}</span>
          <button
            type="button"
            className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none"
            aria-label={`Resize ${COLUMN_LABELS[column.id]} column`}
            title={`Resize ${COLUMN_LABELS[column.id]} column`}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const messageIndex = layout.columns.findIndex((c) => c.id === 'message');
              if (messageIndex !== -1 && index >= messageIndex && index < layout.columns.length - 1) {
                handleDoubleClick(layout.columns[index + 1].id);
              } else {
                handleDoubleClick(column.id);
              }
            }}
            onPointerDown={(event) => {
              const messageIndex = layout.columns.findIndex((c) => c.id === 'message');
              let target = layout.columns.find((item) => item.id === column.id);
              let isReverse = false;

              // Since 'message' uses all remaining space, dragging any separator after it
              // should resize the *next* column in reverse.
              if (messageIndex !== -1 && index >= messageIndex && index < layout.columns.length - 1) {
                target = layout.columns[index + 1];
                isReverse = true;
              }

              if (!target) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              setResizeSession({
                columnId: target.id,
                startX: event.clientX,
                startWidth: target.effectiveWidth,
                isReverse,
              });
            }}
          />
        </div>
      ))}
    </div>
  );
}
