interface FieldErrorProps {
  /** Element id referenced by the input's `aria-describedby`. */
  id: string;
  message: string | undefined;
}

/** Validation message shown under a form input, paired with `aria-invalid`/`aria-describedby` on the input itself. */
export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-[var(--vscode-errorForeground)]">
      {message}
    </p>
  );
}
