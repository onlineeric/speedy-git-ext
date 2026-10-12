import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SettingDraft, SettingSaveOutcome } from '../utils/settingDrafts';

interface SettingDraftRegistry {
  register: (draft: SettingDraft) => void;
  unregister: (id: string) => void;
}

interface SettingDraftScopeValue {
  registry: SettingDraftRegistry;
  tabId: string;
}

const SettingDraftScopeContext = createContext<SettingDraftScopeValue | null>(null);

/**
 * The dialog's side: the registry its settings register with, and the drafts
 * registered so far, in registration order (which is dialog order).
 */
export function useSettingDraftRegistry(): { registry: SettingDraftRegistry; drafts: SettingDraft[] } {
  const [drafts, setDrafts] = useState<SettingDraft[]>([]);
  const registry = useMemo<SettingDraftRegistry>(
    () => ({
      register: (draft) =>
        setDrafts((current) => {
          const index = current.findIndex((entry) => entry.id === draft.id);
          if (index === -1) return [...current, draft];
          const next = [...current];
          next[index] = draft;
          return next;
        }),
      unregister: (id) => setDrafts((current) => current.filter((entry) => entry.id !== id)),
    }),
    [],
  );
  return { registry, drafts };
}

/**
 * Wraps one dialog tab's content, so a setting inside it registers under that
 * tab without having to know which tab it is placed on.
 */
export function SettingDraftScope({
  registry,
  tabId,
  children,
}: {
  registry: SettingDraftRegistry;
  tabId: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ registry, tabId }), [registry, tabId]);
  return <SettingDraftScopeContext.Provider value={value}>{children}</SettingDraftScopeContext.Provider>;
}

/**
 * A setting's side: report this draft to the enclosing dialog. Outside a
 * `SettingDraftScope` it does nothing.
 *
 * `save`/`discard` are read through a ref, so the registration changes only
 * when what the footer shows changes, not on every render.
 */
export function useRegisterSettingDraft({
  id,
  label,
  isDirty,
  save,
  discard,
}: {
  id: string;
  label: string;
  isDirty: boolean;
  save: () => Promise<SettingSaveOutcome>;
  discard: () => void;
}): void {
  const scope = useContext(SettingDraftScopeContext);
  const actions = useRef({ save, discard });
  useEffect(() => {
    actions.current = { save, discard };
  });

  useEffect(() => {
    if (!scope) return;
    scope.registry.register({
      id,
      label,
      tabId: scope.tabId,
      isDirty,
      save: () => actions.current.save(),
      discard: () => actions.current.discard(),
    });
  }, [scope, id, label, isDirty]);

  useEffect(() => {
    if (!scope) return;
    return () => scope.registry.unregister(id);
  }, [scope, id]);
}
