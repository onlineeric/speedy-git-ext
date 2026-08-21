import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import {
  buttonInertClassName,
  buttonPrimaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogOverlayClassName,
} from './dialogStyles';
import { findWhatsNewEntry } from './whatsNewEntries';

interface WhatsNewDialogProps {
  /** Which release's content to show; nothing renders if that version has no entry. */
  version: string;
  /** Seconds the close button stays disabled — shorter in development. */
  countdownSeconds: number;
  open: boolean;
  onClose: () => void;
}

/**
 * "What's new in vX.Y.Z", shown once per version on the first run after install.
 *
 * The close button counts down before it enables, which is the whole reason the
 * dialog can justify interrupting: without it, a dialog that appears on launch
 * is dismissed reflexively before anything is read. Escape and clicking away are
 * held back for the same span, so the countdown cannot simply be routed around.
 *
 * Content comes from `whatsNewEntries`, so adding a release means adding an
 * entry there and nothing here.
 */
export function WhatsNewDialog({ version, countdownSeconds, open, onClose }: WhatsNewDialogProps) {
  const entry = findWhatsNewEntry(version);
  const telemetry = useDialogTelemetry('whatsNew', open);
  const remaining = useCountdown(countdownSeconds, open && entry !== undefined);
  const closeRef = useRef<HTMLButtonElement>(null);

  if (!entry) return null;

  const locked = remaining > 0;
  const handleClose = () => {
    if (locked) return;
    telemetry.confirmed();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClassName} />
        <Dialog.Content
          className={`${dialogContentClassName} flex max-h-[80vh] flex-col`}
          style={dialogContentStyle}
          // Radix focuses the first focusable child otherwise, which would land on
          // a link inside the release notes and highlight it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          // Held back only while the countdown runs; afterwards both dismiss normally.
          onEscapeKeyDown={(event) => locked && event.preventDefault()}
          onPointerDownOutside={(event) => locked && event.preventDefault()}
          onInteractOutside={(event) => locked && event.preventDefault()}
        >
          {/* The headline carries the dialog's title weight, not the version line:
              "What's new in v5.11.0" is the same every release and says nothing,
              while the headline is the one sentence worth reading. So the version
              sits above it as a small label and the headline gets `text-base
              font-semibold`, the size every other dialog title in the app uses. */}
          <Dialog.Title className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">
            What’s new in v{entry.version}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-base font-semibold leading-snug text-[var(--vscode-foreground)]">
            {entry.headline}
          </Dialog.Description>

          <div className="mt-4 flex-1 overflow-y-auto">{entry.content}</div>

          <div className="mt-4 flex shrink-0 justify-end">
            <button
              ref={closeRef}
              type="button"
              className={`${buttonPrimaryClassName}${locked ? ` ${buttonInertClassName}` : ''}`}
              onClick={handleClose}
              // `aria-disabled` rather than `disabled`: a disabled button cannot hold
              // focus, and this one is focused from the moment the dialog opens.
              // `handleClose` is what actually refuses to act while locked.
              aria-disabled={locked}
              // Fixed width so enabling doesn't resize the button under the cursor.
              style={{ minWidth: '6rem' }}
              aria-label={locked ? `Closes in ${remaining} seconds` : 'Close'}
            >
              {locked ? `${remaining}...` : 'Close'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
