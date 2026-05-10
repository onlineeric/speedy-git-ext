import { useMemo, useState } from 'react';
import type { Branch, CompareMode, RefInfo, SlotValue } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { dispatchCompare, effectiveCompareMode } from '../utils/compareDispatch';
import { slotLabel, slotsEqual } from '../utils/compareSlot';
import { FilterableSingleSelectDropdown } from './FilterableSingleSelectDropdown';

/** Discriminator for items shown in the slot dropdown — separates synthetic items
 *  (sentinels, recents heading, free-text expression) from real refs. */
type SlotItem =
  | { type: 'sentinel'; value: SlotValue; label: string; group: 'sentinel' | 'recent' }
  | { type: 'branch'; value: SlotValue; label: string; remote?: string }
  | { type: 'tag'; value: SlotValue; label: string }
  | { type: 'expression'; value: SlotValue; label: string };

function slotItemKey(item: SlotItem): string {
  switch (item.type) {
    case 'sentinel': return `sent:${item.label}:${item.group}`;
    case 'branch': return `br:${item.remote ?? ''}/${item.label}`;
    case 'tag': return `tag:${item.label}`;
    case 'expression': return `expr:${item.label}`;
  }
}

function slotKeyForLookup(value: SlotValue | null): string | undefined {
  if (!value) return undefined;
  switch (value.kind) {
    case 'workingTree': return 'sent:Working Tree:sentinel';
    case 'head': return 'sent:HEAD:sentinel';
    case 'emptyTree': return 'sent:Empty Tree:sentinel';
    case 'branch': return `br:${value.remote ?? ''}/${value.name}`;
    case 'tag': return `tag:${value.name}`;
    case 'commit': return `expr:${value.hash}`;
    case 'expression': return `expr:${value.text.trim()}`;
  }
}

function buildSlotItems(branches: Branch[], tagRefs: RefInfo[], recents: SlotValue[], typedText: string): SlotItem[] {
  const items: SlotItem[] = [];

  // Sentinels first
  items.push({ type: 'sentinel', value: { kind: 'workingTree' }, label: 'Working Tree', group: 'sentinel' });
  items.push({ type: 'sentinel', value: { kind: 'head' }, label: 'HEAD', group: 'sentinel' });

  // Recents (deduped against sentinels above, but still pinned by recency order)
  const recentSeen = new Set<string>();
  for (const r of recents) {
    if (r.kind === 'workingTree' || r.kind === 'head') continue; // already at top
    const key = slotKeyForLookup(r) ?? '';
    if (recentSeen.has(key)) continue;
    recentSeen.add(key);
    items.push({ type: 'sentinel', value: r, label: slotLabel(r), group: 'recent' });
  }

  // Branches (local + remote)
  for (const b of branches) {
    const value: SlotValue = b.remote ? { kind: 'branch', name: b.name, remote: b.remote } : { kind: 'branch', name: b.name };
    items.push({ type: 'branch', value, label: b.remote ? `${b.remote}/${b.name}` : b.name, remote: b.remote });
  }

  // Tags
  const tagSeen = new Set<string>();
  for (const t of tagRefs) {
    if (t.type !== 'tag') continue;
    if (tagSeen.has(t.name)) continue;
    tagSeen.add(t.name);
    items.push({ type: 'tag', value: { kind: 'tag', name: t.name }, label: t.name });
  }

  // Free-text expression — only added when the user has typed something that doesn't already match
  const trimmed = typedText.trim();
  if (trimmed.length > 0) {
    const matchesExisting = items.some((it) => it.label === trimmed || (it.type === 'branch' && it.label === trimmed));
    if (!matchesExisting) {
      items.push({ type: 'expression', value: { kind: 'expression', text: trimmed }, label: trimmed });
    }
  }

  return items;
}

function SlotDropdown({
  role,
  value,
  onSelect,
  onClear,
}: {
  role: 'Base' | 'Target';
  value: SlotValue | null;
  onSelect: (next: SlotValue) => void;
  onClear: () => void;
}) {
  const branches = useGraphStore((s) => s.branches);
  const commits = useGraphStore((s) => s.commits);
  const recents = useGraphStore((s) => s.compareSelection.recents);
  const [typedText, setTypedText] = useState('');

  // Tag refs flow through commit objects' `refs` arrays; flatten them for the dropdown.
  const tagRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: RefInfo[] = [];
    for (const c of commits) {
      for (const r of c.refs) {
        if (r.type !== 'tag') continue;
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        out.push(r);
      }
    }
    return out;
  }, [commits]);

  const items = useMemo(
    () => buildSlotItems(branches, tagRefs, recents, typedText),
    [branches, tagRefs, recents, typedText],
  );

  const selectedKey = slotKeyForLookup(value);

  return (
    <div className="relative inline-flex items-center">
      <FilterableSingleSelectDropdown<SlotItem>
        items={items}
        selectedKey={selectedKey}
        onSelect={(item) => {
          setTypedText('');
          onSelect(item.value);
        }}
        onFilterTextChange={setTypedText}
        getKey={slotItemKey}
        getSearchText={(it) => it.label}
        renderItem={(item, _isSelected, isHighlighted) => (
          <div className={`flex items-center gap-2 px-3 py-1 text-sm ${isHighlighted ? 'bg-[var(--vscode-list-hoverBackground)]' : ''}`}>
            <SlotKindIcon kind={item.value.kind} />
            <span className="flex-1 truncate font-mono">{item.label}</span>
            {item.type === 'sentinel' && item.group === 'recent' && (
              <span className="text-[10px] uppercase text-[var(--vscode-descriptionForeground)]">recent</span>
            )}
            {item.type === 'expression' && (
              <span className="text-[10px] uppercase text-[var(--vscode-descriptionForeground)]">expr</span>
            )}
          </div>
        )}
        renderTrigger={(isOpen) => (
          <button
            type="button"
            className={`flex min-w-[140px] items-center gap-1 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs ${isOpen ? 'ring-1 ring-[var(--vscode-focusBorder)]' : ''}`}
            title={`${role}: ${value ? slotLabel(value) : 'pick a ref'}`}
          >
            {value ? (
              <>
                <SlotKindIcon kind={value.kind} />
                <span className="flex-1 truncate font-mono">{slotLabel(value)}</span>
              </>
            ) : (
              <span className="flex-1 truncate text-[var(--vscode-descriptionForeground)]">{role}</span>
            )}
            <span className="text-[10px] opacity-60">▾</span>
          </button>
        )}
        placeholder="Type a ref, branch, tag, or expression…"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded px-1 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
          title="Clear slot"
          aria-label="Clear slot"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function SlotKindIcon({ kind }: { kind: SlotValue['kind'] }) {
  const glyph = (() => {
    switch (kind) {
      case 'workingTree': return '✎';
      case 'head': return '⌂';
      case 'branch': return '⎇';
      case 'tag': return '🏷';
      case 'commit': return '◉';
      case 'expression': return 'ƒ';
      case 'emptyTree': return '∅';
    }
  })();
  return <span className="opacity-70">{glyph}</span>;
}

export function CompareWidget() {
  const compareSelection = useGraphStore((s) => s.compareSelection);
  const comparePanelUI = useGraphStore((s) => s.comparePanelUI);
  const compareResult = useGraphStore((s) => s.compareResult);
  const setSlotA = useGraphStore((s) => s.setSlotA);
  const setSlotB = useGraphStore((s) => s.setSlotB);
  const swapSlots = useGraphStore((s) => s.swapSlots);
  const setCompareModeOverride = useGraphStore((s) => s.setCompareModeOverride);
  const clearCompareState = useGraphStore((s) => s.clearCompareState);

  const { a, b, modeOverride, recents } = compareSelection;

  // Default mode rule (research Decision 4) — re-applies whenever slot kinds change because
  // the store clears modeOverride on kind change.
  const effectiveMode: CompareMode = (a && b) ? effectiveCompareMode(a, b, modeOverride) : 'two-dot';
  const threeDotDisabled = (a?.kind === 'workingTree' || b?.kind === 'workingTree');

  const slotsAreEqual = a !== null && b !== null && slotsEqual(a, b);
  const compareDisabled = a === null || b === null || slotsAreEqual || comparePanelUI.loading;

  // FR-021a: Reset is available iff there is anything to reset.
  const resetDisabled =
    a === null && b === null && modeOverride === null && recents.length === 0 && compareResult === null;

  const handleCompareClick = () => {
    if (compareDisabled || !a || !b) return;
    dispatchCompare(a, b, effectiveMode);
  };

  const handleResetClick = () => {
    if (resetDisabled) return;
    clearCompareState();
  };

  return (
    <div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase text-[var(--vscode-descriptionForeground)]">Base</span>
        <SlotDropdown
          role="Base"
          value={a}
          onSelect={setSlotA}
          onClear={() => setSlotA(null)}
        />
        <button
          type="button"
          onClick={swapSlots}
          className="rounded p-1 text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-foreground)]"
          title="Swap Base and Target"
          disabled={a === null && b === null}
          aria-label="Swap Base and Target"
        >
          ⇄
        </button>
        <span className="text-xs uppercase text-[var(--vscode-descriptionForeground)]">Target</span>
        <SlotDropdown
          role="Target"
          value={b}
          onSelect={setSlotB}
          onClear={() => setSlotB(null)}
        />

        <span className="mx-2 inline-flex items-center gap-2 text-xs">
          <ModeRadio
            label="2-dot"
            checked={effectiveMode === 'two-dot'}
            disabled={false}
            onClick={() => setCompareModeOverride('two-dot')}
          />
          <ModeRadio
            label="3-dot"
            checked={effectiveMode === 'three-dot'}
            disabled={threeDotDisabled}
            disabledTooltip={threeDotDisabled ? '3-dot does not apply to Working Tree' : undefined}
            onClick={() => !threeDotDisabled && setCompareModeOverride('three-dot')}
          />
        </span>

        <button
          type="button"
          onClick={handleCompareClick}
          disabled={compareDisabled}
          className="ml-2 rounded bg-[var(--vscode-button-background)] px-3 py-1 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
          title={
            slotsAreEqual ? 'A and B are the same'
              : a === null || b === null ? 'Pick a Base and a Target'
                : comparePanelUI.loading ? 'Comparison in progress…'
                  : 'Run compare'
          }
        >
          Compare
        </button>

        {/* FR-021a (042-compare-refs): Reset clears slots, mode override, recents, and result. */}
        <button
          type="button"
          onClick={handleResetClick}
          disabled={resetDisabled}
          className="ml-1 rounded border border-[var(--vscode-button-secondaryBackground,var(--vscode-input-border))] bg-[var(--vscode-button-secondaryBackground)] px-3 py-1 text-xs text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
          title="Reset Base, Target, mode, recents, and any showing result"
        >
          Reset
        </button>
      </div>

      {(slotsAreEqual || comparePanelUI.inlineError) && (
        <div className="mt-1 text-xs text-red-400">
          {slotsAreEqual ? 'A and B are the same' : comparePanelUI.inlineError}
        </div>
      )}
    </div>
  );
}

function ModeRadio({
  label,
  checked,
  disabled,
  disabledTooltip,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  disabledTooltip?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledTooltip : label}
      className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${
        checked
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
          : 'border-[var(--vscode-input-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="font-mono">{checked ? '⦿' : '◯'}</span>
      <span>{label}</span>
    </button>
  );
}

