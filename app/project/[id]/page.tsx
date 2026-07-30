'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ResultDisplay from '@/components/ResultDisplay';

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
};

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
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadProject() {
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
        if (mounted) {
          setProject(data.project || data);
        }
      } catch {
        if (mounted) setError('网络错误，请稍后重试');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProject();
    return () => {
      mounted = false;
    };
  }, [projectId]);

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
          <span
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-forge-border px-3 py-1.5 text-sm ${status.color}`}
          >
            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
            {status.label}
          </span>
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
              项目正在构建中...
            </span>
          </div>
          <Link
            href={`/project/${project.id}/build`}
            className="forge-btn-accent text-sm"
          >
            查看进度
          </Link>
        </div>
      )}

      {/* 失败重试 */}
      {project.status === 'failed' && (
        <div className="forge-card flex items-center justify-between border-forge-red/30 p-4">
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
          <Link
            href={`/project/${project.id}/build`}
            className="forge-btn-secondary text-sm"
          >
            查看详情
          </Link>
        </div>
      )}

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
          <h3 className="mb-3 text-sm font-medium text-forge-ink">仓库信息</h3>
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
  );
}
