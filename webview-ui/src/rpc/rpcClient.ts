import type { RequestMessage, ResponseMessage } from '@shared/messages';
import type { CherryPickOptions, CompareMode, InteractiveRebaseConfig, MergeOptions, PersistedUIState, PushForceMode, ResetMode, RevertOptions, SlotValue, CommitParentInfo, FileChangeStatus, WorktreeBranchMode, ToolbarBooleanSetting } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { decideHeadNavigation, HEAD_NAVIGATION_MESSAGES, MAX_GO_TO_HEAD_LOADS, type HeadNavigationDecision } from '../utils/headNavigation';

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
  /** One-shot slot for a `resolveWorktreePath` request awaiting its `worktreePathResolved` response. */
  private pendingWorktreePath: { requestId: number; resolve: (value: { path: string }) => void; reject: (error: Error) => void } | null = null;
  /** One-shot slot for a `getWorktreeEnvFiles` request awaiting its `worktreeEnvFiles` response. */
  private pendingWorktreeEnvFiles: {
    requestId: number;
    resolve: (value: { ignoredEnvFiles: string[]; envFilesPresent: boolean }) => void;
    reject: (error: Error) => void;
  } | null = null;
  /**
   * Promise slot for correlating a dialog-initiated git action with its
   * backend response. Used by FilePickerDialog to lift its `isRunning` busy
   * state on the actual response (success or error), not on an unrelated
   * store update. See `awaitNextDialogAction()`.
   */
  private pendingDialogAction: { resolve: () => void; reject: (error: string) => void } | null = null;

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
    if (this.pendingWorktreePath) {
      this.pendingWorktreePath.reject(new Error('RPC client disposed'));
      this.pendingWorktreePath = null;
    }
    if (this.pendingWorktreeEnvFiles) {
      this.pendingWorktreeEnvFiles.reject(new Error('RPC client disposed'));
      this.pendingWorktreeEnvFiles = null;
    }
    this.clearPendingDialogAction();
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
        // T034: re-run any active working-tree compare when the graph refreshes (FR-032)
        store.maybeRerunCompareForWorkingTree();
        this.firePrefetch();
        break;
      case 'commitsAppended': {
        if (message.payload.generation !== store.fetchGeneration) {
          store.setPrefetching(false);
          // A stale batch means the graph was reloaded mid-navigation; the
          // located HEAD position no longer applies.
          store.resetGoToHead();
          break;
        }
        store.appendCommits(message.payload.commits, message.payload.totalLoadedWithoutFilter);
        store.setHasMore(message.payload.hasMore);
        store.setPrefetching(false);
        this.continueGoToHeadAfterAppend();
        // Auto-retry: if batch yielded no visible commits and cap not reached, fetch more
        const updatedStore = useGraphStore.getState();
        if (
          updatedStore.consecutiveEmptyBatches > 0 &&
          updatedStore.consecutiveEmptyBatches < 3 &&
          updatedStore.hasMore
        ) {
          this.firePrefetch();
        }
        break;
      }
      case 'headLocation': {
        // Ignore unsolicited/stale answers (e.g. after a refresh reset the flow).
        if (store.goToHeadState !== 'locating') break;
        const { hash, index } = message.payload;
        const decision = decideHeadNavigation({
          hash,
          index,
          loadedCount: store.commits.length,
          mergedIndex: hash ? store.mergedCommits.findIndex((c) => c.hash === hash) : -1,
          isHiddenClientSide: hash ? store.hiddenCommitHashes.has(hash) : false,
          hasMore: store.hasMore,
        });
        this.applyHeadNavigation(decision, hash);
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
      case 'error': {
        const errorMessage = message.payload.error.message;
        store.setError(errorMessage);
        store.setIsRefreshing(false);
        store.setWorktreeListLoading(false);
        // A failed locateHead (or any interleaved failure) must not leave the
        // Go to HEAD button stuck in its busy state.
        store.resetGoToHead();
        // Clear the author-fetch guard so a failed getAuthors() can be retried.
        // Author fetch failures arrive here (not as an `authorList` message), so
        // without this the FilterWidget's `authorListLoading` guard stays true and
        // blocks every retry for the rest of the session.
        store.setAuthorListLoading(false);
        this.rejectPendingLookups(errorMessage);
        if (this.pendingWorktreePath) {
          this.pendingWorktreePath.reject(new Error(errorMessage));
          this.pendingWorktreePath = null;
        }
        if (this.pendingWorktreeEnvFiles) {
          this.pendingWorktreeEnvFiles.reject(new Error(errorMessage));
          this.pendingWorktreeEnvFiles = null;
        }
        if (this.pendingDialogAction) {
          const { reject } = this.pendingDialogAction;
          this.pendingDialogAction = null;
          reject(errorMessage);
        }
        break;
      }
      case 'compareError': {
        // Latest-wins: ignore stale errors (e.g. CANCELLED from a superseded compare) whose
        // requestId no longer matches the active one. This guards both the cancellation race
        // (a newer compare's success would otherwise get dropped) and accidental routing of
        // unrelated errors into the compare panel.
        if (store.comparePanelUI.activeRequestId !== message.payload.requestId) break;
        const errorMessage = message.payload.error.message;
        const errorCode = (message.payload.error as { code?: string }).code;
        if (errorCode === 'CANCELLED') {
          store.endCompareCancelled();
        } else {
          store.endCompareError(errorMessage);
        }
        break;
      }
      case 'prefetchError':
        store.setError(message.payload.error.message);
        store.setPrefetching(false);
        store.resetGoToHead();
        break;
      case 'success':
        store.setSuccessMessage(message.payload.message);
        if (this.pendingDialogAction) {
          const { resolve } = this.pendingDialogAction;
          this.pendingDialogAction = null;
          resolve();
        }
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
      case 'signaturePresence':
        store.mergeSignaturePresence(message.payload.presence);
        break;
      case 'signaturePresenceFailed':
        store.markSignaturePresenceFailed(message.payload.hashes);
        break;
      case 'signaturesVerified':
        store.mergeVerifiedSignatures(message.payload.results);
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
      case 'worktreePathResolved':
        // Latest-wins: ignore stale responses whose requestId no longer matches
        // the pending request (a slower earlier response must not resolve a newer one).
        if (this.pendingWorktreePath && this.pendingWorktreePath.requestId === message.payload.requestId) {
          this.pendingWorktreePath.resolve({ path: message.payload.path });
          this.pendingWorktreePath = null;
        }
        break;
      case 'worktreeEnvFiles':
        if (this.pendingWorktreeEnvFiles && this.pendingWorktreeEnvFiles.requestId === message.payload.requestId) {
          this.pendingWorktreeEnvFiles.resolve({
            ignoredEnvFiles: message.payload.ignoredEnvFiles,
            envFilesPresent: message.payload.envFilesPresent,
          });
          this.pendingWorktreeEnvFiles = null;
        }
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
      case 'tagMetadata':
        store.setTagMetadata(message.payload.metadata);
        break;
      case 'persistedUIState':
        store.hydratePersistedUIState(message.payload.uiState);
        break;
      case 'authorList':
        store.setAuthorList(message.payload.authors);
        store.setAuthorListLoading(false);
        break;
      case 'uncommittedChanges':
        store.setUncommittedChanges(message.payload);
        break;
      case 'conflictState':
        store.setConflictState(message.payload);
        break;
      case 'initialData':
        store.setInitialData(message.payload);
        store.setIsLoadingRepo(false);
        if (message.payload.errors.length > 0) {
          store.setError(`Some data sources failed: ${message.payload.errors.join('; ')}`);
        }
        // Re-run any active working-tree compare on initial data refresh (FR-032)
        store.maybeRerunCompareForWorkingTree();
        if (message.payload.commits !== null) {
          this.firePrefetch();
        }
        break;
      case 'compareResult': {
        // Latest-wins: ignore stale responses whose requestId no longer matches the active one.
        if (store.comparePanelUI.activeRequestId !== message.payload.requestId) break;
        store.endCompareSuccess(message.payload.result);
        break;
      }
    }
  }

  send(message: RequestMessage) {
    this.vscode?.postMessage(message);
  }

  getCommits(filters?: Partial<{ branches?: string[]; author?: string; authors?: string[]; afterDate?: string; beforeDate?: string; maxCount: number }>) {
    this.send({ type: 'getCommits', payload: { filters } });
  }

  getAuthors() {
    useGraphStore.getState().setAuthorListLoading(true);
    this.send({ type: 'getAuthors', payload: {} });
  }

  getBranches() {
    this.send({ type: 'getBranches', payload: {} });
  }

  getCommitDetails(hash: string) {
    this.send({ type: 'getCommitDetails', payload: { hash } });
  }

  navigateMatch(direction: 'next' | 'prev') {
    const store = useGraphStore.getState();
    if (store.searchState.matchIndices.length === 0) return;
    if (direction === 'next') store.nextMatch();
    else store.prevMatch();
    const hash = useGraphStore.getState().selectedCommit;
    if (hash) this.getCommitDetails(hash);
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

  fastForwardLocalBranch(remote: string, branch: string, setUpstream?: boolean) {
    this.send({ type: 'fastForwardLocalBranch', payload: { remote, branch, setUpstream } });
  }

  copyToClipboard(text: string) {
    this.send({ type: 'copyToClipboard', payload: { text } });
  }

  openDiff(hash: string, filePath: string, parentHash?: string, status?: FileChangeStatus) {
    this.send({ type: 'openDiff', payload: { hash, filePath, parentHash, status } });
  }

  /**
   * Dispatch a compare-refs RPC. The store's `beginCompare` MUST already have
   * been called with this `requestId` so the upcoming `compareResult` /
   * `error` response can be matched by id.
   */
  compareRefs(payload: { a: SlotValue; b: SlotValue; mode: CompareMode; requestId: string }) {
    this.send({ type: 'compareRefs', payload });
  }

  cancelCompare(requestId: string) {
    this.send({ type: 'cancelCompare', payload: { requestId } });
  }

  openCompareDiff(payload: { filePath: string; aHash: string | null; bHash: string | null; status: FileChangeStatus; title: string }) {
    this.send({ type: 'openCompareDiff', payload });
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
  createBranch(name: string, startPoint?: string, checkout?: boolean) {
    this.send({ type: 'createBranch', payload: { name, startPoint, checkout } });
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
  createTag(name: string, hash: string, message?: string, push?: { remote: string; force?: boolean }) {
    this.send({ type: 'createTag', payload: { name, hash, message, push } });
  }

  deleteTag(name: string, deleteRemote?: { remote: string }) {
    this.send({ type: 'deleteTag', payload: { name, deleteRemote } });
  }

  pushTag(name: string, remote?: string, force?: boolean) {
    this.send({ type: 'pushTag', payload: { name, remote, force } });
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

  revert(hash: string, options: RevertOptions) {
    this.send({ type: 'revert', payload: { hash, options } });
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

  detectSignaturePresence(hashes: string[]) {
    if (hashes.length === 0) return;
    useGraphStore.getState().setSignaturePresenceLoading(hashes, true);
    this.send({ type: 'detectSignaturePresence', payload: { hashes } });
  }

  verifySignatures(hashes: string[]) {
    if (hashes.length === 0) return;
    const store = useGraphStore.getState();
    for (const hash of hashes) store.setSignatureLoading(hash, true);
    this.send({ type: 'verifySignatures', payload: { hashes } });
  }

  openSignatureHelp() {
    this.send({ type: 'openSignatureHelp', payload: {} });
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
  openSettings(query?: string) {
    this.send({ type: 'openSettings', payload: { query } });
  }

  getSettings() {
    this.send({ type: 'getSettings', payload: {} });
  }

  setToolbarSetting(setting: ToolbarBooleanSetting, value: boolean) {
    this.send({ type: 'setToolbarSetting', payload: { setting, value } });
  }

  getSubmodules() {
    this.send({ type: 'getSubmodules', payload: {} });
  }

  updateSubmodule(submodulePath: string) {
    this.send({ type: 'updateSubmodule', payload: { submodulePath } });
  }

  initSubmodule(submodulePath: string) {
    this.send({ type: 'initSubmodule', payload: { submodulePath } });
  }

  // Worktree ops
  getWorktreeList() {
    useGraphStore.getState().setWorktreeListLoading(true);
    this.send({ type: 'getWorktreeList', payload: {} });
  }

  /**
   * Ask the backend to compose a target path for a new worktree. Resolves with
   * the absolute path; rejects if a previous request is superseded or the backend
   * returns an error. Non-blocking — used to seed the dialog field.
   */
  resolveWorktreePath(payload: { ref: string; branchMode: WorktreeBranchMode; newBranchName?: string }): Promise<{ path: string }> {
    if (this.pendingWorktreePath) {
      this.pendingWorktreePath.reject(new Error('superseded'));
      this.pendingWorktreePath = null;
    }
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingWorktreePath = { requestId, resolve, reject };
      this.send({ type: 'resolveWorktreePath', payload: { ...payload, requestId } });
    });
  }

  /**
   * Ask the backend which gitignored `.env*` files could be copied into a new worktree.
   * Resolves with the ignored file names plus whether any `.env*` exists at all (to drive
   * an accurate disabled-checkbox hint). Rejects if superseded or the backend errors.
   */
  getWorktreeEnvFiles(): Promise<{ ignoredEnvFiles: string[]; envFilesPresent: boolean }> {
    if (this.pendingWorktreeEnvFiles) {
      this.pendingWorktreeEnvFiles.reject(new Error('superseded'));
      this.pendingWorktreeEnvFiles = null;
    }
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingWorktreeEnvFiles = { requestId, resolve, reject };
      this.send({ type: 'getWorktreeEnvFiles', payload: { requestId } });
    });
  }

  addWorktree(payload: { path: string; ref: string; branchMode: WorktreeBranchMode; newBranchName?: string; force?: boolean; copyEnvFiles?: boolean }) {
    this.send({ type: 'addWorktree', payload });
  }

  removeWorktree(path: string, force?: boolean) {
    this.send({ type: 'removeWorktree', payload: { path, force } });
  }

  pruneWorktree() {
    useGraphStore.getState().setWorktreeListLoading(true);
    this.send({ type: 'pruneWorktree', payload: {} });
  }

  openWorktree(path: string) {
    this.send({ type: 'openWorktree', payload: { path } });
  }

  revealWorktree(path: string) {
    this.send({ type: 'revealWorktree', payload: { path } });
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
  loadMoreCommits(skip: number, generation: number, filters: { branches?: string[]; author?: string; authors?: string[]; afterDate?: string; beforeDate?: string }, targetIndex?: number) {
    this.send({ type: 'loadMoreCommits', payload: { skip, generation, filters, targetIndex } });
  }

  // Go to HEAD (toolbar)
  goToHead() {
    const store = useGraphStore.getState();
    if (store.goToHeadState !== 'idle' || store.loading) return;
    store.setGoToHeadState('locating');
    // Author/text filtering is client-side; only backend filters shape the log stream.
    const { branches, afterDate, beforeDate } = store.filters;
    this.send({ type: 'locateHead', payload: { filters: { branches, afterDate, beforeDate } } });
  }

  /** Execute the decided next step of a Go to HEAD navigation. */
  private applyHeadNavigation(decision: HeadNavigationDecision, hash: string | null) {
    const store = useGraphStore.getState();
    switch (decision.kind) {
      case 'scrollTo':
        if (hash && store.navigateToCommit(hash)) {
          this.refreshDetailsPanelIfOpen(hash);
        }
        break;
      case 'loadMore': {
        if (!hash) break;
        store.setPendingHead({
          hash,
          targetIndex: decision.targetIndex,
          attempts: (store.pendingHead?.attempts ?? 0) + 1,
        });
        store.setGoToHeadState('loading');
        this.requestTargetedBatch(decision.targetIndex);
        break;
      }
      // hiddenByFilter / notInView / unresolved: each decision kind is also its
      // user-facing message key, so one branch handles all the terminal cases.
      default:
        store.resetGoToHead();
        store.setError(HEAD_NAVIGATION_MESSAGES[decision.kind]);
        break;
    }
  }

  /**
   * Refresh the details panel content after Go to HEAD lands on a row.
   * Navigation must never change the panel's visibility, and receiving
   * details force-opens it — so only fetch when the panel is already open.
   */
  private refreshDetailsPanelIfOpen(hash: string) {
    if (useGraphStore.getState().detailsPanelOpen) {
      this.getCommitDetails(hash);
    }
  }

  /**
   * Issue the next targeted `loadMoreCommits` batch for a Go to HEAD in flight.
   * No-op when a prefetch is already running — that batch's commitsAppended
   * response re-enters continueGoToHeadAfterAppend and drives the next step.
   */
  private requestTargetedBatch(targetIndex: number) {
    const store = useGraphStore.getState();
    if (store.prefetching) return;
    store.setPrefetching(true);
    const { branches, afterDate, beforeDate } = store.filters;
    this.loadMoreCommits(store.commits.length, store.fetchGeneration, { branches, afterDate, beforeDate }, targetIndex);
  }

  /**
   * After each commitsAppended batch, finish (or keep driving) a pending
   * Go to HEAD navigation: navigate once the target row exists, otherwise
   * request the next targeted batch until found or capped.
   */
  private continueGoToHeadAfterAppend() {
    const store = useGraphStore.getState();
    const pending = store.pendingHead;
    if (store.goToHeadState !== 'loading' || !pending) return;

    if (store.mergedCommits.some((c) => c.hash === pending.hash)) {
      if (store.navigateToCommit(pending.hash)) {
        this.refreshDetailsPanelIfOpen(pending.hash);
      }
      return;
    }
    if (store.hiddenCommitHashes.has(pending.hash)) {
      store.resetGoToHead();
      store.setError(HEAD_NAVIGATION_MESSAGES.hiddenByFilter);
      return;
    }
    if (!store.hasMore || pending.attempts >= MAX_GO_TO_HEAD_LOADS) {
      store.resetGoToHead();
      store.setError(HEAD_NAVIGATION_MESSAGES.unreachable);
      return;
    }

    store.setPendingHead({ ...pending, attempts: pending.attempts + 1 });
    // History may have grown since HEAD was located — never request less than
    // one batch past what is already loaded.
    this.requestTargetedBatch(Math.max(pending.targetIndex, store.commits.length));
  }

  stageFiles(paths: string[]) {
    this.send({ type: 'stageFiles', payload: { paths } });
  }

  unstageFiles(paths: string[]) {
    this.send({ type: 'unstageFiles', payload: { paths } });
  }

  stageAll() {
    this.send({ type: 'stageAll', payload: {} });
  }

  unstageAll() {
    this.send({ type: 'unstageAll', payload: {} });
  }

  discardFiles(paths: string[], includeUntracked: boolean) {
    this.send({ type: 'discardFiles', payload: { paths, includeUntracked } });
  }

  discardAllUnstaged() {
    this.send({ type: 'discardAllUnstaged', payload: {} });
  }

  stashWithMessage(message?: string, paths?: string[]) {
    this.send({ type: 'stashWithMessage', payload: { message, paths } });
  }

  stashSelected(message: string, paths: string[], addUntrackedFirst: boolean) {
    this.send({ type: 'stashSelected', payload: { message, paths, addUntrackedFirst } });
  }

  /**
   * Install a one-shot promise that resolves on the next `success` response
   * or rejects on the next `error` response. Used by dialog flows
   * (FilePickerDialog) to lift a local busy state on the actual backend
   * response, not on unrelated store updates from file watchers etc.
   *
   * If a previous slot is still installed (e.g., the user rapid-clicked),
   * the previous one is rejected with `'superseded'` before the new slot is
   * installed.
   */
  awaitNextDialogAction(): Promise<void> {
    if (this.pendingDialogAction) {
      const { reject } = this.pendingDialogAction;
      this.pendingDialogAction = null;
      reject('superseded');
    }
    return new Promise<void>((resolve, reject) => {
      this.pendingDialogAction = { resolve, reject };
    });
  }

  /**
   * Clear any installed dialog-action promise slot by rejecting it with
   * `'dialog-closed'`. Called on dialog unmount/close to guarantee we do not
   * leak a hanging promise.
   */
  clearPendingDialogAction() {
    if (this.pendingDialogAction) {
      const { reject } = this.pendingDialogAction;
      this.pendingDialogAction = null;
      reject('dialog-closed');
    }
  }

  getConflictState() {
    this.send({ type: 'getConflictState', payload: {} });
  }

  openStagedDiff(filePath: string) {
    this.send({ type: 'openStagedDiff', payload: { filePath } });
  }

  getUncommittedChanges() {
    this.send({ type: 'getUncommittedChanges', payload: {} });
  }

  firePrefetch() {
    const store = useGraphStore.getState();
    if (!store.hasMore || store.prefetching) return;
    store.setPrefetching(true);
    // Author filtering is done client-side — never pass author/authors to backend
    const { branches, afterDate, beforeDate } = store.filters;
    this.loadMoreCommits(store.commits.length, store.fetchGeneration, { branches, afterDate, beforeDate });
  }
}

export const rpcClient = new RpcClient();
