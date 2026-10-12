import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from '../utils/tabNavigation';

export interface DialogTab<TabId extends string> {
  id: TabId;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

/**
 * Tabs inside a dialog, styled like VS Code's own panel tabs.
 *
 * Every panel stays mounted and the panels are stacked in one grid cell, with
 * only the active one visible. That keeps the dialog's size steady when
 * switching tabs (it is sized by the largest panel, not the current one), and
 * keeps unsaved edits in a panel the user has tabbed away from.
 */
export function DialogTabs<TabId extends string>({
  idPrefix,
  tabs,
  activeTabId,
  onActiveTabChange,
}: {
  idPrefix: string;
  tabs: readonly DialogTab<TabId>[];
  activeTabId: TabId;
  onActiveTabChange: (tabId: TabId) => void;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (id: TabId) => `${idPrefix}-tab-${id}`;
  const panelId = (id: TabId) => `${idPrefix}-panel-${id}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    const nextIndex = nextTabIndex(currentIndex, tabs.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    onActiveTabChange(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        onKeyDown={handleKeyDown}
        className="mb-4 flex shrink-0 gap-4 border-b border-[var(--vscode-panel-border)]"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={active}
              aria-controls={panelId(tab.id)}
              tabIndex={active ? 0 : -1}
              onClick={() => onActiveTabChange(tab.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-1.5 text-xs uppercase tracking-[0.04em] focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--vscode-focusBorder)] ${
                active
                  ? 'border-[var(--vscode-panelTitle-activeBorder)] text-[var(--vscode-panelTitle-activeForeground)]'
                  : 'border-transparent text-[var(--vscode-panelTitle-inactiveForeground)] hover:text-[var(--vscode-panelTitle-activeForeground)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 overflow-y-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={panelId(tab.id)}
              aria-labelledby={tabId(tab.id)}
              aria-hidden={!active}
              style={{ gridArea: '1 / 1' }}
              className={`min-w-0 ${active ? '' : 'invisible'}`}
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
