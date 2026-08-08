'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

export interface ScanHistoryEntry {
  id: number;
  scannedAt: string;
  scanType: string;
  bucketPrimary: number | null;
  thesisStatus: string | null;
}

const THESIS_DOT: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  challenged: 'bg-red-500',
  neutral: 'bg-amber-500',
};

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Timestamp selector for browsing this ticker's past scans.
 * Selecting an entry sets ?scan=<id>; the newest entry clears it so the page
 * goes back to always showing the latest.
 */
export function ScanHistoryPicker({
  history,
  selectedId,
}: {
  history: ScanHistoryEntry[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (history.length === 0) return null;

  const newestId = history[0].id;
  const active = history.find((h) => h.id === selectedId) ?? history[0];
  const viewingPast = active.id !== newestId;

  const select = (entry: ScanHistoryEntry) => {
    setOpen(false);
    router.push(entry.id === newestId ? pathname : `${pathname}?scan=${entry.id}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Browse past scans for this holding"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[13px] font-mono transition-colors ${
          viewingPast
            ? 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-950/60'
            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600'
        }`}
      >
        <span>{viewingPast ? `viewing ${formatStamp(active.scannedAt)}` : `scan ${relative(active.scannedAt)}`}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-gray-900 border border-gray-700 rounded-md shadow-xl z-50 py-1">
          <p className="px-3 py-1.5 text-[13px] text-gray-500 uppercase tracking-widest">
            Scan history ({history.length})
          </p>
          {history.map((entry) => {
            const isActive = entry.id === active.id;
            return (
              <button
                key={entry.id}
                onClick={() => select(entry)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  isActive ? 'bg-gray-800' : 'hover:bg-gray-800/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    entry.thesisStatus ? THESIS_DOT[entry.thesisStatus] ?? 'bg-gray-600' : 'bg-gray-700'
                  }`}
                />
                <span className="text-[13px] font-mono text-gray-300 flex-1">
                  {formatStamp(entry.scannedAt)}
                </span>
                {entry.scanType === 'delta' && (
                  <span className="text-[13px] text-gray-500 uppercase tracking-wider">delta</span>
                )}
                {entry.id === newestId && (
                  <span className="text-[13px] text-emerald-500 uppercase tracking-wider">latest</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
