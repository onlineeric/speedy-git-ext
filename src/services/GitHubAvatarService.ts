import type { Commit } from '../../shared/types.js';
import type { Result } from '../../shared/errors.js';
import { ok, GitError } from '../../shared/errors.js';

interface CacheEntry {
  // `null` is a negative cache entry: we tried (or know we cannot) resolve this
  // email and should not re-attempt until the (shorter) failure TTL expires.
  url: string | null;
  fetchedAt: number;
}

const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FAILURE_TTL_MS = 60 * 60 * 1000; // 1 hour — keep refreshes from re-burning the rate limit
const RATE_LIMIT_BUFFER = 5;

export class GitHubAvatarService {
  private cache = new Map<string, CacheEntry>();
  private rateLimitRemaining = 60;
  private rateLimitResetTime = 0;

  /**
   * @param token Optional GitHub access token. When provided, requests are
   * authenticated, raising the rate limit from 60 to 5000 requests/hour.
   */
  constructor(
    private readonly owner: string,
    private readonly repo: string,
    private readonly token: string | null = null,
  ) {}

  /** Whether the GitHub rate limit is currently blocking API calls. */
  private isRateLimited(now: number): boolean {
    return this.rateLimitRemaining < RATE_LIMIT_BUFFER && now < this.rateLimitResetTime * 1000;
  }

  /**
   * A human-readable warning when avatar fetching is degraded by the GitHub
   * rate limit, or null when healthy. Owns the rate-limit policy (the 60 vs
   * 5000 req/hr thresholds) so callers don't reconstruct it. The blocked state
   * matches the gate used in {@link fetchAvatarUrls}, so the warning fires
   * exactly when API calls are actually being skipped.
   */
  getRateLimitWarning(): string | null {
    if (this.token !== null || !this.isRateLimited(Date.now())) return null;
    return (
      'GitHub avatar rate limit reached (60/hr for unauthenticated requests). ' +
      'Sign in to GitHub in VS Code to raise the limit to 5000/hr.'
    );
  }

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

  /**
   * Fetch avatar URLs for unique author emails from commits.
   * Deduplicates by email, serves cached entries (positive and negative),
   * resolves no-reply emails offline, and respects the GitHub rate limit.
   */
  async fetchAvatarUrls(commits: Commit[]): Promise<Result<Record<string, string>, GitError>> {
    const now = Date.now();
    const result: Record<string, string> = {};

    // Deduplicate by email and pick one representative commit hash per email
    const emailToHash = new Map<string, string>();
    for (const commit of commits) {
      const email = commit.authorEmail.toLowerCase();
      if (!emailToHash.has(email)) {
        emailToHash.set(email, commit.hash);
      }
    }

    for (const [email, hash] of emailToHash) {
      // Serve from cache when the entry is still fresh (positive or negative).
      const cached = this.cache.get(email);
      if (cached && now - cached.fetchedAt < this.ttlFor(cached)) {
        if (cached.url) result[email] = cached.url;
        continue;
      }

      // Free path: derive the avatar from a GitHub no-reply email (no API call).
      const noreplyUrl = GitHubAvatarService.resolveNoreplyAvatarUrl(email);
      if (noreplyUrl) {
        this.cache.set(email, { url: noreplyUrl, fetchedAt: now });
        result[email] = noreplyUrl;
        continue;
      }

      // Skip the API while rate-limited — leave uncached so we retry after reset.
      if (this.isRateLimited(now)) {
        continue;
      }

      const avatarUrl = await this.fetchSingleAvatar(hash);
      // Cache both outcomes: success keeps it for a day, a miss is negatively
      // cached so repeated refreshes don't keep spending the rate limit on it.
      this.cache.set(email, { url: avatarUrl, fetchedAt: now });
      if (avatarUrl) {
        result[email] = avatarUrl;
      }

      // Stop if rate limit is getting low
      if (this.rateLimitRemaining < RATE_LIMIT_BUFFER) {
        break;
      }
    }

    return ok(result);
  }

  private ttlFor(entry: CacheEntry): number {
    return entry.url ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
  }

  private async fetchSingleAvatar(commitHash: string): Promise<string | null> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'speedy-git-ext',
      };
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const response = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/commits/${commitHash}`,
        { headers },
      );

      // Update rate limit tracking from headers
      const remaining = response.headers.get('x-ratelimit-remaining');
      const resetTime = response.headers.get('x-ratelimit-reset');
      if (remaining !== null) {
        this.rateLimitRemaining = parseInt(remaining, 10);
      }
      if (resetTime !== null) {
        this.rateLimitResetTime = parseInt(resetTime, 10);
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { author?: { avatar_url?: string } };
      return data.author?.avatar_url ?? null;
    } catch {
      // Network error (timeout, DNS failure, offline) — return null to trigger Gravatar fallback
      return null;
    }
  }
}
