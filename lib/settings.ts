/**
 * 系统配置管理器
 * 所有配置存储在数据库 settings 表中，不再依赖环境变量
 * 唯一需要的环境变量是 DATABASE_URL（由 Vercel Neon 集成自动提供）
 */

import { prisma } from "./prisma";

// 缓存，避免每次请求都查数据库
let cache: Map<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 30_000; // 30秒缓存

// 表是否已初始化的标记
let tablesInitialized = false;

/** 所有配置项的 key 定义 */
export const SETTING_KEYS = {
  // GitHub OAuth
  GITHUB_CLIENT_ID: "GITHUB_CLIENT_ID",
  GITHUB_CLIENT_SECRET: "GITHUB_CLIENT_SECRET",
  // GitHub Token (系统级)
  GITHUB_TOKEN: "GITHUB_TOKEN",
  // 组织名（可选）
  GITHUB_ORG: "GITHUB_ORG",
  // Session 加密密钥
  SESSION_SECRET: "SESSION_SECRET",
  // Webhook 验证密钥
  WEBHOOK_SECRET: "WEBHOOK_SECRET",
  // 应用 URL
  APP_URL: "APP_URL",
  // Admin 密码
  ADMIN_PASSWORD: "ADMIN_PASSWORD",
  // Agent Forge 仓库信息（存放 workflow 文件的仓库）
  FORGE_REPO_OWNER: "FORGE_REPO_OWNER",
  FORGE_REPO_NAME: "FORGE_REPO_NAME",
} as const;

/**
 * 确保所有数据库表已创建
 * 使用 CREATE TABLE IF NOT EXISTS，幂等操作
 * 在首次访问数据库时自动调用
 */
export async function ensureTablesExist(): Promise<void> {
  if (tablesInitialized) return;

  try {
    // settings 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "settings" (
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'general',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
      );
    `);

    // users 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" TEXT NOT NULL,
        "githubId" INTEGER NOT NULL,
        "username" TEXT NOT NULL,
        "email" TEXT,
        "avatarUrl" TEXT,
        "accessToken" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "users_githubId_key" UNIQUE ("githubId")
      );
    `);

    // projects 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "projectType" TEXT NOT NULL DEFAULT 'web',
        "repoUrl" TEXT,
        "repoOwner" TEXT,
        "repoName" TEXT,
        "previewUrl" TEXT,
        "downloadUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
      );
    `);

    // tasks 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "stage" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "log" TEXT,
        "result" JSONB,
        "actionsRunId" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
      );
    `);

    // governance_reports 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "governance_reports" (
        "id" TEXT NOT NULL,
        "taskId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "filePath" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "modelName" TEXT,
        "lineCount" INTEGER NOT NULL DEFAULT 0,
        "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "issues" JSONB NOT NULL,
        "reviewed" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "governance_reports_pkey" PRIMARY KEY ("id")
      );
    `);

    // lore_records 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "lore_records" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "commitSha" TEXT NOT NULL,
        "context" TEXT NOT NULL,
        "decision" TEXT NOT NULL,
        "rejected" TEXT,
        "constraints" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "lore_records_pkey" PRIMARY KEY ("id")
      );
    `);

    // versions 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "versions" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "versionTag" TEXT NOT NULL,
        "releaseUrl" TEXT,
        "downloadUrl" TEXT,
        "releaseNotes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "versions_pkey" PRIMARY KEY ("id")
      );
    `);

    // governance_schedules 表
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "governance_schedules" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "repoOwner" TEXT NOT NULL,
        "repoName" TEXT NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'weekly',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "lastRunAt" TIMESTAMP(3),
        "nextRunAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "governance_schedules_pkey" PRIMARY KEY ("id")
      );
    `);

    // 外键约束（单独添加，避免 IF NOT EXISTS 不支持约束名检查）
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_userId_fkey') THEN
          ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_projectId_fkey') THEN
          ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_reports_taskId_fkey') THEN
          ALTER TABLE "governance_reports" ADD CONSTRAINT "governance_reports_taskId_fkey"
          FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_reports_projectId_fkey') THEN
          ALTER TABLE "governance_reports" ADD CONSTRAINT "governance_reports_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lore_records_projectId_fkey') THEN
          ALTER TABLE "lore_records" ADD CONSTRAINT "lore_records_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'versions_projectId_fkey') THEN
          ALTER TABLE "versions" ADD CONSTRAINT "versions_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_schedules_userId_fkey') THEN
          ALTER TABLE "governance_schedules" ADD CONSTRAINT "governance_schedules_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    tablesInitialized = true;
  } catch (error) {
    console.error("[ensureTablesExist] Error creating tables:", error);
    // 即使出错也标记为已初始化，避免反复尝试
    tablesInitialized = true;
  }
}

/** 从数据库加载所有配置到缓存 */
async function loadSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() < cacheExpiry) {
    return cache;
  }

  await ensureTablesExist();

  try {
    const rows = await prisma.setting.findMany();
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.key, row.value);
    }
    cache = map;
    cacheExpiry = Date.now() + CACHE_TTL;
    return map;
  } catch (error) {
    // 如果查询失败，返回空 Map（回退到环境变量）
    console.error("[loadSettings] Error loading settings:", error);
    cache = new Map();
    cacheExpiry = Date.now() + CACHE_TTL;
    return cache;
  }
}

/** 获取单个配置项，优先从数据库读取，回退到环境变量 */
export async function getSetting(key: string): Promise<string | undefined> {
  const settings = await loadSettings();
  const dbValue = settings.get(key);
  if (dbValue) return dbValue;
  // 回退到环境变量（向后兼容）
  return process.env[key];
}

/** 获取单个配置项，不存在则抛错 */
export async function requireSetting(key: string): Promise<string> {
  const value = await getSetting(key);
  if (!value) {
    throw new Error(`Missing required setting: ${key}. Please run /setup first.`);
  }
  return value;
}

/** 获取所有配置 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await loadSettings();
  const result: Record<string, string> = {};
  for (const key of Object.values(SETTING_KEYS)) {
    const val = settings.get(key) || process.env[key] || "";
    if (val) result[key] = val;
  }
  return result;
}

/** 检查系统是否已配置 */
export async function isConfigured(): Promise<boolean> {
  const required = [
    SETTING_KEYS.GITHUB_CLIENT_ID,
    SETTING_KEYS.GITHUB_CLIENT_SECRET,
    SETTING_KEYS.GITHUB_TOKEN,
    SETTING_KEYS.SESSION_SECRET,
    SETTING_KEYS.WEBHOOK_SECRET,
    SETTING_KEYS.APP_URL,
  ];
  const settings = await loadSettings();
  for (const key of required) {
    const val = settings.get(key) || process.env[key];
    if (!val) return false;
  }
  return true;
}

/** 批量保存配置到数据库 */
export async function saveSettings(settings: Record<string, string>): Promise<void> {
  await ensureTablesExist();

  const promises = Object.entries(settings).map(([key, value]) =>
    prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value,
        category: categorizeKey(key),
      },
      update: { value },
    })
  );
  await Promise.all(promises);

  // 清除缓存
  cache = null;
}

/** 判断配置项的分类 */
function categorizeKey(key: string): string {
  if (key.startsWith("GITHUB_")) return "github";
  if (key === "SESSION_SECRET" || key === "WEBHOOK_SECRET") return "security";
  return "app";
}

/** 生成随机密钥 */
export function generateSecret(length: number = 48): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/** 获取 APP_URL（用于构建回调地址等） */
export async function getAppUrl(): Promise<string> {
  // 优先从数据库读取
  const dbUrl = await getSetting(SETTING_KEYS.APP_URL);
  if (dbUrl) return dbUrl;
  // 回退到 Vercel 自动注入的环境变量
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  );
}

/** 获取 Agent Forge 仓库信息（存放 workflow 的仓库） */
export async function getForgeRepo(): Promise<{ owner: string; name: string }> {
  const owner = await getSetting(SETTING_KEYS.FORGE_REPO_OWNER);
  const name = await getSetting(SETTING_KEYS.FORGE_REPO_NAME);
  if (!owner || !name) {
    throw new Error(
      "Forge 仓库信息未配置，请在后台设置 FORGE_REPO_OWNER 和 FORGE_REPO_NAME"
    );
  }
  return { owner, name };
}

/** 清除缓存（配置更新后调用） */
export function clearSettingsCache(): void {
  cache = null;
  cacheExpiry = 0;
}
