import { create } from 'zustand';
import type { Commit, Branch, CommitDetails, DetailsPanelPosition, GraphFilters } from '@shared/types';
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
}

const emptyTopology: GraphTopology = {
  nodes: new Map(),
  maxLanes: 0,
  passingLanesByRow: new Map(),
  commitIndexByHash: new Map(),
};

export const useGraphStore = create<GraphStore>((set) => ({
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
  setCommits: (commits) => {
    const topology = calculateTopology(commits);
    set({ commits, topology });
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
}));
