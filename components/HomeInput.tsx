'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PROJECT_TYPES = [
  {
    value: 'web',
    label: 'Web 应用',
    description: '网站、Web 应用、API 服务',
    disabled: false,
  },
  {
    value: 'desktop',
    label: '桌面应用',
    description: '即将支持',
    disabled: true,
  },
  {
    value: 'mobile',
    label: '移动应用',
    description: '即将支持',
    disabled: true,
  },
] as const;

export default function HomeInput() {
  const router = useRouter();
  const [requirement, setRequirement] = useState('');
  const [projectType, setProjectType] = useState('web');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');

    if (!requirement.trim()) {
      setError('请输入项目需求描述');
      return;
    }

    if (requirement.trim().length < 10) {
      setError('需求描述至少需要 10 个字符');
      return;
    }

    setSubmitting(true);

    try {
      // 先检查登录状态
      const authRes = await fetch('/api/auth?action=status');
      const authData = await authRes.json();

      if (!authData.isLoggedIn) {
        window.location.href = '/api/auth?action=login';
        return;
      }

      // 提交构建请求
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: requirement.trim(),
          projectType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      // 跳转到构建进度页
      router.push(`/project/${data.projectId}/build?taskId=${data.taskId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试');
      setSubmitting(false);
    }
  }

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      {/* 需求输入框 */}
      <label
        htmlFor="requirement"
        className="mb-2 block text-sm font-medium text-forge-ink"
      >
        描述你的项目需求
      </label>
      <textarea
        id="requirement"
        value={requirement}
        onChange={(e) => setRequirement(e.target.value)}
        rows={8}
        placeholder="例如：创建一个待办事项管理应用，支持任务的增删改查、优先级标记、分类管理，并带有深色主题界面..."
        className="forge-input w-full resize-y font-mono text-sm leading-relaxed"
        disabled={submitting}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-forge-muted">
        <span>{requirement.length} 个字符</span>
        <span>建议描述尽量详细，包含功能、技术偏好等</span>
      </div>

      {/* 项目类型选择器 */}
      <div className="mt-6">
        <p className="mb-3 text-sm font-medium text-forge-ink">选择项目类型</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PROJECT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              disabled={type.disabled || submitting}
              onClick={() => setProjectType(type.value)}
              className={`relative rounded-lg border p-4 text-left transition-all ${
                projectType === type.value
                  ? 'border-forge-accent bg-forge-accent/5'
                  : 'border-forge-border bg-forge-bg hover:border-forge-muted'
              } ${type.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-forge-ink">
                  {type.label}
                </span>
                {projectType === type.value && (
                  <svg
                    className="h-4 w-4 text-forge-accent"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                )}
              </div>
              <p className="mt-1 text-xs text-forge-muted">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-forge-red/30 bg-forge-red/10 px-4 py-3 text-sm text-forge-red">
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

      {/* 提交按钮 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="forge-btn-primary mt-6 w-full text-base"
      >
        {submitting ? (
          <>
            <svg
              className="h-5 w-5 animate-forge-spin"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" />
              <path d="M8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z" />
            </svg>
            正在提交...
          </>
        ) : (
          <>
            <svg
              className="h-5 w-5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7.5 1a6.5 6.5 0 104.472 11.197l3.416 3.415a.75.75 0 001.06-1.06l-3.415-3.416A6.5 6.5 0 007.5 1zM2.5 7.5a5 5 0 1110 0 5 5 0 01-10 0z" />
            </svg>
            生成项目
          </>
        )}
      </button>
    </div>
  );
}
