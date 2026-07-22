import type { UiAction } from '@shared/telemetry';

/**
 * Injected by Vite (`define` in webview-ui/vite.config.ts) from package.json so
 * the Help dialog can show the running version without an extra RPC round-trip.
 * Guarded with `typeof` because unit tests run the module outside a Vite build.
 */
declare const __EXTENSION_VERSION__: string | undefined;

const REPOSITORY_URL = 'https://github.com/onlineeric/speedy-git-ext';

/** One row in the Help dialog's link list. */
export interface HelpLink {
  id: string;
  label: string;
  description: string;
  url: string;
  /** Closed-catalog telemetry action reported when the link is opened. */
  telemetryAction: UiAction;
}

/**
 * Where users go for help, ordered by how often they need it: reporting an
 * issue first (the dialog's main purpose), then reading, then rating.
 */
export const HELP_LINKS: readonly HelpLink[] = [
  {
    id: 'issues',
    label: 'Report an issue or request a feature',
    description: 'Questions, suggestions, bug reports — all go to GitHub Issues.',
    url: `${REPOSITORY_URL}/issues`,
    telemetryAction: 'helpReportIssue',
  },
  {
    id: 'repository',
    label: 'Documentation & source code',
    description: 'README, feature guide, and the full source on GitHub.',
    url: REPOSITORY_URL,
    telemetryAction: 'helpOpenRepository',
  },
  {
    id: 'changelog',
    label: "Changelog — what's new",
    description: 'Release notes for every version.',
    url: `${REPOSITORY_URL}/blob/main/CHANGELOG.md`,
    telemetryAction: 'helpOpenChangelog',
  },
  {
    id: 'marketplace',
    label: 'Rate & review on the Marketplace',
    description: 'Ratings help other developers find Speedy Git.',
    url: 'https://marketplace.visualstudio.com/items?itemName=onlineeric.speedy-git-ext',
    telemetryAction: 'helpOpenMarketplace',
  },
] as const;

/** The issues URL, shown verbatim in the dialog so it can be read and copied. */
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

/** Running extension version, or `null` when it was not injected at build time. */
export function getExtensionVersion(): string | null {
  return typeof __EXTENSION_VERSION__ === 'string' && __EXTENSION_VERSION__.length > 0
    ? __EXTENSION_VERSION__
    : null;
}

/** Version line for the dialog footer; falls back to the bare name when unknown. */
export function formatVersionLabel(version: string | null): string {
  return version ? `Speedy Git v${version}` : 'Speedy Git';
}
