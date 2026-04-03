import {
  COMMIT_TABLE_COLUMN_IDS,
  DEFAULT_COMMIT_TABLE_COLUMN_ORDER,
  DEFAULT_COMMIT_TABLE_LAYOUT,
  cloneCommitTableLayout,
  type Commit,
  type CommitTableColumnId,
  type CommitTableLayout,
  type UserSettings,
} from '@shared/types';
import type { GraphTopology } from './graphTopology';
import { formatAbsoluteDateTime, formatRelativeDate } from './formatDate';

export const COMMIT_TABLE_DEFAULT_ORDER = [...DEFAULT_COMMIT_TABLE_COLUMN_ORDER];

export const COMMIT_TABLE_DEFAULT_WIDTHS: Record<CommitTableColumnId, number> = {
  graph: DEFAULT_COMMIT_TABLE_LAYOUT.columns.graph.preferredWidth,
  hash: DEFAULT_COMMIT_TABLE_LAYOUT.columns.hash.preferredWidth,
  message: DEFAULT_COMMIT_TABLE_LAYOUT.columns.message.preferredWidth,
  author: DEFAULT_COMMIT_TABLE_LAYOUT.columns.author.preferredWidth,
  date: DEFAULT_COMMIT_TABLE_LAYOUT.columns.date.preferredWidth,
};

export const COMMIT_TABLE_MIN_WIDTHS: Record<CommitTableColumnId, number> = {
  graph: 52,
  hash: 72,
  message: 160,
  author: 120,
  date: 120,
};

export const COMMIT_TABLE_OPTIONAL_COLUMN_IDS = COMMIT_TABLE_COLUMN_IDS.filter(
  (columnId) => columnId !== 'graph'
);

const OPTIONAL_SHRINK_PRIORITY: CommitTableColumnId[] = [
  'author',
  'date',
  'hash',
];

export interface ResolvedCommitTableColumn {
  id: CommitTableColumnId;
  visible: boolean;
  preferredWidth: number;
  effectiveWidth: number;
  minWidth: number;
}

export interface ResolvedCommitTableLayout {
  columns: ResolvedCommitTableColumn[];
  gridTemplateColumns: string;
  tableWidth: number;
  minimumTableWidth: number;
}

function sanitizeOrder(order: CommitTableLayout['order']): CommitTableColumnId[] {
  const seen = new Set<CommitTableColumnId>();
  const sanitized: CommitTableColumnId[] = ['graph'];
  seen.add('graph');

  for (const columnId of order) {
    if (!COMMIT_TABLE_COLUMN_IDS.includes(columnId) || seen.has(columnId)) {
      continue;
    }
    sanitized.push(columnId);
    seen.add(columnId);
  }

  for (const columnId of COMMIT_TABLE_OPTIONAL_COLUMN_IDS) {
    if (!seen.has(columnId)) {
      sanitized.push(columnId);
    }
  }

  return sanitized;
}

export function getOrderedCommitTableColumnIds(layout: CommitTableLayout): CommitTableColumnId[] {
  return sanitizeOrder(layout.order);
}

export function getOptionalCommitTableColumnIds(layout: CommitTableLayout): CommitTableColumnId[] {
  return getOrderedCommitTableColumnIds(layout).filter((columnId) => columnId !== 'graph');
}

export function getVisibleCommitTableColumnIds(layout: CommitTableLayout): CommitTableColumnId[] {
  return getOrderedCommitTableColumnIds(layout).filter(
    (columnId) => columnId === 'graph' || layout.columns[columnId].visible
  );
}

export function setCommitTableColumnPreferredWidth(
  layout: CommitTableLayout,
  columnId: CommitTableColumnId,
  preferredWidth: number
): CommitTableLayout {
  const nextLayout = cloneCommitTableLayout(layout);
  nextLayout.columns[columnId].preferredWidth = Math.max(
    COMMIT_TABLE_MIN_WIDTHS[columnId],
    Math.round(preferredWidth)
  );
  return nextLayout;
}

export function setCommitTableColumnVisibility(
  layout: CommitTableLayout,
  columnId: CommitTableColumnId,
  visible: boolean
): CommitTableLayout {
  if (columnId === 'graph') {
    return cloneCommitTableLayout(layout);
  }

  const nextLayout = cloneCommitTableLayout(layout);
  nextLayout.columns[columnId].visible = visible;
  return nextLayout;
}

export function reorderCommitTableColumns(
  layout: CommitTableLayout,
  orderedOptionalColumns: CommitTableColumnId[]
): CommitTableLayout {
  const nextLayout = cloneCommitTableLayout(layout);
  const nextOrder: CommitTableColumnId[] = ['graph'];
  const seen = new Set<CommitTableColumnId>(['graph']);

  for (const columnId of orderedOptionalColumns) {
    if (columnId === 'graph' || seen.has(columnId) || !COMMIT_TABLE_OPTIONAL_COLUMN_IDS.includes(columnId)) {
      continue;
    }
    nextOrder.push(columnId);
    seen.add(columnId);
  }

  for (const columnId of getOptionalCommitTableColumnIds(layout)) {
    if (!seen.has(columnId)) {
      nextOrder.push(columnId);
      seen.add(columnId);
    }
  }

  nextLayout.order = nextOrder;
  return nextLayout;
}

function shrinkColumn(
  columns: ResolvedCommitTableColumn[],
  columnId: CommitTableColumnId,
  remainingDeficit: number
): number {
  const column = columns.find((item) => item.id === columnId);
  if (!column) {
    return remainingDeficit;
  }

  const availableShrink = column.effectiveWidth - column.minWidth;
  if (availableShrink <= 0) {
    return remainingDeficit;
  }

  const shrinkAmount = Math.min(availableShrink, remainingDeficit);
  column.effectiveWidth -= shrinkAmount;
  return remainingDeficit - shrinkAmount;
}

export function resolveCommitTableLayout({
  layout,
  containerWidth,
}: {
  layout: CommitTableLayout;
  containerWidth: number;
}): ResolvedCommitTableLayout {
  const visibleColumns: ResolvedCommitTableColumn[] = getVisibleCommitTableColumnIds(layout).map((columnId) => {
    const column = layout.columns[columnId];
    const minWidth = COMMIT_TABLE_MIN_WIDTHS[columnId];
    const preferredWidth = Math.max(column.preferredWidth, minWidth);

    return {
      id: columnId,
      visible: true,
      preferredWidth,
      effectiveWidth: preferredWidth,
      minWidth,
    };
  });

  const preferredTableWidth = visibleColumns.reduce(
    (total, column) => total + column.preferredWidth,
    0
  );
  const availableWidth = containerWidth > 0 ? containerWidth : preferredTableWidth;
  let remainingDeficit = Math.max(0, preferredTableWidth - availableWidth);

  remainingDeficit = shrinkColumn(visibleColumns, 'message', remainingDeficit);
  for (const columnId of OPTIONAL_SHRINK_PRIORITY) {
    remainingDeficit = shrinkColumn(visibleColumns, columnId, remainingDeficit);
    if (remainingDeficit <= 0) {
      break;
    }
  }

  const tableWidth = visibleColumns.reduce(
    (total, column) => total + column.effectiveWidth,
    0
  );
  const minimumTableWidth = visibleColumns.reduce(
    (total, column) => total + column.minWidth,
    0
  );

  return {
    columns: visibleColumns,
    gridTemplateColumns: visibleColumns.map((column) => `${column.effectiveWidth}px`).join(' '),
    tableWidth,
    minimumTableWidth,
  };
}

// ── Auto-fit column width via canvas.measureText() ──────────────────

const LANE_WIDTH = 16;
const CELL_HORIZONTAL_PADDING = 16; // px-2 on each side = 8 + 8
const AVATAR_WIDTH = 24; // h-6 w-6
const AVATAR_GAP = 8; // gap-2

let cachedCtx: CanvasRenderingContext2D | undefined;

function getCanvasContext(): CanvasRenderingContext2D | undefined {
  if (!cachedCtx) {
    cachedCtx = document.createElement('canvas').getContext('2d') ?? undefined;
  }
  return cachedCtx;
}

function measureMaxTextWidth(texts: string[], font: string): number | undefined {
  const ctx = getCanvasContext();
  if (!ctx) return undefined;
  ctx.font = font;
  let max = 0;
  for (const text of texts) {
    const width = ctx.measureText(text).width;
    if (width > max) {
      max = width;
    }
  }
  return max;
}

/**
 * Compute the ideal auto-fit width for a column based on data content.
 * Uses canvas.measureText() so it works regardless of virtual scroll state.
 */
export function computeAutoFitWidth(
  columnId: CommitTableColumnId,
  commits: Commit[],
  topology: GraphTopology,
  userSettings: UserSettings,
): number {
  const minWidth = COMMIT_TABLE_MIN_WIDTHS[columnId];

  if (commits.length === 0) {
    return minWidth;
  }

  switch (columnId) {
    case 'graph': {
      const width = LANE_WIDTH * (topology.maxLanes + 1) + CELL_HORIZONTAL_PADDING;
      return Math.max(minWidth, Math.round(width));
    }
    case 'hash': {
      const texts = commits.map((c) => c.abbreviatedHash);
      const textWidth = measureMaxTextWidth(texts, '12px monospace');
      if (textWidth === undefined) return minWidth;
      return Math.max(minWidth, Math.round(textWidth + CELL_HORIZONTAL_PADDING));
    }
    case 'message': {
      const texts = commits.map((c) => c.subject);
      const textWidth = measureMaxTextWidth(texts, '14px sans-serif');
      if (textWidth === undefined) return minWidth;
      // Add some padding for inline ref badges and icons
      const refPadding = 60;
      return Math.max(minWidth, Math.round(textWidth + refPadding + CELL_HORIZONTAL_PADDING));
    }
    case 'author': {
      const texts = commits.map((c) => c.author);
      const textWidth = measureMaxTextWidth(texts, '12px sans-serif');
      if (textWidth === undefined) return minWidth;
      const avatarExtra = userSettings.avatarsEnabled ? AVATAR_WIDTH + AVATAR_GAP : 0;
      return Math.max(minWidth, Math.round(textWidth + avatarExtra + CELL_HORIZONTAL_PADDING));
    }
    case 'date': {
      const texts = commits.map((c) =>
        userSettings.dateFormat === 'absolute'
          ? formatAbsoluteDateTime(c.authorDate)
          : formatRelativeDate(c.authorDate)
      );
      const textWidth = measureMaxTextWidth(texts, '12px sans-serif');
      if (textWidth === undefined) return minWidth;
      return Math.max(minWidth, Math.round(textWidth + CELL_HORIZONTAL_PADDING));
    }
    default:
      return minWidth;
  }
}
