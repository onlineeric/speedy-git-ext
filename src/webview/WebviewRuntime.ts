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
  /** Held across checkout, optional stash/pull, and the resulting refresh. */
  branchCheckoutInProgress = false;
  /**
   * The controller for the amend currently in flight, if any.
   *
   * Here for the same reason the compare controller is: `cancelAmend` arrives as
   * its own message, so the thing it cancels has to outlive the dispatch that
   * started it. Only one amend can be running — the dialog is modal and there is
   * only one HEAD.
   */
  activeAmendController: AbortController | null = null;

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
