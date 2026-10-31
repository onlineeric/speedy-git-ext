import { describe, it, expect } from 'vitest';
import { multiDiffNeedsHead, planMultiDiffEntries, resolveMultiDiffRevisions } from '../utils/multiDiffPlan.js';

describe('resolveMultiDiffRevisions', () => {
  it('diffs a commit against its parent', () => {
    expect(resolveMultiDiffRevisions({ kind: 'commit', hash: 'c2', parentHash: 'c1' }, '')).toEqual({
      before: { kind: 'commit', hash: 'c1' },
      after: { kind: 'commit', hash: 'c2' },
    });
  });

  it('leaves a root commit with nothing before it', () => {
    expect(resolveMultiDiffRevisions({ kind: 'commit', hash: 'c1' }, 'head').before).toBeUndefined();
  });

  it('diffs staged changes from HEAD to the index', () => {
    expect(resolveMultiDiffRevisions({ kind: 'staged' }, 'head')).toEqual({
      before: { kind: 'commit', hash: 'head' },
      after: { kind: 'index' },
    });
  });

  it('diffs unstaged changes from HEAD to the working tree, matching a single-file click', () => {
    expect(resolveMultiDiffRevisions({ kind: 'unstaged' }, 'head')).toEqual({
      before: { kind: 'commit', hash: 'head' },
      after: { kind: 'workingTree' },
    });
  });

  it('has nothing before on an unborn branch', () => {
    expect(resolveMultiDiffRevisions({ kind: 'staged' }, '').before).toBeUndefined();
  });

  it('maps a null compare slot to the working tree', () => {
    expect(resolveMultiDiffRevisions({ kind: 'compare', aHash: 'a1', bHash: null }, '')).toEqual({
      before: { kind: 'commit', hash: 'a1' },
      after: { kind: 'workingTree' },
    });
  });

  it('resolves HEAD only for the uncommitted sources', () => {
    expect(multiDiffNeedsHead({ kind: 'staged' })).toBe(true);
    expect(multiDiffNeedsHead({ kind: 'unstaged' })).toBe(true);
    expect(multiDiffNeedsHead({ kind: 'commit', hash: 'c1' })).toBe(false);
    expect(multiDiffNeedsHead({ kind: 'compare', aHash: null, bHash: 'b' })).toBe(false);
  });
});

describe('planMultiDiffEntries', () => {
  const revisions = resolveMultiDiffRevisions({ kind: 'commit', hash: 'c2', parentHash: 'c1' }, '');

  it('reads a modified file at both revisions', () => {
    expect(planMultiDiffEntries(revisions, [{ path: 'a.ts', status: 'modified' }])).toEqual([{
      filePath: 'a.ts',
      original: { revision: { kind: 'commit', hash: 'c1' }, filePath: 'a.ts', isSubmodule: false },
      modified: { revision: { kind: 'commit', hash: 'c2' }, filePath: 'a.ts', isSubmodule: false },
    }]);
  });

  it('gives an added or untracked file no original side', () => {
    const [added, untracked] = planMultiDiffEntries(revisions, [
      { path: 'new.ts', status: 'added' },
      { path: 'loose.ts', status: 'untracked' },
    ]);
    expect(added.original).toBeUndefined();
    expect(untracked.original).toBeUndefined();
    expect(added.modified).toBeDefined();
  });

  it('gives a deleted file no modified side', () => {
    const [deleted] = planMultiDiffEntries(revisions, [{ path: 'gone.ts', status: 'deleted' }]);
    expect(deleted.modified).toBeUndefined();
    expect(deleted.original?.filePath).toBe('gone.ts');
  });

  it('reads a renamed file at its old path on the original side', () => {
    const [renamed] = planMultiDiffEntries(revisions, [{ path: 'new/name.ts', oldPath: 'old/name.ts', status: 'renamed' }]);
    expect(renamed.original?.filePath).toBe('old/name.ts');
    expect(renamed.modified?.filePath).toBe('new/name.ts');
  });

  it('carries the submodule flag so a gitlink is never read as a file', () => {
    const [entry] = planMultiDiffEntries(revisions, [{ path: 'libs/sub', status: 'modified', isSubmodule: true }]);
    expect(entry.original?.isSubmodule).toBe(true);
    expect(entry.modified?.isSubmodule).toBe(true);
  });

  it('shows every file as added when there is nothing before', () => {
    const rootCommit = resolveMultiDiffRevisions({ kind: 'commit', hash: 'c1' }, '');
    const [entry] = planMultiDiffEntries(rootCommit, [{ path: 'a.ts', status: 'modified' }]);
    expect(entry.original).toBeUndefined();
  });
});
