import type * as vscode from 'vscode';
import {
  AVATAR_CACHE_MAX_ENTRIES,
  createPendingRecord,
  evictLeastRecentlySeen,
  isAvatarRecordExpired,
  type AvatarCache,
  type AvatarCacheRecord,
  type AvatarLookupTask,
} from './avatarCachePolicy.js';

/** Bumped only when the record shape changes; old data is then ignored. */
const CACHE_KEY = 'speedyGit.avatarCache.v2';

/**
 * Writes are batched behind this delay. The queue resolves at most one avatar
 * per second, and serializing the whole map on each one would be the only part
 * of avatar handling with a measurable cost — so it happens on a timer instead.
 */
const WRITE_DEBOUNCE_MS = 5_000;

/**
 * Persistent email → avatar cache backed by `globalState`.
 *
 * Keyed by email rather than by repository, because a GitHub avatar belongs to
 * an account: resolving `dev@acme.com` in one repo serves every other repo, and
 * the entry survives repo switches, window reloads and workspace changes. That
 * persistence is the whole point — the previous in-memory map was discarded on
 * every reload, so each restart re-spent the API budget from zero.
 *
 * Only durable answers live here. How to *perform* a lookup travels with the
 * queue task instead, since it is re-derived from the loaded commits each time.
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

  /**
   * Record that these emails appeared in a loaded commit batch, creating
   * entries for ones we have never seen. Returns the tasks that need a
   * background lookup, so the caller does not have to re-scan the cache.
   */
  touch(sightings: AvatarLookupTask[], refreshDays: number, today: number): AvatarLookupTask[] {
    const cache = this.load();
    const due: AvatarLookupTask[] = [];

    for (const sighting of sightings) {
      const existing = cache[sighting.email];

      if (!existing) {
        cache[sighting.email] = createPendingRecord(today);
        this.dirty = true;
        due.push(sighting);
        continue;
      }

      if (isAvatarRecordExpired(existing, refreshDays, today)) {
        due.push(sighting);
      }

      // `seenOn` only feeds eviction, so a same-day sighting changes nothing.
      // Rewriting it on every load would mark the cache dirty on every
      // auto-refresh and re-serialize the whole map on a timer forever.
      if (existing.seenOn !== today) {
        cache[sighting.email] = { ...existing, seenOn: today };
        this.dirty = true;
      }
    }

    this.scheduleWrite();
    return due;
  }

  /**
   * Re-open every record that has no avatar, so the caller can queue them again.
   * Called when the user authorizes GitHub: anything that failed while
   * unauthenticated deserves an immediate retry rather than sitting out the full
   * refresh window. Clearing `refreshedOn` is what makes them expired again.
   */
  reopenUnresolved(): string[] {
    const cache = this.load();
    const reopened: string[] = [];

    for (const [email, record] of Object.entries(cache)) {
      if (record.accountId !== null || record.url || record.refreshedOn === 0) continue;
      cache[email] = { ...record, refreshedOn: 0 };
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
      (typeof record.accountId === 'number' || record.accountId === null)
      && (record.url === undefined || typeof record.url === 'string')
      && typeof record.refreshedOn === 'number'
      && typeof record.seenOn === 'number'
    );
  });
}
