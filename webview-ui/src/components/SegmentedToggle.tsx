export interface SegmentedToggleOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string | number> {
  options: readonly SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel: string;
}

/**
 * A row of joined toggle boxes where exactly one is pressed — a single-choice
 * control that reads as buttons rather than radio dots. Unpressed boxes keep the
 * secondary button background so they still look clickable.
 */
export function SegmentedToggle<T extends string | number>({ options, value, onChange, ariaLabel }: SegmentedToggleProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded border border-[var(--vscode-button-border,var(--vscode-input-border))]"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`px-2 py-0.5 text-xs ${index > 0 ? 'border-l border-[var(--vscode-button-border,var(--vscode-input-border))] ' : ''}${
              selected
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
