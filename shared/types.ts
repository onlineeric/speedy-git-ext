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

export interface GraphFilters {
  branch?: string;
  author?: string;
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
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

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

export type RebaseState = 'idle' | 'in-progress';

export interface RebaseConflictInfo {
  conflictedFiles: string[];
  conflictCommitHash: string;
  conflictCommitMessage: string;
}
