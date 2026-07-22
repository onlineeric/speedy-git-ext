import type { UiAction } from '@shared/telemetry';

/**
 * Injected from package.json by the `define` block in both webview-ui/vite.config.ts
 * (the shipped bundle) and vitest.config.ts (unit tests), so the Help dialog can
 * show the running version without an extra RPC round-trip. Typed as possibly
 * undefined because a bundler that forgets the define would otherwise turn this
 * module — imported all the way up to App — into a load-time ReferenceError.
 */
declare const __EXTENSION_VERSION__: string | undefined;

const REPOSITORY_URL = 'https://github.com/onlineeric/speedy-git-ext';

/** The issues URL, shown verbatim in the dialog so it can be read and copied. */
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

/**
 * The Help dialog's own slice of the closed telemetry catalog. `Extract` keeps
 * it tied to `UiAction` (renaming an action there is a compile error here) while
 * making it impossible to report an unrelated action — a git operation, say —
 * from a help link.
 */
export type HelpLinkAction = Extract<
  UiAction,
  'helpReportIssue' | 'helpOpenRepository' | 'helpOpenChangelog' | 'helpOpenMarketplace'
>;

/** One row in the Help dialog's link list. */
export interface HelpLink {
  label: string;
  description: string;
  url: string;
  /** Closed-catalog telemetry action reported when the link is opened; also the row key. */
  telemetryAction: HelpLinkAction;
}

/**
 * Where users go for help, ordered by how often they need it: reporting an
 * issue first (the dialog's main purpose), then reading, then rating.
 */
export const HELP_LINKS: readonly HelpLink[] = [
  {
    label: 'Report an issue or request a feature',
    description: 'Questions, suggestions, bug reports — all go to GitHub Issues.',
    url: ISSUES_URL,
    telemetryAction: 'helpReportIssue',
  },
  {
    label: 'Documentation & source code',
    description: 'README, feature guide, and the full source on GitHub.',
    url: REPOSITORY_URL,
    telemetryAction: 'helpOpenRepository',
  },
  {
    label: "Changelog — what's new",
    description: 'Release notes for every version.',
    url: `${REPOSITORY_URL}/blob/main/CHANGELOG.md`,
    telemetryAction: 'helpOpenChangelog',
  },
  {
    label: 'Rate & review on the Marketplace',
    description: 'Ratings help other developers find Speedy Git.',
    url: 'https://marketplace.visualstudio.com/items?itemName=onlineeric.speedy-git-ext',
    telemetryAction: 'helpOpenMarketplace',
  },
];

/** Version line for the dialog footer. Fixed at build time, so it is a constant. */
export const VERSION_LABEL = `Speedy Git v${
  typeof __EXTENSION_VERSION__ === 'string' ? __EXTENSION_VERSION__ : 'unknown'
}`;
