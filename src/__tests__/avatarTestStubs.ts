import { vi } from 'vitest';
import type { AvatarCacheStore } from '../services/AvatarCacheStore.js';
import type { AvatarRefreshQueue } from '../services/AvatarRefreshQueue.js';

/**
 * Inert avatar dependencies for tests that exercise unrelated RepoDataLoader
 * behaviour. `touch` reports nothing due, so no background work is started.
 */
export function createAvatarCacheStub(): AvatarCacheStore {
  return {
    get: vi.fn(() => undefined),
    touch: vi.fn(() => []),
    update: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } as unknown as AvatarCacheStore;
}

export function createAvatarQueueStub(): AvatarRefreshQueue {
  return {
    enqueue: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AvatarRefreshQueue;
}
