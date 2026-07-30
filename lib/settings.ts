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
} as const;

/** 从数据库加载所有配置到缓存 */
async function loadSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() < cacheExpiry) {
    return cache;
  }

  const rows = await prisma.setting.findMany();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  cache = map;
  cacheExpiry = Date.now() + CACHE_TTL;
  return map;
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

/** 清除缓存（配置更新后调用） */
export function clearSettingsCache(): void {
  cache = null;
  cacheExpiry = 0;
}
