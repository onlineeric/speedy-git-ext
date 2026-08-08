import { AVATAR_RATE_LIMIT_RESERVE, type AvatarLookupOutcome } from './avatarCachePolicy.js';

/** Live view of the GitHub API budget, shared by every lookup. */
export interface RateLimitState {
  /** Requests left in the current window, as last reported by GitHub. */
  remaining: number;
  /** Unix ms when the window resets, or null when never reported. */
  resetAt: number | null;
}

/**
 * One-shot GitHub avatar lookups.
 *
 * Deliberately stateless: the cache lives in `AvatarCacheStore` and the pacing
 * in `AvatarRefreshQueue`, so this class only knows how to turn a commit into an
 * avatar URL. Keeping the cache out of here is what lets a single cache serve
 * every repository — the previous per-instance map was thrown away on every repo
 * switch.
 */
export class GitHubAvatarService {
  private rateLimit: RateLimitState = { remaining: 60, resetAt: null };

  /**
   * Parse a git remote URL to extract GitHub owner and repo.
   * Supports SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo).
   */
  static parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // HTTPS: https://github.com/owner/repo or https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  }

  /**
   * Resolve a GitHub avatar directly from a no-reply commit email — no API call,
   * no rate-limit cost. GitHub no-reply emails embed the account id, e.g.
   * `12345678+octocat@users.noreply.github.com`, which maps to the avatar CDN.
   * The legacy form without a numeric id (`octocat@users.noreply.github.com`)
   * cannot be resolved this way and returns null.
   */
  static resolveNoreplyAvatarUrl(email: string): string | null {
    const match = email.toLowerCase().match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/);
    if (!match) return null;
    return `https://avatars.githubusercontent.com/u/${match[1]}?v=4`;
  }

  getRateLimit(): RateLimitState {
    return this.rateLimit;
  }

  /**
   * Whether the API budget is spent. Stops short of zero so anything else on
   * this machine — or, unauthenticated, anyone else behind the same IP — is not
   * left with nothing.
   */
  isRateLimited(now: number): boolean {
    return (
      this.rateLimit.remaining < AVATAR_RATE_LIMIT_RESERVE
      && this.rateLimit.resetAt !== null
      && now < this.rateLimit.resetAt
    );
  }

  /**
   * Look up the GitHub account behind one commit. Returns a typed outcome
   * rather than a bare null so the caller can tell "this email has no GitHub
   * account" (a definitive answer worth caching) from "the request failed"
   * (worth retrying) and from "we are rate limited" (not this record's fault).
   */
  async lookupCommitAuthorAvatar(
    recipe: { owner: string; repo: string; hash: string },
    token: string | null,
  ): Promise<AvatarLookupOutcome> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'speedy-git-ext',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${recipe.owner}/${recipe.repo}/commits/${recipe.hash}`,
        { headers },
      );

      this.recordRateLimitHeaders(response);

      if (response.status === 403 || response.status === 429) {
        return { kind: 'rateLimited', resetAt: this.rateLimit.resetAt };
      }

      // 404 = repo missing or invisible. 422 = "no commit found for SHA", which
      // is what GitHub answers for a commit that was never pushed — common for
      // the newest rows in any working repo. Both mean "try another commit",
      // not "this author has no avatar".
      if (response.status === 404 || response.status === 422) {
        return { kind: 'notFound' };
      }

      if (!response.ok) {
        return { kind: 'networkError' };
      }

      const data = await response.json() as { author?: { avatar_url?: string } | null };
      const avatarUrl = data.author?.avatar_url;
      // A 200 with a null author means the commit email is not linked to any
      // GitHub account — a real answer, not a failure.
      return avatarUrl ? { kind: 'found', avatarUrl } : { kind: 'noAccount' };
    } catch {
      // Network error (timeout, DNS failure, offline).
      return { kind: 'networkError' };
    }
  }

  private recordRateLimitHeaders(response: Response): void {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAt = response.headers.get('x-ratelimit-reset');

    if (remaining !== null) {
      const parsed = parseInt(remaining, 10);
      if (Number.isFinite(parsed)) this.rateLimit = { ...this.rateLimit, remaining: parsed };
    }
    if (resetAt !== null) {
      const parsed = parseInt(resetAt, 10);
      // GitHub reports the reset as unix seconds; we track unix ms throughout.
      if (Number.isFinite(parsed)) this.rateLimit = { ...this.rateLimit, resetAt: parsed * 1000 };
    }
  }
}
