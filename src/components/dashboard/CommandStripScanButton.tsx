'use client';

import { useCallback } from 'react';
import { ScanButton } from './ScanButton';
import type { ScanState } from './ScanButton';
import { useScanState } from './ScanContext';

export function CommandStripScanButton() {
  const { setScanState } = useScanState();

  const handleProgress = useCallback(
    (state: ScanState | null) => {
      setScanState(state);
    },
    [setScanState],
  );

  return <ScanButton onProgress={handleProgress} />;
}
