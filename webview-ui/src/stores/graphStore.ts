import { create } from 'zustand';
import type { Commit, Branch, GraphFilters } from '@shared/types';
import { calculateTopology, type GraphTopology } from '../utils/graphTopology';

interface GraphStore {
  commits: Commit[];
  branches: Branch[];
  topology: GraphTopology;
  selectedCommit: string | undefined;
  loading: boolean;
  error: string | undefined;
  filters: GraphFilters;
  setCommits: (commits: Commit[]) => void;
  setBranches: (branches: Branch[]) => void;
  setSelectedCommit: (hash: string | undefined) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | undefined) => void;
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
  loading: true,
  error: undefined,
  filters: {
    maxCount: 500,
  },
  setCommits: (commits) => {
    // Calculate topology when commits are set
    const topology = calculateTopology(commits);
    set({ commits, topology });
  },
  setBranches: (branches) => set({ branches }),
  setSelectedCommit: (selectedCommit) => set({ selectedCommit }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
