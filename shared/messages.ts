import type { Commit, Branch, CommitDetails, GraphFilters } from './types.js';
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
  | { type: 'refresh'; payload: { filters?: Partial<GraphFilters> } };

export type ResponseMessage =
  | { type: 'commits'; payload: { commits: Commit[] } }
  | { type: 'branches'; payload: { branches: Branch[] } }
  | { type: 'commitDetails'; payload: { details: CommitDetails } }
  | { type: 'error'; payload: { error: GitError | { message: string } } }
  | { type: 'loading'; payload: { loading: boolean } }
  | { type: 'success'; payload: { message: string } };

export type Message = RequestMessage | ResponseMessage;

/** Compile-time exhaustive maps — adding a union member without updating these causes a TS error. */
const REQUEST_TYPES: Record<RequestMessage['type'], true> = {
  getCommits: true, getBranches: true, getCommitDetails: true,
  checkoutBranch: true, fetch: true, copyToClipboard: true,
  openDiff: true, openFile: true, refresh: true,
};

const RESPONSE_TYPES: Record<ResponseMessage['type'], true> = {
  commits: true, branches: true, commitDetails: true,
  error: true, loading: true, success: true,
};

export function isRequestMessage(msg: Message): msg is RequestMessage {
  return msg.type in REQUEST_TYPES;
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
  return msg.type in RESPONSE_TYPES;
}
