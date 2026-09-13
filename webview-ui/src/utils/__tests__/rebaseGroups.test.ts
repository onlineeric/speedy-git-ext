import { describe, expect, it } from 'vitest';
import type { RebaseAction, RebaseEntry } from '@shared/types';
import { getRebaseGroupPositions } from '../rebaseGroups';

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
