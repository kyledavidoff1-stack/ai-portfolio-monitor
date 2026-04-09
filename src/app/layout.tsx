import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Portfolio Monitor — Portfolio Intelligence',
  description: 'Personal portfolio intelligence platform: four-bucket driver analysis, thesis tracking, and forward-looking catalyst awareness.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Navigation */}
          <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-12">
                <Link href="/" className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm tracking-tight">Portfolio Monitor</span>
                  <span className="text-xs text-gray-600 font-normal hidden sm:inline">/ intelligence</span>
                </Link>

                <div className="flex items-center gap-1">
                  <Link
                    href="/"
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                  >
                    Portfolio
                  </Link>
                  <Link
                    href="/settings"
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            </div>
          </nav>

          {/* Main content */}
          <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-4">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-800 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <p className="text-xs text-gray-700">
                Portfolio Monitor — open source portfolio intelligence.{' '}
                <a
                  href="https://github.com/kyledavidoff1-stack/portfolio-monitor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-500 transition-colors"
                >
                  GitHub
                </a>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
