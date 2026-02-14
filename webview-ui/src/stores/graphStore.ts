import { create } from 'zustand';
import type { Commit, Branch, CommitDetails, DetailsPanelPosition, GraphFilters, RemoteInfo, StashEntry } from '@shared/types';
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
    const insertIndex = parentIndex !== undefined ? parentIndex : 0;

    stashInsertions.push({
      index: insertIndex,
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
  setCommits: (commits) => {
    const stashes = get().stashes;
    const mergedCommits = mergeStashesIntoCommits(commits, stashes);
    const topology = calculateTopology(mergedCommits);
    set({ commits, mergedCommits, topology });
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
    const commits = get().commits;
    const mergedCommits = mergeStashesIntoCommits(commits, stashes);
    const topology = calculateTopology(mergedCommits);
    set({ stashes, mergedCommits, topology });
  },
  setMaxVisibleRefs: (count) => set({ maxVisibleRefs: count }),
}));
