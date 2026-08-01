'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';

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
  { label: string; color: string; bar: string; bg: string; ring: string; dot: string }
> = {
  draft: { label: '草稿', color: 'text-forge-muted', bar: 'bg-forge-muted', bg: 'bg-forge-muted/10', ring: 'border-forge-muted/30', dot: 'bg-forge-muted' },
  building: { label: '构建中', color: 'text-forge-accent', bar: 'bg-forge-accent', bg: 'bg-forge-accent/10', ring: 'border-forge-accent/30', dot: 'bg-forge-accent' },
  governing: { label: '治理中', color: 'text-forge-purple', bar: 'bg-forge-purple', bg: 'bg-forge-purple/10', ring: 'border-forge-purple/30', dot: 'bg-forge-purple' },
  packaging: { label: '打包中', color: 'text-forge-yellow', bar: 'bg-forge-yellow', bg: 'bg-forge-yellow/10', ring: 'border-forge-yellow/30', dot: 'bg-forge-yellow' },
  done: { label: '已完成', color: 'text-forge-green', bar: 'bg-forge-green', bg: 'bg-forge-green/10', ring: 'border-forge-green/30', dot: 'bg-forge-green' },
  failed: { label: '失败', color: 'text-forge-red', bar: 'bg-forge-red', bg: 'bg-forge-red/10', ring: 'border-forge-red/30', dot: 'bg-forge-red' },
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
  return (
    STATUS_META[status] || {
      label: status,
      color: 'text-forge-muted',
      bar: 'bg-forge-muted',
      bg: 'bg-forge-muted/10',
      ring: 'border-forge-muted/30',
      dot: 'bg-forge-muted',
    }
  );
}

// ============================================================
// 图标组件（统一风格，viewBox 16x16）
// ============================================================

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const ICON_PATHS = {
  dashboard:
    'M1.75 1A1.75 1.75 0 000 2.75v3.5C0 7.216.784 8 1.75 8h3.5A1.75 1.75 0 007 6.25v-3.5A1.75 1.75 0 005.25 1h-3.5zM1.75 9A1.75 1.75 0 000 10.75v2.5C0 14.216.784 15 1.75 15h3.5A1.75 1.75 0 007 13.25v-2.5A1.75 1.75 0 005.25 9h-3.5zM9 10.75A1.75 1.75 0 0110.75 9h3.5A1.75 1.75 0 0116 10.75v2.5A1.75 1.75 0 0114.25 15h-3.5A1.75 1.75 0 019 13.25v-2.5zM9 2.75A1.75 1.75 0 0110.75 1h3.5A1.75 1.75 0 0116 2.75v3.5A1.75 1.75 0 0114.25 8h-3.5A1.75 1.75 0 019 6.25v-3.5z',
  projects:
    'M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z',
  settings:
    'M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 01-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 01-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 01-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 01-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 01-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 010-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 01.704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C5.81.645 6.356.095 7.099.03 7.333.01 7.566 0 7.8 0ZM8 5a3 3 0 100 6 3 3 0 000-6Z',
  users:
    'M5.5 3.5a2 2 0 11-4 0 2 2 0 014 0zM3 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C.5 8.12 1.62 7 3 7zm9.5-3.5a2 2 0 11-4 0 2 2 0 014 0zM10 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C7.5 8.12 8.62 7 10 7z',
  logout:
    'M2 2.75A2.75 2.75 0 014.75 0h3.5a.75.75 0 010 1.5h-3.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h3.5a.75.75 0 010 1.5h-3.5A2.75 2.75 0 012 13.25V2.75zm9.994 2.079a.75.75 0 01-.026 1.06L10.06 7.75h4.69a.75.75 0 010 1.5h-4.69l1.908 1.86a.75.75 0 11-1.04 1.08l-3.182-3.106a.75.75 0 010-1.08l3.182-3.106a.75.75 0 011.066.026z',
  trash:
    'M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 00.249.225h5.19a.25.25 0 00.249-.225l.66-6.6a.75.75 0 011.492.149l-.66 6.6A1.75 1.75 0 0110.595 15h-5.19a1.75 1.75 0 01-1.741-1.575l-.66-6.6a.75.75 0 011.492-.15z',
  alert:
    'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm1 6a1 1 0 11-2 0 1 1 0 012 0z',
  error:
    'M2.34 3.34a8 8 0 11.32.32A8 8 0 012.34 3.34zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0V8a.75.75 0 001.5 0V4.75zM8 12a1 1 0 100-2 1 1 0 000 2z',
  people:
    'M5.5 3.5a2 2 0 11-4 0 2 2 0 014 0zM3 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C.5 8.12 1.62 7 3 7zm9.5-3.5a2 2 0 11-4 0 2 2 0 014 0zM10 7c1.38 0 2.5 1.12 2.5 2.5V12h-5V9.5C7.5 8.12 8.62 7 10 7z',
  folder:
    'M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z',
  checklist:
    'M2.5 1.75A1.75 1.75 0 014.25 0h8.5A1.75 1.75 0 0114.5 1.75v12.5A1.75 1.75 0 0112.75 16h-8.5A1.75 1.75 0 012.5 14.25V1.75zm2.75 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM4.5 9.5a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014.5 9.5zM5.25 12a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z',
  report:
    'M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75zm8.755 3a2.25 2.25 0 012.25-2.25H14.5v9h-3.757l-.246.226a3.75 3.75 0 01-.742.553V4.75z',
  link: 'M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z',
  inbox:
    'M2.8 2.06A1.75 1.75 0 014.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25v-4.5c0-.101.02-.202.06-.295L2.8 2.06zM4.41 2.5a.25.25 0 00-.23.152L1.713 8H5.75a.75.75 0 01.6.3l1.127 1.5h2.046l1.127-1.5a.75.75 0 01.6-.3h4.037L11.82 2.652a.25.25 0 00-.23-.152H4.41z',
};

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
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-forge-spin rounded-full border-2 border-forge-border border-t-forge-accent" />
          <span className="text-sm text-forge-muted">正在校验权限...</span>
        </div>
      </div>
    );
  }

  // -------------------- 登录界面 --------------------
  if (!isLoggedIn) {
    return (
      <div className="relative flex min-h-[82vh] items-center justify-center overflow-hidden px-4">
        {/* 背景光晕 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-forge-accent/10 blur-3xl" />
          <div className="absolute -bottom-20 right-1/4 h-72 w-72 rounded-full bg-forge-purple/10 blur-3xl" />
          <div className="absolute left-1/4 top-1/3 h-56 w-56 rounded-full bg-forge-green/5 blur-3xl" />
        </div>

        <div className="forge-card-pro forge-glass forge-hover-lift relative w-full max-w-md p-8 forge-animate-fade-in-up">
          {/* 顶部渐变光带 */}
          <div className="forge-top-bar absolute inset-x-0 top-0 h-0.5 rounded-t-xl" />

          {/* Logo */}
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-accent to-forge-purple text-2xl font-bold text-white shadow-lg shadow-forge-accent/30">
              A
            </span>
            <h1 className="forge-text-gradient text-xl font-bold">Agent Forge Admin</h1>
            <p className="mt-1 text-sm text-forge-muted">企业级后台管理控制台</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-forge-ink">
                管理员密码
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-forge-muted">
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M4 4a4 4 0 018 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4zm6.5 2V4a2.5 2.5 0 00-5 0v2h5z" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入管理员密码"
                  autoFocus
                  className="forge-input w-full pl-9"
                  disabled={loginLoading}
                />
              </div>
            </div>

            {loginError && (
              <div className="flex items-start gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-3 py-2.5 text-sm text-forge-red forge-animate-fade-in">
                <Icon path={ICON_PATHS.error} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{loginError}</span>
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
                <>
                  <Icon path={ICON_PATHS.logout} className="h-4 w-4 rotate-180" />
                  登录控制台
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-forge-border bg-forge-bg/60 px-3.5 py-2.5">
            <Icon path={ICON_PATHS.alert} className="mt-0.5 h-4 w-4 shrink-0 text-forge-yellow" />
            <div className="text-xs text-forge-muted">
              默认密码：<span className="font-mono text-forge-yellow">forge-admin-2026</span>
              <br />
              首次使用后请尽快通过环境变量修改
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------- 后台主界面 --------------------
  const TABS: Array<{ key: TabKey; label: string; section: string; icon: React.ReactNode }> = [
    { key: 'dashboard', label: '仪表盘', section: '概览', icon: <Icon path={ICON_PATHS.dashboard} /> },
    { key: 'projects', label: '项目管理', section: '管理', icon: <Icon path={ICON_PATHS.projects} /> },
    { key: 'settings', label: '系统配置', section: '管理', icon: <Icon path={ICON_PATHS.settings} /> },
    { key: 'users', label: '用户管理', section: '管理', icon: <Icon path={ICON_PATHS.users} /> },
  ];

  return (
    <div className="min-h-[80vh] space-y-6">
      {/* 顶部导航 */}
      <header className="forge-glass forge-top-bar relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-forge-accent to-forge-purple text-lg font-bold text-white shadow-md shadow-forge-accent/30">
            A
          </span>
          <div>
            <h1 className="forge-text-gradient text-lg font-bold leading-tight">Agent Forge Admin</h1>
            <p className="text-xs text-forge-muted">企业级后台管理控制台</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 系统状态指示 */}
          <div className="flex items-center gap-2 rounded-full border border-forge-green/20 bg-forge-green/5 px-3 py-1">
            <span className="forge-dot-pulse relative h-2 w-2 rounded-full bg-forge-green text-forge-green" />
            <span className="text-xs font-medium text-forge-green">系统运行中</span>
          </div>

          {/* 退出登录 */}
          <button
            onClick={handleLogout}
            className="forge-btn-secondary text-sm"
          >
            <Icon path={ICON_PATHS.logout} />
            退出登录
          </button>
        </div>
      </header>

      {/* 主体：左侧 Tab + 右侧内容 */}
      <div className="flex flex-col gap-5 md:flex-row">
        {/* 左侧 Tab 导航 */}
        <nav className="forge-card-pro shrink-0 p-3 md:w-56 md:self-start">
          <div className="flex flex-row gap-1 md:flex-col">
            {(() => {
              let lastSection = '';
              return TABS.map((tab) => {
                const showHeader = tab.section !== lastSection;
                lastSection = tab.section;
                const isActive = activeTab === tab.key;
                return (
                  <Fragment key={tab.key}>
                    {showHeader && (
                      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-forge-muted/70 first:pt-0">
                        {tab.section}
                      </div>
                    )}
                    <button
                      onClick={() => setActiveTab(tab.key)}
                      className={`forge-nav-item flex-1 md:flex-none ${
                        isActive ? 'forge-nav-item-active' : 'forge-nav-item-inactive'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                          isActive
                            ? 'bg-forge-accent/20 text-forge-accent'
                            : 'bg-forge-bg text-forge-muted'
                        }`}
                      >
                        {tab.icon}
                      </span>
                      <span>{tab.label}</span>
                    </button>
                  </Fragment>
                );
              });
            })()}
          </div>

          {/* 侧边栏底部信息 */}
          <div className="mt-3 hidden border-t border-forge-border pt-3 md:block">
            <div className="rounded-lg bg-forge-bg/60 px-3 py-2.5">
              <p className="text-xs font-medium text-forge-ink">Agent Forge</p>
              <p className="mt-0.5 text-[11px] text-forge-muted">v1.0 · 管理员模式</p>
            </div>
          </div>
        </nav>

        {/* 右侧内容区 */}
        <div className="min-w-0 flex-1 forge-animate-fade-in">
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
    {
      label: '总用户数',
      value: stats.totalUsers,
      color: 'text-forge-accent',
      border: 'border-l-forge-accent',
      iconBg: 'bg-forge-accent/15',
      icon: <Icon path={ICON_PATHS.people} className="h-5 w-5" />,
    },
    {
      label: '总项目数',
      value: stats.totalProjects,
      color: 'text-forge-green',
      border: 'border-l-forge-green',
      iconBg: 'bg-forge-green/15',
      icon: <Icon path={ICON_PATHS.folder} className="h-5 w-5" />,
    },
    {
      label: '总任务数',
      value: stats.totalTasks,
      color: 'text-forge-yellow',
      border: 'border-l-forge-yellow',
      iconBg: 'bg-forge-yellow/15',
      icon: <Icon path={ICON_PATHS.checklist} className="h-5 w-5" />,
    },
    {
      label: '治理报告数',
      value: stats.totalGovernanceReports,
      color: 'text-forge-purple',
      border: 'border-l-forge-purple',
      iconBg: 'bg-forge-purple/15',
      icon: <Icon path={ICON_PATHS.report} className="h-5 w-5" />,
    },
  ];

  const totalForChart = STATUS_ORDER.reduce(
    (sum, s) => sum + (stats.projectsByStatus[s] || 0),
    0
  );

  return (
    <div className="space-y-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className={`forge-card-pro forge-hover-lift relative overflow-hidden border-l-4 ${c.border} p-5`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-forge-muted">{c.label}</p>
                <p className={`mt-2 text-3xl font-bold tabular-nums ${c.color} forge-animate-count`}>
                  {c.value}
                </p>
              </div>
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.iconBg} ${c.color}`}
              >
                {c.icon}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 项目状态分布 */}
      <div className="forge-card-pro p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon path={ICON_PATHS.checklist} className="h-4 w-4 text-forge-accent" />
            <h2 className="text-base font-semibold text-forge-ink">项目状态分布</h2>
          </div>
          <span className="text-xs text-forge-muted">共 {totalForChart} 个项目</span>
        </div>

        {totalForChart === 0 ? (
          <EmptyHint text="暂无项目数据" />
        ) : (
          <div className="space-y-4">
            {/* 条形图 */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-forge-bg ring-1 ring-inset ring-forge-border">
              {STATUS_ORDER.map((s) => {
                const count = stats.projectsByStatus[s] || 0;
                if (count === 0) return null;
                const meta = getStatusMeta(s);
                const pct = (count / totalForChart) * 100;
                return (
                  <div
                    key={s}
                    className={`${meta.bar} h-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                    title={`${meta.label}: ${count}`}
                  />
                );
              })}
            </div>

            {/* 图例 + 迷你进度条 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STATUS_ORDER.map((s) => {
                const count = stats.projectsByStatus[s] || 0;
                const meta = getStatusMeta(s);
                const pct = totalForChart > 0 ? Math.round((count / totalForChart) * 100) : 0;
                return (
                  <div
                    key={s}
                    className="rounded-lg border border-forge-border bg-forge-bg/50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        <span className="text-sm text-forge-ink">{meta.label}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-forge-ink">
                        {count}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="forge-progress flex-1">
                        <div
                          className={`forge-progress-bar ${meta.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-forge-muted">
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 最近项目 */}
      <div className="forge-card-pro overflow-hidden">
        <div className="flex items-center gap-2 border-b border-forge-border px-5 py-4">
          <Icon path={ICON_PATHS.folder} className="h-4 w-4 text-forge-accent" />
          <h2 className="text-base font-semibold text-forge-ink">最近 5 个项目</h2>
        </div>
        {stats.recentProjects.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyHint text="暂无项目" />
          </div>
        ) : (
          <div>
            {stats.recentProjects.map((p) => {
              const meta = getStatusMeta(p.status);
              return (
                <div
                  key={p.id}
                  className="forge-table-row flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}
                    >
                      <Icon path={ICON_PATHS.folder} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-forge-ink">{p.name}</p>
                      <p className="mt-0.5 truncate text-xs text-forge-muted">
                        {p.user.username} · {PROJECT_TYPE_LABEL[p.projectType] || p.projectType} ·{' '}
                        {formatDate(p.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`forge-badge shrink-0 ${meta.bg} ${meta.color} ${meta.ring}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
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
        <div className="flex items-center gap-2">
          <Icon path={ICON_PATHS.projects} className="h-4 w-4 text-forge-accent" />
          <h2 className="text-base font-semibold text-forge-ink">项目管理</h2>
        </div>
        {pagination && (
          <span className="rounded-full border border-forge-border bg-forge-surface px-3 py-1 text-xs text-forge-muted">
            共 {pagination.total} 个项目
          </span>
        )}
      </div>

      {loading ? (
        <LoadingSpinner text="加载项目列表..." />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : projects.length === 0 ? (
        <div className="forge-card-pro py-14">
          <EmptyHint text="暂无项目" />
        </div>
      ) : (
        <>
          {/* 数据表格 */}
          <div className="forge-card-pro overflow-hidden">
            {/* 表头 */}
            <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg/60 px-4 py-3 text-xs font-medium text-forge-muted">
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
                  className="forge-table-row flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-forge-ink">{p.name}</p>
                    {p.repoUrl && (
                      <a
                        href={p.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 truncate text-xs text-forge-accent hover:underline"
                      >
                        <Icon path={ICON_PATHS.link} className="h-3 w-3 shrink-0" />
                        <span className="truncate">{p.repoUrl}</span>
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
                    <span className={`forge-badge ${meta.bg} ${meta.color} ${meta.ring}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
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
                      className="inline-flex items-center gap-1 rounded-md border border-forge-border px-2.5 py-1 text-xs text-forge-muted transition-colors hover:border-forge-red/40 hover:bg-forge-red/10 hover:text-forge-red disabled:opacity-50"
                    >
                      {deletingId === p.id ? (
                        <span className="h-3 w-3 animate-forge-spin rounded-full border border-forge-red/40 border-t-forge-red" />
                      ) : (
                        <>
                          <Icon path={ICON_PATHS.trash} className="h-3 w-3" />
                          删除
                        </>
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
              <span className="rounded-lg border border-forge-border bg-forge-surface px-3 py-1.5 text-sm tabular-nums text-forge-muted">
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

  // AI Provider API Keys
  const [openaiKey, setOpenaiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [mistralKey, setMistralKey] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // 测试状态
  type TestState = {
    testing: boolean;
    success?: boolean;
    message?: string;
  };
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [testAllRunning, setTestAllRunning] = useState(false);

  /** 执行单个配置测试 */
  async function runTest(type: string, provider?: string) {
    const key = provider ? `${type}_${provider}` : type;
    setTestStates((prev) => ({ ...prev, [key]: { testing: true } }));

    try {
      const params = new URLSearchParams({ type });
      if (provider) params.set('provider', provider);
      const res = await fetch(`/api/admin/test?${params.toString()}`);
      const data = await res.json();

      setTestStates((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          success: data.success,
          message: data.message || (data.results ? JSON.stringify(data.results) : '测试完成'),
        },
      }));
    } catch (err) {
      setTestStates((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          success: false,
          message: err instanceof Error ? err.message : '测试失败',
        },
      }));
    }
  }

  /** 测试所有配置 */
  async function runTestAll() {
    setTestAllRunning(true);
    await runTest('all');
    setTestAllRunning(false);
  }

  /** 渲染测试按钮 + 结果 */
  function TestButton({ type, provider, label }: { type: string; provider?: string; label?: string }) {
    const key = provider ? `${type}_${provider}` : type;
    const state = testStates[key];

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => runTest(type, provider)}
          disabled={state?.testing}
          className="inline-flex items-center gap-1.5 rounded-md border border-forge-accent/40 bg-forge-accent/10 px-3 py-1.5 text-xs font-medium text-forge-accent transition-colors hover:bg-forge-accent/20 disabled:opacity-50"
        >
          {state?.testing ? (
            <>
              <span className="h-3 w-3 animate-forge-spin rounded-full border border-forge-accent/30 border-t-forge-accent" />
              测试中...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM4.5 7.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM8 4a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 018 4z" />
              </svg>
              {label || '测试'}
            </>
          )}
        </button>
        {state && !state.testing && state.message && (
          <span className={`text-xs ${state.success ? 'text-forge-green' : 'text-forge-red'}`}>
            {state.success ? '✓ ' : '✗ '}{state.message.substring(0, 80)}
          </span>
        )}
      </div>
    );
  }

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
        // AI Provider keys (show masked in placeholder, leave input empty)
        setOpenaiKey('');
        setDeepseekKey('');
        setAnthropicKey('');
        setMistralKey('');
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
    // AI Provider keys
    if (openaiKey.trim()) settings.AI_PROVIDER_OPENAI_API_KEY = openaiKey.trim();
    if (deepseekKey.trim()) settings.AI_PROVIDER_DEEPSEEK_API_KEY = deepseekKey.trim();
    if (anthropicKey.trim()) settings.AI_PROVIDER_ANTHROPIC_API_KEY = anthropicKey.trim();
    if (mistralKey.trim()) settings.AI_PROVIDER_MISTRAL_API_KEY = mistralKey.trim();

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
        setOpenaiKey('');
        setDeepseekKey('');
        setAnthropicKey('');
        setMistralKey('');
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
      <div className="flex items-center gap-2">
        <Icon path={ICON_PATHS.settings} className="h-4 w-4 text-forge-accent" />
        <h2 className="text-base font-semibold text-forge-ink">系统配置</h2>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-3 py-2.5 text-sm text-forge-red forge-animate-fade-in">
          <Icon path={ICON_PATHS.error} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-forge-green/30 bg-forge-green/10 px-3 py-2.5 text-sm text-forge-green forge-animate-fade-in">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
          <span>{savedMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="forge-card-pro space-y-6 p-5 sm:p-6">
        {/* 测试全部按钮 */}
        <div className="rounded-lg border border-forge-accent/30 bg-forge-accent/5 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon path={ICON_PATHS.checklist} className="h-4 w-4 text-forge-accent" />
              <span className="text-sm text-forge-ink">一键测试所有配置连通性</span>
            </div>
            <button
              type="button"
              onClick={runTestAll}
              disabled={testAllRunning}
              className="inline-flex items-center gap-1.5 rounded-md bg-forge-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-forge-accent/80 disabled:opacity-50"
            >
              {testAllRunning ? (
                <>
                  <span className="h-3 w-3 animate-forge-spin rounded-full border border-white/30 border-t-white" />
                  测试中...
                </>
              ) : (
                '测试全部'
              )}
            </button>
          </div>
          {testStates['all'] && !testStates['all'].testing && testStates['all'].message && (
            <div className={`text-xs ${testStates['all'].success ? 'text-forge-green' : 'text-forge-red'}`}>
              {testStates['all'].success ? '✓ ' : '✗ '}{testStates['all'].message}
            </div>
          )}
        </div>

        {/* 分区：GitHub OAuth */}
        <SectionDivider label="GitHub OAuth 应用" />
        <div className="flex justify-end">
          <TestButton type="github_oauth" label="测试 OAuth" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* GitHub Client ID */}
          <FieldShell
            label="GitHub Client ID"
            hint="GitHub OAuth App 的 Client ID"
          >
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={maskedSettings.GITHUB_CLIENT_ID || '未配置'}
              className="forge-input w-full font-mono text-sm"
            />
          </FieldShell>

          {/* GitHub Client Secret */}
          <FieldShell
            label="GitHub Client Secret"
            hint="留空表示不修改"
          >
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
          </FieldShell>
        </div>

        {/* 分区：GitHub 认证 */}
        <SectionDivider label="GitHub 认证与仓库归属" />
        <div className="flex justify-end">
          <TestButton type="github_token" label="测试 Token" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* GitHub Token */}
          <FieldShell
            label="GitHub Token"
            hint="系统级 Personal Access Token，留空表示不修改"
          >
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
          </FieldShell>

          {/* GitHub Org */}
          <FieldShell
            label="GitHub Org（可选）"
            hint="不填则在登录用户账号下创建仓库"
          >
            <input
              type="text"
              value={githubOrg}
              onChange={(e) => setGithubOrg(e.target.value)}
              placeholder={maskedSettings.GITHUB_ORG || '留空则在用户账号下创建'}
              className="forge-input w-full font-mono text-sm"
            />
          </FieldShell>
        </div>

        {/* 分区：应用配置 */}
        <SectionDivider label="应用配置" />

        {/* App URL */}
        <FieldShell
          label="App URL"
          hint="应用访问地址，用于构建 OAuth 回调与 Webhook 地址"
        >
          <input
            type="text"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder={maskedSettings.APP_URL || 'https://your-app.vercel.app'}
            className="forge-input w-full font-mono text-sm"
          />
        </FieldShell>

        {/* 分区：仓库配置 */}
        <SectionDivider label="Agent Forge 仓库配置" />
        <div className="flex justify-end">
          <TestButton type="forge_repo" label="测试仓库连通" />
        </div>

        <div className="rounded-xl border border-forge-border bg-forge-bg/40 p-4">
          <p className="mb-3 text-xs text-forge-muted">
            存放 GitHub Actions 工作流文件的仓库（即本仓库），所有 workflow 在此仓库上触发
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldShell label="仓库 Owner" compact>
              <input
                type="text"
                value={forgeRepoOwner}
                onChange={(e) => setForgeRepoOwner(e.target.value)}
                placeholder={maskedSettings.FORGE_REPO_OWNER || '如: wang361999'}
                className="forge-input w-full font-mono text-sm"
              />
            </FieldShell>
            <FieldShell label="仓库名" compact>
              <input
                type="text"
                value={forgeRepoName}
                onChange={(e) => setForgeRepoName(e.target.value)}
                placeholder={maskedSettings.FORGE_REPO_NAME || '如: gitd'}
                className="forge-input w-full font-mono text-sm"
              />
            </FieldShell>
          </div>
        </div>

        {/* 分区：AI Provider 配置 */}
        <SectionDivider label="AI Provider 配置" />
        <div className="rounded-xl border border-forge-border bg-forge-bg/40 p-4 space-y-4">
          <p className="text-xs text-forge-muted">
            配置各 AI 提供商的 API Key，留空表示不修改。GitHub Models 使用 GITHUB_TOKEN，无需单独配置。
          </p>

          {/* OpenAI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldShell label="OpenAI API Key" hint="支持 GPT 系列模型" compact>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={
                    maskedSettings.AI_PROVIDER_OPENAI_API_KEY
                      ? `当前: ${maskedSettings.AI_PROVIDER_OPENAI_API_KEY}（留空保持不变）`
                      : '未配置'
                  }
                  className="forge-input w-full font-mono text-sm"
                  autoComplete="new-password"
                />
              </FieldShell>
            </div>
            <div className="flex justify-end">
              <TestButton type="ai_provider" provider="openai" label="测试 OpenAI" />
            </div>
          </div>

          {/* DeepSeek */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldShell label="DeepSeek API Key" hint="性价比高，擅长代码生成" compact>
                <input
                  type="password"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder={
                    maskedSettings.AI_PROVIDER_DEEPSEEK_API_KEY
                      ? `当前: ${maskedSettings.AI_PROVIDER_DEEPSEEK_API_KEY}（留空保持不变）`
                      : '未配置'
                  }
                  className="forge-input w-full font-mono text-sm"
                  autoComplete="new-password"
                />
              </FieldShell>
            </div>
            <div className="flex justify-end">
              <TestButton type="ai_provider" provider="deepseek" label="测试 DeepSeek" />
            </div>
          </div>

          {/* Anthropic */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldShell label="Anthropic API Key" hint="Claude 系列，擅长长文本和代码分析" compact>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder={
                    maskedSettings.AI_PROVIDER_ANTHROPIC_API_KEY
                      ? `当前: ${maskedSettings.AI_PROVIDER_ANTHROPIC_API_KEY}（留空保持不变）`
                      : '未配置'
                  }
                  className="forge-input w-full font-mono text-sm"
                  autoComplete="new-password"
                />
              </FieldShell>
            </div>
            <div className="flex justify-end">
              <TestButton type="ai_provider" provider="anthropic" label="测试 Anthropic" />
            </div>
          </div>

          {/* Mistral */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldShell label="Mistral API Key" hint="开源友好，欧洲部署" compact>
                <input
                  type="password"
                  value={mistralKey}
                  onChange={(e) => setMistralKey(e.target.value)}
                  placeholder={
                    maskedSettings.AI_PROVIDER_MISTRAL_API_KEY
                      ? `当前: ${maskedSettings.AI_PROVIDER_MISTRAL_API_KEY}（留空保持不变）`
                      : '未配置'
                  }
                  className="forge-input w-full font-mono text-sm"
                  autoComplete="new-password"
                />
              </FieldShell>
            </div>
            <div className="flex justify-end">
              <TestButton type="ai_provider" provider="mistral" label="测试 Mistral" />
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex flex-col items-start gap-3 border-t border-forge-border pt-5 sm:flex-row sm:items-center">
          <button type="submit" disabled={saving} className="forge-btn-primary text-sm">
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

      {/* GitHub 仓库 Secrets 提示区域（更醒目） */}
      <div className="forge-card-pro forge-top-bar relative overflow-hidden border-forge-yellow/40 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forge-yellow/15 text-forge-yellow">
            <Icon path={ICON_PATHS.alert} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-forge-ink">
              需要在 GitHub 仓库 Secrets 中配置的项
            </h3>
            <p className="mt-1 text-xs text-forge-muted">
              以下密钥需要在 GitHub 仓库的 Settings → Secrets and variables → Actions 中手动配置，
              供 GitHub Actions 工作流使用：
            </p>
            <ul className="mt-3 space-y-2">
              {[
                { name: 'PAT_TOKEN', desc: '值同上方 GitHub Token' },
                { name: 'GITHUB_TOKEN', desc: '值同上方 GitHub Token' },
                { name: 'WEBHOOK_SECRET', desc: 'Webhook 验证密钥（初始化时已生成）' },
              ].map((item) => (
                <li
                  key={item.name}
                  className="flex items-center gap-2 rounded-lg border border-forge-border bg-forge-bg/60 px-3 py-2"
                >
                  <Icon path={ICON_PATHS.link} className="h-3.5 w-3.5 shrink-0 text-forge-yellow" />
                  <code className="rounded bg-forge-bg px-1.5 py-0.5 font-mono text-xs text-forge-accent">
                    {item.name}
                  </code>
                  <span className="text-xs text-forge-muted">— {item.desc}</span>
                </li>
              ))}
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
        <div className="flex items-center gap-2">
          <Icon path={ICON_PATHS.users} className="h-4 w-4 text-forge-accent" />
          <h2 className="text-base font-semibold text-forge-ink">用户管理</h2>
        </div>
        <span className="rounded-full border border-forge-border bg-forge-surface px-3 py-1 text-xs text-forge-muted">
          共 {users.length} 个用户
        </span>
      </div>

      {users.length === 0 ? (
        <div className="forge-card-pro py-16">
          <EmptyHint text="暂无用户" icon={<Icon path={ICON_PATHS.users} className="h-6 w-6" />} />
        </div>
      ) : (
        <div className="forge-card-pro overflow-hidden">
          {/* 表头 */}
          <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg/60 px-4 py-3 text-xs font-medium text-forge-muted">
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
              className="forge-table-row flex items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatarUrl}
                    alt={u.username}
                    className="h-7 w-7 shrink-0 rounded-full ring-2 ring-forge-border ring-offset-2 ring-offset-forge-surface"
                  />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-forge-accent to-forge-purple text-xs font-medium text-white ring-2 ring-forge-border ring-offset-2 ring-offset-forge-surface">
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
              <div className="w-16 shrink-0 text-right">
                <span className="rounded-md bg-forge-accent/10 px-2 py-0.5 text-xs font-medium tabular-nums text-forge-accent">
                  {u._count.projects}
                </span>
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
    <div className="forge-card-pro flex items-center justify-center gap-3 py-14">
      <span className="h-5 w-5 animate-forge-spin rounded-full border-2 border-forge-border border-t-forge-accent" />
      <span className="text-sm text-forge-muted">{text}</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="forge-card-pro flex items-center gap-3 border-forge-red/30 px-4 py-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forge-red/10 text-forge-red">
        <Icon path={ICON_PATHS.error} className="h-5 w-5" />
      </span>
      <span className="text-sm text-forge-red">{message}</span>
    </div>
  );
}

function EmptyHint({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forge-bg text-forge-muted">
        {icon || <Icon path={ICON_PATHS.inbox} className="h-6 w-6" />}
      </span>
      <p className="text-sm text-forge-muted">{text}</p>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 first:pt-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-forge-accent">
        {label}
      </span>
      <span className="h-px flex-1 bg-forge-border" />
    </div>
  );
}

function FieldShell({
  label,
  hint,
  compact,
  children,
}: {
  label: string;
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className={`block font-medium text-forge-ink ${
          compact ? 'mb-1 text-xs text-forge-muted' : 'mb-1.5 text-sm'
        }`}
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-forge-muted">{hint}</p>}
    </div>
  );
}
