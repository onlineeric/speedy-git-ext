import { describe, it, expect } from 'vitest';
import {
  isConflictStderr,
  parseBranchLine,
  parseCommitLine,
  parseRefs,
  parseTagMetadata,
} from '../utils/gitParsers.js';

const NUL = '\x00';

function commitLine(parts: string[]): string {
  return parts.join(NUL);
}

describe('isConflictStderr', () => {
  it('detects uppercase CONFLICT marker', () => {
    expect(isConflictStderr('CONFLICT (content): Merge conflict in foo.ts')).toBe(true);
  });

  it('detects lowercase "merge conflict" phrase', () => {
    expect(isConflictStderr('there was a merge conflict somewhere')).toBe(true);
  });

  it('returns false for unrelated stderr', () => {
    expect(isConflictStderr('error: pathspec did not match any file')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isConflictStderr('')).toBe(false);
  });
});

describe('parseCommitLine', () => {
  it('parses a fully populated commit line', () => {
    const line = commitLine([
      'abcdef1234567890abcdef1234567890abcdef12',
      'abcdef1',
      'parent1hash parent2hash',
      'Eric Cheng',
      'eric@example.com',
      '1700000000',
      'feat: implement parser',
      'HEAD -> main, origin/main, tag: v1.0',
    ]);
    const commit = parseCommitLine(line);
    expect(commit).not.toBeNull();
    expect(commit!.hash).toBe('abcdef1234567890abcdef1234567890abcdef12');
    expect(commit!.abbreviatedHash).toBe('abcdef1');
    expect(commit!.parents).toEqual(['parent1hash', 'parent2hash']);
    expect(commit!.author).toBe('Eric Cheng');
    expect(commit!.authorEmail).toBe('eric@example.com');
    expect(commit!.authorDate).toBe(1700000000 * 1000);
    expect(commit!.subject).toBe('feat: implement parser');
    expect(commit!.refs).toHaveLength(3);
  });

  it('returns null for malformed lines with too few fields', () => {
    expect(parseCommitLine('only-one-field')).toBeNull();
    expect(parseCommitLine(['a', 'b', 'c'].join(NUL))).toBeNull();
  });

  it('treats empty parents string as no parents (initial commit)', () => {
    const line = commitLine(['hash', 'h', '', 'a', 'a@x', '1', 's', '']);
    const commit = parseCommitLine(line);
    expect(commit!.parents).toEqual([]);
  });

  it('parses commit with no refs as empty refs array', () => {
    const line = commitLine(['hash', 'h', 'p', 'a', 'a@x', '1', 's', '']);
    const commit = parseCommitLine(line);
    expect(commit!.refs).toEqual([]);
  });
});

describe('parseRefs', () => {
  it('returns empty array for empty/whitespace input', () => {
    expect(parseRefs('')).toEqual([]);
    expect(parseRefs('   ')).toEqual([]);
  });

  it('parses a "HEAD -> branch" pointer as type=head with branch name', () => {
    expect(parseRefs('HEAD -> main')).toEqual([{ type: 'head', name: 'main' }]);
  });

  it('parses bare HEAD (detached) as head/HEAD', () => {
    expect(parseRefs('HEAD')).toEqual([{ type: 'head', name: 'HEAD' }]);
  });

  it('parses tag: prefix into a tag ref', () => {
    expect(parseRefs('tag: v1.2.3')).toEqual([{ type: 'tag', name: 'v1.2.3' }]);
  });

  it('parses fully-qualified standard refs', () => {
    expect(parseRefs('refs/heads/feature/login, refs/remotes/my-fork/main, refs/tags/v2.0')).toEqual([
      { type: 'branch', name: 'feature/login' },
      { type: 'remote', remote: 'my-fork', name: 'main' },
      { type: 'tag', name: 'v2.0' },
    ]);
  });

  it('drops fully-qualified refs outside the supported graph ref types', () => {
    expect(parseRefs('refs/jj/keep/abc123, refs/notes/commits, refs/replace/abc123')).toEqual([]);
  });

  it('drops fully-qualified `refs/remotes/<remote>/HEAD` symbolic refs', () => {
    // `refs/remotes/origin/HEAD` is a symbolic ref pointing at the remote's
    // default branch, not a real branch. Treat it like the shorthand
    // `origin/HEAD` and drop it.
    expect(parseRefs('refs/remotes/origin/HEAD')).toEqual([]);
    expect(parseRefs('refs/remotes/upstream/HEAD')).toEqual([]);
  });

  it('drops malformed `refs/remotes/...` entries with no branch part', () => {
    // Without a `<remote>/<branch>` split we can't classify the remote, so
    // these defensively return null rather than guessing.
    expect(parseRefs('refs/remotes/origin')).toEqual([]);
    expect(parseRefs('refs/remotes/origin/')).toEqual([]);
    expect(parseRefs('refs/remotes/')).toEqual([]);
  });

  it('parses slash-containing branch and tag names under fully-qualified refs', () => {
    expect(parseRefs('refs/heads/feature/sub/leaf')).toEqual([
      { type: 'branch', name: 'feature/sub/leaf' },
    ]);
    expect(parseRefs('refs/tags/release/2.0')).toEqual([
      { type: 'tag', name: 'release/2.0' },
    ]);
    expect(parseRefs('refs/remotes/origin/feature/login')).toEqual([
      { type: 'remote', remote: 'origin', name: 'feature/login' },
    ]);
  });

  it('parses stash refs', () => {
    expect(parseRefs('refs/stash')).toEqual([{ type: 'stash', name: 'refs/stash' }]);
    expect(parseRefs('stash@{0}')).toEqual([{ type: 'stash', name: 'stash@{0}' }]);
  });

  it('classifies origin/<name> as remote with remote=origin', () => {
    expect(parseRefs('origin/main')).toEqual([
      { type: 'remote', name: 'main', remote: 'origin' },
    ]);
  });

  it('classifies upstream/<name> as remote with remote=upstream', () => {
    expect(parseRefs('upstream/feature')).toEqual([
      { type: 'remote', name: 'feature', remote: 'upstream' },
    ]);
  });

  it('keeps slashed local branches like feature/login as local branch refs', () => {
    expect(parseRefs('feature/login')).toEqual([
      { type: 'branch', name: 'feature/login' },
    ]);
  });

  it('parses combined %D output with multiple refs separated by commas', () => {
    const result = parseRefs('HEAD -> main, origin/main, tag: v1.0');
    expect(result).toEqual([
      { type: 'head', name: 'main' },
      { type: 'remote', name: 'main', remote: 'origin' },
      { type: 'tag', name: 'v1.0' },
    ]);
  });

  it('skips empty entries from extra commas', () => {
    expect(parseRefs(',main, , origin/main,')).toEqual([
      { type: 'branch', name: 'main' },
      { type: 'remote', name: 'main', remote: 'origin' },
    ]);
  });

  it('drops `<remote>/HEAD` symbolic refs from commit decorations', () => {
    // origin/HEAD is git's symbolic default-branch marker, not a real branch.
    // Surfacing it produced a foot-gun where right-click → Fast-Forward ran
    // `git fetch origin HEAD:HEAD` and created a stray `refs/heads/HEAD`.
    expect(parseRefs('HEAD -> main, origin/main, origin/HEAD')).toEqual([
      { type: 'head', name: 'main' },
      { type: 'remote', name: 'main', remote: 'origin' },
    ]);
    expect(parseRefs('upstream/HEAD')).toEqual([]);
    expect(parseRefs('fork/HEAD')).toEqual([]);
  });
});

describe('parseBranchLine', () => {
  function branchLine(name: string, headMarker: string, hash: string): string {
    return [name, headMarker, hash].join(NUL);
  }

  it('parses a local non-current branch', () => {
    const result = parseBranchLine(branchLine('feature/login', ' ', 'a1b2c3d'));
    expect(result).toEqual({
      name: 'feature/login',
      remote: undefined,
      current: false,
      hash: 'a1b2c3d',
    });
  });

  it('marks branches as current when HEAD marker is "*"', () => {
    const result = parseBranchLine(branchLine('main', '*', 'a1b2c3d'));
    expect(result!.current).toBe(true);
  });

  it('strips remotes/ prefix and returns remote tracking branch', () => {
    const result = parseBranchLine(branchLine('remotes/origin/main', ' ', 'aaa1111'));
    expect(result).toEqual({
      name: 'main',
      remote: 'origin',
      current: false,
      hash: 'aaa1111',
    });
  });

  it('detects remote tracking branches like origin/main without remotes/ prefix', () => {
    const result = parseBranchLine(branchLine('origin/main', ' ', 'aaa1111'));
    expect(result!.remote).toBe('origin');
    expect(result!.name).toBe('main');
  });

  it('treats feature/login as local even though it contains a slash', () => {
    const result = parseBranchLine(branchLine('feature/login', ' ', 'h'));
    expect(result!.remote).toBeUndefined();
    expect(result!.name).toBe('feature/login');
  });

  it('returns null for malformed lines', () => {
    expect(parseBranchLine('only-one-field')).toBeNull();
    expect(parseBranchLine(['a', 'b'].join(NUL))).toBeNull();
  });

  it('trims surrounding whitespace from raw name and hash', () => {
    const result = parseBranchLine(branchLine('  main ', ' ', '  hash123  '));
    expect(result!.name).toBe('main');
    expect(result!.hash).toBe('hash123');
  });

  it('drops `<remote>/HEAD` entries from the branch list', () => {
    expect(parseBranchLine(branchLine('origin/HEAD', ' ', 'aaa1111'))).toBeNull();
    expect(parseBranchLine(branchLine('remotes/origin/HEAD', ' ', 'aaa1111'))).toBeNull();
  });
});

describe('parseTagMetadata', () => {
  const tagRecord = (name: string, type: string, message: string, tagger: string, date: string) =>
    `${[name, type, message, tagger, date].join(NUL)}${NUL}`;

  it('parses an annotated tag with all fields', () => {
    const out = tagRecord('v1.0.0', 'tag', 'First release', 'Ada Lovelace', '1700000000');
    expect(parseTagMetadata(out)).toEqual([
      { name: 'v1.0.0', annotated: true, message: 'First release', tagger: 'Ada Lovelace', date: 1700000000 },
    ]);
  });

  it('parses a lightweight tag with no annotation fields', () => {
    const out = tagRecord('v0.9', 'commit', '', '', '');
    expect(parseTagMetadata(out)).toEqual([{ name: 'v0.9', annotated: false }]);
  });

  it('treats an empty annotation message as undefined', () => {
    const out = tagRecord('v2.0', 'tag', '', 'Grace Hopper', '1700000001');
    expect(parseTagMetadata(out)).toEqual([
      { name: 'v2.0', annotated: true, message: undefined, tagger: 'Grace Hopper', date: 1700000001 },
    ]);
  });

  it('keeps tagger names and subjects with spaces intact as single fields', () => {
    const out = tagRecord('v3.0', 'tag', 'Ship it now please', 'Mary Jane Watson', '1700000002');
    expect(parseTagMetadata(out)).toEqual([
      { name: 'v3.0', annotated: true, message: 'Ship it now please', tagger: 'Mary Jane Watson', date: 1700000002 },
    ]);
  });

  it('preserves line breaks in an annotated tag message', () => {
    const out = tagRecord('v4.0', 'tag', 'Line one\nLine two\nLine three\n', 'Ada', '1700000003');
    expect(parseTagMetadata(out)).toEqual([
      { name: 'v4.0', annotated: true, message: 'Line one\nLine two\nLine three', tagger: 'Ada', date: 1700000003 },
    ]);
  });

  it('parses multiple records when annotation messages contain line breaks', () => {
    const out = [
      tagRecord('v4.0', 'tag', 'Line one\nLine two\n', 'Ada', '1700000003'),
      tagRecord('v4.1', 'tag', 'Other release\nnotes\n', 'Grace', '1700000004'),
    ].join('\n');
    expect(parseTagMetadata(out)).toEqual([
      { name: 'v4.0', annotated: true, message: 'Line one\nLine two', tagger: 'Ada', date: 1700000003 },
      { name: 'v4.1', annotated: true, message: 'Other release\nnotes', tagger: 'Grace', date: 1700000004 },
    ]);
  });

  it('skips a blank trailing record', () => {
    const out = [tagRecord('v1.0', 'tag', 'msg', 'Ada', '1700000000'), ''].join('\n');
    expect(parseTagMetadata(out)).toHaveLength(1);
  });

  it('returns an empty array for empty output', () => {
    expect(parseTagMetadata('')).toEqual([]);
  });
});
