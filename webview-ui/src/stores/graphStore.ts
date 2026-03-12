import { create } from 'zustand';
import type { Commit, Branch, CommitDetails, DetailsPanelPosition, GraphFilters, RemoteInfo, StashEntry, CherryPickOptions, RebaseConflictInfo, RebaseEntry, RepoInfo, CommitSignatureInfo } from '@shared/types';
import { calculateTopology, type GraphTopology } from '../utils/graphTopology';

interface GraphStore {
  commits: Commit[];
  branches: Branch[];
  topology: GraphTopology;
  selectedCommit: string | undefined;
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
  // Cherry-pick state
  cherryPickInProgress: boolean;
  cherryPickOptions: CherryPickOptions;
  // Rebase state (conflict-paused, not execution loading)
  rebaseInProgress: boolean;
  rebaseConflictInfo: RebaseConflictInfo | undefined;
  revertInProgress: boolean;
  signatureCache: Record<string, CommitSignatureInfo | null>;
  signatureLoading: Record<string, boolean>;
  // Pending rebase entries (populated by rebaseCommits response; consumed by InteractiveRebaseDialog)
  pendingRebaseEntries: RebaseEntry[] | undefined;
  // Multi-select state
  selectedCommits: string[];
  lastClickedHash: string | undefined;
  // Pagination state
  hasMore: boolean;
  prefetching: boolean;
  fetchGeneration: number;
  lastBatchStartIndex: number;
  // Commit counter — null means not yet received from backend
  totalLoadedWithoutFilter: number | null;
  // Stash-and-checkout pending state
  pendingCheckout: { name: string; pull?: boolean } | null;
  pendingForceDeleteBranch: string | null;
  // Repository navigation
  repos: RepoInfo[];
  activeRepoPath: string;
  isLoadingRepo: boolean;
  setCommits: (commits: Commit[]) => void;
  setBranches: (branches: Branch[]) => void;
  setSelectedCommit: (hash: string | undefined) => void;
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
  // Pagination actions
  appendCommits: (newCommits: Commit[], totalLoadedWithoutFilter?: number) => void;
  setHasMore: (has: boolean) => void;
  setPrefetching: (v: boolean) => void;
  setTotalLoadedWithoutFilter: (n: number | null) => void;
  setPendingCheckout: (checkout: { name: string; pull?: boolean } | null) => void;
  setPendingForceDeleteBranch: (branchName: string | null) => void;
  // Repository navigation actions
  setRepos: (repos: RepoInfo[], activeRepoPath: string) => void;
  setActiveRepo: (repoPath: string) => void;
  setIsLoadingRepo: (v: boolean) => void;
}

const emptyTopology: GraphTopology = {
  nodes: new Map(),
  maxLanes: 0,
  passingLanesByRow: new Map(),
  commitIndexByHash: new Map(),
};

function mergeStashesIntoCommits(commits: Commit[], stashes: StashEntry[]): Commit[] {
  if (stashes.length === 0) return commits;

  const merged = [...commits];
  const commitIndexByHash = new Map<string, number>();
  for (let i = 0; i < merged.length; i++) {
    commitIndexByHash.set(merged[i].hash, i);
  }

  // Insert stash pseudo-commits after their parent commit
  // Process in reverse so insertion indices remain valid
  const stashInsertions: { index: number; commit: Commit }[] = [];
  for (const stash of stashes) {
    const parentIndex = commitIndexByHash.get(stash.parentHash);
    if (parentIndex === undefined) continue; // parent not in current view — skip

    stashInsertions.push({
      index: parentIndex,
      commit: {
        hash: stash.hash,
        abbreviatedHash: stash.hash.slice(0, 7),
        parents: [stash.parentHash],
        author: '',
        authorEmail: '',
        authorDate: stash.date,
        subject: stash.message,
        refs: [{ name: `stash@{${stash.index}}`, type: 'stash' }],
      },
    });
  }

  // Sort insertions by index descending so splice doesn't shift later indices
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
  commitDetails: undefined,
  detailsPanelOpen: false,
  detailsPanelPosition: 'bottom',
  loading: true,
  error: undefined,
  successMessage: undefined,
  filters: {
    maxCount: 500,
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
  pendingForceDeleteBranch: null,
  repos: [],
  activeRepoPath: '',
  isLoadingRepo: false,
  setCommits: (commits) => {
    const { mergedCommits, topology } = computeMergedTopology(commits, get().stashes);
    set({
      commits,
      mergedCommits,
      topology,
      selectedCommits: [],
      lastClickedHash: undefined,
      hasMore: true,
      prefetching: false,
      fetchGeneration: get().fetchGeneration + 1,
      lastBatchStartIndex: 0,
      totalLoadedWithoutFilter: null,
      signatureCache: {},
      signatureLoading: {},
    });
  },
  setBranches: (branches) => set({ branches }),
  setSelectedCommit: (selectedCommit) => set({ selectedCommit }),
  setCommitDetails: (commitDetails) => set({
    commitDetails,
    detailsPanelOpen: commitDetails !== undefined,
  }),
  setDetailsPanelOpen: (detailsPanelOpen) => set({ detailsPanelOpen }),
  toggleDetailsPanelPosition: () =>
    set((state) => ({
      detailsPanelPosition: state.detailsPanelPosition === 'bottom' ? 'right' : 'bottom',
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSuccessMessage: (successMessage) => {
    set({ successMessage });
    // Auto-clear success message after 3 seconds
    if (successMessage) {
      setTimeout(() => {
        set((state) => {
          if (state.successMessage === successMessage) {
            return { successMessage: undefined };
          }
          return {};
        });
      }, 3000);
    }
  },
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setRemotes: (remotes) => set({ remotes }),
  setStashes: (stashes) => {
    const { mergedCommits, topology } = computeMergedTopology(get().commits, stashes);
    set({ stashes, mergedCommits, topology });
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
      ? state.selectedCommits.filter((h) => h !== hash)
      : [...state.selectedCommits, hash];
    return { selectedCommits, lastClickedHash: hash };
  }),
  selectCommitRange: (toHash) => set((state) => {
    const { lastClickedHash, mergedCommits } = state;
    if (!lastClickedHash) {
      return { selectedCommits: [toHash], lastClickedHash: toHash };
    }
    const fromIndex = mergedCommits.findIndex((c) => c.hash === lastClickedHash);
    const toIndex = mergedCommits.findIndex((c) => c.hash === toHash);
    if (fromIndex === -1 || toIndex === -1) {
      return { selectedCommits: [toHash], lastClickedHash: toHash };
    }
    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    const selectedCommits = mergedCommits.slice(start, end + 1).map((c) => c.hash);
    return { selectedCommits };
  }),
  clearSelectedCommits: () => set({ selectedCommits: [], lastClickedHash: undefined }),
  appendCommits: (newCommits, totalLoadedWithoutFilter) => {
    const { commits, stashes, filters, totalLoadedWithoutFilter: existingTotal } = get();
    const allCommits = [...commits, ...newCommits];
    const { mergedCommits, topology } = computeMergedTopology(allCommits, stashes);
    const hasFilter = !!(filters.branch || filters.author);
    set({
      commits: allCommits,
      mergedCommits,
      topology,
      lastBatchStartIndex: commits.length,
      ...((!hasFilter && totalLoadedWithoutFilter !== undefined)
        ? { totalLoadedWithoutFilter: (existingTotal ?? 0) + totalLoadedWithoutFilter }
        : {}),
    });
  },
  setHasMore: (hasMore) => set({ hasMore }),
  setPrefetching: (prefetching) => set({ prefetching }),
  setTotalLoadedWithoutFilter: (totalLoadedWithoutFilter) => set({ totalLoadedWithoutFilter }),
  setPendingCheckout: (pendingCheckout) => set({ pendingCheckout }),
  setPendingForceDeleteBranch: (pendingForceDeleteBranch) => set({ pendingForceDeleteBranch }),
  setRepos: (repos, activeRepoPath) => {
    const { activeRepoPath: prevPath, filters } = get();
    const repoChanged = prevPath !== '' && prevPath !== activeRepoPath;
    set({
      repos,
      activeRepoPath,
      // Reset branch/author filter and commit counter when switching repos; preserve maxCount
      ...(repoChanged ? { filters: { maxCount: filters.maxCount }, totalLoadedWithoutFilter: null } : {}),
    });
  },
  setActiveRepo: (repoPath) => {
    set({ isLoadingRepo: true });
    // rpcClient will be called from the component — we dispatch via import to avoid circular deps
    import('../rpc/rpcClient').then(({ rpcClient }) => {
      rpcClient.send({ type: 'switchRepo', payload: { repoPath } });
    }).catch(() => {
      set({ isLoadingRepo: false });
    });
  },
  setIsLoadingRepo: (isLoadingRepo) => set({ isLoadingRepo }),
}));
