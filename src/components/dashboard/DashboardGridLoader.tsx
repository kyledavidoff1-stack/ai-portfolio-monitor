'use client';

import dynamic from 'next/dynamic';
import { DraggableDashboardProps } from './DraggableDashboard';

const DraggableDashboard = dynamic(() => import('./DraggableDashboard'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 animate-pulse">
      <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-lg h-[640px]" />
      <div className="lg:col-span-2 space-y-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-72" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-56" />
      </div>
    </div>
  ),
});

export function DashboardGridLoader(props: DraggableDashboardProps) {
  return <DraggableDashboard {...props} />;
}
