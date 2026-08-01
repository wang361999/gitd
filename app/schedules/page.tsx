'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/* ============================================================
   常量与类型
   ============================================================ */

type Frequency = 'daily' | 'weekly' | 'monthly';

interface Schedule {
  id: string;
  repoOwner: string;
  repoName: string;
  frequency: Frequency;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// owner/repo 格式校验
const OWNER_REPO_REGEX = /^[A-Za-z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

const FREQUENCY_OPTIONS: {
  value: Frequency;
  label: string;
  desc: string;
}[] = [
  { value: 'daily', label: '每天', desc: '每 24 小时执行一次' },
  { value: 'weekly', label: '每周', desc: '每 7 天执行一次' },
  { value: 'monthly', label: '每月', desc: '每 30 天执行一次' },
];

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

const FREQUENCY_STYLE: Record<Frequency, string> = {
  daily: 'border-forge-accent/30 bg-forge-accent/10 text-forge-accent',
  weekly: 'border-forge-purple/30 bg-forge-purple/10 text-forge-purple',
  monthly: 'border-forge-yellow/30 bg-forge-yellow/10 text-forge-yellow',
};

/* ============================================================
   辅助函数
   ============================================================ */

/** 校验 owner/repo 格式 */
function validateOwnerRepo(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入 owner/repo';
  if (!OWNER_REPO_REGEX.test(trimmed))
    return '格式不正确，应为 owner/repo（例如 my-name/my-repo）';
  return null;
}

/** 格式化日期时间 */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ============================================================
   主页面组件
   ============================================================ */
export default function SchedulesPage() {
  // 鉴权状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 创建表单状态
  const [repo, setRepo] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // 计划列表状态
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* -------------------- 鉴权检查 -------------------- */
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth?action=status');
        const data = await res.json();
        if (!mounted) return;
        if (!data.isLoggedIn) {
          window.location.href = '/api/auth?action=login';
          return;
        }
        setIsLoggedIn(true);
        // 登录成功后加载计划列表
        loadSchedules(false);
      } catch {
        if (mounted) {
          window.location.href = '/api/auth?action=login';
        }
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }
    checkAuth();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------- 加载计划列表 -------------------- */
  const loadSchedules = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setListError('');

    try {
      const res = await fetch('/api/schedules');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '加载计划列表失败');
      }
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : '网络错误，请稍后重试');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  /* -------------------- 派生校验状态 -------------------- */
  const repoError = touched ? validateOwnerRepo(repo) : null;

  /* -------------------- 创建计划 -------------------- */
  async function handleCreate() {
    setCreateError('');
    setTouched(true);

    const err = validateOwnerRepo(repo);
    if (err) {
      setCreateError(err);
      return;
    }

    const parts = repo.trim().split('/');
    const repoOwner = parts[0];
    const repoName = parts[1];

    setCreating(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoOwner, repoName, frequency }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      // 创建成功，重置表单并刷新列表
      setRepo('');
      setTouched(false);
      setFrequency('daily');
      await loadSchedules(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败，请稍后重试');
    } finally {
      setCreating(false);
    }
  }

  /* -------------------- 切换启用状态 -------------------- */
  async function handleToggle(schedule: Schedule) {
    setTogglingId(schedule.id);
    // 乐观更新
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === schedule.id ? { ...s, enabled: !s.enabled } : s
      )
    );

    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '更新失败');
      }
    } catch (e) {
      // 回滚
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id ? { ...s, enabled: schedule.enabled } : s
        )
      );
      setListError(e instanceof Error ? e.message : '更新失败，请稍后重试');
    } finally {
      setTogglingId(null);
    }
  }

  /* -------------------- 删除计划 -------------------- */
  async function handleDelete(schedule: Schedule) {
    if (
      !window.confirm(
        `确定要删除计划「${schedule.repoOwner}/${schedule.repoName}」吗？此操作不可撤销。`
      )
    ) {
      return;
    }

    setDeletingId(schedule.id);
    try {
      const res = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }

      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
    } catch (e) {
      setListError(e instanceof Error ? e.message : '删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
    }
  }

  /* -------------------- 加载中 / 未登录 -------------------- */
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="forge-card h-96 animate-forge-pulse" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  /* -------------------- 主页面 -------------------- */
  return (
    <div className="mx-auto max-w-4xl space-y-6 forge-animate-fade-in">
      {/* 返回导航 */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-forge-muted hover:text-forge-ink transition-colors"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7.78 2.03a.75.75 0 01.22 1.06L5.47 6.5h8.78a.75.75 0 010 1.5H5.47l2.53 3.41a.75.75 0 01-1.28.88l-3.5-4.75a.75.75 0 010-.88l3.5-4.75a.75.75 0 011.06-.22z" />
        </svg>
        返回仪表盘
      </Link>

      {/* 页面标题 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-forge-ink">定时治理</h1>
          <p className="mt-1 text-sm text-forge-muted">
            配置自动治理计划，系统将定期对指定仓库执行治理审查
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadSchedules(true)}
          disabled={refreshing}
          className="forge-btn-secondary text-sm disabled:opacity-50"
          title="刷新计划列表"
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
      </div>

      {/* 创建新计划卡片 */}
      <div className="forge-card space-y-5 p-6">
        <h2 className="text-base font-semibold text-forge-ink">创建新计划</h2>

        {/* 仓库地址 */}
        <div>
          <label
            htmlFor="scheduleRepo"
            className="mb-2 block text-sm font-medium text-forge-ink"
          >
            仓库地址
          </label>
          <input
            id="scheduleRepo"
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="例如: octocat/my-repo"
            className={`forge-input w-full font-mono text-sm ${
              repoError
                ? 'border-forge-red/50 focus:border-forge-red'
                : repo && !validateOwnerRepo(repo)
                  ? 'border-forge-green/50 focus:border-forge-green'
                  : ''
            }`}
            disabled={creating}
          />
          <div className="mt-1 text-xs">
            {repoError ? (
              <span className="text-forge-red">{repoError}</span>
            ) : (
              <span className="text-forge-muted">
                输入 owner/repo 格式，需确保你的 GitHub 账号对该仓库有 push 权限
              </span>
            )}
          </div>
        </div>

        {/* 频率选择 */}
        <div>
          <p className="mb-3 text-sm font-medium text-forge-ink">执行频率</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={creating}
                onClick={() => setFrequency(opt.value)}
                className={`relative rounded-lg border p-4 text-left transition-all ${
                  frequency === opt.value
                    ? 'border-forge-accent bg-forge-accent/5'
                    : 'border-forge-border bg-forge-bg hover:border-forge-muted'
                } ${creating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-forge-ink">
                    {opt.label}
                  </span>
                  {frequency === opt.value && (
                    <svg
                      className="h-4 w-4 text-forge-accent"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                    </svg>
                  )}
                </div>
                <p className="mt-1 text-xs text-forge-muted">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 创建错误提示 */}
        {createError && (
          <div className="flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            <span>{createError}</span>
          </div>
        )}

        {/* 创建按钮 */}
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="forge-btn-primary w-full sm:w-auto"
        >
          {creating ? (
            <>
              <svg
                className="h-5 w-5 animate-forge-spin"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
              </svg>
              创建中...
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
              </svg>
              创建计划
            </>
          )}
        </button>
      </div>

      {/* 已有计划列表 */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-forge-ink">已有计划</h2>
          {schedules.length > 0 && (
            <span className="text-sm text-forge-muted">
              共 {schedules.length} 个计划
            </span>
          )}
        </div>

        {/* 列表错误提示 */}
        {listError && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            <span>{listError}</span>
          </div>
        )}

        {/* 加载态 */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="forge-card h-28 animate-forge-pulse p-5"
              />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          /* 空状态 */
          <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
            <svg
              className="h-12 w-12 text-forge-muted"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.546l3.04 1.755a.75.75 0 01-.75 1.299l-3.415-1.972A.75.75 0 017.25 8V3.75A.75.75 0 018 3z" />
            </svg>
            <p className="mt-4 text-forge-ink">还没有定时治理计划</p>
            <p className="mt-1 text-sm text-forge-muted">
              在上方创建一个计划，系统将定期自动执行治理审查
            </p>
          </div>
        ) : (
          /* 计划列表 */
          <div className="space-y-3">
            {schedules.map((schedule) => {
              const isToggling = togglingId === schedule.id;
              const isDeleting = deletingId === schedule.id;
              return (
                <div
                  key={schedule.id}
                  className="forge-card p-5 transition-all hover:border-forge-muted"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* 仓库信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <svg
                          className="h-4 w-4 text-forge-muted"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                        </svg>
                        <span className="font-mono text-sm font-medium text-forge-ink">
                          {schedule.repoOwner}/{schedule.repoName}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            FREQUENCY_STYLE[schedule.frequency]
                          }`}
                        >
                          {FREQUENCY_LABEL[schedule.frequency]}
                        </span>
                        {!schedule.enabled && (
                          <span className="inline-flex items-center rounded-full border border-forge-border bg-forge-bg px-2 py-0.5 text-xs text-forge-muted">
                            已暂停
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-forge-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.546l3.04 1.755a.75.75 0 01-.75 1.299l-3.415-1.972A.75.75 0 017.25 8V3.75A.75.75 0 018 3z" />
                          </svg>
                          上次运行：{formatDateTime(schedule.lastRunAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                            <path d="M8 3a.75.75 0 01.75.75v3.546l3.04 1.755a.75.75 0 01-.75 1.299l-3.415-1.972A.75.75 0 017.25 8V3.75A.75.75 0 018 3z" />
                          </svg>
                          下次运行：{formatDateTime(schedule.nextRunAt)}
                        </span>
                      </div>
                    </div>

                    {/* 操作区 */}
                    <div className="flex flex-shrink-0 items-center gap-3">
                      {/* 状态开关 */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={schedule.enabled}
                        onClick={() => handleToggle(schedule)}
                        disabled={isToggling}
                        title={schedule.enabled ? '点击暂停' : '点击启用'}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          schedule.enabled
                            ? 'bg-forge-green'
                            : 'bg-forge-border'
                        }`}
                      >
                        {isToggling ? (
                          <svg
                            className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 animate-forge-spin text-forge-ink"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                            <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
                          </svg>
                        ) : (
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              schedule.enabled
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        )}
                      </button>

                      {/* 删除按钮 */}
                      <button
                        type="button"
                        onClick={() => handleDelete(schedule)}
                        disabled={isDeleting}
                        title="删除计划"
                        className="rounded-lg border border-forge-border bg-forge-bg p-1.5 text-forge-muted transition-all hover:border-forge-red/50 hover:text-forge-red disabled:opacity-50"
                      >
                        {isDeleting ? (
                          <svg
                            className="h-4 w-4 animate-forge-spin"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                            <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
                          </svg>
                        ) : (
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 00.249.225h5.19a.25.25 0 00.249-.225l.66-6.6a.75.75 0 011.492.149l-.66 6.6A1.75 1.75 0 0110.595 15h-5.19a1.75 1.75 0 01-1.741-1.575l-.66-6.6a.75.75 0 011.492-.15z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
