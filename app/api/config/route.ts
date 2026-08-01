import { NextResponse } from "next/server";
import { getSetting, SETTING_KEYS } from "@/lib/settings";

/**
 * 配置状态检查路由 (公开，无需管理员登录)
 *
 * GET: 返回系统关键配置的配置状态（不返回具体值，仅返回是否已配置）
 *   - forgeRepoConfigured: Forge 仓库是否已配置
 *   - aiProviderConfigured: 是否有至少一个 AI Provider 已配置
 *   - systemConfigured: 系统是否已完成基本配置
 */
export async function GET() {
  try {
    const [forgeRepoOwner, forgeRepoName, githubToken, githubClientId] =
      await Promise.all([
        getSetting(SETTING_KEYS.FORGE_REPO_OWNER),
        getSetting(SETTING_KEYS.FORGE_REPO_NAME),
        getSetting(SETTING_KEYS.GITHUB_TOKEN),
        getSetting(SETTING_KEYS.GITHUB_CLIENT_ID),
      ]);

    return NextResponse.json({
      forgeRepoConfigured: Boolean(forgeRepoOwner && forgeRepoName),
      systemConfigured: Boolean(githubToken && githubClientId),
      aiProviderConfigured: Boolean(githubToken), // GitHub Models uses GITHUB_TOKEN
    });
  } catch (error) {
    console.error("[config GET] error:", error);
    return NextResponse.json(
      {
        forgeRepoConfigured: false,
        systemConfigured: false,
        aiProviderConfigured: false,
      },
      { status: 200 }
    );
  }
}
