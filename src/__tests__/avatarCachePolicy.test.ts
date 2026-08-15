import { describe, expect, it } from 'vitest';
import {
  AVATAR_CACHE_MAX_ENTRIES,
  applyAvatarLookupOutcome,
  avatarRefreshTier,
  buildAvatarLookupCandidates,
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

describe('queue ordering within a single load', () => {
  it('leaves same-day tasks tied, so a stable sort preserves arrival order', () => {
    // Everything queued from one load shares today's day number, so the
    // tie-break is deliberately 0 and newest-commit-first comes from the
    // caller's insertion order surviving a stable sort.
    const first = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY });
    const second = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY });
    expect(compareAvatarRefreshPriority(first, second)).toBe(0);

    const order = ['newest', 'middle', 'oldest'];
    const sorted = [...order].sort(() => compareAvatarRefreshPriority(first, second));
    expect(sorted).toEqual(order);
  });

  it('still prefers today over a task left over from an earlier day', () => {
    const today = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY });
    const yesterday = record({ avatarUrl: null, refreshedOn: 0, seenOn: TODAY - 1 });
    expect(compareAvatarRefreshPriority(today, yesterday)).toBeLessThan(0);
  });
});

describe('buildAvatarLookupCandidates', () => {
  // Commits arrive newest-first, as the graph loads them.
  const commit = (hash: string, authorEmail: string) => ({ hash, authorEmail });

  it('returns one candidate per author', () => {
    const candidates = buildAvatarLookupCandidates([
      commit('c3', 'a@example.com'),
      commit('c2', 'b@example.com'),
      commit('c1', 'a@example.com'),
    ]);
    expect(candidates.map((c) => c.email)).toEqual(['a@example.com', 'b@example.com']);
  });

  it('tries the oldest sighting first, because the newest may be unpushed', () => {
    const [candidate] = buildAvatarLookupCandidates([
      commit('newest', 'a@example.com'),
      commit('middle', 'a@example.com'),
      commit('oldest', 'a@example.com'),
    ]);
    expect(candidate.hashes).toEqual(['oldest', 'newest']);
  });

  it('lists a single hash when the author appears once', () => {
    const [candidate] = buildAvatarLookupCandidates([commit('only', 'a@example.com')]);
    expect(candidate.hashes).toEqual(['only']);
  });

  it('keys by lowercased email so case variants share one lookup', () => {
    const candidates = buildAvatarLookupCandidates([
      commit('newest', 'Alice@Example.com'),
      commit('oldest', 'alice@example.com'),
    ]);
    expect(candidates).toEqual([{ email: 'alice@example.com', hashes: ['oldest', 'newest'] }]);
  });

  it('skips commits with no author email, which cannot key the cache', () => {
    expect(buildAvatarLookupCandidates([commit('c1', '')])).toEqual([]);
  });

  it('returns nothing for an empty batch', () => {
    expect(buildAvatarLookupCandidates([])).toEqual([]);
  });
});
