export interface RepoInfo {
  /** Absolute filesystem path to the repository root */
  path: string;
  /** Raw folder name (basename of path) */
  name: string;
  /**
   * Display label shown in the dropdown.
   * Equals `name` when unique; equals relative path from workspace root
   * when two repos share the same folder name.
   */
  displayName: string;
}

export type UserDateFormat = 'relative' | 'absolute' | 'absolute-date' | 'system' | 'custom';

export interface UserSettings {
  graphColors: string[];
  dateFormat: UserDateFormat;
  /** date-fns token string, used only when `dateFormat === 'custom'`. Invalid tokens fall back to `relative`. */
  dateFormatCustom: string;
  avatarsEnabled: boolean;
  showRemoteBranches: boolean;
  showTags: boolean;
  batchCommitSize: number;
  overScan: number;
  /** Parent dir for new worktrees; default '../${repoName}.worktrees'. Ref appended as leaf. */
  worktreeBasePath: string;
  /** Show small text labels under the toolbar icon buttons. */
  toolbarShowLabels: boolean;
  /** Show the Remote (Manage Remotes) button in the toolbar. */
  toolbarShowRemoteButton: boolean;
}

/**
 * `speedyGit.toolbar.*` boolean settings the webview can persist directly
 * (via the `setToolbarSetting` RPC, from the toolbar right-click menu).
 */
export type ToolbarBooleanSetting = 'showLabels' | 'showRemoteButton';

export interface SearchState {
  isOpen: boolean;
  query: string;
  matchIndices: number[];
  currentMatchIndex: number;
}

export type SubmoduleStatus = 'clean' | 'dirty' | 'uninitialized';

export interface Submodule {
  path: string;
  hash: string;
  status: SubmoduleStatus;
  describe: string;
  url?: string;
  /**
   * True iff status !== 'uninitialized' AND <parent>/<path>/.git exists on disk.
   * The submodule selector includes only entries with `initialized === true`.
   * Computed by `GitSubmoduleService.parseSubmoduleLine` (FR-006, R5).
   */
  initialized: boolean;
}

/**
 * @deprecated since 041-submodule-selector — submodule navigation is now driven by
 * the submodule selector in the toolbar, which uses `switchRepo` directly. This
 * type is retained as a transitional empty array on `submodulesData` payloads to
 * avoid touching every consumer in this PR. A follow-up will remove it.
 */
export interface SubmoduleNavEntry {
  repoPath: string;
  repoName: string;
}

export const DEFAULT_GRAPH_COLORS = [
  '#F44336',
  '#2196F3',
  '#4CAF50',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
  '#FF5722',
  '#8BC34A',
  '#3F51B5',
  '#FFEB3B',
] as const;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  graphColors: [...DEFAULT_GRAPH_COLORS],
  dateFormat: 'relative',
  dateFormatCustom: '',
  avatarsEnabled: true,
  showRemoteBranches: true,
  showTags: true,
  batchCommitSize: 500,
  overScan: 20,
  worktreeBasePath: '../${repoName}.worktrees',
  toolbarShowLabels: true,
  toolbarShowRemoteButton: true,
};

export interface Commit {
  hash: string;
  abbreviatedHash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorDate: number;
  subject: string;
  refs: RefInfo[];
}

export interface RefInfo {
  name: string;
  type: RefType;
  remote?: string;
}

export type RefType = 'head' | 'branch' | 'remote' | 'tag' | 'stash' | 'uncommitted';

/**
 * Annotation metadata for a single tag, read once per load from
 * `git for-each-ref refs/tags` and cached in the webview store keyed by `name`
 * (048-tag-enhancements). Local-only; never fetched per-hover.
 */
export interface TagMetadata {
  /** Short tag name (e.g. "v1.0.0"); the key used for lookup. */
  name: string;
  /** True when the tag is an annotated/object tag; false for a lightweight tag. */
  annotated: boolean;
  /** Full annotation message (`%(contents)`), preserving line breaks. Present only when annotated. */
  message?: string;
  /** Tagger display name. Present only when annotated. */
  tagger?: string;
  /** Tag date as unix seconds. Present only when annotated. */
  date?: number;
}

export const UNCOMMITTED_HASH = 'UNCOMMITTED';

export function buildUncommittedSubject(
  stagedCount: number,
  unstagedCount: number,
  untrackedCount: number,
): string {
  const parts: string[] = [];
  if (stagedCount > 0) parts.push(`${stagedCount} staged`);
  if (unstagedCount > 0) parts.push(`${unstagedCount} modified`);
  if (untrackedCount > 0) parts.push(`${untrackedCount} untracked`);

  if (parts.length === 0) return 'Uncommitted Changes';
  return `Uncommitted Changes (${parts.join(', ')})`;
}

export interface Branch {
  name: string;
  remote?: string;
  current: boolean;
  hash: string;
}

export interface Repository {
  path: string;
  name: string;
  branches: Branch[];
  currentBranch?: string;
}

export interface GraphState {
  commits: Commit[];
  branches: Branch[];
  selectedCommit?: string;
  loading: boolean;
  error?: string;
  filters: GraphFilters;
}

export interface Author {
  name: string;
  email: string;
}

export interface GraphFilters {
  branches?: string[];
  /** @deprecated Use `authors` (plural) for multi-author filtering. Kept for backward compatibility with `loadMoreCommits`. */
  author?: string;
  authors?: string[];
  afterDate?: string;
  beforeDate?: string;
  textFilter?: string;
  maxCount: number;
  skip?: number;
}

export type FileStageState = 'staged' | 'unstaged' | 'conflicted';

export type ConflictType = 'merge' | 'rebase' | 'cherry-pick';

export interface ConflictState {
  inConflict: boolean;
  conflictType?: ConflictType;
  conflictFiles: string[];
}

export interface UncommittedSummary {
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
  conflictFiles: FileChange[];
  conflictType?: ConflictType;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

export interface FileChange {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions?: number;
  deletions?: number;
  stageState?: FileStageState;
}

export type FileChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unknown';

export interface CommitDetails {
  hash: string;
  abbreviatedHash: string;
  parents: string[];
  author: string;
  authorEmail: string;
  authorDate: number;
  committer: string;
  committerEmail: string;
  committerDate: number;
  subject: string;
  body: string;
  files: FileChange[];
  stats: { additions: number; deletions: number };
}

export type DetailsPanelPosition = 'bottom' | 'right';

export type FileViewMode = 'list' | 'tree';

export const COMMIT_TABLE_COLUMN_IDS = [
  'graph',
  'hash',
  'message',
  'author',
  'date',
  'signature',
] as const;

export type CommitTableColumnId = (typeof COMMIT_TABLE_COLUMN_IDS)[number];

export interface CommitTableColumnPreference {
  visible: boolean;
  preferredWidth: number;
}

export interface CommitTableLayout {
  order: CommitTableColumnId[];
  columns: Record<CommitTableColumnId, CommitTableColumnPreference>;
}

export const DEFAULT_COMMIT_TABLE_COLUMN_ORDER: CommitTableColumnId[] = [
  'graph',
  'hash',
  'message',
  'author',
  'date',
  'signature',
];

export const DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES: Record<CommitTableColumnId, CommitTableColumnPreference> = {
  graph: { visible: true, preferredWidth: 120 },
  hash: { visible: true, preferredWidth: 72 },
  message: { visible: true, preferredWidth: 400 },
  author: { visible: true, preferredWidth: 160 },
  date: { visible: true, preferredWidth: 140 },
  // Hidden by default (FR-006); glyph-sized so it stays narrow when enabled.
  signature: { visible: false, preferredWidth: 40 },
};

// Per-column minimum widths — shared so the backend can heal oversized
// persisted widths using the same ceiling logic as the webview.
// The `date` minimum is sized for the shortest format ("just now"); longer
// formats render via `preferredWidth`.
export const COMMIT_TABLE_MIN_WIDTHS: Record<CommitTableColumnId, number> = {
  graph: 52,
  hash: 72,
  message: 160,
  author: 120,
  date: 64,
  signature: 32,
};

export function createDefaultCommitTableLayout(): CommitTableLayout {
  return {
    order: [...DEFAULT_COMMIT_TABLE_COLUMN_ORDER],
    columns: {
      graph: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.graph },
      hash: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.hash },
      message: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.message },
      author: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.author },
      date: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.date },
      signature: { ...DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES.signature },
    },
  };
}

export function cloneCommitTableLayout(layout: CommitTableLayout): CommitTableLayout {
  return {
    order: [...layout.order],
    columns: {
      graph: { ...layout.columns.graph },
      hash: { ...layout.columns.hash },
      message: { ...layout.columns.message },
      author: { ...layout.columns.author },
      date: { ...layout.columns.date },
      signature: { ...layout.columns.signature },
    },
  };
}

export const DEFAULT_COMMIT_TABLE_LAYOUT: CommitTableLayout = createDefaultCommitTableLayout();

export interface RemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface StashEntry {
  index: number;
  hash: string;
  parentHash: string;
  message: string;
  date: number;
  author: string;
  authorEmail: string;
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type PushForceMode = 'none' | 'force-with-lease' | 'force';

export interface MergeOptions {
  noCommit: boolean;
  noFastForward: boolean;
  squash?: boolean;
}

export interface CherryPickOptions {
  appendSourceRef: boolean;
  noCommit: boolean;
  mainlineParent?: number;  // 1-indexed; required when cherry-picking a merge commit (-m flag)
}

export type CherryPickState = 'idle' | 'in-progress';

export type RevertState = 'idle' | 'in-progress';

/** Mode for the Revert Commit dialog. */
export type RevertMode = 'commit' | 'no-commit' | 'edit-message';

/** Options collected from the RevertDialog and forwarded to the backend. */
export interface RevertOptions {
  mode: RevertMode;
  /** Required when the target commit has >1 parent (i.e. is a merge commit). 1-indexed. */
  mainlineParent?: number;
  /** Required ONLY when mode === 'edit-message'. Non-empty after trim. */
  message?: string;
}

/**
 * Flat 7-state classification of a commit's signature/verification outcome
 * (047-signing-verification). Replaces the legacy `'good' | 'bad' | 'unknown' | 'none'`
 * enum **and** the separate `verificationUnavailable` boolean.
 *
 * `unavailable` vs `unsigned` is the FR-017 distinction: a present signature that
 * git cannot verify locally (e.g. SSH with no `allowedSignersFile`) is `unavailable`,
 * never `unsigned`. Presence is detected independently of the `%G?` verdict.
 */
export type SignatureStatus =
  | 'verified'           // %G? = G : good, trusted
  | 'bad'                // %G? = B : bad/tampered signature
  | 'signed-not-trusted' // %G? = U : good sig, key present but untrusted
  | 'signed-key-missing' // %G? = E : cannot check, key missing
  | 'signed-not-good'    // %G? = X/Y/R : expired sig / expired key / revoked key
  | 'unavailable'        // signature present but no verdict (e.g. SSH no allowed-signers)
  | 'unsigned';          // no signature in the commit object (blank column cell)

export type SignatureFormat = 'gpg' | 'ssh';

/**
 * Whether a commit object carries a signature, determined independently of
 * verification/config (the source of truth for signed-vs-unsigned, FR-017).
 */
export type SignaturePresence = 'signed' | 'not-signed';

export interface CommitSignatureInfo {
  status: SignatureStatus;
  signer: string;
  keyId: string;
  fingerprint: string;
  format: SignatureFormat;
}

export interface CommitParentInfo {
  hash: string;
  abbreviatedHash: string;
  subject: string;
}

export type RebaseAction = 'pick' | 'squash' | 'fixup' | 'drop' | 'reword';

export interface RebaseEntry {
  hash: string;
  abbreviatedHash: string;
  subject: string;
  action: RebaseAction;
  rewordMessage?: string;
}

export interface SquashGroupMessage {
  groupLeadHash: string;
  combinedMessage: string;
}

export interface InteractiveRebaseConfig {
  baseHash: string;
  entries: RebaseEntry[];
  squashMessages: SquashGroupMessage[];
}

export type AvatarUrlMap = Record<string, string>;

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string;
  isMain: boolean;
  isDetached: boolean;
  /** True when this worktree's path matches the active repo cwd ("you are here"). */
  isCurrent: boolean;
  /** True when git reports the worktree as prunable (its folder is missing/stale). */
  isPrunable: boolean;
}

/**
 * Branch-mode for creating a worktree (research R4). Single source of truth for
 * the RPC payloads, the command builder, and the create dialog.
 * - `existing`  → `git worktree add <path> <ref>`
 * - `new`       → `git worktree add -b <newBranchName> <path> <ref>`
 * - `detached`  → `git worktree add --detach <path> <ref>`
 */
export type WorktreeBranchMode = 'existing' | 'new' | 'detached';

export interface ExternalRef {
  label: string;
  url: string | null;
  type: 'pr-or-issue' | 'jira';
}

export interface ContainingBranchesResult {
  branches: string[];
  status: 'loaded' | 'loading' | 'error';
}

export interface PersistedUIState {
  version: number;
  detailsPanelPosition: DetailsPanelPosition;
  fileViewMode: FileViewMode;
  bottomPanelHeight: number;
  rightPanelWidth: number;
  /**
   * Column layout is stored per repository on the backend, but included in the
   * hydration payload so the webview receives it alongside global UI state.
   */
  commitTableLayout: CommitTableLayout;
}

export const DEFAULT_PERSISTED_UI_STATE: PersistedUIState = {
  version: 1,
  detailsPanelPosition: 'bottom',
  fileViewMode: 'list',
  bottomPanelHeight: 280,
  rightPanelWidth: 400,
  commitTableLayout: createDefaultCommitTableLayout(),
};

export type RebaseState = 'idle' | 'in-progress';

export type ActiveToggleWidget = 'search' | 'filter' | 'compare' | 'worktree' | null;

/** Well-known constant: the SHA of Git's empty tree object. Used as the synthetic
 *  parent for root commits in compare ranges (FR-016, 042-compare-refs). */
export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * One side of a compare selection (slot A or slot B). 042-compare-refs.
 * Stored by user intent (lazy resolve per FR-007a): branch/tag/expression slots
 * carry the ref name/text and are resolved to a hash at Compare-click time;
 * `commit` slots carry an already-resolved hash.
 *
 * `emptyTree` is synthetic — only emitted when "Compare these commits" runs
 * against a selection whose oldest commit is a root commit (FR-016).
 */
export type SlotValue =
  | { kind: 'workingTree' }
  | { kind: 'head' }
  | { kind: 'branch'; name: string; remote?: string }
  | { kind: 'tag'; name: string }
  | { kind: 'commit'; hash: string }
  | { kind: 'expression'; text: string }
  | { kind: 'emptyTree' };

export type CompareMode = 'two-dot' | 'three-dot';

/**
 * The (A, B, mode) tuple plus per-slot resolved hashes (driving graph A/B markers
 * per FR-026/028) and the recently-used ring buffer (FR-005). Lives in the
 * webview's Zustand store; cleared on repo switch (FR-030) and window reload
 * (FR-031). 042-compare-refs.
 */
export interface CompareSelection {
  a: SlotValue | null;
  b: SlotValue | null;
  /** User's explicit mode override; null means "use the default rule" (FR-009/010). */
  modeOverride: CompareMode | null;
  /** Last successfully resolved hashes for A and B; used to drive graph A/B markers
   *  (FR-026) and the FR-014 same-as-A guard. Null for working-tree side. */
  aResolvedHash: string | null;
  bResolvedHash: string | null;
  /** Recently-used items, most-recent first, max 8 (FR-005). */
  recents: SlotValue[];
}

export const EMPTY_COMPARE_SELECTION: CompareSelection = {
  a: null,
  b: null,
  modeOverride: null,
  aResolvedHash: null,
  bResolvedHash: null,
  recents: [],
};

/** Maximum number of recently-used slot values stored on `CompareSelection.recents`. */
export const COMPARE_RECENTS_MAX = 8;

/**
 * Output of a compare operation. Rendered in the existing CommitDetailsPanel
 * (FR-022). Same `FileChange[]` shape as `CommitDetails.files` so existing
 * renderer reuses. 042-compare-refs.
 */
export interface CompareResult {
  a: SlotValue;
  b: SlotValue;
  mode: CompareMode;
  /** True iff a three-dot was requested but fell back to two-dot because no merge
   *  base existed (FR-012 inline notice). */
  fellBackToTwoDot: boolean;
  /** Resolved hashes used for the diff. For working-tree side, null. */
  aResolvedHash: string | null;
  bResolvedHash: string | null;
  files: FileChange[];
  stats: { additions: number; deletions: number };
}

/**
 * Transient UI state for the compare flow: in-flight loading, cancellation
 * request id, and inline error text. Cleared on repo switch / reload.
 * 042-compare-refs.
 */
export interface ComparePanelUIState {
  /** True while a compare RPC is in flight (drives FR-025a loading and FR-025b Cancel). */
  loading: boolean;
  /** Inline error from the last Compare attempt, or null. */
  inlineError: string | null;
  /** Active compare requestId (used by Cancel to identify which request to abort). */
  activeRequestId: string | null;
}

export const EMPTY_COMPARE_PANEL_UI_STATE: ComparePanelUIState = {
  loading: false,
  inlineError: null,
  activeRequestId: null,
};

export interface RebaseConflictInfo {
  conflictedFiles: string[];
  conflictCommitHash: string;
  conflictCommitMessage: string;
}
