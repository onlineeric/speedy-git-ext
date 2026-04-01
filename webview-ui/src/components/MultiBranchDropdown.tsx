import { useState, useRef, useEffect, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { Branch } from '@shared/types';

// --- Flat list item types ---

interface AllBranchesItem {
  type: 'all';
}

interface GroupHeaderItem {
  type: 'header';
  label: string;
}

interface BranchItem {
  type: 'branch';
  branch: Branch;
  displayName: string;
  value: string;
}

type ListItem = AllBranchesItem | GroupHeaderItem | BranchItem;

// --- Pure helpers (no closures) ---

function isSelectable(item: ListItem): boolean {
  return item.type === 'all' || item.type === 'branch';
}

function findFirstSelectable(items: ListItem[]): number {
  for (let i = 0; i < items.length; i++) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

function findNextSelectable(items: ListItem[], from: number, direction: 1 | -1): number {
  let i = from + direction;
  while (i >= 0 && i < items.length) {
    if (isSelectable(items[i])) return i;
    i += direction;
  }
  return from;
}

function clampHighlightedIndex(items: ListItem[], index: number): number {
  if (index < 0 || items.length === 0) return -1;
  if (index < items.length && isSelectable(items[index])) return index;
  for (let i = Math.min(index, items.length - 1); i >= 0; i--) {
    if (isSelectable(items[i])) return i;
  }
  return findFirstSelectable(items);
}

function getItemId(index: number): string {
  return `multi-branch-dropdown-item-${index}`;
}

// --- Props ---

interface MultiBranchDropdownProps {
  branches: Branch[];
  selectedBranches: string[];
  onBranchToggle: (branch: string) => void;
  onClearSelection: () => void;
}

// --- Component ---

export function MultiBranchDropdown({
  branches,
  selectedBranches,
  onBranchToggle,
  onClearSelection,
}: MultiBranchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [rawHighlightedIndex, setHighlightedIndex] = useState(-1);
  const [listNavigationMode, setListNavigationMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // --- Filtered list ---

  const filteredList = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [{ type: 'all' }];
    const lowerFilter = filterText.toLowerCase();

    const localBranches = branches.filter((b) => !b.remote);
    const remoteBranches = branches.filter((b) => b.remote);

    const matchedLocal = localBranches.filter((b) =>
      b.name.toLowerCase().includes(lowerFilter),
    );
    if (matchedLocal.length > 0) {
      items.push({ type: 'header', label: 'Local' });
      for (const b of matchedLocal) {
        items.push({
          type: 'branch',
          branch: b,
          displayName: b.name,
          value: b.name,
        });
      }
    }

    const matchedRemote = remoteBranches.filter((b) =>
      `${b.remote}/${b.name}`.toLowerCase().includes(lowerFilter),
    );
    if (matchedRemote.length > 0) {
      items.push({ type: 'header', label: 'Remote' });
      for (const b of matchedRemote) {
        const fullName = `${b.remote}/${b.name}`;
        items.push({
          type: 'branch',
          branch: b,
          displayName: fullName,
          value: fullName,
        });
      }
    }

    return items;
  }, [branches, filterText]);

  // Derive safe highlighted index (clamp without useEffect + setState)
  const highlightedIndex = clampHighlightedIndex(filteredList, rawHighlightedIndex);

  // --- Open/Close handlers ---

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFilterText('');
      setHighlightedIndex(-1);
      setListNavigationMode(false);
    }
  };

  const handleItemClick = (item: ListItem) => {
    if (item.type === 'all') {
      onClearSelection();
    } else if (item.type === 'branch') {
      onBranchToggle(item.value);
    }
    // Dropdown stays open — no setOpen(false)
  };

  // --- Auto-focus input on open ---

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // --- Scroll highlighted item into view ---

  useEffect(() => {
    if (highlightedIndex >= 0) {
      const el = itemRefs.current.get(highlightedIndex);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // --- Keyboard handler ---

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (!listNavigationMode) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const firstIdx = findFirstSelectable(filteredList);
        if (firstIdx >= 0) {
          setListNavigationMode(true);
          setHighlightedIndex(firstIdx);
        }
        return;
      }
    } else {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(findNextSelectable(filteredList, highlightedIndex, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(findNextSelectable(filteredList, highlightedIndex, -1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleItemClick(filteredList[highlightedIndex]);
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        return;
      }
      // Type-to-redirect: printable character while in list mode
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setListNavigationMode(false);
        setHighlightedIndex(-1);
        setFilterText((prev) => prev + e.key);
        inputRef.current?.focus();
        return;
      }
    }
  };

  // --- Ref callback for list items ---

  const setItemRef = (index: number, el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(index, el);
    } else {
      itemRefs.current.delete(index);
    }
  };

  // --- Trigger label ---

  const triggerLabel =
    selectedBranches.length === 0
      ? 'All Branches'
      : selectedBranches.length === 1
        ? selectedBranches[0]
        : `${selectedBranches.length} branches selected`;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          className="px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[300px] flex items-center gap-1"
          title={triggerLabel}
        >
          <span className="truncate">{triggerLabel}</span>
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
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-[360px] rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50 flex flex-col"
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Filter input */}
          <div className="p-1.5 border-b border-[var(--vscode-menu-border)]">
            <input
              ref={inputRef}
              type="text"
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setHighlightedIndex(-1);
                setListNavigationMode(false);
              }}
              placeholder="Filter branches..."
              role="combobox"
              aria-expanded={open}
              aria-controls="multi-branch-dropdown-listbox"
              aria-activedescendant={
                highlightedIndex >= 0
                  ? getItemId(highlightedIndex)
                  : undefined
              }
              className="w-full px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            />
          </div>

          {/* Branch list */}
          <div
            role="listbox"
            id="multi-branch-dropdown-listbox"
            aria-multiselectable="true"
            className="max-h-[300px] overflow-y-auto py-1"
          >
            {filteredList.map((item, index) => {
              if (item.type === 'header') {
                return (
                  <div
                    key={`header-${item.label}`}
                    className="px-3 py-1 text-xs font-semibold text-[var(--vscode-descriptionForeground)] uppercase tracking-wide select-none"
                  >
                    {item.label}
                  </div>
                );
              }

              const isSelected = item.type === 'branch' && selectedBranches.includes(item.value);
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={item.type === 'all' ? '__all__' : item.value}
                  id={getItemId(index)}
                  ref={(el) => setItemRef(index, el)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleItemClick(item)}
                  className={`px-3 py-1 text-sm cursor-pointer truncate flex items-center gap-2 ${
                    isHighlighted
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                      : 'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  {item.type === 'all' ? (
                    'All Branches'
                  ) : (
                    <>
                      <span className="w-4 flex-shrink-0 text-center">
                        {isSelected ? '✓' : ''}
                      </span>
                      <span className="truncate">
                        {item.displayName}
                        {item.branch.current ? ' *' : ''}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
