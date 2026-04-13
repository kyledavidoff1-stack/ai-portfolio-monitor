'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type PipelineStep = 'news' | 'bucket' | 'thesis' | 'catalysts';

export function StepRefreshButton({
  ticker,
  step,
}: {
  ticker: string;
  step: PipelineStep;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation(); // don't trigger drag
      setLoading(true);
      try {
        const res = await fetch('/api/scan/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, step }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error(`[StepRefresh] ${step} failed:`, body.error ?? res.statusText);
        }
        router.refresh();
      } catch (err) {
        console.error(`[StepRefresh] ${step} error:`, err);
      } finally {
        setLoading(false);
      }
    },
    [ticker, step, router],
  );

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="p-0.5 rounded transition-colors text-gray-600 hover:text-gray-300 disabled:cursor-wait"
      title={`Re-run ${step} analysis`}
    >
      {loading ? (
        <span className="block w-3 h-3 border-[1.5px] border-gray-600 border-t-gray-300 rounded-full animate-spin" />
      ) : (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5.56 1.25a.75.75 0 01.55.24l1.63 1.76a.75.75 0 01-1.1 1.02L5.8 3.36a4.5 4.5 0 105.025 1.283.75.75 0 111.293-.764A6 6 0 115.56 1.25z" />
        </svg>
      )}
    </button>
  );
}
