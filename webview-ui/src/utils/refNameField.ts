import type { GitRefNameValidation } from '@shared/gitRefValidation';

export interface RefNameFieldState {
  /** Error to show under the input; suppressed while the field is still empty. */
  error: string | undefined;
  /** True when the current value passes validation (an empty value is not valid). */
  valid: boolean;
}

/**
 * Derives the live-validation state shared by every ref-name input: run the
 * validator on each keystroke, but only surface its message once the user has
 * typed something, so a pristine field shows a disabled submit button without
 * an error.
 */
export function deriveRefNameField(
  value: string,
  validate: (rawName: string) => GitRefNameValidation
): RefNameFieldState {
  const validation = validate(value);
  return {
    error: value ? validation.message : undefined,
    valid: validation.valid,
  };
}
