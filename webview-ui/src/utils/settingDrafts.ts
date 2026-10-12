/**
 * Unsaved changes in the Settings dialog.
 *
 * A setting that takes effect on click (a checkbox, a dropdown) is written at
 * once and never appears here. A setting edited as text or as a list holds a
 * draft until the user saves it, and registers a `SettingDraft` with the
 * dialog. The dialog's footer reads the registered drafts alone, so a new
 * setting gets the unsaved-changes summary, Save, and the close guard by
 * registering. The dialog itself needs no change.
 */

/** What one setting's `save()` came to. */
export type SettingSaveOutcome =
  | { ok: true }
  /** The draft has errors; the setting shows them on its own fields. */
  | { ok: false; reason: 'invalid' }
  /** The write itself failed; the dialog shows `message`. */
  | { ok: false; reason: 'failed'; message: string };

/** The backend's answer to a settings write the dialog waits for. */
export type SettingSaveReply = { ok: true } | { ok: false; message: string };

export interface SettingDraft {
  /** Stable per setting, e.g. `customAutolinks`. */
  id: string;
  /** Named in the footer's "Unsaved changes: …" summary. */
  label: string;
  /** The dialog tab the setting is on, so a failed save can open it. */
  tabId: string;
  isDirty: boolean;
  /** Validate, then write. Resolves once the backend has answered. */
  save: () => Promise<SettingSaveOutcome>;
  /** Drop the draft, back to the saved value. */
  discard: () => void;
}

export function unsavedDrafts(drafts: readonly SettingDraft[]): SettingDraft[] {
  return drafts.filter((draft) => draft.isDirty);
}

export function tabsWithUnsavedDrafts(drafts: readonly SettingDraft[]): ReadonlySet<string> {
  return new Set(unsavedDrafts(drafts).map((draft) => draft.tabId));
}

export type SaveDraftsResult =
  | { ok: true }
  /** `message` is absent when the failure was invalid input, shown on the fields instead. */
  | { ok: false; tabId: string; message?: string };

/**
 * Save every unsaved draft. Each setting is written on its own, so one with
 * errors does not hold back the others. The first failure, in dialog order, is
 * the one reported, so the dialog opens the tab where the user has work left.
 */
export async function saveUnsavedDrafts(drafts: readonly SettingDraft[]): Promise<SaveDraftsResult> {
  const pending = unsavedDrafts(drafts);
  const outcomes = await Promise.all(pending.map((draft) => draft.save()));
  const failedIndex = outcomes.findIndex((outcome) => !outcome.ok);
  if (failedIndex === -1) return { ok: true };

  const failure = outcomes[failedIndex];
  const { tabId } = pending[failedIndex];
  return !failure.ok && failure.reason === 'failed' ? { ok: false, tabId, message: failure.message } : { ok: false, tabId };
}

/**
 * The draft to show after the saved value changed, whether by this dialog's
 * Save or from VS Code's settings. It follows the saved value unless the user
 * has edits it would overwrite: a draft that differs from both the old and the
 * new saved value is the user's own work and is kept.
 */
export function nextDraftOnSavedChange<TSaved, TDraft>(
  current: TDraft,
  previousSaved: TSaved,
  nextSaved: TSaved,
  toDraft: (saved: TSaved) => TDraft,
  isChanged: (draft: TDraft, saved: TSaved) => boolean,
): TDraft {
  return isChanged(current, previousSaved) && isChanged(current, nextSaved) ? current : toDraft(nextSaved);
}
