import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import VersionChecker from '@/components/VersionChecker';

export const metadata: Metadata = {
  title: 'Agent Forge - AI 代码治理与交付平台',
  description:
    '以治理为核心的 AI 代码平台：代码溯源追踪、安全审查、决策记录，自动化打包发布。确保 AI 代码达到生产级质量标准。',
  keywords: ['Agent Forge', 'AI 代码治理', '代码溯源', '安全审查', 'Lore 决策记录', 'GitHub Models'],
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-forge-bg text-forge-ink">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <VersionChecker />
        <footer className="border-t border-forge-border py-6">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-forge-muted">
            <p>Agent Forge — AI 代码治理与交付平台 · 代码溯源 · 安全审查 · 决策记录</p>
            <p className="mt-1 text-xs text-forge-muted/60">
              Build: {process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
