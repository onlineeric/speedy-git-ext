import { describe, expect, it, vi } from 'vitest';
import type { UiTelemetryEvent } from '../../shared/telemetry.js';
import { telemetryHandlers } from '../webview/handlers/telemetryHandlers.js';
import { createTelemetryStub } from './telemetryTestStub.js';

function createContext() {
  const telemetry = createTelemetryStub();
  const postMessage = vi.fn();
  const context = {
    telemetry,
    postMessage,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as never;
  return { telemetry, postMessage, context };
}

async function dispatchEvent(event: unknown, context: never): Promise<void> {
  await telemetryHandlers.trackUiEvent(
    { type: 'trackUiEvent', payload: { event: event as UiTelemetryEvent } },
    context,
  );
}

describe('telemetryHandlers.trackUiEvent', () => {
  it('forwards valid events to the telemetry service', async () => {
    const { telemetry, context } = createContext();
    const event: UiTelemetryEvent = { kind: 'uiInteraction', surface: 'commitMenu', action: 'cherryPick' };

    await dispatchEvent(event, context);

    expect(telemetry.trackUi).toHaveBeenCalledTimes(1);
    expect(telemetry.trackUi).toHaveBeenCalledWith(event);
  });

  it('drops out-of-catalog surface/action/dialog values', async () => {
    const { telemetry, context } = createContext();

    await dispatchEvent({ kind: 'uiInteraction', surface: 'secretSurface', action: 'cherryPick' }, context);
    await dispatchEvent({ kind: 'uiInteraction', surface: 'commitMenu', action: 'notAnAction' }, context);
    await dispatchEvent({ kind: 'dialogOutcome', dialog: 'notADialog', outcome: 'confirmed' }, context);

    expect(telemetry.trackUi).not.toHaveBeenCalled();
  });

  it('drops free-string smuggling attempts', async () => {
    const { telemetry, context } = createContext();

    await dispatchEvent({ kind: 'uiInteraction', surface: 'commitMenu', action: '/home/user/repo' }, context);
    await dispatchEvent(
      { kind: 'uiInteraction', surface: 'commitMenu', action: 'cherryPick', branchName: 'secret' },
      context,
    );
    await dispatchEvent('checkout my-secret-branch', context);
    await dispatchEvent(null, context);

    expect(telemetry.trackUi).not.toHaveBeenCalled();
  });

  it('never posts a response message', async () => {
    const { postMessage, context } = createContext();

    await dispatchEvent({ kind: 'dialogOutcome', dialog: 'merge', outcome: 'cancelled' }, context);
    await dispatchEvent({ kind: 'invalid' }, context);

    expect(postMessage).not.toHaveBeenCalled();
  });
});
