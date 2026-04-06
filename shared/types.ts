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

export type UserDateFormat = 'relative' | 'absolute';

export interface UserSettings {
  graphColors: string[];
  dateFormat: UserDateFormat;
  avatarsEnabled: boolean;
  showRemoteBranches: boolean;
  showTags: boolean;
  batchCommitSize: number;
  overScan: number;
}

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
}

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
  avatarsEnabled: true,
  showRemoteBranches: true,
  showTags: true,
  batchCommitSize: 500,
  overScan: 20,
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

export type RefType = 'head' | 'branch' | 'remote' | 'tag' | 'stash';

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
  maxCount: number;
  skip?: number;
}

export interface FileChange {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  additions?: number;
  deletions?: number;
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

export type CommitListMode = 'classic' | 'table';

export const COMMIT_TABLE_COLUMN_IDS = [
  'graph',
  'hash',
  'message',
  'author',
  'date',
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
];

export const DEFAULT_COMMIT_TABLE_COLUMN_PREFERENCES: Record<CommitTableColumnId, CommitTableColumnPreference> = {
  graph: { visible: true, preferredWidth: 120 },
  hash: { visible: true, preferredWidth: 72 },
  message: { visible: true, preferredWidth: 400 },
  author: { visible: true, preferredWidth: 160 },
  date: { visible: true, preferredWidth: 120 },
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

export type SignatureStatus = 'good' | 'bad' | 'unknown' | 'none';

export type SignatureFormat = 'gpg' | 'ssh';

export interface CommitSignatureInfo {
  status: SignatureStatus;
  signer: string;
  keyId: string;
  fingerprint: string;
  format: SignatureFormat;
  verificationUnavailable?: boolean;
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
}

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
  commitListMode: CommitListMode;
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
  commitListMode: 'table',
  commitTableLayout: createDefaultCommitTableLayout(),
};

export type RebaseState = 'idle' | 'in-progress';

export type ActiveToggleWidget = 'search' | 'filter' | 'compare' | null;

export interface RebaseConflictInfo {
  conflictedFiles: string[];
  conflictCommitHash: string;
  conflictCommitMessage: string;
}
