import { useCallback, useMemo } from 'react';
import type { Branch } from '@shared/types';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface MultiBranchDropdownProps {
  branches: Branch[];
  selectedBranches: string[];
  onBranchToggle: (branch: string) => void;
  onClearSelection: () => void;
}

function getBranchKey(branch: Branch): string {
  return branch.remote ? `${branch.remote}/${branch.name}` : branch.name;
}

function getBranchSearchText(branch: Branch): string {
  return branch.remote ? `${branch.remote}/${branch.name}` : branch.name;
}

function getBranchGroup(branch: Branch): string {
  return branch.remote ? 'Remote' : 'Local';
}

export function MultiBranchDropdown({
  branches,
  selectedBranches,
  onBranchToggle,
  onClearSelection,
}: MultiBranchDropdownProps) {
  const selectedItems = useMemo(
    () => branches.filter((b) => selectedBranches.includes(getBranchKey(b))),
    [branches, selectedBranches],
  );

  const handleToggle = useCallback(
    (branch: Branch) => onBranchToggle(getBranchKey(branch)),
    [onBranchToggle],
  );

  const renderTrigger = useCallback(
    (selectedCount: number) => {
      const label =
        selectedCount === 0
          ? 'All Branches'
          : selectedCount === 1
            ? selectedBranches[0]
            : `${selectedCount} branches selected`;
      return (
        <button
          className="px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[300px] flex items-center gap-1"
          title={label}
        >
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
    [selectedBranches],
  );

  const renderItem = useCallback(
    (branch: Branch, isSelected: boolean) => (
      <span className="flex items-center gap-2">
        <span className="w-4 flex-shrink-0 text-center">
          {isSelected ? '✓' : ''}
        </span>
        <span className="truncate">
          {getBranchKey(branch)}
          {branch.current ? ' *' : ''}
        </span>
      </span>
    ),
    [],
  );

  return (
    <MultiSelectDropdown<Branch>
      items={branches}
      selectedItems={selectedItems}
      onToggle={handleToggle}
      onClearAll={onClearSelection}
      getKey={getBranchKey}
      getSearchText={getBranchSearchText}
      renderItem={renderItem}
      renderTrigger={renderTrigger}
      groupBy={getBranchGroup}
      placeholder="Filter branches..."
      clearAllLabel="All Branches"
    />
  );
}
