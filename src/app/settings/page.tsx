import Link from 'next/link';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Bring your own API keys. Everything is stored on this machine.
          </p>
        </div>
        <Link
          href="/settings/prompt-test"
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-md transition-colors"
        >
          Prompt Lab
        </Link>
      </div>

      <SettingsForm />
    </div>
  );
}
