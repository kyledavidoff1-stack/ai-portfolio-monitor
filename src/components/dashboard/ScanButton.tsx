'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface ScanState {
  scanning: boolean;
  currentTicker: string | null;
  currentStep: string | null;
  currentIdx: number;
  totalTickers: number;
  completedTickers: Set<string>;
  message: string;
}

export function ScanButton({
  onProgress,
}: {
  onProgress?: (state: ScanState | null) => void;
}) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Parse an SSE stream from GET /api/scan and pipe events into onProgress
  const observeScan = useCallback(
    async (signal: AbortSignal) => {
      const completedTickers = new Set<string>();
      let lastTicker: string | null = null;
      let total = 0;

      try {
        const response = await fetch('/api/scan', { signal });
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (eventType === 'idle') {
                  // No scan running — clear UI
                  setScanning(false);
                  onProgress?.(null);
                  return;
                }

                if (eventType === 'progress') {
                  if (data.totalTickers) total = data.totalTickers;
                  if (data.ticker && lastTicker && data.ticker !== lastTicker) {
                    completedTickers.add(lastTicker);
                  }
                  if (data.ticker) lastTicker = data.ticker;

                  onProgress?.({
                    scanning: true,
                    currentTicker: data.ticker ?? null,
                    currentStep: data.step ?? null,
                    currentIdx: data.currentTicker ?? 0,
                    totalTickers: total,
                    completedTickers: new Set(completedTickers),
                    message: data.message ?? '',
                  });
                } else if (eventType === 'error') {
                  onProgress?.({
                    scanning: true,
                    currentTicker: lastTicker,
                    currentStep: null,
                    currentIdx: completedTickers.size,
                    totalTickers: total,
                    completedTickers: new Set(completedTickers),
                    message: data.message ?? 'Error',
                  });
                } else if (eventType === 'complete') {
                  if (lastTicker) completedTickers.add(lastTicker);
                  onProgress?.({
                    scanning: false,
                    currentTicker: null,
                    currentStep: null,
                    currentIdx: total,
                    totalTickers: total,
                    completedTickers: new Set(completedTickers),
                    message: 'Scan complete',
                  });

                  setTimeout(() => {
                    router.refresh();
                    setScanning(false);
                    setTimeout(() => onProgress?.(null), 3000);
                  }, 1000);
                  return;
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }
      } catch (err) {
        // AbortError is expected on unmount / re-navigate
        if (err instanceof DOMException && err.name === 'AbortError') return;

        onProgress?.({
          scanning: false,
          currentTicker: null,
          currentStep: null,
          currentIdx: 0,
          totalTickers: total,
          completedTickers: new Set(completedTickers),
          message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
        setScanning(false);
      }
    },
    [router, onProgress],
  );

  // On mount: check if a scan is already running and reconnect
  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    // Quick probe: POST would return 409 if running, but we can just GET —
    // the GET stream sends 'idle' immediately if nothing is running.
    setScanning(true);
    onProgress?.({
      scanning: true,
      currentTicker: null,
      currentStep: null,
      currentIdx: 0,
      totalTickers: 0,
      completedTickers: new Set(),
      message: 'Checking scan status...',
    });

    observeScan(ac.signal).finally(() => {
      // If GET returned idle, scanning is already set to false inside observeScan
    });

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = useCallback(async (mode: 'auto' | 'full' = 'auto') => {
    setScanning(true);
    onProgress?.({
      scanning: true,
      currentTicker: null,
      currentStep: null,
      currentIdx: 0,
      totalTickers: 0,
      completedTickers: new Set(),
      message: mode === 'full' ? 'Starting full rescan...' : 'Starting scan...',
    });

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      if (res.status === 409) {
        // Already running — just observe
      } else if (!res.ok) {
        const body = await res.text();
        onProgress?.({
          scanning: false,
          currentTicker: null,
          currentStep: null,
          currentIdx: 0,
          totalTickers: 0,
          completedTickers: new Set(),
          message: `Failed to start scan: ${body}`,
        });
        setScanning(false);
        return;
      }

      // Observe progress via GET SSE
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      await observeScan(ac.signal);
    } catch (err) {
      onProgress?.({
        scanning: false,
        currentTicker: null,
        currentStep: null,
        currentIdx: 0,
        totalTickers: 0,
        completedTickers: new Set(),
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
      setScanning(false);
    }
  }, [onProgress, observeScan]);

  return (
    <div className="flex items-stretch">
      <button
        onClick={() => handleScan('auto')}
        disabled={scanning}
        title="Re-runs only the analysis steps whose cached data has expired"
        className={`px-4 py-2 border text-xs font-medium rounded-l-md transition-colors whitespace-nowrap ${
          scanning
            ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-wait'
            : 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-600 text-white'
        }`}
      >
        {scanning ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
            Scanning...
          </span>
        ) : (
          'Run Scan'
        )}
      </button>
      <button
        onClick={() => handleScan('full')}
        disabled={scanning}
        title="Force a full rescan — re-runs every step for every holding, ignoring cache"
        className={`px-2.5 py-2 border border-l-0 text-xs font-medium rounded-r-md transition-colors whitespace-nowrap ${
          scanning
            ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-wait'
            : 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-600 text-gray-400 hover:text-gray-200'
        }`}
      >
        Full
      </button>
    </div>
  );
}
