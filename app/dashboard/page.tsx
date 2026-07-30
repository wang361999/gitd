'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProjectList from '@/components/ProjectList';
import StatsCard from '@/components/StatsCard';

interface Project {
  id: string;
  name: string;
  description: string;
  projectType: string;
  status: string;
  repoUrl: string | null;
  previewUrl: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        // 检查登录状态
        const authRes = await fetch('/api/auth?action=status');
        const authData = await authRes.json();

        if (!mounted) return;

        if (!authData.isLoggedIn) {
          setAuthChecked(true);
          setLoading(false);
          return;
        }

        // 获取项目列表
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setProjects(data.projects || []);
          }
        }
      } catch {
        // 忽略错误
      } finally {
        if (mounted) {
          setAuthChecked(true);
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  // 统计数据
  const total = projects.length;
  const successCount = projects.filter((p) => p.status === 'done').length;
  const failedCount = projects.filter((p) => p.status === 'failed').length;

  // 未登录提示
  if (authChecked && !loading && projects.length === 0 && total === 0) {
    // 二次确认是否真的未登录（区分无项目和未登录）
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-forge-ink">仪表盘</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatsCard label="项目总数" value={0} icon="total" />
          <StatsCard label="构建成功" value={0} icon="success" />
          <StatsCard label="构建失败" value={0} icon="failed" />
        </div>
        <div className="forge-card flex flex-col items-center justify-center py-16 text-center">
          <svg
            className="h-12 w-12 text-forge-muted"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <p className="mt-4 text-forge-ink">请先登录以查看项目</p>
          <p className="mt-1 text-sm text-forge-muted">
            使用 GitHub 账号登录后即可开始创建项目
          </p>
          <a
            href="/api/auth?action=login"
            className="forge-btn-secondary mt-4 text-sm"
          >
            使用 GitHub 登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-forge-ink">仪表盘</h1>
        <Link href="/" className="forge-btn-primary text-sm">
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 110 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
          </svg>
          新建项目
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatsCard label="项目总数" value={total} icon="total" />
        <StatsCard label="构建成功" value={successCount} icon="success" />
        <StatsCard label="构建失败" value={failedCount} icon="failed" />
      </div>

      {/* 项目列表 */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-forge-ink">我的项目</h2>
        <ProjectList projects={projects} loading={loading} />
      </div>
    </div>
  );
}
