'use client';

import Link from 'next/link';

interface ResultDisplayProps {
  repoUrl?: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  projectId: string;
  governanceUrl?: string | null;
}

function ExternalLinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z" />
    </svg>
  );
}

export default function ResultDisplay({
  repoUrl,
  previewUrl,
  downloadUrl,
  projectId,
  governanceUrl,
}: ResultDisplayProps) {
  const links: {
    label: string;
    href: string;
    description: string;
    icon: React.ReactElement;
    external?: boolean;
    highlight?: boolean;
  }[] = [];

  if (repoUrl) {
    links.push({
      label: '查看仓库',
      href: repoUrl,
      description: '在 GitHub 上查看完整代码',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      ),
      external: true,
    });
  }

  if (previewUrl) {
    links.push({
      label: '在线预览',
      href: previewUrl,
      description: '查看应用在线运行效果',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 0-2.824-.742-3.955-1.715C2.92 9.818 2.09 8.69 1.679 8.068a.119.119 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 6.423.43 7.1a1.619 1.619 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 1.27-1.091 2.187-2.345 2.637-3.023a1.619 1.619 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      ),
      external: true,
      highlight: true,
    });
  }

  if (downloadUrl) {
    links.push({
      label: '下载产物',
      href: downloadUrl,
      description: '下载打包好的项目文件',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
          <path d="M7.25 6a.75.75 0 01.75.75v3.546l1.22-1.22a.75.75 0 11 1.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V6.75A.75.75 0 017.25 6z" />
        </svg>
      ),
      external: true,
    });
  }

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-forge-ink">
        <svg className="h-5 w-5 text-forge-green" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
        </svg>
        构建结果
      </h3>

      {links.length === 0 ? (
        <p className="text-sm text-forge-muted">暂无可用链接</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className={`group flex items-start gap-3 rounded-lg border p-4 transition-all ${
                link.highlight
                  ? 'border-forge-green/50 bg-forge-green/5 hover:border-forge-green'
                  : 'border-forge-border bg-forge-bg hover:border-forge-muted'
              }`}
            >
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                  link.highlight
                    ? 'bg-forge-green/10 text-forge-green'
                    : 'bg-forge-accent/10 text-forge-accent'
                }`}
              >
                {link.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-forge-ink group-hover:text-forge-accent">
                    {link.label}
                  </span>
                  {link.external && (
                    <ExternalLinkIcon />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-forge-muted">
                  {link.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 治理报告入口 */}
      <div className="mt-4 border-t border-forge-border pt-4">
        <Link
          href={governanceUrl || `/project/${projectId}`}
          className="flex items-center justify-between rounded-lg border border-forge-border bg-forge-bg px-4 py-3 transition-all hover:border-forge-purple/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forge-purple/10 text-forge-purple">
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm9.22 3.72a.75.75 0 000 1.06L10.69 8 9.22 9.47a.75.75 0 101.06 1.06l2-2a.75.75 0 000-1.06l-2-2a.75.75 0 00-1.06 0zM6.78 6.53a.75.75 0 00-1.06-1.06l-2 2a.75.75 0 000 1.06l2 2a.75.75 0 101.06-1.06L5.31 8l1.47-1.47z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-forge-ink">治理报告</p>
              <p className="text-xs text-forge-muted">查看 AI 审查与治理审核详情</p>
            </div>
          </div>
          <svg className="h-4 w-4 text-forge-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
