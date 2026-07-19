import { describe, it, expect } from 'vitest';
import { decideHeadNavigation, type HeadLocationContext } from '../headNavigation';

function context(overrides: Partial<HeadLocationContext> = {}): HeadLocationContext {
  return {
    hash: 'abc123',
    index: 0,
    loadedCount: 500,
    mergedIndex: -1,
    isHiddenClientSide: false,
    hasMore: true,
    ...overrides,
  };
}

describe('decideHeadNavigation', () => {
  it('reports unresolved when HEAD has no hash (fresh repo / unborn branch)', () => {
    expect(decideHeadNavigation(context({ hash: null }))).toEqual({ kind: 'unresolved' });
  });

  it('scrolls to the displayed row when HEAD is already in the merged list', () => {
    expect(decideHeadNavigation(context({ mergedIndex: 42 }))).toEqual({
      kind: 'scrollTo',
      mergedIndex: 42,
    });
  });

  it('prefers the displayed row even when the backend index looks out of range', () => {
    // Stashes/uncommitted rows shift merged indices; the displayed list wins.
    expect(decideHeadNavigation(context({ mergedIndex: 3, index: 9999 }))).toEqual({
      kind: 'scrollTo',
      mergedIndex: 3,
    });
  });

  it('reports hiddenByFilter when HEAD is loaded but hidden client-side', () => {
    expect(
      decideHeadNavigation(context({ isHiddenClientSide: true, index: 10 })),
    ).toEqual({ kind: 'hiddenByFilter' });
  });

  it('reports notInView when HEAD is absent from the filtered log stream', () => {
    expect(decideHeadNavigation(context({ index: -1 }))).toEqual({ kind: 'notInView' });
  });

  it('requests a targeted load when HEAD is deeper than the loaded commits', () => {
    expect(
      decideHeadNavigation(context({ index: 12000, loadedCount: 500 })),
    ).toEqual({ kind: 'loadMore', targetIndex: 12000 });
  });

  it('requests a targeted load when HEAD is exactly at the loaded boundary', () => {
    expect(
      decideHeadNavigation(context({ index: 500, loadedCount: 500 })),
    ).toEqual({ kind: 'loadMore', targetIndex: 500 });
  });

  it('reports notInView when HEAD is beyond loaded commits but nothing more can load', () => {
    expect(
      decideHeadNavigation(context({ index: 12000, loadedCount: 500, hasMore: false })),
    ).toEqual({ kind: 'notInView' });
  });

  it('reports notInView when HEAD should be loaded but is missing (stale view)', () => {
    // index inside the loaded range, yet not displayed and not hidden —
    // history changed since the last load.
    expect(
      decideHeadNavigation(context({ index: 100, loadedCount: 500 })),
    ).toEqual({ kind: 'notInView' });
  });
});
