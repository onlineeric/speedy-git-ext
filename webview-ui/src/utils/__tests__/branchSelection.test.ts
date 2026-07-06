import { describe, it, expect } from 'vitest';
import type { Branch } from '@shared/types';
import { addAllLocalBranches, getBranchKey } from '../branchSelection';

function local(name: string, current = false): Branch {
  return { name, current, hash: 'abc123' };
}

function remote(name: string, remoteName = 'origin'): Branch {
  return { name, remote: remoteName, current: false, hash: 'abc123' };
}

const branches: Branch[] = [
  local('main'),
  local('dev', true),
  local('feature/x'),
  remote('main'),
  remote('dev'),
];

describe('getBranchKey', () => {
  it('uses the bare name for local branches', () => {
    expect(getBranchKey(local('main'))).toBe('main');
  });

  it('prefixes remote branches with the remote name', () => {
    expect(getBranchKey(remote('main'))).toBe('origin/main');
  });
});

describe('addAllLocalBranches', () => {
  it('selects all local branches when nothing is selected', () => {
    expect(addAllLocalBranches([], branches)).toEqual(['main', 'dev', 'feature/x']);
  });

  it('keeps already-selected local branches without duplicating them', () => {
    expect(addAllLocalBranches(['dev'], branches)).toEqual(['dev', 'main', 'feature/x']);
  });

  it('keeps selected remote branches unchanged', () => {
    expect(addAllLocalBranches(['origin/main'], branches)).toEqual([
      'origin/main',
      'main',
      'dev',
      'feature/x',
    ]);
  });

  it('does not add remote branches to the selection', () => {
    const result = addAllLocalBranches([], branches);
    expect(result).not.toContain('origin/main');
    expect(result).not.toContain('origin/dev');
  });

  it('returns null when all local branches are already selected (idempotent re-click)', () => {
    const first = addAllLocalBranches(['origin/dev'], branches);
    expect(first).not.toBeNull();
    expect(addAllLocalBranches(first!, branches)).toBeNull();
  });

  it('returns null when there are no local branches to add', () => {
    expect(addAllLocalBranches([], [remote('main')])).toBeNull();
    expect(addAllLocalBranches(['origin/main'], [remote('main')])).toBeNull();
  });
});
