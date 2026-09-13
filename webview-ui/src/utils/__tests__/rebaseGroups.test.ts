import { describe, expect, it } from 'vitest';
import type { RebaseAction, RebaseEntry } from '@shared/types';
import { getRebaseDragBlocks, getRebaseGroupPositions, moveRebaseDragBlock } from '../rebaseGroups';

const list = (...actions: RebaseAction[]): RebaseEntry[] =>
  actions.map((action, i) => ({ hash: `h${i}`, abbreviatedHash: `h${i}`, subject: 's', message: 's', action }));

describe('getRebaseGroupPositions', () => {
  it('brackets a lead with the squash/fixup rows below it', () => {
    expect(getRebaseGroupPositions(list('pick', 'fixup', 'squash', 'pick', 'reword', 'fixup'))).toEqual([
      'lead', 'member', 'last', 'none', 'lead', 'last',
    ]);
  });

  it('leaves ungrouped rows alone', () => {
    expect(getRebaseGroupPositions(list('pick', 'pick', 'drop'))).toEqual(['none', 'none', 'none']);
  });

  it('passes through a drop inside a group but not a trailing one', () => {
    expect(getRebaseGroupPositions(list('pick', 'drop', 'fixup', 'drop'))).toEqual(['lead', 'member', 'last', 'none']);
  });

  it('does not bracket a squash with nothing above it', () => {
    expect(getRebaseGroupPositions(list('squash', 'pick'))).toEqual(['none', 'none']);
  });
});

const hashes = (entries: RebaseEntry[]) => entries.map((entry) => entry.hash);

describe('getRebaseDragBlocks', () => {
  it('keeps a whole group, including a drop it passes through, in one block', () => {
    const blocks = getRebaseDragBlocks(list('pick', 'pick', 'drop', 'fixup', 'drop', 'pick'));
    expect(blocks.map((block) => [block.id, block.startIndex, hashes(block.entries)])).toEqual([
      ['h0', 0, ['h0']],
      ['h1', 1, ['h1', 'h2', 'h3']],
      ['h4', 4, ['h4']],
      ['h5', 5, ['h5']],
    ]);
  });
});

describe('moveRebaseDragBlock', () => {
  it('moves a lead together with its fixup', () => {
    const entries = list('pick', 'pick', 'fixup', 'pick');
    expect(hashes(moveRebaseDragBlock(entries, 'h1', 'h3'))).toEqual(['h0', 'h3', 'h1', 'h2']);
    expect(hashes(moveRebaseDragBlock(entries, 'h1', 'h0'))).toEqual(['h1', 'h2', 'h0', 'h3']);
  });

  it('moves a single row past a group without splitting it', () => {
    const entries = list('pick', 'pick', 'fixup', 'pick');
    expect(hashes(moveRebaseDragBlock(entries, 'h3', 'h1'))).toEqual(['h0', 'h3', 'h1', 'h2']);
    expect(hashes(moveRebaseDragBlock(entries, 'h0', 'h1'))).toEqual(['h1', 'h2', 'h0', 'h3']);
  });

  it('returns the list unchanged for an id that names no block', () => {
    const entries = list('pick', 'fixup');
    expect(moveRebaseDragBlock(entries, 'h1', 'h0')).toBe(entries);
  });
});
