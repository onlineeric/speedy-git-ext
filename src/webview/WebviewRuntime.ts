import type { CompareMode, GraphFilters, SlotValue, SubmoduleNavEntry } from '../../shared/types.js';
import type { GitVersion } from '../../shared/gitVersion.js';
import type { RepoIdentity } from '../utils/repoIdentity.js';

export interface CompareRequestPayload {
  a: SlotValue;
  b: SlotValue;
  mode: CompareMode;
  requestId: string;
}

export class WebviewRuntime {
  /** Incremented on each repo switch to discard stale async responses. */
  fetchGeneration = 0;
  /**
   * The tab's selected repository, BEFORE any submodule navigation.
   *
   * `currentRepoPath` is "what is displayed"; this is "which repo is this a
   * graph for". The selector shows it, `Open New Graph Tab` seeds a new tab
   * with it, and SCM `openForRepo` matches against it — all three must keep
   * pointing at the top-level repo while the tab sits inside a submodule.
   */
  topLevelRepoPath: string;
  /** Where the tab came from, so "back to parent" can unwind one level at a time. */
  submoduleStack: SubmoduleNavEntry[] = [];
  submoduleNavigating = false;
  /**
   * Resolved for `currentRepoPath` after each repo change. Drives watcher
   * subscription and peer-busy mirroring; null when the path is not a git repo,
   * which simply means this tab routes to nothing.
   */
  identity: RepoIdentity | null = null;
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
   * dispatch that started it. One field serves both flows: their dialogs are
   * modal and only one commit at a time can be written *per tab*. Two tabs may
   * each have one in flight; serialising across them is not this field's job
   * (and is deliberately not done at all — git's index lock decides).
   */
  activeCommitController: AbortController | null = null;
  /**
   * The installed git's version, read at most once per panel and only when a
   * feature asks — never on the commit-load path. The binary does not change
   * per repo, so repo switches keep it. `undefined` means not read yet; the
   * promise is cached so concurrent askers share one read.
   */
  gitVersion: Promise<GitVersion | null> | undefined = undefined;

  constructor(public currentRepoPath: string) {
    this.topLevelRepoPath = currentRepoPath;
  }

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
