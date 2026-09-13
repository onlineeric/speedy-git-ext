import * as Dialog from '@radix-ui/react-dialog';
import { useRef, type CSSProperties } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import {
  ACCENT_COLOR,
  BORDER_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_PURPLE_COLOR,
  tint,
} from '../utils/themeColors';
import {
  buttonInertClassName,
  buttonPrimaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogOverlayClassName,
} from './dialogStyles';
import { SparkleIcon } from './icons';
import { findWhatsNewEntry } from './whatsNewEntries';

interface WhatsNewDialogProps {
  /** Which release's content to show; nothing renders if that version has no entry. */
  version: string;
  /** Seconds the close button stays disabled — shorter in development. */
  countdownSeconds: number;
  open: boolean;
  onClose: () => void;
}

/** The hero's wash: two theme accents fading into the dialog surface. */
const heroStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${tint(SHOWCASE_PURPLE_COLOR, 26)} 0%, ${tint(SHOWCASE_BLUE_COLOR, 14)} 45%, transparent 85%)`,
  borderBottom: `1px solid ${BORDER_COLOR}`,
};

const versionPillStyle: CSSProperties = {
  color: ACCENT_COLOR,
  background: tint(ACCENT_COLOR, 16),
  boxShadow: `inset 0 0 0 1px ${tint(ACCENT_COLOR, 45)}`,
};

/**
 * "What's new in vX.Y.Z", shown once per version on the first run after install.
 *
 * Laid out as a poster rather than a notice — a gradient hero carrying the
 * headline and an optional illustration, then the entry's content — because its
 * job is to make a new feature worth a look, and a wall of text reads as
 * something to dismiss.
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
          // `!p-0` so the hero can bleed to the dialog's edges; each band pads itself.
          className={`${dialogContentClassName} animate-whats-new-pop flex max-h-[85vh] flex-col !p-0`}
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
          <header className="relative shrink-0 overflow-hidden px-7 pb-6 pt-6" style={heroStyle}>
            {/* Soft glows behind the text; purely decorative. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl"
              style={{ background: tint(SHOWCASE_PURPLE_COLOR, 30) }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full blur-3xl"
              style={{ background: tint(SHOWCASE_BLUE_COLOR, 18) }}
            />

            <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
              <div>
                {/* The version is the same shape every release and says little, so it
                    is a small pill; the headline is the one line worth reading and
                    gets the poster-sized type. */}
                <Dialog.Title
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
                  style={versionPillStyle}
                >
                  <SparkleIcon className="h-3 w-3" />
                  What’s new · v{entry.version}
                </Dialog.Title>
                <Dialog.Description className="mt-3 text-xl font-bold leading-tight tracking-tight text-[var(--vscode-foreground)]">
                  {entry.headline}
                </Dialog.Description>
              </div>
              {entry.illustration}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-7 py-5">{entry.content}</div>

          <footer className="flex shrink-0 items-center justify-end border-t border-[var(--vscode-panel-border)] px-7 py-3">
            <button
              ref={closeRef}
              type="button"
              className={`${buttonPrimaryClassName} relative overflow-hidden${locked ? ` ${buttonInertClassName}` : ''}`}
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
              {locked && (
                // Fills across the countdown, so the wait reads at a glance.
                <span
                  aria-hidden
                  className="animate-whats-new-countdown absolute inset-x-0 bottom-0 h-0.5 bg-[var(--vscode-button-foreground)]"
                  style={{ '--whats-new-countdown': `${countdownSeconds}s` } as CSSProperties}
                />
              )}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
