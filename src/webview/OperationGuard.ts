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

    // Two independent `rev-parse` probes: spawn them together and decide in
    // priority order afterwards, so a guarded operation pays one round trip
    // rather than two serialized ones. Each asks the service that owns the
    // operation, so what counts as "paused" is defined once per operation.
    const [revertState, mergeState] = await Promise.all([
      services.gitRevertService.getRevertState(),
      services.gitBranchService.getMergeState(),
    ]);

    if (revertState.success && revertState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (revert). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    if (mergeState.success && mergeState.value === 'in-progress') {
      return new GitError('Another git operation is already in progress (merge). Finish it before starting this action.', 'OPERATION_IN_PROGRESS');
    }

    return null;
  }
}
