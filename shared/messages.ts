import type { Commit, Branch, CommitDetails, GraphFilters } from './types.js';
import type { GitError } from './errors.js';

export type RequestMessage =
  | { type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
  | { type: 'getBranches'; payload: Record<string, never> }
  | { type: 'getCommitDetails'; payload: { hash: string } }
  | { type: 'checkoutBranch'; payload: { name: string; remote?: string } }
  | { type: 'fetch'; payload: { remote?: string; prune?: boolean } }
  | { type: 'copyToClipboard'; payload: { text: string } }
  | { type: 'openDiff'; payload: { hash: string; filePath: string; parentHash?: string } }
  | { type: 'openFile'; payload: { hash: string; filePath: string } }
  | { type: 'refresh'; payload: Record<string, never> };

export type ResponseMessage =
  | { type: 'commits'; payload: { commits: Commit[] } }
  | { type: 'branches'; payload: { branches: Branch[] } }
  | { type: 'commitDetails'; payload: { details: CommitDetails } }
  | { type: 'error'; payload: { error: GitError | { message: string } } }
  | { type: 'loading'; payload: { loading: boolean } }
  | { type: 'success'; payload: { message: string } };

export type Message = RequestMessage | ResponseMessage;

export function isRequestMessage(msg: Message): msg is RequestMessage {
  const requestTypes = [
    'getCommits', 'getBranches', 'getCommitDetails',
    'checkoutBranch', 'fetch', 'copyToClipboard',
    'openDiff', 'openFile', 'refresh',
  ];
  return requestTypes.includes(msg.type);
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
  const responseTypes = ['commits', 'branches', 'commitDetails', 'error', 'loading', 'success'];
  return responseTypes.includes(msg.type);
}
