/**
 * Pure decision logic for the avatar cache and its background refresh queue.
 *
 * Everything here is side-effect free so the rules can be tested directly:
 * `AvatarCacheStore` owns persistence and `AvatarRefreshQueue` owns pacing, but
 * *when* a record is stale, *what* an attempt did to it, and *which* record goes
 * next are all decided here.
 *
 * The central rule is that a record is never written off. Every attempt —
 * resolved, not on GitHub, or given up on — stamps `lastRefreshAt`, so the
 * record simply comes back around one refresh window later. That bounds the
 * worst case at (known authors ÷ refresh days) requests per day and means an
 * email that joins GitHub later is picked up on its next cycle.
 */

/** One cached avatar lookup, keyed by lowercase author email. */
export interface AvatarCacheRecord {
  /** Resolved avatar URL, or null when the last attempt found no GitHub account. */
  avatarUrl: string | null;
  /** Unix ms of the last completed attempt; null when never attempted. */
  lastRefreshAt: number | null;
  /** True while this record is queued for a background refresh. */
  pendingRefresh: boolean;
  /** Consecutive failed attempts this cycle; cleared once an attempt lands. */
  attempts: number;
  /**
   * How to look this email up. The cache key is the email (a GitHub avatar is
   * account-level, so a hit in one repo serves every other), but the API call
   * needs a repo and a commit hash authored by that email. Capturing the recipe
   * lets the queue keep draining after the user switches repos.
   */
  owner: string;
  repo: string;
  /**
   * Candidate commits to look this author up by, first one next. More than one
   * because GitHub only knows commits that have been **pushed** — asking about a
   * local-only commit answers 422, which says nothing about the author. Trying
   * the oldest sighting before the newest makes a pushed commit far more likely
   * on the first attempt.
   */
  hashes: string[];
  /** Unix ms this email was last seen in a loaded commit batch; drives eviction. */
  lastSeenAt: number;
}

export type AvatarCache = Record<string, AvatarCacheRecord>;

/** What a single lookup attempt learned. */
export type AvatarLookupOutcome =
  /** GitHub returned an avatar for the commit's author. */
  | { kind: 'found'; avatarUrl: string }
  /** GitHub answered, but the commit author is not linked to any account. */
  | { kind: 'noAccount' }
  /**
   * The repo or commit is not there: 404 (no repo, or no access) or 422 (the
   * commit is not on GitHub, typically because it was never pushed). Says
   * nothing about the author, so the next candidate commit is worth trying.
   */
  | { kind: 'notFound' }
  /** Transport failure: offline, DNS, timeout. */
  | { kind: 'networkError' }
  /** Rate limited. Never the record's fault, so it costs no attempt. */
  | { kind: 'rateLimited'; resetAt: number | null };

/**
 * Delay between queue items. Deliberately a single constant: the queue is a
 * background trickle, and this is the one dial worth turning.
 */
export const AVATAR_REFRESH_INTERVAL_MS = 1000;

/** Consecutive transport/404 failures before a record waits out a full window. */
export const AVATAR_MAX_ATTEMPTS = 3;

/** Cache ceiling; least-recently-seen entries are dropped past this. */
export const AVATAR_CACHE_MAX_ENTRIES = 2000;

/**
 * Leave a little of the hourly budget for anything else on this machine or IP
 * rather than draining it to zero.
 */
export const AVATAR_RATE_LIMIT_RESERVE = 10;

export const MIN_AVATAR_REFRESH_DAYS = 1;
export const MAX_AVATAR_REFRESH_DAYS = 365;

const MS_PER_DAY = 86_400_000;

/** Clamp a user-supplied refresh window to the supported range. */
export function clampAvatarRefreshDays(days: number, fallback: number): number {
  if (!Number.isFinite(days)) return fallback;
  return Math.min(MAX_AVATAR_REFRESH_DAYS, Math.max(MIN_AVATAR_REFRESH_DAYS, Math.round(days)));
}

/**
 * Whether a record is due for a refresh. Expiry is derived from
 * `lastRefreshAt + refreshDays` at read time and never stored, so lowering the
 * setting immediately expires everything already cached.
 */
export function isAvatarRecordExpired(
  record: AvatarCacheRecord,
  refreshDays: number,
  now: number,
): boolean {
  if (record.lastRefreshAt === null) return true;
  return now - record.lastRefreshAt >= refreshDays * MS_PER_DAY;
}

/** Candidate commits kept per author. Two covers "oldest and newest in view". */
export const AVATAR_MAX_CANDIDATE_HASHES = 2;

/** A brand-new record for an email seen for the first time. */
export function createPendingRecord(
  recipe: { owner: string; repo: string; hashes: string[] },
  now: number,
): AvatarCacheRecord {
  return {
    avatarUrl: null,
    lastRefreshAt: null,
    pendingRefresh: true,
    attempts: 0,
    owner: recipe.owner,
    repo: recipe.repo,
    hashes: recipe.hashes.slice(0, AVATAR_MAX_CANDIDATE_HASHES),
    lastSeenAt: now,
  };
}

/**
 * Fold a lookup result into a record.
 *
 * `found` and `noAccount` are both definitive answers and close the cycle.
 * `notFound`/`networkError` retry a few times before giving up *for this cycle
 * only* — the record still returns after the refresh window. `rateLimited`
 * leaves the record untouched and still queued; the queue pauses instead.
 *
 * An existing avatar URL is never cleared by a failure, so a stale picture keeps
 * showing rather than blanking out while we retry.
 */
export function applyAvatarLookupOutcome(
  record: AvatarCacheRecord,
  outcome: AvatarLookupOutcome,
  now: number,
): AvatarCacheRecord {
  switch (outcome.kind) {
    case 'found':
      return { ...record, avatarUrl: outcome.avatarUrl, lastRefreshAt: now, pendingRefresh: false, attempts: 0 };

    case 'noAccount':
      return { ...record, avatarUrl: null, lastRefreshAt: now, pendingRefresh: false, attempts: 0 };

    case 'rateLimited':
      // Not this record's failure — stay queued, keep the attempt budget intact.
      return record;

    case 'notFound': {
      // The candidate commit is not on GitHub (unpushed, or no access). That is
      // a verdict on the commit, not the author, so move to the next candidate
      // rather than spending one of the record's retries.
      const hashes = record.hashes.slice(1);
      if (hashes.length > 0) {
        return { ...record, hashes, pendingRefresh: true };
      }
      // Out of candidates: wait for the refresh window, by which point a later
      // load may well have supplied pushed commits to try.
      return { ...record, hashes, lastRefreshAt: now, pendingRefresh: false, attempts: 0 };
    }

    case 'networkError': {
      const attempts = record.attempts + 1;
      if (attempts >= AVATAR_MAX_ATTEMPTS) {
        // Give up for now; the refresh window brings it back on its own.
        return { ...record, lastRefreshAt: now, pendingRefresh: false, attempts: 0 };
      }
      return { ...record, attempts, pendingRefresh: true };
    }
  }
}

/**
 * Refresh priority, lowest first.
 *
 * 0 — never looked up: the row shows initials, so this is a visible gap.
 * 1 — looked up, no account, now expired: also a visible gap, but we already
 *     know it is likely to stay empty, so it yields to genuinely new emails.
 * 2 — has an avatar, just stale: something is already on screen.
 */
export function avatarRefreshTier(record: AvatarCacheRecord): 0 | 1 | 2 {
  if (record.avatarUrl !== null) return 2;
  return record.lastRefreshAt === null ? 0 : 1;
}

/**
 * Queue order: visible gaps before stale pictures, and within a tier the most
 * recently seen author first — which is the top of the graph, where the user is
 * actually looking.
 */
export function compareAvatarRefreshPriority(a: AvatarCacheRecord, b: AvatarCacheRecord): number {
  const tierDelta = avatarRefreshTier(a) - avatarRefreshTier(b);
  if (tierDelta !== 0) return tierDelta;
  return b.lastSeenAt - a.lastSeenAt;
}

/**
 * Select the emails due for a refresh, in the order the queue should take them.
 * A record already marked `pendingRefresh` stays selected even if it is not yet
 * expired — that flag means an earlier pass queued it and it has not landed.
 */
export function selectAvatarRefreshQueue(
  cache: AvatarCache,
  refreshDays: number,
  now: number,
): string[] {
  const due: Array<{ email: string; record: AvatarCacheRecord }> = [];
  for (const [email, record] of Object.entries(cache)) {
    if (record.pendingRefresh || isAvatarRecordExpired(record, refreshDays, now)) {
      due.push({ email, record });
    }
  }
  due.sort((a, b) => compareAvatarRefreshPriority(a.record, b.record));
  return due.map((entry) => entry.email);
}

/**
 * Drop least-recently-seen entries once the cache exceeds `maxEntries`.
 * Returns the same object when nothing needs evicting so callers can skip a write.
 */
export function evictLeastRecentlySeen(cache: AvatarCache, maxEntries: number): AvatarCache {
  const emails = Object.keys(cache);
  if (emails.length <= maxEntries) return cache;

  const keep = emails
    .sort((a, b) => cache[b].lastSeenAt - cache[a].lastSeenAt)
    .slice(0, maxEntries);

  const next: AvatarCache = {};
  for (const email of keep) next[email] = cache[email];
  return next;
}
