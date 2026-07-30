import { NextResponse } from "next/server";
import {
  getSession,
  getGithubAuthUrl,
  exchangeCodeForToken,
  getGithubUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 认证路由
 * 通过 ?action= 参数区分不同操作：
 *  - login    : 重定向到 GitHub OAuth 授权页面
 *  - callback : 处理 OAuth 回调，换 token、获取用户、建/更新 User、写 session，重定向到 /dashboard
 *  - status   : 返回当前登录状态 JSON { isLoggedIn, username, avatarUrl }
 *  - logout   : 清除 session，重定向到首页
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  try {
    // -------------------- 登录：重定向到 GitHub OAuth --------------------
    if (action === "login") {
      const authUrl = await getGithubAuthUrl();
      return NextResponse.redirect(authUrl);
    }

    // -------------------- 回调：用 code 换 token --------------------
    if (action === "callback") {
      const code = searchParams.get("code");
      if (!code) {
        return NextResponse.json(
          { error: "Missing code parameter" },
          { status: 400 }
        );
      }

      // 用授权码换取 access_token
      const tokenData = await exchangeCodeForToken(code);
      if (!tokenData.access_token) {
        return NextResponse.json(
          { error: "Failed to exchange code for token" },
          { status: 400 }
        );
      }

      // 获取 GitHub 用户信息
      const githubUser = await getGithubUser(tokenData.access_token);
      if (!githubUser.id) {
        return NextResponse.json(
          { error: "Failed to fetch GitHub user" },
          { status: 400 }
        );
      }

      // 创建或更新 User 记录（以 githubId 为唯一键）
      const user = await prisma.user.upsert({
        where: { githubId: githubUser.id },
        update: {
          username: githubUser.login,
          email: githubUser.email,
          avatarUrl: githubUser.avatar_url,
          accessToken: tokenData.access_token,
        },
        create: {
          githubId: githubUser.id,
          username: githubUser.login,
          email: githubUser.email,
          avatarUrl: githubUser.avatar_url,
          accessToken: tokenData.access_token,
        },
      });

      // 写入 session
      const session = await getSession();
      session.userId = user.id;
      session.githubId = githubUser.id;
      session.username = githubUser.login;
      session.accessToken = tokenData.access_token;
      session.isLoggedIn = true;
      await session.save();

      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // -------------------- 登出：清除 session --------------------
    if (action === "logout") {
      const session = await getSession();
      session.destroy();
      return NextResponse.redirect(new URL("/", request.url));
    }

    // -------------------- 状态：返回登录信息 --------------------
    // action === "status" 或不带 action
    const session = await getSession();
    if (session.isLoggedIn && session.userId) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { username: true, avatarUrl: true },
      });
      return NextResponse.json({
        isLoggedIn: true,
        username: user?.username || session.username || null,
        avatarUrl: user?.avatarUrl || null,
      });
    }

    return NextResponse.json({
      isLoggedIn: false,
      username: null,
      avatarUrl: null,
    });
  } catch (error) {
    console.error("[auth] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
