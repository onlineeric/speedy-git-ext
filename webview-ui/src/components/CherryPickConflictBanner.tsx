import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

export function CherryPickConflictBanner() {
  const cherryPickInProgress = useGraphStore((s) => s.cherryPickInProgress);

  if (!cherryPickInProgress) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm bg-[var(--vscode-inputValidation-warningBackground)] border-b border-[var(--vscode-inputValidation-warningBorder)] text-[var(--vscode-foreground)]">
      <span className="flex-1">
        Cherry-pick paused due to conflict. Resolve conflicts in the Source Control panel, then continue.
      </span>
      <button
        onClick={() => rpcClient.continueCherryPick()}
        className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex-shrink-0"
      >
        Continue Cherry-Pick
      </button>
      <button
        onClick={() => rpcClient.abortCherryPick()}
        className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] flex-shrink-0"
      >
        Abort
      </button>
    </div>
  );
}
