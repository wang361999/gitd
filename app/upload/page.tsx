'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ============================================================
   常量与辅助
   ============================================================ */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 治理流程步骤 */
const PROCESS_STEPS = [
  { step: 1, name: '创建仓库', desc: '自动创建 GitHub 仓库' },
  { step: 2, name: '推送代码', desc: '上传并提交代码' },
  { step: 3, name: '治理审查', desc: '溯源 / 安全 / 决策' },
  { step: 4, name: '生成报告', desc: '汇总治理报告' },
] as const;

/* ============================================================
   主页面组件
   ============================================================ */
export default function UploadPage() {
  const router = useRouter();

  // 鉴权状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 表单状态
  const [projectName, setProjectName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /* -------------------- 文件处理 -------------------- */
  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('请上传 .zip 格式的压缩包文件');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件大小超过限制（最大 ${formatFileSize(MAX_FILE_SIZE)}）`);
      return;
    }
    setError('');
    setSelectedFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // 重置 input 以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  /* -------------------- 提交处理 -------------------- */
  async function handleSubmit() {
    setError('');

    if (!selectedFile) {
      setError('请选择要上传的 ZIP 压缩包');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('projectName', projectName.trim() || 'uploaded-code');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      router.push(`/project/${data.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试');
      setSubmitting(false);
    }
  }

  /* -------------------- 加载中 / 未登录 -------------------- */
  if (!authChecked) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="forge-card h-96 animate-forge-pulse" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  /* -------------------- 主表单 -------------------- */
  return (
    <div className="mx-auto max-w-2xl space-y-6 forge-animate-fade-in">
      {/* 返回导航 */}
      <Link
        href="/dashboard"
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
        返回仪表盘
      </Link>

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-forge-ink">上传代码治理</h1>
        <p className="mt-1 text-sm text-forge-muted">
          上传 ZIP 压缩包，系统将自动创建仓库、推送代码并执行治理审查
        </p>
      </div>

      {/* 表单卡片 */}
      <div className="forge-card space-y-6 p-6">
        {/* 项目名称 */}
        <div>
          <label
            htmlFor="projectName"
            className="mb-2 block text-sm font-medium text-forge-ink"
          >
            项目名称{' '}
            <span className="text-forge-muted">（可选）</span>
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="uploaded-code"
            className="forge-input w-full font-mono text-sm"
            disabled={submitting}
            maxLength={40}
          />
          <p className="mt-1 text-xs text-forge-muted">
            留空则默认使用 uploaded-code，将作为 GitHub 仓库名
          </p>
        </div>

        {/* 文件上传区 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-forge-ink">
            代码压缩包
          </label>
          <div
            onClick={() => !submitting && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver
                ? 'border-forge-accent bg-forge-accent/5'
                : selectedFile
                  ? 'border-forge-green/50 bg-forge-green/5'
                  : 'border-forge-border bg-forge-bg hover:border-forge-muted'
            } ${submitting ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleInputChange}
              className="hidden"
              disabled={submitting}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-forge-green/10 text-forge-green">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-forge-ink">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-forge-muted">
                  {formatFileSize(selectedFile.size)} · 点击重新选择
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-forge-accent/10 text-forge-accent">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75zM7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 6.78a.75.75 0 011.06-1.06l1.97 1.969z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-forge-ink">
                  点击或拖拽文件到此处上传
                </p>
                <p className="text-xs text-forge-muted">
                  支持 .zip 格式的压缩包
                </p>
              </div>
            )}
          </div>

          {/* 上传限制说明 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-forge-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-forge-muted" />
              支持 .zip 格式
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-forge-muted" />
              最大 50MB
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-forge-muted" />
              最多 100 个文件
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-forge-muted" />
              自动跳过 node_modules / .git 等
            </span>
          </div>
        </div>

        {/* 治理流程预览 */}
        <div className="rounded-lg border border-forge-border bg-forge-bg/50 p-4">
          <p className="mb-3 text-sm font-medium text-forge-ink">治理流程预览</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROCESS_STEPS.map((s, idx) => (
              <div key={s.step} className="relative">
                <div className="flex flex-col items-center text-center">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forge-accent/10 text-sm font-semibold text-forge-accent">
                    {s.step}
                  </span>
                  <p className="mt-2 text-xs font-medium text-forge-ink">
                    {s.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-forge-muted">
                    {s.desc}
                  </p>
                </div>
                {idx < PROCESS_STEPS.length - 1 && (
                  <svg
                    className="absolute -right-3 top-3 hidden h-4 w-4 text-forge-muted sm:block"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M4.22 11.78a.75.75 0 010-1.06L9.94 5H6.75a.75.75 0 010-1.5h5a.75.75 0 01.75.75v5a.75.75 0 01-1.5 0V6.06l-5.72 5.72a.75.75 0 01-1.06 0z" />
                  </svg>
                )}
              </div>
            ))}
          </div>
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

        {/* 提交按钮 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="forge-btn-primary w-full text-base"
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
              正在上传并治理...
            </>
          ) : (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75zM7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 6.78a.75.75 0 011.06-1.06l1.97 1.969z" />
              </svg>
              上传并治理
            </>
          )}
        </button>
      </div>
    </div>
  );
}
