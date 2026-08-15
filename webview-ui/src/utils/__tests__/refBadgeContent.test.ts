import { describe, expect, it } from 'vitest';
import type { DisplayRef } from '../../types/displayRefs';
import { getRefBadgeContent, getRefTitle, remoteCountLabel } from '../refBadgeContent';

describe('getRefBadgeContent', () => {
  describe('the branch icon system', () => {
    it('marks a local-only branch with the branch icon and no cloud', () => {
      expect(getRefBadgeContent({ type: 'local-branch', localName: 'main' })).toEqual({
        label: 'main',
        leadIcons: ['branch'],
        remoteCount: 0,
      });
    });

    it('leads a remote-only branch with the cloud, so the glyph means "on a remote" everywhere', () => {
      expect(getRefBadgeContent({ type: 'remote-branch', remoteName: 'origin/main' })).toEqual({
        label: 'origin/main',
        leadIcons: ['cloud'],
        remoteCount: 0,
      });
    });

    it('leads a merged branch with the union of the two, fork before cloud', () => {
      expect(getRefBadgeContent({ type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] })).toEqual({
        label: 'main',
        leadIcons: ['branch', 'cloud'],
        remoteCount: 1,
      });
    });

    it('is literally the union of the local-only and remote-only icon sets', () => {
      const local = getRefBadgeContent({ type: 'local-branch', localName: 'main' });
      const remote = getRefBadgeContent({ type: 'remote-branch', remoteName: 'origin/main' });
      const merged = getRefBadgeContent({ type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] });
      expect(merged.leadIcons).toEqual([...local.leadIcons, ...remote.leadIcons]);
    });
  });

  describe('merged-branch label', () => {
    it('drops the remote names from the label, leaving just the branch name', () => {
      const displayRef: DisplayRef = {
        type: 'merged-branch',
        localName: 'feature/login',
        remoteNames: ['origin/feature/login'],
      };
      expect(getRefBadgeContent(displayRef).label).toBe('feature/login');
    });

    it('counts every remote so 2+ can be shown on the cloud', () => {
      const displayRef: DisplayRef = {
        type: 'merged-branch',
        localName: 'main',
        remoteNames: ['origin/main', 'upstream/main'],
      };
      expect(getRefBadgeContent(displayRef).remoteCount).toBe(2);
    });

    it('keeps the label free of the count regardless of how many remotes there are', () => {
      const displayRef: DisplayRef = {
        type: 'merged-branch',
        localName: 'main',
        remoteNames: ['origin/main', 'upstream/main', 'fork/main'],
      };
      expect(getRefBadgeContent(displayRef)).toEqual({ label: 'main', leadIcons: ['branch', 'cloud'], remoteCount: 3 });
    });
  });

  describe('non-branch refs', () => {
    it('gives a tag the tag icon and no cloud', () => {
      expect(getRefBadgeContent({ type: 'tag', tagName: 'v1.0.0' })).toEqual({
        label: 'v1.0.0',
        leadIcons: ['tag'],
        remoteCount: 0,
      });
    });

    it('gives a stash no icon at all', () => {
      expect(getRefBadgeContent({ type: 'stash', stashRef: 'stash@{0}' })).toEqual({
        label: 'stash@{0}',
        leadIcons: [],
        remoteCount: 0,
      });
    });
  });
});

describe('getRefTitle', () => {
  it('lists the full remote refs for a merged branch, the only place they remain visible', () => {
    const displayRef: DisplayRef = { type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] };
    expect(getRefTitle(displayRef)).toBe('main ⇄ origin/main');
  });

  it('lists every remote when a branch is synced to several', () => {
    const displayRef: DisplayRef = {
      type: 'merged-branch',
      localName: 'main',
      remoteNames: ['origin/main', 'upstream/main'],
    };
    expect(getRefTitle(displayRef)).toBe('main ⇄ origin/main, upstream/main');
  });

  it('shows just the name for local-only and remote-only branches', () => {
    expect(getRefTitle({ type: 'local-branch', localName: 'dev' })).toBe('dev');
    expect(getRefTitle({ type: 'remote-branch', remoteName: 'origin/dev' })).toBe('origin/dev');
  });

  it('appends the worktree path when the branch is checked out in one', () => {
    const displayRef: DisplayRef = { type: 'merged-branch', localName: 'dev', remoteNames: ['origin/dev'] };
    const title = getRefTitle(displayRef, {
      path: '/repos/wt/dev',
      head: 'abc1234',
      branch: 'dev',
      isMain: false,
      isDetached: false,
      isCurrent: false,
      isPrunable: false,
    });
    expect(title).toBe('dev ⇄ origin/dev\nWorktree: /repos/wt/dev');
  });

  describe('tags', () => {
    it('shows just the name while metadata is still loading', () => {
      expect(getRefTitle({ type: 'tag', tagName: 'v1.0.0' })).toBe('v1.0.0');
    });

    it('labels a lightweight tag as such', () => {
      const title = getRefTitle({ type: 'tag', tagName: 'v1.0.0' }, undefined, { name: 'v1.0.0', annotated: false });
      expect(title).toBe('v1.0.0\nLightweight tag');
    });

    it('includes the message and tagger of an annotated tag', () => {
      const title = getRefTitle({ type: 'tag', tagName: 'v1.0.0' }, undefined, {
        name: 'v1.0.0',
        annotated: true,
        message: 'First release',
        tagger: 'Eric',
      });
      expect(title).toContain('First release');
      expect(title).toContain('Tagger: Eric');
    });
  });
});

describe('remoteCountLabel', () => {
  it('reads naturally for one remote and for many', () => {
    expect(remoteCountLabel(1)).toBe('synced to 1 remote');
    expect(remoteCountLabel(2)).toBe('synced to 2 remotes');
  });
});
