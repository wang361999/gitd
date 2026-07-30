'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: string;
  repoUrl: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectListProps {
  projects: Project[];
  loading?: boolean;
  /** 删除成功后的回调（用于刷新列表） */
  onProjectDeleted?: () => void;
  /** 是否处于搜索/筛选模式（影响空状态文案） */
  searchMode?: boolean;
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
  web: 'Web',
  desktop: '桌面',
  mobile: '移动',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function ProjectList({
  projects,
  loading = false,
  onProjectDeleted,
  searchMode = false,
}: ProjectListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(
    e: React.MouseEvent,
    projectId: string,
    projectName: string
  ) {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm(`确定要删除项目「${projectName}」吗？此操作不可撤销。`)) {
      return;
    }

    setDeletingId(projectId);
    try {
      const res = await fetch(`/api/projects?id=${projectId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }

      onProjectDeleted?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="forge-card h-40 animate-forge-pulse p-5"
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-12 w-12 text-forge-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
        </svg>
        {searchMode ? (
          <>
            <p className="mt-4 text-forge-ink">未找到匹配的项目</p>
            <p className="mt-1 text-sm text-forge-muted">
              试试调整搜索关键词或筛选条件
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-forge-ink">还没有项目</p>
            <p className="mt-1 text-sm text-forge-muted">
              前往首页描述你的需求，生成第一个项目吧
            </p>
            <Link href="/" className="forge-btn-primary mt-4">
              创建项目
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {projects.map((project) => {
        const status = STATUS_MAP[project.status] || STATUS_MAP.draft;
        const isDeleting = deletingId === project.id;
        return (
          <div
            key={project.id}
            className="forge-card group relative p-5 transition-all hover:border-forge-accent/50 hover:bg-forge-surface/80"
          >
            <Link
              href={`/project/${project.id}`}
              className="block"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-forge-ink group-hover:text-forge-accent">
                    {project.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-forge-muted">
                    {project.description}
                  </p>
                </div>
                <span
                  className={`ml-3 inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-forge-border px-2.5 py-1 text-xs ${status.color}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-forge-muted">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z" />
                    </svg>
                    {TYPE_LABELS[project.projectType] || project.projectType}
                  </span>
                  <span>{formatDate(project.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {project.repoUrl && (
                    <span className="inline-flex items-center gap-1 text-forge-accent">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                      </svg>
                      仓库
                    </span>
                  )}
                  {project.downloadUrl && (
                    <span className="inline-flex items-center gap-1 text-forge-green">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75zM7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 6.78a.75.75 0 011.06-1.06l1.97 1.969z" />
                      </svg>
                      下载
                    </span>
                  )}
                </div>
              </div>
            </Link>

            {/* 删除按钮 */}
            <button
              type="button"
              onClick={(e) => handleDelete(e, project.id, project.name)}
              disabled={isDeleting}
              title="删除项目"
              className="absolute right-3 top-3 rounded-lg border border-forge-border bg-forge-bg p-1.5 text-forge-muted opacity-0 transition-all hover:border-forge-red/50 hover:text-forge-red group-hover:opacity-100"
            >
              {isDeleting ? (
                <svg
                  className="h-3.5 w-3.5 animate-forge-spin"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                  <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
                </svg>
              ) : (
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675l.66 6.6a.25.25 0 00.249.225h5.19a.25.25 0 00.249-.225l.66-6.6a.75.75 0 011.492.149l-.66 6.6A1.75 1.75 0 0110.595 15h-5.19a1.75 1.75 0 01-1.741-1.575l-.66-6.6a.75.75 0 011.492-.15z" />
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
