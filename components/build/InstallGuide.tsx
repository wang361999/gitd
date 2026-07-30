'use client';

import { useEffect, useState } from 'react';

interface InstallGuideProps {
  projectId: string;
  projectType: string;
  repoUrl?: string | null;
}

export default function InstallGuide({
  projectId,
  projectType,
  repoUrl,
}: InstallGuideProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadGuide() {
      try {
        const res = await fetch(`/api/projects?id=${projectId}`);
        if (!res.ok) {
          setError('加载失败');
          return;
        }
        const data = await res.json();
        const project = data.project || data;

        // 尝试从 versions 的 releaseNotes 获取安装说明
        if (project.versions && project.versions.length > 0) {
          const latest = project.versions[0];
          if (latest.releaseNotes) {
            if (mounted) {
              setContent(latest.releaseNotes);
              setLoading(false);
            }
            return;
          }
        }

        // 没有自定义安装说明时，使用默认模板
        if (mounted) {
          setContent(getDefaultGuide(projectType, repoUrl));
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setError('网络错误');
          setLoading(false);
        }
      }
    }
    loadGuide();
    return () => {
      mounted = false;
    };
  }, [projectId, projectType, repoUrl]);

  if (loading) {
    return (
      <div className="forge-card p-6">
        <div className="h-6 w-32 animate-forge-pulse rounded bg-forge-border" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full animate-forge-pulse rounded bg-forge-border" />
          <div className="h-4 w-3/4 animate-forge-pulse rounded bg-forge-border" />
          <div className="h-4 w-5/6 animate-forge-pulse rounded bg-forge-border" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forge-card p-6 text-center text-sm text-forge-muted">
        {error}
      </div>
    );
  }

  // 简单的 Markdown 渲染
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: React.ReactElement[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    lines.forEach((line, i) => {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${i}`}
              className="my-2 overflow-x-auto rounded-lg border border-forge-border bg-forge-bg p-3 text-xs"
            >
              <code className="font-mono text-forge-ink">{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }

      if (line.startsWith('# ')) {
        elements.push(
          <h3 key={i} className="mt-4 mb-2 text-lg font-bold text-forge-ink">
            {line.slice(2)}
          </h3>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h4 key={i} className="mt-3 mb-1.5 text-base font-semibold text-forge-ink">
            {line.slice(3)}
          </h4>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={i} className="ml-4 list-disc text-sm text-forge-ink">
            {renderInline(line.slice(2))}
          </li>
        );
      } else if (line.startsWith('1. ') || /^\d+\.\s/.test(line)) {
        elements.push(
          <li key={i} className="ml-4 list-decimal text-sm text-forge-ink">
            {renderInline(line.replace(/^\d+\.\s/, ''))}
          </li>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(
          <p key={i} className="text-sm leading-relaxed text-forge-ink">
            {renderInline(line)}
          </p>
        );
      }
    });

    return elements;
  };

  const renderInline = (text: string) => {
    // 处理 `code` 和 **bold**
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="rounded bg-forge-bg px-1.5 py-0.5 font-mono text-xs text-forge-purple"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-forge-ink">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="forge-card p-6 forge-animate-fade-in">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-forge-ink">
        <svg
          className="h-5 w-5 text-forge-accent"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M0 1.75A.75.75 0 01.75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0111.006 1h4.245a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-4.507a2.25 2.25 0 00-1.591.659l-.622.621a.75.75 0 01-1.06 0l-.622-.621A2.25 2.25 0 005.258 13H.75a.75.75 0 01-.75-.75V1.75zm8.755 3a2.25 2.25 0 012.25-2.25H14.5v9h-3.757l-.622.621A3.75 3.75 0 017.755 12.5V4.75zM1.5 2.75v9h3.757a3.75 3.75 0 011.591.341l.622.621.622-.621a3.75 3.75 0 011.591-.341H14.5v-9h-3.493a2.25 2.25 0 00-2.25 2.25v6.5a.75.75 0 01-1.5 0v-6.5z" />
        </svg>
        安装说明
      </h3>
      <div className="space-y-1">{renderMarkdown(content)}</div>
    </div>
  );
}

function getDefaultGuide(projectType: string, repoUrl?: string | null): string {
  const repoText = repoUrl ? `GitHub 仓库：${repoUrl}` : '';

  if (projectType === 'web') {
    return `## Web 应用安装说明

**环境要求**
- Node.js 18+ 
- npm 或 pnpm

**安装步骤**
1. 克隆仓库
${repoUrl ? `\`git clone ${repoUrl}\`` : '`git clone <仓库地址>`'}
2. 安装依赖
\`\`\`bash
npm install
\`\`\`
3. 启动开发服务器
\`\`\`bash
npm run dev
\`\`\`
4. 打开浏览器访问 http://localhost:3000

**部署**
- 推送到 GitHub 后在 Vercel 导入仓库即可自动部署

**常见问题**
- 如果依赖安装失败，尝试删除 \`node_modules\` 和 \`package-lock.json\` 后重新安装
- 确保 Node.js 版本 >= 18`;
  }

  if (projectType === 'desktop') {
    return `## 桌面应用安装说明

**环境要求**
- Node.js 18+
- npm

**安装步骤**
1. 克隆仓库
${repoUrl ? `\`git clone ${repoUrl}\`` : '`git clone <仓库地址>`'}
2. 安装依赖
\`\`\`bash
npm install
\`\`\`
3. 开发模式运行
\`\`\`bash
npm run dev
\`\`\`

**打包构建**
- Windows: \`npm run build:win\` 生成 .exe 安装包
- macOS: \`npm run build:mac\` 生成 .dmg 安装包

**直接下载安装**
- 从 GitHub Releases 下载对应平台的安装包
- Windows: 双击 .exe 文件安装
- macOS: 打开 .dmg 文件拖拽到 Applications 文件夹

**常见问题**
- Windows 打包需要 Windows 环境
- macOS 打包需要 macOS 环境
- 首次启动可能被系统拦截，请在系统设置中允许运行`;
  }

  return `## 移动应用安装说明

**环境要求**
- Node.js 18+
- JDK 17
- Android Studio / Android SDK

**安装步骤**
1. 克隆仓库
${repoUrl ? `\`git clone ${repoUrl}\`` : '`git clone <仓库地址>`'}
2. 安装依赖
\`\`\`bash
npm install
\`\`\`
3. 构建 APK
\`\`\`bash
cd android && ./gradlew assembleRelease
\`\`\`

**直接安装 APK**
- 从 GitHub Releases 下载 .apk 文件
- 传输到 Android 设备
- 在设备上允许"安装未知来源应用"
- 点击 .apk 文件进行安装

**常见问题**
- 安装失败请检查 Android 版本是否兼容
- 需要在设备设置中开启"允许安装未知来源"`;
}
