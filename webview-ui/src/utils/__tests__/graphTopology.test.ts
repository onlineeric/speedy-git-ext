import { describe, expect, it } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { calculateTopology, connectionContinuationLane } from '../graphTopology';

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

  describe('merge first-parent connection to an already-claimed lane', () => {
    // Regression for the line-overlap bug (docs/issue-pic1.png):
    // r2 → r1 → p is the main line on lane 0; r1 reserves p on lane 0.
    // m1 is a merge with parents [p, f1]. Its first-parent line must NOT ride
    // down lane 0 (r1's line to p already occupies it) — it stays in m1's own
    // lane and bends into p at the parent row.
    const buildBugTopology = () =>
      calculateTopology([
        makeCommit('r2', ['r1']),
        makeCommit('r1', ['p']),
        makeCommit('m1', ['p', 'f1']),
        makeCommit('x', ['p']),
        makeCommit('y', ['p']),
        makeCommit('f1', ['p']),
        makeCommit('p', ['root']),
        makeCommit('w', ['root']),
        makeCommit('root'),
      ]);

    it('flags the connection to descend in the merge own lane', () => {
      const topo = buildBugTopology();
      const m1 = topo.nodes.get('m1')!;
      const pLane = topo.nodes.get('p')!.lane;

      const firstParentConn = m1.parentConnections.find(c => c.parentHash === 'p')!;
      expect(firstParentConn.toLane).toBe(pLane);
      expect(firstParentConn.fromLane).toBe(m1.lane);
      expect(firstParentConn.descendsInOwnLane).toBe(true);
      expect(connectionContinuationLane(true, firstParentConn)).toBe(m1.lane);
    });

    it('routes the passing line through the merge own lane, not the claimed lane', () => {
      const topo = buildBugTopology();
      const m1 = topo.nodes.get('m1')!;

      // Rows between m1 (row 2) and p (row 6) must show m1's line passing in
      // m1's own lane with m1's color.
      for (const row of [3, 4, 5]) {
        const passing = topo.passingLanesByRow.get(row)!;
        expect(passing).toContainEqual(
          expect.objectContaining({ lane: m1.lane, colorIndex: m1.colorIndex })
        );
      }

      // p receives the connection from m1's lane (bend happens on p's row)
      const p = topo.nodes.get('p')!;
      expect(p.incomingConnections).toContainEqual(
        expect.objectContaining({ fromLane: m1.lane, colorIndex: m1.colorIndex })
      );
    });

    it('never draws two different-colored lines in the same lane over the same rows', () => {
      const topo = buildBugTopology();
      const idx = topo.commitIndexByHash;

      // Collect every connection's vertical segment (lane + row span) using
      // the same continuation rule as the renderer.
      const segments: { lane: number; colorIndex: number; fromRow: number; toRow: number }[] = [];
      for (const node of topo.nodes.values()) {
        const isMergeCommit = node.parentConnections.length > 1;
        for (const conn of node.parentConnections) {
          segments.push({
            lane: connectionContinuationLane(isMergeCommit, conn),
            colorIndex: conn.colorIndex,
            fromRow: idx.get(node.hash)!,
            toRow: idx.get(conn.parentHash)!,
          });
        }
      }

      for (let a = 0; a < segments.length; a++) {
        for (let b = a + 1; b < segments.length; b++) {
          const s1 = segments[a];
          const s2 = segments[b];
          if (s1.lane !== s2.lane || s1.colorIndex === s2.colorIndex) continue;
          const overlapStart = Math.max(s1.fromRow, s2.fromRow);
          const overlapEnd = Math.min(s1.toRow, s2.toRow);
          expect(overlapStart).toBeGreaterThanOrEqual(overlapEnd);
        }
      }
    });
  });
});
