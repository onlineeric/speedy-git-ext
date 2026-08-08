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

describe('GitHubAvatarService.lookupCommitAuthorAvatar', () => {
  const recipe = { owner: 'owner', repo: 'repo', hash: 'abc123' };

  function mockResponse(body: unknown, init: ResponseInit) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), init));
  }

  it('reports the avatar URL when GitHub links the commit to an account', async () => {
    const service = new GitHubAvatarService();
    const fetchSpy = mockResponse(
      { author: { avatar_url: 'https://avatars.githubusercontent.com/u/7?v=4' } },
      { status: 200, headers: { 'x-ratelimit-remaining': '59' } },
    );

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({
      kind: 'found',
      avatarUrl: 'https://avatars.githubusercontent.com/u/7?v=4',
    });
    fetchSpy.mockRestore();
  });

  it('distinguishes "no GitHub account" from a failure', async () => {
    const service = new GitHubAvatarService();
    // A 200 with a null author is a real answer: this email has no account.
    const fetchSpy = mockResponse({ author: null }, { status: 200, headers: { 'x-ratelimit-remaining': '58' } });

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({ kind: 'noAccount' });
    fetchSpy.mockRestore();
  });

  it('reports 404 as notFound so another candidate commit can be tried', async () => {
    const service = new GitHubAvatarService();
    const fetchSpy = mockResponse({}, { status: 404, headers: { 'x-ratelimit-remaining': '57' } });

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({ kind: 'notFound' });
    fetchSpy.mockRestore();
  });

  it('reports 422 as notFound — GitHub says this for an unpushed commit', async () => {
    // Asking about a local-only commit answers 422 "No commit found for SHA".
    // Treating that as a transport failure would burn the record's retries on a
    // verdict about the commit rather than the author.
    const service = new GitHubAvatarService();
    const fetchSpy = mockResponse(
      { message: 'No commit found for SHA: abc123' },
      { status: 422, headers: { 'x-ratelimit-remaining': '56' } },
    );

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({ kind: 'notFound' });
    fetchSpy.mockRestore();
  });

  it('reports 403 as rateLimited and exposes the reset time in ms', async () => {
    const service = new GitHubAvatarService();
    const resetSeconds = Math.floor(Date.now() / 1000) + 3600;
    const fetchSpy = mockResponse({}, {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) },
    });

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({
      kind: 'rateLimited',
      resetAt: resetSeconds * 1000,
    });
    expect(service.getRateLimit().resetAt).toBe(resetSeconds * 1000);
    fetchSpy.mockRestore();
  });

  it('reports a transport failure as networkError', async () => {
    const service = new GitHubAvatarService();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(service.lookupCommitAuthorAvatar(recipe, null)).resolves.toEqual({ kind: 'networkError' });
    fetchSpy.mockRestore();
  });

  it('sends an Authorization header only when given a token', async () => {
    const service = new GitHubAvatarService();
    const fetchSpy = mockResponse(
      { author: { avatar_url: 'https://avatars/x.png' } },
      { status: 200, headers: { 'x-ratelimit-remaining': '4999' } },
    );

    await service.lookupCommitAuthorAvatar(recipe, 'secret-token');
    await service.lookupCommitAuthorAvatar(recipe, null);

    const authed = (fetchSpy.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    const anon = (fetchSpy.mock.calls[1][1] as { headers: Record<string, string> }).headers;
    expect(authed.Authorization).toBe('Bearer secret-token');
    expect(anon.Authorization).toBeUndefined();
    fetchSpy.mockRestore();
  });
});

describe('GitHubAvatarService rate-limit tracking', () => {
  it('is not limited before any request', () => {
    expect(new GitHubAvatarService().isRateLimited(Date.now())).toBe(false);
  });

  it('reports limited once the reserve is breached and the window is still open', async () => {
    const service = new GitHubAvatarService();
    const resetSeconds = Math.floor(Date.now() / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ author: null }), {
        status: 200,
        headers: { 'x-ratelimit-remaining': '2', 'x-ratelimit-reset': String(resetSeconds) },
      }),
    );

    await service.lookupCommitAuthorAvatar({ owner: 'o', repo: 'r', hash: 'h' }, null);

    expect(service.isRateLimited(Date.now())).toBe(true);
    // Past the reset the budget is assumed replenished, so lookups resume.
    expect(service.isRateLimited(resetSeconds * 1000 + 1)).toBe(false);
    fetchSpy.mockRestore();
  });
});
