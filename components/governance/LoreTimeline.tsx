'use client';

import { useEffect, useState } from 'react';

/**
 * 决策时间线视图（Lore）
 * 调用 GET /api/governance?projectId=xxx&type=lore 获取决策记录
 * 垂直时间线：左侧时间轴，右侧决策卡片
 */

interface LoreTimelineProps {
  projectId: string;
}

interface LoreRecord {
  id: string;
  commitSha: string;
  context: string;
  decision: string;
  /** 被否决的方案（可多条，换行分隔） */
  rejected?: string | null;
  /** 约束条件 */
  constraints?: string | null;
  createdAt: string;
}

interface LoreData {
  timeline?: LoreRecord[];
  /** 兼容字段 */
  records?: LoreRecord[];
  totalDecisions?: number;
}

function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortSha(sha: string): string {
  if (!sha) return '';
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

/** 将多行/分隔的字符串拆成条目数组 */
function splitItems(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\n,，；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function LoreTimeline({ projectId }: LoreTimelineProps) {
  const [data, setData] = useState<LoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(
          `/api/governance?projectId=${projectId}&type=lore`
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

  const records: LoreRecord[] = data?.timeline || data?.records || [];

  // ---------------- 加载状态：骨架屏 ----------------
  if (loading) {
    return (
      <div className="forge-card p-6">
        <div className="mb-4 h-5 w-28 animate-pulse rounded bg-forge-border" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 animate-pulse rounded-full bg-forge-border" />
                <div className="mt-1 h-full w-px flex-1 animate-pulse bg-forge-border" />
              </div>
              <div className="h-24 flex-1 animate-pulse rounded bg-forge-border" />
            </div>
          ))}
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
  if (records.length === 0) {
    return (
      <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-10 w-10 text-forge-muted"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0114.25 13H8.06l-2.573 2.573A1.458 1.458 0 013 14.543V13H1.75A1.75 1.75 0 010 11.25v-9.5zm1.75-.25a.25.25 0 00-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v1.44l1.94-1.94a.75.75 0 01.53-.22h6.28a.25.25 0 00.25-.25v-9.5a.25.25 0 00-.25-.25H1.75zM4 4.75A.75.75 0 014.75 4h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 4.75zm0 3A.75.75 0 014.75 7h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 7.75z" />
        </svg>
        <p className="mt-3 text-sm text-forge-muted">暂无决策记录</p>
      </div>
    );
  }

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-forge-ink">
          <svg
            className="h-4 w-4 text-forge-purple"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm9.22 3.72a.75.75 0 000 1.06L10.69 8 9.22 9.47a.75.75 0 101.06 1.06l2-2a.75.75 0 000-1.06l-2-2a.75.75 0 00-1.06 0zM6.78 6.53a.75.75 0 00-1.06-1.06l-2 2a.75.75 0 000 1.06l2 2a.75.75 0 101.06-1.06L5.31 8l1.47-1.47z" />
          </svg>
          决策时间线
        </h3>
        <span className="text-xs text-forge-muted">
          共 {data?.totalDecisions ?? records.length} 条记录
        </span>
      </div>

      <ol className="relative space-y-6">
        {records.map((record, index) => {
          const isLast = index === records.length - 1;
          const rejectedItems = splitItems(record.rejected);
          const constraintItems = splitItems(record.constraints);

          return (
            <li key={record.id} className="relative flex gap-4">
              {/* 左侧时间轴 */}
              <div className="flex flex-col items-center">
                {/* 节点圆点 */}
                <span className="z-10 mt-1 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 border-forge-purple bg-forge-surface">
                  <span className="h-1.5 w-1.5 rounded-full bg-forge-purple" />
                </span>
                {/* 连接线 */}
                {!isLast && (
                  <span className="mt-1 w-px flex-1 bg-forge-border" />
                )}
              </div>

              {/* 右侧决策卡片 */}
              <div className="min-w-0 flex-1 pb-2">
                <div className="rounded-lg border border-forge-border bg-forge-bg p-4 transition-colors hover:border-forge-border/80">
                  {/* 头部：SHA + 时间 */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {record.commitSha && (
                      <span className="inline-flex items-center gap-1 rounded bg-forge-purple/10 px-2 py-0.5 font-mono text-forge-purple">
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M11.93 8.5a4 4 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4 4 0 017.86 0h3.32a.75.75 0 110 1.5H11.93zM8 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                        </svg>
                        {shortSha(record.commitSha)}
                      </span>
                    )}
                    <span className="text-forge-muted">
                      {formatDateTime(record.createdAt)}
                    </span>
                  </div>

                  {/* 决策内容（主体，加粗） */}
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-forge-ink">
                    {record.decision}
                  </p>

                  {/* 上下文（灰色文字） */}
                  {record.context && (
                    <p className="mt-2 text-xs leading-relaxed text-forge-muted">
                      {record.context}
                    </p>
                  )}

                  {/* 被否决的方案（红色背景小区块） */}
                  {rejectedItems.length > 0 && (
                    <div className="mt-3 rounded-md border border-forge-red/30 bg-forge-red/10 p-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-forge-red">
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                        </svg>
                        被否决的方案
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {rejectedItems.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs leading-relaxed text-forge-red/90"
                          >
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 约束条件（黄色背景小区块） */}
                  {constraintItems.length > 0 && (
                    <div className="mt-2 rounded-md border border-forge-yellow/30 bg-forge-yellow/10 p-2.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-forge-yellow">
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
                        </svg>
                        约束条件
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {constraintItems.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs leading-relaxed text-forge-yellow/90"
                          >
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
