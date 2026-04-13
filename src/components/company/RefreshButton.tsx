'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  ticker: string;
}

export function RefreshButton({ ticker }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState('');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setProgress('Starting...');

    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });

      if (!response.body) {
        setProgress('Error');
        setRefreshing(false);
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
              if (eventType === 'progress' && data.message) {
                setProgress(data.message);
              } else if (eventType === 'complete') {
                setProgress('Done');
              }
            } catch { /* ignore */ }
          }
        }
      }

      setTimeout(() => {
        router.refresh();
        setRefreshing(false);
        setProgress('');
      }, 800);
    } catch (err) {
      setProgress(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      setRefreshing(false);
    }
  }, [ticker, router]);

  return (
    <div className="flex items-center gap-2">
      {refreshing && progress && (
        <span className="text-[12px] text-gray-400 font-mono max-w-[200px] truncate">
          {progress}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className={`px-3 py-1.5 border text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
          refreshing
            ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-wait'
            : 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-600 text-white'
        }`}
      >
        {refreshing ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
            Refreshing
          </span>
        ) : (
          'Refresh'
        )}
      </button>
    </div>
  );
}
