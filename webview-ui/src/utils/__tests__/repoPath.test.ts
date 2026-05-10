import { describe, it, expect } from 'vitest';
import { joinRepoPath } from '../repoPath';

describe('joinRepoPath', () => {
  it('joins a Unix-style parent and submodule path with a forward slash', () => {
    expect(joinRepoPath('/home/user/repo', 'sub')).toBe('/home/user/repo/sub');
  });

  it('uses backslash separator when parent is Windows-style and contains no forward slash', () => {
    expect(joinRepoPath('C:\\Users\\me\\repo', 'sub/nested')).toBe('C:\\Users\\me\\repo\\sub\\nested');
  });

  it('strips trailing separators from the parent path', () => {
    expect(joinRepoPath('/home/user/repo/', 'sub')).toBe('/home/user/repo/sub');
    expect(joinRepoPath('C:\\Users\\me\\repo\\', 'sub')).toBe('C:\\Users\\me\\repo\\sub');
  });

  it('strips leading separators from the submodule segment', () => {
    expect(joinRepoPath('/home/user/repo', '/sub')).toBe('/home/user/repo/sub');
  });

  it('normalizes nested separators in the submodule segment to the parent style', () => {
    expect(joinRepoPath('C:\\repo', 'a/b/c')).toBe('C:\\repo\\a\\b\\c');
  });
});
