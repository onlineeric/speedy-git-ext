import {
  COMMIT_TABLE_COLUMN_IDS,
  COMMIT_TABLE_MIN_WIDTHS,
  DEFAULT_COMMIT_TABLE_COLUMN_ORDER,
  DEFAULT_COMMIT_TABLE_LAYOUT,
  cloneCommitTableLayout,
  type Commit,
  type CommitTableColumnId,
  type CommitTableLayout,
  type UserSettings,
} from '@shared/types';

export { COMMIT_TABLE_MIN_WIDTHS };
import type { GraphTopology } from './graphTopology';
import { getDateFormatter } from './formatDate';

export const COMMIT_TABLE_DEFAULT_ORDER = [...DEFAULT_COMMIT_TABLE_COLUMN_ORDER];

export const COMMIT_TABLE_DEFAULT_WIDTHS: Record<CommitTableColumnId, number> = {
  graph: DEFAULT_COMMIT_TABLE_LAYOUT.columns.graph.preferredWidth,
  hash: DEFAULT_COMMIT_TABLE_LAYOUT.columns.hash.preferredWidth,
  message: DEFAULT_COMMIT_TABLE_LAYOUT.columns.message.preferredWidth,
  author: DEFAULT_COMMIT_TABLE_LAYOUT.columns.author.preferredWidth,
  date: DEFAULT_COMMIT_TABLE_LAYOUT.columns.date.preferredWidth,
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

/**
 * Compute the maximum preferred width a column may grow to during a drag,
 * given the current resolved layout and the actual container width.
 *
 * The ceiling is defined so that every *other* visible column can still render
 * at its minimum width.  This is always at least the column's own minimum, so
 * it can never go negative.
 */
export function computeColumnMaxWidth(
  columns: ResolvedCommitTableColumn[],
  columnId: CommitTableColumnId,
  containerWidth: number,
): number {
  const otherColumnsMinWidth = columns
    .filter((c) => c.id !== columnId)
    .reduce((sum, c) => sum + c.minWidth, 0);
  return Math.max(COMMIT_TABLE_MIN_WIDTHS[columnId], containerWidth - otherColumnsMinWidth);
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

export function materializeCommitTableEffectiveWidths(
  layout: CommitTableLayout,
  columns: ResolvedCommitTableColumn[]
): CommitTableLayout {
  const nextLayout = cloneCommitTableLayout(layout);
  for (const column of columns) {
    nextLayout.columns[column.id].preferredWidth = Math.max(
      COMMIT_TABLE_MIN_WIDTHS[column.id],
      Math.round(column.effectiveWidth)
    );
  }
  return nextLayout;
}

export function resizeCommitTableColumnPair({
  layout,
  leftColumnId,
  rightColumnId,
  leftStartWidth,
  rightStartWidth,
  deltaX,
}: {
  layout: CommitTableLayout;
  leftColumnId: CommitTableColumnId;
  rightColumnId: CommitTableColumnId;
  leftStartWidth: number;
  rightStartWidth: number;
  deltaX: number;
}): CommitTableLayout {
  const maxLeftShrink = leftStartWidth - COMMIT_TABLE_MIN_WIDTHS[leftColumnId];
  const maxRightShrink = rightStartWidth - COMMIT_TABLE_MIN_WIDTHS[rightColumnId];
  const clampedDelta = Math.min(maxRightShrink, Math.max(-maxLeftShrink, deltaX));
  return setCommitTableColumnPreferredWidth(
    setCommitTableColumnPreferredWidth(
      layout,
      leftColumnId,
      leftStartWidth + clampedDelta
    ),
    rightColumnId,
    rightStartWidth - clampedDelta
  );
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

// The `message` column absorbs surplus width, so its own preferredWidth cannot
// be dragged. For any separator at or after `message` (except the last column's
// outer edge), the grab targets the next column instead and inverts the delta —
// keeping the visible boundary glued to the cursor.
export function resolveResizeTarget(
  columns: ResolvedCommitTableColumn[],
  index: number
): { target: ResolvedCommitTableColumn; isReverse: boolean } {
  const messageIndex = columns.findIndex((c) => c.id === 'message');
  if (messageIndex !== -1 && index >= messageIndex && index < columns.length - 1) {
    return { target: columns[index + 1], isReverse: true };
  }
  return { target: columns[index], isReverse: false };
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

  // Surplus space: expand the message column so the table spans the panel.
  if (containerWidth > 0) {
    const surplus = availableWidth - preferredTableWidth;
    if (surplus > 0) {
      const message = visibleColumns.find((column) => column.id === 'message');
      if (message) {
        message.effectiveWidth += surplus;
      }
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
// Safety pad for cross-OS font metric variance and `measureText` subpixel
// rounding. Mac (SF Pro / Helvetica) renders ~1-3px wider than Windows (Segoe UI)
// at the same point size; without this buffer auto-fit can truncate on Mac.
const MEASURE_SAFETY_PAD = 4;

let cachedCtx: CanvasRenderingContext2D | undefined;

function getCanvasContext(): CanvasRenderingContext2D | undefined {
  if (!cachedCtx) {
    cachedCtx = document.createElement('canvas').getContext('2d') ?? undefined;
  }
  return cachedCtx;
}

const FALLBACK_SANS_FAMILY = 'sans-serif';
const FALLBACK_MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

let cachedSansFamily: string | undefined;
let cachedMonoFamily: string | undefined;

function getSansFamily(): string {
  if (cachedSansFamily) return cachedSansFamily;
  if (typeof document === 'undefined') return FALLBACK_SANS_FAMILY;
  const family = getComputedStyle(document.body).fontFamily?.trim();
  cachedSansFamily = family && family.length > 0 ? family : FALLBACK_SANS_FAMILY;
  return cachedSansFamily;
}

function getMonoFamily(): string {
  if (cachedMonoFamily) return cachedMonoFamily;
  if (typeof document === 'undefined') return FALLBACK_MONO_FAMILY;
  const root = document.documentElement;
  const editorFamily = getComputedStyle(root).getPropertyValue('--vscode-editor-font-family')?.trim();
  cachedMonoFamily = editorFamily && editorFamily.length > 0 ? editorFamily : FALLBACK_MONO_FAMILY;
  return cachedMonoFamily;
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
      const textWidth = measureMaxTextWidth(texts, `12px ${getMonoFamily()}`);
      if (textWidth === undefined) return minWidth;
      return Math.max(minWidth, Math.round(textWidth + CELL_HORIZONTAL_PADDING + MEASURE_SAFETY_PAD));
    }
    case 'message': {
      const texts = commits.map((c) => c.subject);
      const textWidth = measureMaxTextWidth(texts, `14px ${getSansFamily()}`);
      if (textWidth === undefined) return minWidth;
      // Add some padding for inline ref badges and icons
      const refPadding = 60;
      return Math.max(minWidth, Math.round(textWidth + refPadding + CELL_HORIZONTAL_PADDING + MEASURE_SAFETY_PAD));
    }
    case 'author': {
      const texts = commits.map((c) => c.author);
      const textWidth = measureMaxTextWidth(texts, `12px ${getSansFamily()}`);
      if (textWidth === undefined) return minWidth;
      const avatarExtra = userSettings.avatarsEnabled ? AVATAR_WIDTH + AVATAR_GAP : 0;
      return Math.max(minWidth, Math.round(textWidth + avatarExtra + CELL_HORIZONTAL_PADDING + MEASURE_SAFETY_PAD));
    }
    case 'date': {
      const formatter = getDateFormatter(userSettings.dateFormat, userSettings.dateFormatCustom);
      const texts = commits.map((c) => formatter(c.authorDate));
      const textWidth = measureMaxTextWidth(texts, `12px ${getSansFamily()}`);
      if (textWidth === undefined) return minWidth;
      return Math.max(minWidth, Math.round(textWidth + CELL_HORIZONTAL_PADDING + MEASURE_SAFETY_PAD));
    }
    default:
      return minWidth;
  }
}
