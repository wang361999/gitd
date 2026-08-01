import { NextResponse } from "next/server";
import {
  getSetting,
  SETTING_KEYS,
  clearSettingsCache,
} from "@/lib/settings";
import { PROVIDERS, testProviderConnection } from "@/lib/ai-provider-config";

/**
 * 配置测试路由
 *
 * GET: 测试指定配置项是否有效
 *   ?type=github_token   - 测试 GitHub Token
 *   ?type=github_oauth   - 测试 GitHub OAuth App
 *   ?type=forge_repo     - 测试 Forge 仓库配置
 *   ?type=ai_provider&provider=github - 测试 AI Provider 连接
 *   ?type=all             - 测试所有配置
 */

const GITHUB_API = "https://api.github.com";

/** 检查请求是否已登录管理员 */
function checkAdmin(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .some((c) => c === "forge-admin=1");
}

/** 测试 GitHub Token */
async function testGithubToken(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const token = await getSetting(SETTING_KEYS.GITHUB_TOKEN);
  if (!token) {
    return { success: false, message: "GitHub Token 未配置" };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const latency = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `Token 有效，账号 @${data.login}，延迟 ${latency}ms`,
        details: { login: data.login, name: data.name, latency },
      };
    } else {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        message: `Token 验证失败 (${res.status}): ${errText.substring(0, 200)}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `连接异常: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/** 测试 GitHub OAuth App */
async function testGithubOauth(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const clientId = await getSetting(SETTING_KEYS.GITHUB_CLIENT_ID);
  const clientSecret = await getSetting(SETTING_KEYS.GITHUB_CLIENT_SECRET);

  if (!clientId) {
    return { success: false, message: "GitHub Client ID 未配置" };
  }
  if (!clientSecret) {
    return { success: false, message: "GitHub Client Secret 未配置" };
  }

  const startTime = Date.now();
  try {
    // 校验 Client ID 是否存在
    const res = await fetch(`${GITHUB_API}/applications/${clientId}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const latency = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `OAuth App「${data.name}」校验通过，延迟 ${latency}ms`,
        details: { appName: data.name, latency },
      };
    } else {
      return {
        success: false,
        message: `OAuth App 校验失败 (${res.status})，请检查 Client ID 是否正确`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `连接异常: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/** 测试 Forge 仓库配置 */
async function testForgeRepo(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const owner = await getSetting(SETTING_KEYS.FORGE_REPO_OWNER);
  const name = await getSetting(SETTING_KEYS.FORGE_REPO_NAME);
  const token = await getSetting(SETTING_KEYS.GITHUB_TOKEN);

  if (!owner) {
    return { success: false, message: "FORGE_REPO_OWNER 未配置" };
  }
  if (!name) {
    return { success: false, message: "FORGE_REPO_NAME 未配置" };
  }

  if (!token) {
    return {
      success: false,
      message: "无法验证仓库（GitHub Token 未配置）",
      details: { owner, name },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const latency = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `仓库 ${owner}/${name} 可访问，延迟 ${latency}ms`,
        details: {
          owner,
          name,
          private: data.private,
          defaultBranch: data.default_branch,
          latency,
        },
      };
    } else {
      return {
        success: false,
        message: `仓库 ${owner}/${name} 访问失败 (${res.status})，请确认仓库存在且有权限`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `连接异常: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/** 测试 AI Provider 连接 */
async function testAiProvider(providerName: string): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}> {
  const provider = PROVIDERS[providerName as keyof typeof PROVIDERS];
  if (!provider) {
    return { success: false, message: `未知的 Provider: ${providerName}` };
  }

  // 清除缓存确保读取最新配置
  clearSettingsCache();
  const result = await testProviderConnection(provider.name);
  return {
    success: result.success,
    message: result.message,
    details: { latency: result.latency, models: result.models },
  };
}

/** 测试所有配置 */
async function testAll(): Promise<{
  success: boolean;
  message: string;
  results: Record<string, { success: boolean; message: string }>;
}> {
  // 清除缓存确保读取最新配置
  clearSettingsCache();

  const [githubToken, githubOauth, forgeRepo] = await Promise.all([
    testGithubToken(),
    testGithubOauth(),
    testForgeRepo(),
  ]);

  // 测试所有已配置的 AI Provider
  const aiResults: Record<string, { success: boolean; message: string }> = {};
  for (const [name, config] of Object.entries(PROVIDERS)) {
    const apiKey = await getSetting(config.apiKeySettingKey);
    if (apiKey) {
      const result = await testAiProvider(name);
      aiResults[`ai_${name}`] = {
        success: result.success,
        message: result.message,
      };
    }
  }

  const results: Record<string, { success: boolean; message: string }> = {
    github_token: { success: githubToken.success, message: githubToken.message },
    github_oauth: { success: githubOauth.success, message: githubOauth.message },
    forge_repo: { success: forgeRepo.success, message: forgeRepo.message },
    ...aiResults,
  };

  const allSuccess = Object.values(results).every((r) => r.success);
  return {
    success: allSuccess,
    message: allSuccess
      ? "所有配置测试通过"
      : `${Object.values(results).filter((r) => !r.success).length} 项配置测试失败`,
    results,
  };
}

export async function GET(request: Request) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const provider = searchParams.get("provider");

    // 清除缓存确保读取最新配置
    clearSettingsCache();

    let result: { success: boolean; message: string; details?: Record<string, unknown> };

    switch (type) {
      case "github_token":
        result = await testGithubToken();
        break;
      case "github_oauth":
        result = await testGithubOauth();
        break;
      case "forge_repo":
        result = await testForgeRepo();
        break;
      case "ai_provider":
        if (!provider) {
          return NextResponse.json(
            { error: "缺少 provider 参数" },
            { status: 400 }
          );
        }
        result = await testAiProvider(provider);
        break;
      case "all":
        const allResult = await testAll();
        return NextResponse.json(allResult);
      default:
        return NextResponse.json(
          { error: `未知的测试类型: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin test GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
