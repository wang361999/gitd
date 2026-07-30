'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 治理报告聚合组件
 * 调用 GET /api/governance?projectId=xxx&type=report 获取聚合治理数据
 * 顶部摘要卡片网格 + 三个折叠区域（溯源 / 安全 / 决策概要）+ 导出 / 下载按钮
 */

interface GovernanceReportProps {
  projectId: string;
}

interface ReportFile {
  filePath: string;
  source: string;
  modelName?: string | null;
  lineCount?: number;
  riskScore?: number;
  issues?: unknown;
  createdAt?: string;
}

interface Version {
  versionTag?: string;
  releaseUrl?: string | null;
  downloadUrl?: string | null;
}

interface ReportData {
  provenance?: {
    totalFiles?: number;
    sources?: Record<string, number>;
  };
  security?: {
    securityScore?: number;
    averageRiskScore?: number;
    totalIssues?: number;
  };
  lore?: {
    totalDecisions?: number;
    decisions?: unknown[];
  };
  reports?: ReportFile[];
  versions?: Version[];
  // 兼容 summary 字段
  summary?: {
    projectName?: string;
    totalFiles?: number;
    totalLines?: number;
    aiPercentage?: number;
    securityScore?: number;
    decisionCount?: number;
    overallScore?: number;
  };
}

function isHumanSource(source?: string): boolean {
  const s = (source || '').toLowerCase();
  return !!source && (s === 'human' || s.includes('human') || s.includes('人类'));
}

/** 综合评分等级 */
function overallGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 85)
    return { label: '优秀', color: 'text-forge-green', bg: 'bg-forge-green/10' };
  if (score >= 70)
    return { label: '良好', color: 'text-forge-accent', bg: 'bg-forge-accent/10' };
  if (score >= 50)
    return { label: '中等', color: 'text-forge-yellow', bg: 'bg-forge-yellow/10' };
  return { label: '待改进', color: 'text-forge-red', bg: 'bg-forge-red/10' };
}

/** 安全评分颜色 */
function scoreColor(score: number): string {
  if (score >= 80) return 'text-forge-green';
  if (score >= 60) return 'text-forge-yellow';
  return 'text-forge-red';
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="forge-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-forge-bg/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-forge-ink">
          {icon}
          {title}
        </span>
        <svg
          className={`h-4 w-4 text-forge-muted transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12.78 5.22a.75.75 0 00-1.06 0L8 8.94 4.28 5.22a.75.75 0 00-1.06 1.06l4.25 4.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-forge-border p-4 forge-animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  valueColor = 'text-forge-ink',
  sub,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  valueColor?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="forge-card p-4">
      <p className="text-xs text-forge-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${valueColor}`}>{value}</span>
        {suffix && <span className="text-sm text-forge-muted">{suffix}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-forge-muted">{sub}</div>}
    </div>
  );
}

export default function GovernanceReport({ projectId }: GovernanceReportProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(
          `/api/governance?projectId=${projectId}&type=report`
        );
        if (!res.ok) {
          if (res.status === 401) setError('请先登录');
          else if (res.status === 404) setError('项目不存在');
          else setError(`加载失败 (${res.status})`);
          return;
        }
        const json = await res.json();
        if (mounted) setData(json);
      } catch {
        if (mounted) setError('网络错误，请稍后重试');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  // 计算摘要统计
  const summary = useMemo(() => {
    if (!data) return null;
    const reports = data.reports || [];
    const sources = data.provenance?.sources || {};

    const totalFiles =
      data.summary?.totalFiles ??
      data.provenance?.totalFiles ??
      reports.length;

    const totalLines =
      data.summary?.totalLines ??
      reports.reduce((sum, r) => sum + (r.lineCount || 0), 0);

    // AI 代码占比
    let aiCount = 0;
    let totalCount = 0;
    for (const [source, count] of Object.entries(sources)) {
      totalCount += count;
      if (!isHumanSource(source)) aiCount += count;
    }
    const aiPercentage =
      data.summary?.aiPercentage ??
      (totalCount > 0 ? Math.round((aiCount / totalCount) * 100) : 0);

    const securityScore =
      data.summary?.securityScore ?? data.security?.securityScore ?? 0;

    const decisionCount =
      data.summary?.decisionCount ??
      data.lore?.totalDecisions ??
      (data.lore?.decisions?.length || 0);

    // 综合治理评分：安全分 + 溯源覆盖 + 决策覆盖 的加权平均
    const overallScore =
      data.summary?.overallScore ??
      Math.round(
        ((securityScore +
          Math.min(100, totalFiles * 10) +
          Math.min(100, decisionCount * 5)) /
          3) *
          10
      ) / 10;

    return {
      projectName: data.summary?.projectName,
      totalFiles,
      totalLines,
      aiPercentage,
      securityScore,
      decisionCount,
      overallScore,
      sources,
      totalIssues: data.security?.totalIssues ?? 0,
    };
  }, [data]);

  // 最新版本（用于下载报告链接）
  const latestVersion = data?.versions?.[0] || null;
  const downloadHref = latestVersion?.releaseUrl || latestVersion?.downloadUrl || '#';

  // ---------------- 加载状态：骨架屏 ----------------
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="forge-card h-24 animate-pulse p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-forge-border" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-forge-border" />
            </div>
          ))}
        </div>
        <div className="forge-card h-12 animate-pulse" />
        <div className="forge-card h-12 animate-pulse" />
        <div className="forge-card h-12 animate-pulse" />
      </div>
    );
  }

  // ---------------- 错误状态 ----------------
  if (error) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-10 w-10 text-forge-red"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
        <p className="mt-3 text-sm text-forge-ink">{error}</p>
      </div>
    );
  }

  // ---------------- 空状态 ----------------
  if (!data || !summary) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-10 w-10 text-forge-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v8.586A1.75 1.75 0 0113.25 15H3.75A1.75 1.75 0 012 13.25V1.75z" />
        </svg>
        <p className="mt-3 text-sm text-forge-muted">暂无治理报告数据</p>
      </div>
    );
  }

  const grade = overallGrade(summary.overallScore);
  const sourceEntries = Object.entries(summary.sources);

  return (
    <div className="space-y-4 forge-animate-fade-in">
      {/* 报告标题 */}
      <div className="forge-card flex items-center justify-between p-5">
        <div>
          <h2 className="text-base font-semibold text-forge-ink">
            {summary.projectName || '项目治理报告'}
          </h2>
          <p className="mt-0.5 text-xs text-forge-muted">
            代码溯源 · 安全审计 · 决策记录 综合治理评估
          </p>
        </div>
        <span className="hidden font-mono text-xs text-forge-muted sm:block">
          {projectId}
        </span>
      </div>

      {/* 摘要卡片网格 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="AI 代码占比"
          value={summary.aiPercentage}
          suffix="%"
          valueColor={
            summary.aiPercentage >= 80
              ? 'text-forge-red'
              : summary.aiPercentage >= 50
              ? 'text-forge-yellow'
              : 'text-forge-green'
          }
          sub={`共 ${summary.totalFiles} 个文件`}
        />
        <StatCard
          label="安全评分"
          value={Math.round(summary.securityScore)}
          suffix="/ 100"
          valueColor={scoreColor(summary.securityScore)}
          sub={`${summary.totalIssues} 个问题`}
        />
        <StatCard
          label="决策记录数"
          value={summary.decisionCount}
          valueColor="text-forge-purple"
          sub="条决策记录"
        />
        <StatCard
          label="综合治理评分"
          value={Math.round(summary.overallScore * 10) / 10}
          suffix="/ 100"
          valueColor={grade.color}
          sub={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${grade.bg} ${grade.color}`}
            >
              {grade.label}
            </span>
          }
        />
      </div>

      {/* 折叠区域：溯源概要 */}
      <CollapsibleSection
        title="溯源概要"
        defaultOpen
        icon={
          <svg
            className="h-4 w-4 text-forge-accent"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53l-5.25 5.25a.75.75 0 01-1.06 0L7 7.06l-2.97 2.97a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0L9.97 8.22l4.72-4.72a.75.75 0 011.06 1.06z" />
          </svg>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-forge-muted">文件总数</p>
            <p className="mt-1 text-lg font-semibold text-forge-ink">
              {summary.totalFiles} 个
            </p>
            <p className="mt-1 text-xs text-forge-muted">
              总计 {summary.totalLines.toLocaleString()} 行代码
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">来源分布</p>
            <div className="mt-2 space-y-1.5">
              {sourceEntries.length === 0 ? (
                <p className="text-xs text-forge-muted">暂无来源数据</p>
              ) : (
                sourceEntries.map(([source, count]) => (
                  <div
                    key={source}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-forge-ink">
                      {isHumanSource(source) ? '人类' : source}
                    </span>
                    <span className="font-mono text-forge-muted">
                      {count} 个文件
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 折叠区域：安全概要 */}
      <CollapsibleSection
        title="安全概要"
        icon={
          <svg
            className="h-4 w-4 text-forge-red"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-forge-muted">安全评分</p>
            <p
              className={`mt-1 text-lg font-semibold ${scoreColor(summary.securityScore)}`}
            >
              {Math.round(summary.securityScore)} / 100
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">问题总数</p>
            <p className="mt-1 text-lg font-semibold text-forge-ink">
              {summary.totalIssues} 个
            </p>
          </div>
          <div>
            <p className="text-xs text-forge-muted">平均风险分</p>
            <p className="mt-1 text-lg font-semibold text-forge-ink">
              {data.security?.averageRiskScore ?? 0}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* 折叠区域：决策概要 */}
      <CollapsibleSection
        title="决策概要"
        icon={
          <svg
            className="h-4 w-4 text-forge-purple"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75z" />
          </svg>
        }
      >
        <p className="text-xs text-forge-muted">决策记录数</p>
        <p className="mt-1 text-lg font-semibold text-forge-ink">
          {summary.decisionCount} 条
        </p>
        <p className="mt-2 text-xs leading-relaxed text-forge-muted">
          决策记录（Lore）保存了项目开发过程中的关键技术决策、被否决方案与约束条件，便于后续追溯。
        </p>
      </CollapsibleSection>

      {/* 操作按钮 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="forge-btn-secondary text-sm"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75V4h2.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0113.25 13H11v1.25c0 .966-.784 1.75-1.75 1.75h-2.5C5.784 16 5 15.216 5 14.25V13H2.75A1.75 1.75 0 011 11.25v-5.5C1 4.784 1.784 4 2.75 4H5V1.75zm1.75-.25a.25.25 0 00-.25.25V4h3V1.75a.25.25 0 00-.25-.25h-2.5zM6 9.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75h4a.75.75 0 00.75-.75V10.5A.75.75 0 0010 9.75H6z" />
          </svg>
          导出 PDF
        </button>
        <a
          href={downloadHref}
          target={downloadHref !== '#' ? '_blank' : undefined}
          rel={downloadHref !== '#' ? 'noopener noreferrer' : undefined}
          className={`forge-btn text-sm ${
            downloadHref === '#'
              ? 'forge-btn-secondary cursor-not-allowed opacity-50'
              : 'forge-btn-accent'
          } ${downloadHref === '#' ? 'pointer-events-none' : ''}`}
          aria-disabled={downloadHref === '#'}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
            <path d="M7.25 6a.75.75 0 01.75.75v3.546l1.22-1.22a.75.75 0 11 1.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V6.75A.75.75 0 017.25 6z" />
          </svg>
          下载报告
        </a>
      </div>
    </div>
  );
}
