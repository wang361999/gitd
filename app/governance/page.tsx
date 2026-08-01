'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   常量与校验
   ============================================================ */

// owner/repo 格式校验
const OWNER_REPO_REGEX = /^[A-Za-z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/** 校验 owner/repo 格式 */
function validateOwnerRepo(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入 owner/repo';
  if (!OWNER_REPO_REGEX.test(trimmed))
    return '格式不正确，应为 owner/repo（例如 my-name/my-repo）';
  return null;
}

/* 治理模块定义 */
const GOVERNANCE_MODULES = [
  {
    name: '溯源扫描',
    description: '追踪代码来源与模型信息',
    color: 'text-forge-purple',
    dot: 'bg-forge-purple',
  },
  {
    name: '安全检查',
    description: '识别潜在风险与安全问题',
    color: 'text-forge-red',
    dot: 'bg-forge-red',
  },
  {
    name: '决策提取',
    description: '提取关键设计决策记录',
    color: 'text-forge-yellow',
    dot: 'bg-forge-yellow',
  },
  {
    name: '报告生成',
    description: '汇总生成完整治理报告',
    color: 'text-forge-accent',
    dot: 'bg-forge-accent',
  },
] as const;

/* ============================================================
   主页面组件
   ============================================================ */
export default function GovernancePage() {
  const router = useRouter();

  // 鉴权状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 表单状态
  const [repo, setRepo] = useState('');
  const [touched, setTouched] = useState(false);

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
  }, []);

  /* -------------------- 派生校验状态 -------------------- */
  const repoError = touched ? validateOwnerRepo(repo) : null;

  /* -------------------- 提交处理 -------------------- */
  async function handleSubmit() {
    setError('');
    setTouched(true);

    const err = validateOwnerRepo(repo);
    if (err) {
      setError(err);
      return;
    }

    const parts = repo.trim().split('/');
    const repoOwner = parts[0];
    const repoName = parts[1];

    setSubmitting(true);
    try {
      const res = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoOwner, repoName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      router.push(`/project/${data.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试');
      setSubmitting(false);
    }
  }

  /* -------------------- 加载中 / 未登录 -------------------- */
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="forge-card h-96 animate-forge-pulse" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  /* -------------------- 主表单 -------------------- */
  return (
    <div className="mx-auto max-w-2xl space-y-6 forge-animate-fade-in">
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
      <div>
        <h1 className="text-2xl font-bold text-forge-ink">治理已有仓库</h1>
        <p className="mt-1 text-sm text-forge-muted">
          选择你拥有 push 权限的 GitHub 仓库，系统将执行完整的治理审查流程
        </p>
      </div>

      {/* 表单卡片 */}
      <div className="forge-card space-y-6 p-6">
        {/* 仓库地址 */}
        <div>
          <label
            htmlFor="repo"
            className="mb-2 block text-sm font-medium text-forge-ink"
          >
            仓库地址
          </label>
          <input
            id="repo"
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
            disabled={submitting}
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

        {/* 治理说明信息块 */}
        <div className="rounded-lg border border-forge-purple/30 bg-forge-purple/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-forge-purple">
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0114.25 13H8.06l-2.573 2.573A1.458 1.458 0 013 14.543V13H1.75A1.75 1.75 0 010 11.25v-9.5zm1.75-.25a.25.25 0 00-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h6.5a.25.25 0 00.25-.25v-9.5a.25.25 0 00-.25-.25H1.75z" />
              <path d="M8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zM8 10a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            治理将执行以下模块
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GOVERNANCE_MODULES.map((m) => (
              <div
                key={m.name}
                className="flex items-start gap-2.5 rounded-md border border-forge-border bg-forge-bg/50 p-3"
              >
                <span
                  className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${m.dot}`}
                />
                <div>
                  <p className={`text-sm font-medium ${m.color}`}>{m.name}</p>
                  <p className="mt-0.5 text-xs text-forge-muted">
                    {m.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="forge-btn-primary w-full text-base"
        >
          {submitting ? (
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
              正在治理...
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
              </svg>
              开始治理
            </>
          )}
        </button>
      </div>
    </div>
  );
}
