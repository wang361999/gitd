import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'Agent Forge - AI 驱动的项目生成平台',
  description:
    '通过自然语言描述需求，AI 自动生成完整项目代码、推送至 GitHub 仓库、进行 AI 代码审查与治理审核，并打包发布。',
  keywords: ['Agent Forge', 'AI', '代码生成', 'GitHub', '自动化构建'],
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
        <footer className="border-t border-forge-border py-6">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-forge-muted">
            Agent Forge - AI 驱动的项目生成平台
          </div>
        </footer>
      </body>
    </html>
  );
}
