'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  model: string;
  knowledge: KnowledgeEntry[];
  createdAt?: string;
}

/* ============================================================
   常量配置
   ============================================================ */

const AVAILABLE_TOOLS = [
  { id: 'code-search', label: '代码搜索' },
  { id: 'file-read', label: '文件读取' },
  { id: 'file-write', label: '文件写入' },
  { id: 'web-fetch', label: '网络请求' },
  { id: 'git-ops', label: 'Git 操作' },
  { id: 'test-runner', label: '测试运行' },
  { id: 'terminal', label: '终端命令' },
  { id: 'review', label: '代码审查' },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { value: 'DeepSeek-R1', label: 'DeepSeek R1' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'Mistral-large', label: 'Mistral Large' },
];

const DEMO_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: '代码审查专家',
    description: '专注于代码质量、安全性和最佳实践的审查',
    systemPrompt: '你是一个资深代码审查专家。请从功能正确性、代码质量、安全性、性能和可维护性五个维度审查代码，给出具体的问题和修复建议。',
    tools: ['code-search', 'file-read', 'review'],
    model: 'gpt-4o',
    knowledge: [
      {
        id: 'k1',
        question: '如何检查 SQL 注入漏洞？',
        answer: '检查所有数据库查询是否使用了参数化查询或 ORM 的预编译语句，避免直接拼接 SQL 字符串。',
      },
    ],
  },
  {
    id: 'agent-2',
    name: '测试工程师',
    description: '生成单元测试和集成测试用例',
    systemPrompt: '你是一个测试工程师。请根据代码逻辑生成全面的单元测试，覆盖正常路径、边界条件和异常场景，使用 Jest 或 Vitest 框架。',
    tools: ['code-search', 'file-read', 'file-write', 'test-runner'],
    model: 'deepseek-v4-pro',
    knowledge: [],
  },
];

/* ============================================================
   Agent 表单组件
   ============================================================ */

interface AgentFormProps {
  agent: Agent | null;
  onSave: (agent: Agent) => void;
  onCancel: () => void;
}

function AgentForm({ agent, onSave, onCancel }: AgentFormProps) {
  const [name, setName] = useState(agent?.name || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
  const [tools, setTools] = useState<string[]>(agent?.tools || []);
  const [model, setModel] = useState(agent?.model || 'gpt-4o');
  const [error, setError] = useState('');

  function toggleTool(toolId: string) {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError('请输入 Agent 名称');
      return;
    }
    if (!description.trim()) {
      setError('请输入 Agent 描述');
      return;
    }
    if (!systemPrompt.trim()) {
      setError('请输入系统提示词');
      return;
    }

    onSave({
      id: agent?.id || `agent-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      tools,
      model,
      knowledge: agent?.knowledge || [],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 forge-animate-fade-in" onClick={onCancel}>
      <div
        className="forge-card-pro max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-forge-ink">
            {agent ? '编辑 Agent' : '创建 Agent'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-forge-muted transition-colors hover:bg-forge-bg hover:text-forge-ink"
          >
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-forge-ink">Agent 名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 代码审查专家"
              className="forge-input w-full"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-forge-ink">描述</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述 Agent 的用途"
              className="forge-input w-full"
            />
          </div>

          {/* 系统提示词 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-forge-ink">系统提示词 (System Prompt)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="定义 Agent 的角色、行为和约束..."
              className="forge-input w-full resize-y font-mono text-sm"
            />
          </div>

          {/* 工具选择 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-forge-ink">可用工具</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const selected = tools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                        : 'border-forge-border text-forge-muted hover:border-forge-muted'
                    }`}
                  >
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-forge-ink">使用模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="forge-input w-full"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-3 py-2.5 text-sm text-forge-red">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 border-t border-forge-border pt-4">
            <button type="button" onClick={onCancel} className="forge-btn-secondary text-sm">
              取消
            </button>
            <button type="button" onClick={handleSubmit} className="forge-btn-primary text-sm">
              {agent ? '保存修改' : '创建 Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   知识库管理组件
   ============================================================ */

function KnowledgePanel({
  agent,
  onUpdate,
}: {
  agent: Agent;
  onUpdate: (agent: Agent) => void;
}) {
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [expanded, setExpanded] = useState(false);

  function addEntry() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    const entry: KnowledgeEntry = {
      id: `k-${Date.now()}`,
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
    };
    onUpdate({ ...agent, knowledge: [...agent.knowledge, entry] });
    setNewQuestion('');
    setNewAnswer('');
  }

  function removeEntry(id: string) {
    onUpdate({ ...agent, knowledge: agent.knowledge.filter((k) => k.id !== id) });
  }

  return (
    <div className="border-t border-forge-border pt-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm text-forge-muted hover:text-forge-ink transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="h-4 w-4 text-forge-purple" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75z" />
          </svg>
          知识库 ({agent.knowledge.length})
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 forge-animate-fade-in">
          {/* 已有知识条目 */}
          {agent.knowledge.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-forge-border bg-forge-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-forge-ink">Q: {entry.question}</p>
                  <p className="mt-1 text-sm text-forge-muted">A: {entry.answer}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="flex-shrink-0 rounded p-1 text-forge-muted transition-colors hover:bg-forge-red/10 hover:text-forge-red"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* 添加新条目 */}
          <div className="rounded-lg border border-forge-border bg-forge-bg p-3">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="问题"
              className="forge-input mb-2 w-full text-sm"
            />
            <textarea
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              rows={2}
              placeholder="答案"
              className="forge-input w-full resize-y text-sm"
            />
            <button
              type="button"
              onClick={addEntry}
              disabled={!newQuestion.trim() || !newAnswer.trim()}
              className="forge-btn-secondary mt-2 text-xs"
            >
              + 添加知识条目
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function AgentsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  /* -------------------- 鉴权检查 -------------------- */
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
              loadAgents();
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

  /* -------------------- 加载 Agent 列表 -------------------- */
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      } else {
        setAgents(DEMO_AGENTS);
      }
    } catch {
      setAgents(DEMO_AGENTS);
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
        loadAgents();
      } else {
        setLoginError(data.error || '登录失败');
      }
    } catch {
      setLoginError('网络错误，请重试');
    } finally {
      setLoginLoading(false);
    }
  }

  /* -------------------- 保存 Agent -------------------- */
  async function handleSaveAgent(agent: Agent) {
    try {
      const isEditing = agents.some((a) => a.id === agent.id);
      const res = await fetch('/api/agents', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      });

      if (!res.ok) {
        throw new Error('保存失败');
      }

      if (isEditing) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
      } else {
        setAgents((prev) => [...prev, agent]);
      }
      setShowForm(false);
      setEditingAgent(null);
    } catch {
      // 即使 API 失败也本地更新
      const isEditing = agents.some((a) => a.id === agent.id);
      if (isEditing) {
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
      } else {
        setAgents((prev) => [...prev, agent]);
      }
      setShowForm(false);
      setEditingAgent(null);
    }
  }

  /* -------------------- 删除 Agent -------------------- */
  async function handleDeleteAgent(id: string) {
    if (!window.confirm('确定要删除这个 Agent 吗？')) return;
    try {
      await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
    } catch {
      // 忽略
    }
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  /* -------------------- 更新 Agent (知识库) -------------------- */
  function handleUpdateAgent(updated: Agent) {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    // 异步保存
    fetch('/api/agents', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {
      // 忽略
    });
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
          <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-forge-purple/10 blur-3xl" />
        </div>

        <div className="forge-card-pro forge-glass relative w-full max-w-md p-8 forge-animate-fade-in-up">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-purple to-forge-accent text-2xl font-bold text-white shadow-lg shadow-forge-purple/30">
              A
            </span>
            <h1 className="forge-text-gradient text-xl font-bold">Agent 管理</h1>
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
          {[1, 2].map((i) => (
            <div key={i} className="forge-card h-48 animate-forge-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 返回导航 + 标题 */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-forge-muted hover:text-forge-ink transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M7.78 2.03a.75.75 0 01.22 1.06L5.47 6.5h8.78a.75.75 0 010 1.5H5.47l2.53 3.41a.75.75 0 01-1.28.88l-3.5-4.75a.75.75 0 010-.88l3.5-4.75a.75.75 0 011.06-.22z" />
          </svg>
          返回管理后台
        </Link>
        <button
          type="button"
          onClick={() => {
            setEditingAgent(null);
            setShowForm(true);
          }}
          className="forge-btn-primary text-sm"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
          </svg>
          创建 Agent
        </button>
      </div>

      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-forge-purple" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
        </svg>
        <h1 className="text-2xl font-bold text-forge-ink">自定义 Agent 管理</h1>
        <span className="ml-2 rounded-full border border-forge-border bg-forge-surface px-2.5 py-0.5 text-xs text-forge-muted">
          {agents.length} 个 Agent
        </span>
      </div>

      {/* Agent 列表 */}
      {agents.length === 0 ? (
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-12 w-12 text-forge-muted/50" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
          </svg>
          <p className="mt-4 text-sm text-forge-muted">暂无自定义 Agent</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="forge-btn-primary mt-4 text-sm"
          >
            创建第一个 Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <div key={agent.id} className="forge-card-pro p-5">
              {/* Agent 头部 */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-forge-purple/20 to-forge-accent/10 text-forge-purple">
                    <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-forge-ink">{agent.name}</h3>
                    <p className="mt-0.5 text-xs text-forge-muted">{agent.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAgent(agent);
                      setShowForm(true);
                    }}
                    className="rounded-md border border-forge-border p-1.5 text-forge-muted transition-colors hover:border-forge-accent/50 hover:text-forge-accent"
                    title="编辑"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.082-.286.235-.547.445-.758l8.61-8.61z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAgent(agent.id)}
                    className="rounded-md border border-forge-border p-1.5 text-forge-muted transition-colors hover:border-forge-red/50 hover:bg-forge-red/10 hover:text-forge-red"
                    title="删除"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 工具标签 */}
              {agent.tools.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agent.tools.map((toolId) => {
                    const tool = AVAILABLE_TOOLS.find((t) => t.id === toolId);
                    return (
                      <span
                        key={toolId}
                        className="forge-badge border-forge-accent/30 bg-forge-accent/10 text-forge-accent"
                      >
                        {tool?.label || toolId}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* 模型 */}
              <div className="mt-3 flex items-center gap-2 text-xs text-forge-muted">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
                </svg>
                <span>模型: <span className="font-mono text-forge-ink">{agent.model}</span></span>
              </div>

              {/* 知识库 */}
              <KnowledgePanel agent={agent} onUpdate={handleUpdateAgent} />
            </div>
          ))}
        </div>
      )}

      {/* 创建/编辑表单弹窗 */}
      {showForm && (
        <AgentForm
          agent={editingAgent}
          onSave={handleSaveAgent}
          onCancel={() => {
            setShowForm(false);
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
}
