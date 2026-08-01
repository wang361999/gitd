'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ProjectList from '@/components/ProjectList';
import StatsCard from '@/components/StatsCard';

interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: string;
  repoUrl: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* ============================================================
   快捷操作组件
   ============================================================ */
interface QuickActionProps {
  href: string;
  icon: 'plus' | 'shield' | 'upload' | 'clock';
  title: string;
  desc: string;
}

const QUICK_ACTION_THEME: Record<
  QuickActionProps['icon'],
  { iconBg: string; iconText: string; iconGlow: string }
> = {
  plus: {
    iconBg: 'bg-gradient-to-br from-forge-green/20 to-forge-accent/10',
    iconText: 'text-forge-green',
    iconGlow: 'shadow-[0_0_18px_-2px_rgba(63,185,80,0.4)]',
  },
  shield: {
    iconBg: 'bg-gradient-to-br from-forge-accent/20 to-forge-purple/10',
    iconText: 'text-forge-accent',
    iconGlow: 'shadow-[0_0_18px_-2px_rgba(88,166,255,0.4)]',
  },
  upload: {
    iconBg: 'bg-gradient-to-br from-forge-purple/20 to-forge-accent/10',
    iconText: 'text-forge-purple',
    iconGlow: 'shadow-[0_0_18px_-2px_rgba(188,140,255,0.4)]',
  },
  clock: {
    iconBg: 'bg-gradient-to-br from-forge-yellow/20 to-forge-accent/10',
    iconText: 'text-forge-yellow',
    iconGlow: 'shadow-[0_0_18px_-2px_rgba(210,153,34,0.4)]',
  },
};

function QuickActionIcon({ icon }: { icon: QuickActionProps['icon'] }) {
  switch (icon) {
    case 'plus':
      return (
        <svg
          className="h-5 w-5"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
        </svg>
      );
    case 'shield':
      return (
        <svg
          className="h-5 w-5"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
        </svg>
      );
    case 'upload':
      return (
        <svg
          className="h-5 w-5"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75zM7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 6.78a.75.75 0 011.06-1.06l1.97 1.969z" />
        </svg>
      );
    case 'clock':
      return (
        <svg
          className="h-5 w-5"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.546l3.04 1.755a.75.75 0 01-.75 1.299l-3.415-1.972A.75.75 0 017.25 8V3.75A.75.75 0 018 3z" />
        </svg>
      );
  }
}

function QuickAction({ href, icon, title, desc }: QuickActionProps) {
  const theme = QUICK_ACTION_THEME[icon];
  return (
    <Link
      href={href}
      className="forge-card-glow forge-hover-lift group block p-5 hover:border-forge-accent/50"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconText} ${theme.iconGlow} transition-transform duration-300 group-hover:scale-110`}
        >
          <QuickActionIcon icon={icon} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-forge-ink group-hover:text-forge-accent">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-forge-muted">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 搜索与筛选
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const PAGE_SIZE = 10;

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 状态筛选变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter]);

  const loadProjects = useCallback(
    async (page: number, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (statusFilter && statusFilter !== 'all')
          params.set('status', statusFilter);
        if (typeFilter && typeFilter !== 'all')
          params.set('type', typeFilter);

        const res = await fetch(`/api/projects?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
          setPagination(data.pagination || null);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || '加载项目列表失败');
        }
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [debouncedSearch, statusFilter, typeFilter]
  );

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        // 检查登录状态
        const authRes = await fetch('/api/auth?action=status');
        const authData = await authRes.json();

        if (!mounted) return;

        if (!authData.isLoggedIn) {
          setIsLoggedIn(false);
          setAuthChecked(true);
          setLoading(false);
          return;
        }

        setIsLoggedIn(true);

        // 获取项目列表（带搜索和筛选参数）
        const params = new URLSearchParams({
          page: '1',
          pageSize: String(PAGE_SIZE),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (statusFilter && statusFilter !== 'all')
          params.set('status', statusFilter);
        if (typeFilter && typeFilter !== 'all')
          params.set('type', typeFilter);

        const res = await fetch(`/api/projects?${params.toString()}`);
        if (!mounted) return;

        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
          setPagination(data.pagination || null);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || '加载项目列表失败');
        }
      } catch {
        if (mounted) {
          setError('网络错误，请稍后重试');
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [debouncedSearch, statusFilter, typeFilter]);

  // 统计数据
  const total = pagination?.total ?? projects.length;
  const successCount = projects.filter((p) => p.status === 'done').length;
  const failedCount = projects.filter((p) => p.status === 'failed').length;
  const inProgressCount = projects.filter(
    (p) => ['building', 'governing', 'packaging'].includes(p.status)
  ).length;

  const handleRefresh = () => {
    loadProjects(currentPage, true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadProjects(page);
  };

  // 加载中状态
  if (loading && !authChecked) {
    return (
      <div className="space-y-6">
        {/* 欢迎横幅骨架 */}
        <div className="forge-shimmer h-32 rounded-xl border border-forge-border" />
        {/* 统计卡片骨架 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="forge-shimmer h-28 rounded-xl border border-forge-border"
            />
          ))}
        </div>
        {/* 快捷操作骨架 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="forge-shimmer h-24 rounded-xl border border-forge-border"
            />
          ))}
        </div>
        {/* 项目列表骨架 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="forge-shimmer h-40 rounded-xl border border-forge-border"
            />
          ))}
        </div>
      </div>
    );
  }

  // 未登录提示
  if (authChecked && !isLoggedIn) {
    return (
      <div className="space-y-6">
        <div className="forge-card-pro forge-animate-fade-in-up relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-forge-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-forge-purple/10 blur-3xl" />
          <div className="relative">
            <p className="text-sm text-forge-muted">欢迎回来</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
              <span className="forge-text-gradient">控制台</span>
            </h1>
          </div>
        </div>
        <div className="forge-card-pro flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forge-accent/10 text-forge-accent shadow-[0_0_24px_-4px_rgba(88,166,255,0.4)]">
            <svg
              className="h-8 w-8"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
          <p className="mt-4 text-forge-ink">请先登录以查看项目</p>
          <p className="mt-1 text-sm text-forge-muted">
            使用 GitHub 账号登录后即可开始创建项目
          </p>
          <a
            href="/api/auth?action=login"
            className="forge-btn-primary mt-5 text-sm"
          >
            使用 GitHub 登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <div className="forge-card-pro forge-animate-fade-in-up relative overflow-hidden p-6 sm:p-8">
        {/* 背景光晕 */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-forge-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-forge-purple/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-forge-muted">欢迎回来</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
              <span className="forge-text-gradient">控制台</span>
            </h1>
            <p className="mt-2 text-sm text-forge-muted">
              当前共有{' '}
              <span className="font-mono font-semibold text-forge-ink">
                {total}
              </span>{' '}
              个项目
              {inProgressCount > 0 && (
                <>
                  ，
                  <span className="font-mono font-semibold text-forge-yellow">
                    {inProgressCount}
                  </span>{' '}
                  个进行中
                </>
              )}
              {refreshing && (
                <span className="ml-2 inline-flex items-center gap-1 text-forge-accent">
                  <svg
                    className="h-3 w-3 animate-spin"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                  </svg>
                  刷新中
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="forge-btn-secondary text-sm"
              title="刷新项目列表"
            >
              <svg
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 2.5a5.5 5.5 0 1 1-4.385 2.177.75.75 0 1 0-1.198.902A7 7 0 1 0 8 1V0L4.5 3.5 8 7V2.5z" />
              </svg>
              刷新
            </button>
            <Link href="/new" className="forge-btn-primary text-sm">
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
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-forge-red/30 bg-forge-red/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-forge-red">
            <svg
              className="h-4 w-4 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm1 6a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            {error}
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-forge-red hover:underline"
          >
            重试
          </button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard label="项目总数" value={total} icon="total" />
        <StatsCard label="构建成功" value={successCount} icon="success" />
        <StatsCard label="构建失败" value={failedCount} icon="failed" />
        <StatsCard label="进行中" value={inProgressCount} icon="progress" />
      </div>

      {/* 快捷操作 */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-forge-muted">快捷操作</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction href="/new" icon="plus" title="新建项目" desc="从需求生成代码并治理" />
          <QuickAction href="/governance" icon="shield" title="治理仓库" desc="对已有仓库执行治理审查" />
          <QuickAction href="/upload" icon="upload" title="上传治理" desc="上传代码文件快速分析" />
          <QuickAction href="/schedules" icon="clock" title="定时治理" desc="设置自动治理计划" />
        </div>
      </div>

      {/* 项目列表 */}
      <div className="space-y-4">
        {/* 区块标题 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-forge-ink">我的项目</h2>
          {pagination && pagination.total > 0 && (
            <span className="text-sm text-forge-muted">
              共 <span className="font-mono text-forge-ink">{pagination.total}</span>{' '}
              个项目
            </span>
          )}
        </div>

        {/* 搜索与筛选 */}
        <div className="forge-card-pro p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forge-muted"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索项目..."
                className="w-full rounded-lg border border-forge-border bg-forge-bg py-2 pl-9 pr-3 text-sm text-forge-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-colors placeholder-forge-muted focus:border-forge-accent focus:outline-none focus:ring-2 focus:ring-forge-accent/20 sm:w-56"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-colors focus:border-forge-accent focus:outline-none focus:ring-2 focus:ring-forge-accent/20"
              >
                <option value="all">全部状态</option>
                <option value="building">构建中</option>
                <option value="governing">治理审核</option>
                <option value="packaging">打包中</option>
                <option value="done">已完成</option>
                <option value="failed">失败</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-forge-border bg-forge-bg px-3 py-2 text-sm text-forge-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] transition-colors focus:border-forge-accent focus:outline-none focus:ring-2 focus:ring-forge-accent/20"
              >
                <option value="all">全部类型</option>
                <option value="web">Web 应用</option>
                <option value="desktop">桌面应用</option>
                <option value="mobile">移动应用</option>
                <option value="governance-only">独立治理</option>
                <option value="upload">上传治理</option>
              </select>
            </div>
          </div>
        </div>

        <ProjectList
          projects={projects}
          loading={loading}
          onProjectDeleted={() => loadProjects(currentPage, true)}
          searchMode={!!debouncedSearch || statusFilter !== 'all' || typeFilter !== 'all'}
        />

        {/* 分页控件 */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="forge-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              上一页
            </button>
            {Array.from(
              { length: pagination.totalPages },
              (_, i) => i + 1
            )
              .filter(
                (page) =>
                  page === 1 ||
                  page === pagination.totalPages ||
                  Math.abs(page - currentPage) <= 1
              )
              .map((page, idx, arr) => {
                const showEllipsisBefore =
                  idx > 0 && page - arr[idx - 1] > 1;
                return (
                  <span key={page} className="flex items-center gap-1">
                    {showEllipsisBefore && (
                      <span className="px-1 text-forge-muted">...</span>
                    )}
                    <button
                      onClick={() => handlePageChange(page)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-sm transition-colors ${
                        page === currentPage
                          ? 'bg-forge-accent text-white shadow-[0_0_12px_-2px_rgba(88,166,255,0.5)]'
                          : 'border border-forge-border text-forge-ink hover:border-forge-accent/50 hover:bg-forge-surface'
                      }`}
                    >
                      {page}
                    </button>
                  </span>
                );
              })}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={
                currentPage >= pagination.totalPages || loading
              }
              className="forge-btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
