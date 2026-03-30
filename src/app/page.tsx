import { Card } from '@/components/ui/Card';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Regime indicator placeholder */}
      <Card className="bg-gray-800 text-white border-0" padding="md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Market Regime</p>
            <p className="text-gray-300 text-sm mt-1">Run a scan to detect the current regime</p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-700 text-gray-300">
              Not scanned
            </span>
          </div>
        </div>
      </Card>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Holdings</h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              + Add ticker
            </button>
          </div>

          <Card padding="lg">
            <div className="text-center py-12">
              <div className="text-gray-300 text-4xl mb-3">◎</div>
              <p className="text-gray-500 text-sm font-medium">No holdings yet</p>
              <p className="text-gray-400 text-xs mt-1">
                Add tickers or upload a CSV to get started
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">
                  Add ticker
                </button>
                <button className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  Upload CSV
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Anomaly flags */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Anomaly Flags</h2>
            <Card padding="md">
              <p className="text-gray-400 text-xs text-center py-4">
                No anomalies detected
              </p>
            </Card>
          </div>

          {/* Portfolio stats */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Portfolio Stats</h2>
            <Card padding="md">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Portfolio Beta</span>
                  <span className="text-sm font-medium text-gray-400">—</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Positions</span>
                  <span className="text-sm font-medium text-gray-400">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Last Scan</span>
                  <span className="text-sm font-medium text-gray-400">Never</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Quick scan */}
          <button className="w-full px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
            Run Full Scan
          </button>
        </div>
      </div>
    </div>
  );
}
