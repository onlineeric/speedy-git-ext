import { useState } from 'react';
import { saveUnsavedDrafts, tabsWithUnsavedDrafts, unsavedDrafts, type SettingDraft } from '../utils/settingDrafts';
import { trackUiInteraction } from '../utils/telemetry';

/**
 * The Settings dialog's handling of unsaved settings: the footer's Save / Save
 * and Close / Discard and Close, and the guard that keeps the dialog open.
 *
 * While anything is unsaved, the dialog refuses every other way of closing
 * (Esc, a click outside) and flashes the footer instead, so the only ways out
 * are the footer's two explicit choices. A failed save keeps the dialog open on
 * the tab that needs attention.
 */
export function useUnsavedSettings({
  drafts,
  setOpen,
  showTab,
}: {
  drafts: readonly SettingDraft[];
  setOpen: (open: boolean) => void;
  showTab: (tabId: string) => void;
}) {
  const unsaved = unsavedDrafts(drafts);
  const hasUnsaved = unsaved.length > 0;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped on each refused close; the footer replays its flash per value. */
  const [refusedCloseCount, setRefusedCloseCount] = useState(0);

  const close = () => {
    setError(null);
    setRefusedCloseCount(0);
    setOpen(false);
  };

  /** Radix's `onOpenChange`: Esc, a click outside, and the plain Close button all land here. */
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setOpen(true);
    } else if (hasUnsaved) {
      setRefusedCloseCount((count) => count + 1);
    } else {
      close();
    }
  };

  const save = async (closeAfter: boolean) => {
    trackUiInteraction('settingsDialog', closeAfter ? 'settingsSaveAndClose' : 'settingsSave');
    setSaving(true);
    setError(null);
    const result = await saveUnsavedDrafts(drafts);
    setSaving(false);
    if (result.ok) {
      if (closeAfter) close();
      return;
    }
    showTab(result.tabId);
    if (result.message) setError(result.message);
  };

  const discardAndClose = () => {
    trackUiInteraction('settingsDialog', 'settingsDiscardAndClose');
    unsaved.forEach((draft) => draft.discard());
    close();
  };

  return {
    unsavedLabels: unsaved.map((draft) => draft.label),
    unsavedTabs: tabsWithUnsavedDrafts(drafts),
    saving,
    // An error belongs to an unsaved edit; once nothing is unsaved it has no subject.
    error: hasUnsaved ? error : null,
    refusedCloseCount,
    handleOpenChange,
    save: () => void save(false),
    saveAndClose: () => void save(true),
    discardAndClose,
  };
}
