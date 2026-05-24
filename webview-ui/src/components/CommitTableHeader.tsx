import { useCallback, useEffect, useState } from 'react';
import type { CommitTableColumnId } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  computeAutoFitWidth,
  computeColumnMaxWidth,
  resolveResizeTarget,
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
  /** Width ceiling: containerWidth minus every other visible column's minimum width. */
  maxWidth: number;
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

      const nextWidth = Math.min(
        resizeSession.maxWidth,
        Math.max(
          COMMIT_TABLE_MIN_WIDTHS[resizeSession.columnId],
          resizeSession.startWidth + effectiveDeltaX
        )
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
      {layout.columns.map((column, index) => {
        const { target: resizeTarget, isReverse } = resolveResizeTarget(layout.columns, index);
        const resizeLabel = `Resize ${COLUMN_LABELS[resizeTarget.id]} column`;
        return (
          <div
            key={column.id}
            className={`relative flex h-8 items-center px-2 ${index < layout.columns.length - 1 ? 'border-r border-[var(--vscode-panel-border)]' : ''}`}
          >
            <span className="truncate">{COLUMN_LABELS[column.id]}</span>
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none"
              aria-label={resizeLabel}
              title={resizeLabel}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDoubleClick(resizeTarget.id);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setResizeSession({
                  columnId: resizeTarget.id,
                  startX: event.clientX,
                  startWidth: resizeTarget.effectiveWidth,
                  maxWidth: computeColumnMaxWidth(layout.columns, resizeTarget.id, layout.tableWidth),
                  isReverse,
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
