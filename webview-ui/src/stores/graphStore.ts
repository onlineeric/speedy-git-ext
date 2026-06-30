import { create } from 'zustand';
import type {
  ActiveToggleWidget,
  Author,
  Branch,
  CherryPickOptions,
  RevertOptions,
  Commit,
  CommitDetails,
  CommitListMode,
  CommitTableLayout,
  CommitSignatureInfo,
  SignaturePresence,
  CompareMode,
  CompareResult,
  CompareSelection,
  ComparePanelUIState,
  ConflictState,
  ConflictType,
  ContainingBranchesResult,
  DetailsPanelPosition,
  FileChange,
  FileViewMode,
  GraphFilters,
  PersistedUIState,
  RemoteInfo,
  RebaseConflictInfo,
  RebaseEntry,
  RepoInfo,
  SearchState,
  SlotValue,
  StashEntry,
  Submodule,
  SubmoduleNavEntry,
  TagMetadata,
  UserSettings,
  UncommittedSummary,
  WorktreeInfo,
} from '@shared/types';
import {
  COMPARE_RECENTS_MAX,
  DEFAULT_USER_SETTINGS,
  DEFAULT_PERSISTED_UI_STATE,
  EMPTY_COMPARE_PANEL_UI_STATE,
  EMPTY_COMPARE_SELECTION,
  UNCOMMITTED_HASH,
  buildUncommittedSubject,
  cloneCommitTableLayout,
} from '@shared/types';
import { slotsEqual } from '../utils/compareSlot';
import type { InitialDataPayload } from '@shared/messages';
import { type GraphTopology } from '../utils/graphTopology';
import { computeHiddenCommitHashes } from '../utils/commitVisibility';
import { computeMergedTopology, type UncommittedContext } from '../utils/mergedCommits';
import { joinRepoPath } from '../utils/repoPath';
import { stripLocalBranchPrefix } from '../utils/worktreeDisplay';

interface WorktreeLookups {
  worktreeByHead: Map<string, WorktreeInfo[]>;
  worktreeByBranch: Map<string, WorktreeInfo>;
  detachedWorktreesByHead: Map<string, WorktreeInfo[]>;
}

/**
 * Build worktree lookup maps for tooltip and row rendering. `worktreeByHead`
 * intentionally includes the main worktree for tooltip/status surfaces; the
 * rendering maps skip only `isMain` so linked current worktrees still show.
 */
function buildWorktreeLookups(list: WorktreeInfo[]): WorktreeLookups {
  const worktreeByHead = new Map<string, WorktreeInfo[]>();
  const worktreeByBranch = new Map<string, WorktreeInfo>();
  const detachedWorktreesByHead = new Map<string, WorktreeInfo[]>();

  for (const wt of list) {
    const existing = worktreeByHead.get(wt.head);
    if (existing) {
      existing.push(wt);
    } else {
      worktreeByHead.set(wt.head, [wt]);
    }

    if (wt.isMain) continue;

    if (wt.isDetached || !wt.branch) {
      const detached = detachedWorktreesByHead.get(wt.head);
      if (detached) {
        detached.push(wt);
      } else {
        detachedWorktreesByHead.set(wt.head, [wt]);
      }
    } else {
      worktreeByBranch.set(stripLocalBranchPrefix(wt.branch), wt);
    }
  }

  return { worktreeByHead, worktreeByBranch, detachedWorktreesByHead };
}

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
  revertOptions: RevertOptions;
  rebaseInProgress: boolean;
  rebaseConflictInfo: RebaseConflictInfo | undefined;
  revertInProgress: boolean;
  signatureCache: Record<string, CommitSignatureInfo | null>;
  signatureLoading: Record<string, boolean>;
  /** Cheap presence results for the signature column, keyed by hash (047). */
  signaturePresence: Record<string, SignaturePresence>;
  /** Presence requests currently in flight, keyed by hash (047). */
  signaturePresenceLoading: Record<string, boolean>;
  /** Presence lookups that failed in the current visible column session (047). */
  signaturePresenceFailed: Record<string, boolean>;
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
  /**
   * Path the user has selected in the repo selector. Equals the parent path
   * when a submodule is being viewed via the submodule selector (the repo
   * selector visibly stays on the parent — FR-017).
   */
  activeParentRepoPath: string;
  /**
   * Path whose commits are currently rendered in the graph. Equals
   * `activeParentRepoPath` unless a submodule is selected, in which case it
   * equals the submodule's resolved absolute path.
   */
  displayedRepoPath: string;
  /**
   * Submodule selector's current value. 'parent' means the parent option is
   * selected; otherwise equals one of the parent's initialized submodule paths
   * (matching `submodule.path` exactly).
   */
  submoduleSelection: 'parent' | string;
  isLoadingRepo: boolean;
  userSettings: UserSettings;
  pendingUserSettings: UserSettings | undefined;
  searchState: SearchState;
  activeToggleWidget: ActiveToggleWidget;
  gitHubAvatarUrls: Record<string, string>;
  /** Tag annotation metadata keyed by tag name; whole-map replaced on each load (048). */
  tagMetadata: Record<string, TagMetadata>;
  submodules: Submodule[];
  submoduleStack: SubmoduleNavEntry[];
  fileViewMode: FileViewMode;
  bottomPanelHeight: number;
  rightPanelWidth: number;
  commitListMode: CommitListMode;
  commitTableLayout: CommitTableLayout;
  // Tooltip state
  hoveredCommitHash: string | null;
  tooltipAnchorRect: DOMRect | null;
  worktreeList: WorktreeInfo[];
  worktreeListLoading: boolean;
  authorList: Author[];
  authorListLoading: boolean;
  worktreeByHead: Map<string, WorktreeInfo[]>;
  worktreeByBranch: Map<string, WorktreeInfo>;
  detachedWorktreesByHead: Map<string, WorktreeInfo[]>;
  containingBranchesCache: Map<string, ContainingBranchesResult>;
  uncommittedStagedFiles: FileChange[];
  uncommittedUnstagedFiles: FileChange[];
  uncommittedConflictFiles: FileChange[];
  conflictType?: ConflictType;
  uncommittedCounts: { stagedCount: number; unstagedCount: number; untrackedCount: number };
  hasUncommittedChanges: boolean;
  hiddenCommitHashes: Set<string>;
  isRefreshing: boolean;
  consecutiveEmptyBatches: number;
  filteredOutCount: number;
  showGapIndicator: boolean;
  // Compare refs (042-compare-refs) — transient session state, not persisted
  compareSelection: CompareSelection;
  compareResult: CompareResult | null;
  comparePanelUI: ComparePanelUIState;
  setHoveredCommit: (hash: string | null, anchorRect: DOMRect | null) => void;
  setWorktreeList: (list: WorktreeInfo[]) => void;
  setWorktreeListLoading: (loading: boolean) => void;
  setContainingBranches: (hash: string, result: ContainingBranchesResult) => void;
  clearTooltipCaches: () => void;
  setFileViewMode: (mode: FileViewMode) => void;
  setBottomPanelHeight: (height: number) => void;
  setRightPanelWidth: (width: number) => void;
  setCommitListMode: (mode: CommitListMode) => void;
  setCommitTableLayout: (layout: CommitTableLayout) => void;
  updateCommitTableLayout: (updater: (layout: CommitTableLayout) => CommitTableLayout) => void;
  hydratePersistedUIState: (state: PersistedUIState) => void;
  setGitHubAvatarUrls: (urls: Record<string, string>) => void;
  setTagMetadata: (metadata: Record<string, TagMetadata>) => void;
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
  setRevertOptions: (options: RevertOptions) => void;
  setRebaseInProgress: (inProgress: boolean) => void;
  setRebaseConflictInfo: (info: RebaseConflictInfo | undefined) => void;
  setRevertInProgress: (inProgress: boolean) => void;
  setSignatureInfo: (hash: string, info: CommitSignatureInfo | null) => void;
  clearSignatureCache: () => void;
  setSignatureLoading: (hash: string, loading: boolean) => void;
  /** Merge a batch of presence results into the signature-column presence map (047). */
  mergeSignaturePresence: (presence: Record<string, SignaturePresence>) => void;
  setSignaturePresenceLoading: (hashes: string[], loading: boolean) => void;
  markSignaturePresenceFailed: (hashes: string[]) => void;
  clearSignaturePresenceFailures: (hashes: string[]) => void;
  /** Merge a batch of verification verdicts into the cache and clear their loading flags (047). */
  mergeVerifiedSignatures: (results: Record<string, CommitSignatureInfo | null>) => void;
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
  setSubmoduleSelection: (value: 'parent' | string) => void;
  resetTopMenuGroup: () => void;
  setIsLoadingRepo: (v: boolean) => void;
  setUserSettings: (settings: UserSettings) => void;
  openSearch: () => void;
  closeSearch: () => void;
  setActiveToggleWidget: (widget: ActiveToggleWidget) => void;
  setSearchQuery: (query: string) => void;
  setSearchMatches: (matchIndices: number[]) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  setAuthorList: (authors: Author[]) => void;
  setAuthorListLoading: (loading: boolean) => void;
  setUncommittedChanges: (payload: UncommittedSummary) => void;
  setConflictState: (state: ConflictState) => void;
  recomputeVisibility: () => void;
  resetAllFilters: (options?: { preserveBranches?: boolean }) => void;
  setIsRefreshing: (value: boolean) => void;
  setInitialData: (payload: InitialDataPayload) => void;
  setSubmodules: (submodules: Submodule[], stack?: SubmoduleNavEntry[]) => void;
  pushSubmodule: (entry: SubmoduleNavEntry) => void;
  popSubmodule: () => void;
  // Compare refs (042-compare-refs)
  setSlotA: (value: SlotValue | null) => void;
  setSlotB: (value: SlotValue | null) => void;
  swapSlots: () => void;
  setCompareModeOverride: (mode: CompareMode | null) => void;
  clearCompareState: () => void;
  beginCompare: (requestId: string) => void;
  endCompareSuccess: (result: CompareResult) => void;
  endCompareError: (message: string) => void;
  endCompareCancelled: () => void;
  maybeRerunCompareForWorkingTree: () => void;
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

function getUncommittedContext(state: GraphStore): UncommittedContext {
  return { hasUncommittedChanges: state.hasUncommittedChanges, counts: state.uncommittedCounts, branches: state.branches };
}

/**
 * Keep only the per-commit-hash map entries whose commit is still loaded.
 * Signature presence/verdicts are immutable per hash, so a refresh retains cached
 * results and only drops entries for commits that disappeared (047-signing-
 * verification FR-015). Brand-new commits get verified; cached commits resolve
 * from the map with no extra git work, and the map can't grow unbounded.
 */
function retainByHash<T>(map: Record<string, T>, hashes: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const hash of Object.keys(map)) {
    if (hashes.has(hash)) next[hash] = map[hash];
  }
  return next;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  commits: [],
  branches: [],
  topology: emptyTopology,
  selectedCommit: undefined,
  selectedCommitIndex: -1,
  commitDetails: undefined,
  detailsPanelOpen: false,
  detailsPanelPosition: DEFAULT_PERSISTED_UI_STATE.detailsPanelPosition,
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
  revertOptions: { mode: 'commit' },
  rebaseInProgress: false,
  rebaseConflictInfo: undefined,
  revertInProgress: false,
  signatureCache: {},
  signatureLoading: {},
  signaturePresence: {},
  signaturePresenceLoading: {},
  signaturePresenceFailed: {},
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
  activeParentRepoPath: '',
  displayedRepoPath: '',
  submoduleSelection: 'parent',
  isLoadingRepo: false,
  userSettings: { ...DEFAULT_USER_SETTINGS },
  pendingUserSettings: undefined,
  searchState: defaultSearchState,
  activeToggleWidget: null,
  gitHubAvatarUrls: {},
  tagMetadata: {},
  submodules: [],
  submoduleStack: [],
  fileViewMode: DEFAULT_PERSISTED_UI_STATE.fileViewMode,
  bottomPanelHeight: DEFAULT_PERSISTED_UI_STATE.bottomPanelHeight,
  rightPanelWidth: DEFAULT_PERSISTED_UI_STATE.rightPanelWidth,
  commitListMode: DEFAULT_PERSISTED_UI_STATE.commitListMode,
  commitTableLayout: cloneCommitTableLayout(DEFAULT_PERSISTED_UI_STATE.commitTableLayout),
  hoveredCommitHash: null,
  tooltipAnchorRect: null,
  authorList: [],
  authorListLoading: false,
  worktreeList: [],
  worktreeListLoading: false,
  worktreeByHead: new Map(),
  worktreeByBranch: new Map(),
  detachedWorktreesByHead: new Map(),
  containingBranchesCache: new Map(),
  uncommittedStagedFiles: [],
  uncommittedUnstagedFiles: [],
  uncommittedConflictFiles: [],
  conflictType: undefined,
  uncommittedCounts: { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
  hasUncommittedChanges: false,
  isRefreshing: false,
  hiddenCommitHashes: new Set<string>(),
  consecutiveEmptyBatches: 0,
  filteredOutCount: 0,
  showGapIndicator: false,
  compareSelection: { ...EMPTY_COMPARE_SELECTION, recents: [] },
  compareResult: null,
  comparePanelUI: { ...EMPTY_COMPARE_PANEL_UI_STATE },
  setHoveredCommit: (hash, anchorRect) => set({ hoveredCommitHash: hash, tooltipAnchorRect: anchorRect }),
  setWorktreeList: (list) => {
    set({ worktreeList: list, worktreeListLoading: false, ...buildWorktreeLookups(list) });
  },
  setWorktreeListLoading: (worktreeListLoading) => set({ worktreeListLoading }),
  setContainingBranches: (hash, result) => set((state) => {
    const next = new Map(state.containingBranchesCache);
    next.set(hash, result);
    return { containingBranchesCache: next };
  }),
  clearTooltipCaches: () => set({
    containingBranchesCache: new Map(),
    hoveredCommitHash: null,
    tooltipAnchorRect: null,
  }),
  setFileViewMode: (mode) => set({ fileViewMode: mode }),
  setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setCommitListMode: (commitListMode) => set({ commitListMode }),
  setCommitTableLayout: (commitTableLayout) => set({
    commitTableLayout: cloneCommitTableLayout(commitTableLayout),
  }),
  updateCommitTableLayout: (updater) => set((state) => ({
    commitTableLayout: cloneCommitTableLayout(updater(state.commitTableLayout)),
  })),
  hydratePersistedUIState: (state) => set({
    detailsPanelPosition: state.detailsPanelPosition,
    fileViewMode: state.fileViewMode,
    bottomPanelHeight: state.bottomPanelHeight,
    rightPanelWidth: state.rightPanelWidth,
    commitListMode: state.commitListMode,
    commitTableLayout: cloneCommitTableLayout(state.commitTableLayout),
  }),
  setGitHubAvatarUrls: (urls) => set((state) => ({
    gitHubAvatarUrls: { ...state.gitHubAvatarUrls, ...urls },
  })),
  // Whole-map replace: a refresh's deferred load resends all tags, so replacing
  // (not merging) invalidates metadata for tags that were deleted.
  setTagMetadata: (tagMetadata) => set({ tagMetadata }),
  setCommits: (commits) => {
    const filters = get().filters;
    const hiddenCommitHashes = computeHiddenCommitHashes(commits, filters);
    const { mergedCommits, topology } = computeMergedTopology(commits, get().stashes, filters, hiddenCommitHashes, getUncommittedContext(get()));
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
      hiddenCommitHashes,
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
      signatureCache: retainByHash(get().signatureCache, newHashSet),
      signatureLoading: retainByHash(get().signatureLoading, newHashSet),
      signaturePresence: retainByHash(get().signaturePresence, newHashSet),
      signaturePresenceLoading: {},
      signaturePresenceFailed: {},
      containingBranchesCache: new Map(),
      hoveredCommitHash: null,
      tooltipAnchorRect: null,
      consecutiveEmptyBatches: 0,
      filteredOutCount: 0,
      showGapIndicator: false,
    });
  },
  appendCommits: (newCommits, totalLoadedWithoutFilter) => {
    const { commits, stashes, filters, totalLoadedWithoutFilter: existingTotal, selectedCommit } = get();
    const allCommits = [...commits, ...newCommits];
    const hiddenCommitHashes = computeHiddenCommitHashes(allCommits, filters);
    const { mergedCommits, topology } = computeMergedTopology(allCommits, stashes, filters, hiddenCommitHashes, getUncommittedContext(get()));
    const hasFilter = !!(filters.branches?.length || filters.afterDate || filters.beforeDate);
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;

    // Count new visible commits in this batch for empty-batch tracking
    const newVisibleCount = newCommits.filter(c => !hiddenCommitHashes.has(c.hash)).length;
    const prevEmpty = get().consecutiveEmptyBatches;
    const prevFilteredOut = get().filteredOutCount;

    let consecutiveEmptyBatches: number;
    let filteredOutCount: number;
    let showGapIndicator: boolean;

    if (newVisibleCount > 0) {
      consecutiveEmptyBatches = 0;
      filteredOutCount = 0;
      showGapIndicator = false;
    } else {
      consecutiveEmptyBatches = prevEmpty + 1;
      filteredOutCount = prevFilteredOut + newCommits.length;
      showGapIndicator = consecutiveEmptyBatches >= 3;
    }

    set({
      commits: allCommits,
      mergedCommits,
      topology,
      hiddenCommitHashes,
      selectedCommitIndex,
      lastBatchStartIndex: commits.length,
      consecutiveEmptyBatches,
      filteredOutCount,
      showGapIndicator,
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
    // FR-023 (042-compare-refs): selecting a single commit dismisses any showing compare result
    set({ selectedCommit, selectedCommitIndex: index, ...(selectedCommit ? { compareResult: null } : {}) });
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
      compareResult: null,
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
      compareResult: null,
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
    const { mergedCommits, topology } = computeMergedTopology(get().commits, stashes, get().filters, get().hiddenCommitHashes, getUncommittedContext(get()));
    const selectedCommit = get().selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;
    set({ stashes, mergedCommits, topology, selectedCommitIndex });
  },
  setMaxVisibleRefs: (count) => set({ maxVisibleRefs: count }),
  setCherryPickInProgress: (cherryPickInProgress) => set({ cherryPickInProgress }),
  setCherryPickOptions: (cherryPickOptions) => set({ cherryPickOptions }),
  setRevertOptions: (revertOptions) => set({ revertOptions }),
  setRebaseInProgress: (rebaseInProgress) => set({ rebaseInProgress }),
  setRebaseConflictInfo: (rebaseConflictInfo) => set({ rebaseConflictInfo }),
  setRevertInProgress: (revertInProgress) => set({ revertInProgress }),
  setSignatureInfo: (hash, info) => set((state) => ({
    signatureCache: { ...state.signatureCache, [hash]: info },
    signatureLoading: { ...state.signatureLoading, [hash]: false },
  })),
  clearSignatureCache: () => set({
    signatureCache: {},
    signatureLoading: {},
    signaturePresence: {},
    signaturePresenceLoading: {},
    signaturePresenceFailed: {},
  }),
  setSignatureLoading: (hash, loading) => set((state) => ({
    signatureLoading: { ...state.signatureLoading, [hash]: loading },
  })),
  mergeSignaturePresence: (presence) => set((state) => {
    const signaturePresenceLoading = { ...state.signaturePresenceLoading };
    const signaturePresenceFailed = { ...state.signaturePresenceFailed };
    for (const hash of Object.keys(presence)) {
      delete signaturePresenceLoading[hash];
      delete signaturePresenceFailed[hash];
    }
    return {
      signaturePresence: { ...state.signaturePresence, ...presence },
      signaturePresenceLoading,
      signaturePresenceFailed,
    };
  }),
  setSignaturePresenceLoading: (hashes, loading) => set((state) => {
    const signaturePresenceLoading = { ...state.signaturePresenceLoading };
    const signaturePresenceFailed = { ...state.signaturePresenceFailed };
    for (const hash of hashes) {
      if (loading) {
        signaturePresenceLoading[hash] = true;
        delete signaturePresenceFailed[hash];
      } else {
        delete signaturePresenceLoading[hash];
      }
    }
    return { signaturePresenceLoading, signaturePresenceFailed };
  }),
  markSignaturePresenceFailed: (hashes) => set((state) => {
    const signaturePresenceLoading = { ...state.signaturePresenceLoading };
    const signaturePresenceFailed = { ...state.signaturePresenceFailed };
    for (const hash of hashes) {
      delete signaturePresenceLoading[hash];
      signaturePresenceFailed[hash] = true;
    }
    return { signaturePresenceLoading, signaturePresenceFailed };
  }),
  clearSignaturePresenceFailures: (hashes) => set((state) => {
    const signaturePresenceFailed = { ...state.signaturePresenceFailed };
    for (const hash of hashes) {
      delete signaturePresenceFailed[hash];
    }
    return { signaturePresenceFailed };
  }),
  mergeVerifiedSignatures: (results) => set((state) => {
    const signatureLoading = { ...state.signatureLoading };
    for (const hash of Object.keys(results)) {
      delete signatureLoading[hash];
    }
    return {
      signatureCache: { ...state.signatureCache, ...results },
      signatureLoading,
    };
  }),
  setPendingRebaseEntries: (pendingRebaseEntries) => set({ pendingRebaseEntries }),
  setSelectedCommits: (selectedCommits) => set({ selectedCommits }),
  setSelectionAnchor: (lastClickedHash) => set({ lastClickedHash }),
  toggleSelectedCommit: (hash) => set((state) => {
    // When the user single-clicks a row to select it, then Ctrl/Cmd-clicks
    // additional rows, the originally clicked row must be part of the
    // multi-selection — that is the standard UX (file managers, IDEs).
    // Seed the selection list with the current single-click anchor before
    // toggling, so the anchor isn't dropped from the range.
    const seeded = state.selectedCommits.length === 0
      && state.selectedCommit !== undefined
      && state.selectedCommit !== hash
      ? [state.selectedCommit]
      : state.selectedCommits;
    const exists = seeded.includes(hash);
    const selectedCommits = exists
      ? seeded.filter((item) => item !== hash)
      : [...seeded, hash];
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
  setHasMore: (hasMore) => set({
    hasMore,
    // When repo is fully loaded, never show gap indicator
    ...(!hasMore ? { showGapIndicator: false } : {}),
  }),
  setPrefetching: (prefetching) => set({ prefetching }),
  setTotalLoadedWithoutFilter: (totalLoadedWithoutFilter) => set({ totalLoadedWithoutFilter }),
  setPendingCheckout: (pendingCheckout) => set({ pendingCheckout }),
  setPendingCommitCheckout: (pendingCommitCheckout) => set({ pendingCommitCheckout }),
  setPendingForceDeleteBranch: (pending) => set({ pendingForceDeleteBranch: pending }),
  setRepos: (repos, activeRepoPath) => {
    const { activeParentRepoPath: prevPath } = get();
    const isInitialLoad = prevPath === '';
    const parentChanged = !isInitialLoad && prevPath !== activeRepoPath;
    if (parentChanged) {
      get().resetAllFilters({ preserveBranches: false });
    }
    // Preserve `submoduleSelection` and `displayedRepoPath` when the workspace
    // active repo did not change (e.g., the backend re-emitted `repoList` after
    // a submodule selector navigation). FR-017: the repo selector stays on the
    // parent while a submodule is being viewed. On parent change, clear the
    // stale submodule list so the selector hides until backend confirms which
    // submodules the new repo has (data-model §4.3).
    set({
      repos,
      activeParentRepoPath: activeRepoPath,
      ...(parentChanged || isInitialLoad
        ? {
            submoduleSelection: 'parent' as const,
            displayedRepoPath: activeRepoPath,
            submodules: [],
            authorList: [],
            authorListLoading: false,
            remotes: [],
            stashes: [],
            worktreeList: [],
            worktreeListLoading: false,
            worktreeByHead: new Map(),
            worktreeByBranch: new Map(),
            detachedWorktreesByHead: new Map(),
            tagMetadata: {},
            uncommittedStagedFiles: [],
            uncommittedUnstagedFiles: [],
            uncommittedConflictFiles: [],
            conflictType: undefined,
            uncommittedCounts: { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
            hasUncommittedChanges: false,
            ...(parentChanged ? { pendingCommitCheckout: null } : {}),
          }
        : {}),
    });
  },
  setActiveRepo: (repoPath) => {
    // No-op when the user re-selects the current repo: avoid clearing
    // filter/search content and dispatching a wasted RPC (FR-022 conditions
    // the reset on the value *changing*).
    if (repoPath === get().activeParentRepoPath) return;
    // Repo selector change resets the entire top-menu group (FR-022) and the
    // submodule selector to 'parent' (FR-008). Clear the stale submodule list
    // so the selector hides until backend confirms the new repo's submodules
    // (data-model §4.3).
    get().resetTopMenuGroup();
    set({
      activeParentRepoPath: repoPath,
      submoduleSelection: 'parent',
      displayedRepoPath: repoPath,
      submodules: [],
      isLoadingRepo: true,
      pendingCommitCheckout: null,
      selectedCommit: undefined,
      selectedCommitIndex: -1,
      selectedCommits: [],
      lastClickedHash: undefined,
      commitDetails: undefined,
      detailsPanelOpen: false,
      authorList: [],
      authorListLoading: false,
      remotes: [],
      stashes: [],
      worktreeList: [],
      worktreeListLoading: false,
      worktreeByHead: new Map(),
      worktreeByBranch: new Map(),
      detachedWorktreesByHead: new Map(),
      tagMetadata: {},
      uncommittedStagedFiles: [],
      uncommittedUnstagedFiles: [],
      uncommittedConflictFiles: [],
      conflictType: undefined,
      uncommittedCounts: { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
      hasUncommittedChanges: false,
    });
    import('../rpc/rpcClient').then(({ rpcClient }) => {
      rpcClient.send({ type: 'switchRepo', payload: { repoPath } });
    }).catch(() => {
      set({ isLoadingRepo: false });
    });
  },
  setSubmoduleSelection: (value) => {
    // No-op when the user re-selects the current option: avoid clearing
    // filter/search content and dispatching a wasted RPC (FR-023 conditions
    // the reset on the value *changing*).
    if (value === get().submoduleSelection) return;
    const { activeParentRepoPath } = get();
    const displayedRepoPath =
      value === 'parent' ? activeParentRepoPath : joinRepoPath(activeParentRepoPath, value);
    // Submodule selector change resets the filter/search group (FR-023) but
    // does NOT touch activeToggleWidget (FR-024) and does NOT change the repo
    // selector value (FR-017).
    get().resetTopMenuGroup();
    set({
      submoduleSelection: value,
      displayedRepoPath,
      isLoadingRepo: true,
      pendingCommitCheckout: null,
      selectedCommit: undefined,
      selectedCommitIndex: -1,
      selectedCommits: [],
      lastClickedHash: undefined,
      commitDetails: undefined,
      detailsPanelOpen: false,
      authorList: [],
      authorListLoading: false,
      remotes: [],
      stashes: [],
      worktreeList: [],
      worktreeListLoading: false,
      worktreeByHead: new Map(),
      worktreeByBranch: new Map(),
      detachedWorktreesByHead: new Map(),
      tagMetadata: {},
      uncommittedStagedFiles: [],
      uncommittedUnstagedFiles: [],
      uncommittedConflictFiles: [],
      conflictType: undefined,
      uncommittedCounts: { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
      hasUncommittedChanges: false,
    });
    import('../rpc/rpcClient').then(({ rpcClient }) => {
      // Submodule selector navigation: change the displayed repo without
      // touching the workspace's active repo (FR-017). The repo selector
      // stays visibly fixed on the parent.
      rpcClient.send({ type: 'displayRepo', payload: { repoPath: displayedRepoPath } });
    }).catch(() => {
      set({ isLoadingRepo: false });
    });
  },
  /**
   * Centralized left→right reset entry point invoked when the repo or
   * submodule selector changes. Clears filter and search payload but
   * intentionally does NOT touch `activeToggleWidget` (FR-024) so the
   * open/closed state of the filter/search panels is preserved across resets.
   *
   * FR-024 invariant: do NOT read or write `activeToggleWidget` in this action.
   */
  resetTopMenuGroup: () => {
    get().resetAllFilters({ preserveBranches: false });
    // FR-030 (042-compare-refs): clear compare state on repo / submodule switch
    get().clearCompareState();
    set((state) => ({
      searchState: {
        ...defaultSearchState,
        isOpen: state.searchState.isOpen,
      },
    }));
  },
  setIsLoadingRepo: (isLoadingRepo) => set({ isLoadingRepo }),
  setUserSettings: (settings) => set((state) => (
    state.loading
      ? { pendingUserSettings: settings }
      : { userSettings: settings, pendingUserSettings: undefined, filters: { ...state.filters, maxCount: settings.batchCommitSize } }
  )),
  openSearch: () => set((state) => ({
    searchState: { ...state.searchState, isOpen: true },
    activeToggleWidget: 'search',
  })),
  closeSearch: () => set((state) => ({
    searchState: defaultSearchState,
    activeToggleWidget: state.activeToggleWidget === 'search' ? null : state.activeToggleWidget,
  })),
  setActiveToggleWidget: (widget) => set((state) => {
    const next: ActiveToggleWidget = state.activeToggleWidget === widget ? null : widget;
    const openingSearch = next === 'search';
    const closingSearch = !openingSearch && state.searchState.isOpen;
    return {
      activeToggleWidget: next,
      searchState: openingSearch
        ? { ...state.searchState, isOpen: true }
        : closingSearch
          ? defaultSearchState
          : state.searchState,
    };
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
    const newMatchIndex = (currentMatchIndex + 1) % matchIndices.length;
    const commitIndex = matchIndices[newMatchIndex];
    const commit = state.mergedCommits[commitIndex];
    return {
      searchState: {
        ...state.searchState,
        currentMatchIndex: newMatchIndex,
      },
      selectedCommit: commit?.hash,
      selectedCommitIndex: commitIndex,
      lastClickedHash: commit?.hash,
      selectedCommits: [],
    };
  }),
  prevMatch: () => set((state) => {
    const { matchIndices, currentMatchIndex } = state.searchState;
    if (matchIndices.length === 0) return {};
    const newMatchIndex = (currentMatchIndex - 1 + matchIndices.length) % matchIndices.length;
    const commitIndex = matchIndices[newMatchIndex];
    const commit = state.mergedCommits[commitIndex];
    return {
      searchState: {
        ...state.searchState,
        currentMatchIndex: newMatchIndex,
      },
      selectedCommit: commit?.hash,
      selectedCommitIndex: commitIndex,
      lastClickedHash: commit?.hash,
      selectedCommits: [],
    };
  }),
  setAuthorList: (authors) => set({ authorList: authors }),
  setAuthorListLoading: (authorListLoading) => set({ authorListLoading }),
  setUncommittedChanges: (payload) => {
    const hasChanges = payload.stagedCount + payload.unstagedCount + payload.untrackedCount > 0;
    const counts = { stagedCount: payload.stagedCount, unstagedCount: payload.unstagedCount, untrackedCount: payload.untrackedCount };
    const allFiles = [...payload.stagedFiles, ...payload.unstagedFiles, ...payload.conflictFiles];
    const { commits, stashes, filters, branches } = get();
    const hiddenCommitHashes = computeHiddenCommitHashes(commits, filters);
    const uncommitted: UncommittedContext = { hasUncommittedChanges: hasChanges, counts, branches };
    const { mergedCommits, topology } = computeMergedTopology(commits, stashes, filters, hiddenCommitHashes, uncommitted);
    const selectedCommit = get().selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;
    set({
      uncommittedStagedFiles: payload.stagedFiles,
      uncommittedUnstagedFiles: payload.unstagedFiles,
      uncommittedConflictFiles: payload.conflictFiles,
      conflictType: payload.conflictType,
      uncommittedCounts: counts,
      hasUncommittedChanges: hasChanges,
      mergedCommits,
      topology,
      hiddenCommitHashes,
      selectedCommitIndex,
    });
    // Auto-refresh details panel from the already-received data (avoids a redundant backend round-trip)
    if (selectedCommit === UNCOMMITTED_HASH && get().detailsPanelOpen) {
      const headCommit = commits.find(c => c.refs.some(r => r.type === 'head'));
      const headHash = headCommit?.hash ?? (commits.length > 0 ? commits[0].hash : '');
      const details: CommitDetails = {
        hash: UNCOMMITTED_HASH,
        abbreviatedHash: '---',
        parents: headHash ? [headHash] : [],
        author: '---',
        authorEmail: '',
        authorDate: Date.now(),
        committer: '---',
        committerEmail: '',
        committerDate: Date.now(),
        subject: buildUncommittedSubject(counts.stagedCount, counts.unstagedCount, counts.untrackedCount),
        body: '',
        files: allFiles,
        stats: allFiles.reduce((acc, f) => ({
          additions: acc.additions + (f.additions ?? 0),
          deletions: acc.deletions + (f.deletions ?? 0),
        }), { additions: 0, deletions: 0 }),
      };
      set({ commitDetails: details });
    }
  },
  setConflictState: (_state) => {
    // Conflict state is primarily delivered via uncommittedChanges payload;
    // this handler is available for standalone conflict state queries
  },
  recomputeVisibility: () => {
    const { commits, stashes, filters } = get();
    const hiddenCommitHashes = computeHiddenCommitHashes(commits, filters);
    const { mergedCommits, topology } = computeMergedTopology(commits, stashes, filters, hiddenCommitHashes, getUncommittedContext(get()));
    const selectedCommit = get().selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;
    set({
      hiddenCommitHashes,
      mergedCommits,
      topology,
      selectedCommitIndex,
      fetchGeneration: get().fetchGeneration + 1,
      consecutiveEmptyBatches: 0,
      filteredOutCount: 0,
      showGapIndicator: false,
    });
  },
  resetAllFilters: (options) => set((state) => {
    const preserveBranches = options?.preserveBranches ?? false;
    return {
      filters: {
        maxCount: state.filters.maxCount,
        ...(preserveBranches && state.filters.branches ? { branches: state.filters.branches } : {}),
      },
      totalLoadedWithoutFilter: null,
    };
  }),
  setIsRefreshing: (isRefreshing) => set({ isRefreshing }),
  setInitialData: (payload) => {
    const state = get();
    // Use new commits if provided, else reuse existing (fingerprint-unchanged refresh)
    const commits = payload.commits ?? state.commits;
    const stashes = payload.stashes.length > 0 ? payload.stashes : state.stashes;
    const remotes = payload.remotes.length > 0 ? payload.remotes : state.remotes;
    const worktrees = payload.worktrees.length > 0 ? payload.worktrees : state.worktreeList;
    const payloadHasUncommitted =
      payload.uncommittedChanges.stagedCount > 0
      || payload.uncommittedChanges.unstagedCount > 0
      || payload.uncommittedChanges.untrackedCount > 0
      || payload.uncommittedChanges.conflictFiles.length > 0
      || payload.uncommittedChanges.stagedFiles.length > 0
      || payload.uncommittedChanges.unstagedFiles.length > 0;
    const uncommittedChanges = payloadHasUncommitted
      ? payload.uncommittedChanges
      : {
          stagedFiles: state.uncommittedStagedFiles,
          unstagedFiles: state.uncommittedUnstagedFiles,
          conflictFiles: state.uncommittedConflictFiles,
          conflictType: state.conflictType,
          stagedCount: state.uncommittedCounts.stagedCount,
          unstagedCount: state.uncommittedCounts.unstagedCount,
          untrackedCount: state.uncommittedCounts.untrackedCount,
        };
    const filters = state.filters;

    // Extract uncommitted changes
    const hasChanges = uncommittedChanges.stagedCount + uncommittedChanges.unstagedCount + uncommittedChanges.untrackedCount > 0;
    const counts = {
      stagedCount: uncommittedChanges.stagedCount,
      unstagedCount: uncommittedChanges.unstagedCount,
      untrackedCount: uncommittedChanges.untrackedCount,
    };

    // Compute hidden hashes, merged commits, and topology in one pass
    const hiddenCommitHashes = computeHiddenCommitHashes(commits, filters);
    const uncommitted: UncommittedContext = { hasUncommittedChanges: hasChanges, counts, branches: payload.branches };
    const { mergedCommits, topology } = computeMergedTopology(commits, stashes, filters, hiddenCommitHashes, uncommitted);

    // Preserve selection for hashes that still exist
    const newHashSet = new Set(mergedCommits.map((c) => c.hash));
    const selectedCommit = state.selectedCommit;
    const selectedCommitIndex = selectedCommit
      ? mergedCommits.findIndex((commit) => commit.hash === selectedCommit)
      : -1;

    const worktreeLookups = buildWorktreeLookups(worktrees);

    set({
      commits,
      branches: payload.branches,
      stashes,
      uncommittedStagedFiles: uncommittedChanges.stagedFiles,
      uncommittedUnstagedFiles: uncommittedChanges.unstagedFiles,
      uncommittedConflictFiles: uncommittedChanges.conflictFiles,
      conflictType: uncommittedChanges.conflictType,
      uncommittedCounts: counts,
      hasUncommittedChanges: hasChanges,
      remotes,
      worktreeList: worktrees,
      worktreeListLoading: false,
      ...worktreeLookups,
      // NOTE: cherry-pick / rebase / revert in-progress flags are intentionally NOT
      // set here. The `initialData` payload always carries synthetic `'idle'` values
      // (the backend resolves the real state asynchronously in `sendDeferredRepoData`).
      // Applying them here would flip an active operation's banner to "idle" on every
      // watcher-triggered refresh until the deferred `cherryPickState`/`rebaseState`/
      // `revertState` messages restore it — a visible flicker. Those dedicated messages
      // are the single source of truth; store defaults cover the first load.
      mergedCommits,
      topology,
      hiddenCommitHashes,
      hasMore: payload.hasMore,
      loading: false,
      ...(state.pendingUserSettings
        ? {
            userSettings: state.pendingUserSettings,
            pendingUserSettings: undefined,
            filters: { ...state.filters, maxCount: state.pendingUserSettings.batchCommitSize },
          }
        : {}),
      isRefreshing: false,
      // Reset pagination state when new commits arrive
      ...(payload.commits !== null ? {
        prefetching: false,
        fetchGeneration: state.fetchGeneration + 1,
        lastBatchStartIndex: 0,
        totalLoadedWithoutFilter: payload.totalLoadedWithoutFilter || null,
        pendingCommitCheckout: null,
        signatureCache: retainByHash(state.signatureCache, newHashSet),
        signatureLoading: retainByHash(state.signatureLoading, newHashSet),
        signaturePresence: retainByHash(state.signaturePresence, newHashSet),
        signaturePresenceLoading: {},
        signaturePresenceFailed: {},
        containingBranchesCache: new Map(),
        hoveredCommitHash: null,
        tooltipAnchorRect: null,
        consecutiveEmptyBatches: 0,
        filteredOutCount: 0,
        showGapIndicator: false,
      } : {
        totalLoadedWithoutFilter: payload.totalLoadedWithoutFilter || state.totalLoadedWithoutFilter,
      }),
      selectedCommit: selectedCommitIndex >= 0 ? selectedCommit : undefined,
      selectedCommitIndex,
      selectedCommits: state.selectedCommits.filter((h) => newHashSet.has(h)),
      lastClickedHash: state.lastClickedHash && newHashSet.has(state.lastClickedHash) ? state.lastClickedHash : undefined,
    });
  },
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
  // Compare refs (042-compare-refs)
  setSlotA: (value) => set((state) => {
    const prev = state.compareSelection.a;
    const kindChanged = (prev?.kind ?? null) !== (value?.kind ?? null);
    const recents = value
      ? [value, ...state.compareSelection.recents.filter((r) => !slotsEqual(r, value))].slice(0, COMPARE_RECENTS_MAX)
      : state.compareSelection.recents;
    return {
      compareSelection: {
        ...state.compareSelection,
        a: value,
        aResolvedHash: null,
        // Reset modeOverride when slot kind changes so the default rule re-applies (research Decision 4)
        modeOverride: kindChanged ? null : state.compareSelection.modeOverride,
        recents,
      },
      comparePanelUI: { ...state.comparePanelUI, inlineError: null },
    };
  }),
  setSlotB: (value) => set((state) => {
    const prev = state.compareSelection.b;
    const kindChanged = (prev?.kind ?? null) !== (value?.kind ?? null);
    const recents = value
      ? [value, ...state.compareSelection.recents.filter((r) => !slotsEqual(r, value))].slice(0, COMPARE_RECENTS_MAX)
      : state.compareSelection.recents;
    return {
      compareSelection: {
        ...state.compareSelection,
        b: value,
        bResolvedHash: null,
        modeOverride: kindChanged ? null : state.compareSelection.modeOverride,
        recents,
      },
      comparePanelUI: { ...state.comparePanelUI, inlineError: null },
    };
  }),
  swapSlots: () => set((state) => ({
    compareSelection: {
      ...state.compareSelection,
      a: state.compareSelection.b,
      b: state.compareSelection.a,
      aResolvedHash: state.compareSelection.bResolvedHash,
      bResolvedHash: state.compareSelection.aResolvedHash,
    },
    comparePanelUI: { ...state.comparePanelUI, inlineError: null },
  })),
  setCompareModeOverride: (mode) => set((state) => ({
    compareSelection: { ...state.compareSelection, modeOverride: mode },
  })),
  clearCompareState: () => set({
    compareSelection: { ...EMPTY_COMPARE_SELECTION, recents: [] },
    compareResult: null,
    comparePanelUI: { ...EMPTY_COMPARE_PANEL_UI_STATE },
  }),
  beginCompare: (requestId) => set({
    comparePanelUI: { loading: true, inlineError: null, activeRequestId: requestId },
    compareResult: null,
    detailsPanelOpen: true,
  }),
  endCompareSuccess: (result) => set((state) => ({
    compareResult: result,
    comparePanelUI: { loading: false, inlineError: null, activeRequestId: null },
    detailsPanelOpen: true,
    compareSelection: {
      ...state.compareSelection,
      aResolvedHash: result.aResolvedHash,
      bResolvedHash: result.bResolvedHash,
    },
  })),
  endCompareError: (message) => set({
    comparePanelUI: { loading: false, inlineError: message, activeRequestId: null },
  }),
  endCompareCancelled: () => set({
    comparePanelUI: { loading: false, inlineError: null, activeRequestId: null },
  }),
  maybeRerunCompareForWorkingTree: () => {
    const state = get();
    if (!state.compareResult) return;
    const { a, b } = state.compareSelection;
    const involvesWorkingTree = a?.kind === 'workingTree' || b?.kind === 'workingTree';
    if (!involvesWorkingTree) return;
    if (!a || !b) return;
    // Re-dispatch with the current selection. requestId generated here so the
    // store can match the upcoming compareResult / error response.
    const requestId = generateCompareRequestId();
    state.beginCompare(requestId);
    import('../rpc/rpcClient').then(({ rpcClient }) => {
      const mode = computeEffectiveMode(a, b, state.compareSelection.modeOverride);
      rpcClient.send({ type: 'compareRefs', payload: { a, b, mode, requestId } });
    });
  },
}));

function generateCompareRequestId(): string {
  // Lightweight ID generator — does not need to be cryptographically unique,
  // only unique within the lifetime of a single in-flight compare request.
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeEffectiveMode(a: SlotValue, b: SlotValue, override: CompareMode | null): CompareMode {
  if (override) return override;
  if (a.kind === 'workingTree' || b.kind === 'workingTree') return 'two-dot';
  const aIsRef = a.kind === 'branch' || a.kind === 'tag';
  const bIsRef = b.kind === 'branch' || b.kind === 'tag';
  if (aIsRef && bIsRef) return 'three-dot';
  return 'two-dot';
}
