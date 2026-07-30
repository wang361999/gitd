'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* ============================================================
   类型定义
   ============================================================ */
interface SetupStatus {
  configured: boolean;
  appUrl: string;
  steps: { key: string; label: string; configured: boolean }[];
}

interface SaveResult {
  success: boolean;
  settings: Record<string, string>;
  oauthCallbackUrl: string;
  webhookUrl: string;
  githubUser?: { login: string; name?: string | null };
  oauthApp?: { valid: boolean; name?: string; message?: string } | null;
  generatedSecrets?: { SESSION_SECRET: string; WEBHOOK_SECRET: string };
  actionsSecrets: Record<string, string>;
}

/* ============================================================
   工具函数
   ============================================================ */

/** 客户端生成随机密钥（与 lib/settings.ts 中 generateSecret 算法一致） */
function generateSecretClient(length = 48): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/** 脱敏：保留前 prefix 位与后 4 位 */
function mask(value: string, prefix = 4): string {
  if (!value) return '';
  if (value.length <= prefix + 4) return '•'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, prefix)}${'•'.repeat(8)}${value.slice(-4)}`;
}

const STEPS = [
  { key: 1, label: 'GitHub OAuth App', desc: '配置 OAuth 应用' },
  { key: 2, label: 'GitHub Token', desc: '配置访问令牌' },
  { key: 3, label: '确认并保存', desc: '检查并保存配置' },
];

/* ============================================================
   小组件：可复制的密钥行
   ============================================================ */
function SecretRow({
  name,
  value,
  hint,
  maskable = true,
}: {
  name: string;
  value: string;
  hint?: string;
  maskable?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const display = maskable && !revealed ? mask(value) : value;

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <div className="rounded-md border border-forge-border bg-forge-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-sm font-semibold text-forge-accent">
          {name}
        </code>
        <div className="flex items-center gap-1.5">
          {maskable && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="forge-btn-secondary px-2 py-1 text-xs"
            >
              {revealed ? '隐藏' : '显示'}
            </button>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="forge-btn-secondary px-2 py-1 text-xs"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
      <div className="mt-2 break-all font-mono text-sm text-forge-ink">
        {display}
      </div>
      {hint && <p className="mt-1.5 text-xs text-forge-muted">{hint}</p>}
    </div>
  );
}

/* ============================================================
   小组件：可复制文本行（非密钥）
   ============================================================ */
function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <div className="rounded-md border border-forge-border bg-forge-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-forge-muted">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="forge-btn-secondary px-2 py-1 text-xs"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div
        className={`mt-1.5 break-all text-sm text-forge-ink ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   主页面
   ============================================================ */
export default function SetupPage() {
  const router = useRouter();

  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [reconfigure, setReconfigure] = useState(false);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  // 表单状态
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubOrg, setGithubOrg] = useState('');

  // 客户端预生成的密钥（在进入第 3 步时生成，随 POST 一并提交）
  const [previewSessionSecret, setPreviewSessionSecret] = useState('');
  const [previewWebhookSecret, setPreviewWebhookSecret] = useState('');

  /* -------------------- 加载配置状态 -------------------- */
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch('/api/setup');
        if (res.ok) {
          const data = await res.json();
          if (mounted) setStatus(data);
        }
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoadingStatus(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  /* -------------------- 进入第 3 步时预生成密钥 -------------------- */
  useEffect(() => {
    if (step === 3 && !previewSessionSecret) {
      setPreviewSessionSecret(generateSecretClient(48));
      setPreviewWebhookSecret(generateSecretClient(48));
    }
  }, [step, previewSessionSecret]);

  const appUrl = status?.appUrl || '';
  const oauthCallbackUrl = useMemo(
    () => `${appUrl}/api/auth?action=callback`,
    [appUrl]
  );

  const step1Valid = Boolean(githubClientId.trim() && githubClientSecret.trim());
  const step2Valid = Boolean(githubToken.trim());

  /* -------------------- 提交保存 -------------------- */
  async function handleSave() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubClientId: githubClientId.trim(),
          githubClientSecret: githubClientSecret.trim(),
          githubToken: githubToken.trim(),
          githubOrg: githubOrg.trim(),
          appUrl,
          sessionSecret: previewSessionSecret,
          webhookSecret: previewWebhookSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存失败，请稍后重试');
      }
      setResult(data as SaveResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------- 加载中 -------------------- */
  if (loadingStatus) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="forge-animate-pulse text-forge-muted">
          正在检查配置状态...
        </div>
      </div>
    );
  }

  /* -------------------- 已配置 -------------------- */
  if (status?.configured && !reconfigure && !result) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="forge-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forge-green/15 text-forge-green">
            <svg
              className="h-6 w-6"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-forge-ink">系统已配置</h1>
          <p className="mt-2 text-forge-muted">
            Agent Forge 已完成初始化配置，可以直接使用。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="forge-btn-primary">
              进入首页
            </Link>
            <button
              type="button"
              onClick={() => {
                setReconfigure(true);
                setStep(1);
              }}
              className="forge-btn-secondary"
            >
              重新配置
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 保存成功 -------------------- */
  if (result) {
    const token = githubToken.trim();
    const sessionSecret =
      result.generatedSecrets?.SESSION_SECRET || previewSessionSecret;
    const webhookSecret =
      result.generatedSecrets?.WEBHOOK_SECRET || previewWebhookSecret;

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {/* 成功头部 */}
        <div className="forge-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forge-green/15 text-forge-green">
            <svg
              className="h-6 w-6"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-forge-ink">配置保存成功</h1>
          <p className="mt-2 text-forge-muted">
            所有配置已安全存储到数据库。请将下方密钥配置到 GitHub 仓库 Secrets
            中，即可开始使用 Agent Forge。
          </p>
          {result.githubUser && (
            <p className="mt-2 text-sm text-forge-muted">
              已验证 GitHub 账号：
              <span className="font-mono text-forge-accent">
                @{result.githubUser.login}
              </span>
              {result.oauthApp?.valid && result.oauthApp?.name
                ? ` · OAuth App「${result.oauthApp.name}」校验通过`
                : result.oauthApp?.message
                  ? ` · ${result.oauthApp.message}`
                  : ''}
            </p>
          )}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="forge-btn-primary"
            >
              进入 Agent Forge
            </button>
          </div>
        </div>

        {/* 回调地址 */}
        <div className="forge-card p-6">
          <h2 className="mb-3 text-sm font-semibold text-forge-ink">
            回调地址
          </h2>
          <div className="space-y-2">
            <CopyField label="OAuth 回调 URL" value={result.oauthCallbackUrl} />
            <CopyField label="Webhook 回调 URL" value={result.webhookUrl} />
          </div>
        </div>

        {/* 需在 GitHub 仓库 Secrets 中配置 */}
        <div className="forge-card p-6">
          <h2 className="mb-1 text-sm font-semibold text-forge-ink">
            需在 GitHub 仓库 Secrets 中手动配置
          </h2>
          <p className="mb-3 text-xs text-forge-muted">
            前往仓库 <span className="font-mono">Settings → Secrets and
            variables → Actions → New repository secret</span> 添加以下条目。
          </p>
          <div className="space-y-2">
            <SecretRow
              name="PAT_TOKEN"
              value={token}
              hint="用于 Actions 中调用 GitHub API，值同上方填写的 Personal Access Token"
            />
            <SecretRow
              name="GITHUB_TOKEN"
              value={token}
              hint="系统级令牌，值同 PAT_TOKEN"
            />
            <SecretRow
              name="WEBHOOK_SECRET"
              value={webhookSecret}
              hint="用于验证 Webhook 回调，值同下方生成的 Webhook 密钥"
            />
          </div>
        </div>

        {/* 自动生成的密钥（系统内部使用） */}
        <div className="forge-card p-6">
          <h2 className="mb-1 text-sm font-semibold text-forge-ink">
            自动生成的密钥（系统内部使用）
          </h2>
          <p className="mb-3 text-xs text-forge-muted">
            以下密钥已自动保存到数据库，无需手动配置。
          </p>
          <div className="space-y-2">
            <SecretRow name="SESSION_SECRET" value={sessionSecret} />
            <SecretRow name="WEBHOOK_SECRET" value={webhookSecret} />
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     配置向导主体
     ============================================================ */
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* 标题区域 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-forge-ink">
          Agent Forge 初始化配置
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-forge-muted">
          只需一次配置即可完成部署，所有配置将安全存储在数据库中。部署到 Vercel
          后 Neon 数据库已自动连接，无需额外环境变量。
        </p>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-center justify-center">
        {STEPS.map((s, i) => {
          const done = step > s.key;
          const active = step === s.key;
          return (
            <div key={s.key} className="flex items-center">
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
                  active
                    ? 'border-forge-accent bg-forge-accent/10'
                    : done
                      ? 'border-forge-green/50 bg-forge-green/10'
                      : 'border-forge-border bg-forge-surface'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? 'bg-forge-green text-white'
                      : active
                        ? 'bg-forge-accent text-white'
                        : 'bg-forge-border text-forge-muted'
                  }`}
                >
                  {done ? (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                    </svg>
                  ) : (
                    s.key
                  )}
                </span>
                <span
                  className={`text-sm ${
                    active || done ? 'text-forge-ink' : 'text-forge-muted'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-px w-6 sm:w-10 ${
                    done ? 'bg-forge-green' : 'bg-forge-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="rounded-md border border-forge-red/40 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 步骤内容 */}
      <div className="forge-card p-6">
        {/* ---------------- Step 1: GitHub OAuth App ---------------- */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-forge-ink">
                Step 1 · GitHub OAuth App 配置
              </h2>
              <p className="mt-1 text-sm text-forge-muted">
                用于支持用户使用 GitHub 账号登录 Agent Forge。
              </p>
            </div>

            {/* 创建说明 */}
            <div className="rounded-md border border-forge-border bg-forge-bg p-4 text-sm">
              <p className="font-medium text-forge-ink">如何创建 OAuth App：</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-forge-muted">
                <li>
                  前往{' '}
                  <a
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-forge-accent hover:underline"
                  >
                    GitHub Developer settings
                  </a>
                </li>
                <li>点击 New OAuth App</li>
                <li>
                  填写应用名称与主页 URL，将下方的回调 URL 粘贴到
                  Authorization callback URL
                </li>
                <li>创建后复制 Client ID，并生成 Client Secret</li>
              </ol>
            </div>

            {/* 自动显示回调 URL */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-forge-ink">
                Authorization callback URL
              </label>
              <CopyField label="回调 URL（自动检测）" value={oauthCallbackUrl} />
              {!appUrl && (
                <p className="mt-1.5 text-xs text-forge-yellow">
                  未能自动检测到应用 URL，部署到 Vercel 后会自动识别。
                </p>
              )}
            </div>

            {/* 输入框 */}
            <div>
              <label
                htmlFor="clientId"
                className="mb-1.5 block text-sm font-medium text-forge-ink"
              >
                Client ID <span className="text-forge-red">*</span>
              </label>
              <input
                id="clientId"
                type="text"
                value={githubClientId}
                onChange={(e) => setGithubClientId(e.target.value)}
                placeholder="例如 Iv1.abcdef1234567890"
                className="forge-input w-full"
                autoComplete="off"
              />
            </div>

            <div>
              <label
                htmlFor="clientSecret"
                className="mb-1.5 block text-sm font-medium text-forge-ink"
              >
                Client Secret <span className="text-forge-red">*</span>
              </label>
              <input
                id="clientSecret"
                type="password"
                value={githubClientSecret}
                onChange={(e) => setGithubClientSecret(e.target.value)}
                placeholder="生成 Client Secret 后粘贴到此处"
                className="forge-input w-full"
                autoComplete="off"
              />
            </div>

            {/* 导航按钮 */}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!step1Valid}
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                className="forge-btn-primary"
              >
                下一步
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 2: GitHub Token ---------------- */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-forge-ink">
                Step 2 · GitHub Token 配置
              </h2>
              <p className="mt-1 text-sm text-forge-muted">
                系统级 Personal Access Token，用于创建仓库、触发 Actions 与发布
                Release。
              </p>
            </div>

            {/* 创建说明 */}
            <div className="rounded-md border border-forge-border bg-forge-bg p-4 text-sm">
              <p className="font-medium text-forge-ink">
                如何创建 Personal Access Token：
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-forge-muted">
                <li>
                  前往{' '}
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-forge-accent hover:underline"
                  >
                    创建 Token (classic)
                  </a>
                </li>
                <li>勾选下方所需权限</li>
                <li>生成后立即复制（页面关闭后无法再次查看）</li>
              </ol>
            </div>

            {/* 所需权限 */}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-forge-ink">
                所需权限
              </span>
              <div className="flex flex-wrap gap-2">
                {['repo', 'workflow'].map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1 font-mono text-xs text-forge-accent"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-forge-green" />
                    {p}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-forge-muted">
                其中 repo 用于读写仓库，workflow 用于触发 GitHub Actions。
              </p>
            </div>

            {/* Token 输入 */}
            <div>
              <label
                htmlFor="pat"
                className="mb-1.5 block text-sm font-medium text-forge-ink"
              >
                Personal Access Token <span className="text-forge-red">*</span>
              </label>
              <input
                id="pat"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="例如 ghp_xxxxxxxxxxxxxxxxxxxx"
                className="forge-input w-full"
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs text-forge-muted">
                保存时会自动调用 GitHub API 验证该 Token 是否有效。
              </p>
            </div>

            {/* 组织名 */}
            <div>
              <label
                htmlFor="org"
                className="mb-1.5 block text-sm font-medium text-forge-ink"
              >
                组织名（可选）
              </label>
              <input
                id="org"
                type="text"
                value={githubOrg}
                onChange={(e) => setGithubOrg(e.target.value)}
                placeholder="留空则将仓库创建在你的用户账号下"
                className="forge-input w-full"
                autoComplete="off"
              />
            </div>

            {/* 导航按钮 */}
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="forge-btn-secondary"
              >
                上一步
              </button>
              <button
                type="button"
                disabled={!step2Valid}
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
                className="forge-btn-primary"
              >
                下一步
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ---------------- Step 3: 确认并保存 ---------------- */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-forge-ink">
                Step 3 · 确认并保存
              </h2>
              <p className="mt-1 text-sm text-forge-muted">
                请核对以下配置，确认无误后保存。安全密钥将由系统自动生成。
              </p>
            </div>

            {/* 配置摘要（脱敏） */}
            <div>
              <span className="mb-2 block text-sm font-medium text-forge-ink">
                配置摘要
              </span>
              <div className="space-y-1.5 rounded-md border border-forge-border bg-forge-bg p-3 font-mono text-xs">
                <SummaryRow
                  label="GITHUB_CLIENT_ID"
                  value={githubClientId || '—'}
                />
                <SummaryRow
                  label="GITHUB_CLIENT_SECRET"
                  value={mask(githubClientSecret)}
                />
                <SummaryRow
                  label="GITHUB_TOKEN"
                  value={mask(githubToken)}
                />
                <SummaryRow
                  label="GITHUB_ORG"
                  value={githubOrg || '（用户账号下）'}
                  mono={false}
                />
                <SummaryRow label="APP_URL" value={appUrl || '—'} />
              </div>
            </div>

            {/* 自动生成的密钥 */}
            <div>
              <span className="mb-2 block text-sm font-medium text-forge-ink">
                自动生成的密钥
              </span>
              <p className="mb-2 text-xs text-forge-muted">
                以下密钥将在保存时写入数据库（此处为预览，与最终保存值一致）：
              </p>
              <div className="space-y-2">
                <SecretRow
                  name="SESSION_SECRET"
                  value={previewSessionSecret}
                  hint="用于加密用户会话"
                />
                <SecretRow
                  name="WEBHOOK_SECRET"
                  value={previewWebhookSecret}
                  hint="用于验证 GitHub Webhook 回调"
                />
              </div>
            </div>

            {/* 需在 GitHub 仓库 Secrets 配置的项 */}
            <div>
              <span className="mb-1 block text-sm font-medium text-forge-ink">
                需在 GitHub 仓库 Secrets 中手动配置
              </span>
              <p className="mb-2 text-xs text-forge-muted">
                保存成功后，请在仓库 Settings → Secrets → Actions 中添加以下条目。
              </p>
              <div className="space-y-2">
                <SecretRow
                  name="PAT_TOKEN"
                  value={githubToken}
                  hint="值同上方的 Personal Access Token"
                />
                <SecretRow
                  name="WEBHOOK_SECRET"
                  value={previewWebhookSecret}
                  hint="值同上方生成的 Webhook 密钥"
                />
                <SecretRow
                  name="GITHUB_TOKEN"
                  value={githubToken}
                  hint="系统级令牌，值同 PAT_TOKEN"
                />
              </div>
            </div>

            {/* 导航按钮 */}
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="forge-btn-secondary"
                disabled={submitting}
              >
                上一步
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="forge-btn-primary"
              >
                {submitting ? (
                  <>
                    <svg
                      className="h-4 w-4 forge-animate-spin"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 1.5a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0V1.5z" />
                    </svg>
                    正在保存并验证...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    保存配置
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   小组件：摘要行
   ============================================================ */
function SummaryRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-forge-muted">{label}</span>
      <span
        className={`break-all text-right text-forge-ink ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
