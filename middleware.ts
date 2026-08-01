import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: 系统配置检查 + 登录验证
 *
 * 两层保护：
 * 1. Setup 检查：未配置时跳转到 /setup（cookie: forge-setup）
 * 2. 登录检查：/dashboard、/project、/new 需要登录（cookie: forge-auth）
 *
 * 注意：Edge Runtime 不支持 Prisma，因此通过 cookie 标记判断状态
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

  // -------------------- 第一层：Setup 检查 --------------------
  const setupComplete = request.cookies.get("forge-setup");
  if (!setupComplete) {
    const setupUrl = new URL("/setup", request.url);
    return NextResponse.redirect(setupUrl);
  }

  // -------------------- 第二层：登录检查 --------------------
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
