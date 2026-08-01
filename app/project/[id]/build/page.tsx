'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ProgressDisplay, {
  DEFAULT_STEPS,
  BuildStep,
  StepStatus,
} from '@/components/ProgressDisplay';
import ResultDisplay from '@/components/ResultDisplay';

interface BuildResult {
  repoUrl?: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
}

interface StatusResponse {
  /** 任务状态: pending | running | success | failed */
  status: string;
  /** 任务阶段: generate | governance | package */
  stage: string;
  /** 进度 1-7 */
  progress: number;
  /** 项目状态: building | governing | packaging | done | failed */
  projectStatus: string;
  result?: BuildResult;
  logs?: string;
}

/* ============================================================
   增强的构建阶段定义 (SSE 实时进度)
   ============================================================ */

interface EnhancedStage {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  /** 当前阶段的进度 0-100 */
  progress: number;
  /** 阶段产生的日志消息 */
  messages: Array<{ text: string; time: string }>;
}

const ENHANCED_STAGES: EnhancedStage[] = [
  {
    id: 'analyze',
    label: '架构分析',
    description: '分析需求并生成架构设计方案',
    status: 'pending',
    progress: 0,
    messages: [],
  },
  {
    id: 'generate',
    label: '逐文件生成',
    description: '按架构设计逐个生成源代码文件',
    status: 'pending',
    progress: 0,
    messages: [],
  },
  {
    id: 'review',
    label: 'AI 审查',
    description: '对生成的代码进行五维度 AI 审查',
    status: 'pending',
    progress: 0,
    messages: [],
  },
  {
    id: 'fix',
    label: '自动修复',
    description: '根据审查结果自动修复代码问题',
    status: 'pending',
    progress: 0,
    messages: [],
  },
  {
    id: 'test',
    label: '测试生成',
    description: '生成单元测试并验证代码正确性',
    status: 'pending',
    progress: 0,
    messages: [],
  },
];

/**
 * 根据 API 返回的 progress (1-7) 和 status 映射到 7 步 UI 进度
 *
 * progress 含义:
 *   1: generate pending    -> step 0 (analyze) running
 *   2: generate running    -> step 0 success, step 1 (generate) running
 *   3: generate success    -> steps 0-2 success, step 3 pending
 *   4: governance running  -> steps 0-2 success, step 3 (review) running
 *   5: governance success  -> steps 0-4 success, step 5 pending
 *   6: package running     -> steps 0-4 success, step 5 (package) running
 *   7: package success     -> all success
 */
function mapStepsFromProgress(
  progress: number,
  taskStatus: string,
  currentSteps: BuildStep[]
): BuildStep[] {
  const steps = currentSteps.map((s) => ({ ...s }));

  // 全部完成
  if (progress >= 7 || taskStatus === 'success') {
    return steps.map((s) => ({ ...s, status: 'success' as StepStatus }));
  }

  // 根据进度值映射
  // progress 1-7 对应 7 个步骤，当前步骤为 running，之前的为 success
  const currentIndex = Math.max(0, Math.min(progress - 1, steps.length - 1));

  return steps.map((s, index) => {
    if (index < currentIndex) {
      return { ...s, status: 'success' as StepStatus };
    }
    if (index === currentIndex) {
      if (taskStatus === 'failed') {
        return { ...s, status: 'failed' as StepStatus };
      }
      // pending 或 running 都显示为 running
      return { ...s, status: 'running' as StepStatus };
    }
    return s;
  });
}

/* ============================================================
   增强阶段卡片组件
   ============================================================ */

const STAGE_STATUS_META: Record<
  EnhancedStage['status'],
  { icon: string; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: 'M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z',
    color: 'text-forge-muted',
    bgColor: 'bg-forge-muted/10',
    label: '等待中',
  },
  running: {
    icon: 'M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z',
    color: 'text-forge-accent',
    bgColor: 'bg-forge-accent/10',
    label: '进行中',
  },
  success: {
    icon: 'M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z',
    color: 'text-forge-green',
    bgColor: 'bg-forge-green/10',
    label: '已完成',
  },
  failed: {
    icon: 'M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z',
    color: 'text-forge-red',
    bgColor: 'bg-forge-red/10',
    label: '失败',
  },
};

function EnhancedStageCard({ stage }: { stage: EnhancedStage }) {
  const meta = STAGE_STATUS_META[stage.status];
  const isRunning = stage.status === 'running';
  const isCompleted = stage.status === 'success';
  const isFailed = stage.status === 'failed';

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isRunning
          ? 'border-forge-accent/30 bg-forge-accent/5'
          : isCompleted
            ? 'border-forge-green/20 bg-forge-green/5'
            : isFailed
              ? 'border-forge-red/30 bg-forge-red/5'
              : 'border-forge-border bg-forge-surface'
      }`}
    >
      {/* 阶段头部 */}
      <div className="flex items-center gap-3">
        {/* 状态图标 */}
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${meta.bgColor} ${meta.color}`}
        >
          {isRunning ? (
            <svg
              className="h-4 w-4 animate-forge-spin"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={meta.icon} />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={meta.icon} />
            </svg>
          )}
        </div>

        {/* 阶段信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-forge-ink">
              {stage.label}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${meta.bgColor} ${meta.color}`}
              >
                {meta.label}
              </span>
              {(isRunning || isCompleted) && (
                <span className="text-xs font-mono text-forge-muted">
                  {stage.progress}%
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-forge-muted">
            {stage.description}
          </p>
        </div>
      </div>

      {/* 进度条 */}
      {(isRunning || isCompleted) && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-forge-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCompleted
                ? 'bg-forge-green'
                : 'bg-forge-accent'
            }`}
            style={{ width: `${stage.progress}%` }}
          />
        </div>
      )}

      {/* 阶段日志消息 */}
      {stage.messages.length > 0 && (
        <div className="mt-2 space-y-0.5 border-l-2 border-forge-border pl-2">
          {stage.messages.slice(-3).map((msg, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 font-mono text-xs text-forge-muted"
            >
              <span className="flex-shrink-0 text-forge-accent/60">
                {msg.time}
              </span>
              <span className="truncate">{msg.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const taskId = searchParams.get('taskId') || '';

  const [steps, setSteps] = useState<BuildStep[]>(
    DEFAULT_STEPS.map((s) => ({ ...s }))
  );
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // SSE 增强阶段状态
  const [enhancedStages, setEnhancedStages] = useState<EnhancedStage[]>(
    ENHANCED_STAGES.map((s) => ({ ...s, messages: [] }))
  );
  const [sseConnected, setSseConnected] = useState(false);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);

  const fetchStatus = useCallback(async () => {
    if (!taskId) {
      setError('缺少 taskId 参数');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/status?taskId=${taskId}`);
      if (!res.ok) {
        throw new Error(`查询状态失败 (${res.status})`);
      }

      const data: StatusResponse = await res.json();

      // 使用 progress 和 task status 映射步骤
      setSteps((prev) =>
        mapStepsFromProgress(data.progress || 1, data.status, prev)
      );

      // 使用 projectStatus 判断整体完成/失败
      if (data.projectStatus === 'done') {
        setAllDone(true);
        setResult(data.result || null);
        setLoading(false);
      } else if (
        data.projectStatus === 'failed' ||
        data.status === 'failed'
      ) {
        setHasFailed(true);
        setError(data.logs || '构建失败，请查看日志或稍后重试');
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询状态失败');
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchStatus();

    // 每 3 秒轮询一次
    const interval = setInterval(() => {
      // 如果已完成或失败，停止轮询
      if (allDone || hasFailed) {
        clearInterval(interval);
        return;
      }
      fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, allDone, hasFailed]);

  /* -------------------- SSE 实时进度 -------------------- */
  useEffect(() => {
    if (!taskId || allDone || hasFailed) return;

    let eventSource: EventSource | null = null;

    try {
      // 连接 SSE 流，传递 projectId 和 taskId
      eventSource = new EventSource(
        `/api/generate/stream?projectId=${encodeURIComponent(projectId)}&taskId=${encodeURIComponent(taskId)}`
      );

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      // 监听 stage 事件 (阶段状态变更)
      eventSource.addEventListener('stage', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const stageId = data.stage || data.id;
          const stageStatus = data.status || 'running';

          setEnhancedStages((prev) =>
            prev.map((s) => {
              if (s.id === stageId) {
                return { ...s, status: stageStatus };
              }
              // 将之前的阶段标记为已完成
              const currentIdx = prev.findIndex((st) => st.id === stageId);
              const thisIdx = prev.findIndex((st) => st.id === s.id);
              if (thisIdx < currentIdx && s.status !== 'failed') {
                return { ...s, status: 'success', progress: 100 };
              }
              return s;
            })
          );
        } catch {
          // 忽略解析错误
        }
      });

      // 监听 progress 事件 (阶段进度更新)
      eventSource.addEventListener('progress', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const stageId = data.stage || data.id;
          const progressVal = Math.min(100, Math.max(0, data.progress || 0));

          setEnhancedStages((prev) =>
            prev.map((s) =>
              s.id === stageId
                ? {
                    ...s,
                    progress: progressVal,
                    status: progressVal >= 100 ? 'success' : 'running',
                  }
                : s
            )
          );
        } catch {
          // 忽略解析错误
        }
      });

      // 监听 message 事件 (日志消息)
      eventSource.addEventListener('message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const text = data.text || data.message || data.content || '';
          const stageId = data.stage || data.id;
          const time = new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          if (text) {
            setStreamLogs((prev) => [...prev, text].slice(-100));
          }

          if (stageId && text) {
            setEnhancedStages((prev) =>
              prev.map((s) =>
                s.id === stageId
                  ? {
                      ...s,
                      messages: [...s.messages, { text, time }].slice(-20),
                    }
                  : s
              )
            );
          }
        } catch {
          // 如果不是 JSON，作为纯文本日志处理
          if (e.data) {
            setStreamLogs((prev) => [...prev, e.data].slice(-100));
          }
        }
      });

      // 监听 complete 事件 (构建完成)
      eventSource.addEventListener('complete', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setEnhancedStages((prev) =>
            prev.map((s) => ({ ...s, status: 'success', progress: 100 }))
          );
          if (data.result) {
            setResult(data.result);
          }
          setAllDone(true);
          setLoading(false);
        } catch {
          // 忽略
        }
        eventSource?.close();
        setSseConnected(false);
      });

      // 监听 error 事件 (构建失败)
      eventSource.addEventListener('error', (e: MessageEvent) => {
        try {
          const data = e.data ? JSON.parse(e.data) : {};
          if (data.message) {
            setError(data.message);
          }
        } catch {
          // 连接级别的 error 事件 (非自定义 error 事件)
          // EventSource 会自动重连，仅在连接彻底失败时处理
        }
        // 注意: 这里不关闭 EventSource，让浏览器自动重连
        // 只有在收到自定义 error 事件时才处理
      });

      // 连接错误处理 (网络断开等)
      eventSource.onerror = () => {
        setSseConnected(false);
        // 不在这里设置 hasFailed，因为轮询仍然在工作
        // SSE 断开后轮询会继续获取状态
      };
    } catch {
      // EventSource 创建失败，静默处理，依赖轮询
      setSseConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      setSseConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId, allDone, hasFailed]);

  const completedCount = steps.filter((s) => s.status === 'success').length;
  const progress = Math.round((completedCount / steps.length) * 100);

  // 重试失败的项目
  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    setError('');

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          action: 'retry',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `重试失败 (${res.status})`);
      }

      const data = await res.json();
      // 重置状态并跳转到新的构建进度页
      setHasFailed(false);
      setSteps(DEFAULT_STEPS.map((s) => ({ ...s })));
      setEnhancedStages(ENHANCED_STAGES.map((s) => ({ ...s, messages: [] })));
      setStreamLogs([]);
      setLoading(true);
      // 使用 window.location 跳转到新的 taskId 页面
      window.location.href = `/project/${projectId}/build?taskId=${data.taskId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败');
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 返回导航 */}
      <Link
        href={`/project/${projectId}`}
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
        返回项目
      </Link>

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-forge-ink">构建进度</h1>
        <p className="mt-1 text-sm text-forge-muted">
          任务 ID: <span className="font-mono text-forge-accent">{taskId}</span>
        </p>
      </div>

      {/* 加载中提示 */}
      {loading && !allDone && !hasFailed && (
        <div className="forge-card flex items-center gap-3 p-4">
          <svg
            className="h-5 w-5 animate-forge-spin text-forge-accent"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
            <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
          </svg>
          <span className="text-sm text-forge-muted">
            正在获取构建状态，每 3 秒自动刷新...
          </span>
        </div>
      )}

      {/* 进度展示 */}
      <ProgressDisplay
        steps={steps}
        progress={progress}
        hasFailed={hasFailed}
        allDone={allDone}
      />

      {/* SSE 实时进度 (增强阶段) */}
      <div className="forge-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-forge-ink">
            实时构建进度
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                sseConnected ? 'bg-forge-green animate-forge-pulse' : 'bg-forge-muted'
              }`}
            />
            <span className="text-xs text-forge-muted">
              {sseConnected ? 'SSE 已连接' : '轮询模式'}
            </span>
          </div>
        </div>

        {/* 阶段列表 */}
        <div className="space-y-3">
          {enhancedStages.map((stage) => (
            <EnhancedStageCard key={stage.id} stage={stage} />
          ))}
        </div>

        {/* 实时日志流 */}
        {streamLogs.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <svg
                className="h-4 w-4 text-forge-muted"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
              </svg>
              <span className="text-xs font-medium text-forge-muted">
                实时日志
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-forge-border bg-forge-bg p-3">
              {streamLogs.map((log, i) => (
                <div
                  key={i}
                  className="border-b border-forge-border/50 py-1 font-mono text-xs text-forge-muted last:border-0"
                >
                  <span className="text-forge-accent">{'>'}</span> {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {error && hasFailed && (
        <div className="forge-card border-forge-red/30 p-4">
          <h3 className="mb-2 text-sm font-medium text-forge-red">错误详情</h3>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-forge-bg p-3 text-sm text-forge-red font-mono">
            {error}
          </pre>
          {/* 重试 + 返回按钮 */}
          <div className="mt-4 flex items-center justify-between">
            <Link
              href={`/project/${projectId}`}
              className="text-sm text-forge-muted hover:text-forge-ink transition-colors"
            >
              返回项目详情
            </Link>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="forge-btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-forge-spin"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
                    <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
                  </svg>
                  正在重试...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 2.5a5.5 5.5 0 1 1-4.385 2.177.75.75 0 1 0-1.198.902A7 7 0 1 0 8 1V0L4.5 3.5 8 7V2.5z" />
                  </svg>
                  重试构建
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 构建结果 */}
      {allDone && result && (
        <ResultDisplay
          repoUrl={result.repoUrl}
          previewUrl={result.previewUrl}
          downloadUrl={result.downloadUrl}
          projectId={projectId}
        />
      )}

      {/* 完成后跳转入口 */}
      {allDone && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={`/design/${projectId}`}
              className="forge-btn-secondary text-sm"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z" />
              </svg>
              查看架构设计
            </Link>
            <Link
              href={`/project/${projectId}/review`}
              className="forge-btn-secondary text-sm"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0a.75.75 0 01.336.08l6 3a.75.75 0 01.414.67v3.5c0 3.59-2.094 6.78-5.336 8.25a.75.75 0 01-.664 0C5.494 13.94 3.4 10.75 3.4 7.25v-3.5a.75.75 0 01.414-.67l6-3A.75.75 0 018 0z" />
              </svg>
              查看审查报告
            </Link>
            <Link
              href={`/project/${projectId}/ide`}
              className="forge-btn-secondary text-sm"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z" />
              </svg>
              在线编辑代码
            </Link>
            <Link
              href={`/project/${projectId}`}
              className="forge-btn-accent text-sm"
            >
              查看项目详情
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuildPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl">
          <div className="forge-card h-64 animate-forge-pulse" />
        </div>
      }
    >
      <BuildPageContent />
    </Suspense>
  );
}
