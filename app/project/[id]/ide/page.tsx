'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileEntry[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  dirty: boolean;
}

interface ProjectInfo {
  id: string;
  name: string;
  repoOwner: string | null;
  repoName: string | null;
  repoUrl: string | null;
}

/* ============================================================
   文件树组件
   ============================================================ */

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTreeFromEntries(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: fullPath,
          isDir: isLast ? entry.type === 'dir' : true,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  const sortTree = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root.children;
}

function TreeItem({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  onSelect: (path: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-forge-surface2"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <svg
            className={`h-3.5 w-3.5 flex-shrink-0 text-forge-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
          </svg>
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
          </svg>
          <span className="font-mono text-forge-ink">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path, node.name)}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        activePath === node.path
          ? 'bg-forge-accent/10 text-forge-accent'
          : 'text-forge-muted hover:bg-forge-surface2 hover:text-forge-ink'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
      </svg>
      <span className="font-mono">{node.name}</span>
    </button>
  );
}

/* ============================================================
   获取文件语言 (用于显示)
   ============================================================ */

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    json: 'JSON',
    css: 'CSS',
    html: 'HTML',
    md: 'Markdown',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    yml: 'YAML',
    yaml: 'YAML',
    sh: 'Shell',
  };
  return langMap[ext] || 'Text';
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function IdePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 文件树
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  // 标签页
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);

  // AI 辅助
  const [aiCompleting, setAiCompleting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  /* -------------------- 加载项目信息 -------------------- */
  const loadProject = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects?id=${projectId}`);
      if (!res.ok) {
        throw new Error(`加载项目失败 (${res.status})`);
      }
      const data = await res.json();
      const proj = data.project || data;
      setProject(proj);

      // 加载文件树
      if (proj.repoOwner && proj.repoName) {
        await loadFileTree(proj.repoOwner, proj.repoName);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载项目失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (authChecked && isLoggedIn) {
      loadProject();
    }
  }, [authChecked, isLoggedIn, loadProject]);

  /* -------------------- 加载文件树 -------------------- */
  async function loadFileTree(owner: string, repo: string) {
    setLoadingTree(true);
    try {
      // 通过 GitHub API 获取文件树
      const res = await fetch(`/api/projects?id=${projectId}&action=tree`);
      let entries: FileEntry[] = [];

      if (res.ok) {
        const data = await res.json();
        entries = data.tree || data.files || [];
      }

      // 如果没有获取到文件树，使用演示数据
      if (entries.length === 0) {
        entries = [
          { name: 'app', path: 'app', type: 'dir' },
          { name: 'page.tsx', path: 'app/page.tsx', type: 'file' },
          { name: 'layout.tsx', path: 'app/layout.tsx', type: 'file' },
          { name: 'api', path: 'app/api', type: 'dir' },
          { name: 'auth', path: 'app/api/auth', type: 'dir' },
          { name: 'route.ts', path: 'app/api/auth/route.ts', type: 'file' },
          { name: 'components', path: 'components', type: 'dir' },
          { name: 'Header.tsx', path: 'components/Header.tsx', type: 'file' },
          { name: 'lib', path: 'lib', type: 'dir' },
          { name: 'models.ts', path: 'lib/models.ts', type: 'file' },
          { name: 'package.json', path: 'package.json', type: 'file' },
          { name: 'README.md', path: 'README.md', type: 'file' },
        ];
      }

      setFileTree(buildTreeFromEntries(entries));
    } catch {
      // 忽略错误
    } finally {
      setLoadingTree(false);
    }
  }

  /* -------------------- 选择文件 -------------------- */
  async function handleSelectFile(path: string, name: string) {
    // 如果已打开，切换到该标签
    const existing = openTabs.find((t) => t.path === path);
    if (existing) {
      setActiveTab(path);
      return;
    }

    setLoadingFile(true);
    try {
      // 获取文件内容
      const res = await fetch(`/api/projects?id=${projectId}&action=file&path=${encodeURIComponent(path)}`);
      let content = '';
      if (res.ok) {
        const data = await res.json();
        content = data.content || '';
      }

      const newTab: OpenTab = {
        path,
        name,
        content,
        originalContent: content,
        dirty: false,
      };
      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTab(path);
    } catch {
      // 忽略错误，仍然打开空文件
      const newTab: OpenTab = {
        path,
        name,
        content: '',
        originalContent: '',
        dirty: false,
      };
      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTab(path);
    } finally {
      setLoadingFile(false);
    }
  }

  /* -------------------- 关闭标签页 -------------------- */
  function handleCloseTab(path: string, e: React.MouseEvent) {
    e.stopPropagation();
    const tabIndex = openTabs.findIndex((t) => t.path === path);
    const newTabs = openTabs.filter((t) => t.path !== path);
    setOpenTabs(newTabs);

    if (activeTab === path) {
      if (newTabs.length > 0) {
        const newIndex = Math.min(tabIndex, newTabs.length - 1);
        setActiveTab(newTabs[newIndex].path);
      } else {
        setActiveTab('');
      }
    }
  }

  /* -------------------- 编辑内容 -------------------- */
  function handleContentChange(value: string) {
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTab
          ? { ...tab, content: value, dirty: value !== tab.originalContent }
          : tab
      )
    );
  }

  /* -------------------- AI 补全 -------------------- */
  async function handleAiComplete() {
    const currentTab = openTabs.find((t) => t.path === activeTab);
    if (!currentTab || aiCompleting) return;

    setAiCompleting(true);
    setAiSuggestion('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: `/complete 请基于以下代码内容继续补全:\n\n文件: ${currentTab.path}\n\`\`\`\n${currentTab.content.slice(-2000)}\n\`\`\``,
          model: 'gpt-4o',
        }),
      });

      if (!res.ok) {
        throw new Error('AI 补全请求失败');
      }

      const data = await res.json();
      const suggestion = data.content || data.message || '暂无补全建议';
      setAiSuggestion(suggestion);
    } catch (e) {
      setAiSuggestion(e instanceof Error ? e.message : 'AI 补全失败');
    } finally {
      setAiCompleting(false);
    }
  }

  /* -------------------- 保存文件 -------------------- */
  async function handleSave() {
    const currentTab = openTabs.find((t) => t.path === activeTab);
    if (!currentTab || !currentTab.dirty || saving) return;

    setSaving(true);
    setSaveMessage('');
    try {
      const res = await fetch(`/api/projects?id=${projectId}&action=save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentTab.path,
          content: currentTab.content,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '保存失败');
      }

      // 更新原始内容
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTab
            ? { ...tab, originalContent: tab.content, dirty: false }
            : tab
        )
      );
      setSaveMessage('保存成功');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  /* -------------------- AI 审查跳转 -------------------- */
  function handleAiReview() {
    router.push(`/project/${projectId}/review`);
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

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-8 w-48 animate-forge-pulse rounded bg-forge-border" />
        <div className="forge-card h-[600px] animate-forge-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-12 w-12 text-forge-red" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <p className="mt-4 text-forge-ink">{error}</p>
          <button onClick={loadProject} className="forge-btn-secondary mt-4 text-sm">
            重试
          </button>
        </div>
      </div>
    );
  }

  const currentTab = openTabs.find((t) => t.path === activeTab);
  const hasUnsaved = openTabs.some((t) => t.dirty);

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

      {/* 标题 */}
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
        </svg>
        <h1 className="text-2xl font-bold text-forge-ink">在线代码编辑器</h1>
        {project?.repoUrl && (
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 flex items-center gap-1 text-sm text-forge-accent hover:underline"
          >
            {project.repoOwner}/{project.repoName}
          </a>
        )}
      </div>

      {/* 主布局 */}
      <div className="forge-card flex h-[calc(100vh-240px)] min-h-[500px] flex-col overflow-hidden">
        {/* 顶部: 文件路径 + 未保存标记 */}
        <div className="flex items-center justify-between border-b border-forge-border bg-forge-bg/50 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-forge-muted">
            {currentTab ? (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
                </svg>
                <code className="font-mono text-forge-ink">{currentTab.path}</code>
                {currentTab.dirty && (
                  <span className="h-2 w-2 rounded-full bg-forge-yellow" title="未保存" />
                )}
                <span className="ml-2 rounded-md border border-forge-border bg-forge-surface px-1.5 py-0.5 text-xs text-forge-muted">
                  {getLanguage(currentTab.name)}
                </span>
              </>
            ) : (
              <span>选择一个文件开始编辑</span>
            )}
          </div>
          {hasUnsaved && (
            <span className="flex items-center gap-1.5 text-xs text-forge-yellow">
              <span className="h-1.5 w-1.5 rounded-full bg-forge-yellow animate-forge-pulse" />
              有未保存的更改
            </span>
          )}
        </div>

        {/* 编辑器主体: 左侧文件树 + 右侧编辑区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧: 文件树 */}
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-forge-border bg-forge-bg/30 p-2">
            {loadingTree ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-6 animate-forge-pulse rounded bg-forge-border/50" />
                ))}
              </div>
            ) : fileTree.length > 0 ? (
              fileTree.map((node) => (
                <TreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  activePath={activeTab}
                  onSelect={handleSelectFile}
                />
              ))
            ) : (
              <div className="py-8 text-center text-xs text-forge-muted">
                无法加载文件树
              </div>
            )}
          </div>

          {/* 右侧: 标签页 + 编辑区 */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* 标签页栏 */}
            {openTabs.length > 0 && (
              <div className="flex overflow-x-auto border-b border-forge-border bg-forge-bg/30">
                {openTabs.map((tab) => (
                  <button
                    key={tab.path}
                    type="button"
                    onClick={() => setActiveTab(tab.path)}
                    className={`group flex items-center gap-1.5 border-r border-forge-border px-3 py-2 text-sm transition-colors ${
                      tab.path === activeTab
                        ? 'bg-forge-surface text-forge-ink'
                        : 'text-forge-muted hover:bg-forge-surface/50'
                    }`}
                  >
                    <svg className="h-3 w-3 text-forge-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
                    </svg>
                    <span className="font-mono">{tab.name}</span>
                    {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-forge-yellow" />}
                    <span
                      onClick={(e) => handleCloseTab(tab.path, e)}
                      className="ml-1 rounded p-0.5 text-forge-muted opacity-0 transition-opacity hover:bg-forge-border hover:text-forge-ink group-hover:opacity-100"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 编辑区 */}
            <div className="relative flex-1 overflow-hidden">
              {currentTab ? (
                loadingFile ? (
                  <div className="flex h-full items-center justify-center">
                    <svg className="h-6 w-6 animate-forge-spin text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                    </svg>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={currentTab.content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    spellCheck={false}
                    className="h-full w-full resize-none bg-forge-bg p-4 font-mono text-sm leading-relaxed text-forge-ink focus:outline-none"
                    style={{ tabSize: 2 }}
                    placeholder="// 在此编辑代码..."
                  />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <svg className="h-16 w-16 text-forge-muted/30" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
                  </svg>
                  <p className="mt-4 text-sm text-forge-muted">从左侧文件树选择一个文件开始编辑</p>
                </div>
              )}
            </div>

            {/* AI 建议区 */}
            {aiSuggestion && (
              <div className="max-h-48 overflow-y-auto border-t border-forge-border bg-forge-surface2 p-3 forge-animate-fade-in">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-forge-purple" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
                    </svg>
                    <span className="text-xs font-medium text-forge-purple">AI 补全建议</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiSuggestion('')}
                    className="text-xs text-forge-muted hover:text-forge-ink"
                  >
                    关闭
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-forge-muted">
                  <code className="font-mono">{aiSuggestion}</code>
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* 底部: AI 辅助栏 */}
        <div className="flex items-center justify-between border-t border-forge-border bg-forge-bg/50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAiComplete}
              disabled={!currentTab || aiCompleting}
              className="forge-btn-secondary text-sm"
            >
              {aiCompleting ? (
                <>
                  <svg className="h-4 w-4 animate-forge-spin" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                  </svg>
                  AI 思考中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-forge-purple" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0z" />
                  </svg>
                  AI 补全
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!currentTab?.dirty || saving}
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
                <>
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                  保存
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleAiReview}
              className="forge-btn-accent text-sm"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
              </svg>
              AI 审查
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-forge-muted">
            {saveMessage && (
              <span className={saveMessage.includes('失败') ? 'text-forge-red' : 'text-forge-green'}>
                {saveMessage}
              </span>
            )}
            {currentTab && (
              <span>
                {currentTab.content.split('\n').length} 行 · {currentTab.content.length} 字符
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
