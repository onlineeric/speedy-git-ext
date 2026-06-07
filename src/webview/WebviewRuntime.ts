import type { CompareMode, GraphFilters, SlotValue } from '../../shared/types.js';

export interface CompareRequestPayload {
  a: SlotValue;
  b: SlotValue;
  mode: CompareMode;
  requestId: string;
}

export class WebviewRuntime {
  /** Incremented on each repo switch to discard stale async responses. */
  fetchGeneration = 0;
  currentFilters: Partial<GraphFilters> = {};
  isDisplayingSubmodule = false;
  initialLoadSent = false;
  lastCommitFingerprint = '';
  activeCompareController: { requestId: string; controller: AbortController } | null = null;

  constructor(public currentRepoPath: string) {}

  resetRepoScopedState(currentRepoPath: string): void {
    this.currentRepoPath = currentRepoPath;
    this.lastCommitFingerprint = '';
    this.initialLoadSent = false;
  }

  beginNavigation(): number {
    this.fetchGeneration += 1;
    return this.fetchGeneration;
  }

  clearBranchFilters(): void {
    this.currentFilters = { maxCount: this.currentFilters.maxCount };
  }
}
