import { describe, expect, it } from 'vitest';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';

describe('WebviewRuntime', () => {
  it('increments fetch generation for repo navigation', () => {
    const runtime = new WebviewRuntime('/repo-a');

    expect(runtime.beginNavigation()).toBe(1);
    expect(runtime.beginNavigation()).toBe(2);
    expect(runtime.fetchGeneration).toBe(2);
  });

  it('resets repo-scoped state when services are rebound', () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.initialLoadSent = true;
    runtime.lastCommitFingerprint = 'fingerprint';
    runtime.currentFilters = { branches: ['main'], maxCount: 250 };

    runtime.resetRepoScopedState('/repo-b');

    expect(runtime.currentRepoPath).toBe('/repo-b');
    expect(runtime.initialLoadSent).toBe(false);
    expect(runtime.lastCommitFingerprint).toBe('');
    expect(runtime.currentFilters).toEqual({ branches: ['main'], maxCount: 250 });
  });

  it('clears branch filters while preserving maxCount', () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = {
      branches: ['feature'],
      author: 'Alice',
      authors: ['Alice'],
      maxCount: 250,
    };

    runtime.clearBranchFilters();

    expect(runtime.currentFilters).toEqual({ maxCount: 250 });
  });
});
