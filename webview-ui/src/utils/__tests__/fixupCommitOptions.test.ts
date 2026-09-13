import { describe, expect, it } from 'vitest';
import {
  canConfirmFixup,
  effectiveFixupKind,
  getFixupKindAvailability,
  getInitialFixupSelection,
  squashMessageToSend,
} from '../fixupCommitOptions';

describe('getFixupKindAvailability', () => {
  it('blocks fixup and squash only when the chosen include option covers no files', () => {
    const counts = { stagedCount: 0, unstagedCount: 2 };
    expect(getFixupKindAvailability({ counts, includeAllTracked: false, supportsAmendReword: true })).toEqual({
      fixup: 'nothingToCommit', squash: 'nothingToCommit', amend: null, reword: null,
    });
    expect(getFixupKindAvailability({ counts, includeAllTracked: true, supportsAmendReword: true }).fixup).toBeNull();
  });

  it('gates amend and reword on git version', () => {
    const availability = getFixupKindAvailability({ counts: { stagedCount: 1, unstagedCount: 0 }, includeAllTracked: false, supportsAmendReword: false });
    expect(availability).toEqual({ fixup: null, squash: null, amend: 'gitTooOld', reword: 'gitTooOld' });
  });
});

describe('getInitialFixupSelection', () => {
  it('opens on Reword when there is nothing to commit', () => {
    expect(getInitialFixupSelection({ counts: { stagedCount: 0, unstagedCount: 0 }, supportsAmendReword: true }))
      .toEqual({ kind: 'reword', includeAllTracked: false });
  });

  it('preselects nothing when Reword is unavailable too', () => {
    expect(getInitialFixupSelection({ counts: { stagedCount: 0, unstagedCount: 0 }, supportsAmendReword: false }).kind).toBeNull();
  });

  it('opens on Fixup, with -a only when nothing is staged', () => {
    expect(getInitialFixupSelection({ counts: { stagedCount: 2, unstagedCount: 5 }, supportsAmendReword: true }))
      .toEqual({ kind: 'fixup', includeAllTracked: false });
    expect(getInitialFixupSelection({ counts: { stagedCount: 0, unstagedCount: 5 }, supportsAmendReword: true }))
      .toEqual({ kind: 'fixup', includeAllTracked: true });
  });
});

describe('effectiveFixupKind', () => {
  it('drops a version-gated selection but keeps a content-blocked one', () => {
    const old = getFixupKindAvailability({ counts: { stagedCount: 0, unstagedCount: 0 }, includeAllTracked: false, supportsAmendReword: false });
    expect(effectiveFixupKind('reword', old)).toBeNull();
    expect(effectiveFixupKind('fixup', old)).toBe('fixup');
  });
});

describe('canConfirmFixup', () => {
  const ok = getFixupKindAvailability({ counts: { stagedCount: 1, unstagedCount: 0 }, includeAllTracked: false, supportsAmendReword: true });

  it('needs a selectable kind', () => {
    expect(canConfirmFixup({ kind: null, availability: ok, replacementMessage: null })).toBe(false);
    const empty = getFixupKindAvailability({ counts: { stagedCount: 0, unstagedCount: 0 }, includeAllTracked: false, supportsAmendReword: true });
    expect(canConfirmFixup({ kind: 'fixup', availability: empty, replacementMessage: null })).toBe(false);
    expect(canConfirmFixup({ kind: 'squash', availability: ok, replacementMessage: null })).toBe(true);
  });

  it('needs a non-empty message for amend and reword', () => {
    expect(canConfirmFixup({ kind: 'amend', availability: ok, replacementMessage: null })).toBe(false);
    expect(canConfirmFixup({ kind: 'reword', availability: ok, replacementMessage: '  \n' })).toBe(false);
    expect(canConfirmFixup({ kind: 'reword', availability: ok, replacementMessage: 'New' })).toBe(true);
  });
});

describe('squashMessageToSend', () => {
  it('sends -m text only when checked and non-blank', () => {
    expect(squashMessageToSend(false, 'x')).toBeUndefined();
    expect(squashMessageToSend(true, '   ')).toBeUndefined();
    expect(squashMessageToSend(true, 'note')).toBe('note');
  });
});
