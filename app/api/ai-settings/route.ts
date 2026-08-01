/**
 * AI Provider 配置 API（需要管理员权限）
 *
 * 通过 cookie "forge-admin=1" 鉴权（与 /api/admin 保持一致）。
 * 使用 settings 表存储 AI 相关配置。
 *
 * GET:
 *   返回当前 AI 配置（apiKey 等敏感字段脱敏）
 * PUT:
 *   更新 AI 配置 { provider, apiKey, baseUrl, defaultModel, ... }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  saveSettings,
  clearSettingsCache,
} from "@/lib/settings";

/** AI 配置在 settings 表中使用的 key 前缀 */
const AI_SETTING_PREFIX = "AI_PROVIDER_";

/** 允许配置的字段 */
const AI_CONFIG_FIELDS = [
  "provider", // 提供商：github-models | openai | anthropic | azure 等
  "apiKey", // API 密钥
  "baseUrl", // 自定义 API 基础地址
  "defaultModel", // 默认模型
  "organization", // 组织（OpenAI）
  "apiVersion", // API 版本（Azure）
  "maxTokens", // 默认最大输出 token
  "temperature", // 默认温度
] as const;

/** 需要脱敏的字段 */
const SENSITIVE_FIELDS = ["apiKey"];

/** 检查请求是否已登录管理员 */
function checkAdmin(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .some((c) => c === "forge-admin=1");
}

/** 脱敏处理 */
function maskValue(field: string, value: string): string {
  if (!value) return "";
  if (!SENSITIVE_FIELDS.includes(field)) return value;
  if (value.length <= 8) return "•".repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`;
}

/** 从数据库读取所有 AI 配置 */
async function loadAiConfig(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: AI_SETTING_PREFIX } },
  });
  const result: Record<string, string> = {};
  for (const row of rows) {
    const field = row.key.slice(AI_SETTING_PREFIX.length);
    result[field] = row.value;
  }
  return result;
}

export async function GET(request: Request) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录，需要管理员权限" }, { status: 401 });
    }

    const rawConfig = await loadAiConfig();

    // 脱敏处理后返回
    const masked: Record<string, string> = {};
    for (const [field, value] of Object.entries(rawConfig)) {
      masked[field] = maskValue(field, value);
    }

    return NextResponse.json({
      config: masked,
      fields: AI_CONFIG_FIELDS,
    });
  } catch (error) {
    console.error("[ai-settings GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录，需要管理员权限" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { config } = body ?? {};

    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "缺少 config 字段" },
        { status: 400 }
      );
    }

    // 仅允许更新白名单字段，构建 settings 表的 key-value
    const toUpdate: Record<string, string> = {};
    for (const field of AI_CONFIG_FIELDS) {
      const value = (config as Record<string, unknown>)[field];
      if (typeof value === "string" && value.trim() !== "") {
        // 跳过脱敏占位符（全是 • 或类似），避免误覆盖
        if (SENSITIVE_FIELDS.includes(field) && /^[•\s]+$/.test(value)) {
          continue;
        }
        toUpdate[`${AI_SETTING_PREFIX}${field}`] = value.trim();
      } else if (typeof value === "number") {
        toUpdate[`${AI_SETTING_PREFIX}${field}`] = String(value);
      }
    }

    if (Object.keys(toUpdate).length === 0) {
      return NextResponse.json(
        { error: "没有需要更新的配置项" },
        { status: 400 }
      );
    }

    await saveSettings(toUpdate);
    clearSettingsCache();

    // 返回脱敏后的最新配置
    const rawConfig = await loadAiConfig();
    const masked: Record<string, string> = {};
    for (const [field, value] of Object.entries(rawConfig)) {
      masked[field] = maskValue(field, value);
    }

    return NextResponse.json({
      success: true,
      config: masked,
    });
  } catch (error) {
    console.error("[ai-settings PUT] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
