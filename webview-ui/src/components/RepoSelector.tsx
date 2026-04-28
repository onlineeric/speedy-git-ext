import { useCallback } from 'react';
import type { RepoInfo } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { FilterableSingleSelectDropdown } from './FilterableSingleSelectDropdown';

const TRIGGER_CLASS =
  'px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[300px] flex items-center gap-1';

function getRepoKey(repo: RepoInfo): string {
  return repo.path;
}

function getRepoSearchText(repo: RepoInfo): string {
  return repo.displayName;
}

export function RepoSelector() {
  const repos = useGraphStore((s) => s.repos);
  const activeParentRepoPath = useGraphStore((s) => s.activeParentRepoPath);
  const setActiveRepo = useGraphStore((s) => s.setActiveRepo);

  const handleSelect = useCallback(
    (repo: RepoInfo) => {
      setActiveRepo(repo.path);
    },
    [setActiveRepo],
  );

  const renderTrigger = useCallback(
    () => {
      const activeRepo = repos.find((r) => r.path === activeParentRepoPath);
      const label = activeRepo?.displayName ?? '';
      return (
        <button className={TRIGGER_CLASS} title={label} aria-label="Select repository">
          <span className="truncate">{label}</span>
          <svg
            className="ml-auto flex-shrink-0"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      );
    },
    [repos, activeParentRepoPath],
  );

  const renderItem = useCallback(
    (repo: RepoInfo) => <span className="truncate">{repo.displayName}</span>,
    [],
  );

  if (repos.length <= 1) return null;

  return (
    <FilterableSingleSelectDropdown<RepoInfo>
      items={repos}
      selectedKey={activeParentRepoPath}
      onSelect={handleSelect}
      getKey={getRepoKey}
      getSearchText={getRepoSearchText}
      renderItem={renderItem}
      renderTrigger={renderTrigger}
      placeholder="Filter repositories..."
    />
  );
}
