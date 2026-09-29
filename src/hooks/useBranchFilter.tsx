import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Branch } from '@/types';

interface BranchFilterContextValue {
  selectedBranchId: string | null;
  selectedBranch: Branch | null;
  setBranchId: (id: string | null) => void;
  branches: Branch[];
  setBranches: (branches: Branch[]) => void;
}

const BranchFilterContext = createContext<BranchFilterContextValue | undefined>(undefined);

export function BranchFilterProvider({ children, initialBranches = [] }: { children: ReactNode; initialBranches?: Branch[] }) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  return (
    <BranchFilterContext.Provider
      value={{
        selectedBranchId,
        selectedBranch,
        setBranchId: setSelectedBranchId,
        branches,
        setBranches,
      }}
    >
      {children}
    </BranchFilterContext.Provider>
  );
}

export function useBranchFilter() {
  const ctx = useContext(BranchFilterContext);
  if (!ctx) throw new Error('useBranchFilter must be used within a BranchFilterProvider');
  return ctx;
}
