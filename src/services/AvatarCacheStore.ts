import type * as vscode from 'vscode';
import {
  AVATAR_CACHE_MAX_ENTRIES,
  AVATAR_MAX_CANDIDATE_HASHES,
  createPendingRecord,
  evictLeastRecentlySeen,
  isAvatarRecordExpired,
  type AvatarCache,
  type AvatarCacheRecord,
} from './avatarCachePolicy.js';

const CACHE_KEY = 'speedyGit.avatarCache.v1';

/**
 * Writes are batched behind this delay. The queue resolves at most one avatar
 * per second, and serializing the whole map on each one would be the only part
 * of avatar handling with a measurable cost — so it happens on a timer instead.
 */
const WRITE_DEBOUNCE_MS = 5_000;

/** Smallest `lastSeenAt` movement worth persisting. See `touch`. */
const LAST_SEEN_WRITE_GRANULARITY_MS = 60 * 60 * 1000;

/**
 * Persistent email → avatar cache backed by `globalState`.
 *
 * Keyed by email rather than by repository, because a GitHub avatar belongs to
 * an account: resolving `dev@acme.com` in one repo serves every other repo, and
 * the entry survives repo switches, window reloads and workspace changes. That
 * persistence is the whole point — the previous in-memory map was discarded on
 * every reload, so each restart re-spent the API budget from zero.
 *
 * The in-memory copy is authoritative during a session; `globalState` is written
 * behind a debounce and flushed on dispose.
 */
export class AvatarCacheStore {
  private cache: AvatarCache | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  /** Load once per session; malformed stored data degrades to an empty cache. */
  private load(): AvatarCache {
    if (this.cache) return this.cache;

    const stored = this.context.globalState.get<unknown>(CACHE_KEY);
    this.cache = isAvatarCache(stored) ? stored : {};
    return this.cache;
  }

  get(email: string): AvatarCacheRecord | undefined {
    return this.load()[email];
  }

  snapshot(): AvatarCache {
    return this.load();
  }

  /**
   * Record that these emails appeared in a loaded commit batch, creating
   * entries for ones we have never seen. Returns the emails that need a
   * background refresh, so the caller does not have to re-scan the cache.
   *
   * A failed lookup recipe is replaced when the same email turns up in another
   * repo — that repo may be one we can actually read.
   */
  touch(
    sightings: Array<{ email: string; owner: string; repo: string; hashes: string[] }>,
    refreshDays: number,
    now: number,
  ): string[] {
    const cache = this.load();
    const due: string[] = [];

    for (const sighting of sightings) {
      const existing = cache[sighting.email];

      if (!existing) {
        cache[sighting.email] = createPendingRecord(sighting, now);
        this.dirty = true;
        due.push(sighting.email);
        continue;
      }

      const needsRefresh = existing.pendingRefresh || isAvatarRecordExpired(existing, refreshDays, now);
      // Refresh the candidate commits whenever we are going to retry: this load
      // may be showing pushed commits where the last one only had local ones.
      // A resolved entry keeps whatever worked last time.
      const recipe = needsRefresh
        ? {
            owner: sighting.owner,
            repo: sighting.repo,
            hashes: sighting.hashes.slice(0, AVATAR_MAX_CANDIDATE_HASHES),
          }
        : { owner: existing.owner, repo: existing.repo, hashes: existing.hashes };

      // `lastSeenAt` only feeds LRU eviction, so hour-granularity is plenty.
      // Bumping it on every load would mark the cache dirty on every auto-refresh
      // and rewrite the entire map to globalState on a timer forever.
      const seenMovedMaterially = now - existing.lastSeenAt >= LAST_SEEN_WRITE_GRANULARITY_MS;

      cache[sighting.email] = {
        ...existing,
        ...recipe,
        pendingRefresh: needsRefresh,
        lastSeenAt: seenMovedMaterially ? now : existing.lastSeenAt,
      };
      if (needsRefresh || seenMovedMaterially) this.dirty = true;

      if (needsRefresh) due.push(sighting.email);
    }

    this.scheduleWrite();
    return due;
  }

  /**
   * Re-open every record that still has no avatar and hand them back for
   * requeueing. Called when the user authorizes GitHub: anything that failed or
   * ran out of candidates while unauthenticated deserves an immediate retry
   * rather than sitting out the full refresh window.
   */
  reopenUnresolved(): string[] {
    const cache = this.load();
    const reopened: string[] = [];

    for (const [email, record] of Object.entries(cache)) {
      if (record.avatarUrl !== null || record.pendingRefresh) continue;
      cache[email] = { ...record, pendingRefresh: true, attempts: 0 };
      reopened.push(email);
    }

    if (reopened.length > 0) {
      this.dirty = true;
      this.scheduleWrite();
    }
    return reopened;
  }

  /** Drop every cached avatar and persist the empty cache immediately. */
  async clear(): Promise<void> {
    this.cache = {};
    this.dirty = true;
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    await this.flush();
  }

  /** Replace one record after a lookup attempt. */
  update(email: string, record: AvatarCacheRecord): void {
    const cache = this.load();
    cache[email] = record;
    this.dirty = true;
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    if (!this.dirty || this.writeTimer !== undefined) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined;
      void this.flush();
    }, WRITE_DEBOUNCE_MS);
    // Never hold the extension host open just to persist avatars.
    this.writeTimer.unref?.();
  }

  /** Persist immediately. Safe to call when nothing changed. */
  async flush(): Promise<void> {
    if (!this.dirty || !this.cache) return;

    this.cache = evictLeastRecentlySeen(this.cache, AVATAR_CACHE_MAX_ENTRIES);
    this.dirty = false;

    try {
      await this.context.globalState.update(CACHE_KEY, this.cache);
    } catch (error) {
      // A cache write is never worth surfacing; we just retry next time.
      this.log.debug(`Avatar cache write failed: ${String(error)}`);
      this.dirty = true;
    }
  }

  dispose(): void {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
    }
    void this.flush();
  }
}

function isAvatarCache(value: unknown): value is AvatarCache {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const record = entry as Partial<AvatarCacheRecord>;
    return (
      (typeof record.avatarUrl === 'string' || record.avatarUrl === null)
      && (typeof record.lastRefreshAt === 'number' || record.lastRefreshAt === null)
      && typeof record.pendingRefresh === 'boolean'
      && typeof record.attempts === 'number'
      && typeof record.owner === 'string'
      && typeof record.repo === 'string'
      && Array.isArray(record.hashes)
      && record.hashes.every((hash) => typeof hash === 'string')
      && typeof record.lastSeenAt === 'number'
    );
  });
}
