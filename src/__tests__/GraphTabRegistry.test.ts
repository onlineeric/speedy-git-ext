import { describe, expect, it, vi } from 'vitest';
import { GraphTabRegistry } from '../GraphTabRegistry.js';
import type { GraphTab } from '../webview/GraphTab.js';
import type { TabSnapshot } from '../utils/graphTabRouting.js';
import { pickReturnTarget } from '../utils/graphTabRouting.js';

vi.mock('vscode', () => ({}));

function fakeTab(id: string) {
  const tab = {
    id,
    postMessage: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    snapshot: (lastActiveSeq: number): TabSnapshot => ({
      id,
      topLevelRepoPath: `/repos/${id}`,
      displayedRepoPath: `/repos/${id}`,
      identity: null,
      lastActiveSeq,
    }),
  };
  return tab as unknown as GraphTab & typeof tab;
}

describe('GraphTabRegistry', () => {
  it('makes a new tab the return target immediately, before it is ever focused', () => {
    const registry = new GraphTabRegistry();
    registry.add(fakeTab('one'));
    registry.add(fakeTab('two'));

    expect(pickReturnTarget(registry.snapshots())?.id).toBe('two');
  });

  it('tracks activation order', () => {
    const registry = new GraphTabRegistry();
    registry.add(fakeTab('one'));
    registry.add(fakeTab('two'));

    registry.markActivated('one');

    expect(pickReturnTarget(registry.snapshots())?.id).toBe('one');
  });

  it('ignores activation of a tab it does not hold', () => {
    const registry = new GraphTabRegistry();
    registry.add(fakeTab('one'));

    registry.markActivated('gone');

    expect(registry.snapshots().map((snapshot) => snapshot.id)).toEqual(['one']);
  });

  it('needs no order repair when a tab is removed', () => {
    const registry = new GraphTabRegistry();
    registry.add(fakeTab('one'));
    registry.add(fakeTab('two'));
    registry.add(fakeTab('three'));
    registry.markActivated('one');

    registry.remove('one');

    expect(pickReturnTarget(registry.snapshots())?.id).toBe('three');
    expect(registry.count()).toBe(2);
  });

  it('never ties on activation order, so any surviving tab is reachable', () => {
    const registry = new GraphTabRegistry();
    for (const id of ['one', 'two', 'three']) registry.add(fakeTab(id));

    const seqs = registry.snapshots().map((snapshot) => snapshot.lastActiveSeq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('broadcast reaches every open tab', () => {
    const registry = new GraphTabRegistry();
    const one = fakeTab('one');
    const two = fakeTab('two');
    registry.add(one);
    registry.add(two);

    registry.broadcast({ type: 'avatarUrls', payload: { urls: {} } });

    expect(one.postMessage).toHaveBeenCalledOnce();
    expect(two.postMessage).toHaveBeenCalledOnce();
  });

  it('reloadAll reloads every open tab', () => {
    const registry = new GraphTabRegistry();
    const one = fakeTab('one');
    registry.add(one);

    registry.reloadAll();

    expect(one.reload).toHaveBeenCalledOnce();
  });

  it('dispose disposes every tab and empties the registry', () => {
    const registry = new GraphTabRegistry();
    const one = fakeTab('one');
    registry.add(one);

    registry.dispose();

    expect(one.dispose).toHaveBeenCalledOnce();
    expect(registry.count()).toBe(0);
  });
});
