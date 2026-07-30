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
        <div className="flex justify-center">
          <Link
            href={`/project/${projectId}`}
            className="forge-btn-accent"
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
