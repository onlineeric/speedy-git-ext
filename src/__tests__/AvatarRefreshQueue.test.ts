import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvatarRefreshQueue } from '../services/AvatarRefreshQueue.js';
import type { AvatarCacheStore } from '../services/AvatarCacheStore.js';
import type { GitHubAuthService } from '../services/GitHubAuthService.js';
import type { GitHubAvatarService } from '../services/GitHubAvatarService.js';
import type { AvatarLookupOutcome, AvatarCacheRecord } from '../services/avatarCachePolicy.js';

const RECORD: AvatarCacheRecord = { avatarUrl: null, refreshedOn: 0, seenOn: 20_000 };
const TASK = { email: 'dev@example.com', owner: 'o', repo: 'r', hashes: ['abcdef1234'] };

/** An avatar service whose rate-limit answer the test drives directly. */
function createAvatarServiceStub(resetAt: number) {
  const state = { limited: false };
  const lookup = vi.fn(
    async (): Promise<AvatarLookupOutcome> => ({ kind: 'found', avatarUrl: 'https://avatars/1.png' }),
  );
  // Retiring the budget is what un-parks the queue, so the stub models it as the
  // real service does rather than letting the test flip the flag behind its back.
  const resetRateLimit = vi.fn(() => { state.limited = false; });
  const service = {
    isRateLimited: () => state.limited,
    getRateLimit: () => ({ remaining: state.limited ? 0 : 60, resetAt: state.limited ? resetAt : null }),
    lookupCommitAuthorAvatar: lookup,
    resetRateLimit,
  } as unknown as GitHubAvatarService;
  return { service, state, lookup, resetRateLimit };
}

function createQueue(avatarService: GitHubAvatarService) {
  const onRateLimitChanged = vi.fn();
  const postAvatarUrls = vi.fn();
  const queue = new AvatarRefreshQueue({
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    cache: { get: () => RECORD, update: vi.fn() } as unknown as AvatarCacheStore,
    auth: { getToken: () => null } as unknown as GitHubAuthService,
    avatarService,
    postAvatarUrls,
    onRateLimitChanged,
    onLookupFailed: vi.fn(),
  });
  return { queue, onRateLimitChanged, postAvatarUrls };
}

describe('AvatarRefreshQueue rate-limit pause', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resumes immediately when the limit it parked on no longer applies', async () => {
    const resetAt = Date.now() + 60 * 60 * 1000;
    const { service, state, lookup, resetRateLimit } = createAvatarServiceStub(resetAt);
    const { queue, onRateLimitChanged } = createQueue(service);

    state.limited = true;
    queue.enqueue([TASK]);

    // Reaches the top of the loop, sees the spent budget and parks.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onRateLimitChanged).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();

    // Minutes pass and it stays parked — the pause runs to the reset time.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(lookup).not.toHaveBeenCalled();

    // Authorizing retires the tracked budget and wakes the queue in one call.
    queue.onIdentityChanged();
    expect(resetRateLimit).toHaveBeenCalledTimes(1);
    // The caller reports the new state itself, so the queue stays quiet rather
    // than making the webview render the same payload twice.
    expect(onRateLimitChanged).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(lookup).toHaveBeenCalledTimes(1);

    queue.dispose();
  });

  it('does not announce a change when it was never paused', async () => {
    const { service } = createAvatarServiceStub(Date.now() + 1000);
    const { queue, onRateLimitChanged } = createQueue(service);

    queue.enqueue([TASK]);
    await vi.advanceTimersByTimeAsync(1_000);
    queue.onIdentityChanged();

    expect(onRateLimitChanged).not.toHaveBeenCalled();
    queue.dispose();
  });
});
