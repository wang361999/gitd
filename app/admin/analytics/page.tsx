'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   类型定义
   ============================================================ */

interface AnalyticsData {
  stats: {
    totalProjects: number;
    aiCodeLines: number;
    reviewPassRate: number;
    bugFixCount: number;
  };
  modelUsage: Array<{ model: string; count: number }>;
  qualityTrend: Array<{ week: string; score: number }>;
  codeRatio: {
    aiGenerated: number;
    manual: number;
  };
  recentActivities: Array<{
    id: string;
    type: 'generate' | 'review' | 'bugfix';
    title: string;
    detail: string;
    createdAt: string;
  }>;
}

/* ============================================================
   工具函数
   ============================================================ */

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString('zh-CN');
  } catch {
    return iso;
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

/* ============================================================
   图标组件
   ============================================================ */

function ActivityIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    generate:
      'M7.5 1a6.5 6.5 0 104.472 11.197l3.416 3.415a.75.75 0 001.06-1.06l-3.415-3.416A6.5 6.5 0 007.5 1zM2.5 7.5a5 5 0 1110 0 5 5 0 01-10 0z',
    review:
      'M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z',
    bugfix:
      'M4.328 4.328a.75.75 0 01.53.22l6.824 6.823a.75.75 0 01-1.06 1.061L8.94 6.795l-.94.94-.47.47a3.5 3.5 0 01-2.326 1.011l1.526 1.526 1.94-1.94a.75.75 0 011.06 1.06l-2.47 2.47a.75.75 0 01-1.06 0L4.62 11.39a3.5 3.5 0 01-2.95-2.95L.345 5.115a.75.75 0 01.72-1.257l2.5.57a3.5 3.5 0 011.49-1.49l-.57-2.5a.75.75 0 011.256-.72l2.326 2.326a3.5 3.5 0 01-1.01 2.326l.47-.47.94-.94-1.414-1.414a.75.75 0 01.22-1.06z',
  };
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={paths[type] || paths.generate} />
    </svg>
  );
}

/* ============================================================
   统计卡片组件
   ============================================================ */

interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
  icon: string;
  trend?: string;
  trendUp?: boolean;
}

const STAT_ICON_PATHS: Record<string, string> = {
  projects:
    'M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z',
  code: 'M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z',
  review:
    'M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z',
  bug:
    'M4.328 4.328a.75.75 0 01.53.22l6.824 6.823a.75.75 0 01-1.06 1.061L8.94 6.795l-.94.94-.47.47a3.5 3.5 0 01-2.326 1.011l1.526 1.526 1.94-1.94a.75.75 0 011.06 1.06l-2.47 2.47a.75.75 0 01-1.06 0L4.62 11.39a3.5 3.5 0 01-2.95-2.95L.345 5.115a.75.75 0 01.72-1.257l2.5.57a3.5 3.5 0 011.49-1.49l-.57-2.5a.75.75 0 011.256-.72l2.326 2.326a3.5 3.5 0 01-1.01 2.326l.47-.47.94-.94-1.414-1.414a.75.75 0 01.22-1.06z',
};

const STAT_THEME: Record<string, { iconBg: string; iconText: string }> = {
  projects: { iconBg: 'bg-forge-accent/15', iconText: 'text-forge-accent' },
  code: { iconBg: 'bg-forge-green/15', iconText: 'text-forge-green' },
  review: { iconBg: 'bg-forge-purple/15', iconText: 'text-forge-purple' },
  bug: { iconBg: 'bg-forge-red/15', iconText: 'text-forge-red' },
};

function StatCard({ label, value, suffix, icon, trend, trendUp }: StatCardProps) {
  const theme = STAT_THEME[icon] || STAT_THEME.projects;
  return (
    <div className="forge-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-forge-muted">{label}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold text-forge-ink">{value}</span>
            {suffix && (
              <span className="text-sm text-forge-muted">{suffix}</span>
            )}
          </div>
          {trend && (
            <p
              className={`mt-1.5 text-xs ${
                trendUp ? 'text-forge-green' : 'text-forge-red'
              }`}
            >
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconText}`}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={STAT_ICON_PATHS[icon] || STAT_ICON_PATHS.projects} />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   柱状图组件
   ============================================================ */

function BarChart({ data }: { data: Array<{ model: string; count: number }> }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 200;
  const barWidth = 48;
  const gap = 24;
  const chartWidth = data.length * (barWidth + gap) + gap;

  const colors = [
    'fill-forge-accent',
    'fill-forge-green',
    'fill-forge-purple',
    'fill-forge-yellow',
    'fill-forge-red',
  ];

  return (
    <div className="forge-card p-6">
      <h3 className="mb-4 text-sm font-semibold text-forge-ink">
        模型使用次数
      </h3>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-forge-muted">暂无数据</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            width={chartWidth}
            height={chartHeight + 40}
            className="min-w-full"
          >
            {/* Y 轴网格线 */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={0}
                y1={chartHeight - ratio * chartHeight}
                x2={chartWidth}
                y2={chartHeight - ratio * chartHeight}
                stroke="currentColor"
                strokeWidth={1}
                className="text-forge-border"
                strokeDasharray="4 4"
              />
            ))}
            {/* 柱状条 */}
            {data.map((item, index) => {
              const barHeight = (item.count / maxCount) * chartHeight;
              const x = gap + index * (barWidth + gap);
              const y = chartHeight - barHeight;
              return (
                <g key={item.model}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    className={
                      colors[index % colors.length] || colors[0]
                    }
                    rx={4}
                  >
                    <title>
                      {item.model}: {item.count} 次
                    </title>
                  </rect>
                  {/* 数值标签 */}
                  <text
                    x={x + barWidth / 2}
                    y={y - 8}
                    textAnchor="middle"
                    className="fill-forge-muted text-[11px]"
                  >
                    {item.count}
                  </text>
                  {/* 模型名 */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 18}
                    textAnchor="middle"
                    className="fill-forge-muted text-[11px]"
                  >
                    {item.model.length > 10
                      ? item.model.slice(0, 9) + '...'
                      : item.model}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   折线图组件
   ============================================================ */

function LineChart({
  data,
}: {
  data: Array<{ week: string; score: number }>;
}) {
  const width = 480;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxScore = 100;
  const minScore = 0;

  const points = data.map((item, index) => {
    const x =
      padding.left +
      (data.length > 1 ? (index / (data.length - 1)) * chartWidth : 0);
    const y =
      padding.top +
      chartHeight -
      ((item.score - minScore) / (maxScore - minScore)) * chartHeight;
    return { x, y, ...item };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
      : '';

  return (
    <div className="forge-card p-6">
      <h3 className="mb-4 text-sm font-semibold text-forge-ink">
        代码质量趋势 (按周)
      </h3>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-forge-muted">暂无数据</p>
      ) : (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(88, 166, 255)"
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor="rgb(88, 166, 255)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          {/* Y 轴网格线 */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y =
              padding.top +
              chartHeight -
              ((val - minScore) / (maxScore - minScore)) * chartHeight;
            return (
              <g key={val}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-forge-border"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-forge-muted text-[10px]"
                >
                  {val}
                </text>
              </g>
            );
          })}
          {/* 填充区域 */}
          {areaD && <path d={areaD} fill="url(#lineGradient)" />}
          {/* 折线 */}
          <path
            d={pathD}
            fill="none"
            stroke="rgb(88, 166, 255)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* 数据点 */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill="rgb(88, 166, 255)"
                stroke="rgb(15, 20, 25)"
                strokeWidth={2}
              >
                <title>
                  {p.week}: {p.score} 分
                </title>
              </circle>
              <text
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-forge-muted text-[10px]"
              >
                {p.week}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ============================================================
   饼图组件
   ============================================================ */

function PieChart({
  aiGenerated,
  manual,
}: {
  aiGenerated: number;
  manual: number;
}) {
  const total = aiGenerated + manual;
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const aiPercent = total > 0 ? (aiGenerated / total) * 100 : 0;
  const aiOffset = circumference - (aiPercent / 100) * circumference;

  return (
    <div className="forge-card p-6">
      <h3 className="mb-4 text-sm font-semibold text-forge-ink">
        代码来源比例
      </h3>
      {total === 0 ? (
        <p className="py-12 text-center text-sm text-forge-muted">暂无数据</p>
      ) : (
        <div className="flex items-center gap-6">
          <svg width={180} height={180} viewBox="0 0 180 180">
            {/* 背景圆 (人工编写) */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgb(139, 148, 158)"
              strokeWidth={strokeWidth}
              opacity={0.3}
            />
            {/* AI 生成 (前景) */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgb(63, 185, 80)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={aiOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="round"
            />
            {/* 中心文字 */}
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="fill-forge-ink text-xl font-bold"
            >
              {aiPercent.toFixed(0)}%
            </text>
            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              className="fill-forge-muted text-[10px]"
            >
              AI 生成
            </text>
          </svg>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-forge-green" />
              <div className="flex-1">
                <p className="text-xs text-forge-muted">AI 生成</p>
                <p className="text-sm font-medium text-forge-ink">
                  {formatNumber(aiGenerated)} 行
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-forge-muted/40" />
              <div className="flex-1">
                <p className="text-xs text-forge-muted">人工编写</p>
                <p className="text-sm font-medium text-forge-ink">
                  {formatNumber(manual)} 行
                </p>
              </div>
            </div>
            <div className="border-t border-forge-border pt-2">
              <p className="text-xs text-forge-muted">总计</p>
              <p className="text-sm font-medium text-forge-ink">
                {formatNumber(total)} 行
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   活动列表项
   ============================================================ */

const ACTIVITY_THEME: Record<
  string,
  { iconBg: string; iconText: string; label: string; labelBg: string }
> = {
  generate: {
    iconBg: 'bg-forge-accent/15',
    iconText: 'text-forge-accent',
    label: '代码生成',
    labelBg: 'bg-forge-accent/10',
  },
  review: {
    iconBg: 'bg-forge-purple/15',
    iconText: 'text-forge-purple',
    label: '代码审查',
    labelBg: 'bg-forge-purple/10',
  },
  bugfix: {
    iconBg: 'bg-forge-red/15',
    iconText: 'text-forge-red',
    label: 'Bug 修复',
    labelBg: 'bg-forge-red/10',
  },
};

function ActivityItem({
  activity,
}: {
  activity: AnalyticsData['recentActivities'][0];
}) {
  const theme = ACTIVITY_THEME[activity.type] || ACTIVITY_THEME.generate;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-forge-border bg-forge-surface p-3 transition-colors hover:border-forge-muted/40">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${theme.iconBg} ${theme.iconText}`}
      >
        <ActivityIcon type={activity.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-forge-ink">
            {activity.title}
          </span>
          <span
            className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs ${theme.labelBg} ${theme.iconText}`}
          >
            {theme.label}
          </span>
        </div>
        {activity.detail && (
          <p className="mt-0.5 truncate text-xs text-forge-muted">
            {activity.detail}
          </p>
        )}
        <p className="mt-1 text-xs text-forge-muted">
          {formatDate(activity.createdAt)}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   主页面组件
   ============================================================ */

export default function AnalyticsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 管理员鉴权检查
  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      try {
        const res = await fetch('/api/admin?action=status');
        if (res.ok) {
          const result = await res.json();
          if (mounted) {
            if (!result.isAdmin) {
              router.push('/admin');
              return;
            }
            setIsAdmin(true);
          }
        } else {
          if (mounted) router.push('/admin');
        }
      } catch {
        if (mounted) router.push('/admin');
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }
    checkAdmin();
    return () => {
      mounted = false;
    };
  }, [router]);

  // 加载分析数据
  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    async function loadData() {
      try {
        const res = await fetch('/api/analytics');
        if (!res.ok) {
          throw new Error(`加载分析数据失败 (${res.status})`);
        }
        const result = await res.json();
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : '加载失败');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  // 加载中
  if (!authChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-forge-spin rounded-full border-2 border-forge-border border-t-forge-accent" />
          <span className="text-sm text-forge-muted">正在校验权限...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-forge-muted">
            <Link
              href="/admin"
              className="hover:text-forge-ink transition-colors"
            >
              管理后台
            </Link>
            <span>/</span>
            <span className="text-forge-ink">效能仪表盘</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-forge-ink">
            AI 编程效能仪表盘
          </h1>
          <p className="mt-1 text-sm text-forge-muted">
            监控 AI 代码生成、审查通过率及团队编程效能趋势
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError('');
            fetch('/api/analytics')
              .then((res) => res.json())
              .then((d) => {
                setData(d);
                setLoading(false);
              })
              .catch((e) => {
                setError(e.message || '刷新失败');
                setLoading(false);
              });
          }}
          className="forge-btn-secondary text-sm"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 2.5a5.5 5.5 0 1 1-4.385 2.177.75.75 0 1 0-1.198.902A7 7 0 1 0 8 1V0L4.5 3.5 8 7V2.5z" />
          </svg>
          刷新数据
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 加载骨架屏 */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="forge-card h-24 animate-forge-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="forge-card h-72 animate-forge-pulse" />
            <div className="forge-card h-72 animate-forge-pulse" />
          </div>
        </div>
      )}

      {/* 数据展示 */}
      {!loading && data && (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="总项目数"
              value={formatNumber(data.stats.totalProjects)}
              icon="projects"
              trend="本月"
              trendUp
            />
            <StatCard
              label="AI 生成代码行数"
              value={formatNumber(data.stats.aiCodeLines)}
              suffix="行"
              icon="code"
              trend="持续增长"
              trendUp
            />
            <StatCard
              label="审查通过率"
              value={data.stats.reviewPassRate.toFixed(1)}
              suffix="%"
              icon="review"
              trend="质量稳定"
              trendUp
            />
            <StatCard
              label="Bug 修复数"
              value={formatNumber(data.stats.bugFixCount)}
              icon="bug"
              trend="已修复"
              trendUp
            />
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarChart data={data.modelUsage} />
            <LineChart data={data.qualityTrend} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 饼图占 1 列 */}
            <PieChart
              aiGenerated={data.codeRatio.aiGenerated}
              manual={data.codeRatio.manual}
            />
            {/* 最近活动占 2 列 */}
            <div className="forge-card p-6 lg:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-forge-ink">
                最近活动
              </h3>
              {data.recentActivities.length === 0 ? (
                <p className="py-8 text-center text-sm text-forge-muted">
                  暂无活动记录
                </p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {data.recentActivities.map((activity) => (
                    <ActivityItem
                      key={activity.id}
                      activity={activity}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 无数据占位 */}
      {!loading && !data && !error && (
        <div className="forge-card flex flex-col items-center justify-center py-20 text-center">
          <svg
            className="h-12 w-12 text-forge-muted/40"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
          </svg>
          <p className="mt-4 text-sm text-forge-muted">
            暂无分析数据，开始使用 AI 生成代码后将自动统计
          </p>
        </div>
      )}
    </div>
  );
}
