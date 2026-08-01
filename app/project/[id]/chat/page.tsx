'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt?: string;
  messageCount?: number;
}

/* ============================================================
   常量配置
   ============================================================ */

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o', desc: 'OpenAI 旗舰模型' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini', desc: '快速轻量' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', desc: '深度推理' },
  { value: 'DeepSeek-R1', label: 'DeepSeek R1', desc: '推理增强' },
  { value: 'Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B', desc: '开源大模型' },
  { value: 'Mistral-large', label: 'Mistral Large', desc: '高效均衡' },
];

const QUICK_COMMANDS = [
  { cmd: '/fix', label: '修复', desc: '修复代码中的问题' },
  { cmd: '/test', label: '测试', desc: '生成单元测试' },
  { cmd: '/refactor', label: '重构', desc: '重构优化代码' },
  { cmd: '/explain', label: '解释', desc: '解释代码逻辑' },
  { cmd: '/optimize', label: '优化', desc: '优化性能' },
];

const CONTEXT_FILES_DEMO = [
  'app/page.tsx',
  'app/api/auth/route.ts',
  'components/Header.tsx',
  'lib/models.ts',
  'lib/github.ts',
];

/* ============================================================
   代码块渲染组件
   ============================================================ */

function MessageContent({ content }: { content: string }) {
  // 将消息内容分割为文本和代码块
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          // 代码块
          const lines = part.slice(3, -3);
          const firstNewline = lines.indexOf('\n');
          const lang = firstNewline > -1 ? lines.slice(0, firstNewline).trim() : '';
          const code = firstNewline > -1 ? lines.slice(firstNewline + 1) : lines;

          return (
            <div key={index} className="overflow-hidden rounded-lg border border-forge-border bg-forge-bg">
              {lang && (
                <div className="flex items-center justify-between border-b border-forge-border px-3 py-1.5">
                  <span className="text-xs font-mono text-forge-muted">{lang}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(code)}
                    className="text-xs text-forge-muted hover:text-forge-accent transition-colors"
                  >
                    复制
                  </button>
                </div>
              )}
              <pre className="overflow-x-auto p-3 text-sm">
                <code className="font-mono text-forge-ink">{code}</code>
              </pre>
            </div>
          );
        }
        // 普通文本
        return part.trim() ? (
          <p key={index} className="whitespace-pre-wrap leading-relaxed">{part}</p>
        ) : null;
      })}
    </div>
  );
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function ChatPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState('');

  // 对话列表
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');

  // 消息
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  // 配置
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  /* -------------------- 加载对话列表 -------------------- */
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?projectId=${projectId}&action=conversations`);
      if (res.ok) {
        const data = await res.json();
        const convs = data.conversations || [];
        setConversations(convs);
        if (convs.length > 0 && !activeConversationId) {
          setActiveConversationId(convs[0].id);
        }
      }
    } catch {
      // 忽略错误
    }
  }, [projectId, activeConversationId]);

  useEffect(() => {
    if (authChecked && isLoggedIn) {
      loadConversations();
    }
  }, [authChecked, isLoggedIn, loadConversations]);

  /* -------------------- 加载对话消息 -------------------- */
  const loadMessages = useCallback(async (convId: string) => {
    if (!convId) return;
    try {
      const res = await fetch(`/api/chat?projectId=${projectId}&conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // 忽略错误
    }
  }, [projectId]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages]);

  /* -------------------- 自动滚动到底部 -------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* -------------------- 新建对话 -------------------- */
  function handleNewConversation() {
    setActiveConversationId('');
    setMessages([]);
    setInput('');
  }

  /* -------------------- 发送消息 (流式) -------------------- */
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setStreaming(true);
    setError('');

    // 创建 AbortController
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          projectId,
          conversationId: activeConversationId || undefined,
          message: trimmed,
          model: selectedModel,
          contextFiles,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      // 处理流式响应 (SSE)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const chunk = parsed.content || parsed.delta || '';
                if (chunk) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: m.content + chunk }
                        : m
                    )
                  );
                }
              } catch {
                // 非 JSON，直接作为文本追加
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: m.content + data }
                      : m
                  )
                );
              }
            }
          }
        }
      }

      // 刷新对话列表
      loadConversations();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户取消
      } else {
        setError(e instanceof Error ? e.message : '发送失败');
        // 移除空的 assistant 消息
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantMessage.id || m.content)
        );
      }
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }

  /* -------------------- 停止生成 -------------------- */
  function handleStop() {
    abortControllerRef.current?.abort();
    setStreaming(false);
  }

  /* -------------------- 键盘事件 -------------------- */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  /* -------------------- 快捷指令 -------------------- */
  function handleQuickCommand(cmd: string) {
    setInput((prev) => (prev ? `${prev} ${cmd} ` : `${cmd} `));
  }

  /* -------------------- 加载中 -------------------- */
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="forge-card h-[600px] animate-forge-pulse" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* 返回导航 */}
      <Link
        href={`/project/${projectId}`}
        className="inline-flex items-center gap-1.5 text-sm text-forge-muted hover:text-forge-ink transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.78 2.03a.75.75 0 01.22 1.06L5.47 6.5h8.78a.75.75 0 010 1.5H5.47l2.53 3.41a.75.75 0 01-1.28.88l-3.5-4.75a.75.75 0 010-.88l3.5-4.75a.75.75 0 011.06-.22z" />
        </svg>
        返回项目
      </Link>

      {/* 主布局: 左侧对话列表 + 右侧聊天 */}
      <div className="grid h-[calc(100vh-200px)] min-h-[500px] grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        {/* 左侧: 对话列表 */}
        <div className="forge-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-forge-border p-3">
            <span className="text-sm font-medium text-forge-ink">对话列表</span>
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded-lg border border-forge-border p-1.5 text-forge-accent transition-colors hover:border-forge-accent/50 hover:bg-forge-accent/10"
              title="新建对话"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length > 0 ? (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    conv.id === activeConversationId
                      ? 'bg-forge-accent/10 text-forge-accent'
                      : 'text-forge-muted hover:bg-forge-bg hover:text-forge-ink'
                  }`}
                >
                  <p className="truncate text-sm font-medium">{conv.title}</p>
                  {conv.lastMessage && (
                    <p className="mt-0.5 truncate text-xs text-forge-muted">{conv.lastMessage}</p>
                  )}
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="h-8 w-8 text-forge-muted/50" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M2.8 2.06A1.75 1.75 0 014.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25v-4.5c0-.101.02-.202.06-.295L2.8 2.06z" />
                </svg>
                <p className="mt-2 text-xs text-forge-muted">暂无对话</p>
                <p className="mt-0.5 text-xs text-forge-muted">点击 + 新建对话</p>
              </div>
            )}
          </div>
        </div>

        {/* 右侧: 聊天界面 */}
        <div className="forge-card flex flex-col overflow-hidden">
          {/* 顶部: 模型选择 + 上下文 */}
          <div className="flex items-center gap-3 border-b border-forge-border p-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              </svg>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-sm text-forge-ink focus:border-forge-accent focus:outline-none"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowContextPicker(!showContextPicker)}
              className="flex items-center gap-1.5 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-sm text-forge-muted transition-colors hover:border-forge-accent/50 hover:text-forge-ink"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
              </svg>
              上下文 ({contextFiles.length})
            </button>

            <div className="ml-auto text-xs text-forge-muted">
              {activeConversationId ? '对话进行中' : '新对话'}
            </div>
          </div>

          {/* 上下文文件选择器 */}
          {showContextPicker && (
            <div className="border-b border-forge-border bg-forge-bg/50 p-3 forge-animate-fade-in">
              <p className="mb-2 text-xs text-forge-muted">选择作为上下文的文件:</p>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_FILES_DEMO.map((file) => {
                  const selected = contextFiles.includes(file);
                  return (
                    <button
                      key={file}
                      type="button"
                      onClick={() => {
                        setContextFiles((prev) =>
                          selected ? prev.filter((f) => f !== file) : [...prev, file]
                        );
                      }}
                      className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                        selected
                          ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                          : 'border-forge-border text-forge-muted hover:border-forge-muted'
                      }`}
                    >
                      {file}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forge-accent/10 text-forge-accent">
                  <svg className="h-8 w-8" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v9.5A1.75 1.75 0 0114.25 14H8.061l-2.574 2.573A1.458 1.458 0 013 15.543V14H1.75A1.75 1.75 0 010 12.25v-9.5C0 1.784.784 1 1.75 1z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-forge-ink">AI 对话编程</h3>
                <p className="mt-1 text-sm text-forge-muted">输入消息或使用快捷指令开始对话</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.cmd}
                      type="button"
                      onClick={() => handleQuickCommand(cmd.cmd)}
                      className="rounded-lg border border-forge-border bg-forge-surface px-3 py-1.5 text-sm transition-colors hover:border-forge-accent/50 hover:bg-forge-accent/5"
                    >
                      <span className="font-mono text-forge-accent">{cmd.cmd}</span>
                      <span className="ml-1.5 text-forge-muted">{cmd.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-forge-accent/15 border border-forge-accent/30'
                          : 'bg-forge-surface2 border border-forge-border'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-forge-purple/15 text-forge-purple">
                            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                              <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
                            </svg>
                          </span>
                          <span className="text-xs font-medium text-forge-muted">AI 助手</span>
                        </div>
                      )}
                      {msg.content ? (
                        <MessageContent content={msg.content} />
                      ) : (
                        <div className="flex items-center gap-1.5 py-1">
                          <span className="h-2 w-2 animate-forge-pulse rounded-full bg-forge-accent" />
                          <span className="h-2 w-2 animate-forge-pulse rounded-full bg-forge-accent" style={{ animationDelay: '0.2s' }} />
                          <span className="h-2 w-2 animate-forge-pulse rounded-full bg-forge-accent" style={{ animationDelay: '0.4s' }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-3 py-2 text-xs text-forge-red">
              <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* 快捷指令栏 */}
          <div className="flex flex-wrap gap-1.5 border-t border-forge-border px-3 pt-2">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd.cmd}
                type="button"
                onClick={() => handleQuickCommand(cmd.cmd)}
                className="rounded-md border border-forge-border bg-forge-bg px-2 py-0.5 text-xs transition-colors hover:border-forge-accent/50 hover:text-forge-accent"
                title={cmd.desc}
              >
                {cmd.cmd}
              </button>
            ))}
          </div>

          {/* 底部输入区 */}
          <div className="border-t border-forge-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                className="forge-input flex-1 resize-none text-sm leading-relaxed"
                disabled={streaming}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="forge-btn-secondary flex-shrink-0 text-sm"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M4.75 1.5a1.75 1.75 0 00-1.75 1.75v9.5c0 .966.784 1.75 1.75 1.75h6.5a1.75 1.75 0 001.75-1.75v-9.5a1.75 1.75 0 00-1.75-1.75h-6.5z" />
                  </svg>
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="forge-btn-primary flex-shrink-0 text-sm"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M.989 8L.064 2.68a1.342 1.342 0 011.85-1.462l13.402 5.744a1.13 1.13 0 010 2.076L1.913 14.782a1.343 1.343 0 01-1.85-1.463L.99 8zm.603-5.288L2.38 7.25h4.87a.75.75 0 010 1.5H2.38l-.788 4.538L13.929 8 1.592 2.712z" />
                  </svg>
                  发送
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
