import { describe, expect, it } from 'vitest';
import {
  AVATAR_CACHE_MAX_ENTRIES,
  applyAvatarLookupOutcome,
  avatarRefreshTier,
  clampAvatarRefreshDays,
  compareAvatarRefreshPriority,
  createPendingRecord,
  evictLeastRecentlySeen,
  isAvatarRecordExpired,
  toDayNumber,
  type AvatarCache,
  type AvatarCacheRecord,
} from '../services/avatarCachePolicy.js';

/** Day number roughly corresponding to 2026. */
const TODAY = 20_304;

function record(overrides: Partial<AvatarCacheRecord> = {}): AvatarCacheRecord {
  return {
    avatarUrl: 'https://avatars.githubusercontent.com/u/93807819?v=4',
    refreshedOn: TODAY,
    seenOn: TODAY,
    ...overrides,
  };
}

describe('record footprint', () => {
  it('stays small enough that a full cache fits the extension-state budget', () => {
    // VS Code warns past 512 KB for an extension's whole globalState, and the
    // UI state shares that blob. Guarding the per-record size here is what keeps
    // a future field addition from silently blowing the budget.
    const serialized = JSON.stringify({ 'firstname.lastname@somecompany.com': record() });
    expect(serialized.length).toBeLessThan(160);
    expect((serialized.length * AVATAR_CACHE_MAX_ENTRIES) / 1024).toBeLessThan(200);
  });
});

describe('avatar URL storage', () => {
  it('keeps whatever URL GitHub returned, verbatim', () => {
    // Deliberately not reduced to an account id and rebuilt from a template:
    // the URL format is GitHub's to change, and a template would then produce
    // wrong URLs for every cached record.
    const odd = 'https://avatars.githubusercontent.com/u/42?v=9&s=80';
    const next = applyAvatarLookupOutcome(createPendingRecord(TODAY), { kind: 'found', avatarUrl: odd }, TODAY);
    expect(next.avatarUrl).toBe(odd);
  });
});

describe('toDayNumber', () => {
  it('collapses a millisecond timestamp to whole days', () => {
    const day = toDayNumber(Date.UTC(2026, 7, 8, 13, 45));
    expect(day).toBe(Math.floor(Date.UTC(2026, 7, 8, 13, 45) / 86_400_000));
    // Same day, different time of day → same number.
    expect(toDayNumber(Date.UTC(2026, 7, 8, 1, 0))).toBe(day);
  });
});

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
  it('treats a never-looked-up record as expired', () => {
    expect(isAvatarRecordExpired(record({ refreshedOn: 0 }), 30, TODAY)).toBe(true);
  });

  it('is fresh inside the window and expired at the boundary', () => {
    const stamped = record({ refreshedOn: TODAY });
    expect(isAvatarRecordExpired(stamped, 30, TODAY + 29)).toBe(false);
    expect(isAvatarRecordExpired(stamped, 30, TODAY + 30)).toBe(true);
  });

  it('derives expiry at read time so a shorter window applies retroactively', () => {
    const stamped = record({ refreshedOn: TODAY - 10 });
    expect(isAvatarRecordExpired(stamped, 30, TODAY)).toBe(false);
    expect(isAvatarRecordExpired(stamped, 7, TODAY)).toBe(true);
  });
});

describe('applyAvatarLookupOutcome', () => {
  it('stores the URL and stamps the day on success', () => {
    const next = applyAvatarLookupOutcome(
      createPendingRecord(TODAY),
      { kind: 'found', avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4' },
      TODAY,
    );

    expect(next.avatarUrl).toBe('https://avatars.githubusercontent.com/u/42?v=4');
    expect(next.refreshedOn).toBe(TODAY);
  });

  it('records "no GitHub account" as a definitive answer and drops any stale URL', () => {
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: 'https://example.test/old.png', refreshedOn: 0 }),
      { kind: 'noAccount' },
      TODAY,
    );

    expect(next.avatarUrl).toBeNull();
    expect(next.refreshedOn).toBe(TODAY);
  });

  it('leaves the record untouched while candidate commits remain', () => {
    const before = record({ avatarUrl: null, refreshedOn: 0 });
    const next = applyAvatarLookupOutcome(before, { kind: 'notFound' }, TODAY, {
      candidatesExhausted: false,
    });
    // Still unstamped, so it stays expired and gets retried.
    expect(next).toEqual(before);
  });

  it('stamps only once every candidate commit is exhausted', () => {
    const next = applyAvatarLookupOutcome(
      record({ avatarUrl: null, refreshedOn: 0 }),
      { kind: 'notFound' },
      TODAY,
      { candidatesExhausted: true },
    );

    expect(next.refreshedOn).toBe(TODAY);
    expect(isAvatarRecordExpired(next, 30, TODAY + 29)).toBe(false);
    expect(isAvatarRecordExpired(next, 30, TODAY + 31)).toBe(true);
  });

  it('never stamps a transport failure, so being offline costs no refresh window', () => {
    const before = record({ avatarUrl: null, refreshedOn: 0 });
    expect(applyAvatarLookupOutcome(before, { kind: 'networkError' }, TODAY)).toEqual(before);
    // Still expired → the next load re-queues it. This is what removed the
    // need for a persisted retry counter.
    expect(isAvatarRecordExpired(before, 30, TODAY)).toBe(true);
  });

  it('leaves the record untouched when rate limited', () => {
    const before = record({ avatarUrl: null, refreshedOn: 0 });
    expect(applyAvatarLookupOutcome(before, { kind: 'rateLimited', resetAt: null }, TODAY)).toEqual(before);
  });

  it('keeps a stale avatar visible while a refresh keeps failing', () => {
    const stale = record({ avatarUrl: 'https://example.test/stale.png', refreshedOn: TODAY - 40 });
    const next = applyAvatarLookupOutcome(stale, { kind: 'networkError' }, TODAY);
    expect(next.avatarUrl).toBe('https://example.test/stale.png');
  });
});

describe('avatarRefreshTier / compareAvatarRefreshPriority', () => {
  it('ranks never-looked-up above known-empty above merely stale', () => {
    expect(avatarRefreshTier(record({ avatarUrl: null, refreshedOn: 0 }))).toBe(0);
    expect(avatarRefreshTier(record({ avatarUrl: null, refreshedOn: TODAY }))).toBe(1);
    expect(avatarRefreshTier(record())).toBe(2);
  });

  it('breaks ties by most recently seen', () => {
    const older = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY - 5 });
    const newer = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY });
    expect(compareAvatarRefreshPriority(newer, older)).toBeLessThan(0);
  });

  it('puts a visible gap ahead of a stale picture even if the gap is older', () => {
    const staleButRecent = record({ seenOn: TODAY });
    const gapButOld = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY - 100 });
    expect(compareAvatarRefreshPriority(gapButOld, staleButRecent)).toBeLessThan(0);
  });
});

describe('evictLeastRecentlySeen', () => {
  it('returns the same object when under the cap so callers can skip a write', () => {
    const cache: AvatarCache = { 'a@test.dev': record() };
    expect(evictLeastRecentlySeen(cache, AVATAR_CACHE_MAX_ENTRIES)).toBe(cache);
  });

  it('drops the least recently seen entries first', () => {
    const cache: AvatarCache = {
      'old@test.dev': record({ seenOn: TODAY - 10 }),
      'mid@test.dev': record({ seenOn: TODAY - 5 }),
      'new@test.dev': record({ seenOn: TODAY }),
    };

    expect(Object.keys(evictLeastRecentlySeen(cache, 2)).sort()).toEqual(['mid@test.dev', 'new@test.dev']);
  });
});

describe('createPendingRecord', () => {
  it('starts unresolved and unstamped, carrying no lookup recipe', () => {
    expect(createPendingRecord(TODAY)).toEqual({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY });
  });
});
