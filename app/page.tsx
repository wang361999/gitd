'use client';

import Link from 'next/link';
import HomeInput from '@/components/HomeInput';

const FEATURES = [
  {
    title: 'AI 生成代码',
    description: '基于 GitHub Models，自动生成完整项目代码结构',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M7.5 1a6.5 6.5 0 104.472 11.197l3.416 3.415a.75.75 0 001.06-1.06l-3.415-3.416A6.5 6.5 0 007.5 1zM2.5 7.5a5 5 0 1110 0 5 5 0 01-10 0z" />
      </svg>
    ),
  },
  {
    title: '自动推送仓库',
    description: '生成代码自动推送到 GitHub 仓库，支持版本管理',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    ),
  },
  {
    title: 'AI 代码审查',
    description: '多模型交叉审查，识别代码质量与安全风险',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.75.75h2.5a.75.75 0 000-1.5h-1.75v-2.75z" />
      </svg>
    ),
  },
  {
    title: '治理与打包',
    description: '自动生成治理报告，打包发布 Release 版本',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
        <path d="M4 5.75a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 5.75zm0 3a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 8.75zm0 3a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero 区域 */}
      <section className="text-center forge-animate-fade-in">
        <h1 className="text-4xl font-bold text-forge-ink sm:text-5xl">
          用自然语言
          <span className="text-forge-accent"> 锻造 </span>
          完整项目
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-forge-muted">
          描述你的需求，AI 将自动生成代码、推送 GitHub 仓库、进行代码审查与治理审核，并打包发布。
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-forge-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-forge-border bg-forge-surface px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-forge-green" />
            基于 GitHub Models
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-forge-border bg-forge-surface px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-forge-accent" />
            7 步自动化流程
          </span>
        </div>
      </section>

      {/* 输入区域 */}
      <section className="mx-auto max-w-3xl">
        <HomeInput />
      </section>

      {/* 特性介绍 */}
      <section>
        <h2 className="mb-6 text-center text-xl font-semibold text-forge-ink">
          核心能力
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="forge-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forge-accent/10 text-forge-accent">
                {feature.icon}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-forge-ink">
                {feature.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-forge-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 流程说明 */}
      <section className="forge-card p-6">
        <h2 className="mb-4 text-center text-xl font-semibold text-forge-ink">
          构建流程
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {[
            '分析需求',
            '生成代码',
            '推送仓库',
            'AI 审查',
            '治理审核',
            '打包',
            '安装说明',
          ].map((step, index, arr) => (
            <div key={step} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-forge-border bg-forge-bg px-3 py-1.5 text-forge-muted">
                <span className="text-xs font-mono text-forge-accent">
                  {index + 1}
                </span>
                {step}
              </span>
              {index < arr.length - 1 && (
                <svg
                  className="h-4 w-4 text-forge-muted"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-forge-muted">
          想查看你的项目？前往{' '}
          <Link
            href="/dashboard"
            className="text-forge-accent hover:underline"
          >
            仪表盘
          </Link>
        </p>
      </section>
    </div>
  );
}
