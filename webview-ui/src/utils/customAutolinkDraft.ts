import {
  hasCustomAutolinkErrors,
  isSameCustomAutolinkList,
  trimCustomAutolink,
  validateCustomAutolinks,
  type CustomAutolink,
  type CustomAutolinkErrors,
} from '@shared/autolinks';

/**
 * The View settings dialog's editable copy of `speedyGit.autolinks.custom`.
 *
 * Rows carry a stable id so React keeps each input's focus while rows above it
 * are added or removed. An entry keeps the options it arrived with
 * (`alphanumeric` is settings.json-only), so editing a row in the dialog never
 * silently drops them.
 */
export interface CustomAutolinkDraftRow {
  id: number;
  entry: CustomAutolink;
}

let nextRowId = 1;

export function createDraftRow(entry: CustomAutolink = { prefix: '', url: '' }): CustomAutolinkDraftRow {
  return { id: nextRowId++, entry };
}

export function toDraftRows(entries: readonly CustomAutolink[]): CustomAutolinkDraftRow[] {
  return entries.map((entry) => createDraftRow(entry));
}

/**
 * The entry with its "Ignore case" box set. Ignoring case is the default, so a
 * checked box leaves the field out, and the settings file holds
 * `"ignoreCase": false` only for an entry that opted out.
 */
export function withIgnoreCase(entry: CustomAutolink, ignoreCase: boolean): CustomAutolink {
  const { ignoreCase: _previous, ...rest } = entry;
  return ignoreCase ? rest : { ...rest, ignoreCase: false };
}

/** A row the user added and never filled in; dropped on save rather than reported. */
function isBlankEntry(entry: CustomAutolink): boolean {
  return entry.prefix.trim().length === 0 && entry.url.trim().length === 0;
}

/** A list as saving would write it: blank entries dropped, the rest trimmed. */
function toSavedForm(entries: readonly CustomAutolink[]): CustomAutolink[] {
  return entries.filter((entry) => !isBlankEntry(entry)).map(trimCustomAutolink);
}

export type CustomAutolinkSaveResult =
  | { ok: true; autolinks: CustomAutolink[] }
  /** `errors` is keyed by row id, so the messages stay on the right rows. */
  | { ok: false; errors: Map<number, CustomAutolinkErrors> };

/**
 * What saving the draft would write — or, when any row is invalid, the errors
 * to show instead. Saving is all or nothing: a list with one bad entry is not
 * written at all, so the settings file never holds half of an edit.
 */
export function prepareCustomAutolinksSave(rows: readonly CustomAutolinkDraftRow[]): CustomAutolinkSaveResult {
  const filledRows = rows.filter((row) => !isBlankEntry(row.entry));
  const autolinks = filledRows.map((row) => trimCustomAutolink(row.entry));
  const rowErrors = validateCustomAutolinks(autolinks);

  const errors = new Map<number, CustomAutolinkErrors>();
  rowErrors.forEach((rowError, index) => {
    if (hasCustomAutolinkErrors(rowError)) errors.set(filledRows[index].id, rowError);
  });

  return errors.size > 0 ? { ok: false, errors } : { ok: true, autolinks };
}

/**
 * Whether the draft differs from what is saved, compared the way saving would
 * write it (trimmed, blank rows dropped). So typing a space, or adding a row and
 * leaving it empty, does not count as an unsaved change.
 */
export function isDraftChanged(rows: readonly CustomAutolinkDraftRow[], saved: readonly CustomAutolink[]): boolean {
  return !isSameCustomAutolinkList(toSavedForm(rows.map((row) => row.entry)), toSavedForm(saved));
}
