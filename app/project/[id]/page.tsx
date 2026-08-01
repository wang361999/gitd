'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ResultDisplay from '@/components/ResultDisplay';
import DownloadPanel from '@/components/build/DownloadPanel';
import InstallGuide from '@/components/build/InstallGuide';
import GovernanceReport from '@/components/governance/GovernanceReport';
import ProvenanceView from '@/components/governance/ProvenanceView';
import SecurityView from '@/components/governance/SecurityView';
import LoreTimeline from '@/components/governance/LoreTimeline';

interface VersionInfo {
  id: string;
  versionTag: string;
  releaseUrl: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: string;
  repoUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  versions?: VersionInfo[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  draft: { label: '草稿', color: 'text-forge-muted', dot: 'bg-forge-muted' },
  building: {
    label: '构建中',
    color: 'text-forge-yellow',
    dot: 'bg-forge-yellow animate-forge-pulse',
  },
  governing: {
    label: '治理审核',
    color: 'text-forge-purple',
    dot: 'bg-forge-purple animate-forge-pulse',
  },
  packaging: {
    label: '打包中',
    color: 'text-forge-accent',
    dot: 'bg-forge-accent animate-forge-pulse',
  },
  done: { label: '已完成', color: 'text-forge-green', dot: 'bg-forge-green' },
  failed: { label: '失败', color: 'text-forge-red', dot: 'bg-forge-red' },
};

const TYPE_LABELS: Record<string, string> = {
  web: 'Web 应用',
  desktop: '桌面应用',
  mobile: '移动应用',
  'governance-only': '独立治理',
  upload: '上传治理',
};

type TabKey = 'overview' | 'download' | 'report' | 'provenance' | 'security' | 'lore';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects?id=${projectId}`);
      if (!res.ok) {
        if (res.status === 401) {
          setError('请先登录');
        } else if (res.status === 404) {
          setError('项目不存在');
        } else {
          setError(`加载失败 (${res.status})`);
        }
        return;
      }
      const data = await res.json();
      setProject(data.project || data);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // 构建中状态自动轮询（每 5 秒刷新）
  useEffect(() => {
    if (!project) return;
    const isBuilding = ['building', 'governing', 'packaging'].includes(
      project.status
    );
    if (!isBuilding) return;

    const interval = setInterval(() => {
      loadProject();
    }, 5000);

    return () => clearInterval(interval);
  }, [project?.status, loadProject]);

  // 重试失败的项目
  async function handleRetry() {
    if (!project || retrying) return;
    setRetrying(true);
    setError('');

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          action: 'retry',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `重试失败 (${res.status})`);
      }

      const data = await res.json();
      // 跳转到构建进度页面
      router.push(`/project/${project.id}/build?taskId=${data.taskId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败');
      setRetrying(false);
    }
  }

  // 删除项目
  async function handleDelete() {
    if (!project || deleting) return;
    if (!window.confirm(`确定要删除项目「${project.name}」吗？此操作不可撤销。`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/projects?id=${project.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `删除失败 (${res.status})`);
      }

      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
      setDeleting(false);
    }
  }

  // 加载中
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-48 animate-forge-pulse rounded bg-forge-border" />
        <div className="forge-card h-64 animate-forge-pulse" />
        <div className="forge-card h-48 animate-forge-pulse" />
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg
            className="h-12 w-12 text-forge-red"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <p className="mt-4 text-forge-ink">{error}</p>
          <Link href="/dashboard" className="forge-btn-secondary mt-4 text-sm">
            返回仪表盘
          </Link>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const status = STATUS_MAP[project.status] || STATUS_MAP.draft;
  const isBuilding = ['building', 'governing', 'packaging'].includes(
    project.status
  );
  // 仅当项目状态为 done 时才显示治理相关 Tab
  const showGovernance = project.status === 'done';
  // 治理专用项目不显示下载 Tab
  const isGovernanceOnly =
    project.projectType === 'governance-only' ||
    project.projectType === 'upload';

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'overview', label: '概览', show: true },
    { key: 'download', label: '下载安装', show: showGovernance && !isGovernanceOnly },
    { key: 'report', label: '治理报告', show: showGovernance },
    { key: 'provenance', label: '代码溯源', show: showGovernance },
    { key: 'security', label: '安全审计', show: showGovernance },
    { key: 'lore', label: '决策记录', show: showGovernance },
  ];
  const visibleTabs = tabs.filter((t) => t.show);

  // 若当前 Tab 因状态变化被隐藏，回退到概览
  const currentTab: TabKey = visibleTabs.some((t) => t.key === activeTab)
    ? activeTab
    : 'overview';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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

      {/* 项目信息卡 */}
      <div className="forge-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-forge-ink">
              {project.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-forge-muted">
              {project.description}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border border-forge-border px-3 py-1.5 text-sm ${status.color}`}
            >
              <span className={`h-2 w-2 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="删除项目"
              className="rounded-lg border border-forge-border p-2 text-forge-muted transition-colors hover:border-forge-red/50 hover:text-forge-red"
            >
              {deleting ? (
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

        {/* 元信息 */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-forge-border pt-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-forge-muted">项目类型</p>
            <p className="mt-1 text-forge-ink">
              {TYPE_LABELS[project.projectType] || project.projectType}
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">创建时间</p>
            <p className="mt-1 text-forge-ink">
              {formatDateTime(project.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">更新时间</p>
            <p className="mt-1 text-forge-ink">
              {formatDateTime(project.updatedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">项目 ID</p>
            <p className="mt-1 font-mono text-xs text-forge-ink">
              {project.id}
            </p>
          </div>
        </div>
      </div>

      {/* 构建中提示 */}
      {isBuilding && (
        <div className="forge-card flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-forge-spin text-forge-yellow"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
            </svg>
            <span className="text-sm text-forge-ink">
              {project.projectType === 'governance-only' || project.projectType === 'upload'
                ? '治理审查进行中，请稍候...'
                : '项目正在构建中...'}
            </span>
          </div>
          {project.projectType !== 'governance-only' && project.projectType !== 'upload' && (
            <Link
              href={`/project/${project.id}/build`}
              className="forge-btn-accent text-sm"
            >
              查看进度
            </Link>
          )}
        </div>
      )}

      {/* 失败重试 */}
      {project.status === 'failed' && (
        <div className="forge-card border-forge-red/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 text-forge-red"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <span className="text-sm text-forge-red">
                项目构建失败
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/project/${project.id}/build`}
                className="forge-btn-secondary text-sm"
              >
                查看详情
              </Link>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="forge-btn-accent text-sm"
              >
                {retrying ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-forge-spin"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                      <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
                    </svg>
                    重试中...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M1.705 8.005a.75.75 0 01.834.656 5.5 5.5 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.002 7.002 0 011.05 8.84a.75.75 0 01.656-.834zM8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.002 7.002 0 0114.95 7.16a.75.75 0 01-1.49.178A5.5 5.5 0 008 2.5z" />
                    </svg>
                    重试构建
                  </>
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-xs text-forge-red">{error}</p>
          )}
        </div>
      )}

      {/* Tab 栏 */}
      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-forge-border">
          {visibleTabs.map((tab) => {
            const active = tab.key === currentTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-forge-accent text-forge-ink'
                    : 'border-transparent text-forge-muted hover:text-forge-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab 内容 */}
      <div key={currentTab} className="forge-animate-fade-in">
        {currentTab === 'overview' && (
          <div className="space-y-6">
            {/* 结果展示 */}
            {project.status === 'done' && (
              <ResultDisplay
                repoUrl={project.repoUrl}
                previewUrl={project.previewUrl}
                downloadUrl={project.downloadUrl}
                projectId={project.id}
              />
            )}

            {/* 仓库信息（构建中也可查看已有仓库） */}
            {project.repoUrl && project.status !== 'done' && (
              <div className="forge-card p-6">
                <h3 className="mb-3 text-sm font-medium text-forge-ink">
                  仓库信息
                </h3>
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-forge-border bg-forge-bg p-4 transition-all hover:border-forge-accent/50"
                >
                  <svg
                    className="h-6 w-6 flex-shrink-0 text-forge-accent"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-forge-ink group-hover:text-forge-accent">
                      {project.repoOwner}/{project.repoName}
                    </p>
                    <p className="truncate text-xs text-forge-muted">
                      {project.repoUrl}
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-forge-muted"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}

        {currentTab === 'download' && (
          <div className="space-y-6">
            <DownloadPanel
              projectId={project.id}
              projectType={project.projectType}
              repoOwner={project.repoOwner}
              repoName={project.repoName}
              downloadUrl={project.downloadUrl}
            />
            <InstallGuide
              projectId={project.id}
              projectType={project.projectType}
              repoUrl={project.repoUrl}
            />
          </div>
        )}

        {currentTab === 'report' && <GovernanceReport projectId={projectId} />}

        {currentTab === 'provenance' && (
          <ProvenanceView projectId={projectId} />
        )}

        {currentTab === 'security' && <SecurityView projectId={projectId} />}

        {currentTab === 'lore' && <LoreTimeline projectId={projectId} />}
      </div>
    </div>
  );
}
