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
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    // 检查是否因未登录被重定向（通过 URL 参数 ?login=required）
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('login') === 'required') {
        setShowLoginPrompt(true);
        const timer = setTimeout(() => setShowLoginPrompt(false), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

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
    <>
      {/* 登录提示横幅 */}
      {showLoginPrompt && (
        <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2 animate-forge-fade-in">
          <div className="flex items-center gap-3 rounded-lg border border-forge-yellow/30 bg-forge-yellow/10 px-4 py-2.5 text-sm text-forge-ink backdrop-blur">
            <svg
              className="h-4 w-4 flex-shrink-0 text-forge-yellow"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm1 6a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span>请先登录后再访问该页面</span>
            <a
              href="/api/auth?action=login"
              className="font-medium text-forge-accent hover:underline"
            >
              去登录
            </a>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-forge-border bg-forge-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo + 名称 */}
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-forge-accent to-forge-purple text-white">
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                <path d="M4 8a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 8z" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight text-forge-ink">
              Agent Forge
            </span>
          </Link>

          {/* 导航 + 用户区 */}
          <nav className="flex items-center gap-4">
            {loading ? (
              <div className="h-8 w-8 animate-forge-pulse rounded-full bg-forge-border" />
            ) : user ? (
              <>
                {/* 已登录：导航链接 */}
                <Link
                  href="/new"
                  className="hidden items-center gap-1.5 text-sm font-medium text-forge-accent transition-colors hover:text-forge-ink sm:flex"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
                  </svg>
                  新建项目
                </Link>
                <Link
                  href="/dashboard"
                  className="hidden text-sm text-forge-muted transition-colors hover:text-forge-ink sm:block"
                >
                  仪表盘
                </Link>

                {/* 用户头像 + 下拉 */}
                <div className="group relative">
                  <button className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-forge-bg">
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
                    <svg
                      className="h-3 w-3 text-forge-muted"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M4.22 5.22a.75.75 0 011.06 0L8 7.94l2.72-2.72a.75.75 0 111.06 1.06L8.53 9.53a.75.75 0 01-1.06 0L4.22 6.28a.75.75 0 010-1.06z" />
                    </svg>
                  </button>

                  {/* 下拉菜单 */}
                  <div className="invisible absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-forge-border bg-forge-surface py-1 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                    <div className="border-b border-forge-border px-3 py-2">
                      <p className="text-xs text-forge-muted">已登录</p>
                      <p className="truncate text-sm font-medium text-forge-ink">
                        {user.username}
                      </p>
                    </div>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-forge-ink transition-colors hover:bg-forge-bg"
                    >
                      <svg
                        className="h-4 w-4 text-forge-muted"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 0-2.824-.742-3.955-1.715C2.92 9.818 2.09 8.69 1.679 8.068a.119.119 0 010-.136z" />
                      </svg>
                      仪表盘
                    </Link>
                    <Link
                      href="/new"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-forge-ink transition-colors hover:bg-forge-bg sm:hidden"
                    >
                      <svg
                        className="h-4 w-4 text-forge-muted"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
                      </svg>
                      新建项目
                    </Link>
                    <a
                      href="/api/auth?action=logout"
                      className="flex items-center gap-2 border-t border-forge-border px-3 py-2 text-sm text-forge-red transition-colors hover:bg-forge-bg"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 010 1.5h-2.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 010 1.5h-2.5A1.75 1.75 0 012 13.25V2.75zm10.44 4.5H6.75a.75.75 0 000 1.5h5.69l-1.97 1.97a.75.75 0 101.06 1.06l3.25-3.25a.75.75 0 000-1.06l-3.25-3.25a.75.75 0 10-1.06 1.06l1.97 1.97z" />
                      </svg>
                      退出登录
                    </a>
                  </div>
                </div>
              </>
            ) : (
              /* 未登录：登录按钮 */
              <a
                href="/api/auth?action=login"
                className="inline-flex items-center gap-2 rounded-lg border border-forge-border bg-forge-surface px-4 py-1.5 text-sm font-medium text-forge-ink transition-all hover:border-forge-muted"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                登录
              </a>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
