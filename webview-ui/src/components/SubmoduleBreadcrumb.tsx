import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

export function SubmoduleBreadcrumb() {
  const submoduleStack = useGraphStore((state) => state.submoduleStack);

  if (submoduleStack.length === 0) {
    return null;
  }

  const trail = [...submoduleStack.map((entry) => entry.repoName), 'Current'];

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-4 py-2">
      <div className="truncate text-xs text-[var(--vscode-descriptionForeground)]">
        {trail.join(' / ')}
      </div>

      <button
        type="button"
        onClick={() => rpcClient.backToParentRepo()}
        className="rounded px-2 py-1 text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
      >
        Back to parent
      </button>
    </div>
  );
}
