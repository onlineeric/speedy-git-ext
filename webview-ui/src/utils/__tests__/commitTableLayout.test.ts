import { describe, it, expect } from 'vitest';
import {
  COMMIT_TABLE_DEFAULT_ORDER,
  COMMIT_TABLE_DEFAULT_WIDTHS,
  COMMIT_TABLE_MIN_WIDTHS,
  COMMIT_TABLE_OPTIONAL_COLUMN_IDS,
  getOptionalCommitTableColumnIds,
  getOrderedCommitTableColumnIds,
  getVisibleCommitTableColumnIds,
  reorderCommitTableColumns,
  resolveCommitTableLayout,
  setCommitTableColumnPreferredWidth,
  setCommitTableColumnVisibility,
} from '../commitTableLayout';
import { createDefaultCommitTableLayout, type CommitTableLayout } from '@shared/types';

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
    expect(next.order).toEqual(['graph', 'date', 'author', 'hash', 'message']);
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
  it('returns columns at preferred width when container is wide enough', () => {
    const layout = createDefaultCommitTableLayout();
    const totalPref = Object.values(layout.columns).reduce((s, c) => s + c.preferredWidth, 0);

    const resolved = resolveCommitTableLayout({ layout, containerWidth: totalPref + 200 });
    for (const col of resolved.columns) {
      expect(col.effectiveWidth).toBe(col.preferredWidth);
    }
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
    const totalPref = Object.values(layout.columns).reduce((s, c) => s + c.preferredWidth, 0);
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
