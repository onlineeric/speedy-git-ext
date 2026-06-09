import { describe, it, expect, vi } from 'vitest';
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

describe('GitHubAvatarService.resolveNoreplyAvatarUrl', () => {
  it('resolves modern no-reply emails to the avatar CDN with no API call', () => {
    expect(GitHubAvatarService.resolveNoreplyAvatarUrl('12345678+octocat@users.noreply.github.com')).toBe(
      'https://avatars.githubusercontent.com/u/12345678?v=4',
    );
  });

  it('is case-insensitive', () => {
    expect(GitHubAvatarService.resolveNoreplyAvatarUrl('999+Octocat@Users.Noreply.GitHub.com')).toBe(
      'https://avatars.githubusercontent.com/u/999?v=4',
    );
  });

  it('returns null for legacy no-reply emails without a numeric id', () => {
    expect(GitHubAvatarService.resolveNoreplyAvatarUrl('octocat@users.noreply.github.com')).toBeNull();
  });

  it('returns null for ordinary emails', () => {
    expect(GitHubAvatarService.resolveNoreplyAvatarUrl('eric@example.com')).toBeNull();
  });
});

describe('GitHubAvatarService.fetchAvatarUrls', () => {
  it('resolves no-reply emails offline without hitting the network', async () => {
    const service = new GitHubAvatarService('owner', 'repo');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await service.fetchAvatarUrls([
      { hash: 'a', abbreviatedHash: 'a', parents: [], author: 'Octo', authorEmail: '42+octo@users.noreply.github.com', authorDate: 0, subject: '', refs: [] },
    ]);

    expect(fetchSpy).not.toHaveBeenCalled();
    if (result.success) {
      expect(result.value['42+octo@users.noreply.github.com']).toBe('https://avatars.githubusercontent.com/u/42?v=4');
    }
    fetchSpy.mockRestore();
  });

  it('negatively caches misses so refreshes do not re-call the API', async () => {
    const service = new GitHubAvatarService('owner', 'repo');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ author: null }), { status: 200, headers: { 'x-ratelimit-remaining': '40' } }),
    );

    const commits = [
      { hash: 'a', abbreviatedHash: 'a', parents: [], author: 'E', authorEmail: 'eric@example.com', authorDate: 0, subject: '', refs: [] },
    ];

    await service.fetchAvatarUrls(commits);
    await service.fetchAvatarUrls(commits);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('sends an Authorization header when constructed with a token', async () => {
    const service = new GitHubAvatarService('owner', 'repo', 'secret-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ author: { avatar_url: 'https://avatars/x.png' } }), {
        status: 200,
        headers: { 'x-ratelimit-remaining': '4999' },
      }),
    );

    await service.fetchAvatarUrls([
      { hash: 'a', abbreviatedHash: 'a', parents: [], author: 'E', authorEmail: 'eric@example.com', authorDate: 0, subject: '', refs: [] },
    ]);

    const headers = (fetchSpy.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe('Bearer secret-token');
    fetchSpy.mockRestore();
  });

  it('warns once unauthenticated requests exhaust the rate-limit buffer', async () => {
    const service = new GitHubAvatarService('owner', 'repo');
    expect(service.getRateLimitWarning()).toBeNull();

    const resetInOneHour = Math.floor(Date.now() / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ author: null }), {
        status: 200,
        headers: { 'x-ratelimit-remaining': '2', 'x-ratelimit-reset': String(resetInOneHour) },
      }),
    );
    await service.fetchAvatarUrls([
      { hash: 'a', abbreviatedHash: 'a', parents: [], author: 'E', authorEmail: 'eric@example.com', authorDate: 0, subject: '', refs: [] },
    ]);
    // Remaining (2) is within the buffer that blocks API calls, so the warning fires.
    expect(service.getRateLimitWarning()).toContain('rate limit');
    fetchSpy.mockRestore();
  });

  it('never warns when authenticated', () => {
    const service = new GitHubAvatarService('owner', 'repo', 'token');
    expect(service.getRateLimitWarning()).toBeNull();
  });

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
