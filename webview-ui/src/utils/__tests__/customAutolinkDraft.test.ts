import { describe, expect, it } from 'vitest';
import type { CustomAutolink } from '@shared/autolinks';
import {
  createDraftRow,
  isDraftChanged,
  prepareCustomAutolinksSave,
  toDraftRows,
  withIgnoreCase,
} from '../customAutolinkDraft';

const JIRA: CustomAutolink = { prefix: 'ABCD-', url: 'https://jira.example.com/browse/ABCD-<num>' };

describe('prepareCustomAutolinksSave', () => {
  it('trims entries and drops blank rows', () => {
    const rows = [createDraftRow({ prefix: ' ABCD- ', url: ` ${JIRA.url} ` }), createDraftRow()];
    expect(prepareCustomAutolinksSave(rows)).toEqual({ ok: true, autolinks: [JIRA] });
  });

  it('keeps the options of an edited entry', () => {
    const entry = { ...JIRA, ignoreCase: false, alphanumeric: true };
    expect(prepareCustomAutolinksSave(toDraftRows([entry]))).toEqual({ ok: true, autolinks: [entry] });
  });

  it('refuses the whole save and keys errors by row id when any row is invalid', () => {
    const good = createDraftRow(JIRA);
    const blank = createDraftRow();
    const bad = createDraftRow({ prefix: 'XY-', url: 'https://x.example/browse' });
    const result = prepareCustomAutolinksSave([good, blank, bad]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([...result.errors.keys()]).toEqual([bad.id]);
    expect(result.errors.get(bad.id)?.url).toContain('<num>');
  });

  it('allows saving an empty list, which removes every autolink', () => {
    expect(prepareCustomAutolinksSave([])).toEqual({ ok: true, autolinks: [] });
  });
});

describe('isDraftChanged', () => {
  it('is false for the saved list and for whitespace-only or blank-row edits', () => {
    expect(isDraftChanged(toDraftRows([JIRA]), [JIRA])).toBe(false);
    expect(isDraftChanged([createDraftRow({ ...JIRA, prefix: 'ABCD- ' }), createDraftRow()], [JIRA])).toBe(false);
  });

  it('ignores a blank entry in the saved list too', () => {
    expect(isDraftChanged(toDraftRows([JIRA]), [{ prefix: '', url: '' }, JIRA])).toBe(false);
  });

  it('is true for an edited option', () => {
    expect(isDraftChanged(toDraftRows([JIRA]), [{ ...JIRA, ignoreCase: false }])).toBe(true);
  });

  it('treats an explicit ignoreCase: true as the default', () => {
    expect(isDraftChanged(toDraftRows([JIRA]), [{ ...JIRA, ignoreCase: true }])).toBe(false);
  });

  it('is true for an edited, added or removed entry', () => {
    expect(isDraftChanged(toDraftRows([{ ...JIRA, prefix: 'XY-' }]), [JIRA])).toBe(true);
    expect(isDraftChanged(toDraftRows([JIRA, JIRA]), [JIRA])).toBe(true);
    expect(isDraftChanged([], [JIRA])).toBe(true);
  });

  it('gives every row a distinct id', () => {
    const [a, b] = toDraftRows([JIRA, JIRA]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('withIgnoreCase', () => {
  it('leaves the field out when checked, since ignoring case is the default', () => {
    expect(withIgnoreCase({ ...JIRA, ignoreCase: false }, true)).toEqual(JIRA);
  });

  it('writes ignoreCase: false when unchecked, keeping other options', () => {
    expect(withIgnoreCase({ ...JIRA, alphanumeric: true }, false)).toEqual({ ...JIRA, alphanumeric: true, ignoreCase: false });
  });
});
