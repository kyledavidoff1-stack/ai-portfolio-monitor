import { Card } from '@/components/ui/Card';
import Link from 'next/link';

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function CompanyPage({ params }: Props) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← Portfolio
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{symbol}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Company name will appear here after scan</p>
        </div>
        <button className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
          Refresh
        </button>
      </div>

      {/* 5 Numbers That Matter — placeholder */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          5 Numbers That Matter
        </h2>
        <p className="text-gray-400 text-sm text-center py-8">
          Add {symbol} to your portfolio and run a scan to see the intelligence report.
        </p>
      </Card>

      {/* Tabs placeholder */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {['Fundamentals', 'Business Intel', 'Sentiment', 'Driver Analysis', 'Thesis', 'Events'].map((tab) => (
            <button
              key={tab}
              className="pb-2 text-sm text-gray-400 border-b-2 border-transparent"
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <Card padding="lg">
        <p className="text-gray-400 text-sm text-center py-8">
          Intelligence data will appear here after the first scan.
        </p>
      </Card>
    </div>
  );
}
