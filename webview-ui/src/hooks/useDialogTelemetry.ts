import { useEffect, useMemo, useRef } from 'react';
import type { DialogId, DialogOutcome } from '@shared/telemetry';
import { trackDialogOutcome } from '../utils/telemetry';

/**
 * Dialog-outcome telemetry with one report per open-cycle (049-usage-telemetry).
 *
 * Radix dialogs fire both the action's onClick AND onOpenChange(false) when a
 * button closes the dialog, so a confirm would otherwise also be counted as a
 * cancel. This hook latches the first outcome reported per open-cycle and
 * ignores the rest; reopening the dialog re-arms it.
 *
 * Pass `undefined` as the dialog id to disable tracking (generic dialogs like
 * ConfirmDialog only track when their caller supplies an id).
 */
export function useDialogTelemetry(dialog: DialogId | undefined, open: boolean) {
  const reported = useRef(false);

  useEffect(() => {
    if (open) {
      reported.current = false;
    }
  }, [open]);

  // Stable identity (per dialog id) so callers can safely list the returned
  // object in useCallback/useEffect dependency arrays.
  return useMemo(() => {
    const report = (outcome: DialogOutcome) => {
      if (dialog === undefined || reported.current) return;
      reported.current = true;
      trackDialogOutcome(dialog, outcome);
    };
    return {
      confirmed: () => report('confirmed'),
      cancelled: () => report('cancelled'),
    };
  }, [dialog]);
}
