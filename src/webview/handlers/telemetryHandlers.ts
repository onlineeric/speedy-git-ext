import { isValidUiTelemetryEvent } from '../../../shared/telemetry.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

/**
 * `trackUiEvent` handler (049-usage-telemetry): the privacy boundary for
 * webview-reported interactions. Re-validates every field against the closed
 * catalog — the funnel never trusts webview input (FR-006) — then forwards to
 * the TelemetryService. Invalid payloads are dropped silently; no response
 * message is ever posted (fire-and-forget by contract).
 */
export const telemetryHandlers = {
  trackUiEvent: async (message, context) => {
    const event: unknown = message.payload.event;
    if (!isValidUiTelemetryEvent(event)) {
      context.log.debug('Dropped out-of-catalog UI telemetry event');
      return;
    }
    context.telemetry.trackUi(event);
  },
} satisfies Pick<RequestHandlerMap, 'trackUiEvent'>;
