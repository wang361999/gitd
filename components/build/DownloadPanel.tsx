'use client';

import { useEffect, useState } from 'react';

interface DownloadPanelProps {
  projectId: string;
  projectType: string;
  repoOwner?: string | null;
  repoName?: string | null;
  downloadUrl?: string | null;
}

interface VersionInfo {
  versionTag: string;
  releaseUrl: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  createdAt: string;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; ext: string }
> = {
  web: {
    label: 'Web 应用',
    icon: '🌐',
    color: 'forge-accent',
    ext: '在线访问',
  },
  desktop: {
    label: '桌面应用',
    icon: '🖥️',
    color: 'forge-green',
    ext: '.exe / .dmg',
  },
  mobile: {
    label: '移动应用',
    icon: '📱',
    color: 'forge-purple',
    ext: '.apk',
  },
};

export default function DownloadPanel({
  projectId,
  projectType,
  repoOwner,
  repoName,
  downloadUrl,
}: DownloadPanelProps) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadVersions() {
      try {
        const res = await fetch(`/api/projects?id=${projectId}`);
        if (!res.ok) return;
        const data = await res.json();
        const project = data.project || data;
        if (mounted && project.versions) {
          setVersions(project.versions);
        }
      } catch {
        // 静默处理
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadVersions();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const config = TYPE_CONFIG[projectType] || TYPE_CONFIG.web;
  const releasesUrl =
    repoOwner && repoName
      ? `https://github.com/${repoOwner}/${repoName}/releases`
      : null;

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-forge-ink">
        <svg
          className="h-5 w-5 text-forge-green"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
          <path d="M7.25 6a.75.75 0 01.75.75v3.546l1.22-1.22a.75.75 0 11 1.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V6.75A.75.75 0 017.25 6z" />
        </svg>
        下载与安装
      </h3>

      {/* 项目类型标识 */}
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-forge-border bg-forge-bg p-3">
        <span className="text-2xl">{config.icon}</span>
        <div>
          <p className="text-sm font-medium text-forge-ink">{config.label}</p>
          <p className="text-xs text-forge-muted">产物格式：{config.ext}</p>
        </div>
      </div>

      {/* 下载按钮区域 */}
      {projectType === 'web' ? (
        <div className="space-y-3">
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-forge-green/50 bg-forge-green/5 px-4 py-3 transition-all hover:border-forge-green"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 text-forge-green"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 0-2.824-.742-3.955-1.715C2.92 9.818 2.09 8.69 1.679 8.068a.119.119 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 6.423.43 7.1a1.619 1.619 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 1.27-1.091 2.187-2.345 2.637-3.023a1.619 1.619 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-forge-ink">在线访问</p>
                  <p className="text-xs text-forge-muted">{downloadUrl}</p>
                </div>
              </div>
              <svg
                className="h-4 w-4 text-forge-muted"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
              </svg>
            </a>
          )}
          <p className="text-xs text-forge-muted">
            Web 项目已自动部署到 Vercel，点击上方链接即可在线访问。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 主下载按钮 */}
          {(downloadUrl || (versions.length > 0 && versions[0].downloadUrl)) && (
            <a
              href={downloadUrl || versions[0].downloadUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-forge-green/50 bg-forge-green/5 px-4 py-4 transition-all hover:border-forge-green"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="h-6 w-6 text-forge-green"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M7.25 6a.75.75 0 01.75.75v3.546l1.22-1.22a.75.75 0 11 1.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V6.75A.75.75 0 017.25 6z" />
                  <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-forge-ink">
                    下载安装包
                  </p>
                  <p className="text-xs text-forge-muted">
                    {config.ext} · 来自 GitHub Releases
                  </p>
                </div>
              </div>
              <svg
                className="h-4 w-4 text-forge-muted"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
              </svg>
            </a>
          )}

          {/* 无下载链接提示 */}
          {!downloadUrl && versions.length === 0 && !loading && (
            <div className="rounded-lg border border-forge-border bg-forge-bg px-4 py-6 text-center">
              <p className="text-sm text-forge-muted">
                安装包尚未生成或仍在打包中
              </p>
              {releasesUrl && (
                <a
                  href={releasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-forge-accent hover:underline"
                >
                  查看 GitHub Releases →
                </a>
              )}
            </div>
          )}

          {/* 版本历史 */}
          {versions.length > 0 && (
            <div className="mt-4 border-t border-forge-border pt-4">
              <h4 className="mb-2 text-xs font-medium text-forge-muted">
                版本历史
              </h4>
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.versionTag}
                    className="flex items-center justify-between rounded border border-forge-border bg-forge-bg px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-forge-accent">
                        {v.versionTag}
                      </span>
                      <span className="text-forge-muted">
                        {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    {v.releaseUrl && (
                      <a
                        href={v.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forge-accent hover:underline"
                      >
                        查看
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GitHub Releases 链接 */}
          {releasesUrl && (
            <a
              href={releasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-center text-xs text-forge-muted hover:text-forge-accent"
            >
              在 GitHub Releases 查看所有版本 →
            </a>
          )}
        </div>
      )}

      {/* 重新打包按钮 */}
      <div className="mt-4 border-t border-forge-border pt-4">
        <button
          type="button"
          onClick={() => {
            if (confirm('确定要重新打包吗？这将触发一次新的构建流程。')) {
              fetch('/api/build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, action: 'repackage' }),
              }).then(() => {
                window.location.reload();
              });
            }
          }}
          className="w-full rounded-lg border border-forge-border bg-forge-bg px-4 py-2 text-sm text-forge-muted transition-all hover:border-forge-accent hover:text-forge-accent"
        >
          重新打包
        </button>
      </div>
    </div>
  );
}
