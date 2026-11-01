import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { adjacentWhatsNewEntries } from '@shared/whatsNew';
import { useCountdown } from '../hooks/useCountdown';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import { trackUiInteraction } from '../utils/telemetry';
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
  buttonSecondaryColorsClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogOverlayClassName,
} from './dialogStyles';
import { ChevronLeftIcon, ChevronRightIcon, SparkleIcon } from './icons';
import { WHATS_NEW_ENTRIES_NEWEST_FIRST, type WhatsNewEntry } from './whatsNewEntries';

interface WhatsNewDialogProps {
  /** The entry the dialog opens on; the arrows step to older and newer ones from here. */
  initialEntry: WhatsNewEntry;
  /**
   * Seconds the close button stays disabled: the backend's countdown when the
   * dialog interrupts after an upgrade, 0 when the user asked for it.
   */
  countdownSeconds: number;
  onClose: () => void;
}

/** A square icon button: the secondary colors, so it reads as clickable before it is hovered. */
const navButtonClassName =
  `inline-flex h-7 w-7 items-center justify-center rounded ${buttonSecondaryColorsClassName} ` +
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--vscode-focusBorder)] ' +
  'disabled:pointer-events-none disabled:opacity-40';

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
 * "What's new in vX.Y.Z", shown once per entry on the first run after install —
 * a patch release without notes of its own shows its series' notes, and only if
 * they have not been seen yet — and on demand from the toolbar's What's New
 * button. Either way the footer's arrows browse every release's notes.
 *
 * Laid out as a poster rather than a notice — a gradient hero carrying the
 * headline and an optional illustration, then the entry's content — because its
 * job is to make a new feature worth a look, and a wall of text reads as
 * something to dismiss.
 *
 * The close button counts down before it enables when the dialog interrupts,
 * which is the whole reason it can justify interrupting: without it, a dialog that appears on launch
 * is dismissed reflexively before anything is read. Escape and clicking away are
 * held back for the same span, so the countdown cannot simply be routed around.
 * Opened from the toolbar there is nothing to justify, so there is no countdown.
 *
 * Mount it when it opens (`{state && <WhatsNewDialog … />}`): the countdown and
 * the browsed entry both start from that mount.
 *
 * Content comes from `whatsNewEntries`, so adding a release means adding an
 * entry there and nothing here.
 */
export function WhatsNewDialog({ initialEntry, countdownSeconds, onClose }: WhatsNewDialogProps) {
  const [entry, setEntry] = useState(initialEntry);
  const { older, newer } = adjacentWhatsNewEntries(WHATS_NEW_ENTRIES_NEWEST_FIRST, entry.version);
  const telemetry = useDialogTelemetry('whatsNew', true);
  const remaining = useCountdown(countdownSeconds, true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Each release's notes start from their own top, not wherever the last one was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [entry]);

  const locked = remaining > 0;
  const handleClose = () => {
    if (locked) return;
    telemetry.confirmed();
    onClose();
  };

  const showOlder = () => {
    if (!older) return;
    trackUiInteraction('whatsNewDialog', 'whatsNewOlderVersion');
    setEntry(older);
  };

  const showNewer = () => {
    if (!newer) return;
    trackUiInteraction('whatsNewDialog', 'whatsNewNewerVersion');
    setEntry(newer);
  };

  return (
    <Dialog.Root open onOpenChange={(isOpen) => !isOpen && handleClose()}>
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
          {/* The hero scrolls with the content: pinned, it would leave a short window
              almost no room for a release's screenshots. Only the footer stays put, so
              Close is always reachable. */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <header className="relative overflow-hidden px-7 pb-6 pt-6" style={heroStyle}>
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

            <div className="px-7 py-5">{entry.content}</div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--vscode-panel-border)] px-7 py-3">
            <nav className="flex items-center gap-2" aria-label="Release notes versions">
              <button
                type="button"
                className={navButtonClassName}
                onClick={showOlder}
                disabled={!older}
                title={older ? `Previous: v${older.version}` : 'This is the oldest release with notes'}
                aria-label={older ? `Show v${older.version}` : 'No older release notes'}
              >
                <ChevronLeftIcon size={16} strokeWidth={1.6} />
              </button>
              {/* Fixed width so the arrows stay put as the version text changes length. */}
              <span
                className="min-w-[4.5rem] text-center text-xs font-semibold tabular-nums text-[var(--vscode-foreground)]"
                aria-live="polite"
              >
                v{entry.version}
              </span>
              <button
                type="button"
                className={navButtonClassName}
                onClick={showNewer}
                disabled={!newer}
                title={newer ? `Next: v${newer.version}` : 'This is the newest release'}
                aria-label={newer ? `Show v${newer.version}` : 'No newer release notes'}
              >
                <ChevronRightIcon size={16} strokeWidth={1.6} />
              </button>
            </nav>

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
