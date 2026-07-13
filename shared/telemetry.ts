import type { RequestMessage } from './messages.js';

/**
 * Closed telemetry vocabulary (049-usage-telemetry).
 *
 * Single source of truth for BOTH processes: every event name, property value,
 * and permitted literal lives here. Extending telemetry means extending these
 * catalogs — no free-form strings are representable anywhere (FR-005/FR-006).
 */

/** Every event name the extension can emit. */
export type TelemetryEventName =
  | 'activate'
  | 'panelOpened'
  | 'operation'
  | 'uiInteraction'
  | 'dialogOutcome'
  | 'settingsSnapshot'
  | 'perf'
  | 'error';

// ---------------------------------------------------------------------------
// Tracked operations (allowlist for the router middleware)
// ---------------------------------------------------------------------------

const TRACKED_OPERATION_LIST = [
  'checkoutBranch', 'checkoutCommit', 'stashAndCheckout', 'stashAndCheckoutCommit',
  'createBranch', 'renameBranch', 'deleteBranch', 'deleteRemoteBranch', 'mergeBranch',
  'fastForwardLocalBranch', 'push', 'pull', 'fetch',
  'addRemote', 'removeRemote', 'editRemote',
  'createTag', 'deleteTag', 'pushTag',
  'applyStash', 'popStash', 'dropStash', 'stashWithMessage', 'stashSelected',
  'resetBranch', 'cherryPick', 'abortCherryPick', 'continueCherryPick',
  'revert', 'continueRevert', 'abortRevert',
  'rebase', 'interactiveRebase', 'abortRebase', 'continueRebase', 'dropCommit',
  'updateSubmodule', 'initSubmodule',
  'addWorktree', 'removeWorktree', 'pruneWorktree', 'openWorktree',
  'stageFiles', 'unstageFiles', 'stageAll', 'unstageAll', 'discardFiles', 'discardAllUnstaged',
  'compareRefs',
] as const satisfies readonly RequestMessage['type'][];

/** A user-initiated git operation eligible for `operation` events. */
export type TrackedOperation = (typeof TRACKED_OPERATION_LIST)[number];

/**
 * Allowlist consulted by the router middleware. Chatty/read/high-frequency
 * request types (getCommits, loadMoreCommits, refresh, …) are deliberately
 * absent (FR-002); untracked dispatches take the pre-existing code path.
 */
export const TRACKED_OPERATIONS: ReadonlySet<RequestMessage['type']> = new Set(TRACKED_OPERATION_LIST);

// ---------------------------------------------------------------------------
// Commit-count buckets (anti-fingerprinting, FR-013)
// ---------------------------------------------------------------------------

export const COMMIT_COUNT_BUCKETS = ['<=500', '501-1000', '1001-5000', '5001-10000', '>10000'] as const;

export type CommitCountBucket = (typeof COMMIT_COUNT_BUCKETS)[number];

/** Bucket a repository-content-derived count; exact values never leave the process. */
export function toCommitCountBucket(n: number): CommitCountBucket {
  if (!Number.isFinite(n) || n <= 500) return '<=500';
  if (n <= 1000) return '501-1000';
  if (n <= 5000) return '1001-5000';
  if (n <= 10000) return '5001-10000';
  return '>10000';
}

// ---------------------------------------------------------------------------
// UI interaction catalog (surfaces, actions, dialogs)
// ---------------------------------------------------------------------------

export const UI_SURFACES = [
  'commitMenu',
  'branchMenu',
  'tagMenu',
  'stashMenu',
  'authorMenu',
  'dateMenu',
  'uncommittedMenu',
  'remoteBranchMenu',
  'worktreeMenu',
  'toolbar',
  'toolbarContextMenu',
  'panelToggle',
  'columnHeader',
] as const;

export type UiSurface = (typeof UI_SURFACES)[number];

export const UI_ACTIONS = [
  // Toolbar buttons (ControlBar)
  'filter', 'search', 'compare', 'worktrees', 'refresh', 'fetch', 'view', 'remote', 'settings',
  // Toolbar right-click menu
  'toggleLabels', 'toggleRemoteButton',
  // Commit context menu
  'compareCommits', 'setCompareBase', 'compareWithBase',
  'checkoutCommit', 'createBranch', 'createTag', 'createWorktree',
  'cherryPick', 'rebase', 'interactiveRebase',
  'revert', 'continueRevert', 'abortRevert', 'dropCommit',
  'copyHash', 'copyShortHash', 'copyMessage',
  'resetSoft', 'resetMixed', 'resetHard',
  // Branch / remote-branch / tag badge menus
  'checkout', 'merge', 'renameBranch', 'push', 'pull', 'fastForward',
  'deleteBranch', 'deleteRemoteBranch', 'pushTag', 'deleteTag',
  'copyName', 'toggleBranchFilter',
  // Worktree menu items (rendered inside branch-badge menus)
  'openWorktree', 'removeWorktree',
  // Stash menu
  'applyStash', 'popStash', 'dropStash',
  // Author / date cell menus
  'toggleAuthorFilter', 'filterFromDate', 'filterToDate',
  // Uncommitted-node menu
  'stash', 'stageAll', 'unstageAll', 'discardAll', 'selectFiles',
  // Panel toggles (TogglePanel widgets)
  'filterOpen', 'filterClose', 'searchOpen', 'searchClose',
  'compareOpen', 'compareClose', 'worktreeOpen', 'worktreeClose',
  // Column show/hide (commit list settings)
  'columnShowHash', 'columnHideHash', 'columnShowMessage', 'columnHideMessage',
  'columnShowAuthor', 'columnHideAuthor', 'columnShowDate', 'columnHideDate',
  'columnShowSignature', 'columnHideSignature',
] as const;

export type UiAction = (typeof UI_ACTIONS)[number];

export const DIALOG_IDS = [
  'checkoutCommit', 'checkoutWithPull', 'stashAndCheckout',
  'createBranch', 'renameBranch', 'deleteBranch', 'deleteRemoteBranch',
  'merge', 'push', 'fastForward',
  'createTag', 'deleteTag', 'pushTag',
  'cherryPick', 'revert', 'reset', 'rebase', 'interactiveRebase', 'dropCommit',
  'stash', 'dropStash', 'discard', 'discardAll', 'filePicker',
  'createWorktree', 'removeWorktree', 'pruneWorktree',
  'removeRemote',
] as const;

export type DialogId = (typeof DIALOG_IDS)[number];

export type DialogOutcome = 'confirmed' | 'cancelled';

// ---------------------------------------------------------------------------
// Webview → backend payload (the ONLY shape the trackUiEvent RPC accepts)
// ---------------------------------------------------------------------------

export type UiTelemetryEvent =
  | { kind: 'uiInteraction'; surface: UiSurface; action: UiAction }
  | { kind: 'dialogOutcome'; dialog: DialogId; outcome: DialogOutcome }
  | { kind: 'perf'; perfKind: 'topology'; durationMs: number; commitCountBucket: CommitCountBucket };

// ---------------------------------------------------------------------------
// Error areas (standalone `error` events — untracked-path failures only, FR-014)
// ---------------------------------------------------------------------------

export const ERROR_AREAS = [
  'gitExecutor', 'logService', 'watcher', 'repoDiscovery', 'avatarService', 'dataLoader', 'stateStore', 'other',
] as const;

export type ErrorArea = (typeof ERROR_AREAS)[number];

// ---------------------------------------------------------------------------
// Runtime validation (the funnel never trusts webview input)
// ---------------------------------------------------------------------------

/** Ceiling applied to duration measurements to keep garbage out of aggregates. */
export const MAX_TELEMETRY_DURATION_MS = 600_000; // 10 minutes

const UI_SURFACE_SET: ReadonlySet<string> = new Set(UI_SURFACES);
const UI_ACTION_SET: ReadonlySet<string> = new Set(UI_ACTIONS);
const DIALOG_ID_SET: ReadonlySet<string> = new Set(DIALOG_IDS);
const COMMIT_COUNT_BUCKET_SET: ReadonlySet<string> = new Set(COMMIT_COUNT_BUCKETS);

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const ownKeys = Object.keys(value);
  return ownKeys.length === keys.length && keys.every((key) => ownKeys.includes(key));
}

function isCatalogString(value: unknown, catalog: ReadonlySet<string>): boolean {
  return typeof value === 'string' && catalog.has(value);
}

function isValidDurationMs(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Strict runtime validator for webview-reported UI events: set membership on
 * every string field, finite non-negative numerics, exact key shape — anything
 * else is dropped at the funnel (data-model validation rules 1–5).
 */
export function isValidUiTelemetryEvent(value: unknown): value is UiTelemetryEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;

  switch (event.kind) {
    case 'uiInteraction':
      return (
        hasExactKeys(event, ['kind', 'surface', 'action']) &&
        isCatalogString(event.surface, UI_SURFACE_SET) &&
        isCatalogString(event.action, UI_ACTION_SET)
      );
    case 'dialogOutcome':
      return (
        hasExactKeys(event, ['kind', 'dialog', 'outcome']) &&
        isCatalogString(event.dialog, DIALOG_ID_SET) &&
        (event.outcome === 'confirmed' || event.outcome === 'cancelled')
      );
    case 'perf':
      return (
        hasExactKeys(event, ['kind', 'perfKind', 'durationMs', 'commitCountBucket']) &&
        event.perfKind === 'topology' &&
        isValidDurationMs(event.durationMs) &&
        isCatalogString(event.commitCountBucket, COMMIT_COUNT_BUCKET_SET)
      );
    default:
      return false;
  }
}
