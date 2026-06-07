import * as vscode from 'vscode';
import type { RequestMessage } from '../../shared/messages.js';
import type { WebviewRequestContext } from './WebviewRequestContext.js';
import { branchHandlers } from './handlers/branchHandlers.js';
import { compareHandlers } from './handlers/compareHandlers.js';
import { graphDataHandlers } from './handlers/graphDataHandlers.js';
import { historyHandlers } from './handlers/historyHandlers.js';
import { remoteHandlers } from './handlers/remoteHandlers.js';
import { signatureHandlers } from './handlers/signatureHandlers.js';
import { stashHandlers } from './handlers/stashHandlers.js';
import { submoduleHandlers } from './handlers/submoduleHandlers.js';
import { tagHandlers } from './handlers/tagHandlers.js';
import { vscodeCommandHandlers } from './handlers/vscodeCommandHandlers.js';
import { workingTreeHandlers } from './handlers/workingTreeHandlers.js';
import { worktreeHandlers } from './handlers/worktreeHandlers.js';

export type RequestHandler<T extends RequestMessage['type']> = (
  message: Extract<RequestMessage, { type: T }>,
  context: WebviewRequestContext,
) => Promise<void>;

export type RequestHandlerMap = {
  [T in RequestMessage['type']]: RequestHandler<T>;
};

export const requestHandlers = {
  ...graphDataHandlers,
  ...branchHandlers,
  ...remoteHandlers,
  ...tagHandlers,
  ...stashHandlers,
  ...historyHandlers,
  ...signatureHandlers,
  ...submoduleHandlers,
  ...worktreeHandlers,
  ...workingTreeHandlers,
  ...compareHandlers,
  ...vscodeCommandHandlers,
} satisfies RequestHandlerMap;

export class WebviewMessageRouter {
  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly context: WebviewRequestContext,
  ) {}

  async dispatch(message: RequestMessage): Promise<void> {
    this.log.debug(`Received message: ${message.type}`);
    const handler = requestHandlers[message.type] as RequestHandler<typeof message.type>;
    await handler(message, this.context);
  }
}
