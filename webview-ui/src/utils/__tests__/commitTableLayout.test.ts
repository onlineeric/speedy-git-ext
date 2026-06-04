import { describe, it, expect } from 'vitest';
import {
  COMMIT_TABLE_DEFAULT_ORDER,
  COMMIT_TABLE_DEFAULT_WIDTHS,
  COMMIT_TABLE_MIN_WIDTHS,
  COMMIT_TABLE_OPTIONAL_COLUMN_IDS,
  computeColumnMaxWidth,
  getOptionalCommitTableColumnIds,
  getOrderedCommitTableColumnIds,
  getVisibleCommitTableColumnIds,
  materializeCommitTableEffectiveWidths,
  reorderCommitTableColumns,
  resizeCommitTableColumnPair,
  resolveCommitTableLayout,
  resolveResizeTarget,
  setCommitTableColumnPreferredWidth,
  setCommitTableColumnVisibility,
  type ResolvedCommitTableColumn,
} from '../commitTableLayout';
import {
  createDefaultCommitTableLayout,
  type CommitTableColumnId,
  type CommitTableLayout,
} from '@shared/types';

describe('constants', () => {
  it('exposes default order starting with graph', () => {
    expect(COMMIT_TABLE_DEFAULT_ORDER[0]).toBe('graph');
  });

  it('lists optional column IDs without graph', () => {
    expect(COMMIT_TABLE_OPTIONAL_COLUMN_IDS).not.toContain('graph');
  });

  it('default widths have positive numbers for all columns', () => {
    for (const col of Object.keys(COMMIT_TABLE_DEFAULT_WIDTHS)) {
      expect(COMMIT_TABLE_DEFAULT_WIDTHS[col as keyof typeof COMMIT_TABLE_DEFAULT_WIDTHS]).toBeGreaterThan(0);
    }
  });

  it('min widths are <= default widths for every column', () => {
    for (const col of Object.keys(COMMIT_TABLE_MIN_WIDTHS) as (keyof typeof COMMIT_TABLE_MIN_WIDTHS)[]) {
      expect(COMMIT_TABLE_MIN_WIDTHS[col]).toBeLessThanOrEqual(COMMIT_TABLE_DEFAULT_WIDTHS[col]);
    }
  });
});

describe('getOrderedCommitTableColumnIds', () => {
  it('returns default order from default layout', () => {
    const layout = createDefaultCommitTableLayout();
    expect(getOrderedCommitTableColumnIds(layout)).toEqual(COMMIT_TABLE_DEFAULT_ORDER);
  });

  it('always starts with graph even if order omits or misplaces it', () => {
    const layout: CommitTableLayout = {
      ...createDefaultCommitTableLayout(),
      order: ['author', 'date', 'message', 'hash'],
    };
    const ordered = getOrderedCommitTableColumnIds(layout);
    expect(ordered[0]).toBe('graph');
  });

  it('drops duplicate IDs in the input order', () => {
    const layout: CommitTableLayout = {
      ...createDefaultCommitTableLayout(),
      order: ['hash', 'hash', 'message', 'author', 'date'],
    };
    const ordered = getOrderedCommitTableColumnIds(layout);
    const seen = new Set<string>();
    for (const id of ordered) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('appends missing optional columns at the end', () => {
    const layout: CommitTableLayout = {
      ...createDefaultCommitTableLayout(),
      order: ['message'],
    };
    const ordered = getOrderedCommitTableColumnIds(layout);
    expect(ordered).toContain('hash');
    expect(ordered).toContain('author');
    expect(ordered).toContain('date');
  });
});

describe('getOptionalCommitTableColumnIds', () => {
  it('excludes graph from result', () => {
    const layout = createDefaultCommitTableLayout();
    expect(getOptionalCommitTableColumnIds(layout)).not.toContain('graph');
  });
});

describe('getVisibleCommitTableColumnIds', () => {
  it('always includes graph regardless of visibility flag', () => {
    const layout = createDefaultCommitTableLayout();
    expect(getVisibleCommitTableColumnIds(layout)).toContain('graph');
  });

  it('omits hidden optional columns', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.author.visible = false;
    layout.columns.date.visible = false;
    expect(getVisibleCommitTableColumnIds(layout)).toEqual(['graph', 'hash', 'message']);
  });
});

describe('setCommitTableColumnPreferredWidth', () => {
  it('returns a new layout with updated width', () => {
    const layout = createDefaultCommitTableLayout();
    const next = setCommitTableColumnPreferredWidth(layout, 'message', 600);
    expect(next).not.toBe(layout);
    expect(next.columns.message.preferredWidth).toBe(600);
    // original is not mutated
    expect(layout.columns.message.preferredWidth).toBe(COMMIT_TABLE_DEFAULT_WIDTHS.message);
  });

  it('clamps to min width if requested width is below minimum', () => {
    const layout = createDefaultCommitTableLayout();
    const next = setCommitTableColumnPreferredWidth(layout, 'message', 10);
    expect(next.columns.message.preferredWidth).toBe(COMMIT_TABLE_MIN_WIDTHS.message);
  });

  it('rounds fractional widths', () => {
    const layout = createDefaultCommitTableLayout();
    const next = setCommitTableColumnPreferredWidth(layout, 'author', 250.7);
    expect(next.columns.author.preferredWidth).toBe(251);
  });
});

describe('setCommitTableColumnVisibility', () => {
  it('hides an optional column', () => {
    const layout = createDefaultCommitTableLayout();
    const next = setCommitTableColumnVisibility(layout, 'author', false);
    expect(next.columns.author.visible).toBe(false);
  });

  it('cannot hide the graph column', () => {
    const layout = createDefaultCommitTableLayout();
    const next = setCommitTableColumnVisibility(layout, 'graph', false);
    expect(next.columns.graph.visible).toBe(true);
  });
});

describe('reorderCommitTableColumns', () => {
  it('places new optional ordering after graph', () => {
    const layout = createDefaultCommitTableLayout();
    const next = reorderCommitTableColumns(layout, ['date', 'author', 'hash', 'message']);
    // `signature` is an optional column not named in the input, so it is appended last.
    expect(next.order).toEqual(['graph', 'date', 'author', 'hash', 'message', 'signature']);
  });

  it('ignores graph if passed in optional list', () => {
    const layout = createDefaultCommitTableLayout();
    const next = reorderCommitTableColumns(layout, ['graph', 'message', 'hash', 'author', 'date']);
    expect(next.order[0]).toBe('graph');
    expect(next.order.filter((c) => c === 'graph')).toHaveLength(1);
  });

  it('appends optional columns missing from input list at the end', () => {
    const layout = createDefaultCommitTableLayout();
    const next = reorderCommitTableColumns(layout, ['date']);
    expect(next.order).toContain('message');
    expect(next.order).toContain('author');
    expect(next.order).toContain('hash');
    expect(next.order[1]).toBe('date'); // user-supplied order wins for date
  });
});

describe('resolveCommitTableLayout', () => {
  it('expands the message column to fill surplus container width', () => {
    const layout = createDefaultCommitTableLayout();
    // Only visible columns contribute to table width (signature is hidden by default).
    const totalPref = Object.values(layout.columns)
      .filter((c) => c.visible)
      .reduce((s, c) => s + c.preferredWidth, 0);

    const resolved = resolveCommitTableLayout({ layout, containerWidth: totalPref + 200 });
    const message = resolved.columns.find((c) => c.id === 'message')!;
    expect(message.effectiveWidth).toBe(message.preferredWidth + 200);
    for (const col of resolved.columns) {
      if (col.id === 'message') continue;
      expect(col.effectiveWidth).toBe(col.preferredWidth);
    }
    expect(resolved.tableWidth).toBe(totalPref + 200);
  });

  it('shrinks message column first when space is tight', () => {
    const layout = createDefaultCommitTableLayout();
    const totalPref = Object.values(layout.columns).reduce((s, c) => s + c.preferredWidth, 0);

    const resolved = resolveCommitTableLayout({ layout, containerWidth: totalPref - 100 });
    const message = resolved.columns.find((c) => c.id === 'message')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;
    expect(message.effectiveWidth).toBeLessThan(message.preferredWidth);
    expect(date.effectiveWidth).toBe(date.preferredWidth);
  });

  it('shrinks message down to min and then borrows from author/date/hash', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({
      layout,
      containerWidth: 100, // far below any reasonable layout, force max shrinking
    });
    const message = resolved.columns.find((c) => c.id === 'message')!;
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;
    const hash = resolved.columns.find((c) => c.id === 'hash')!;

    expect(message.effectiveWidth).toBe(message.minWidth);
    expect(author.effectiveWidth).toBe(author.minWidth);
    expect(date.effectiveWidth).toBe(date.minWidth);
    expect(hash.effectiveWidth).toBe(hash.minWidth);
  });

  it('builds gridTemplateColumns string from effective widths', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 9999 });
    const expected = resolved.columns.map((c) => `${c.effectiveWidth}px`).join(' ');
    expect(resolved.gridTemplateColumns).toBe(expected);
  });

  it('uses preferred total width when containerWidth is 0', () => {
    const layout = createDefaultCommitTableLayout();
    // Only visible columns contribute to table width (signature is hidden by default).
    const totalPref = Object.values(layout.columns)
      .filter((c) => c.visible)
      .reduce((s, c) => s + c.preferredWidth, 0);
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 0 });
    expect(resolved.tableWidth).toBe(totalPref);
  });

  it('respects per-column minimum widths in the result', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 10 });
    for (const col of resolved.columns) {
      expect(col.effectiveWidth).toBeGreaterThanOrEqual(col.minWidth);
    }
  });
});

describe('resolveResizeTarget', () => {
  const makeColumns = (ids: CommitTableColumnId[]): ResolvedCommitTableColumn[] =>
    ids.map((id) => ({
      id,
      visible: true,
      preferredWidth: 100,
      effectiveWidth: 100,
      minWidth: COMMIT_TABLE_MIN_WIDTHS[id],
    }));

  describe('default order: graph, hash, message, author, date', () => {
    const columns = makeColumns(['graph', 'hash', 'message', 'author', 'date']);

    it('separators before message target their own column with isReverse=false', () => {
      expect(resolveResizeTarget(columns, 0)).toEqual({ target: columns[0], isReverse: false });
      expect(resolveResizeTarget(columns, 1)).toEqual({ target: columns[1], isReverse: false });
    });

    it('separator on message targets the next column (author) in reverse', () => {
      const result = resolveResizeTarget(columns, 2);
      expect(result.target.id).toBe('author');
      expect(result.isReverse).toBe(true);
    });

    it('separator on a column between message and last targets the next column in reverse', () => {
      const result = resolveResizeTarget(columns, 3);
      expect(result.target.id).toBe('date');
      expect(result.isReverse).toBe(true);
    });

    it('separator on the last column targets itself with isReverse=false', () => {
      const result = resolveResizeTarget(columns, 4);
      expect(result.target.id).toBe('date');
      expect(result.isReverse).toBe(false);
    });
  });

  describe('message hidden: graph, hash, author, date', () => {
    const columns = makeColumns(['graph', 'hash', 'author', 'date']);

    it('every separator targets its own column with isReverse=false (no carve-out)', () => {
      for (let i = 0; i < columns.length; i++) {
        const result = resolveResizeTarget(columns, i);
        expect(result.target).toBe(columns[i]);
        expect(result.isReverse).toBe(false);
      }
    });
  });

  describe('message last: graph, hash, author, date, message', () => {
    const columns = makeColumns(['graph', 'hash', 'author', 'date', 'message']);

    it('separator on message (last position) targets itself with isReverse=false', () => {
      const result = resolveResizeTarget(columns, 4);
      expect(result.target.id).toBe('message');
      expect(result.isReverse).toBe(false);
    });

    it('separators before message-last target their own column with isReverse=false', () => {
      for (let i = 0; i < 4; i++) {
        const result = resolveResizeTarget(columns, i);
        expect(result.target).toBe(columns[i]);
        expect(result.isReverse).toBe(false);
      }
    });
  });

  describe('message reordered earlier: graph, message, hash, author, date', () => {
    const columns = makeColumns(['graph', 'message', 'hash', 'author', 'date']);

    it('separator before message targets its own column with isReverse=false', () => {
      const result = resolveResizeTarget(columns, 0);
      expect(result.target.id).toBe('graph');
      expect(result.isReverse).toBe(false);
    });

    it('separator on message targets the next column (hash) in reverse', () => {
      const result = resolveResizeTarget(columns, 1);
      expect(result.target.id).toBe('hash');
      expect(result.isReverse).toBe(true);
    });

    it('separators after message (except last) cascade in reverse to the next column', () => {
      expect(resolveResizeTarget(columns, 2).target.id).toBe('author');
      expect(resolveResizeTarget(columns, 2).isReverse).toBe(true);
      expect(resolveResizeTarget(columns, 3).target.id).toBe('date');
      expect(resolveResizeTarget(columns, 3).isReverse).toBe(true);
    });

    it('separator on the last column targets itself with isReverse=false', () => {
      const result = resolveResizeTarget(columns, 4);
      expect(result.target.id).toBe('date');
      expect(result.isReverse).toBe(false);
    });
  });
});

describe('resizeCommitTableColumnPair', () => {
  it('resizes adjacent columns from a fixed baseline without accumulating previous pointer moves', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    const baseLayout = materializeCommitTableEffectiveWidths(layout, resolved.columns);
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;

    const after20 = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: 20,
    });
    const after25 = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: 25,
    });

    expect(after20.columns.author.preferredWidth).toBe(author.effectiveWidth + 20);
    expect(after20.columns.date.preferredWidth).toBe(date.effectiveWidth - 20);
    expect(after25.columns.author.preferredWidth).toBe(author.effectiveWidth + 25);
    expect(after25.columns.date.preferredWidth).toBe(date.effectiveWidth - 25);
  });

  it('keeps message from absorbing the author/date separator movement', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 1200 });
    const baseLayout = materializeCommitTableEffectiveWidths(layout, resolved.columns);
    const message = resolved.columns.find((c) => c.id === 'message')!;
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;
    expect(message.effectiveWidth).toBeGreaterThan(message.preferredWidth);

    const next = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: 15,
    });
    const nextResolved = resolveCommitTableLayout({ layout: next, containerWidth: resolved.tableWidth });

    expect(nextResolved.columns.find((c) => c.id === 'message')!.effectiveWidth).toBe(message.effectiveWidth);
    expect(nextResolved.columns.find((c) => c.id === 'author')!.effectiveWidth).toBe(author.effectiveWidth + 15);
    expect(nextResolved.columns.find((c) => c.id === 'date')!.effectiveWidth).toBe(date.effectiveWidth - 15);
  });

  it('can grow author by dragging the date separator right when date is oversized', () => {
    const layout = setCommitTableColumnPreferredWidth(
      createDefaultCommitTableLayout(),
      'date',
      500
    );
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 600 });
    const baseLayout = materializeCommitTableEffectiveWidths(layout, resolved.columns);
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;
    expect(author.effectiveWidth).toBe(author.minWidth);

    const next = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: 20,
    });
    const nextResolved = resolveCommitTableLayout({ layout: next, containerWidth: resolved.tableWidth });

    expect(nextResolved.columns.find((c) => c.id === 'author')!.effectiveWidth).toBe(author.effectiveWidth + 20);
    expect(nextResolved.columns.find((c) => c.id === 'date')!.effectiveWidth).toBe(date.effectiveWidth - 20);
  });

  it('clamps paired resizing at adjacent column minimum widths', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    const baseLayout = materializeCommitTableEffectiveWidths(layout, resolved.columns);
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;

    const next = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: 999,
    });

    expect(next.columns.date.preferredWidth).toBe(date.minWidth);
    expect(next.columns.author.preferredWidth).toBe(author.effectiveWidth + date.effectiveWidth - date.minWidth);
  });

  it('clamps paired resizing leftward at the left column minimum width', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    const baseLayout = materializeCommitTableEffectiveWidths(layout, resolved.columns);
    const author = resolved.columns.find((c) => c.id === 'author')!;
    const date = resolved.columns.find((c) => c.id === 'date')!;

    const next = resizeCommitTableColumnPair({
      layout: baseLayout,
      leftColumnId: 'author',
      rightColumnId: 'date',
      leftStartWidth: author.effectiveWidth,
      rightStartWidth: date.effectiveWidth,
      deltaX: -9999,
    });

    expect(next.columns.author.preferredWidth).toBe(author.minWidth);
    expect(next.columns.date.preferredWidth).toBe(date.effectiveWidth + (author.effectiveWidth - author.minWidth));
  });
});

describe('computeColumnMaxWidth', () => {
  function makeColumns(): ResolvedCommitTableColumn[] {
    return (['graph', 'hash', 'message', 'author', 'date'] as const).map((id) => ({
      id,
      visible: true,
      preferredWidth: 100,
      effectiveWidth: 100,
      minWidth: COMMIT_TABLE_MIN_WIDTHS[id],
    }));
  }

  it('returns containerWidth minus the sum of every other column minWidth', () => {
    const columns = makeColumns();
    const otherMinWidths =
      COMMIT_TABLE_MIN_WIDTHS.graph
      + COMMIT_TABLE_MIN_WIDTHS.hash
      + COMMIT_TABLE_MIN_WIDTHS.message
      + COMMIT_TABLE_MIN_WIDTHS.date;
    expect(computeColumnMaxWidth(columns, 'author', 1200)).toBe(1200 - otherMinWidths);
  });

  it('falls back to the column min width when container is too small', () => {
    const columns = makeColumns();
    expect(computeColumnMaxWidth(columns, 'author', 50)).toBe(COMMIT_TABLE_MIN_WIDTHS.author);
  });

  it('is consistent with resizing: a column may grow up to the returned max without breaking neighbours', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 1100 });
    const max = computeColumnMaxWidth(resolved.columns, 'author', 1100);
    const next = setCommitTableColumnPreferredWidth(layout, 'author', max);
    const nextResolved = resolveCommitTableLayout({ layout: next, containerWidth: 1100 });

    // After growing author to the ceiling, every other visible column still
    // renders at least at its minimum width.
    for (const col of nextResolved.columns) {
      expect(col.effectiveWidth).toBeGreaterThanOrEqual(col.minWidth);
    }
  });
});

describe('materializeCommitTableEffectiveWidths', () => {
  it('overwrites each preferredWidth with the column\'s current effectiveWidth', () => {
    const layout = createDefaultCommitTableLayout();
    // Container > sum(preferred) so message gets surplus → effective > preferred.
    const totalPref = Object.values(layout.columns).reduce((s, c) => s + c.preferredWidth, 0);
    const resolved = resolveCommitTableLayout({ layout, containerWidth: totalPref + 300 });

    const next = materializeCommitTableEffectiveWidths(layout, resolved.columns);

    const messageResolved = resolved.columns.find((c) => c.id === 'message')!;
    expect(next.columns.message.preferredWidth).toBe(Math.round(messageResolved.effectiveWidth));
  });

  it('returns a new layout without mutating the input', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    const originalMessageWidth = layout.columns.message.preferredWidth;

    const next = materializeCommitTableEffectiveWidths(layout, resolved.columns);

    expect(next).not.toBe(layout);
    expect(layout.columns.message.preferredWidth).toBe(originalMessageWidth);
  });

  it('rounds fractional effectiveWidths', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    // Fabricate a fractional effective width to lock the rounding contract.
    const author = resolved.columns.find((c) => c.id === 'author')!;
    author.effectiveWidth = 123.6;

    const next = materializeCommitTableEffectiveWidths(layout, resolved.columns);

    expect(next.columns.author.preferredWidth).toBe(124);
  });

  it('clamps preferredWidth at COMMIT_TABLE_MIN_WIDTHS when effectiveWidth is below it', () => {
    const layout = createDefaultCommitTableLayout();
    const resolved = resolveCommitTableLayout({ layout, containerWidth: 900 });
    const date = resolved.columns.find((c) => c.id === 'date')!;
    date.effectiveWidth = 10; // pathological: below the minimum

    const next = materializeCommitTableEffectiveWidths(layout, resolved.columns);

    expect(next.columns.date.preferredWidth).toBe(COMMIT_TABLE_MIN_WIDTHS.date);
  });
});
