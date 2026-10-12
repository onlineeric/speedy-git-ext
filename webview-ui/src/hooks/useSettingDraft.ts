import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { nextDraftOnSavedChange } from '../utils/settingDrafts';

/**
 * One setting's editable copy in the Settings dialog.
 *
 * `toDraft` and `isChanged` should be module-level functions: they are read on
 * every saved-value change, and `isChanged` decides what counts as unsaved (a
 * comparison in saved form, so a trailing space is not an edit).
 */
export function useSettingDraft<TSaved, TDraft>(
  saved: TSaved,
  toDraft: (saved: TSaved) => TDraft,
  isChanged: (draft: TDraft, saved: TSaved) => boolean,
): {
  draft: TDraft;
  setDraft: Dispatch<SetStateAction<TDraft>>;
  isDirty: boolean;
  discard: () => void;
} {
  const [draft, setDraft] = useState(() => toDraft(saved));
  const lastSaved = useRef(saved);

  // The saved value can change from VS Code's settings, or echo back after
  // Save. The store keeps its identity while its content is unchanged, so a
  // change to any other setting never resets this draft.
  useEffect(() => {
    const previous = lastSaved.current;
    lastSaved.current = saved;
    if (previous === saved) return;
    setDraft((current) => nextDraftOnSavedChange(current, previous, saved, toDraft, isChanged));
  }, [saved, toDraft, isChanged]);

  return {
    draft,
    setDraft,
    isDirty: isChanged(draft, saved),
    discard: () => setDraft(toDraft(saved)),
  };
}
