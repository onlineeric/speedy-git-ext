import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';

describe('GitServiceRegistry', () => {
  it('returns the current service set and replaces it atomically', () => {
    const initial = {
      gitLogService: { getAuthors: vi.fn() },
      gitDiffService: { getCommitDetails: vi.fn() },
    };
    const next = {
      gitLogService: { getAuthors: vi.fn() },
      gitDiffService: { getCommitDetails: vi.fn() },
    };
    const registry = new GitServiceRegistry(initial as never);

    expect(registry.current()).toBe(initial);

    registry.update(next as never);

    expect(registry.current()).toBe(next);
    expect(registry.current().gitLogService).toBe(next.gitLogService);
    expect(registry.current().gitDiffService).toBe(next.gitDiffService);
  });
});
