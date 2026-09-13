import { describe, expect, it } from 'vitest';
import { buildFixupCommitArgs } from '../../shared/fixupCommit.js';

const HASH = 'a'.repeat(40);

describe('buildFixupCommitArgs', () => {
  it('fixup: commit [-a] --fixup=<hash>', () => {
    expect(buildFixupCommitArgs({ kind: 'fixup', targetHash: HASH, includeAllTracked: false })).toEqual(['commit', `--fixup=${HASH}`]);
    expect(buildFixupCommitArgs({ kind: 'fixup', targetHash: HASH, includeAllTracked: true })).toEqual(['commit', '-a', `--fixup=${HASH}`]);
  });

  it('fixup never carries a message', () => {
    expect(buildFixupCommitArgs({ kind: 'fixup', targetHash: HASH, includeAllTracked: false, message: 'x' })).toEqual(['commit', `--fixup=${HASH}`]);
  });

  it('squash: -m only when a message is given', () => {
    expect(buildFixupCommitArgs({ kind: 'squash', targetHash: HASH, includeAllTracked: true })).toEqual(['commit', '-a', `--squash=${HASH}`]);
    expect(buildFixupCommitArgs({ kind: 'squash', targetHash: HASH, includeAllTracked: false, message: 'note "quoted"' }))
      .toEqual(['commit', `--squash=${HASH}`, '-m', 'note "quoted"']);
  });

  it('amend: --fixup=amend:<hash>, -a allowed, message never on the command line', () => {
    expect(buildFixupCommitArgs({ kind: 'amend', targetHash: HASH, includeAllTracked: true, message: 'new' }))
      .toEqual(['commit', '-a', `--fixup=amend:${HASH}`]);
  });

  it('reword: never -a, because git refuses it', () => {
    expect(buildFixupCommitArgs({ kind: 'reword', targetHash: HASH, includeAllTracked: true, message: 'new' }))
      .toEqual(['commit', `--fixup=reword:${HASH}`]);
  });
});
