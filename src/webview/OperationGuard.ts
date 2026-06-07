import { GitError } from '../../shared/errors.js';
import type { GitServiceRegistry } from './GitServiceRegistry.js';

export class OperationGuard {
  constructor(private readonly services: GitServiceRegistry) {}

  async getOperationInProgressError(): Promise<GitError | null> {
    const services = this.services.current();
    const rebaseState = services.gitRebaseService.getRebaseState();
    if (rebaseState.success && rebaseState.value.state === 'in-progress') {
      return new GitError('Another git operation is already in progress (rebase). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const cherryPickState = services.gitCherryPickService.getCherryPickState();
    if (cherryPickState.success && cherryPickState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (cherry-pick). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const revertState = await services.gitRevertService.getRevertState();
    if (revertState.success && revertState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (revert). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    const mergeHeadCheck = await services.gitLogService.verifyRef('MERGE_HEAD');
    if (mergeHeadCheck.success && mergeHeadCheck.value) {
      return new GitError('Another git operation is already in progress (merge). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    return null;
  }
}
