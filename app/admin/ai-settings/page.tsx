'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface Provider {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  apiKey: string;
  testing: boolean;
  testResult: string | null;
}

interface ModelInfo {
  name: string;
  provider: string;
  contextWindow: string;
  cost: string;
}

interface RoutingConfig {
  simple: string;
  moderate: string;
  complex: string;
}

/* ============================================================
   常量配置
   ============================================================ */

const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: 'github-models',
    name: 'GitHub Models',
    description: '通过 GitHub Token 调用，免费额度每天约 150 次',
    configured: false,
    apiKey: '',
    testing: false,
    testResult: null,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o / GPT-4o-mini 等模型',
    configured: false,
    apiKey: '',
    testing: false,
    testResult: null,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V4 Pro / R1 等推理模型',
    configured: false,
    apiKey: '',
    testing: false,
    testResult: null,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet 等模型',
    configured: false,
    apiKey: '',
    testing: false,
    testResult: null,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral Large / Codestral 等模型',
    configured: false,
    apiKey: '',
    testing: false,
    testResult: null,
  },
];

const MODEL_TABLE: ModelInfo[] = [
  { name: 'gpt-4o', provider: 'OpenAI', contextWindow: '128K', cost: '$2.50 / 1M tokens' },
  { name: 'gpt-4o-mini', provider: 'OpenAI', contextWindow: '128K', cost: '$0.15 / 1M tokens' },
  { name: 'deepseek-v4-pro', provider: 'DeepSeek', contextWindow: '64K', cost: '$0.27 / 1M tokens' },
  { name: 'DeepSeek-R1', provider: 'DeepSeek', contextWindow: '64K', cost: '$0.55 / 1M tokens' },
  { name: 'claude-3-5-sonnet', provider: 'Anthropic', contextWindow: '200K', cost: '$3.00 / 1M tokens' },
  { name: 'Mistral-large', provider: 'Mistral', contextWindow: '32K', cost: '$2.00 / 1M tokens' },
  { name: 'Llama-3.1-405B-Instruct', provider: 'GitHub Models', contextWindow: '128K', cost: '免费 (有限额)' },
  { name: 'Phi-4', provider: 'GitHub Models', contextWindow: '16K', cost: '免费 (有限额)' },
];

const ROUTING_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'DeepSeek-R1', label: 'DeepSeek R1' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'Mistral-large', label: 'Mistral Large' },
  { value: 'Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B' },
];

/* ============================================================
   主页面组件
   ============================================================ */

export default function AiSettingsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 登录表单
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Provider 列表
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS);

  // 模型路由
  const [routing, setRouting] = useState<RoutingConfig>({
    simple: 'gpt-4o-mini',
    moderate: 'gpt-4o',
    complex: 'deepseek-v4-pro',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  /* -------------------- 鉴权检查 (管理员) -------------------- */
  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        const res = await fetch('/api/admin?action=status');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setIsAdmin(Boolean(data.isAdmin));
            if (data.isAdmin) {
              loadSettings();
            }
          }
        }
      } catch {
        // 忽略
      } finally {
        if (mounted) {
          setAuthChecked(true);
          setLoading(false);
        }
      }
    }
    checkStatus();
    return () => {
      mounted = false;
    };
  }, []);

  /* -------------------- 加载配置 -------------------- */
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.providers) {
          setProviders((prev) =>
            prev.map((p) => {
              const saved = data.providers.find((sp: Provider) => sp.id === p.id);
              return saved
                ? { ...p, configured: saved.configured, apiKey: '' }
                : p;
            })
          );
        }
        if (data.routing) {
          setRouting(data.routing);
        }
      }
    } catch {
      // 忽略
    } finally {
      setLoading(false);
    }
  }, []);

  /* -------------------- 管理员登录 -------------------- */
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
        setIsAdmin(true);
        setPassword('');
        loadSettings();
      } else {
        setLoginError(data.error || '登录失败');
      }
    } catch {
      setLoginError('网络错误，请重试');
    } finally {
      setLoginLoading(false);
    }
  }

  /* -------------------- 更新 Provider API Key -------------------- */
  function updateProviderKey(id: string, apiKey: string) {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, apiKey } : p))
    );
  }

  /* -------------------- 测试 Provider -------------------- */
  async function handleTestProvider(id: string) {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;

    setProviders((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, testing: true, testResult: null } : p
      )
    );

    try {
      const res = await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', providerId: id, apiKey: provider.apiKey }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, testing: false, testResult: '连接成功', configured: true }
              : p
          )
        );
      } else {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, testing: false, testResult: data.error || '连接失败' }
              : p
          )
        );
      }
    } catch (e) {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, testing: false, testResult: e instanceof Error ? e.message : '网络错误' }
            : p
        )
      );
    }
  }

  /* -------------------- 保存配置 -------------------- */
  async function handleSave() {
    setSaving(true);
    setSaveMessage('');
    setError('');
    try {
      const providerData = providers
        .filter((p) => p.apiKey.trim())
        .map((p) => ({ id: p.id, apiKey: p.apiKey.trim() }));

      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: providerData, routing }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '保存失败');
      }

      setSaveMessage('配置保存成功');
      setProviders((prev) =>
        prev.map((p) => (p.apiKey.trim() ? { ...p, configured: true, apiKey: '' } : p))
      );
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  /* -------------------- 加载中 -------------------- */
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

  /* -------------------- 登录界面 -------------------- */
  if (!isAdmin) {
    return (
      <div className="relative flex min-h-[82vh] items-center justify-center overflow-hidden px-4">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-forge-accent/10 blur-3xl" />
          <div className="absolute -bottom-20 right-1/4 h-72 w-72 rounded-full bg-forge-purple/10 blur-3xl" />
        </div>

        <div className="forge-card-pro forge-glass relative w-full max-w-md p-8 forge-animate-fade-in-up">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-accent to-forge-purple text-2xl font-bold text-white shadow-lg shadow-forge-accent/30">
              A
            </span>
            <h1 className="forge-text-gradient text-xl font-bold">AI Provider 配置</h1>
            <p className="mt-1 text-sm text-forge-muted">需要管理员权限</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-forge-ink">管理员密码</label>
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
              <div className="flex items-start gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-3 py-2.5 text-sm text-forge-red forge-animate-fade-in">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            <button type="submit" disabled={loginLoading || !password} className="forge-btn-accent w-full">
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

          <div className="mt-4">
            <Link href="/admin" className="text-sm text-forge-accent hover:underline">
              返回管理后台
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 主界面 -------------------- */
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-8 w-48 animate-forge-pulse rounded bg-forge-border" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="forge-card h-32 animate-forge-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 返回导航 */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-forge-muted hover:text-forge-ink transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.78 2.03a.75.75 0 01.22 1.06L5.47 6.5h8.78a.75.75 0 010 1.5H5.47l2.53 3.41a.75.75 0 01-1.28.88l-3.5-4.75a.75.75 0 010-.88l3.5-4.75a.75.75 0 011.06-.22z" />
        </svg>
        返回管理后台
      </Link>

      {/* 标题 */}
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 01-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 01-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 01-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 01-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 01-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 010-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 01.704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C5.81.645 6.356.095 7.099.03 7.333.01 7.566 0 7.8 0ZM8 5a3 3 0 100 6 3 3 0 000-6Z" />
        </svg>
        <h1 className="text-2xl font-bold text-forge-ink">AI Provider 配置</h1>
      </div>

      {/* 错误/成功提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {saveMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-forge-green/30 bg-forge-green/10 px-4 py-3 text-sm text-forge-green forge-animate-fade-in">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
          <span>{saveMessage}</span>
        </div>
      )}

      {/* Provider 列表 */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-forge-muted">Provider 列表</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {providers.map((provider) => (
            <div key={provider.id} className="forge-card-pro p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      provider.configured
                        ? 'bg-forge-green/15 text-forge-green'
                        : 'bg-forge-muted/10 text-forge-muted'
                    }`}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-forge-ink">{provider.name}</h3>
                    <p className="mt-0.5 text-xs text-forge-muted">{provider.description}</p>
                  </div>
                </div>
                <span
                  className={`forge-badge border-transparent ${
                    provider.configured
                      ? 'bg-forge-green/10 text-forge-green'
                      : 'bg-forge-muted/10 text-forge-muted'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      provider.configured ? 'bg-forge-green' : 'bg-forge-muted'
                    }`}
                  />
                  {provider.configured ? '已配置' : '未配置'}
                </span>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-forge-muted">API Key</label>
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => updateProviderKey(provider.id, e.target.value)}
                  placeholder={provider.configured ? '已配置 (留空保持不变)' : '输入 API Key'}
                  className="forge-input w-full font-mono text-sm"
                  autoComplete="new-password"
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleTestProvider(provider.id)}
                  disabled={provider.testing || (!provider.apiKey && !provider.configured)}
                  className="forge-btn-secondary text-xs"
                >
                  {provider.testing ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-forge-spin" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                      </svg>
                      测试中...
                    </>
                  ) : (
                    '测试连接'
                  )}
                </button>
                {provider.testResult && (
                  <span
                    className={`text-xs ${
                      provider.testResult === '连接成功' ? 'text-forge-green' : 'text-forge-red'
                    }`}
                  >
                    {provider.testResult}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 模型路由配置 */}
      <div className="forge-card-pro p-5">
        <div className="mb-4 flex items-center gap-2">
          <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75z" />
          </svg>
          <h2 className="text-base font-semibold text-forge-ink">模型路由配置</h2>
        </div>
        <p className="mb-4 text-xs text-forge-muted">
          根据任务复杂度自动选择合适的模型，平衡成本与质量
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {([
            { key: 'simple' as const, label: '简单任务', desc: '格式化、简单查询等', icon: '🟢' },
            { key: 'moderate' as const, label: '中等任务', desc: '代码生成、分析等', icon: '🔵' },
            { key: 'complex' as const, label: '复杂任务', desc: '架构设计、推理等', icon: '🟣' },
          ]).map((item) => (
            <div key={item.key} className="rounded-lg border border-forge-border bg-forge-bg/50 p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-forge-ink">{item.label}</p>
                  <p className="text-xs text-forge-muted">{item.desc}</p>
                </div>
              </div>
              <select
                value={routing[item.key]}
                onChange={(e) => setRouting((prev) => ({ ...prev, [item.key]: e.target.value }))}
                className="forge-input mt-3 w-full text-sm"
              >
                {ROUTING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-forge-muted">
          仅更新已填写 API Key 的 Provider，留空保持不变
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="forge-btn-primary text-sm"
        >
          {saving ? (
            <>
              <svg className="h-4 w-4 animate-forge-spin" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              </svg>
              保存中...
            </>
          ) : (
            '保存配置'
          )}
        </button>
      </div>

      {/* 模型信息表格 */}
      <div className="forge-card-pro overflow-hidden">
        <div className="flex items-center gap-2 border-b border-forge-border px-5 py-4">
          <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75z" />
          </svg>
          <h2 className="text-base font-semibold text-forge-ink">模型信息</h2>
        </div>
        <div>
          {/* 表头 */}
          <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg/60 px-4 py-3 text-xs font-medium text-forge-muted">
            <div className="min-w-0 flex-1">模型名</div>
            <div className="w-32 shrink-0">提供商</div>
            <div className="w-28 shrink-0">上下文窗口</div>
            <div className="min-w-0 flex-1">费用</div>
          </div>
          {MODEL_TABLE.map((model) => (
            <div
              key={model.name}
              className="forge-table-row flex items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <code className="font-mono text-forge-accent">{model.name}</code>
              </div>
              <div className="w-32 shrink-0 text-forge-muted">{model.provider}</div>
              <div className="w-28 shrink-0">
                <span className="rounded-md bg-forge-purple/10 px-2 py-0.5 font-mono text-xs text-forge-purple">
                  {model.contextWindow}
                </span>
              </div>
              <div className="min-w-0 flex-1 text-forge-muted">{model.cost}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
