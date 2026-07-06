import { vi } from 'vitest';
import type { TelemetryService } from '../services/TelemetryService.js';

/** Fully mocked TelemetryService for tests that only need a quiet funnel. */
export function createTelemetryStub(): TelemetryService {
  return {
    sendActivate: vi.fn(),
    sendSettingsSnapshot: vi.fn(),
    sendPanelOpened: vi.fn(),
    sendOperation: vi.fn(),
    trackUi: vi.fn(),
    sendPerfInitialLoad: vi.fn(),
    sendError: vi.fn(),
    dispose: vi.fn(),
  };
}
