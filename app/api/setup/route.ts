import { NextResponse } from "next/server";
import {
  isConfigured,
  getSetting,
  saveSettings,
  generateSecret,
  SETTING_KEYS,
} from "@/lib/settings";

/**
 * Setup 路由
 *
 * GET  : 检查配置状态，自动检测 appUrl，返回各步骤配置情况
 * POST : 接收并保存配置，验证 GitHub Token（必填）与 OAuth App（可选，不阻塞），
 *        自动生成 SESSION_SECRET / WEBHOOK_SECRET，写入数据库，并返回脱敏概览与回调地址
 */

const GITHUB_API = "https://api.github.com";

/** 通用 GitHub API 请求头 */
function ghHeaders(token?: string): Record<string, string> {
  return {
    Authorization: token ? `Bearer ${token}` : "",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** 从请求头检测应用 URL（Vercel 会注入 x-forwarded-host） */
function detectAppUrlFromHeaders(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (!host) return "http://localhost:3000";

  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  return `${isLocal ? "http" : "https"}://${host}`;
}

/**
 * 综合检测应用 URL
 * 优先级：VERCEL_URL -> NEXT_PUBLIC_APP_URL -> 请求头 host
 */
function detectAppUrl(request: Request): string {
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicAppUrl) return publicAppUrl;
  return detectAppUrlFromHeaders(request);
}

/** 脱敏：保留前 prefix 位与后 4 位，中间用 • 填充 */
function maskSecret(value: string, prefix = 4): string {
  if (!value) return "";
  if (value.length <= prefix + 4) {
    return "•".repeat(Math.max(value.length, 4));
  }
  return `${value.slice(0, prefix)}${"•".repeat(8)}${value.slice(-4)}`;
}

// ============================================================
// GET: 检查配置状态
// ============================================================
export async function GET(request: Request) {
  try {
    const configured = await isConfigured();
    const appUrl = detectAppUrl(request);

    const [clientId, clientSecret, token, org, sessionSecret, webhookSecret, savedAppUrl] =
      await Promise.all([
        getSetting(SETTING_KEYS.GITHUB_CLIENT_ID),
        getSetting(SETTING_KEYS.GITHUB_CLIENT_SECRET),
        getSetting(SETTING_KEYS.GITHUB_TOKEN),
        getSetting(SETTING_KEYS.GITHUB_ORG),
        getSetting(SETTING_KEYS.SESSION_SECRET),
        getSetting(SETTING_KEYS.WEBHOOK_SECRET),
        getSetting(SETTING_KEYS.APP_URL),
      ]);

    const steps = [
      {
        key: "github_oauth",
        label: "GitHub OAuth App",
        configured: Boolean(clientId && clientSecret),
      },
      {
        key: "github_token",
        label: "GitHub Token",
        configured: Boolean(token),
      },
      {
        key: "secrets",
        label: "安全密钥",
        configured: Boolean(sessionSecret && webhookSecret),
      },
      {
        key: "app_url",
        label: "应用 URL",
        configured: Boolean(savedAppUrl || appUrl),
      },
    ];

    return NextResponse.json({
      configured,
      appUrl,
      steps,
    });
  } catch (error) {
    console.error("[setup GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// POST: 保存配置
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      githubClientId,
      githubClientSecret,
      githubToken,
      githubOrg,
      appUrl: bodyAppUrl,
      // 可选：客户端预生成的密钥（若提供则直接使用，保持页面展示与实际保存一致）
      sessionSecret: providedSessionSecret,
      webhookSecret: providedWebhookSecret,
    } = body ?? {};

    // -------------------- 基本参数校验 --------------------
    if (!githubClientId || !githubClientSecret || !githubToken) {
      return NextResponse.json(
        {
          error:
            "缺少必填项：githubClientId、githubClientSecret、githubToken 均为必填",
        },
        { status: 400 }
      );
    }

    // -------------------- 验证 GitHub Token（必填，阻塞）--------------------
    const userRes = await fetch(`${GITHUB_API}/user`, {
      headers: ghHeaders(githubToken),
    });

    if (!userRes.ok) {
      let detail = `GitHub 返回状态码 ${userRes.status}`;
      try {
        const errJson = await userRes.json();
        detail = errJson.message || detail;
      } catch {
        /* 保持默认 detail */
      }
      return NextResponse.json(
        { error: `GitHub Token 验证失败：${detail}` },
        { status: 400 }
      );
    }

    const githubUser = await userRes.json();

    // -------------------- 验证 OAuth App（可选，不阻塞）--------------------
    // GET /applications/{client_id} 是公开端点，可校验 Client ID 是否真实存在
    let oauthApp:
      | { valid: boolean; name?: string; message?: string }
      | null = null;
    try {
      const appRes = await fetch(`${GITHUB_API}/applications/${githubClientId}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (appRes.ok) {
        const appData = await appRes.json();
        oauthApp = { valid: true, name: appData.name };
      } else {
        oauthApp = {
          valid: false,
          message: `OAuth App 校验返回 ${appRes.status}（不阻塞，可继续完成配置）`,
        };
      }
    } catch {
      oauthApp = {
        valid: false,
        message: "无法连接 GitHub 校验 OAuth App（不阻塞，可继续完成配置）",
      };
    }

    // -------------------- 确定 appUrl --------------------
    const appUrl =
      (typeof bodyAppUrl === "string" && bodyAppUrl.trim()) ||
      detectAppUrlFromHeaders(request);

    // -------------------- 自动生成密钥 --------------------
    // 若客户端提供了预生成密钥则直接采用（保证页面展示与入库一致），否则服务端生成
    const sessionSecret =
      (typeof providedSessionSecret === "string" && providedSessionSecret.trim()) ||
      generateSecret(48);
    const webhookSecret =
      (typeof providedWebhookSecret === "string" && providedWebhookSecret.trim()) ||
      generateSecret(48);

    // -------------------- 写入数据库 --------------------
    await saveSettings({
      [SETTING_KEYS.GITHUB_CLIENT_ID]: githubClientId,
      [SETTING_KEYS.GITHUB_CLIENT_SECRET]: githubClientSecret,
      [SETTING_KEYS.GITHUB_TOKEN]: githubToken,
      [SETTING_KEYS.GITHUB_ORG]: githubOrg || "",
      [SETTING_KEYS.SESSION_SECRET]: sessionSecret,
      [SETTING_KEYS.WEBHOOK_SECRET]: webhookSecret,
      [SETTING_KEYS.APP_URL]: appUrl,
    });

    // -------------------- 生成回调地址 --------------------
    const oauthCallbackUrl = `${appUrl}/api/auth?action=callback`;
    const webhookUrl = `${appUrl}/api/webhook`;

    // -------------------- 脱敏后的配置概览 --------------------
    const settingsOverview = {
      GITHUB_CLIENT_ID: githubClientId,
      GITHUB_CLIENT_SECRET: maskSecret(githubClientSecret),
      GITHUB_TOKEN: maskSecret(githubToken),
      GITHUB_ORG: githubOrg || "（创建在用户账号下）",
      APP_URL: appUrl,
      SESSION_SECRET: maskSecret(sessionSecret),
      WEBHOOK_SECRET: maskSecret(webhookSecret),
    };

    // -------------------- 设置 cookie 标记（供 middleware 跳转判断）--------------------
    const response = NextResponse.json({
      success: true,
      settings: settingsOverview,
      oauthCallbackUrl,
      webhookUrl,
      githubUser: {
        login: githubUser.login,
        name: githubUser.name || null,
      },
      oauthApp,
      // 供页面展示实际密钥值（用于复制到 GitHub 仓库 Secrets）
      generatedSecrets: {
        SESSION_SECRET: sessionSecret,
        WEBHOOK_SECRET: webhookSecret,
      },
      actionsSecrets: {
        PAT_TOKEN: "需在 GitHub 仓库 Secrets 中配置（值同 GitHub Token）",
        WEBHOOK_SECRET: "需在 GitHub 仓库 Secrets 中配置（值同上方生成的密钥）",
        GITHUB_TOKEN: "需在 GitHub 仓库 Secrets 中配置（值同 GitHub Token）",
      },
    });

    // 设置配置完成标记 cookie（有效期 365 天）
    response.cookies.set("forge-setup", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error("[setup POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
