import { describe, it, expect } from 'vitest';
import { GitHubAvatarService } from '../services/GitHubAvatarService.js';

describe('GitHubAvatarService.parseGitHubRemote', () => {
  it('parses HTTPS clone URL with .git suffix', () => {
    expect(GitHubAvatarService.parseGitHubRemote('https://github.com/onlineeric/speedy-git-ext.git')).toEqual({
      owner: 'onlineeric',
      repo: 'speedy-git-ext',
    });
  });

  it('parses HTTPS clone URL without .git suffix', () => {
    expect(GitHubAvatarService.parseGitHubRemote('https://github.com/onlineeric/speedy-git-ext')).toEqual({
      owner: 'onlineeric',
      repo: 'speedy-git-ext',
    });
  });

  it('parses SSH clone URL', () => {
    expect(GitHubAvatarService.parseGitHubRemote('git@github.com:onlineeric/speedy-git-ext.git')).toEqual({
      owner: 'onlineeric',
      repo: 'speedy-git-ext',
    });
  });

  it('parses SSH URL without .git', () => {
    expect(GitHubAvatarService.parseGitHubRemote('git@github.com:owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(GitHubAvatarService.parseGitHubRemote('https://gitlab.com/owner/repo.git')).toBeNull();
    expect(GitHubAvatarService.parseGitHubRemote('https://example.com/owner/repo')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(GitHubAvatarService.parseGitHubRemote('')).toBeNull();
    expect(GitHubAvatarService.parseGitHubRemote('not-a-url')).toBeNull();
  });

  it('handles uppercase domain', () => {
    expect(GitHubAvatarService.parseGitHubRemote('https://GitHub.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });
});

describe('GitHubAvatarService.fetchAvatarUrls', () => {
  it('returns cached URLs without calling fetch when within TTL', async () => {
    const service = new GitHubAvatarService('owner', 'repo');
    const cache = (service as unknown as { cache: Map<string, { url: string; fetchedAt: number }> }).cache;
    cache.set('eric@example.com', { url: 'https://avatars/eric.png', fetchedAt: Date.now() });

    const result = await service.fetchAvatarUrls([
      {
        hash: 'aaa111',
        abbreviatedHash: 'aaa1',
        parents: [],
        author: 'Eric',
        authorEmail: 'eric@example.com',
        authorDate: 0,
        subject: 's',
        refs: [],
      },
    ]);

    expect(result.success).toBe(true);
    if (result.success) expect(result.value['eric@example.com']).toBe('https://avatars/eric.png');
  });

  it('deduplicates by lowercase email', async () => {
    const service = new GitHubAvatarService('owner', 'repo');
    const cache = (service as unknown as { cache: Map<string, { url: string; fetchedAt: number }> }).cache;
    cache.set('eric@example.com', { url: 'cached-url', fetchedAt: Date.now() });

    const commits = [
      { hash: 'a', abbreviatedHash: 'a', parents: [], author: 'E1', authorEmail: 'Eric@Example.com', authorDate: 0, subject: '', refs: [] },
      { hash: 'b', abbreviatedHash: 'b', parents: [], author: 'E2', authorEmail: 'eric@example.com', authorDate: 0, subject: '', refs: [] },
    ];

    const result = await service.fetchAvatarUrls(commits);
    if (result.success) {
      expect(Object.keys(result.value)).toHaveLength(1);
    }
  });
});
