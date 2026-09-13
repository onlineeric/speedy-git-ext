import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

export function RebaseConflictBanner() {
  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const conflictInfo = useGraphStore((s) => s.rebaseConflictInfo);

  if (!rebaseInProgress) return null;

  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-sm bg-[var(--vscode-inputValidation-warningBackground)] border-b border-[var(--vscode-inputValidation-warningBorder)] text-[var(--vscode-foreground)]">
      <div className="flex items-center gap-3">
        {/* Nothing conflicted and a clean tree: `git rebase -i` stopped because a
            commit became empty, so there is nothing to go and resolve. */}
        {conflictInfo?.stoppedOnEmptyCommit ? (
          <span className="flex-1">
            Rebase paused — git stopped at a commit that became empty.
            {conflictInfo.conflictCommitMessage && (
              <> Commit: <strong>{conflictInfo.conflictCommitMessage}</strong>.</>
            )}
            {' '}Continue or abort.
          </span>
        ) : (
          <span className="flex-1">
            Rebase paused due to conflict.
            {conflictInfo?.conflictCommitMessage && (
              <> Conflicting commit: <strong>{conflictInfo.conflictCommitMessage}</strong></>
            )}
            {' '}Resolve conflicts in the Source Control panel, then continue.
          </span>
        )}
        <button
          onClick={() => rpcClient.continueRebase()}
          className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex-shrink-0"
        >
          Continue Rebase
        </button>
        <button
          onClick={() => rpcClient.abortRebase()}
          className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] flex-shrink-0"
        >
          Abort
        </button>
      </div>
      {conflictInfo && conflictInfo.conflictedFiles.length > 0 && (
        <div className="text-xs text-[var(--vscode-descriptionForeground)] pl-1">
          Conflicted files: {conflictInfo.conflictedFiles.join(', ')}
        </div>
      )}
    </div>
  );
}
