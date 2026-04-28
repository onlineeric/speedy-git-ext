import { useState, useRef, useEffect, useMemo, memo, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';

// --- Flat list item types ---

interface DataItem<T> {
  type: 'data';
  item: T;
  key: string;
}

type ListItem<T> = DataItem<T>;

// --- Pure helpers ---

function isSelectable<T>(item: ListItem<T>): boolean {
  return item.type === 'data';
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

export interface FilterableSingleSelectDropdownProps<T> {
  items: T[];
  /** Key of the currently selected item, or undefined when nothing is selected. */
  selectedKey: string | undefined;
  onSelect: (item: T) => void;
  getKey: (item: T) => string;
  getSearchText: (item: T) => string;
  renderItem: (item: T, isSelected: boolean, isHighlighted: boolean) => ReactNode;
  renderTrigger: (isOpen: boolean) => ReactNode;
  placeholder?: string;
  className?: string;
}

// --- Component ---

let dropdownIdCounter = 0;

function FilterableSingleSelectDropdownInner<T>({
  items,
  selectedKey,
  onSelect,
  getKey,
  getSearchText,
  renderItem,
  renderTrigger,
  placeholder = 'Filter...',
  className,
}: FilterableSingleSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [rawHighlightedIndex, setHighlightedIndex] = useState(-1);
  const [listNavigationMode, setListNavigationMode] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const idRef = useRef(`filterable-single-select-${++dropdownIdCounter}`);
  const dropdownId = idRef.current;

  // Guard: suppress false popover closes caused by synchronous re-renders during item clicks.
  const isSelectingRef = useRef(false);

  // --- Filtered list ---

  const filteredList = useMemo<ListItem<T>[]>(() => {
    const lowerFilter = filterText.toLowerCase();
    const matched = items.filter((item) =>
      getSearchText(item).toLowerCase().includes(lowerFilter),
    );
    return matched.map<ListItem<T>>((item) => ({ type: 'data', item, key: getKey(item) }));
  }, [items, filterText, getKey, getSearchText]);

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
    if (item.type === 'data') {
      onSelect(item.item);
    }
    requestAnimationFrame(() => {
      isSelectingRef.current = false;
    });
    // Single-select closes the popover after selection.
    setOpen(false);
    setFilterText('');
    setHighlightedIndex(-1);
    setListNavigationMode(false);
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
      <Popover.Trigger asChild>{renderTrigger(open)}</Popover.Trigger>
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
            className="max-h-[300px] overflow-y-auto py-1"
          >
            {filteredList.map((listItem, index) => {
              const isSelected = listItem.key === selectedKey;
              const isHighlighted = index === highlightedIndex;

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

// Memoize to prevent re-renders from parent store updates that don't affect this dropdown.
export const FilterableSingleSelectDropdown = memo(
  FilterableSingleSelectDropdownInner,
) as typeof FilterableSingleSelectDropdownInner;
