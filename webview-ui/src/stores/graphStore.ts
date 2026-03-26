import { create } from 'zustand';
import type {
  Branch,
  CherryPickOptions,
  Commit,
  CommitDetails,
  CommitSignatureInfo,
  DetailsPanelPosition,
  FileViewMode,
  GraphFilters,
  RemoteInfo,
  RebaseConflictInfo,
  RebaseEntry,
  RepoInfo,
  SearchState,
  StashEntry,
  Submodule,
  SubmoduleNavEntry,
  UserSettings,
} from '@shared/types';
import { DEFAULT_USER_SETTINGS } from '@shared/types';
import { calculateTopology, type GraphTopology } from '../utils/graphTopology';

interface GraphStore {
  commits: Commit[];
  branches: Branch[];
  topology: GraphTopology;
  selectedCommit: string | undefined;
  selectedCommitIndex: number;
  commitDetails: CommitDetails | undefined;
  detailsPanelOpen: boolean;
  detailsPanelPosition: DetailsPanelPosition;
  loading: boolean;
  error: string | undefined;
  successMessage: string | undefined;
  filters: GraphFilters;
  remotes: RemoteInfo[];
  stashes: StashEntry[];
  mergedCommits: Commit[];
  maxVisibleRefs: number;
  cherryPickInProgress: boolean;
  cherryPickOptions: CherryPickOptions;
  rebaseInProgress: boolean;
  rebaseConflictInfo: RebaseConflictInfo | undefined;
  revertInProgress: boolean;
  signatureCache: Record<string, CommitSignatureInfo | null>;
  signatureLoading: Record<string, boolean>;
  pendingRebaseEntries: RebaseEntry[] | undefined;
  selectedCommits: string[];
  lastClickedHash: string | undefined;
  hasMore: boolean;
  prefetching: boolean;
  fetchGeneration: number;
  lastBatchStartIndex: number;
  totalLoadedWithoutFilter: number | null;
  pendingCheckout: { name: string; pull?: boolean } | null;
  pendingCommitCheckout: { hash: string } | null;
  pendingForceDeleteBranch: { name: string; deleteRemote?: { remote: string; name: string } } | null;
  repos: RepoInfo[];
  activeRepoPath: string;
  isLoadingRepo: boolean;
  userSettings: UserSettings;
  pendingUserSettings: UserSettings | undefined;
  searchState: SearchState;
  gitHubAvatarUrls: Record<string, string>;
  submodules: Submodule[];
  submoduleStack: SubmoduleNavEntry[];
  fileViewMode: FileViewMode;
  setFileViewMode: (mode: FileViewMode) => void;
  setGitHubAvatarUrls: (urls: Record<string, string>) => void;
  setCommits: (commits: Commit[]) => void;
  appendCommits: (newCommits: Commit[], totalLoadedWithoutFilter?: number) => void;
  setBranches: (branches: Branch[]) => void;
  setSelectedCommit: (hash: string | undefined) => void;
  selectCommit: (index: number) => void;
  moveSelection: (delta: number) => void;
  setCommitDetails: (details: CommitDetails | undefined) => void;
  setDetailsPanelOpen: (open: boolean) => void;
  toggleDetailsPanelPosition: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | undefined) => void;
  setSuccessMessage: (message: string | undefined) => void;
  setFilters: (filters: Partial<GraphFilters>) => void;
  setRemotes: (remotes: RemoteInfo[]) => void;
  setStashes: (stashes: StashEntry[]) => void;
  setMaxVisibleRefs: (count: number) => void;
  setCherryPickInProgress: (inProgress: boolean) => void;
  setCherryPickOptions: (options: CherryPickOptions) => void;
  setRebaseInProgress: (inProgress: boolean) => void;
  setRebaseConflictInfo: (info: RebaseConflictInfo | undefined) => void;
  setRevertInProgress: (inProgress: boolean) => void;
  setSignatureInfo: (hash: string, info: CommitSignatureInfo | null) => void;
  clearSignatureCache: () => void;
  setSignatureLoading: (hash: string, loading: boolean) => void;
  setPendingRebaseEntries: (entries: RebaseEntry[] | undefined) => void;
  setSelectedCommits: (hashes: string[]) => void;
  setSelectionAnchor: (hash: string | undefined) => void;
  toggleSelectedCommit: (hash: string) => void;
  selectCommitRange: (toHash: string) => void;
  clearSelectedCommits: () => void;
  setHasMore: (has: boolean) => void;
  setPrefetching: (v: boolean) => void;
  setTotalLoadedWithoutFilter: (n: number | null) => void;
  setPendingCheckout: (checkout: { name: string; pull?: boolean } | null) => void;
  setPendingCommitCheckout: (checkout: { hash: string } | null) => void;
  setPendingForceDeleteBranch: (pending: { name: string; deleteRemote?: { remote: string; name: string } } | null) => void;
  setRepos: (repos: RepoInfo[], activeRepoPath: string) => void;
  setActiveRepo: (repoPath: string) => void;
  setIsLoadingRepo: (v: boolean) => void;
  setUserSettings: (settings: UserSettings) => void;
  openSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (query: string) => void;
  setSearchMatches: (matchIndices: number[]) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  setSubmodules: (submodules: Submodule[], stack?: SubmoduleNavEntry[]) => void;
  pushSubmodule: (entry: SubmoduleNavEntry) => void;
  popSubmodule: () => void;
}

const emptyTopology: GraphTopology = {
  nodes: new Map(),
  maxLanes: 0,
  passingLanesByRow: new Map(),
  commitIndexByHash: new Map(),
};

const defaultSearchState: SearchState = {
  isOpen: false,
  query: '',
  matchIndices: [],
  currentMatchIndex: -1,
};

function mergeStashesIntoCommits(commits: Commit[], stashes: StashEntry[]): Commit[] {
  if (stashes.length === 0) return commits;

  const merged = [...commits];
  const commitIndexByHash = new Map<string, number>();
  for (let i = 0; i < merged.length; i++) {
    commitIndexByHash.set(merged[i].hash, i);
  }

  const stashInsertions: { index: number; commit: Commit }[] = [];
  for (const stash of stashes) {
    const parentIndex = commitIndexByHash.get(stash.parentHash);
    if (parentIndex === undefined) continue;

    stashInsertions.push({
      index: parentIndex,
      commit: {
        hash: stash.hash,
        abbreviatedHash: stash.hash.slice(0, 7),
        parents: [stash.parentHash],
        author: stash.author,
        authorEmail: stash.authorEmail,
        authorDate: stash.date,
        subject: stash.message,
        refs: [{ name: `stash@{${stash.index}}`, type: 'stash' }],
      },
    });
  }

  stashInsertions.sort((a, b) => b.index - a.index);
  for (const { index, commit } of stashInsertions) {
    merged.splice(index, 0, commit);
  }

  return merged;
}

function computeMergedTopology(commits: Commit[], stashes: StashEntry[]): { mergedCommits: Commit[]; topology: GraphTopology } {
  const mergedCommits = mergeStashesIntoCommits(commits, stashes);
  return { mergedCommits, topology: calculateTopology(mergedCommits) };
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  commits: [],
  branches: [],
  topology: emptyTopology,
  selectedCommit: undefined,
  selectedCommitIndex: -1,
  commitDetails: undefined,
  detailsPanelOpen: false,
  detailsPanelPosition: 'bottom',
  loading: true,
  error: undefined,
  successMessage: undefined,
  filters: {
    maxCount: DEFAULT_USER_SETTINGS.batchCommitSize,
  },
  remotes: [],
  stashes: [],
  mergedCommits: [],
  maxVisibleRefs: 3,
  cherryPickInProgress: false,
  cherryPickOptions: { appendSourceRef: false, noCommit: false },
  rebaseInProgress: false,
  rebaseConflictInfo: undefined,
  revertInProgress: false,
  signatureCache: {},
  signatureLoading: {},
  pendingRebaseEntries: undefined,
  selectedCommits: [],
  lastClickedHash: undefined,
  hasMore: true,
  prefetching: false,
  fetchGeneration: 0,
  lastBatchStartIndex: 0,
  totalLoadedWithoutFilter: null,
  pendingCheckout: null,
  pendingCommitCheckout: null,
  pendingForceDeleteBranch: null,
  repos: [],
  activeRepoPath: '',
  isLoadingRepo: false,
  userSettings: { ...DEFAULT_USER_SETTINGS },
  pendingUserSettings: undefined,
  searchState: defaultSearchState,
  gitHubAvatarUrls: {},
  submodules: [],
  submoduleStack: [],
  fileViewMode: 'list',
  setFileViewMode: (mode) => set({ fileViewMode: mode }),
  setGitHubAvatarUrls: (urls) => set((state) => ({
    gitHubAvatarUrls: { ...state.gitHubAvatarUrls, ...urls },
  })),
  setCommits: (commits) => {
    const { mergedCommits, topology } = computeMergedTopology(commits, get().stashes);
    const selectedCommit = get().selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;

    // Preserve multi-selection and last-clicked state for hashes that still exist
    const newHashSet = new Set(mergedCommits.map((c) => c.hash));
    const prevSelectedCommits = get().selectedCommits;
    const prevLastClickedHash = get().lastClickedHash;

    set({
      commits,
      mergedCommits,
      topology,
      selectedCommit: selectedCommitIndex >= 0 ? selectedCommit : undefined,
      selectedCommitIndex,
      selectedCommits: prevSelectedCommits.filter((h) => newHashSet.has(h)),
      lastClickedHash: prevLastClickedHash && newHashSet.has(prevLastClickedHash) ? prevLastClickedHash : undefined,
      hasMore: true,
      prefetching: false,
      fetchGeneration: get().fetchGeneration + 1,
      lastBatchStartIndex: 0,
      totalLoadedWithoutFilter: null,
      pendingCommitCheckout: null,
      signatureCache: {},
      signatureLoading: {},
    });
  },
  appendCommits: (newCommits, totalLoadedWithoutFilter) => {
    const { commits, stashes, filters, totalLoadedWithoutFilter: existingTotal, selectedCommit } = get();
    const allCommits = [...commits, ...newCommits];
    const { mergedCommits, topology } = computeMergedTopology(allCommits, stashes);
    const hasFilter = !!(filters.branch || filters.author);
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;

    set({
      commits: allCommits,
      mergedCommits,
      topology,
      selectedCommitIndex,
      lastBatchStartIndex: commits.length,
      ...((!hasFilter && totalLoadedWithoutFilter !== undefined)
        ? { totalLoadedWithoutFilter: (existingTotal ?? 0) + totalLoadedWithoutFilter }
        : {}),
    });
  },
  setBranches: (branches) => set({ branches }),
  setSelectedCommit: (selectedCommit) => {
    const index = selectedCommit
      ? get().mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;
    set({ selectedCommit, selectedCommitIndex: index });
  },
  selectCommit: (index) => {
    const commits = get().mergedCommits;
    if (index < 0 || index >= commits.length) {
      set({ selectedCommit: undefined, selectedCommitIndex: -1 });
      return;
    }

    const commit = commits[index];
    set({
      selectedCommit: commit.hash,
      selectedCommitIndex: index,
      lastClickedHash: commit.hash,
      selectedCommits: [],
    });
  },
  moveSelection: (delta) => {
    const commits = get().mergedCommits;
    if (commits.length === 0) return;

    const currentIndex = get().selectedCommitIndex >= 0 ? get().selectedCommitIndex : 0;
    const nextIndex = Math.max(0, Math.min(commits.length - 1, currentIndex + delta));
    const commit = commits[nextIndex];
    set({
      selectedCommit: commit.hash,
      selectedCommitIndex: nextIndex,
      lastClickedHash: commit.hash,
      selectedCommits: [],
    });
  },
  setCommitDetails: (commitDetails) => set({
    commitDetails,
    detailsPanelOpen: commitDetails !== undefined,
  }),
  setDetailsPanelOpen: (detailsPanelOpen) => set({ detailsPanelOpen }),
  toggleDetailsPanelPosition: () =>
    set((state) => ({
      detailsPanelPosition: state.detailsPanelPosition === 'bottom' ? 'right' : 'bottom',
    })),
  setLoading: (loading) => set((state) => {
    if (!loading && state.pendingUserSettings) {
      return {
        loading,
        userSettings: state.pendingUserSettings,
        pendingUserSettings: undefined,
        filters: { ...state.filters, maxCount: state.pendingUserSettings.batchCommitSize },
      };
    }
    return { loading };
  }),
  setError: (error) => set({ error }),
  setSuccessMessage: (successMessage) => {
    set({ successMessage });
    if (successMessage) {
      setTimeout(() => {
        set((state) => (
          state.successMessage === successMessage
            ? { successMessage: undefined }
            : {}
        ));
      }, 3000);
    }
  },
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setRemotes: (remotes) => set({ remotes }),
  setStashes: (stashes) => {
    const { mergedCommits, topology } = computeMergedTopology(get().commits, stashes);
    const selectedCommit = get().selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;
    set({ stashes, mergedCommits, topology, selectedCommitIndex });
  },
  setMaxVisibleRefs: (count) => set({ maxVisibleRefs: count }),
  setCherryPickInProgress: (cherryPickInProgress) => set({ cherryPickInProgress }),
  setCherryPickOptions: (cherryPickOptions) => set({ cherryPickOptions }),
  setRebaseInProgress: (rebaseInProgress) => set({ rebaseInProgress }),
  setRebaseConflictInfo: (rebaseConflictInfo) => set({ rebaseConflictInfo }),
  setRevertInProgress: (revertInProgress) => set({ revertInProgress }),
  setSignatureInfo: (hash, info) => set((state) => ({
    signatureCache: { ...state.signatureCache, [hash]: info },
    signatureLoading: { ...state.signatureLoading, [hash]: false },
  })),
  clearSignatureCache: () => set({ signatureCache: {}, signatureLoading: {} }),
  setSignatureLoading: (hash, loading) => set((state) => ({
    signatureLoading: { ...state.signatureLoading, [hash]: loading },
  })),
  setPendingRebaseEntries: (pendingRebaseEntries) => set({ pendingRebaseEntries }),
  setSelectedCommits: (selectedCommits) => set({ selectedCommits }),
  setSelectionAnchor: (lastClickedHash) => set({ lastClickedHash }),
  toggleSelectedCommit: (hash) => set((state) => {
    const exists = state.selectedCommits.includes(hash);
    const selectedCommits = exists
      ? state.selectedCommits.filter((item) => item !== hash)
      : [...state.selectedCommits, hash];
    return { selectedCommits, lastClickedHash: hash };
  }),
  selectCommitRange: (toHash) => set((state) => {
    const { lastClickedHash, mergedCommits } = state;
    if (!lastClickedHash) {
      return { selectedCommits: [toHash], lastClickedHash: toHash };
    }

    const fromIndex = mergedCommits.findIndex((commit) => commit.hash === lastClickedHash);
    const toIndex = mergedCommits.findIndex((commit) => commit.hash === toHash);
    if (fromIndex === -1 || toIndex === -1) {
      return { selectedCommits: [toHash], lastClickedHash: toHash };
    }

    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    const selectedCommits = mergedCommits.slice(start, end + 1).map((commit) => commit.hash);
    return { selectedCommits };
  }),
  clearSelectedCommits: () => set({ selectedCommits: [], lastClickedHash: undefined }),
  setHasMore: (hasMore) => set({ hasMore }),
  setPrefetching: (prefetching) => set({ prefetching }),
  setTotalLoadedWithoutFilter: (totalLoadedWithoutFilter) => set({ totalLoadedWithoutFilter }),
  setPendingCheckout: (pendingCheckout) => set({ pendingCheckout }),
  setPendingCommitCheckout: (pendingCommitCheckout) => set({ pendingCommitCheckout }),
  setPendingForceDeleteBranch: (pending) => set({ pendingForceDeleteBranch: pending }),
  setRepos: (repos, activeRepoPath) => {
    const { activeRepoPath: prevPath, filters } = get();
    const repoChanged = prevPath !== '' && prevPath !== activeRepoPath;
    set({
      repos,
      activeRepoPath,
      ...(repoChanged
        ? { filters: { maxCount: filters.maxCount }, totalLoadedWithoutFilter: null, pendingCommitCheckout: null }
        : {}),
    });
  },
  setActiveRepo: (repoPath) => {
    set({
      isLoadingRepo: true,
      pendingCommitCheckout: null,
      selectedCommit: undefined,
      selectedCommitIndex: -1,
      selectedCommits: [],
      lastClickedHash: undefined,
      commitDetails: undefined,
      detailsPanelOpen: false,
    });
    import('../rpc/rpcClient').then(({ rpcClient }) => {
      rpcClient.send({ type: 'switchRepo', payload: { repoPath } });
    }).catch(() => {
      set({ isLoadingRepo: false });
    });
  },
  setIsLoadingRepo: (isLoadingRepo) => set({ isLoadingRepo }),
  setUserSettings: (settings) => set((state) => (
    state.loading
      ? { pendingUserSettings: settings }
      : { userSettings: settings, pendingUserSettings: undefined, filters: { ...state.filters, maxCount: settings.batchCommitSize } }
  )),
  openSearch: () => set((state) => ({
    searchState: {
      ...state.searchState,
      isOpen: true,
    },
  })),
  closeSearch: () => set({
    searchState: defaultSearchState,
  }),
  setSearchQuery: (query) => set((state) => ({
    searchState: {
      ...state.searchState,
      query,
    },
  })),
  setSearchMatches: (matchIndices) => set((state) => ({
    searchState: {
      ...state.searchState,
      matchIndices,
      currentMatchIndex: matchIndices.length > 0 ? 0 : -1,
    },
  })),
  nextMatch: () => set((state) => {
    const { matchIndices, currentMatchIndex } = state.searchState;
    if (matchIndices.length === 0) return {};
    return {
      searchState: {
        ...state.searchState,
        currentMatchIndex: (currentMatchIndex + 1) % matchIndices.length,
      },
    };
  }),
  prevMatch: () => set((state) => {
    const { matchIndices, currentMatchIndex } = state.searchState;
    if (matchIndices.length === 0) return {};
    return {
      searchState: {
        ...state.searchState,
        currentMatchIndex: (currentMatchIndex - 1 + matchIndices.length) % matchIndices.length,
      },
    };
  }),
  setSubmodules: (submodules, stack) => set((state) => ({
    submodules,
    submoduleStack: stack ?? state.submoduleStack,
  })),
  pushSubmodule: (entry) => set((state) => ({
    submoduleStack: [...state.submoduleStack, entry],
  })),
  popSubmodule: () => set((state) => ({
    submoduleStack: state.submoduleStack.slice(0, -1),
  })),
}));
