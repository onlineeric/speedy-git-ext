import { useEffect, useMemo, useState } from 'react';
import type { WorktreeInfo } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { buildPruneWorktreeCommand } from '../utils/gitCommandBuilder';
import { worktreeBranchLabel } from '../utils/worktreeDisplay';
import { ConfirmDialog } from './ConfirmDialog';
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog';
import { RefreshIcon } from './icons';

export function WorktreeWidget() {
  const worktrees = useGraphStore((s) => s.worktreeList);
  const worktreeListLoading = useGraphStore((s) => s.worktreeListLoading);
  const [removeTarget, setRemoveTarget] = useState<WorktreeInfo | null>(null);
  const [pruneOpen, setPruneOpen] = useState(false);

  // Refresh the list whenever the panel opens.
  useEffect(() => {
    rpcClient.getWorktreeList();
  }, []);

  const prunable = useMemo(() => worktrees.filter((w) => w.isPrunable), [worktrees]);

  const pruneDescription =
    prunable.length > 0
      ? `These worktree folders are missing and will have their records removed:\n${prunable.map((w) => w.path).join('\n')}`
      : 'No stale worktrees detected. Pruning removes administrative records for worktrees whose folders have been deleted.';

  return (
    <div className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[var(--vscode-foreground)]">Worktrees</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => rpcClient.getWorktreeList()}
            disabled={worktreeListLoading}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh worktrees"
            aria-label="Refresh worktrees"
          >
            <RefreshIcon className={worktreeListLoading ? 'animate-spin' : undefined} />
          </button>
          <button
            type="button"
            onClick={() => setPruneOpen(true)}
            disabled={worktreeListLoading}
            className="px-2 py-1 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Prune worktrees whose folders are missing"
          >
            Prune
          </button>
        </div>
      </div>

      {worktrees.length === 0 ? (
        <p className="text-sm text-[var(--vscode-descriptionForeground)]">No worktrees.</p>
      ) : (
        <ul className="max-h-[230px] overflow-y-auto rounded border border-[var(--vscode-panel-border)]">
          {worktrees.map((wt, index) => {
            const removable = !wt.isMain && !wt.isCurrent;
            const rowTone = wt.isPrunable
              ? 'bg-[var(--vscode-inputValidation-warningBackground)]'
              : index % 2 === 0
                ? 'bg-transparent'
                : 'bg-[color-mix(in_srgb,var(--vscode-list-hoverBackground)_80%,transparent)]';
            return (
              <li
                key={wt.path}
                className={`flex min-h-[44px] items-center gap-2 border-b border-[var(--vscode-panel-border)] px-2 py-1 last:border-b-0 hover:!bg-[var(--vscode-list-hoverBackground)] ${rowTone}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--vscode-foreground)] truncate">{worktreeBranchLabel(wt)}</span>
                    <span className="font-mono text-xs text-[var(--vscode-descriptionForeground)]">
                      {wt.head.slice(0, 7)}
                    </span>
                    {wt.isMain && <Badge>main</Badge>}
                    {wt.isCurrent && <Badge>you are here</Badge>}
                    {wt.isPrunable && <Badge tone="warning">stale</Badge>}
                  </div>
                  <div className="font-mono text-xs text-[var(--vscode-descriptionForeground)] truncate" title={wt.path}>
                    {wt.path}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <RowButton onClick={() => rpcClient.openWorktree(wt.path)} disabled={wt.isPrunable}>Open</RowButton>
                  <RowButton onClick={() => rpcClient.revealWorktree(wt.path)}>Reveal</RowButton>
                  {removable && (
                    <RowButton tone="danger" onClick={() => setRemoveTarget(wt)}>
                      Remove
                    </RowButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pruneOpen}
        onConfirm={() => {
          setPruneOpen(false);
          if (worktreeListLoading) return;
          rpcClient.pruneWorktree();
        }}
        onCancel={() => setPruneOpen(false)}
        title="Prune Worktrees"
        description={pruneDescription}
        confirmLabel="Prune"
        variant="warning"
        commandPreview={buildPruneWorktreeCommand()}
      />

      {removeTarget && (
        <RemoveWorktreeDialog
          open={removeTarget !== null}
          worktree={removeTarget}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warning' }) {
  const cls =
    tone === 'warning'
      ? 'bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-foreground)]'
      : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${cls}`}>{children}</span>;
}

function RowButton({
  children,
  onClick,
  tone = 'default',
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  const cls =
    tone === 'danger'
      ? 'text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
      : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 text-xs rounded disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
