import type { RequestMessage, ResponseMessage } from '@shared/messages';
import type { CherryPickOptions, InteractiveRebaseConfig, MergeOptions, PersistedUIState, PushForceMode, ResetMode, CommitParentInfo } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

class RpcClient {
  private vscode: ReturnType<typeof acquireVsCodeApi> | undefined;
  private initialized = false;
  private nextRequestId = 1;
  private pendingPushedChecks = new Map<string, { resolve: (pushed: boolean) => void; reject: (error: Error) => void }>();
  private pendingParentLookups = new Map<number, { resolve: (parents: CommitParentInfo[]) => void; reject: (error: Error) => void }>();
  private parentRequestIdByHash = new Map<string, number>();
  private pendingPush: { resolve: (message: string) => void; reject: (error: Error) => void } | null = null;

  private messageHandler = (event: MessageEvent) => {
    const message = event.data as ResponseMessage;
    this.handleMessage(message);
  };

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof acquireVsCodeApi !== 'undefined') {
      this.vscode = acquireVsCodeApi();
    }

    window.addEventListener('message', this.messageHandler);
  }

  dispose() {
    window.removeEventListener('message', this.messageHandler);
    this.initialized = false;
    this.rejectPendingLookups('RPC client disposed');
  }

  private handleMessage(message: ResponseMessage) {
    const store = useGraphStore.getState();

    switch (message.type) {
      case 'commits':
        store.setCommits(message.payload.commits);
        if (message.payload.totalLoadedWithoutFilter !== undefined) {
          store.setTotalLoadedWithoutFilter(message.payload.totalLoadedWithoutFilter);
        }
        store.setIsLoadingRepo(false);
        this.firePrefetch();
        break;
      case 'commitsAppended': {
        if (message.payload.generation !== store.fetchGeneration) break;
        store.appendCommits(message.payload.commits, message.payload.totalLoadedWithoutFilter);
        store.setHasMore(message.payload.hasMore);
        store.setPrefetching(false);
        // Catch-up is handled by GraphContainer's useEffect which re-runs when
        // lastBatchStartIndex or prefetching changes.
        break;
      }
      case 'repoList':
        store.setRepos(message.payload.repos, message.payload.activeRepoPath);
        break;
      case 'settingsData':
        store.setUserSettings(message.payload.settings);
        break;
      case 'branches':
        store.setBranches(message.payload.branches);
        break;
      case 'commitDetails':
        store.setCommitDetails(message.payload.details);
        break;
      case 'loading':
        store.setLoading(message.payload.loading);
        break;
      case 'error':
        store.setError(message.payload.error.message);
        this.rejectPendingLookups(message.payload.error.message);
        break;
      case 'prefetchError':
        store.setError(message.payload.error.message);
        store.setPrefetching(false);
        break;
      case 'success':
        store.setSuccessMessage(message.payload.message);
        break;
      case 'pushResult':
        if (this.pendingPush) {
          if (message.payload.success) {
            store.setSuccessMessage(message.payload.message);
            this.pendingPush.resolve(message.payload.message);
          } else {
            store.setError(message.payload.message);
            this.pendingPush.reject(new Error(message.payload.message));
          }
          this.pendingPush = null;
        }
        break;
      case 'remotes':
        store.setRemotes(message.payload.remotes);
        break;
      case 'stashes':
        store.setStashes(message.payload.stashes);
        break;
      case 'submodulesData':
        store.setSubmodules(message.payload.submodules, message.payload.stack);
        break;
      case 'submoduleOperationResult':
        if (message.payload.success) {
          store.setSuccessMessage('Submodule operation completed');
        } else {
          store.setError(message.payload.error ?? 'Submodule operation failed');
        }
        break;
      case 'cherryPickState':
        store.setCherryPickInProgress(message.payload.state === 'in-progress');
        break;
      case 'revertState':
        store.setRevertInProgress(message.payload.state === 'in-progress');
        break;
      case 'rebaseState':
        store.setLoading(false);
        store.setRebaseInProgress(message.payload.state === 'in-progress');
        store.setRebaseConflictInfo(message.payload.conflictInfo);
        break;
      case 'rebaseCommits':
        store.setPendingRebaseEntries(message.payload.entries);
        break;
      case 'signatureInfo':
        store.setSignatureInfo(message.payload.hash, message.payload.signature);
        break;
      case 'commitPushedResult': {
        const pending = this.pendingPushedChecks.get(message.payload.hash);
        if (pending) {
          pending.resolve(message.payload.pushed);
          this.pendingPushedChecks.delete(message.payload.hash);
        }
        break;
      }
      case 'containingBranches':
        store.setContainingBranches(message.payload.hash, {
          branches: message.payload.branches,
          status: message.payload.status,
        });
        break;
      case 'worktreeList':
        store.setWorktreeList(message.payload.worktrees);
        break;
      case 'commitParents': {
        const lookupKey = message.payload.parents.map((parent) => parent.hash).join(',');
        const requestId = this.parentRequestIdByHash.get(lookupKey);
        if (requestId !== undefined) {
          const pending = this.pendingParentLookups.get(requestId);
          if (pending) {
            pending.resolve(message.payload.parents);
            this.pendingParentLookups.delete(requestId);
          }
          this.parentRequestIdByHash.delete(lookupKey);
        }
        break;
      }
      case 'checkoutNeedsStash':
        store.setPendingCheckout({ name: message.payload.name, pull: message.payload.pull });
        break;
      case 'checkoutCommitNeedsStash':
        store.setPendingCommitCheckout({ hash: message.payload.hash });
        break;
      case 'deleteBranchNeedsForce':
        store.setPendingForceDeleteBranch({ name: message.payload.name, deleteRemote: message.payload.deleteRemote });
        break;
      case 'checkoutPullFailed':
        store.setError(`Checked out '${message.payload.branch}'. Pull failed: ${message.payload.error.message}`);
        break;
      case 'avatarUrls':
        store.setGitHubAvatarUrls(message.payload.urls);
        break;
      case 'persistedUIState':
        store.hydratePersistedUIState(message.payload.uiState);
        break;
    }
  }

  send(message: RequestMessage) {
    this.vscode?.postMessage(message);
  }

  getCommits(filters?: Partial<{ branches?: string[]; author?: string; maxCount: number }>) {
    this.send({ type: 'getCommits', payload: { filters } });
  }

  getBranches() {
    this.send({ type: 'getBranches', payload: {} });
  }

  getCommitDetails(hash: string) {
    this.send({ type: 'getCommitDetails', payload: { hash } });
  }

  checkoutBranch(name: string, remote?: string) {
    this.send({ type: 'checkoutBranch', payload: { name, remote } });
  }

  checkoutCommit(hash: string) {
    this.send({ type: 'checkoutCommit', payload: { hash } });
  }

  fetch(remote?: string, prune?: boolean, filters?: Partial<{ branches?: string[]; author?: string; maxCount: number }>) {
    this.send({ type: 'fetch', payload: { remote, prune, filters } });
  }

  copyToClipboard(text: string) {
    this.send({ type: 'copyToClipboard', payload: { text } });
  }

  openDiff(hash: string, filePath: string, parentHash?: string) {
    this.send({ type: 'openDiff', payload: { hash, filePath, parentHash } });
  }

  openFile(hash: string, filePath: string) {
    this.send({ type: 'openFile', payload: { hash, filePath } });
  }

  openCurrentFile(filePath: string) {
    this.send({ type: 'openCurrentFile', payload: { filePath } });
  }

  refresh(filters?: Partial<{ branches?: string[]; author?: string; maxCount: number }>) {
    this.send({ type: 'refresh', payload: { filters } });
  }

  // Branch ops
  createBranch(name: string, startPoint?: string) {
    this.send({ type: 'createBranch', payload: { name, startPoint } });
  }

  renameBranch(oldName: string, newName: string) {
    this.send({ type: 'renameBranch', payload: { oldName, newName } });
  }

  deleteBranch(name: string, force?: boolean, deleteRemote?: { remote: string; name: string }) {
    this.send({ type: 'deleteBranch', payload: { name, force, deleteRemote } });
  }

  deleteRemoteBranch(remote: string, name: string) {
    this.send({ type: 'deleteRemoteBranch', payload: { remote, name } });
  }

  mergeBranch(branch: string, options?: MergeOptions) {
    this.send({
      type: 'mergeBranch',
      payload: {
        branch,
        noFastForward: options?.noFastForward,
        noCommit: options?.noCommit,
        squash: options?.squash,
      },
    });
  }

  checkoutBranchWithPull(name: string, pull: boolean) {
    this.send({ type: 'checkoutBranch', payload: { name, pull } });
  }

  stashAndCheckout(name: string, pull?: boolean) {
    this.send({ type: 'stashAndCheckout', payload: { name, pull } });
  }

  stashAndCheckoutCommit(hash: string) {
    this.send({ type: 'stashAndCheckoutCommit', payload: { hash } });
  }

  // Remote ops
  pushAsync(remote: string, branch: string, setUpstream?: boolean, forceMode?: PushForceMode): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pendingPush = { resolve, reject };
      this.send({ type: 'push', payload: { remote, branch, setUpstream, forceMode } });
    });
  }

  pull(remote?: string, branch?: string, rebase?: boolean) {
    this.send({ type: 'pull', payload: { remote, branch, rebase } });
  }

  getRemotes() {
    this.send({ type: 'getRemotes', payload: {} });
  }

  addRemote(name: string, url: string) {
    this.send({ type: 'addRemote', payload: { name, url } });
  }

  removeRemote(name: string) {
    this.send({ type: 'removeRemote', payload: { name } });
  }

  editRemote(name: string, newUrl: string) {
    this.send({ type: 'editRemote', payload: { name, newUrl } });
  }

  // Tag ops
  createTag(name: string, hash: string, message?: string) {
    this.send({ type: 'createTag', payload: { name, hash, message } });
  }

  deleteTag(name: string) {
    this.send({ type: 'deleteTag', payload: { name } });
  }

  pushTag(name: string, remote?: string) {
    this.send({ type: 'pushTag', payload: { name, remote } });
  }

  // Stash ops
  getStashes() {
    this.send({ type: 'getStashes', payload: {} });
  }

  applyStash(index: number) {
    this.send({ type: 'applyStash', payload: { index } });
  }

  popStash(index: number) {
    this.send({ type: 'popStash', payload: { index } });
  }

  dropStash(index: number) {
    this.send({ type: 'dropStash', payload: { index } });
  }

  // History ops
  resetBranch(hash: string, mode: ResetMode) {
    this.send({ type: 'resetBranch', payload: { hash, mode } });
  }

  // Cherry-pick ops
  cherryPick(hashes: string[], options: CherryPickOptions) {
    this.send({ type: 'cherryPick', payload: { hashes, options } });
  }

  abortCherryPick() {
    this.send({ type: 'abortCherryPick', payload: {} });
  }

  continueCherryPick() {
    this.send({ type: 'continueCherryPick', payload: {} });
  }

  revert(hash: string, mainlineParent?: number) {
    this.send({ type: 'revert', payload: { hash, mainlineParent } });
  }

  continueRevert() {
    this.send({ type: 'continueRevert', payload: {} });
  }

  abortRevert() {
    this.send({ type: 'abortRevert', payload: {} });
  }

  // Rebase ops
  rebase(targetRef: string, ignoreDate?: boolean) {
    this.send({ type: 'rebase', payload: { targetRef, ignoreDate } });
  }

  getRebaseCommits(baseHash: string) {
    this.send({ type: 'getRebaseCommits', payload: { baseHash } });
  }

  interactiveRebase(config: InteractiveRebaseConfig) {
    this.send({ type: 'interactiveRebase', payload: { config } });
  }

  abortRebase() {
    this.send({ type: 'abortRebase', payload: {} });
  }

  continueRebase() {
    this.send({ type: 'continueRebase', payload: {} });
  }

  getSignatureInfo(hash: string) {
    useGraphStore.getState().setSignatureLoading(hash, true);
    this.send({ type: 'getSignatureInfo', payload: { hash } });
  }

  dropCommit(hash: string) {
    this.send({ type: 'dropCommit', payload: { hash } });
  }

  isCommitPushed(hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.pendingPushedChecks.set(hash, { resolve, reject });
      this.send({ type: 'isCommitPushed', payload: { hash } });
    });
  }

  getCommitParents(hashes: string[]): Promise<CommitParentInfo[]> {
    const requestId = this.nextRequestId++;
    // Also map by original hashes so the response can find this request
    const originalKey = hashes.join(',');
    return new Promise((resolve, reject) => {
      this.pendingParentLookups.set(requestId, { resolve, reject });
      this.parentRequestIdByHash.set(originalKey, requestId);
      this.send({ type: 'getCommitParents', payload: { hashes } });
    });
  }

  private rejectPendingLookups(message: string) {
    const error = new Error(message);

    for (const pending of this.pendingPushedChecks.values()) {
      pending.reject(error);
    }
    this.pendingPushedChecks.clear();

    for (const pending of this.pendingParentLookups.values()) {
      pending.reject(error);
    }
    this.pendingParentLookups.clear();
    this.parentRequestIdByHash.clear();
  }

  // UI state persistence
  persistUIState(uiState: Partial<Omit<PersistedUIState, 'version'>>) {
    this.send({ type: 'updatePersistedUIState', payload: { uiState } });
  }

  // Settings
  openSettings() {
    this.send({ type: 'openSettings', payload: {} });
  }

  getSettings() {
    this.send({ type: 'getSettings', payload: {} });
  }

  getSubmodules() {
    this.send({ type: 'getSubmodules', payload: {} });
  }

  openSubmodule(submodulePath: string) {
    this.send({ type: 'openSubmodule', payload: { submodulePath } });
  }

  backToParentRepo() {
    this.send({ type: 'backToParentRepo', payload: {} });
  }

  updateSubmodule(submodulePath: string) {
    this.send({ type: 'updateSubmodule', payload: { submodulePath } });
  }

  initSubmodule(submodulePath: string) {
    this.send({ type: 'initSubmodule', payload: { submodulePath } });
  }

  // Worktree ops
  getWorktreeList() {
    this.send({ type: 'getWorktreeList', payload: {} });
  }

  // Containing branches
  getContainingBranches(hash: string) {
    this.send({ type: 'getContainingBranches', payload: { hash } });
  }

  // External browser
  openExternal(url: string) {
    this.send({ type: 'openExternal', payload: { url } });
  }

  // Pagination
  loadMoreCommits(skip: number, generation: number, filters: { branches?: string[]; author?: string }) {
    this.send({ type: 'loadMoreCommits', payload: { skip, generation, filters } });
  }

  firePrefetch() {
    const store = useGraphStore.getState();
    if (!store.hasMore || store.prefetching) return;
    store.setPrefetching(true);
    const { branches, author } = store.filters;
    this.loadMoreCommits(store.commits.length, store.fetchGeneration, { branches, author });
  }
}

export const rpcClient = new RpcClient();
