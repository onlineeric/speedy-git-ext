import { describe, expect, it } from 'vitest';
import type { DisplayRef, DisplayRefType } from '../../types/displayRefs';
import { getRefBadgeContent } from '../refBadgeContent';
import { LEGEND_INLINE_ICON_PLACEHOLDER, REF_BADGE_LEGEND } from '../refBadgeLegend';

/**
 * Every ref kind the graph can draw. Listed explicitly rather than derived, so
 * that adding a `DisplayRef` variant makes this list fail to typecheck and the
 * author has to decide how the new badge is explained.
 */
const ALL_REF_TYPES: Record<DisplayRefType, true> = {
  'local-branch': true,
  'remote-branch': true,
  'merged-branch': true,
  tag: true,
  stash: true,
};

function sampledRefs(): DisplayRef[] {
  return REF_BADGE_LEGEND.flatMap((entry) => (entry.sample.kind === 'ref' ? [entry.sample.displayRef] : []));
}

describe('REF_BADGE_LEGEND', () => {
  it('explains every kind of ref badge the graph can draw', () => {
    const explained = new Set(sampledRefs().map((displayRef) => displayRef.type));
    expect([...explained].sort()).toEqual(Object.keys(ALL_REF_TYPES).sort());
  });

  it('shows each of the three branch states, so the combined one reads as a union', () => {
    const iconSets = sampledRefs().map((displayRef) => getRefBadgeContent(displayRef).leadIcons.join(''));
    expect(iconSets).toContain('branch');
    expect(iconSets).toContain('cloud');
    expect(iconSets).toContain('branchcloud');
  });

  it('introduces the branch states in the order local, remote, then both', () => {
    const branchIds = REF_BADGE_LEGEND.map((entry) => entry.id);
    expect(branchIds.indexOf('local-branch')).toBeLessThan(branchIds.indexOf('remote-branch'));
    expect(branchIds.indexOf('remote-branch')).toBeLessThan(branchIds.indexOf('merged-branch'));
  });

  it('demonstrates the multi-remote count with a badge that actually has one', () => {
    const multi = REF_BADGE_LEGEND.find((entry) => entry.id === 'merged-branch-multi');
    expect(multi?.sample.kind).toBe('ref');
    const displayRef = multi?.sample.kind === 'ref' ? multi.sample.displayRef : undefined;
    expect(displayRef && getRefBadgeContent(displayRef).remoteCount).toBeGreaterThan(1);
  });

  it('demonstrates the worktree icon with a badge that carries a worktree', () => {
    const worktreeEntry = REF_BADGE_LEGEND.find((entry) => entry.id === 'worktree');
    expect(worktreeEntry?.sample.kind === 'ref' && worktreeEntry.sample.worktree).toBeTruthy();
  });

  it('pairs an inline icon with exactly one placeholder, and none without one', () => {
    for (const entry of REF_BADGE_LEGEND) {
      const placeholders = entry.description.split(LEGEND_INLINE_ICON_PLACEHOLDER).length - 1;
      expect(placeholders, `${entry.id} placeholders`).toBe(entry.inlineIcon ? 1 : 0);
    }
  });

  it('points the HEAD row at the toolbar button with its icon', () => {
    const head = REF_BADGE_LEGEND.find((entry) => entry.id === 'head');
    expect(head?.inlineIcon).toBe('goToHead');
    expect(head?.description).toContain('HEAD button');
  });

  it('gives every entry a unique key and a description', () => {
    const ids = REF_BADGE_LEGEND.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of REF_BADGE_LEGEND) {
      expect(entry.description.trim()).not.toBe('');
    }
  });
});
