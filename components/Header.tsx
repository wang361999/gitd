'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserInfo {
  username: string;
  avatarUrl?: string;
}

export default function Header() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth?action=status');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.isLoggedIn) {
            setUser({
              username: data.username,
              avatarUrl: data.avatarUrl,
            });
          }
        }
      } catch {
        // 忽略错误，保持未登录状态
      } finally {
        if (mounted) setLoading(false);
      }
    }

    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-forge-border bg-forge-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-forge-accent text-white font-bold">
            A
          </span>
          <span className="text-lg font-semibold text-forge-ink">
            Agent Forge
          </span>
        </Link>

        {/* 导航 + 用户区 */}
        <nav className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-forge-muted hover:text-forge-ink transition-colors"
          >
            仪表盘
          </Link>

          {loading ? (
            <div className="h-8 w-8 animate-forge-pulse rounded-full bg-forge-border" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="h-8 w-8 rounded-full border border-forge-border"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-accent text-sm font-medium text-white">
                  {user.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-forge-ink">{user.username}</span>
            </div>
          ) : (
            <a
              href="/api/auth?action=login"
              className="forge-btn-secondary text-sm"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              使用 GitHub 登录
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
