'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   常量与类型定义
   ============================================================ */
const PROJECT_TYPES = [
  {
    value: 'web',
    label: 'Web 应用',
    description: '网站、Web 应用、API 服务',
    disabled: false,
  },
  {
    value: 'desktop',
    label: '桌面应用',
    description: '即将支持',
    disabled: true,
  },
  {
    value: 'mobile',
    label: '移动应用',
    description: '即将支持',
    disabled: true,
  },
] as const;

type RepoMode = 'existing' | 'create';

// GitHub 仓库名规则：小写字母、数字、连字符，不能以连字符开头或结尾
const REPO_NAME_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const REPO_NAME_MIN = 2;
const REPO_NAME_MAX = 40;

// owner/repo 格式校验
const OWNER_REPO_REGEX = /^[A-Za-z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/* ============================================================
   校验函数
   ============================================================ */

/** 校验项目名称是否符合 GitHub 仓库命名规则 */
function validateProjectName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '请输入项目名称';
  if (trimmed.length < REPO_NAME_MIN)
    return `项目名称至少 ${REPO_NAME_MIN} 个字符`;
  if (trimmed.length > REPO_NAME_MAX)
    return `项目名称不能超过 ${REPO_NAME_MAX} 个字符`;
  if (!REPO_NAME_REGEX.test(trimmed))
    return '只能包含小写字母、数字和连字符，且不能以连字符开头或结尾';
  if (trimmed.includes('--')) return '不能包含连续的连字符';
  return null;
}

/** 校验需求描述 */
function validateDescription(desc: string): string | null {
  const trimmed = desc.trim();
  if (!trimmed) return '请输入项目描述';
  if (trimmed.length < 10) return '项目描述至少需要 10 个字符';
  return null;
}

/** 校验 owner/repo 格式 */
function validateOwnerRepo(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '请输入 owner/repo';
  if (!OWNER_REPO_REGEX.test(trimmed))
    return '格式不正确，应为 owner/repo（例如 my-name/my-repo）';
  return null;
}

/* ============================================================
   主页面组件
   ============================================================ */
export default function NewProjectPage() {
  const router = useRouter();

  // 鉴权状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 表单状态
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState('web');
  const [repoMode, setRepoMode] = useState<RepoMode>('create');
  const [existingRepo, setExistingRepo] = useState('');

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 表单是否已交互过（用于控制是否显示行内错误）
  const [touched, setTouched] = useState({
    name: false,
    desc: false,
    repo: false,
  });

  /* -------------------- 鉴权检查 -------------------- */
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth?action=status');
        const data = await res.json();
        if (!mounted) return;
        if (!data.isLoggedIn) {
          // 未登录，跳转到登录
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
  const nameError = touched.name ? validateProjectName(projectName) : null;
  const descError = touched.desc ? validateDescription(description) : null;
  const repoError =
    repoMode === 'existing' && touched.repo
      ? validateOwnerRepo(existingRepo)
      : null;

  /* -------------------- 提交处理 -------------------- */
  async function handleSubmit() {
    setError('');

    // 强制全量校验
    setTouched({ name: true, desc: true, repo: true });

    const nameErr = validateProjectName(projectName);
    const descErr = validateDescription(description);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    if (descErr) {
      setError(descErr);
      return;
    }

    // 解析 owner/repo
    let repoOwner = '';
    let repoName = '';
    if (repoMode === 'existing') {
      const repoErr = validateOwnerRepo(existingRepo);
      if (repoErr) {
        setError(repoErr);
        return;
      }
      const parts = existingRepo.trim().split('/');
      repoOwner = parts[0];
      repoName = parts[1];
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          projectName: projectName.trim(),
          projectType,
          repoMode,
          repoOwner,
          repoName,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      router.push(`/project/${data.projectId}/build?taskId=${data.taskId}`);
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
    <div className="mx-auto max-w-2xl space-y-6">
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
        <h1 className="text-2xl font-bold text-forge-ink">新建项目</h1>
        <p className="mt-1 text-sm text-forge-muted">
          填写项目信息并选择目标仓库，系统将使用你的 GitHub 账号完成构建。
        </p>
      </div>

      {/* 表单卡片 */}
      <div className="forge-card space-y-6 p-6">
        {/* 项目名称 */}
        <div>
          <label
            htmlFor="projectName"
            className="mb-2 block text-sm font-medium text-forge-ink"
          >
            项目名称
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            placeholder="例如: my-todo-app"
            className={`forge-input w-full font-mono text-sm ${
              nameError
                ? 'border-forge-red/50 focus:border-forge-red'
                : projectName && !validateProjectName(projectName)
                  ? 'border-forge-green/50 focus:border-forge-green'
                  : ''
            }`}
            disabled={submitting}
            maxLength={40}
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            {nameError ? (
              <span className="text-forge-red">{nameError}</span>
            ) : (
              <span className="text-forge-muted">
                将作为 GitHub 仓库名，仅限小写字母、数字和连字符
              </span>
            )}
            <span className="text-forge-muted">
              {projectName.length}/{40}
            </span>
          </div>
        </div>

        {/* 项目描述 */}
        <div>
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-medium text-forge-ink"
          >
            项目描述
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, desc: true }))}
            rows={6}
            placeholder="例如：创建一个待办事项管理应用，支持任务的增删改查、优先级标记、分类管理，并带有深色主题界面..."
            className={`forge-input w-full resize-y font-mono text-sm leading-relaxed ${
              descError
                ? 'border-forge-red/50 focus:border-forge-red'
                : description && !validateDescription(description)
                  ? 'border-forge-green/50 focus:border-forge-green'
                  : ''
            }`}
            disabled={submitting}
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            {descError ? (
              <span className="text-forge-red">{descError}</span>
            ) : (
              <span className="text-forge-muted">
                至少 10 个字符，建议描述尽量详细
              </span>
            )}
            <span className="text-forge-muted">{description.length} 个字符</span>
          </div>
        </div>

        {/* 项目类型 */}
        <div>
          <p className="mb-3 text-sm font-medium text-forge-ink">项目类型</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PROJECT_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                disabled={type.disabled || submitting}
                onClick={() => setProjectType(type.value)}
                className={`relative rounded-lg border p-4 text-left transition-all ${
                  projectType === type.value
                    ? 'border-forge-accent bg-forge-accent/5'
                    : 'border-forge-border bg-forge-bg hover:border-forge-muted'
                } ${
                  type.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-forge-ink">
                    {type.label}
                  </span>
                  {projectType === type.value && (
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
                <p className="mt-1 text-xs text-forge-muted">
                  {type.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 仓库模式选择 */}
        <div>
          <p className="mb-3 text-sm font-medium text-forge-ink">目标仓库</p>
          <div className="space-y-3">
            {/* 创建新仓库 */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setRepoMode('create')}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                repoMode === 'create'
                  ? 'border-forge-accent bg-forge-accent/5'
                  : 'border-forge-border bg-forge-bg hover:border-forge-muted'
              } ${submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                  repoMode === 'create'
                    ? 'border-forge-accent'
                    : 'border-forge-border'
                }`}
              >
                {repoMode === 'create' && (
                  <span className="h-2 w-2 rounded-full bg-forge-accent" />
                )}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-forge-ink">
                    创建新仓库
                  </span>
                  <span className="rounded bg-forge-green/15 px-1.5 py-0.5 text-xs text-forge-green">
                    推荐
                  </span>
                </div>
                <p className="mt-1 text-xs text-forge-muted">
                  使用你的 GitHub 账号自动创建一个新的私有仓库，项目名称将作为仓库名。
                </p>
              </div>
            </button>

            {/* 使用已有仓库 */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setRepoMode('existing')}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                repoMode === 'existing'
                  ? 'border-forge-accent bg-forge-accent/5'
                  : 'border-forge-border bg-forge-bg hover:border-forge-muted'
              } ${submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                  repoMode === 'existing'
                    ? 'border-forge-accent'
                    : 'border-forge-border'
                }`}
              >
                {repoMode === 'existing' && (
                  <span className="h-2 w-2 rounded-full bg-forge-accent" />
                )}
              </span>
              <div className="flex-1">
                <span className="text-sm font-medium text-forge-ink">
                  使用已有仓库
                </span>
                <p className="mt-1 text-xs text-forge-muted">
                  选择一个你拥有 push 权限的现有 GitHub 仓库，代码将提交到该仓库。
                </p>
              </div>
            </button>
          </div>

          {/* 已有仓库输入框 */}
          {repoMode === 'existing' && (
            <div className="mt-3">
              <label
                htmlFor="existingRepo"
                className="mb-1.5 block text-sm font-medium text-forge-ink"
              >
                仓库地址（owner/repo）
              </label>
              <input
                id="existingRepo"
                type="text"
                value={existingRepo}
                onChange={(e) => setExistingRepo(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, repo: true }))}
                placeholder="例如: octocat/my-repo"
                className={`forge-input w-full font-mono text-sm ${
                  repoError
                    ? 'border-forge-red/50 focus:border-forge-red'
                    : existingRepo && !validateOwnerRepo(existingRepo)
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
          )}
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
              正在提交...
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7.5 1a6.5 6.5 0 104.472 11.197l3.416 3.415a.75.75 0 001.06-1.06l-3.415-3.416A6.5 6.5 0 007.5 1zM2.5 7.5a5 5 0 1110 0 5 5 0 01-10 0z" />
              </svg>
              生成项目
            </>
          )}
        </button>
      </div>
    </div>
  );
}
