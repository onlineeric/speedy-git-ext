import type { DialogId, DialogOutcome, UiAction, UiSurface, UiTelemetryEvent } from '@shared/telemetry';
import { rpcClient } from '../rpc/rpcClient';

/**
 * Fire-and-forget UI telemetry (049-usage-telemetry). Posts one message and
 * returns immediately; every failure is swallowed — telemetry must never
 * affect the UI (FR-010/FR-016). All values are literals from the closed
 * catalog in `shared/telemetry.ts`; the backend re-validates regardless.
 */
export function trackUi(event: UiTelemetryEvent): void {
  try {
    rpcClient.send({ type: 'trackUiEvent', payload: { event } });
  } catch {
    // Never let telemetry break the UI.
  }
}

/** Track one allowlisted click (context-menu item, toolbar button, toggle, …). */
export function trackUiInteraction(surface: UiSurface, action: UiAction): void {
  trackUi({ kind: 'uiInteraction', surface, action });
}

/** Track a dialog result. Prefer `useDialogTelemetry` inside dialog components. */
export function trackDialogOutcome(dialog: DialogId, outcome: DialogOutcome): void {
  trackUi({ kind: 'dialogOutcome', dialog, outcome });
}
