'use client';

import dynamic from 'next/dynamic';
import { CompanyGridProps } from './CompanyGrid';

const CompanyGrid = dynamic(() => import('./CompanyGrid'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-12 gap-3 animate-pulse">
      {/* Left column skeleton */}
      <div className="col-span-5 space-y-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[620px]" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[370px]" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[370px]" />
      </div>
      {/* Right column skeleton */}
      <div className="col-span-7 space-y-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[462px]" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[612px]" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[412px]" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg h-[462px]" />
      </div>
    </div>
  ),
});

export function CompanyGridLoader(props: CompanyGridProps) {
  return <CompanyGrid {...props} />;
}
