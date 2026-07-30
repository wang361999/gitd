'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 代码溯源视图
 * 调用 GET /api/governance?projectId=xxx&type=provenance 获取溯源数据
 * 展示来源分布水平条形图 + 文件列表表格（支持按来源筛选）
 */

interface ProvenanceViewProps {
  projectId: string;
}

interface SourceItem {
  /** 来源名称（人类 / ai:gpt-4o 等） */
  source: string;
  /** 文件数量 */
  count: number;
  /** 占比百分比 */
  percentage: number;
}

interface ProvenanceFile {
  /** 文件路径 */
  filePath: string;
  /** 来源（human / ai:xxx） */
  source: string;
  /** 使用的模型名 */
  modelName?: string | null;
  /** 行数 */
  lineCount: number;
  /** 创建时间 */
  createdAt?: string;
}

interface ProvenanceData {
  sourceDistribution?: SourceItem[];
  /** 兼容字段：部分返回使用 sources 命名 */
  sources?: SourceItem[];
  files: ProvenanceFile[];
  totalFiles?: number;
}

/** 来源 → 颜色映射（条形图 / 文本 / 圆点） */
interface SourceColor {
  bar: string;
  text: string;
  dot: string;
  soft: string;
}

const AI_PALETTE: SourceColor[] = [
  { bar: 'bg-forge-accent', text: 'text-forge-accent', dot: 'bg-forge-accent', soft: 'bg-forge-accent/10' },
  { bar: 'bg-forge-purple', text: 'text-forge-purple', dot: 'bg-forge-purple', soft: 'bg-forge-purple/10' },
  { bar: 'bg-forge-yellow', text: 'text-forge-yellow', dot: 'bg-forge-yellow', soft: 'bg-forge-yellow/10' },
  { bar: 'bg-forge-red', text: 'text-forge-red', dot: 'bg-forge-red', soft: 'bg-forge-red/10' },
];

const HUMAN_COLOR: SourceColor = {
  bar: 'bg-forge-green',
  text: 'text-forge-green',
  dot: 'bg-forge-green',
  soft: 'bg-forge-green/10',
};

function isHumanSource(source: string): boolean {
  const s = (source || '').toLowerCase();
  return s === 'human' || s.includes('human') || s.includes('人类');
}

/** 根据来源列表构建稳定的颜色映射 */
function buildColorMap(sources: SourceItem[]): Record<string, SourceColor> {
  const map: Record<string, SourceColor> = {};
  let aiIndex = 0;
  // 人类优先排在前面
  const sorted = [...sources].sort((a, b) => {
    const ah = isHumanSource(a.source) ? 0 : 1;
    const bh = isHumanSource(b.source) ? 0 : 1;
    return ah - bh;
  });
  for (const s of sorted) {
    if (isHumanSource(s.source)) {
      map[s.source] = HUMAN_COLOR;
    } else {
      map[s.source] = AI_PALETTE[aiIndex % AI_PALETTE.length];
      aiIndex += 1;
    }
  }
  return map;
}

/** 来源展示名：ai:gpt-4o -> GPT-4o，human -> 人类 */
function sourceLabel(source: string): string {
  if (isHumanSource(source)) return '人类';
  if (source.startsWith('ai:')) {
    const model = source.slice(3);
    return model ? `AI · ${model}` : 'AI';
  }
  if (source.startsWith('ai')) return source.replace(/^ai[-_]?/i, 'AI · ');
  return source;
}

export default function ProvenanceView({ projectId }: ProvenanceViewProps) {
  const [data, setData] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(
          `/api/governance?projectId=${projectId}&type=provenance`
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

  const sources = useMemo<SourceItem[]>(() => {
    if (!data) return [];
    const raw = data.sourceDistribution || data.sources || [];
    // 兼容 { name, percentage } 形态
    return raw.map((s) => ({
      source: s.source || (s as { name?: string }).name || '未知',
      count: s.count ?? 0,
      percentage: s.percentage ?? 0,
    }));
  }, [data]);

  const colorMap = useMemo(() => buildColorMap(sources), [sources]);

  const files = useMemo<ProvenanceFile[]>(() => {
    if (!data) return [];
    return (data.files || []).map((f) => ({
      filePath: (f as { path?: string }).path || f.filePath || '',
      source: f.source || 'unknown',
      modelName: f.modelName ?? null,
      lineCount: f.lineCount ?? 0,
      createdAt: f.createdAt,
    }));
  }, [data]);

  const filteredFiles = useMemo(() => {
    if (filter === 'all') return files;
    return files.filter((f) => f.source === filter);
  }, [files, filter]);

  // ---------------- 加载状态：骨架屏 ----------------
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="forge-card p-6">
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-forge-border" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-20 animate-pulse rounded bg-forge-border" />
                <div className="h-3 flex-1 animate-pulse rounded bg-forge-border" />
                <div className="h-4 w-10 animate-pulse rounded bg-forge-border" />
              </div>
            ))}
          </div>
        </div>
        <div className="forge-card p-6">
          <div className="mb-4 h-5 w-24 animate-pulse rounded bg-forge-border" />
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded bg-forge-border"
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
  if (!data || (sources.length === 0 && files.length === 0)) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-10 w-10 text-forge-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0114.25 13H8.06l-2.573 2.573A1.458 1.458 0 013 14.543V13H1.75A1.75 1.75 0 010 11.25v-9.5zm1.75-.25a.25.25 0 00-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v1.44l1.94-1.94a.75.75 0 01.53-.22h6.28a.25.25 0 00.25-.25v-9.5a.25.25 0 00-.25-.25H1.75z" />
        </svg>
        <p className="mt-3 text-sm text-forge-muted">暂无溯源数据</p>
      </div>
    );
  }

  const totalFiles = data.totalFiles ?? files.length;

  return (
    <div className="space-y-4 forge-animate-fade-in">
      {/* 来源分布 */}
      <div className="forge-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-forge-ink">
            <svg
              className="h-4 w-4 text-forge-accent"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53l-5.25 5.25a.75.75 0 01-1.06 0L7 7.06l-2.97 2.97a.75.75 0 01-1.06-1.06l3.5-3.5a.75.75 0 011.06 0L9.97 8.22l4.72-4.72a.75.75 0 011.06 1.06z" />
            </svg>
            来源分布
          </h3>
          <span className="text-xs text-forge-muted">
            共 {totalFiles} 个文件
          </span>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-forge-muted">暂无来源分布数据</p>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => {
              const color = colorMap[s.source] || AI_PALETTE[0];
              const pct = Math.max(0, Math.min(100, s.percentage));
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <div className="flex w-32 flex-shrink-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${color.dot}`}
                    />
                    <span className="truncate text-xs text-forge-ink">
                      {sourceLabel(s.source)}
                    </span>
                  </div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-forge-bg">
                    <div
                      className={`h-full rounded transition-all duration-500 ${color.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex w-24 flex-shrink-0 items-center justify-end gap-1 text-xs">
                    <span className={`font-medium ${color.text}`}>{pct}%</span>
                    <span className="text-forge-muted">· {s.count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 文件列表 */}
      <div className="forge-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-forge-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-forge-ink">文件溯源明细</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="provenance-filter" className="text-xs text-forge-muted">
              筛选来源
            </label>
            <select
              id="provenance-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="forge-input cursor-pointer py-1 text-xs"
            >
              <option value="all">全部来源</option>
              {sources.map((s) => (
                <option key={s.source} value={s.source}>
                  {sourceLabel(s.source)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-forge-muted">
            没有匹配的文件
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-forge-border text-xs text-forge-muted">
                  <th className="px-4 py-2.5 font-medium">文件路径</th>
                  <th className="px-4 py-2.5 font-medium">来源</th>
                  <th className="px-4 py-2.5 font-medium">模型</th>
                  <th className="px-4 py-2.5 text-right font-medium">行数</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((f, idx) => {
                  const color = colorMap[f.source] || AI_PALETTE[0];
                  return (
                    <tr
                      key={`${f.filePath}-${idx}`}
                      className="border-b border-forge-border/60 transition-colors last:border-0 hover:bg-forge-bg/50"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-forge-ink">
                          {f.filePath || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${color.soft} ${color.text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${color.dot}`}
                          />
                          {sourceLabel(f.source)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-forge-muted">
                          {f.modelName || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs text-forge-ink">
                          {f.lineCount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
