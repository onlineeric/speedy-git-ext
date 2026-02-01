import type { Commit, Branch, GraphFilters } from './types.js';
import type { GitError } from './errors.js';

export type RequestMessage =
  | { type: 'getCommits'; payload: { filters?: Partial<GraphFilters> } }
  | { type: 'getBranches'; payload: Record<string, never> }
  | { type: 'refresh'; payload: Record<string, never> };

export type ResponseMessage =
  | { type: 'commits'; payload: { commits: Commit[] } }
  | { type: 'branches'; payload: { branches: Branch[] } }
  | { type: 'error'; payload: { error: GitError | { message: string } } }
  | { type: 'loading'; payload: { loading: boolean } };

export type Message = RequestMessage | ResponseMessage;

export function isRequestMessage(msg: Message): msg is RequestMessage {
  return msg.type === 'getCommits' || msg.type === 'getBranches' || msg.type === 'refresh';
}

export function isResponseMessage(msg: Message): msg is ResponseMessage {
  return msg.type === 'commits' || msg.type === 'branches' || msg.type === 'error' || msg.type === 'loading';
}
