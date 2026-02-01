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
}
