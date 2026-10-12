import * as Dialog from '@radix-ui/react-dialog';
import { WARNING_COLOR } from '../utils/themeColors';
import { buttonPrimaryClassName, buttonSecondaryClassName, dialogErrorClassName } from './dialogStyles';

/**
 * The Settings dialog's footer. With nothing unsaved it is a plain Close.
 * While a setting has unsaved changes it names them and offers the only ways
 * out: Discard and Close, or Save and Close, plus Save to keep editing.
 */
export function SettingsDialogFooter({
  unsavedLabels,
  saving,
  error,
  refusedCloseCount,
  onSave,
  onSaveAndClose,
  onDiscardAndClose,
}: {
  unsavedLabels: readonly string[];
  saving: boolean;
  error: string | null;
  refusedCloseCount: number;
  onSave: () => void;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
}) {
  const hasUnsaved = unsavedLabels.length > 0;

  return (
    <div className="mt-4 shrink-0 space-y-2 border-t border-[var(--vscode-panel-border)] pt-3">
      {error && (
        <div role="alert" className={dialogErrorClassName}>
          {error}
        </div>
      )}
      <div className="relative isolate flex flex-wrap items-center justify-end gap-2 rounded">
        {/* Keyed so each refused close replays the flash, without remounting the buttons. Painted
            behind the row (`isolate` + `-z-10`), so no child needs its own stacking. */}
        {refusedCloseCount > 0 && (
          <span
            key={refusedCloseCount}
            aria-hidden
            className="animate-unsaved-flash pointer-events-none absolute -inset-1 -z-10 rounded"
          />
        )}
        {hasUnsaved ? (
          <>
            <span role="status" className="mr-auto min-w-0 text-xs" style={{ color: WARNING_COLOR }}>
              Unsaved changes: {unsavedLabels.join(', ')}
            </span>
            <button
              type="button"
              onClick={onDiscardAndClose}
              disabled={saving}
              className={`${buttonSecondaryClassName} text-xs`}
            >
              Discard and Close
            </button>
            <button type="button" onClick={onSave} disabled={saving} className={`${buttonSecondaryClassName} text-xs`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onSaveAndClose}
              disabled={saving}
              className={`${buttonPrimaryClassName} text-xs`}
            >
              Save and Close
            </button>
          </>
        ) : (
          <Dialog.Close asChild>
            <button type="button" className={`${buttonSecondaryClassName} text-xs`}>
              Close
            </button>
          </Dialog.Close>
        )}
      </div>
    </div>
  );
}
