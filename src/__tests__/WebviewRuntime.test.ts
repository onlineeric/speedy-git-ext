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

describe('WebviewRuntime per-tab repository state', () => {
  it('seeds the top-level repo from the repo the tab opened on', () => {
    const runtime = new WebviewRuntime('/repos/a');
    expect(runtime.topLevelRepoPath).toBe('/repos/a');
    expect(runtime.currentRepoPath).toBe('/repos/a');
  });

  it('keeps the top-level repo while the displayed repo moves into a submodule', () => {
    const runtime = new WebviewRuntime('/repos/a');

    runtime.resetRepoScopedState('/repos/a/sub');

    expect(runtime.currentRepoPath).toBe('/repos/a/sub');
    expect(runtime.topLevelRepoPath).toBe('/repos/a');
  });

  it('starts with an empty submodule stack and no navigation in flight', () => {
    const runtime = new WebviewRuntime('/repos/a');
    expect(runtime.submoduleStack).toEqual([]);
    expect(runtime.submoduleNavigating).toBe(false);
  });

  it('starts with no resolved identity — the tab routes to nothing until one is resolved', () => {
    expect(new WebviewRuntime('/repos/a').identity).toBeNull();
  });

  it('holds an identity once one is resolved', () => {
    const runtime = new WebviewRuntime('/repos/a');
    runtime.identity = {
      repoPath: '/repos/a',
      gitDir: '/repos/a/.git',
      commonGitDir: '/repos/a/.git',
      topLevel: '/repos/a',
    };
    expect(runtime.identity.gitDir).toBe('/repos/a/.git');
  });
});
