'use client';

import { useEffect, useState } from 'react';

/**
 * 版本检测器 — 部署后自动强制刷新
 *
 * 工作原理：
 * 1. 构建时通过 NEXT_PUBLIC_BUILD_VERSION 注入当前版本号
 * 2. 客户端首次加载时，将版本号存入 localStorage
 * 3. 后续访问对比 localStorage 中的版本号与当前版本号
 * 4. 若不一致（说明有新部署），清除缓存并强制刷新页面
 * 5. 同时定期轮询 /version.txt 检测热更新部署
 *
 * 这确保用户在每次新部署后都能立刻获取最新代码，
 * 不会使用浏览器缓存的旧版本。
 */

const STORAGE_KEY = 'agent-forge-build-version';
const CURRENT_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev';
// 轮询间隔（5 分钟）
const POLL_INTERVAL = 5 * 60 * 1000;

export default function VersionChecker() {
  const [showRefreshNotice, setShowRefreshNotice] = useState(false);

  useEffect(() => {
    // === 1. 首次加载：对比 localStorage 中的版本号 ===
    try {
      const storedVersion = localStorage.getItem(STORAGE_KEY);

      if (storedVersion && storedVersion !== CURRENT_VERSION) {
        // 版本不一致 → 说明有新部署
        // 清除所有缓存
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }

        // 更新 localStorage 中的版本号
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);

        // 强制刷新（绕过缓存）
        window.location.reload();
        return;
      }

      // 版本一致或首次访问 → 存储当前版本号
      if (!storedVersion) {
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
      }
    } catch {
      // localStorage 不可用时忽略
    }

    // === 2. 定期轮询检测新部署 ===
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const checkRemoteVersion = async () => {
      try {
        // 添加时间戳防止缓存
        const res = await fetch(`/version.txt?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;

        const remoteVersion = (await res.text()).trim();
        if (!remoteVersion) return;

        const localStored = localStorage.getItem(STORAGE_KEY);

        if (localStored && remoteVersion !== localStored) {
          // 检测到新版本 → 显示更新提示
          setShowRefreshNotice(true);
        }
      } catch {
        // 网络错误时静默忽略
      }
    };

    // 启动轮询
    pollTimer = setInterval(checkRemoteVersion, POLL_INTERVAL);

    // 页面重新可见时也检查一次
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkRemoteVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // === 更新提示弹窗 ===
  if (!showRefreshNotice) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 forge-animate-fade-in">
      <div className="forge-card flex items-center gap-3 border-forge-accent/50 p-4 shadow-lg">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-forge-accent/10">
          <svg
            className="h-4 w-4 text-forge-accent"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zm7-3.25a.75.75 0 00-1.5 0V8c0 .388.294.707.674.748l3.5.375a.75.75 0 10.16-1.492L8.5 7.74V4.75z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-forge-ink">发现新版本</p>
          <p className="text-xs text-forge-muted">刷新以获取最新更新</p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              const remoteVersion = localStorage.getItem(STORAGE_KEY);
              if (remoteVersion) {
                localStorage.setItem(STORAGE_KEY, remoteVersion);
              }
              if ('caches' in window) {
                caches.keys().then((names) => {
                  names.forEach((name) => caches.delete(name));
                });
              }
            } catch {
              // ignore
            }
            window.location.reload();
          }}
          className="ml-2 flex-shrink-0 rounded-lg bg-forge-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110"
        >
          立即刷新
        </button>
        <button
          type="button"
          onClick={() => setShowRefreshNotice(false)}
          className="flex-shrink-0 rounded-lg border border-forge-border p-1 text-forge-muted transition-colors hover:text-forge-ink"
          aria-label="关闭"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 011.275.326.749.749 0 01-.215.734L9.06 8l3.22 3.22a.749.749 0 01-.326 1.275.749.749 0 01-.734-.215L8 9.06l-3.22 3.22a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
