'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 安全审计视图
 * 调用 GET /api/governance?projectId=xxx&type=security 获取安全报告
 * 顶部大数字展示安全评分（0-100）+ 风险等级标签
 * 问题列表按严重程度排序、支持筛选
 */

interface SecurityViewProps {
  projectId: string;
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface SecurityIssue {
  /** 文件路径（兼容 file / filePath） */
  file: string;
  /** 行号 */
  line?: number | null;
  /** 严重程度 */
  severity: Severity;
  /** 问题类型 */
  type?: string;
  /** 问题描述 */
  description?: string;
  /** 修复建议 */
  suggestion?: string;
  /** 来源（人类 / AI） */
  source?: string;
}

interface SecurityData {
  securityScore?: number;
  riskLevel?: Severity;
  issues?: Array<Record<string, unknown>>;
  totalIssues?: number;
  filesAnalyzed?: number;
  averageRiskScore?: number;
}

interface SeverityConfig {
  label: string;
  rank: number;
  color: string;
  bg: string;
  border: string;
}

const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  critical: {
    label: '严重',
    rank: 0,
    color: 'text-forge-red',
    bg: 'bg-forge-red/10',
    border: 'border-forge-red/40',
  },
  high: {
    label: '高',
    rank: 1,
    color: 'text-forge-yellow',
    bg: 'bg-forge-yellow/10',
    border: 'border-forge-yellow/40',
  },
  medium: {
    label: '中',
    rank: 2,
    color: 'text-forge-accent',
    bg: 'bg-forge-accent/10',
    border: 'border-forge-accent/40',
  },
  low: {
    label: '低',
    rank: 3,
    color: 'text-forge-green',
    bg: 'bg-forge-green/10',
    border: 'border-forge-green/40',
  },
  info: {
    label: '信息',
    rank: 4,
    color: 'text-forge-muted',
    bg: 'bg-forge-muted/10',
    border: 'border-forge-muted/40',
  },
};

const SEVERITY_ORDER: Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
];

function toSeverity(value: unknown): Severity {
  const s = String(value || '').toLowerCase();
  if (s.includes('critical') || s.includes('crit') || s === '严重') return 'critical';
  if (s.includes('high') || s.includes('err') || s === '高' || s === '高危') return 'high';
  if (s.includes('med') || s === '中' || s === '中危') return 'medium';
  if (s.includes('low') || s === '低' || s === '低危') return 'low';
  if (s.includes('info') || s === '信息') return 'info';
  return 'medium';
}

/** 根据评分（0-100）推导风险等级 */
function deriveRiskLevel(score: number): Severity {
  if (score >= 85) return 'low';
  if (score >= 70) return 'medium';
  if (score >= 50) return 'high';
  return 'critical';
}

/** 评分大数字颜色：>=80 绿 / 60-79 黄 / <60 红 */
function scoreColor(score: number): string {
  if (score >= 80) return 'text-forge-green';
  if (score >= 60) return 'text-forge-yellow';
  return 'text-forge-red';
}

function isHumanSource(source?: string): boolean {
  const s = (source || '').toLowerCase();
  return !!source && (s === 'human' || s.includes('human') || s.includes('人类'));
}

function sourceLabel(source?: string): { label: string; color: string } {
  if (!source) return { label: '未标注', color: 'text-forge-muted' };
  if (isHumanSource(source)) return { label: '人类', color: 'text-forge-green' };
  if (source.startsWith('ai:')) {
    const model = source.slice(3);
    return { label: model ? `AI · ${model}` : 'AI', color: 'text-forge-accent' };
  }
  if (source.toLowerCase().startsWith('ai')) {
    return {
      label: source.replace(/^ai[-_]?/i, 'AI · '),
      color: 'text-forge-accent',
    };
  }
  return { label: source, color: 'text-forge-muted' };
}

export default function SecurityView({ projectId }: SecurityViewProps) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(
          `/api/governance?projectId=${projectId}&type=security`
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

  // 归一化问题列表
  const issues = useMemo<SecurityIssue[]>(() => {
    if (!data || !Array.isArray(data.issues)) return [];
    return data.issues.map((raw) => {
      const file =
        (raw.file as string) ||
        (raw.filePath as string) ||
        (raw.path as string) ||
        '未知文件';
      return {
        file,
        line: (raw.line as number) ?? (raw.lineNumber as number) ?? null,
        severity: toSeverity(raw.severity),
        type: (raw.type as string) || (raw.rule as string) || undefined,
        description:
          (raw.description as string) ||
          (raw.message as string) ||
          (raw.text as string) ||
          undefined,
        suggestion:
          (raw.suggestion as string) ||
          (raw.recommendation as string) ||
          (raw.fix as string) ||
          undefined,
        source: (raw.source as string) || undefined,
      };
    });
  }, [data]);

  // 按严重程度排序（critical > high > medium > low > info）
  const sortedIssues = useMemo(() => {
    return [...issues].sort(
      (a, b) =>
        SEVERITY_CONFIG[a.severity].rank - SEVERITY_CONFIG[b.severity].rank
    );
  }, [issues]);

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return sortedIssues;
    return sortedIssues.filter((i) => i.severity === filter);
  }, [sortedIssues, filter]);

  // 各严重程度计数
  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const i of issues) counts[i.severity] += 1;
    return counts;
  }, [issues]);

  const securityScore =
    typeof data?.securityScore === 'number' ? data.securityScore : 0;
  const riskLevel: Severity = data?.riskLevel || deriveRiskLevel(securityScore);
  const riskCfg = SEVERITY_CONFIG[riskLevel];

  // ---------------- 加载状态：骨架屏 ----------------
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="forge-card flex items-center justify-between p-6">
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-forge-border" />
            <div className="h-12 w-20 animate-pulse rounded bg-forge-border" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded-full bg-forge-border" />
        </div>
        <div className="forge-card p-6">
          <div className="mb-4 h-5 w-28 animate-pulse rounded bg-forge-border" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded bg-forge-border"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        </div>
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
  if (!data) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-10 w-10 text-forge-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
        </svg>
        <p className="mt-3 text-sm text-forge-muted">暂无安全报告数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 forge-animate-fade-in">
      {/* 评分概览 */}
      <div className="forge-card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-forge-muted">安全评分</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-5xl font-bold leading-none ${scoreColor(securityScore)}`}
              >
                {Math.round(securityScore)}
              </span>
              <span className="text-sm text-forge-muted">/ 100</span>
            </div>
            <p className="mt-2 text-xs text-forge-muted">
              已分析 {data.filesAnalyzed ?? issues.length} 个文件 · 共{' '}
              {data.totalIssues ?? issues.length} 个问题
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-xs text-forge-muted">风险等级</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${riskCfg.border} ${riskCfg.bg} ${riskCfg.color}`}
            >
              <span className={`h-2 w-2 rounded-full bg-current`} />
              {riskCfg.label}
            </span>
          </div>
        </div>

        {/* 严重程度分布 */}
        {issues.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-forge-border pt-4">
            {SEVERITY_ORDER.map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = severityCounts[sev];
              if (count === 0) return null;
              return (
                <span
                  key={sev}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${cfg.bg} ${cfg.color}`}
                >
                  {cfg.label}
                  <span className="font-semibold">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 筛选 + 问题列表 */}
      <div className="forge-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-forge-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-forge-ink">
            问题列表
            <span className="ml-2 text-xs font-normal text-forge-muted">
              （已按严重程度排序）
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <label htmlFor="security-filter" className="text-xs text-forge-muted">
              筛选严重程度
            </label>
            <select
              id="security-filter"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as Severity | 'all')
              }
              className="forge-input cursor-pointer py-1 text-xs"
            >
              <option value="all">全部</option>
              {SEVERITY_ORDER.map((sev) => (
                <option key={sev} value={sev}>
                  {SEVERITY_CONFIG[sev].label}（{severityCounts[sev]}）
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <svg
              className="h-8 w-8 text-forge-green"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            <p className="mt-2 text-sm text-forge-muted">
              {issues.length === 0 ? '未发现安全问题' : '没有匹配的问题'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-forge-border/60">
            {filteredIssues.map((issue, idx) => {
              const cfg = SEVERITY_CONFIG[issue.severity];
              const src = sourceLabel(issue.source);
              return (
                <div
                  key={`${issue.file}-${idx}`}
                  className={`border-l-2 p-4 ${cfg.border} transition-colors hover:bg-forge-bg/40`}
                >
                  {/* 头部：文件 + 行号 + 严重程度 + 来源 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.label}
                    </span>
                    {issue.type && (
                      <span className="rounded bg-forge-bg px-2 py-0.5 font-mono text-xs text-forge-muted">
                        {issue.type}
                      </span>
                    )}
                    <span className="font-mono text-xs text-forge-ink">
                      {issue.file}
                      {issue.line ? `:${issue.line}` : ''}
                    </span>
                    <span className={`text-xs ${src.color}`}>· {src.label}</span>
                  </div>

                  {/* 描述 */}
                  {issue.description && (
                    <p className="mt-2 text-sm leading-relaxed text-forge-ink">
                      {issue.description}
                    </p>
                  )}

                  {/* 修复建议 */}
                  {issue.suggestion && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-forge-green/20 bg-forge-green/5 p-2.5">
                      <svg
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-forge-green"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.78 5.97a.75.75 0 00-1.06-1.06L6.5 9.13 5.28 7.91a.75.75 0 00-1.06 1.06l1.97 1.97a.75.75 0 001.06 0l3.53-3.97z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-forge-green">
                          修复建议
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-forge-muted">
                          {issue.suggestion}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
