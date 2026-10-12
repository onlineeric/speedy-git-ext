import { describe, expect, it, vi } from 'vitest';
import {
  nextDraftOnSavedChange,
  saveUnsavedDrafts,
  unsavedDrafts,
  type SettingDraft,
  type SettingSaveOutcome,
} from '../settingDrafts';

function draft(id: string, tabId: string, isDirty: boolean, outcome: SettingSaveOutcome = { ok: true }): SettingDraft {
  return { id, label: id, tabId, isDirty, save: vi.fn(async () => outcome), discard: vi.fn() };
}

describe('unsaved drafts', () => {
  it('lists only dirty drafts', () => {
    const drafts = [draft('a', 'view', false), draft('b', 'autolinks', true), draft('c', 'autolinks', true)];
    expect(unsavedDrafts(drafts).map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});

describe('saveUnsavedDrafts', () => {
  it('saves every dirty draft and nothing else', async () => {
    const clean = draft('clean', 'view', false);
    const dirty = draft('dirty', 'autolinks', true);
    expect(await saveUnsavedDrafts([clean, dirty])).toEqual({ ok: true });
    expect(clean.save).not.toHaveBeenCalled();
    expect(dirty.save).toHaveBeenCalledTimes(1);
  });

  it('saves the valid settings even when another has errors, and reports the first failure in dialog order', async () => {
    const invalid = draft('invalid', 'view', true, { ok: false, reason: 'invalid' });
    const failed = draft('failed', 'autolinks', true, { ok: false, reason: 'failed', message: 'read-only' });
    const valid = draft('valid', 'other', true);
    expect(await saveUnsavedDrafts([invalid, failed, valid])).toEqual({ ok: false, tabId: 'view' });
    expect(valid.save).toHaveBeenCalledTimes(1);
  });

  it('carries the message of a failed write, for the dialog to show', async () => {
    const failed = draft('failed', 'autolinks', true, { ok: false, reason: 'failed', message: 'read-only' });
    expect(await saveUnsavedDrafts([failed])).toEqual({ ok: false, tabId: 'autolinks', message: 'read-only' });
  });

  it('reports a save that throws as a failed write rather than rejecting', async () => {
    const throwing = draft('throwing', 'autolinks', true);
    vi.mocked(throwing.save).mockRejectedValue(new Error('boom'));
    const valid = draft('valid', 'view', true);
    expect(await saveUnsavedDrafts([throwing, valid])).toEqual({ ok: false, tabId: 'autolinks', message: 'boom' });
    expect(valid.save).toHaveBeenCalledTimes(1);
  });
});

describe('nextDraftOnSavedChange', () => {
  const toDraft = (saved: string) => saved;
  const isChanged = (current: string, saved: string) => current !== saved;

  it('follows the new saved value when the draft had no edits', () => {
    expect(nextDraftOnSavedChange('old', 'old', 'new', toDraft, isChanged)).toBe('new');
  });

  it('follows the new saved value when it is what the draft already says (the echo of a Save)', () => {
    expect(nextDraftOnSavedChange('edited', 'old', 'edited', toDraft, isChanged)).toBe('edited');
  });

  it('keeps edits the new saved value would overwrite', () => {
    expect(nextDraftOnSavedChange('edited', 'old', 'new', toDraft, isChanged)).toBe('edited');
  });
});
