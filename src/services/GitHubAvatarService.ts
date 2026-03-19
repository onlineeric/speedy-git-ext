import type { Commit } from '../../shared/types.js';
import type { Result } from '../../shared/errors.js';
import { ok, GitError } from '../../shared/errors.js';

interface CacheEntry {
  url: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_BUFFER = 5;

export class GitHubAvatarService {
  private cache = new Map<string, CacheEntry>();
  private rateLimitRemaining = 60;
  private rateLimitResetTime = 0;

  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

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
   * Fetch avatar URLs for unique author emails from commits.
   * Deduplicates by email, skips cached entries, respects rate limits.
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
      // Return cached URL if still valid
      const cached = this.cache.get(email);
      if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
        result[email] = cached.url;
        continue;
      }

      // Check rate limit — auto-resume when reset time passes
      if (this.rateLimitRemaining < RATE_LIMIT_BUFFER && now < this.rateLimitResetTime * 1000) {
        continue;
      }

      const avatarUrl = await this.fetchSingleAvatar(hash);
      if (avatarUrl) {
        this.cache.set(email, { url: avatarUrl, fetchedAt: now });
        result[email] = avatarUrl;
      }

      // Stop if rate limit is getting low
      if (this.rateLimitRemaining < RATE_LIMIT_BUFFER) {
        break;
      }
    }

    return ok(result);
  }

  private async fetchSingleAvatar(commitHash: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.owner}/${this.repo}/commits/${commitHash}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'speedy-git-ext',
          },
        },
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
