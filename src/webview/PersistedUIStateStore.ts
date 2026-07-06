import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type {
  CommitTableColumnId,
  CommitTableLayout,
  PersistedUIState,
} from '../../shared/types.js';
import {
  COMMIT_TABLE_COLUMN_IDS,
  COMMIT_TABLE_MIN_WIDTHS,
  DEFAULT_PERSISTED_UI_STATE,
  cloneCommitTableLayout,
} from '../../shared/types.js';

const UI_STATE_KEY = 'speedyGit.uiState';
const MIN_PANEL_SIZE = 120;
export const HEALING_ASSUMED_CONTAINER_WIDTH = 4000;

const SUM_OF_ALL_MIN_WIDTHS = Object.values(COMMIT_TABLE_MIN_WIDTHS).reduce(
  (sum, width) => sum + width,
  0,
);

export function computeHealingMaxWidth(columnId: CommitTableColumnId): number {
  const minWidth = COMMIT_TABLE_MIN_WIDTHS[columnId];
  const otherMinWidths = SUM_OF_ALL_MIN_WIDTHS - minWidth;
  return Math.max(minWidth, HEALING_ASSUMED_CONTAINER_WIDTH - otherMinWidths);
}

export function healPersistedColumnWidth(
  columnId: CommitTableColumnId,
  rawWidth: number,
): number {
  const minWidth = COMMIT_TABLE_MIN_WIDTHS[columnId];
  const maxWidth = computeHealingMaxWidth(columnId);
  return Math.min(maxWidth, Math.max(minWidth, Math.round(rawWidth)));
}

export function repoLayoutKey(repoPath: string): string {
  const hash = crypto.createHash('sha256').update(repoPath).digest('hex').slice(0, 16);
  return `speedyGit.repoTableLayout.${hash}`;
}

export function clonePersistedUIStateDefaults(): PersistedUIState {
  return {
    ...DEFAULT_PERSISTED_UI_STATE,
    commitTableLayout: cloneCommitTableLayout(DEFAULT_PERSISTED_UI_STATE.commitTableLayout),
  };
}

function isCommitTableColumnId(value: unknown): value is CommitTableColumnId {
  return typeof value === 'string' && COMMIT_TABLE_COLUMN_IDS.includes(value as CommitTableColumnId);
}

export function validateCommitTableLayout(
  value: unknown,
  fallback: CommitTableLayout,
): CommitTableLayout {
  const defaults = DEFAULT_PERSISTED_UI_STATE.commitTableLayout;
  const baseLayout = cloneCommitTableLayout(fallback);

  if (!value || typeof value !== 'object') {
    return baseLayout;
  }

  const raw = value as Record<string, unknown>;
  let nextOrder = [...baseLayout.order];
  if (raw.order !== undefined) {
    if (Array.isArray(raw.order)) {
      const uniqueIds = new Set<CommitTableColumnId>();
      const parsedOrder: CommitTableColumnId[] = [];

      for (const item of raw.order) {
        if (!isCommitTableColumnId(item) || uniqueIds.has(item)) {
          parsedOrder.length = 0;
          break;
        }
        uniqueIds.add(item);
        parsedOrder.push(item);
      }

      nextOrder = parsedOrder.length === COMMIT_TABLE_COLUMN_IDS.length
        ? parsedOrder
        : [...defaults.order];
    } else {
      nextOrder = [...defaults.order];
    }
  }

  const nextColumns = cloneCommitTableLayout(baseLayout).columns;
  const rawColumns = raw.columns;
  for (const columnId of COMMIT_TABLE_COLUMN_IDS) {
    const defaultColumn = defaults.columns[columnId];
    const baseColumn = baseLayout.columns[columnId];
    const rawColumn = rawColumns && typeof rawColumns === 'object'
      ? (rawColumns as Record<string, unknown>)[columnId]
      : undefined;

    if (!rawColumn || typeof rawColumn !== 'object') {
      nextColumns[columnId] = { ...baseColumn };
      continue;
    }

    const columnRecord = rawColumn as Record<string, unknown>;
    nextColumns[columnId] = {
      visible: columnId === 'graph'
        ? true
        : typeof columnRecord.visible === 'boolean'
          ? columnRecord.visible
          : columnRecord.visible !== undefined
            ? defaultColumn.visible
            : baseColumn.visible,
      preferredWidth:
        typeof columnRecord.preferredWidth === 'number'
        && isFinite(columnRecord.preferredWidth)
        && columnRecord.preferredWidth > 0
          ? healPersistedColumnWidth(columnId, columnRecord.preferredWidth)
          : columnRecord.preferredWidth !== undefined
            ? defaultColumn.preferredWidth
            : baseColumn.preferredWidth,
    };
  }

  nextColumns.graph.visible = true;

  return {
    order: nextOrder,
    columns: nextColumns,
  };
}

export class PersistedUIStateStore {
  private uiStateCache: PersistedUIState | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getCurrentRepoPath: () => string,
  ) {}

  invalidateCache(): void {
    this.uiStateCache = undefined;
  }

  loadPersistedUIState(): PersistedUIState {
    if (this.uiStateCache) return this.uiStateCache;

    const stored = this.context.globalState.get<unknown>(UI_STATE_KEY);
    const defaults = clonePersistedUIStateDefaults();

    if (!stored || typeof stored !== 'object' || stored === null) {
      this.uiStateCache = {
        ...defaults,
        commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
      };
      return this.uiStateCache;
    }

    const raw = stored as Record<string, unknown>;

    if (raw.version !== defaults.version) {
      this.uiStateCache = {
        ...defaults,
        commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
      };
      return this.uiStateCache;
    }

    this.uiStateCache = {
      version: defaults.version,
      detailsPanelPosition:
        raw.detailsPanelPosition === 'bottom' || raw.detailsPanelPosition === 'right'
          ? raw.detailsPanelPosition
          : defaults.detailsPanelPosition,
      fileViewMode:
        raw.fileViewMode === 'list' || raw.fileViewMode === 'tree'
          ? raw.fileViewMode
          : defaults.fileViewMode,
      bottomPanelHeight:
        typeof raw.bottomPanelHeight === 'number' && isFinite(raw.bottomPanelHeight) && raw.bottomPanelHeight >= MIN_PANEL_SIZE
          ? raw.bottomPanelHeight
          : defaults.bottomPanelHeight,
      rightPanelWidth:
        typeof raw.rightPanelWidth === 'number' && isFinite(raw.rightPanelWidth) && raw.rightPanelWidth >= MIN_PANEL_SIZE
          ? raw.rightPanelWidth
          : defaults.rightPanelWidth,
      commitTableLayout: cloneCommitTableLayout(this.loadRepoTableLayout()),
    };
    return this.uiStateCache;
  }

  loadRepoTableLayout(): CommitTableLayout {
    const defaults = clonePersistedUIStateDefaults();
    const key = repoLayoutKey(this.getCurrentRepoPath());
    const stored = this.context.globalState.get<unknown>(key);
    return validateCommitTableLayout(stored, defaults.commitTableLayout);
  }

  saveRepoTableLayout(layout: CommitTableLayout): void {
    const key = repoLayoutKey(this.getCurrentRepoPath());
    void this.context.globalState.update(key, cloneCommitTableLayout(layout));
  }

  savePersistedUIState(partial: Partial<Omit<PersistedUIState, 'version'>>): void {
    const current = this.loadPersistedUIState();
    const defaults = clonePersistedUIStateDefaults();

    if (partial.commitTableLayout !== undefined) {
      const validatedLayout = validateCommitTableLayout(
        partial.commitTableLayout,
        current.commitTableLayout,
      );
      this.saveRepoTableLayout(validatedLayout);
      if (this.uiStateCache) {
        this.uiStateCache.commitTableLayout = cloneCommitTableLayout(validatedLayout);
      }
    }

    const globalValidated: Partial<Omit<PersistedUIState, 'version' | 'commitTableLayout'>> = {
      ...(partial.detailsPanelPosition === 'bottom' || partial.detailsPanelPosition === 'right'
        ? { detailsPanelPosition: partial.detailsPanelPosition }
        : {}),
      ...(partial.fileViewMode === 'list' || partial.fileViewMode === 'tree'
        ? { fileViewMode: partial.fileViewMode }
        : {}),
      ...(typeof partial.bottomPanelHeight === 'number' && isFinite(partial.bottomPanelHeight)
        ? { bottomPanelHeight: Math.max(MIN_PANEL_SIZE, partial.bottomPanelHeight) }
        : partial.bottomPanelHeight !== undefined ? { bottomPanelHeight: defaults.bottomPanelHeight } : {}),
      ...(typeof partial.rightPanelWidth === 'number' && isFinite(partial.rightPanelWidth)
        ? { rightPanelWidth: Math.max(MIN_PANEL_SIZE, partial.rightPanelWidth) }
        : partial.rightPanelWidth !== undefined ? { rightPanelWidth: defaults.rightPanelWidth } : {}),
    };

    if (Object.keys(globalValidated).length > 0) {
      this.uiStateCache = {
        ...current,
        ...globalValidated,
        commitTableLayout: this.uiStateCache?.commitTableLayout
          ? cloneCommitTableLayout(this.uiStateCache.commitTableLayout)
          : cloneCommitTableLayout(current.commitTableLayout),
      };
      const { commitTableLayout: _excluded, ...globalState } = this.uiStateCache;
      void _excluded;
      void this.context.globalState.update(UI_STATE_KEY, globalState);
    }
  }
}
