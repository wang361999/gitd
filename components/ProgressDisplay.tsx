'use client';

export type StepStatus = 'pending' | 'running' | 'success' | 'failed';

export interface BuildStep {
  key: string;
  label: string;
  description: string;
  status: StepStatus;
}

export const DEFAULT_STEPS: BuildStep[] = [
  {
    key: 'analyze',
    label: '分析需求',
    description: 'AI 解析需求，生成项目结构方案',
    status: 'pending',
  },
  {
    key: 'generate',
    label: '生成代码',
    description: '逐文件生成完整代码内容',
    status: 'pending',
  },
  {
    key: 'push',
    label: '推送仓库',
    description: '创建 GitHub 仓库并推送代码',
    status: 'pending',
  },
  {
    key: 'review',
    label: 'AI 审查',
    description: '多模型交叉审查代码质量',
    status: 'pending',
  },
  {
    key: 'governance',
    label: '治理审核',
    description: '生成治理报告，评估风险',
    status: 'pending',
  },
  {
    key: 'package',
    label: '打包',
    description: '创建 Release 并上传产物',
    status: 'pending',
  },
  {
    key: 'install',
    label: '安装说明',
    description: '生成安装与使用文档',
    status: 'pending',
  },
];

const STATUS_CONFIG: Record<
  StepStatus,
  { color: string; bgColor: string; borderColor: string; label: string }
> = {
  pending: {
    color: 'text-forge-muted',
    bgColor: 'bg-forge-bg',
    borderColor: 'border-forge-border',
    label: '等待中',
  },
  running: {
    color: 'text-forge-yellow',
    bgColor: 'bg-forge-yellow/5',
    borderColor: 'border-forge-yellow/50',
    label: '进行中',
  },
  success: {
    color: 'text-forge-green',
    bgColor: 'bg-forge-green/5',
    borderColor: 'border-forge-green/50',
    label: '已完成',
  },
  failed: {
    color: 'text-forge-red',
    bgColor: 'bg-forge-red/5',
    borderColor: 'border-forge-red/50',
    label: '失败',
  },
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') {
    return (
      <svg
        className="h-4 w-4 animate-forge-spin"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
        <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
      </svg>
    );
  }
  if (status === 'success') {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
      </svg>
    );
  }
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
    </span>
  );
}

interface ProgressDisplayProps {
  steps: BuildStep[];
  /** 整体完成进度百分比 */
  progress?: number;
  /** 是否有步骤失败 */
  hasFailed?: boolean;
  /** 是否全部完成 */
  allDone?: boolean;
}

export default function ProgressDisplay({
  steps,
  progress = 0,
  hasFailed = false,
  allDone = false,
}: ProgressDisplayProps) {
  const completedCount = steps.filter((s) => s.status === 'success').length;
  const totalCount = steps.length;

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      {/* 总进度条 */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-forge-ink">构建进度</h3>
          <span className="text-sm text-forge-muted">
            {completedCount} / {totalCount} 步完成
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-forge-bg">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hasFailed
                ? 'bg-forge-red'
                : allDone
                ? 'bg-forge-green'
                : 'bg-forge-accent'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const config = STATUS_CONFIG[step.status];
          const isLast = index === steps.length - 1;
          return (
            <div key={step.key}>
              <div
                className={`flex items-start gap-3 rounded-lg border ${config.borderColor} ${config.bgColor} p-4 transition-all`}
              >
                {/* 步骤编号 / 状态图标 */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${config.borderColor} ${config.color}`}
                >
                  {step.status === 'pending' ? (
                    <span className="text-xs font-mono">{index + 1}</span>
                  ) : (
                    <StepIcon status={step.status} />
                  )}
                </div>

                {/* 步骤内容 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-forge-ink">
                      {step.label}
                    </span>
                    <span className={`text-xs ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-forge-muted">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* 连接线 */}
              {!isLast && (
                <div className="flex justify-center py-1">
                  <div className="h-4 w-px bg-forge-border" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 完成状态提示 */}
      {allDone && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-forge-green/30 bg-forge-green/10 px-4 py-3 text-sm text-forge-green">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
          项目构建完成！查看下方结果。
        </div>
      )}

      {hasFailed && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.75 5.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 12a1 1 0 100-2 1 1 0 000 2z" />
          </svg>
          构建过程中出现错误，请查看日志或稍后重试。
        </div>
      )}
    </div>
  );
}
