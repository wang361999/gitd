import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: 登录验证
 *
 * 系统已配置完毕，不再强制跳转 /setup。
 * /setup 页面仍可通过直接访问 URL 进行重新配置。
 *
 * 受保护的路由需要登录（cookie: forge-auth）
 * 登录时由 /api/auth callback 设置 forge-auth=1
 * 登出时由 /api/auth logout 清除 forge-auth
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 不拦截的路径
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // -------------------- 登录检查 --------------------
  // 受保护的路由：需要登录才能访问
  const protectedPaths = ["/dashboard", "/project", "/new", "/governance", "/upload", "/schedules"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected) {
    const authCookie = request.cookies.get("forge-auth");
    if (!authCookie) {
      // 未登录，跳转到首页
      const homeUrl = new URL("/?login=required", request.url);
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|setup|admin|_next/static|_next/image|favicon.ico).*)"],
};
