/**
 * Pure decision logic for the avatar cache and its background refresh queue.
 *
 * Everything here is side-effect free so the rules can be tested directly:
 * `AvatarCacheStore` owns persistence and `AvatarRefreshQueue` owns pacing, but
 * *when* a record is stale, *what* an attempt did to it, and *which* record goes
 * next are all decided here.
 *
 * Two rules shape the record format, because VS Code keeps an extension's whole
 * `globalState` as a single JSON blob and warns past 512 KB:
 *
 * 1. **Only durable answers are stored.** How to perform a lookup (repo, candidate
 *    commits) lives on the in-memory queue task, not on the record — it is
 *    re-derived from the loaded commits every time and is worthless after a
 *    restart.
 * 2. **Nothing derivable is stored.** No queue flag, no retry counter: both are
 *    recomputed from `refreshedOn` and the queue's own in-memory state.
 *
 * The central behavioural rule is that a record is never written off. Every
 * completed lookup stamps `refreshedOn`, so the record comes back around one
 * refresh window later and an email that joins GitHub later is picked up then.
 */

/**
 * One cached lookup, keyed by lowercase author email.
 *
 * Deliberately small — roughly 140 bytes serialized. Field names stay readable
 * rather than being shortened to one letter: the difference is ~19 KB across a
 * full cache, which is not worth an encode/decode layer between the stored shape
 * and the code that reads it.
 */
export interface AvatarCacheRecord {
  /**
   * The avatar URL exactly as GitHub returned it, or null when GitHub has no
   * account for this email.
   *
   * Stored verbatim rather than reduced to the account id and rebuilt from a
   * template. Today every URL is `https://avatars.githubusercontent.com/u/<id>?v=4`,
   * so a template would save ~46 bytes per record — but that format is GitHub's
   * to change (the `v=` revision has moved before), and a hardcoded template
   * would then produce wrong URLs for every cached record. 46 bytes against a
   * 512 KB budget is not worth owning a guess about someone else's URL scheme.
   *
   * `null` means two different things depending on {@link refreshedOn}: never
   * looked up (0) versus looked up and genuinely not on GitHub.
   */
  avatarUrl: string | null;

  /**
   * Day number (days since the Unix epoch) of the last completed lookup;
   * `0` when never looked up. Days rather than milliseconds because the refresh
   * window is measured in days — 5 digits instead of 13.
   */
  refreshedOn: number;

  /**
   * Day number this email was last seen in a loaded commit batch. Drives
   * eviction only, so day granularity is ample.
   */
  seenOn: number;
}

export type AvatarCache = Record<string, AvatarCacheRecord>;

/**
 * A queued lookup. Lives only in memory: the repo and candidate commits come
 * from the commits currently loaded, and are meaningless once those change.
 */
export interface AvatarLookupTask {
  email: string;
  owner: string;
  repo: string;
  /**
   * Candidate commits, first one next. More than one because GitHub only knows
   * commits that have been **pushed** — asking about a local-only commit answers
   * 422, which says nothing about the author.
   */
  hashes: string[];
}

/** What a single lookup attempt learned. */
export type AvatarLookupOutcome =
  /** GitHub returned an avatar for the commit's author. */
  | { kind: 'found'; avatarUrl: string }
  /** GitHub answered, but the commit author is not linked to any account. */
  | { kind: 'noAccount' }
  /**
   * The repo or commit is not there: 404 (no repo, or no access) or 422 (the
   * commit is not on GitHub, typically never pushed). Says nothing about the
   * author, so the next candidate commit is worth trying.
   */
  | { kind: 'notFound' }
  /** Transport failure: offline, DNS, timeout. */
  | { kind: 'networkError' }
  /** Rate limited. Never the record's fault. */
  | { kind: 'rateLimited'; resetAt: number | null };

/**
 * Delay between queue items. Deliberately a single constant: the queue is a
 * background trickle, and this is the one dial worth turning.
 */
export const AVATAR_REFRESH_INTERVAL_MS = 1000;

/**
 * Cache ceiling; least-recently-seen entries are dropped past this.
 *
 * Sized against VS Code's storage budget. VS Code keeps an extension's entire
 * `globalState` as one JSON blob and warns at 512 KB. At ~140 bytes per record
 * this lands near 140 KB, leaving ample room for the persisted UI state and
 * per-repo table layouts sharing the same blob.
 */
export const AVATAR_CACHE_MAX_ENTRIES = 1000;

/**
 * Leave a little of the hourly budget for anything else on this machine or IP
 * rather than draining it to zero.
 */
export const AVATAR_RATE_LIMIT_RESERVE = 10;

export const MIN_AVATAR_REFRESH_DAYS = 1;
export const MAX_AVATAR_REFRESH_DAYS = 365;

const MS_PER_DAY = 86_400_000;

/** Days since the Unix epoch. */
export function toDayNumber(timestampMs: number): number {
  return Math.floor(timestampMs / MS_PER_DAY);
}

/** Clamp a user-supplied refresh window to the supported range. */
export function clampAvatarRefreshDays(days: number, fallback: number): number {
  if (!Number.isFinite(days)) return fallback;
  return Math.min(MAX_AVATAR_REFRESH_DAYS, Math.max(MIN_AVATAR_REFRESH_DAYS, Math.round(days)));
}

/**
 * Whether a record is due for a refresh. Expiry is derived from
 * `refreshedOn + refreshDays` at read time and never stored, so lowering the
 * setting immediately expires everything already cached.
 */
export function isAvatarRecordExpired(
  record: AvatarCacheRecord,
  refreshDays: number,
  today: number,
): boolean {
  if (record.refreshedOn === 0) return true;
  return today - record.refreshedOn >= refreshDays;
}

/** A brand-new record for an email seen for the first time. */
export function createPendingRecord(today: number): AvatarCacheRecord {
  return { avatarUrl: null, refreshedOn: 0, seenOn: today };
}

/**
 * Fold a lookup result into a record.
 *
 * `found` and `noAccount` are both definitive answers about the author and stamp
 * `refreshedOn`, closing the cycle until the window elapses.
 *
 * `notFound` is a verdict on the *commit*, not the author — the caller tries the
 * next candidate, and only stamps once candidates run out (`exhausted`).
 *
 * `networkError` and `rateLimited` deliberately return the record unchanged:
 * stamping would cost a full refresh window for being briefly offline, and a
 * never-stamped record stays expired, so the next load simply re-queues it. That
 * is what removed the need for a persisted retry counter.
 */
export function applyAvatarLookupOutcome(
  record: AvatarCacheRecord,
  outcome: AvatarLookupOutcome,
  today: number,
  options: { candidatesExhausted?: boolean } = {},
): AvatarCacheRecord {
  switch (outcome.kind) {
    case 'found':
      return { ...record, avatarUrl: outcome.avatarUrl, refreshedOn: today };

    case 'noAccount':
      return { ...record, avatarUrl: null, refreshedOn: today };

    case 'notFound':
      // Out of candidates: wait for the window, by which point a later load may
      // have supplied pushed commits to try.
      return options.candidatesExhausted ? { ...record, refreshedOn: today } : record;

    case 'networkError':
    case 'rateLimited':
      return record;
  }
}

/**
 * Refresh priority, lowest first.
 *
 * 0 — never looked up: the row shows initials, so this is a visible gap.
 * 1 — looked up, no account, now expired: also a gap, but likely to stay empty,
 *     so it yields to genuinely new emails.
 * 2 — has an avatar, just stale: something is already on screen.
 */
export function avatarRefreshTier(record: AvatarCacheRecord): 0 | 1 | 2 {
  if (record.avatarUrl !== null) return 2;
  return record.refreshedOn === 0 ? 0 : 1;
}

/**
 * Queue order: visible gaps before stale pictures, and within a tier the most
 * recently seen author first — the top of the graph, where the user is looking.
 */
export function compareAvatarRefreshPriority(a: AvatarCacheRecord, b: AvatarCacheRecord): number {
  const tierDelta = avatarRefreshTier(a) - avatarRefreshTier(b);
  if (tierDelta !== 0) return tierDelta;
  return b.seenOn - a.seenOn;
}

/**
 * Drop least-recently-seen entries once the cache exceeds `maxEntries`.
 * Returns the same object when nothing needs evicting so callers can skip a write.
 */
export function evictLeastRecentlySeen(cache: AvatarCache, maxEntries: number): AvatarCache {
  const emails = Object.keys(cache);
  if (emails.length <= maxEntries) return cache;

  const keep = emails
    .sort((a, b) => cache[b].seenOn - cache[a].seenOn)
    .slice(0, maxEntries);

  const next: AvatarCache = {};
  for (const email of keep) next[email] = cache[email];
  return next;
}
