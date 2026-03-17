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
  // Find nearest selectable going backwards from end
  for (let i = Math.min(index, items.length - 1); i >= 0; i--) {
    if (isSelectable(items[i])) return i;
  }
  return findFirstSelectable(items);
}

function getItemId(index: number): string {
  return `branch-dropdown-item-${index}`;
}

// --- Props ---

interface FilterableBranchDropdownProps {
  branches: Branch[];
  selectedBranch: string | undefined;
  onBranchSelect: (branch: string | undefined) => void;
}

// --- Component ---

export function FilterableBranchDropdown({
  branches,
  selectedBranch,
  onBranchSelect,
}: FilterableBranchDropdownProps) {
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

  const resetState = () => {
    setFilterText('');
    setHighlightedIndex(-1);
    setListNavigationMode(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const selectBranch = (value: string | undefined) => {
    onBranchSelect(value);
    setOpen(false);
    resetState();
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
      resetState();
      return;
    }

    if (!listNavigationMode) {
      // Input mode
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
      // List navigation mode
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
          selectItem(filteredList[highlightedIndex]);
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

  // --- Item selection (used by both click and keyboard Enter) ---

  const selectItem = (item: ListItem) => {
    if (item.type === 'all') {
      selectBranch(undefined);
    } else if (item.type === 'branch') {
      selectBranch(item.value);
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

  const triggerLabel = selectedBranch ?? 'All Branches';

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          className="px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] text-left truncate min-w-[120px] max-w-[200px]"
          title={triggerLabel}
        >
          {triggerLabel}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-[280px] rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50 flex flex-col"
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
              aria-controls="branch-dropdown-listbox"
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
            id="branch-dropdown-listbox"
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

              const itemValue = item.type === 'all' ? undefined : item.value;
              const isSelected = selectedBranch === itemValue;
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={item.type === 'all' ? '__all__' : item.value}
                  id={getItemId(index)}
                  ref={(el) => setItemRef(index, el)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectItem(item)}
                  className={`px-3 py-1 text-sm cursor-pointer truncate ${
                    isHighlighted
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                      : 'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  {item.type === 'all' ? (
                    'All Branches'
                  ) : (
                    <>
                      {item.displayName}
                      {item.branch.current ? ' *' : ''}
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
