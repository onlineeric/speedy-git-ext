import { useCallback, useMemo } from 'react';
import type { Submodule } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { FilterableSingleSelectDropdown } from './FilterableSingleSelectDropdown';

interface SubmoduleOption {
  kind: 'parent' | 'submodule';
  label: string;
  /** 'parent' for the parent option; submodule.path for submodule options. */
  value: 'parent' | string;
}

const TRIGGER_CLASS =
  'px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[300px] flex items-center gap-1';

/**
 * Compute the basename of a forward-slash-or-backslash separated path. Works in
 * the webview where Node's `path` module is unavailable.
 */
function basename(p: string): string {
  if (!p) return '';
  const normalized = p.replace(/[\\/]+$/, '');
  const lastSlash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

function buildSubmoduleOptions(
  parentPath: string,
  initializedSubmodules: Submodule[],
): SubmoduleOption[] {
  const parentName = basename(parentPath);
  const parentOption: SubmoduleOption = {
    kind: 'parent',
    label: `${parentName} (parent)`,
    value: 'parent',
  };
  const submoduleOptions: SubmoduleOption[] = initializedSubmodules
    .map<SubmoduleOption>((s) => ({
      kind: 'submodule',
      label: basename(s.path),
      value: s.path,
    }))
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

  return [parentOption, ...submoduleOptions];
}

function getOptionKey(option: SubmoduleOption): string {
  return option.value;
}

function getOptionSearchText(option: SubmoduleOption): string {
  return option.label;
}

export function SubmoduleSelector() {
  const activeParentRepoPath = useGraphStore((s) => s.activeParentRepoPath);
  const submodules = useGraphStore((s) => s.submodules);
  const submoduleSelection = useGraphStore((s) => s.submoduleSelection);
  const setSubmoduleSelection = useGraphStore((s) => s.setSubmoduleSelection);

  const initializedSubmodules = useMemo(
    () => submodules.filter((s) => s.initialized),
    [submodules],
  );

  const options = useMemo(
    () => buildSubmoduleOptions(activeParentRepoPath, initializedSubmodules),
    [activeParentRepoPath, initializedSubmodules],
  );

  const handleSelect = useCallback(
    (option: SubmoduleOption) => {
      setSubmoduleSelection(option.value);
    },
    [setSubmoduleSelection],
  );

  const renderTrigger = useCallback(
    () => {
      const activeOption = options.find((o) => o.value === submoduleSelection) ?? options[0];
      const label = activeOption?.label ?? '';
      return (
        <button className={TRIGGER_CLASS} title={label} aria-label="Select submodule">
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
    [options, submoduleSelection],
  );

  const renderItem = useCallback(
    (option: SubmoduleOption) => <span className="truncate">{option.label}</span>,
    [],
  );

  if (initializedSubmodules.length === 0) return null;

  return (
    <FilterableSingleSelectDropdown<SubmoduleOption>
      items={options}
      selectedKey={submoduleSelection}
      onSelect={handleSelect}
      getKey={getOptionKey}
      getSearchText={getOptionSearchText}
      renderItem={renderItem}
      renderTrigger={renderTrigger}
      placeholder="Filter submodules..."
    />
  );
}
