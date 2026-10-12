import { describe, expect, it } from 'vitest';
import type { RemoteInfo } from '@shared/types';
import { parseRemoteAutolinkTarget, resolveRemoteAutolinkTarget } from '../remoteAutolinkTarget';

function remote(name: string, fetchUrl: string): RemoteInfo {
  return { name, fetchUrl, pushUrl: fetchUrl };
}

const GITHUB = { provider: 'github', webBaseUrl: 'https://github.com', repoPath: 'onlineeric/speedy-git-ext' };

describe('parseRemoteAutolinkTarget', () => {
  it.each([
    'https://github.com/onlineeric/speedy-git-ext.git',
    'https://github.com/onlineeric/speedy-git-ext',
    'https://user:token@github.com/onlineeric/speedy-git-ext/',
    'git@github.com:onlineeric/speedy-git-ext.git',
    'ssh://git@github.com/onlineeric/speedy-git-ext.git',
    'ssh://git@ssh.github.com:443/onlineeric/speedy-git-ext.git',
    'GIT@GitHub.com:onlineeric/speedy-git-ext',
  ])('reads %s as the GitHub repository', (url) => {
    expect(parseRemoteAutolinkTarget(url)).toEqual(GITHUB);
  });

  it('reads a GitLab project nested in subgroups', () => {
    expect(parseRemoteAutolinkTarget('git@gitlab.com:group/sub/project.git')).toEqual({
      provider: 'gitlab',
      webBaseUrl: 'https://gitlab.com',
      repoPath: 'group/sub/project',
    });
  });

  it.each([
    ['a self-hosted GitLab', 'git@gitlab.company.com:group/project.git'],
    ['GitHub Enterprise', 'https://github.company.com/team/repo.git'],
    ['a look-alike host', 'https://github.com.evil.example/a/b'],
    ['Bitbucket', 'git@bitbucket.org:team/repo.git'],
    ['a local path', '/srv/git/repo.git'],
    ['a Windows path', 'C:\\repos\\repo'],
    ['a GitHub URL that is not owner/repo', 'https://github.com/onlineeric'],
    ['a GitHub URL deeper than owner/repo', 'https://github.com/a/b/c'],
  ])('refuses %s', (_label, url) => {
    expect(parseRemoteAutolinkTarget(url)).toBeNull();
  });
});

describe('resolveRemoteAutolinkTarget', () => {
  it('uses the only remote, whatever it is called', () => {
    expect(resolveRemoteAutolinkTarget([remote('mine', 'git@github.com:onlineeric/speedy-git-ext.git')])).toEqual(GITHUB);
  });

  it('prefers upstream over origin, the fork convention', () => {
    expect(resolveRemoteAutolinkTarget([
      remote('origin', 'git@github.com:someone/speedy-git-ext.git'),
      remote('upstream', 'git@github.com:onlineeric/speedy-git-ext.git'),
    ])).toEqual(GITHUB);
  });

  it('falls back to origin when there is no upstream', () => {
    expect(resolveRemoteAutolinkTarget([
      remote('backup', 'git@gitlab.com:someone/mirror.git'),
      remote('origin', 'git@github.com:onlineeric/speedy-git-ext.git'),
    ])).toEqual(GITHUB);
  });

  it('does not swap an unsupported upstream for a supported origin', () => {
    expect(resolveRemoteAutolinkTarget([
      remote('origin', 'git@github.com:someone/fork.git'),
      remote('upstream', 'git@git.company.com:team/repo.git'),
    ])).toBeNull();
  });

  it('links nothing when several remotes have no upstream or origin', () => {
    expect(resolveRemoteAutolinkTarget([
      remote('a', 'git@github.com:one/repo.git'),
      remote('b', 'git@github.com:two/repo.git'),
    ])).toBeNull();
  });

  it('links nothing without remotes', () => {
    expect(resolveRemoteAutolinkTarget([])).toBeNull();
  });
});
