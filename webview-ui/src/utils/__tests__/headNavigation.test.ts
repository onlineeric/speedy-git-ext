import { describe, it, expect } from 'vitest';
import {
  decideHeadContinuation,
  decideHeadNavigation,
  MAX_GO_TO_HEAD_LOADS,
  type HeadContinuationContext,
  type HeadLocationContext,
} from '../headNavigation';

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
    expect(decideHeadNavigation(context({ mergedIndex: 42 }))).toEqual({ kind: 'scrollTo' });
  });

  it('prefers the displayed row even when the backend index looks out of range', () => {
    // Stashes/uncommitted rows shift merged indices; the displayed list wins.
    expect(decideHeadNavigation(context({ mergedIndex: 3, index: 9999 }))).toEqual({ kind: 'scrollTo' });
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

  it('scrolls to the confirmed displayed row when the backend skipped the position walk', () => {
    expect(decideHeadNavigation(context({ index: null, mergedIndex: 7 }))).toEqual({ kind: 'scrollTo' });
  });

  it('reports notInView when the position walk was skipped but the row has since gone', () => {
    // Raced with a refresh that dropped the row the backend confirmed.
    expect(decideHeadNavigation(context({ index: null, mergedIndex: -1 }))).toEqual({ kind: 'notInView' });
  });
});

function continuation(overrides: Partial<HeadContinuationContext> = {}): HeadContinuationContext {
  return {
    isDisplayed: false,
    isHiddenClientSide: false,
    hasMore: true,
    attempts: 1,
    targetIndex: 1200,
    loadedCount: 1000,
    ...overrides,
  };
}

describe('decideHeadContinuation', () => {
  it('scrolls once the target row is displayed', () => {
    expect(decideHeadContinuation(continuation({ isDisplayed: true }))).toEqual({ kind: 'scrollTo' });
  });

  it('prefers the displayed row over a filter that also hides it', () => {
    expect(
      decideHeadContinuation(continuation({ isDisplayed: true, isHiddenClientSide: true })),
    ).toEqual({ kind: 'scrollTo' });
  });

  it('reports hiddenByFilter when the batch loaded the target but a filter hides it', () => {
    expect(
      decideHeadContinuation(continuation({ isHiddenClientSide: true })),
    ).toEqual({ kind: 'hiddenByFilter' });
  });

  it('reports unreachable when history runs out before the target is found', () => {
    expect(decideHeadContinuation(continuation({ hasMore: false }))).toEqual({ kind: 'unreachable' });
  });

  it('reports unreachable once the attempt cap is reached', () => {
    expect(
      decideHeadContinuation(continuation({ attempts: MAX_GO_TO_HEAD_LOADS })),
    ).toEqual({ kind: 'unreachable' });
  });

  it('keeps loading while attempts remain below the cap', () => {
    expect(
      decideHeadContinuation(continuation({ attempts: MAX_GO_TO_HEAD_LOADS - 1 })),
    ).toEqual({ kind: 'loadMore', targetIndex: 1200 });
  });

  it('requests the located target while it is still deeper than what is loaded', () => {
    expect(
      decideHeadContinuation(continuation({ targetIndex: 1200, loadedCount: 1000 })),
    ).toEqual({ kind: 'loadMore', targetIndex: 1200 });
  });

  it('never requests less than what is already loaded when history grew past the target', () => {
    expect(
      decideHeadContinuation(continuation({ targetIndex: 1200, loadedCount: 1500 })),
    ).toEqual({ kind: 'loadMore', targetIndex: 1500 });
  });
});
