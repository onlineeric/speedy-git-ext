import { create } from 'zustand';
import type { Commit, Branch, GraphFilters } from '@shared/types';

interface GraphStore {
  commits: Commit[];
  branches: Branch[];
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

export const useGraphStore = create<GraphStore>((set) => ({
  commits: [],
  branches: [],
  selectedCommit: undefined,
  loading: true,
  error: undefined,
  filters: {
    maxCount: 500,
  },
  setCommits: (commits) => set({ commits }),
  setBranches: (branches) => set({ branches }),
  setSelectedCommit: (selectedCommit) => set({ selectedCommit }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
}));
