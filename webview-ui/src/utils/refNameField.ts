import type { GitRefNameValidation } from '@shared/gitRefValidation';

export interface RefNameFieldState {
  /** Error to show under the input; suppressed while the field is still pristine. */
  error: string | undefined;
  /** True when the current value passes validation (an empty value is not valid). */
  valid: boolean;
}

/**
 * Derives the live-validation state shared by every ref-name input: run the
 * validator on each keystroke, but only surface its message once the user has
 * typed something, so a pristine field shows a disabled submit button without
 * an error.
 *
 * `pristineValue` is what the field was prefilled with (e.g. `feature/` from
 * `git.branchPrefix`). A prefix is usually not a valid name on its own, and an
 * error before the user has typed anything reads as a mistake they made.
 */
export function deriveRefNameField(
  value: string,
  validate: (rawName: string) => GitRefNameValidation,
  pristineValue = '',
): RefNameFieldState {
  const validation = validate(value);
  const touched = value !== '' && value !== pristineValue;
  return {
    error: touched ? validation.message : undefined,
    valid: validation.valid,
  };
}

/** A prefilled name input: its current text plus the text it was prefilled with. */
export interface PrefilledName {
  value: string;
  pristine: string;
}

/**
 * Apply a prefill that arrived after the field was shown. It replaces only a
 * field the user has not edited, so a slow answer never overwrites their typing.
 */
export function applyNamePrefill(field: PrefilledName, prefill: string): PrefilledName {
  if (field.value !== field.pristine) return field;
  return { value: prefill, pristine: prefill };
}
