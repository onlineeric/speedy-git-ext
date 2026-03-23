import { describe, expect, it } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { calculateTopology } from '../graphTopology';

function makeCommit(hash: string, parents: string[] = [], refs: RefInfo[] = []): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents,
    author: 'Test User',
    authorEmail: 'test@example.com',
    authorDate: 1_000,
    subject: hash,
    refs,
  };
}

function makeStashCommit(hash: string, parentHash: string, index: number): Commit {
  return makeCommit(hash, [parentHash], [{ name: `stash@{${index}}`, type: 'stash' }]);
}

describe('calculateTopology', () => {
  describe('basic topology', () => {
    it('assigns a linear chain to the same lane', () => {
      const c3 = makeCommit('ccc', ['bbb']);
      const c2 = makeCommit('bbb', ['aaa']);
      const c1 = makeCommit('aaa');
      const topo = calculateTopology([c3, c2, c1]);

      expect(topo.nodes.get('ccc')!.lane).toBe(0);
      expect(topo.nodes.get('bbb')!.lane).toBe(0);
      expect(topo.nodes.get('aaa')!.lane).toBe(0);
    });

    it('places two children of the same parent on different lanes', () => {
      // child1 (newer) and child2 both have parent as parent
      const child1 = makeCommit('child1', ['parent']);
      const child2 = makeCommit('child2', ['parent']);
      const parent = makeCommit('parent');
      const topo = calculateTopology([child1, child2, parent]);

      const lane1 = topo.nodes.get('child1')!.lane;
      const lane2 = topo.nodes.get('child2')!.lane;
      expect(lane1).not.toBe(lane2);
    });

    it('connects a merge commit to parents on different lanes', () => {
      // merge has two parents: main-parent and branch-parent
      const merge = makeCommit('merge', ['main-p', 'branch-p']);
      const branchTip = makeCommit('branch-p');
      const mainParent = makeCommit('main-p');
      const topo = calculateTopology([merge, branchTip, mainParent]);

      const mergeNode = topo.nodes.get('merge')!;
      expect(mergeNode.parentConnections).toHaveLength(2);
      const toLanes = mergeNode.parentConnections.map(c => c.toLane);
      // Parents should be on different lanes
      expect(new Set(toLanes).size).toBe(2);
    });
  });

  describe('lane-reuse prevention (busyLanes)', () => {
    it('does not reuse a freed lane while a connection line passes through it', () => {
      // child1 (row 0) reserves parent on lane 0.
      // child2 (row 1) also targets parent — gets lane 1, cross-lane connection to lane 0.
      //   Lane 1 is freed but marked busy until parent's row.
      // child3 (row 2, unrelated) should NOT land on lane 1.
      const child1 = makeCommit('child1', ['parent']);
      const child2 = makeCommit('child2', ['parent']);
      const child3 = makeCommit('child3', ['grandp']);
      const parent = makeCommit('parent', ['grandp']);
      const grandp = makeCommit('grandp');

      const topo = calculateTopology([child1, child2, child3, parent, grandp]);

      const child2Lane = topo.nodes.get('child2')!.lane;
      const child3Lane = topo.nodes.get('child3')!.lane;
      const parentLane = topo.nodes.get('parent')!.lane;

      // Precondition: child2 has a cross-lane connection (its lane differs from parent's)
      expect(child2Lane).not.toBe(parentLane);
      // child3 must avoid child2's lane since a connection line passes through it
      expect(child3Lane).not.toBe(child2Lane);
    });

    it('allows lane reuse after the connection ends (parent row reached)', () => {
      // tip→parent on lane 0, then unrelated should reuse lane 0 (not allocate a new one)
      const tip = makeCommit('tip', ['parent']);
      const parent = makeCommit('parent');
      const unrelated = makeCommit('unrelated');

      const topo = calculateTopology([tip, parent, unrelated]);

      const tipLane = topo.nodes.get('tip')!.lane;
      const unrelatedLane = topo.nodes.get('unrelated')!.lane;
      // After tip→parent connection ends, lane 0 should be reusable
      expect(unrelatedLane).toBe(tipLane);
    });
  });

  describe('stash handling', () => {
    it('does not pull parent onto the stash lane', () => {
      // Setup: main commit on lane 0, stash inserted before parent
      const stash = makeStashCommit('stash0', 'parent', 0);
      const parent = makeCommit('parent');

      const topo = calculateTopology([stash, parent]);

      const parentLane = topo.nodes.get('parent')!.lane;

      // Parent should stay on its natural lane (0), stash gets a separate lane
      // Key: parent must NOT be pulled to the stash lane
      expect(parentLane).toBe(0);
      // Stash connection should point to parent's actual lane
      const stashConns = topo.nodes.get('stash0')!.parentConnections;
      expect(stashConns).toHaveLength(1);
      expect(stashConns[0].toLane).toBe(parentLane);
    });

    it('resolves stash connection to parent actual lane (post-loop)', () => {
      // main-child reserves parent on lane 0, stash is a dead-end side branch
      const mainChild = makeCommit('main-child', ['parent']);
      const stash = makeStashCommit('stash0', 'parent', 0);
      const parent = makeCommit('parent');

      const topo = calculateTopology([mainChild, stash, parent]);

      const parentLane = topo.nodes.get('parent')!.lane;
      const stashConns = topo.nodes.get('stash0')!.parentConnections;

      expect(stashConns).toHaveLength(1);
      expect(stashConns[0].toLane).toBe(parentLane);
    });

    it('places multiple stashes on same parent on separate lanes', () => {
      const stash0 = makeStashCommit('stash0', 'parent', 0);
      const stash1 = makeStashCommit('stash1', 'parent', 1);
      const parent = makeCommit('parent');

      const topo = calculateTopology([stash0, stash1, parent]);

      const lane0 = topo.nodes.get('stash0')!.lane;
      const lane1 = topo.nodes.get('stash1')!.lane;
      const parentLane = topo.nodes.get('parent')!.lane;

      // Both stashes should be on different lanes
      expect(lane0).not.toBe(lane1);
      // Both should connect to parent's lane
      expect(topo.nodes.get('stash0')!.parentConnections[0].toLane).toBe(parentLane);
      expect(topo.nodes.get('stash1')!.parentConnections[0].toLane).toBe(parentLane);
    });

    it('stash does not affect sibling branch lane assignment', () => {
      // Scenario matching the original bug: branch commits should not stack on stash lane
      const featureA = makeCommit('feat-a', ['base']);
      const stash = makeStashCommit('stash0', 'base', 0);
      const featureB = makeCommit('feat-b', ['base']);
      const base = makeCommit('base');

      const topo = calculateTopology([featureA, stash, featureB, base]);

      const featALane = topo.nodes.get('feat-a')!.lane;
      const stashLane = topo.nodes.get('stash0')!.lane;
      const featBLane = topo.nodes.get('feat-b')!.lane;

      // feature-A and feature-B should NOT be on the stash lane
      expect(featALane).not.toBe(stashLane);
      expect(featBLane).not.toBe(stashLane);
      // All three should be on different lanes (or featureA/B may share if one is same as base)
      expect(featALane).not.toBe(featBLane);
    });
  });
});
