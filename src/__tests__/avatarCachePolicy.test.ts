import { describe, expect, it } from 'vitest';
import {
  AVATAR_CACHE_MAX_ENTRIES,
  AVATAR_MAX_ATTEMPTS,
  applyAvatarLookupOutcome,
  avatarRefreshTier,
  clampAvatarRefreshDays,
  compareAvatarRefreshPriority,
  createPendingRecord,
  evictLeastRecentlySeen,
  isAvatarRecordExpired,
  selectAvatarRefreshQueue,
  type AvatarCache,
  type AvatarCacheRecord,
} from '../services/avatarCachePolicy.js';

const NOW = 1_700_000_000_000;
const MS_PER_DAY = 86_400_000;

function record(overrides: Partial<AvatarCacheRecord> = {}): AvatarCacheRecord {
  return {
    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    lastRefreshAt: NOW,
    pendingRefresh: false,
    attempts: 0,
    owner: 'acme',
    repo: 'app',
    hashes: ['abc123'],
    lastSeenAt: NOW,
    ...overrides,
  };
}

describe('clampAvatarRefreshDays', () => {
  it('keeps values inside the supported range', () => {
    expect(clampAvatarRefreshDays(30, 30)).toBe(30);
    expect(clampAvatarRefreshDays(1, 30)).toBe(1);
    expect(clampAvatarRefreshDays(365, 30)).toBe(365);
  });

  it('clamps out-of-range values instead of rejecting them', () => {
    expect(clampAvatarRefreshDays(0, 30)).toBe(1);
    expect(clampAvatarRefreshDays(-5, 30)).toBe(1);
    expect(clampAvatarRefreshDays(10_000, 30)).toBe(365);
  });

  it('rounds fractional days and falls back on non-finite input', () => {
    expect(clampAvatarRefreshDays(7.4, 30)).toBe(7);
    expect(clampAvatarRefreshDays(Number.NaN, 30)).toBe(30);
    expect(clampAvatarRefreshDays(Number.POSITIVE_INFINITY, 30)).toBe(30);
  });
});

describe('isAvatarRecordExpired', () => {
  it('treats a never-attempted record as expired', () => {
    expect(isAvatarRecordExpired(record({ lastRefreshAt: null }), 30, NOW)).toBe(true);
  });

  it('is fresh inside the window and expired at the boundary', () => {
    const stamped = record({ lastRefreshAt: NOW });
    expect(isAvatarRecordExpired(stamped, 30, NOW + 29 * MS_PER_DAY)).toBe(false);
    expect(isAvatarRecordExpired(stamped, 30, NOW + 30 * MS_PER_DAY)).toBe(true);
  });

  it('derives expiry at read time so a shorter window applies retroactively', () => {
    // Cached 10 days ago: fresh under a 30-day window, stale under a 7-day one.
    const stamped = record({ lastRefreshAt: NOW - 10 * MS_PER_DAY });
    expect(isAvatarRecordExpired(stamped, 30, NOW)).toBe(false);
    expect(isAvatarRecordExpired(stamped, 7, NOW)).toBe(true);
  });
});

describe('applyAvatarLookupOutcome', () => {
  it('stores the URL and closes the cycle on success', () => {
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true, attempts: 2 }),
      { kind: 'found', avatarUrl: 'https://avatars.githubusercontent.com/u/9?v=4' },
      NOW,
    );

    expect(next.avatarUrl).toBe('https://avatars.githubusercontent.com/u/9?v=4');
    expect(next.lastRefreshAt).toBe(NOW);
    expect(next.pendingRefresh).toBe(false);
    expect(next.attempts).toBe(0);
  });

  it('records "no GitHub account" as a definitive answer, not a failure', () => {
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true }),
      { kind: 'noAccount' },
      NOW,
    );

    expect(next.avatarUrl).toBeNull();
    expect(next.lastRefreshAt).toBe(NOW);
    expect(next.pendingRefresh).toBe(false);
    expect(next.attempts).toBe(0);
  });

  it('retries transport failures a few times before waiting out the window', () => {
    let current = record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true });

    for (let attempt = 1; attempt < AVATAR_MAX_ATTEMPTS; attempt += 1) {
      current = applyAvatarLookupOutcome(current, { kind: 'networkError' }, NOW);
      expect(current.attempts).toBe(attempt);
      expect(current.pendingRefresh).toBe(true);
      expect(current.lastRefreshAt).toBeNull();
    }

    current = applyAvatarLookupOutcome(current, { kind: 'networkError' }, NOW);
    expect(current.pendingRefresh).toBe(false);
    expect(current.attempts).toBe(0);
    expect(current.lastRefreshAt).toBe(NOW);
  });

  it('advances to the next candidate commit on notFound without spending a retry', () => {
    // GitHub answers 404/422 for a commit it does not have (typically unpushed),
    // which says nothing about the author — so try the next candidate instead.
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true, hashes: ['unpushed', 'pushed'] }),
      { kind: 'notFound' },
      NOW,
    );

    expect(next.hashes).toEqual(['pushed']);
    expect(next.attempts).toBe(0);
    expect(next.pendingRefresh).toBe(true);
    expect(next.lastRefreshAt).toBeNull();
  });

  it('waits out the window once every candidate commit is exhausted', () => {
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true, hashes: ['only'] }),
      { kind: 'notFound' },
      NOW,
    );

    expect(next.hashes).toEqual([]);
    expect(next.pendingRefresh).toBe(false);
    expect(next.lastRefreshAt).toBe(NOW);
  });

  it('leaves the record untouched when rate limited so no attempt is burned', () => {
    const before = record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true, attempts: 1 });
    const next = applyAvatarLookupOutcome(before, { kind: 'rateLimited', resetAt: NOW + 60_000 }, NOW);
    expect(next).toEqual(before);
  });

  it('keeps a stale avatar visible while a refresh keeps failing', () => {
    const stale = record({ avatarUrl: 'https://avatars.githubusercontent.com/u/4?v=4', pendingRefresh: true });
    let current = stale;
    for (let i = 0; i < AVATAR_MAX_ATTEMPTS; i += 1) {
      current = applyAvatarLookupOutcome(current, { kind: 'networkError' }, NOW);
    }
    expect(current.avatarUrl).toBe('https://avatars.githubusercontent.com/u/4?v=4');
  });

  it('re-queues a given-up record once the next window elapses', () => {
    let current = record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true });
    for (let i = 0; i < AVATAR_MAX_ATTEMPTS; i += 1) {
      current = applyAvatarLookupOutcome(current, { kind: 'networkError' }, NOW);
    }

    expect(isAvatarRecordExpired(current, 30, NOW + 29 * MS_PER_DAY)).toBe(false);
    expect(isAvatarRecordExpired(current, 30, NOW + 31 * MS_PER_DAY)).toBe(true);
  });
});

describe('avatarRefreshTier / compareAvatarRefreshPriority', () => {
  it('ranks never-looked-up above known-empty above merely stale', () => {
    expect(avatarRefreshTier(record({ avatarUrl: null, lastRefreshAt: null }))).toBe(0);
    expect(avatarRefreshTier(record({ avatarUrl: null, lastRefreshAt: NOW }))).toBe(1);
    expect(avatarRefreshTier(record({ avatarUrl: 'https://example.test/a.png' }))).toBe(2);
  });

  it('breaks ties by most recently seen', () => {
    const older = record({ avatarUrl: null, lastRefreshAt: null, lastSeenAt: NOW - 5_000 });
    const newer = record({ avatarUrl: null, lastRefreshAt: null, lastSeenAt: NOW });
    expect(compareAvatarRefreshPriority(newer, older)).toBeLessThan(0);
  });

  it('puts a visible gap ahead of a stale picture even if the gap is older', () => {
    const staleButRecent = record({ lastSeenAt: NOW });
    const gapButOld = record({ avatarUrl: null, lastRefreshAt: null, lastSeenAt: NOW - 100_000 });
    expect(compareAvatarRefreshPriority(gapButOld, staleButRecent)).toBeLessThan(0);
  });
});

describe('selectAvatarRefreshQueue', () => {
  it('returns due records in priority order and skips fresh ones', () => {
    const cache: AvatarCache = {
      'fresh@test.dev': record({ lastRefreshAt: NOW, lastSeenAt: NOW }),
      'stale@test.dev': record({ lastRefreshAt: NOW - 40 * MS_PER_DAY, lastSeenAt: NOW }),
      'new@test.dev': record({ avatarUrl: null, lastRefreshAt: null, pendingRefresh: true, lastSeenAt: NOW - 1_000 }),
      'empty@test.dev': record({ avatarUrl: null, lastRefreshAt: NOW - 40 * MS_PER_DAY, lastSeenAt: NOW }),
    };

    expect(selectAvatarRefreshQueue(cache, 30, NOW)).toEqual([
      'new@test.dev',
      'empty@test.dev',
      'stale@test.dev',
    ]);
  });

  it('keeps an unlanded pending record queued even when it is not expired', () => {
    const cache: AvatarCache = {
      'pending@test.dev': record({ lastRefreshAt: NOW, pendingRefresh: true }),
    };
    expect(selectAvatarRefreshQueue(cache, 30, NOW)).toEqual(['pending@test.dev']);
  });

  it('returns nothing when every record is fresh', () => {
    const cache: AvatarCache = { 'a@test.dev': record(), 'b@test.dev': record() };
    expect(selectAvatarRefreshQueue(cache, 30, NOW)).toEqual([]);
  });
});

describe('evictLeastRecentlySeen', () => {
  it('returns the same object when under the cap so callers can skip a write', () => {
    const cache: AvatarCache = { 'a@test.dev': record() };
    expect(evictLeastRecentlySeen(cache, AVATAR_CACHE_MAX_ENTRIES)).toBe(cache);
  });

  it('drops the least recently seen entries first', () => {
    const cache: AvatarCache = {
      'old@test.dev': record({ lastSeenAt: NOW - 10_000 }),
      'mid@test.dev': record({ lastSeenAt: NOW - 5_000 }),
      'new@test.dev': record({ lastSeenAt: NOW }),
    };

    const evicted = evictLeastRecentlySeen(cache, 2);
    expect(Object.keys(evicted).sort()).toEqual(['mid@test.dev', 'new@test.dev']);
  });
});

describe('createPendingRecord', () => {
  it('starts queued with the lookup recipe attached', () => {
    const created = createPendingRecord({ owner: 'acme', repo: 'app', hashes: ['deadbeef'] }, NOW);
    expect(created).toEqual({
      avatarUrl: null,
      lastRefreshAt: null,
      pendingRefresh: true,
      attempts: 0,
      owner: 'acme',
      repo: 'app',
      hashes: ['deadbeef'],
      lastSeenAt: NOW,
    });
  });
});
