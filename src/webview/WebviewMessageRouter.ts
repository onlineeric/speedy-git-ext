import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../../shared/messages.js';
import { GIT_ERROR_CODES, type GitErrorCode } from '../../shared/errors.js';
import { TRACKED_OPERATIONS, type TrackedOperation } from '../../shared/telemetry.js';
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
import { telemetryHandlers } from './handlers/telemetryHandlers.js';
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
  ...telemetryHandlers,
} satisfies RequestHandlerMap;

/**
 * Extract the standardized code from a posted error payload. Reads ONLY
 * `.code` — never `.message`, `.stderr`, or `.command` (FR-005) — and only
 * accepts values from the closed `GitErrorCode` set.
 */
const GIT_ERROR_CODE_SET: ReadonlySet<string> = new Set(GIT_ERROR_CODES);

function extractGitCode(error: unknown): GitErrorCode {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && GIT_ERROR_CODE_SET.has(code)) {
      return code as GitErrorCode;
    }
  }
  return 'UNKNOWN';
}

function classifyFailureResponse(response: ResponseMessage): GitErrorCode | undefined {
  switch (response.type) {
    case 'error':
    case 'compareError':
    case 'checkoutPullFailed':
      return extractGitCode(response.payload.error);
    case 'pushResult':
      return response.payload.success
        ? undefined
        : extractGitCode({ code: response.payload.errorCode });
    default:
      return undefined;
  }
}

export class WebviewMessageRouter {
  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly context: WebviewRequestContext,
  ) {}

  async dispatch(message: RequestMessage): Promise<void> {
    this.log.debug(`Received message: ${message.type}`);
    const handler = requestHandlers[message.type] as RequestHandler<typeof message.type>;

    // Untracked types take the exact pre-existing path — zero added work (FR-002).
    if (!TRACKED_OPERATIONS.has(message.type)) {
      await handler(message, this.context);
      return;
    }

    // Operation telemetry middleware (US1): observe posted responses through a
    // per-dispatch context copy so concurrent dispatches never cross-attribute
    // errors. Handlers post failures rather than throwing (Result pattern), so
    // both generic and domain-specific failure responses are outcome signals.
    // True interim responses (checkoutNeedsStash, deleteBranchNeedsForce, …)
    // still count as success.
    const start = performance.now();
    let outcome: 'success' | 'error' = 'success';
    let errorCode: GitErrorCode | undefined;
    const trackedContext: WebviewRequestContext = {
      ...this.context,
      postMessage: (response) => {
        const responseErrorCode = classifyFailureResponse(response);
        if (responseErrorCode !== undefined) {
          outcome = 'error';
          errorCode = responseErrorCode;
        }
        this.context.postMessage(response);
      },
    };

    try {
      await handler(message, trackedContext);
    } catch (error) {
      outcome = 'error';
      errorCode = 'UNKNOWN';
      throw error;
    } finally {
      this.context.telemetry.sendOperation(
        message.type as TrackedOperation,
        outcome,
        performance.now() - start,
        errorCode,
      );
    }
  }
}
