'use client';

import { useState, useCallback } from 'react';
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

  const handleScan = useCallback(async () => {
    setScanning(true);
    const completedTickers = new Set<string>();
    let lastTicker: string | null = null;
    let total = 0;

    onProgress?.({
      scanning: true,
      currentTicker: null,
      currentStep: null,
      currentIdx: 0,
      totalTickers: 0,
      completedTickers: new Set(),
      message: 'Starting scan...',
    });

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'full' }),
      });

      if (!response.body) {
        onProgress?.(null);
        setScanning(false);
        return;
      }

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
                // Non-fatal — just update message
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
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // Reload page to show new data
      setTimeout(() => {
        router.refresh();
        setScanning(false);
        // Auto-clear after 3s
        setTimeout(() => onProgress?.(null), 3000);
      }, 1000);
    } catch (err) {
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
  }, [router, onProgress]);

  return (
    <button
      onClick={handleScan}
      disabled={scanning}
      className={`px-4 py-2 border text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
        'Run Full Scan'
      )}
    </button>
  );
}
