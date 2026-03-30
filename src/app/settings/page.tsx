import { Card } from '@/components/ui/Card';

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure your API keys and preferences</p>
      </div>

      {/* API Keys */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          API Keys
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Financial Modeling Prep API Key
            </label>
            <input
              type="password"
              placeholder="Enter your FMP API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Get your key at{' '}
              <a
                href="https://financialmodelingprep.com/developer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                financialmodelingprep.com/developer
              </a>
              . Free tier: 250 requests/day. Starter ($14/month): recommended for production.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Claude API Key
            </label>
            <input
              type="password"
              placeholder="Enter your Anthropic API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">
              Get your key at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                console.anthropic.com
              </a>
              . Typical cost: $10–30/month with caching. Set in .env.local for security.
            </p>
          </div>

          <div className="pt-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                <strong>Security note:</strong> For V1, API keys are stored in your .env.local file, not in the
                database. Copy .env.local.example to .env.local and add your keys there. The settings page
                UI for key management will be wired up in a future sprint.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Analysis Settings */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Analysis Settings
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-700">Anomaly threshold</p>
              <p className="text-xs text-gray-400">% divergence from expected return that triggers a flag</p>
            </div>
            <span className="text-sm font-mono text-gray-600">2%</span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-700">News cache duration</p>
              <p className="text-xs text-gray-400">Hours before news/sentiment data is refreshed</p>
            </div>
            <span className="text-sm font-mono text-gray-600">4h</span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-gray-700">Fundamentals cache duration</p>
              <p className="text-xs text-gray-400">Hours before financial data is refreshed</p>
            </div>
            <span className="text-sm font-mono text-gray-600">24h</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          These values are configured in .env.local. Editable settings UI coming in a future sprint.
        </p>
      </Card>
    </div>
  );
}
