import type { CompareMode, GraphFilters, SlotValue } from '../../shared/types.js';
import type { GitVersion } from '../../shared/gitVersion.js';

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
   * The controller for the commit currently in flight — an amend or a fixup
   * commit — if any.
   *
   * Here for the same reason the compare controller is: `cancelCommitWait`
   * arrives as its own message, so the thing it cancels has to outlive the
   * dispatch that started it. One field serves both flows:
   * their dialogs are modal and only one commit can be written at a time.
   */
  activeCommitController: AbortController | null = null;
  /**
   * The installed git's version, read at most once per panel and only when a
   * feature asks — never on the commit-load path. The binary does not change
   * per repo, so repo switches keep it. `undefined` means not read yet; the
   * promise is cached so concurrent askers share one read.
   */
  gitVersion: Promise<GitVersion | null> | undefined = undefined;

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
