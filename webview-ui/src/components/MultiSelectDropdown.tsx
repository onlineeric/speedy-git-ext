import { useState, useRef, useEffect, useMemo, memo, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';

// --- Flat list item types ---

interface ClearAllItem {
  type: 'clearAll';
}

interface GroupHeaderItem {
  type: 'header';
  label: string;
}

interface DataItem<T> {
  type: 'data';
  item: T;
  key: string;
}

type ListItem<T> = ClearAllItem | GroupHeaderItem | DataItem<T>;

// --- Pure helpers ---

function isSelectable<T>(item: ListItem<T>): boolean {
  return item.type === 'clearAll' || item.type === 'data';
}

function findFirstSelectable<T>(items: ListItem<T>[]): number {
  for (let i = 0; i < items.length; i++) {
    if (isSelectable(items[i])) return i;
  }
  return -1;
}

function findNextSelectable<T>(items: ListItem<T>[], from: number, direction: 1 | -1): number {
  let i = from + direction;
  while (i >= 0 && i < items.length) {
    if (isSelectable(items[i])) return i;
    i += direction;
  }
  return from;
}

function clampHighlightedIndex<T>(items: ListItem<T>[], index: number): number {
  if (index < 0 || items.length === 0) return -1;
  if (index < items.length && isSelectable(items[index])) return index;
  for (let i = Math.min(index, items.length - 1); i >= 0; i--) {
    if (isSelectable(items[i])) return i;
  }
  return findFirstSelectable(items);
}

// --- Props ---

export interface MultiSelectDropdownProps<T> {
  items: T[];
  selectedItems: T[];
  onToggle: (item: T) => void;
  onClearAll: () => void;
  getKey: (item: T) => string;
  getSearchText: (item: T) => string;
  renderItem: (item: T, isSelected: boolean, isHighlighted: boolean) => ReactNode;
  renderTrigger: (selectedCount: number, isOpen: boolean) => ReactNode;
  groupBy?: (item: T) => string;
  placeholder?: string;
  clearAllLabel?: string;
  className?: string;
}

// --- Component ---

let dropdownIdCounter = 0;

function MultiSelectDropdownInner<T>({
  items,
  selectedItems,
  onToggle,
  onClearAll,
  getKey,
  getSearchText,
  renderItem,
  renderTrigger,
  groupBy,
  placeholder = 'Filter...',
  clearAllLabel = 'All',
  className,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [rawHighlightedIndex, setHighlightedIndex] = useState(-1);
  const [listNavigationMode, setListNavigationMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const idRef = useRef(`multi-select-dropdown-${++dropdownIdCounter}`);
  const dropdownId = idRef.current;

  useEffect(() => {
    console.log(`[MSD:${dropdownId}] MOUNT (items=${items.length})`);
    return () => console.log(`[MSD:${dropdownId}] UNMOUNT`);
  }, []);
  useEffect(() => {
    console.log(`[MSD:${dropdownId}] open changed to:`, open);
  }, [open]);

  // Guard: suppress false popover closes caused by synchronous re-renders during item clicks.
  // When onToggle/onClearAll triggers a store update, React may re-render this component synchronously,
  // causing Radix's dismiss layer to misidentify the interaction as "outside" the content.
  const isSelectingRef = useRef(false);

  const selectedKeySet = useMemo(
    () => new Set(selectedItems.map(getKey)),
    [selectedItems, getKey],
  );

  // --- Filtered & grouped list ---

  const filteredList = useMemo<ListItem<T>[]>(() => {
    const result: ListItem<T>[] = [{ type: 'clearAll' }];
    const lowerFilter = filterText.toLowerCase();

    const matched = items.filter((item) =>
      getSearchText(item).toLowerCase().includes(lowerFilter),
    );

    if (groupBy) {
      const groups = new Map<string, T[]>();
      for (const item of matched) {
        const group = groupBy(item);
        let list = groups.get(group);
        if (!list) {
          list = [];
          groups.set(group, list);
        }
        list.push(item);
      }
      for (const [label, groupItems] of groups) {
        result.push({ type: 'header', label });
        for (const item of groupItems) {
          result.push({ type: 'data', item, key: getKey(item) });
        }
      }
    } else {
      for (const item of matched) {
        result.push({ type: 'data', item, key: getKey(item) });
      }
    }

    return result;
  }, [items, filterText, getKey, getSearchText, groupBy]);

  const highlightedIndex = clampHighlightedIndex(filteredList, rawHighlightedIndex);

  // --- Open/Close handlers ---

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSelectingRef.current) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setFilterText('');
      setHighlightedIndex(-1);
      setListNavigationMode(false);
    }
  };

  const handleItemClick = (item: ListItem<T>) => {
    isSelectingRef.current = true;
    if (item.type === 'clearAll') {
      onClearAll();
    } else if (item.type === 'data') {
      onToggle(item.item);
    }
    requestAnimationFrame(() => {
      isSelectingRef.current = false;
    });
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

  const getItemId = (index: number) => `${dropdownId}-item-${index}`;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        {renderTrigger(selectedItems.length, open)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className={`w-[360px] rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50 flex flex-col ${className ?? ''}`}
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
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
              placeholder={placeholder}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${dropdownId}-listbox`}
              aria-activedescendant={
                highlightedIndex >= 0 ? getItemId(highlightedIndex) : undefined
              }
              className="w-full px-2 py-1 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            />
          </div>

          <div
            role="listbox"
            id={`${dropdownId}-listbox`}
            aria-multiselectable="true"
            className="max-h-[300px] overflow-y-auto py-1"
          >
            {filteredList.map((listItem, index) => {
              if (listItem.type === 'header') {
                return (
                  <div
                    key={`header-${listItem.label}`}
                    className="px-3 py-1 text-xs font-semibold text-[var(--vscode-descriptionForeground)] uppercase tracking-wide select-none"
                  >
                    {listItem.label}
                  </div>
                );
              }

              const isSelected = listItem.type === 'data' && selectedKeySet.has(listItem.key);
              const isHighlighted = index === highlightedIndex;

              if (listItem.type === 'clearAll') {
                return (
                  <div
                    key="__clear_all__"
                    id={getItemId(index)}
                    ref={(el) => setItemRef(index, el)}
                    role="option"
                    aria-selected={false}
                    onClick={() => handleItemClick(listItem)}
                    className={`px-3 py-1 text-sm cursor-pointer truncate ${
                      isHighlighted
                        ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                        : 'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                    }`}
                  >
                    {clearAllLabel}
                  </div>
                );
              }

              return (
                <div
                  key={listItem.key}
                  id={getItemId(index)}
                  ref={(el) => setItemRef(index, el)}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleItemClick(listItem)}
                  className={`px-3 py-1 text-sm cursor-pointer truncate ${
                    isHighlighted
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                      : 'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  {renderItem(listItem.item, isSelected, isHighlighted)}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Memoize to prevent re-renders from parent store updates (e.g., commits/topology changes)
// that don't affect the dropdown's own state.
export const MultiSelectDropdown = memo(MultiSelectDropdownInner) as typeof MultiSelectDropdownInner;
