import {
  hasCustomAutolinkErrors,
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
 * (`ignoreCase`, `alphanumeric` — settings.json-only), so editing a row in the
 * dialog never silently drops them.
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

/** A row the user added and never filled in; dropped on save rather than reported. */
function isBlankRow({ entry }: CustomAutolinkDraftRow): boolean {
  return entry.prefix.trim().length === 0 && entry.url.trim().length === 0;
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
  const filledRows = rows.filter((row) => !isBlankRow(row));
  const autolinks = filledRows.map((row) => trimCustomAutolink(row.entry));
  const rowErrors = validateCustomAutolinks(autolinks);

  const errors = new Map<number, CustomAutolinkErrors>();
  rowErrors.forEach((rowError, index) => {
    if (hasCustomAutolinkErrors(rowError)) errors.set(filledRows[index].id, rowError);
  });

  return errors.size > 0 ? { ok: false, errors } : { ok: true, autolinks };
}

function sameAutolink(a: CustomAutolink, b: CustomAutolink): boolean {
  return a.prefix === b.prefix
    && a.url === b.url
    && (a.ignoreCase ?? false) === (b.ignoreCase ?? false)
    && (a.alphanumeric ?? false) === (b.alphanumeric ?? false);
}

/**
 * Whether the draft differs from what is saved, compared the way saving would
 * write it (trimmed, blank rows dropped). So typing a space, or adding a row and
 * leaving it empty, does not count as an unsaved change.
 */
export function isDraftChanged(rows: readonly CustomAutolinkDraftRow[], saved: readonly CustomAutolink[]): boolean {
  const draft = rows.filter((row) => !isBlankRow(row)).map((row) => trimCustomAutolink(row.entry));
  return draft.length !== saved.length
    || draft.some((entry, index) => !sameAutolink(entry, trimCustomAutolink(saved[index])));
}
