const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 生成构建版本号
 * 每次 build 时生成唯一版本号，用于客户端强制刷新
 */
function getBuildVersion() {
  const timestamp = Date.now();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  let gitHash = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // 非 git 环境
  }

  return `${dateStr}-${gitHash}-${timestamp}`;
}

// 构建时生成版本号
const BUILD_VERSION = getBuildVersion();

// 将版本号写入 public 目录，供客户端 fetch 对比
const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
fs.writeFileSync(path.resolve(publicDir, 'version.txt'), BUILD_VERSION, 'utf-8');

console.log(`[next.config] Build version: ${BUILD_VERSION}`);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 使用动态版本号作为 buildId，确保每次部署后客户端能检测到变化
  generateBuildId: () => BUILD_VERSION,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@octokit/rest'],
  },
  // 通过环境变量将版本号注入应用
  env: {
    NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
  },
};

module.exports = nextConfig;
