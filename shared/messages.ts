import type { Commit, Branch, CommitDetails, GraphFilters, RemoteInfo, StashEntry } from './types.js';
import type { GitError } from './errors.js';

export type RequestMessage =
  | { type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
  | { type: 'getBranches'; payload: Record<string, never> }
  | { type: 'getCommitDetails'; payload: { hash: string } }
  | { type: 'checkoutBranch'; payload: { name: string; remote?: string } }
  | { type: 'fetch'; payload: { remote?: string; prune?: boolean; filters?: Partial<GraphFilters> } }
  | { type: 'copyToClipboard'; payload: { text: string } }
  | { type: 'openDiff'; payload: { hash: string; filePath: string; parentHash?: string } }
  | { type: 'openFile'; payload: { hash: string; filePath: string } }
  | { type: 'refresh'; payload: { filters?: Partial<GraphFilters> } }
  // Branch ops
  | { type: 'createBranch'; payload: { name: string; startPoint?: string } }
  | { type: 'renameBranch'; payload: { oldName: string; newName: string } }
  | { type: 'deleteBranch'; payload: { name: string; force?: boolean } }
  | { type: 'deleteRemoteBranch'; payload: { remote: string; name: string } }
  | { type: 'mergeBranch'; payload: { branch: string; noFastForward?: boolean; squash?: boolean } }
  // Remote ops
  | { type: 'push'; payload: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean } }
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
  | { type: 'dropStash'; payload: { index: number } };

export type ResponseMessage =
  | { type: 'commits'; payload: { commits: Commit[] } }
  | { type: 'branches'; payload: { branches: Branch[] } }
  | { type: 'commitDetails'; payload: { details: CommitDetails } }
  | { type: 'error'; payload: { error: GitError | { message: string } } }
  | { type: 'loading'; payload: { loading: boolean } }
  | { type: 'success'; payload: { message: string } }
  | { type: 'remotes'; payload: { remotes: RemoteInfo[] } }
  | { type: 'stashes'; payload: { stashes: StashEntry[] } };

export type Message = RequestMessage | ResponseMessage;

/** Compile-time exhaustive maps — adding a union member without updating these causes a TS error. */
const REQUEST_TYPES: Record<RequestMessage['type'], true> = {
  getCommits: true, getBranches: true, getCommitDetails: true,
  checkoutBranch: true, fetch: true, copyToClipboard: true,
  openDiff: true, openFile: true, refresh: true,
  createBranch: true, renameBranch: true, deleteBranch: true,
  deleteRemoteBranch: true, mergeBranch: true,
  push: true, pull: true, getRemotes: true, addRemote: true,
  removeRemote: true, editRemote: true,
  createTag: true, deleteTag: true, pushTag: true,
  getStashes: true, applyStash: true, popStash: true, dropStash: true,
};

const RESPONSE_TYPES: Record<ResponseMessage['type'], true> = {
  commits: true, branches: true, commitDetails: true,
  error: true, loading: true, success: true,
  remotes: true, stashes: true,
};

export function isRequestMessage(msg: Message): msg is RequestMessage {
  return msg.type in REQUEST_TYPES;
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
  return msg.type in RESPONSE_TYPES;
}
