'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import type { ScanState } from './ScanButton';

interface ScanContextValue {
  scanState: ScanState | null;
  setScanState: (state: ScanState | null) => void;
}

const ScanContext = createContext<ScanContextValue>({
  scanState: null,
  setScanState: () => {},
});

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanState, setScanState] = useState<ScanState | null>(null);
  return (
    <ScanContext.Provider value={{ scanState, setScanState }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanState() {
  return useContext(ScanContext);
}
