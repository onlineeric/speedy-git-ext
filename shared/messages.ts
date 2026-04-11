import type { Commit, Branch, CommitDetails, GraphFilters, RemoteInfo, StashEntry, ResetMode, PushForceMode, CherryPickOptions, CherryPickState, RevertState, CommitSignatureInfo, CommitParentInfo, InteractiveRebaseConfig, RebaseState, RebaseConflictInfo, RebaseEntry, RepoInfo, Submodule, UserSettings, SubmoduleNavEntry, AvatarUrlMap, WorktreeInfo, PersistedUIState, Author, FileChangeStatus, ConflictState, UncommittedSummary } from './types.js';
import type { GitError } from './errors.js';

export type RequestMessage =
  | { type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
  | { type: 'getBranches'; payload: Record<string, never> }
  | { type: 'getCommitDetails'; payload: { hash: string } }
  | { type: 'checkoutBranch'; payload: { name: string; remote?: string; pull?: boolean } }
  | { type: 'checkoutCommit'; payload: { hash: string } }
  | { type: 'fetch'; payload: { remote?: string; prune?: boolean; filters?: Partial<GraphFilters> } }
  | { type: 'copyToClipboard'; payload: { text: string } }
  | { type: 'openDiff'; payload: { hash: string; filePath: string; parentHash?: string; status?: FileChangeStatus } }
  | { type: 'openFile'; payload: { hash: string; filePath: string } }
  | { type: 'refresh'; payload: { filters?: Partial<GraphFilters> } }
  // Branch ops
  | { type: 'createBranch'; payload: { name: string; startPoint?: string } }
  | { type: 'renameBranch'; payload: { oldName: string; newName: string } }
  | { type: 'deleteBranch'; payload: { name: string; force?: boolean; deleteRemote?: { remote: string; name: string } } }
  | { type: 'deleteRemoteBranch'; payload: { remote: string; name: string } }
  | { type: 'mergeBranch'; payload: { branch: string; noFastForward?: boolean; squash?: boolean; noCommit?: boolean } }
  // Remote ops
  | { type: 'push'; payload: { remote: string; branch: string; setUpstream?: boolean; forceMode?: PushForceMode } }
  | { type: 'pull'; payload: { remote?: string; branch?: string; rebase?: boolean } }
  | { type: 'getRemotes'; payload: Record<string, never> }
  | { type: 'addRemote'; payload: { name: string; url: string } }
  | { type: 'removeRemote'; payload: { name: string } }
  | { type: 'editRemote'; payload: { name: string; newUrl: string } }
  // Tag ops
  | { type: 'createTag'; payload: { name: string; hash: string; message?: string } }
  | { type: 'deleteTag'; payload: { name: string } }
  | { type: 'pushTag'; payload: { name: string; remote?: string } }
  // Stash ops
  | { type: 'getStashes'; payload: Record<string, never> }
  | { type: 'applyStash'; payload: { index: number } }
  | { type: 'popStash'; payload: { index: number } }
  | { type: 'dropStash'; payload: { index: number } }
  // History ops
  | { type: 'resetBranch'; payload: { hash: string; mode: ResetMode } }
  // Cherry-pick ops
  | { type: 'cherryPick'; payload: { hashes: string[]; options: CherryPickOptions } }
  | { type: 'abortCherryPick'; payload: Record<string, never> }
  | { type: 'continueCherryPick'; payload: Record<string, never> }
  | { type: 'revert'; payload: { hash: string; mainlineParent?: number } }
  | { type: 'continueRevert'; payload: Record<string, never> }
  | { type: 'abortRevert'; payload: Record<string, never> }
  // Rebase ops
  | { type: 'rebase'; payload: { targetRef: string; ignoreDate?: boolean } }
  | { type: 'interactiveRebase'; payload: { config: InteractiveRebaseConfig } }
  | { type: 'getRebaseCommits'; payload: { baseHash: string } }
  | { type: 'abortRebase'; payload: Record<string, never> }
  | { type: 'continueRebase'; payload: Record<string, never> }
  | { type: 'getSignatureInfo'; payload: { hash: string } }
  | { type: 'dropCommit'; payload: { hash: string } }
  | { type: 'isCommitPushed'; payload: { hash: string } }
  | { type: 'getCommitParents'; payload: { hashes: string[] } }
  // Authors
  | { type: 'getAuthors'; payload: Record<string, never> }
  // Pagination & settings
  | { type: 'loadMoreCommits'; payload: { skip: number; generation: number; filters: { branches?: string[]; author?: string; authors?: string[]; afterDate?: string; beforeDate?: string } } }
  | { type: 'openSettings'; payload: Record<string, never> }
  | { type: 'switchRepo'; payload: { repoPath: string } }
  | { type: 'getSettings'; payload: Record<string, never> }
  | { type: 'getSubmodules'; payload: Record<string, never> }
  | { type: 'openSubmodule'; payload: { submodulePath: string } }
  | { type: 'backToParentRepo'; payload: Record<string, never> }
  | { type: 'updateSubmodule'; payload: { submodulePath: string } }
  | { type: 'initSubmodule'; payload: { submodulePath: string } }
  // Stash-and-checkout flow
  | { type: 'stashAndCheckout'; payload: { name: string; remote?: string; pull?: boolean } }
  | { type: 'stashAndCheckoutCommit'; payload: { hash: string } }
  // Worktree ops
  | { type: 'getWorktreeList'; payload: Record<string, never> }
  // Containing branches
  | { type: 'getContainingBranches'; payload: { hash: string } }
  // External browser
  | { type: 'openExternal'; payload: { url: string } }
  // File actions
  | { type: 'openCurrentFile'; payload: { filePath: string } }
  // UI state persistence
  | { type: 'updatePersistedUIState'; payload: { uiState: Partial<Omit<PersistedUIState, 'version'>> } }
  | { type: 'getUncommittedChanges'; payload: Record<string, never> }
  // Staging ops
  | { type: 'stageFiles'; payload: { paths: string[] } }
  | { type: 'unstageFiles'; payload: { paths: string[] } }
  | { type: 'stageAll'; payload: Record<string, never> }
  | { type: 'unstageAll'; payload: Record<string, never> }
  | { type: 'discardFiles'; payload: { paths: string[]; includeUntracked: boolean } }
  | { type: 'discardAllUnstaged'; payload: Record<string, never> }
  | { type: 'stashWithMessage'; payload: { message?: string; paths?: string[] } }
  | { type: 'stashSelected'; payload: { message: string; paths: string[]; addUntrackedFirst: boolean } }
  | { type: 'getConflictState'; payload: Record<string, never> }
  | { type: 'openStagedDiff'; payload: { filePath: string } };

export type ResponseMessage =
  | { type: 'commits'; payload: { commits: Commit[]; branches?: Branch[]; hasMore?: boolean; totalLoadedWithoutFilter?: number } }
  | { type: 'branches'; payload: { branches: Branch[] } }
  | { type: 'commitDetails'; payload: { details: CommitDetails } }
  | { type: 'error'; payload: { error: GitError | { message: string } } }
  | { type: 'loading'; payload: { loading: boolean } }
  | { type: 'success'; payload: { message: string } }
  | { type: 'remotes'; payload: { remotes: RemoteInfo[] } }
  | { type: 'stashes'; payload: { stashes: StashEntry[] } }
  | { type: 'cherryPickState'; payload: { state: CherryPickState } }
  | { type: 'revertState'; payload: { state: RevertState } }
  | { type: 'rebaseState'; payload: { state: RebaseState; conflictInfo?: RebaseConflictInfo } }
  | { type: 'rebaseCommits'; payload: { entries: RebaseEntry[] } }
  | { type: 'signatureInfo'; payload: { hash: string; signature: CommitSignatureInfo | null } }
  | { type: 'commitPushedResult'; payload: { hash: string; pushed: boolean } }
  | { type: 'commitParents'; payload: { parents: CommitParentInfo[] } }
  | { type: 'commitsAppended'; payload: { commits: Commit[]; hasMore: boolean; generation: number; totalLoadedWithoutFilter?: number } }
  | { type: 'prefetchError'; payload: { error: GitError | { message: string } } }
  | { type: 'repoList'; payload: { repos: RepoInfo[]; activeRepoPath: string } }
  | { type: 'checkoutNeedsStash'; payload: { name: string; pull?: boolean } }
  | { type: 'checkoutCommitNeedsStash'; payload: { hash: string } }
  | { type: 'deleteBranchNeedsForce'; payload: { name: string; deleteRemote?: { remote: string; name: string } } }
  | { type: 'checkoutPullFailed'; payload: { branch: string; error: { message: string } } }
  | { type: 'settingsData'; payload: { settings: UserSettings } }
  | { type: 'submodulesData'; payload: { submodules: Submodule[]; stack: SubmoduleNavEntry[] } }
  | { type: 'submoduleOperationResult'; payload: { success: boolean; error?: string } }
  | { type: 'pushResult'; payload: { success: boolean; message: string } }
  | { type: 'avatarUrls'; payload: { urls: AvatarUrlMap } }
  | { type: 'worktreeList'; payload: { worktrees: WorktreeInfo[] } }
  | { type: 'containingBranches'; payload: { hash: string; branches: string[]; status: 'loaded' | 'error' } }
  | { type: 'persistedUIState'; payload: { uiState: PersistedUIState } }
  | { type: 'authorList'; payload: { authors: Author[] } }
  | { type: 'uncommittedChanges'; payload: UncommittedSummary }
  | { type: 'conflictState'; payload: ConflictState };

export type Message = RequestMessage | ResponseMessage;

/** Compile-time exhaustive maps — adding a union member without updating these causes a TS error. */
const REQUEST_TYPES: Record<RequestMessage['type'], true> = {
  getCommits: true, getBranches: true, getCommitDetails: true,
  checkoutBranch: true, checkoutCommit: true, fetch: true, copyToClipboard: true,
  openDiff: true, openFile: true, refresh: true,
  createBranch: true, renameBranch: true, deleteBranch: true,
  deleteRemoteBranch: true, mergeBranch: true,
  push: true, pull: true, getRemotes: true, addRemote: true,
  removeRemote: true, editRemote: true,
  createTag: true, deleteTag: true, pushTag: true,
  getStashes: true, applyStash: true, popStash: true, dropStash: true,
  resetBranch: true,
  cherryPick: true, abortCherryPick: true, continueCherryPick: true,
  revert: true, continueRevert: true, abortRevert: true,
  rebase: true, interactiveRebase: true, getRebaseCommits: true,
  abortRebase: true, continueRebase: true,
  getSignatureInfo: true, dropCommit: true, isCommitPushed: true, getCommitParents: true,
  loadMoreCommits: true, openSettings: true, switchRepo: true,
  getSettings: true, getSubmodules: true, openSubmodule: true, backToParentRepo: true,
  updateSubmodule: true, initSubmodule: true,
  stashAndCheckout: true, stashAndCheckoutCommit: true,
  getWorktreeList: true, getContainingBranches: true, openExternal: true,
  openCurrentFile: true, updatePersistedUIState: true, getAuthors: true,
  getUncommittedChanges: true,
  stageFiles: true, unstageFiles: true, stageAll: true, unstageAll: true,
  discardFiles: true, discardAllUnstaged: true, stashWithMessage: true, stashSelected: true,
  getConflictState: true, openStagedDiff: true,
};

const RESPONSE_TYPES: Record<ResponseMessage['type'], true> = {
  commits: true, branches: true, commitDetails: true,
  error: true, loading: true, success: true,
  remotes: true, stashes: true, cherryPickState: true, revertState: true,
  rebaseState: true, rebaseCommits: true, signatureInfo: true, commitPushedResult: true, commitParents: true,
  commitsAppended: true, prefetchError: true, repoList: true,
  checkoutNeedsStash: true, checkoutCommitNeedsStash: true, deleteBranchNeedsForce: true, checkoutPullFailed: true,
  settingsData: true, submodulesData: true, submoduleOperationResult: true,
  pushResult: true, avatarUrls: true, worktreeList: true, containingBranches: true,
  persistedUIState: true, authorList: true, uncommittedChanges: true, conflictState: true,
};

export function isRequestMessage(msg: Message): msg is RequestMessage {
  return msg.type in REQUEST_TYPES;
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
  return msg.type in RESPONSE_TYPES;
}

export function isAvatarUrlsMessage(msg: ResponseMessage): msg is Extract<ResponseMessage, { type: 'avatarUrls' }> {
  return msg.type === 'avatarUrls';
}
