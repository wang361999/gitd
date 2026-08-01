'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface DesignDoc {
  projectName: string;
  summary: string;
  techStack: string[];
  architecture: {
    layers: { name: string; description: string; components: string[] }[];
  };
  fileStructure: FileNode[];
  codingRules: string[];
  dependencies: { name: string; version: string; purpose: string }[];
}

interface FileNode {
  path: string;
  description: string;
  type?: 'file' | 'dir';
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: string;
}

/* ============================================================
   架构分层流程图组件 (SVG)
   ============================================================ */

const LAYER_COLORS = [
  { bg: 'rgba(88, 166, 255, 0.12)', border: '#58a6ff', text: '#58a6ff' },
  { bg: 'rgba(188, 140, 255, 0.12)', border: '#bc8cff', text: '#bc8cff' },
  { bg: 'rgba(63, 185, 80, 0.12)', border: '#3fb950', text: '#3fb950' },
  { bg: 'rgba(210, 153, 34, 0.12)', border: '#d29922', text: '#d29922' },
  { bg: 'rgba(248, 81, 73, 0.12)', border: '#f85149', text: '#f85149' },
];

function ArchitectureFlow({ layers }: { layers: DesignDoc['architecture']['layers'] }) {
  if (!layers || layers.length === 0) return null;

  return (
    <div className="space-y-3">
      {layers.map((layer, index) => {
        const color = LAYER_COLORS[index % LAYER_COLORS.length];
        const isLast = index === layers.length - 1;
        return (
          <div key={layer.name}>
            <div
              className="rounded-xl border p-4 transition-all hover:scale-[1.01]"
              style={{ backgroundColor: color.bg, borderColor: color.border }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                  style={{ backgroundColor: color.border, color: '#fff' }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold" style={{ color: color.text }}>
                    {layer.name}
                  </h4>
                  {layer.description && (
                    <p className="mt-0.5 text-xs text-forge-muted">{layer.description}</p>
                  )}
                </div>
              </div>
              {layer.components && layer.components.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pl-11">
                  {layer.components.map((comp) => (
                    <span
                      key={comp}
                      className="rounded-md border px-2 py-0.5 text-xs font-mono"
                      style={{
                        borderColor: `${color.border}40`,
                        color: color.text,
                        backgroundColor: 'rgba(13, 17, 23, 0.4)',
                      }}
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!isLast && (
              <div className="flex justify-center py-1">
                <svg className="h-6 w-6 text-forge-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5a.75.75 0 01.75.75v8.69l2.97-2.97a.75.75 0 011.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 9.03a.75.75 0 011.06-1.06l2.97 2.97V2.25A.75.75 0 018 1.5z" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   文件结构树形组件 (可展开/折叠)
   ============================================================ */

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  description?: string;
  children: TreeNode[];
}

function buildTree(nodes: FileNode[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };

  for (const node of nodes) {
    const parts = node.path.split('/').filter(Boolean);
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
          isDir: !isLast,
          description: isLast ? node.description : undefined,
          children: [],
        };
        current.children.push(child);
      } else if (isLast) {
        child.description = node.description;
        child.isDir = false;
      }
      current = child;
    }
  }

  // 排序：目录在前，文件在后
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

function FileTreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-forge-surface2"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
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
          <div className="forge-animate-fade-in">
            {node.children.map((child) => (
              <FileTreeItem key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="group flex items-start gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-forge-surface2"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-forge-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
      </svg>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-sm text-forge-ink">{node.name}</span>
        {node.description && (
          <span className="ml-2 text-xs text-forge-muted">{node.description}</span>
        )}
      </div>
    </div>
  );
}

function FileTree({ nodes }: { nodes: FileNode[] }) {
  const tree = buildTree(nodes);
  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function DesignPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [design, setDesign] = useState<DesignDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<'overview' | 'files' | 'rules' | 'deps'>('overview');

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

  /* -------------------- 数据加载 -------------------- */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 获取项目信息
      const projRes = await fetch(`/api/projects?id=${projectId}`);
      if (!projRes.ok) {
        throw new Error(`加载项目失败 (${projRes.status})`);
      }
      const projData = await projRes.json();
      const proj = projData.project || projData;
      setProject(proj);

      // 获取架构设计文档
      const designRes = await fetch(`/api/generate/stream?projectId=${projectId}&action=design`);
      let designDoc: DesignDoc | null = null;

      if (designRes.ok) {
        const contentType = designRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await designRes.json();
          designDoc = data.design || data.architecture || data;
        } else {
          const text = await designRes.text();
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              designDoc = JSON.parse(jsonMatch[0]);
            }
          } catch {
            // 解析失败，使用空设计
          }
        }
      }

      // 如果没有获取到设计文档，构建默认结构
      if (!designDoc) {
        designDoc = {
          projectName: proj.name,
          summary: proj.description,
          techStack: ['Next.js', 'TypeScript', 'Tailwind CSS'],
          architecture: {
            layers: [
              {
                name: '表现层 (Presentation)',
                description: 'UI 组件与页面路由',
                components: ['Pages', 'Components', 'Layouts'],
              },
              {
                name: '业务逻辑层 (Business Logic)',
                description: '核心业务规则与数据处理',
                components: ['Services', 'Hooks', 'Utils'],
              },
              {
                name: '数据访问层 (Data Access)',
                description: '数据库交互与外部 API 调用',
                components: ['API Routes', 'Prisma', 'Fetchers'],
              },
            ],
          },
          fileStructure: [
            { path: 'app/page.tsx', description: '首页' },
            { path: 'app/layout.tsx', description: '根布局' },
            { path: 'app/api', description: 'API 路由目录' },
            { path: 'components', description: '通用组件' },
            { path: 'lib', description: '工具函数库' },
          ],
          codingRules: [
            '使用 TypeScript 严格模式',
            '组件使用函数式声明',
            '遵循 SOLID 设计原则',
            '所有公共函数添加 JSDoc 注释',
          ],
          dependencies: [
            { name: 'next', version: '^14.0.0', purpose: 'React 全栈框架' },
            { name: 'react', version: '^18.0.0', purpose: 'UI 库' },
            { name: 'tailwindcss', version: '^3.4.0', purpose: 'CSS 框架' },
          ],
        };
      }

      setDesign(designDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载架构设计失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (authChecked && isLoggedIn) {
      loadData();
    }
  }, [authChecked, isLoggedIn, loadData]);

  /* -------------------- 加载中 -------------------- */
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="forge-card h-96 animate-forge-pulse" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-8 w-64 animate-forge-pulse rounded bg-forge-border" />
        <div className="forge-card h-32 animate-forge-pulse" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="forge-card h-64 animate-forge-pulse lg:col-span-2" />
          <div className="forge-card h-64 animate-forge-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-12 w-12 text-forge-red" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <p className="mt-4 text-forge-ink">{error}</p>
          <button onClick={loadData} className="forge-btn-secondary mt-4 text-sm">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!design) return null;

  const sections = [
    { key: 'overview' as const, label: '架构概览' },
    { key: 'files' as const, label: '文件结构' },
    { key: 'rules' as const, label: '编码规则' },
    { key: 'deps' as const, label: '依赖列表' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 返回导航 */}
      <Link
        href={project ? `/project/${project.id}` : '/dashboard'}
        className="inline-flex items-center gap-1.5 text-sm text-forge-muted hover:text-forge-ink transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.78 2.03a.75.75 0 01.22 1.06L5.47 6.5h8.78a.75.75 0 010 1.5H5.47l2.53 3.41a.75.75 0 01-1.28.88l-3.5-4.75a.75.75 0 010-.88l3.5-4.75a.75.75 0 011.06-.22z" />
        </svg>
        返回项目
      </Link>

      {/* 项目概述头部 */}
      <div className="forge-card-pro forge-animate-fade-in-up p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
              </svg>
              <h1 className="text-2xl font-bold text-forge-ink">架构设计</h1>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-forge-ink">{design.projectName}</h2>
            {design.summary && (
              <p className="mt-2 text-sm leading-relaxed text-forge-muted">{design.summary}</p>
            )}
          </div>
        </div>

        {/* 技术栈标签 */}
        {design.techStack && design.techStack.length > 0 && (
          <div className="mt-5 border-t border-forge-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-forge-muted">技术栈</p>
            <div className="flex flex-wrap gap-2">
              {design.techStack.map((tech) => (
                <span
                  key={tech}
                  className="forge-badge border-forge-accent/30 bg-forge-accent/10 text-forge-accent"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 区块切换 */}
      <div className="flex flex-wrap gap-1 border-b border-forge-border">
        {sections.map((section) => {
          const active = section.key === activeSection;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveSection(section.key)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-forge-accent text-forge-ink'
                  : 'border-transparent text-forge-muted hover:text-forge-ink'
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      {/* 区块内容 */}
      <div key={activeSection} className="forge-animate-fade-in space-y-6">
        {/* 架构概览 */}
        {activeSection === 'overview' && (
          <div className="forge-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75z" />
              </svg>
              <h3 className="text-base font-semibold text-forge-ink">架构分层流程</h3>
            </div>
            <ArchitectureFlow layers={design.architecture?.layers || []} />
          </div>
        )}

        {/* 文件结构 */}
        {activeSection === 'files' && (
          <div className="forge-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
                </svg>
                <h3 className="text-base font-semibold text-forge-ink">文件结构树</h3>
              </div>
              <span className="text-xs text-forge-muted">
                共 {design.fileStructure?.length || 0} 个文件/目录
              </span>
            </div>
            {design.fileStructure && design.fileStructure.length > 0 ? (
              <div className="max-h-[500px] overflow-y-auto rounded-lg border border-forge-border bg-forge-bg p-2">
                <FileTree nodes={design.fileStructure} />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-forge-muted">暂无文件结构信息</p>
            )}
          </div>
        )}

        {/* 编码规则 */}
        {activeSection === 'rules' && (
          <div className="forge-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M2.5 1.75A1.75 1.75 0 014.25 0h8.5A1.75 1.75 0 0114.5 1.75v12.5A1.75 1.75 0 0112.75 16h-8.5A1.75 1.75 0 012.5 14.25V1.75zm2.75 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM4.5 9.5a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014.5 9.5z" />
              </svg>
              <h3 className="text-base font-semibold text-forge-ink">编码规则</h3>
            </div>
            {design.codingRules && design.codingRules.length > 0 ? (
              <ul className="space-y-2">
                {design.codingRules.map((rule, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-lg border border-forge-border bg-forge-bg p-3"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-forge-green/15 text-xs font-bold text-forge-green">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-forge-ink">{rule}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-forge-muted">暂无编码规则</p>
            )}
          </div>
        )}

        {/* 依赖列表 */}
        {activeSection === 'deps' && (
          <div className="forge-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-forge-border px-5 py-4">
              <svg className="h-4 w-4 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              </svg>
              <h3 className="text-base font-semibold text-forge-ink">依赖列表</h3>
            </div>
            {design.dependencies && design.dependencies.length > 0 ? (
              <div>
                {/* 表头 */}
                <div className="flex items-center gap-3 border-b border-forge-border bg-forge-bg/60 px-4 py-3 text-xs font-medium text-forge-muted">
                  <div className="min-w-0 flex-1">包名</div>
                  <div className="w-32 shrink-0">版本</div>
                  <div className="min-w-0 flex-1">用途</div>
                </div>
                {design.dependencies.map((dep) => (
                  <div
                    key={dep.name}
                    className="forge-table-row flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <code className="font-mono text-forge-accent">{dep.name}</code>
                    </div>
                    <div className="w-32 shrink-0">
                      <span className="rounded-md bg-forge-purple/10 px-2 py-0.5 font-mono text-xs text-forge-purple">
                        {dep.version}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 text-forge-muted">{dep.purpose}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-forge-muted">暂无依赖信息</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
