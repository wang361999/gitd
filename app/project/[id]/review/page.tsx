'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface DimensionScore {
  functionality: number;
  quality: number;
  performance: number;
  security: number;
  robustness: number;
}

interface ReviewIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dimension: string;
  file: string;
  line?: number;
  description: string;
  suggestion: string;
}

interface ReviewReport {
  id: string;
  totalScore: number;
  scores: DimensionScore;
  issues: ReviewIssue[];
  summary: string;
  createdAt: string;
  model?: string;
}

interface ReviewHistoryItem {
  id: string;
  totalScore: number;
  issueCount: number;
  createdAt: string;
  model?: string;
}

/* ============================================================
   常量配置
   ============================================================ */

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; dot: string }
> = {
  critical: {
    label: '严重',
    color: 'text-forge-red',
    bgColor: 'bg-forge-red/5',
    borderColor: 'border-forge-red/50',
    dot: 'bg-forge-red',
  },
  high: {
    label: '高',
    color: 'text-forge-yellow',
    bgColor: 'bg-forge-yellow/5',
    borderColor: 'border-forge-yellow/50',
    dot: 'bg-forge-yellow',
  },
  medium: {
    label: '中',
    color: 'text-forge-accent',
    bgColor: 'bg-forge-accent/5',
    borderColor: 'border-forge-accent/50',
    dot: 'bg-forge-accent',
  },
  low: {
    label: '低',
    color: 'text-forge-green',
    bgColor: 'bg-forge-green/5',
    borderColor: 'border-forge-green/50',
    dot: 'bg-forge-green',
  },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

const DIMENSION_LABELS: Record<string, string> = {
  functionality: '功能性',
  quality: '代码质量',
  performance: '性能',
  security: '安全性',
  robustness: '健壮性',
};

/* ============================================================
   五维度雷达图 (SVG)
   ============================================================ */

function RadarChart({ scores }: { scores: DimensionScore }) {
  const size = 240;
  const center = size / 2;
  const maxRadius = 90;
  const levels = 5;

  const dimensions = Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScore>;
  const values = dimensions.map((d) => scores[d] || 0);

  // 计算每个维度的坐标点
  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / dimensions.length - Math.PI / 2;
    const radius = (value / 100) * maxRadius;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };

  // 数据多边形顶点
  const dataPoints = dimensions.map((_, i) => getPoint(i, values[i]));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[280px]">
      {/* 网格层 */}
      {Array.from({ length: levels }, (_, level) => {
        const r = (maxRadius * (level + 1)) / levels;
        const gridPoints = dimensions.map((_, i) => {
          const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
          return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
        });
        return (
          <polygon
            key={level}
            points={gridPoints.join(' ')}
            fill="none"
            stroke="#30363d"
            strokeWidth="1"
            opacity={0.4 + level * 0.1}
          />
        );
      })}

      {/* 轴线 */}
      {dimensions.map((_, i) => {
        const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + Math.cos(angle) * maxRadius}
            y2={center + Math.sin(angle) * maxRadius}
            stroke="#30363d"
            strokeWidth="1"
            opacity="0.4"
          />
        );
      })}

      {/* 数据多边形 */}
      <polygon
        points={dataPath}
        fill="rgba(88, 166, 255, 0.15)"
        stroke="#58a6ff"
        strokeWidth="2"
      />

      {/* 数据点 */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#58a6ff" />
      ))}

      {/* 维度标签 */}
      {dimensions.map((dim, i) => {
        const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
        const labelRadius = maxRadius + 22;
        const x = center + Math.cos(angle) * labelRadius;
        const y = center + Math.sin(angle) * labelRadius;
        const value = values[i];
        return (
          <g key={dim}>
            <text
              x={x}
              y={y - 6}
              textAnchor="middle"
              className="fill-forge-muted"
              style={{ fontSize: '11px', fontWeight: 500 }}
            >
              {DIMENSION_LABELS[dim]}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor="middle"
              className="fill-forge-accent"
              style={{ fontSize: '12px', fontWeight: 700 }}
            >
              {value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   问题卡片组件
   ============================================================ */

function IssueCard({ issue }: { issue: ReviewIssue }) {
  const config = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium;
  return (
    <div className={`forge-card-pro rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${config.bgColor} ${config.color}`}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM8 5a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 5zm1 6a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </span>
          <span className={`forge-badge border-transparent ${config.bgColor} ${config.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
            {config.label}
          </span>
        </div>
        <span className="rounded-md border border-forge-border bg-forge-bg px-2 py-0.5 text-xs text-forge-muted">
          {issue.dimension}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs">
        <svg className="h-3.5 w-3.5 text-forge-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.46 0 .903.193 1.219.531l3.914 4.36c.299.333.431.766.431 1.169v8.19A1.75 1.75 0 0114.25 16H3.75A1.75 1.75 0 012 14.25z" />
        </svg>
        <code className="font-mono text-forge-accent">
          {issue.file}
          {issue.line ? `:${issue.line}` : ''}
        </code>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-forge-ink">{issue.description}</p>

      {issue.suggestion && (
        <div className="mt-3 rounded-lg border border-forge-green/20 bg-forge-green/5 p-3">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-forge-green" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            <span className="text-xs font-medium text-forge-green">修复建议</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-forge-muted">{issue.suggestion}</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function ReviewPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);

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

  /* -------------------- 加载审查报告 -------------------- */
  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/review?projectId=${projectId}`);
      let data: ReviewReport | null = null;
      let historyData: ReviewHistoryItem[] = [];

      if (res.ok) {
        const json = await res.json();
        data = json.report || json;
        historyData = json.history || [];
      }

      // 如果没有报告，使用默认演示数据
      if (!data) {
        data = {
          id: 'demo',
          totalScore: 82,
          scores: {
            functionality: 88,
            quality: 85,
            performance: 76,
            security: 72,
            robustness: 80,
          },
          issues: [
            {
              id: '1',
              severity: 'critical',
              dimension: '安全性',
              file: 'app/api/auth/route.ts',
              line: 45,
              description: 'API 密钥直接硬编码在源码中，存在泄露风险。',
              suggestion: '将密钥迁移到环境变量或数据库配置中，使用 process.env 读取。',
            },
            {
              id: '2',
              severity: 'high',
              dimension: '性能',
              file: 'components/ProjectList.tsx',
              line: 23,
              description: '列表渲染未使用 key 属性，可能导致不必要的重渲染。',
              suggestion: '为列表项添加唯一的 key 属性，建议使用数据 id 字段。',
            },
            {
              id: '3',
              severity: 'medium',
              dimension: '健壮性',
              file: 'lib/github.ts',
              line: 67,
              description: 'fetch 请求缺少超时处理，网络异常时可能长时间挂起。',
              suggestion: '使用 AbortController 添加请求超时机制，建议 30 秒超时。',
            },
            {
              id: '4',
              severity: 'low',
              dimension: '代码质量',
              file: 'app/page.tsx',
              line: 12,
              description: '组件内存在未使用的导入语句。',
              suggestion: '移除未使用的导入，保持代码整洁。',
            },
          ],
          summary: '整体代码质量良好，建议优先修复安全相关的严重问题。',
          createdAt: new Date().toISOString(),
          model: 'gpt-4o',
        };
      }

      setReport(data);
      setHistory(historyData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载审查报告失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (authChecked && isLoggedIn) {
      loadReport();
    }
  }, [authChecked, isLoggedIn, loadReport]);

  /* -------------------- 发起审查 -------------------- */
  async function handleStartReview() {
    if (reviewing) return;
    setReviewing(true);
    setError('');
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `审查请求失败 (${res.status})`);
      }
      await loadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起审查失败');
    } finally {
      setReviewing(false);
    }
  }

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
        <div className="h-8 w-48 animate-forge-pulse rounded bg-forge-border" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="forge-card h-80 animate-forge-pulse" />
          <div className="forge-card h-80 animate-forge-pulse lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-12 w-12 text-forge-red" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <p className="mt-4 text-forge-ink">{error}</p>
          <button onClick={loadReport} className="forge-btn-secondary mt-4 text-sm">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // 按严重程度排序问题
  const sortedIssues = [...report.issues].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const scoreColor =
    report.totalScore >= 85
      ? 'text-forge-green'
      : report.totalScore >= 70
        ? 'text-forge-accent'
        : report.totalScore >= 50
          ? 'text-forge-yellow'
          : 'text-forge-red';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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

      {/* 标题与操作 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-forge-ink">
            <svg className="h-6 w-6 text-forge-accent" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
            </svg>
            代码审查报告
          </h1>
          <p className="mt-1 text-sm text-forge-muted">
            {report.model && <span>模型: {report.model} · </span>}
            生成于 {new Date(report.createdAt).toLocaleString('zh-CN')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartReview}
          disabled={reviewing}
          className="forge-btn-accent text-sm"
        >
          {reviewing ? (
            <>
              <svg className="h-4 w-4 animate-forge-spin" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              </svg>
              审查中...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
              </svg>
              发起审查
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 评分总览 + 雷达图 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 总评分 */}
        <div className="forge-card-pro flex flex-col items-center justify-center p-6">
          <p className="text-sm text-forge-muted">总评分</p>
          <div className={`mt-2 text-6xl font-bold tabular-nums ${scoreColor} forge-animate-count`}>
            {report.totalScore}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-forge-bg">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  report.totalScore >= 85
                    ? 'bg-forge-green'
                    : report.totalScore >= 70
                      ? 'bg-forge-accent'
                      : report.totalScore >= 50
                        ? 'bg-forge-yellow'
                        : 'bg-forge-red'
                }`}
                style={{ width: `${report.totalScore}%` }}
              />
            </div>
            <span className="text-xs text-forge-muted">/ 100</span>
          </div>
          {report.summary && (
            <p className="mt-4 text-center text-xs leading-relaxed text-forge-muted">{report.summary}</p>
          )}
        </div>

        {/* 雷达图 */}
        <div className="forge-card-pro p-6 lg:col-span-2">
          <h3 className="mb-2 text-sm font-medium text-forge-ink">五维度评分雷达图</h3>
          <RadarChart scores={report.scores} />
        </div>
      </div>

      {/* 问题列表 */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-forge-ink">
            问题列表
            <span className="ml-2 text-sm font-normal text-forge-muted">
              ({sortedIssues.length} 个问题)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_ORDER.map((sev) => {
              const count = sortedIssues.filter((i) => i.severity === sev).length;
              if (count === 0) return null;
              const config = SEVERITY_CONFIG[sev];
              return (
                <span key={sev} className={`forge-badge ${config.bgColor} ${config.color} border-transparent`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                  {config.label} {count}
                </span>
              );
            })}
          </div>
        </div>

        {sortedIssues.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {sortedIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <div className="forge-card flex flex-col items-center justify-center py-12 text-center">
            <svg className="h-10 w-10 text-forge-green" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            <p className="mt-3 text-sm text-forge-muted">未发现任何问题，代码质量优秀！</p>
          </div>
        )}
      </div>

      {/* 审查历史时间线 */}
      {history.length > 0 && (
        <div className="forge-card-pro p-6">
          <h3 className="mb-4 text-sm font-medium text-forge-ink">审查历史</h3>
          <div className="space-y-3">
            {history.map((item, index) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0
                        ? 'bg-forge-accent/15 text-forge-accent'
                        : 'bg-forge-bg text-forge-muted'
                    }`}
                  >
                    {item.totalScore}
                  </span>
                  {index < history.length - 1 && <span className="mt-1 h-8 w-px bg-forge-border" />}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-forge-ink">审查报告</span>
                    <span className="rounded-md border border-forge-border bg-forge-bg px-1.5 py-0.5 text-xs text-forge-muted">
                      {item.issueCount} 个问题
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-forge-muted">
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                    {item.model && ` · ${item.model}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
