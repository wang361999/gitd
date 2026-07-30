'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================================
// 类型定义
// ============================================================

interface StatsData {
  totalUsers: number;
  totalProjects: number;
  totalTasks: number;
  totalGovernanceReports: number;
  projectsByStatus: Record<string, number>;
  recentProjects: Array<{
    id: string;
    name: string;
    status: string;
    projectType: string;
    createdAt: string;
    user: { username: string };
  }>;
}

interface AdminProject {
  id: string;
  name: string;
  projectType: string;
  status: string;
  repoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  user: { username: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AdminUser {
  id: string;
  username: string;
  githubId: number;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  _count: { projects: number };
}

interface SettingsData {
  settings: Record<string, string>;
}

type TabKey = 'dashboard' | 'projects' | 'settings' | 'users';

// ============================================================
// 状态映射（颜色 + 中文标签）
// ============================================================

const STATUS_META: Record<
  string,
  { label: string; color: string; bar: string }
> = {
  draft: { label: '草稿', color: 'text-forge-muted', bar: 'bg-forge-muted' },
  building: { label: '构建中', color: 'text-forge-accent', bar: 'bg-forge-accent' },
  governing: { label: '治理中', color: 'text-forge-purple', bar: 'bg-forge-purple' },
  packaging: { label: '打包中', color: 'text-forge-yellow', bar: 'bg-forge-yellow' },
  done: { label: '已完成', color: 'text-forge-green', bar: 'bg-forge-green' },
  failed: { label: '失败', color: 'text-forge-red', bar: 'bg-forge-red' },
};

const STATUS_ORDER = ['draft', 'building', 'governing', 'packaging', 'done', 'failed'];

const PROJECT_TYPE_LABEL: Record<string, string> = {
  web: 'Web',
  desktop: '桌面',
  mobile: '移动',
};

// ============================================================
// 工具函数
// ============================================================

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getStatusMeta(status: string) {
  return STATUS_META[status] || { label: status, color: 'text-forge-muted', bar: 'bg-forge-muted' };
}

// ============================================================
// 主组件
// ============================================================

export default function AdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 登录表单状态
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // 主界面状态
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // 页面加载时检查登录状态
  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        const res = await fetch('/api/admin?action=status');
        if (res.ok) {
          const data = await res.json();
          if (mounted) setIsLoggedIn(Boolean(data.isAdmin));
        }
      } catch {
        // 忽略
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }
    checkStatus();
    return () => {
      mounted = false;
    };
  }, []);

  // -------------------- 登录 --------------------
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsLoggedIn(true);
        setPassword('');
      } else {
        setLoginError(data.error || '登录失败');
      }
    } catch {
      setLoginError('网络错误，请重试');
    } finally {
      setLoginLoading(false);
    }
  }

  // -------------------- 退出登录 --------------------
  async function handleLogout() {
    try {
      await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {
      // 忽略
    }
    setIsLoggedIn(false);
    setActiveTab('dashboard');
  }

  // -------------------- 加载中 --------------------
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-forge-spin rounded-full border-2 border-forge-border border-t-forge-accent" />
      </div>
    );
  }

  // -------------------- 登录界面 --------------------
  if (!isLoggedIn) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="forge-card w-full max-w-sm p-8 forge-animate-fade-in">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-forge-accent text-xl font-bold text-white">
              A
            </span>
            <h1 className="text-xl font-bold text-forge-ink">Agent Forge Admin</h1>
            <p className="mt-1 text-sm text-forge-muted">后台管理控制台</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-forge-ink">
                管理员密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入管理员密码"
                autoFocus
                className="forge-input w-full"
                disabled={loginLoading}
              />
            </div>

            {loginError && (
              <div className="rounded-md border border-forge-red/30 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !password}
              className="forge-btn-accent w-full"
            >
              {loginLoading ? (
                <>
                  <span className="h-4 w-4 animate-forge-spin rounded-full border-2 border-white/30 border-t-white" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
          </form>

          <div className="mt-5 rounded-md border border-forge-border bg-forge-bg px-3 py-2.5 text-center text-xs text-forge-muted">
            默认密码: <span className="font-mono text-forge-yellow">forge-admin-2026</span>
            <br />
            （首次使用请尽快修改）
          </div>
        </div>
      </div>
    );
  }

  // -------------------- 后台主界面 --------------------
  const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    {
      key: 'dashboard',
      label: '仪表盘',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v3.5C0 7.216.784 8 1.75 8h3.5A1.75 1.75 0 007 6.25v-3.5A1.75 1.75 0 005.25 1h-3.5zM1.75 9A1.75 1.75 0 000 10.75v2.5C0 14.216.784 15 1.75 15h3.5A1.75 1.75 0 007 13.25v-2.5A1.75 1.75 0 005.25 9h-3.5zM9 10.75A1.75 1.75 0 0110.75 9h3.5A1.75 1.75 0 0116 10.75v2.5A1.75 1.75 0 0114.25 15h-3.5A1.75 1.75 0 019 13.25v-2.5zM9 2.75A1.75 1.75 0 0110.75 1h3.5A1.75 1.75 0 0116 2.75v3.5A1.75 1.75 0 0114.25 8h-3.5A1.75 1.75 0 019 6.25v-3.5z" />
        </svg>
      ),
    },
    {
      key: 'projects',
      label: '项目管理',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
        </svg>
      ),
    },
    {
      key: 'settings',
      label: '系统配置',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 01-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 01-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 01-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 01-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 01-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 010-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 01.704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C5.81.645 6.356.095 7.099.03 7.333.01 7.566 0 7.8 0ZM8 5a3 3 0 100 6 3 3 0 000-6Z" />
        </svg>
      ),
    },
    {
      key: 'users',
      label: '用户管理',
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5.5 3.5a2 2 0 11-4 0 2 2 0 014 0zM3 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C.5 8.12 1.62 7 3 7zm9.5-3.5a2 2 0 11-4 0 2 2 0 014 0zM10 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C7.5 8.12 8.62 7 10 7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-[80vh] space-y-6">
      {/* 顶部导航 */}
      <div className="forge-card flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-forge-accent text-lg font-bold text-white">
            A
          </span>
          <div>
            <h1 className="text-lg font-bold text-forge-ink">Agent Forge Admin</h1>
            <p className="text-xs text-forge-muted">后台管理控制台</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="forge-btn-secondary text-sm"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2 2.75A2.75 2.75 0 014.75 0h3.5a.75.75 0 010 1.5h-3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h3.5a.75.75 0 010 1.5h-3.5A2.75 2.75 0 012 13.25V2.75zm9.994 2.079a.75.75 0 01-.026 1.06L10.06 7.75h4.69a.75.75 0 010 1.5h-4.69l1.908 1.86a.75.75 0 11-1.04 1.08l-3.182-3.106a.75.75 0 010-1.08l3.182-3.106a.75.75 0 011.066.026z" />
          </svg>
          退出登录
        </button>
      </div>

      {/* 主体：左侧 Tab + 右侧内容 */}
      <div className="flex flex-col gap-5 md:flex-row">
        {/* 左侧 Tab 导航 */}
        <nav className="forge-card flex shrink-0 flex-row gap-1 p-2 md:w-48 md:flex-col">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:flex-none ${
                activeTab === tab.key
                  ? 'bg-forge-accent/15 text-forge-accent'
                  : 'text-forge-muted hover:bg-forge-bg hover:text-forge-ink'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* 右侧内容区 */}
        <div className="min-w-0 flex-1">
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'projects' && <ProjectsTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'users' && <UsersTab />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 仪表盘 Tab
// ============================================================

function DashboardTab() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch('/api/admin?action=stats');
        if (!res.ok) throw new Error('加载失败');
        const data = await res.json();
        if (mounted) setStats(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingSpinner text="加载统计数据..." />;
  }

  if (error) {
    return <ErrorBlock message={error} />;
  }

  if (!stats) return null;

  const cards = [
    { label: '总用户数', value: stats.totalUsers, color: 'text-forge-accent' },
    { label: '总项目数', value: stats.totalProjects, color: 'text-forge-green' },
    { label: '总任务数', value: stats.totalTasks, color: 'text-forge-yellow' },
    { label: '治理报告数', value: stats.totalGovernanceReports, color: 'text-forge-purple' },
  ];

  const totalForChart = STATUS_ORDER.reduce(
    (sum, s) => sum + (stats.projectsByStatus[s] || 0),
    0
  );

  return (
    <div className="space-y-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="forge-card p-5">
            <p className="text-sm text-forge-muted">{c.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 项目状态分布 */}
      <div className="forge-card p-5">
        <h2 className="mb-4 text-base font-semibold text-forge-ink">项目状态分布</h2>
        {totalForChart === 0 ? (
          <p className="py-6 text-center text-sm text-forge-muted">暂无项目数据</p>
        ) : (
          <div className="space-y-3">
            {/* 条形图 */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-forge-bg">
              {STATUS_ORDER.map((s) => {
                const count = stats.projectsByStatus[s] || 0;
                if (count === 0) return null;
                const meta = getStatusMeta(s);
                const pct = (count / totalForChart) * 100;
                return (
                  <div
                    key={s}
                    className={`${meta.bar} h-full transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${meta.label}: ${count}`}
                  />
                );
              })}
            </div>
            {/* 图例 + 数值 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {STATUS_ORDER.map((s) => {
                const count = stats.projectsByStatus[s] || 0;
                const meta = getStatusMeta(s);
                const pct = totalForChart > 0 ? Math.round((count / totalForChart) * 100) : 0;
                return (
                  <div key={s} className="rounded-md border border-forge-border bg-forge-bg px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-sm ${meta.bar}`} />
                      <span className="text-xs text-forge-muted">{meta.label}</span>
                    </div>
                    <p className={`mt-1 text-lg font-semibold ${meta.color}`}>
                      {count}
                      <span className="ml-1 text-xs font-normal text-forge-muted">
                        {pct}%
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 最近项目 */}
      <div className="forge-card p-5">
        <h2 className="mb-4 text-base font-semibold text-forge-ink">最近 5 个项目</h2>
        {stats.recentProjects.length === 0 ? (
          <p className="py-6 text-center text-sm text-forge-muted">暂无项目</p>
        ) : (
          <div className="space-y-2">
            {stats.recentProjects.map((p) => {
              const meta = getStatusMeta(p.status);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-forge-border bg-forge-bg px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-forge-ink">{p.name}</p>
                    <p className="mt-0.5 text-xs text-forge-muted">
                      {p.user.username} · {PROJECT_TYPE_LABEL[p.projectType] || p.projectType} ·{' '}
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full border border-forge-border px-2.5 py-0.5 text-xs font-medium ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 项目管理 Tab
// ============================================================

function ProjectsTab() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const loadProjects = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin?action=projects&page=${p}&pageSize=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setProjects(data.projects || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects(page);
  }, [page, loadProjects]);

  async function handleDelete(project: AdminProject) {
    const confirmed = window.confirm(
      `确定要删除项目「${project.name}」吗？\n该操作将级联删除关联的任务、治理报告等数据，且不可恢复。`
    );
    if (!confirmed) return;

    setDeletingId(project.id);
    try {
      const res = await fetch(`/api/admin?id=${project.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      // 刷新当前页
      await loadProjects(page);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-forge-ink">项目管理</h2>
        {pagination && (
          <span className="text-sm text-forge-muted">
            共 {pagination.total} 个项目
          </span>
        )}
      </div>

      {loading ? (
        <LoadingSpinner text="加载项目列表..." />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : projects.length === 0 ? (
        <div className="forge-card py-12 text-center text-sm text-forge-muted">
          暂无项目
        </div>
      ) : (
        <>
          {/* 表头 */}
          <div className="forge-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg px-4 py-2.5 text-xs font-medium text-forge-muted">
              <div className="min-w-0 flex-1">项目名</div>
              <div className="w-24 shrink-0">用户</div>
              <div className="w-16 shrink-0">类型</div>
              <div className="w-20 shrink-0">状态</div>
              <div className="w-36 shrink-0">创建时间</div>
              <div className="w-16 shrink-0 text-right">操作</div>
            </div>
            {/* 表体 */}
            {projects.map((p) => {
              const meta = getStatusMeta(p.status);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border-b border-forge-border px-4 py-3 text-sm last:border-b-0 hover:bg-forge-bg/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-forge-ink">{p.name}</p>
                    {p.repoUrl && (
                      <a
                        href={p.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-xs text-forge-accent hover:underline"
                      >
                        {p.repoUrl}
                      </a>
                    )}
                  </div>
                  <div className="w-24 shrink-0 truncate text-forge-muted">
                    {p.user.username}
                  </div>
                  <div className="w-16 shrink-0 text-forge-muted">
                    {PROJECT_TYPE_LABEL[p.projectType] || p.projectType}
                  </div>
                  <div className="w-20 shrink-0">
                    <span
                      className={`inline-block rounded-full border border-forge-border px-2 py-0.5 text-xs font-medium ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="w-36 shrink-0 text-xs text-forge-muted">
                    {formatDate(p.createdAt)}
                  </div>
                  <div className="w-16 shrink-0 text-right">
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id}
                      className="inline-flex items-center justify-center rounded-md border border-forge-red/30 px-2 py-1 text-xs text-forge-red transition-colors hover:bg-forge-red/10 disabled:opacity-50"
                    >
                      {deletingId === p.id ? (
                        <span className="h-3 w-3 animate-forge-spin rounded-full border border-forge-red/40 border-t-forge-red" />
                      ) : (
                        '删除'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分页控件 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="forge-btn-secondary text-sm"
              >
                上一页
              </button>
              <span className="text-sm text-forge-muted">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="forge-btn-secondary text-sm"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// 系统配置 Tab
// ============================================================

function SettingsTab() {
  const [maskedSettings, setMaskedSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 表单字段（仅保存用户输入的新值，留空表示不更新）
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubOrg, setGithubOrg] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [forgeRepoOwner, setForgeRepoOwner] = useState('');
  const [forgeRepoName, setForgeRepoName] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/admin?action=settings');
        if (!res.ok) throw new Error('加载配置失败');
        const data: SettingsData = await res.json();
        if (!mounted) return;
        const s = data.settings || {};
        setMaskedSettings(s);
        // 非密钥字段直接回填原值
        setClientId(s.GITHUB_CLIENT_ID || '');
        setGithubOrg(s.GITHUB_ORG || '');
        setAppUrl(s.APP_URL || '');
        setForgeRepoOwner(s.FORGE_REPO_OWNER || '');
        setForgeRepoName(s.FORGE_REPO_NAME || '');
        // 密钥字段留空，通过 placeholder 显示脱敏值
        setClientSecret('');
        setGithubToken('');
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : '加载配置失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMessage('');
    setError('');

    const settings: Record<string, string> = {};
    if (clientId.trim()) settings.GITHUB_CLIENT_ID = clientId.trim();
    if (clientSecret.trim()) settings.GITHUB_CLIENT_SECRET = clientSecret.trim();
    if (githubToken.trim()) settings.GITHUB_TOKEN = githubToken.trim();
    if (githubOrg.trim()) settings.GITHUB_ORG = githubOrg.trim();
    if (appUrl.trim()) settings.APP_URL = appUrl.trim();
    if (forgeRepoOwner.trim()) settings.FORGE_REPO_OWNER = forgeRepoOwner.trim();
    if (forgeRepoName.trim()) settings.FORGE_REPO_NAME = forgeRepoName.trim();

    if (Object.keys(settings).length === 0) {
      setError('没有需要更新的配置项');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      setSavedMessage('配置保存成功');
      // 重新加载脱敏配置
      const refreshRes = await fetch('/api/admin?action=settings');
      if (refreshRes.ok) {
        const refreshData: SettingsData = await refreshRes.json();
        const s = refreshData.settings || {};
        setMaskedSettings(s);
        setClientId(s.GITHUB_CLIENT_ID || '');
        setGithubOrg(s.GITHUB_ORG || '');
        setAppUrl(s.APP_URL || '');
        setForgeRepoOwner(s.FORGE_REPO_OWNER || '');
        setForgeRepoName(s.FORGE_REPO_NAME || '');
        setClientSecret('');
        setGithubToken('');
      }
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingSpinner text="加载配置..." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-forge-ink">系统配置</h2>

      {error && (
        <div className="rounded-md border border-forge-red/30 bg-forge-red/10 px-3 py-2 text-sm text-forge-red">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="rounded-md border border-forge-green/30 bg-forge-green/10 px-3 py-2 text-sm text-forge-green">
          {savedMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="forge-card space-y-5 p-5">
        {/* GitHub Client ID */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-forge-ink">
            GitHub Client ID
          </label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={maskedSettings.GITHUB_CLIENT_ID || '未配置'}
            className="forge-input w-full font-mono text-sm"
          />
          <p className="mt-1 text-xs text-forge-muted">GitHub OAuth App 的 Client ID</p>
        </div>

        {/* GitHub Client Secret */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-forge-ink">
            GitHub Client Secret
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              maskedSettings.GITHUB_CLIENT_SECRET
                ? `当前: ${maskedSettings.GITHUB_CLIENT_SECRET}（留空保持不变）`
                : '未配置'
            }
            className="forge-input w-full font-mono text-sm"
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-forge-muted">
            GitHub OAuth App 的 Client Secret，留空表示不修改
          </p>
        </div>

        {/* GitHub Token */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-forge-ink">
            GitHub Token
          </label>
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={
              maskedSettings.GITHUB_TOKEN
                ? `当前: ${maskedSettings.GITHUB_TOKEN}（留空保持不变）`
                : '未配置'
            }
            className="forge-input w-full font-mono text-sm"
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-forge-muted">
            系统级 GitHub Personal Access Token，留空表示不修改
          </p>
        </div>

        {/* GitHub Org */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-forge-ink">
            GitHub Org <span className="text-forge-muted">（可选）</span>
          </label>
          <input
            type="text"
            value={githubOrg}
            onChange={(e) => setGithubOrg(e.target.value)}
            placeholder={maskedSettings.GITHUB_ORG || '留空则在用户账号下创建'}
            className="forge-input w-full font-mono text-sm"
          />
          <p className="mt-1 text-xs text-forge-muted">
            仓库创建的目标组织名，不填则在登录用户账号下创建
          </p>
        </div>

        {/* App URL */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-forge-ink">
            App URL
          </label>
          <input
            type="text"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder={maskedSettings.APP_URL || 'https://your-app.vercel.app'}
            className="forge-input w-full font-mono text-sm"
          />
          <p className="mt-1 text-xs text-forge-muted">
            应用访问地址，用于构建 OAuth 回调与 Webhook 地址
          </p>
        </div>

        {/* Forge 仓库配置 */}
        <div className="rounded-lg border border-forge-border bg-forge-surface/50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-forge-ink">
            Agent Forge 仓库配置
          </h4>
          <p className="mb-3 text-xs text-forge-muted">
            存放 GitHub Actions 工作流文件的仓库（即本仓库），所有 workflow 在此仓库上触发
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-forge-muted">仓库 Owner</label>
              <input
                type="text"
                value={forgeRepoOwner}
                onChange={(e) => setForgeRepoOwner(e.target.value)}
                placeholder={maskedSettings.FORGE_REPO_OWNER || '如: wang361999'}
                className="forge-input w-full font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-forge-muted">仓库名</label>
              <input
                type="text"
                value={forgeRepoName}
                onChange={(e) => setForgeRepoName(e.target.value)}
                placeholder={maskedSettings.FORGE_REPO_NAME || '如: gitd'}
                className="forge-input w-full font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex items-center gap-3 border-t border-forge-border pt-4">
          <button
            type="submit"
            disabled={saving}
            className="forge-btn-primary text-sm"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-forge-spin rounded-full border-2 border-white/30 border-t-white" />
                保存中...
              </>
            ) : (
              '保存配置'
            )}
          </button>
          <span className="text-xs text-forge-muted">
            仅更新已填写且非空的字段，留空的密钥类字段保持不变
          </span>
        </div>
      </form>

      {/* GitHub 仓库 Secrets 提示区域 */}
      <div className="forge-card border-forge-yellow/30 p-5">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-forge-yellow"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm1 6a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-forge-ink">
              需要在 GitHub 仓库 Secrets 中配置的项
            </h3>
            <p className="mt-1 text-xs text-forge-muted">
              以下密钥需要在 GitHub 仓库的 Settings → Secrets and variables → Actions 中手动配置，
              供 GitHub Actions 工作流使用：
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-forge-muted">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-forge-yellow">•</span>
                <code className="rounded bg-forge-bg px-1.5 py-0.5 font-mono text-forge-accent">
                  PAT_TOKEN
                </code>
                <span>— 值同上方 GitHub Token</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-forge-yellow">•</span>
                <code className="rounded bg-forge-bg px-1.5 py-0.5 font-mono text-forge-accent">
                  GITHUB_TOKEN
                </code>
                <span>— 值同上方 GitHub Token</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-forge-yellow">•</span>
                <code className="rounded bg-forge-bg px-1.5 py-0.5 font-mono text-forge-accent">
                  WEBHOOK_SECRET
                </code>
                <span>— Webhook 验证密钥（初始化时已生成）</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 用户管理 Tab
// ============================================================

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/admin?action=users');
        if (!res.ok) throw new Error('加载用户列表失败');
        const data = await res.json();
        if (mounted) setUsers(data.users || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : '加载用户列表失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingSpinner text="加载用户列表..." />;
  }

  if (error) {
    return <ErrorBlock message={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-forge-ink">用户管理</h2>
        <span className="text-sm text-forge-muted">共 {users.length} 个用户</span>
      </div>

      {users.length === 0 ? (
        <div className="forge-card py-12 text-center text-sm text-forge-muted">
          暂无用户
        </div>
      ) : (
        <div className="forge-card overflow-hidden">
          {/* 表头 */}
          <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg px-4 py-2.5 text-xs font-medium text-forge-muted">
            <div className="min-w-0 flex-1">用户名</div>
            <div className="w-28 shrink-0">GitHub ID</div>
            <div className="min-w-0 flex-1">邮箱</div>
            <div className="w-16 shrink-0 text-right">项目数</div>
            <div className="w-36 shrink-0">注册时间</div>
          </div>
          {/* 表体 */}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 border-b border-forge-border px-4 py-3 text-sm last:border-b-0 hover:bg-forge-bg/50"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt={u.username}
                    className="h-6 w-6 shrink-0 rounded-full border border-forge-border"
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forge-accent text-xs font-medium text-white">
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate font-medium text-forge-ink">{u.username}</span>
              </div>
              <div className="w-28 shrink-0 font-mono text-xs text-forge-muted">
                {u.githubId}
              </div>
              <div className="min-w-0 flex-1 truncate text-forge-muted">
                {u.email || <span className="text-forge-muted/60">未公开</span>}
              </div>
              <div className="w-16 shrink-0 text-right text-forge-accent">
                {u._count.projects}
              </div>
              <div className="w-36 shrink-0 text-xs text-forge-muted">
                {formatDate(u.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 通用辅助组件
// ============================================================

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="forge-card flex items-center justify-center gap-3 py-12">
      <span className="h-5 w-5 animate-forge-spin rounded-full border-2 border-forge-border border-t-forge-accent" />
      <span className="text-sm text-forge-muted">{text}</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="forge-card flex items-center gap-3 border-forge-red/30 px-4 py-6">
      <svg
        className="h-5 w-5 shrink-0 text-forge-red"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2.34 3.34a8 8 0 11.32.32A8 8 0 012.34 3.34zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0V8a.75.75 0 001.5 0V4.75zM8 12a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
      <span className="text-sm text-forge-red">{message}</span>
    </div>
  );
}
