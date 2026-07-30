import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: 未配置时自动跳转到 /setup
 *
 * 工作原理：
 * - Setup 完成后，/api/setup POST 会设置 cookie `forge-setup=1`
 * - Middleware 检查此 cookie，不存在则跳转到 /setup
 * - API 路由和 /setup 页面本身不受此规则限制
 *
 * 注意：此方案基于 cookie 标记，不依赖数据库查询（Edge Runtime 不支持 Prisma）
 * 如果用户清除 cookie，可手动访问 /setup 重新配置
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

  // 检查 setup 完成标记
  const setupComplete = request.cookies.get("forge-setup");
  if (!setupComplete) {
    const setupUrl = new URL("/setup", request.url);
    return NextResponse.redirect(setupUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|setup|admin|_next/static|_next/image|favicon.ico).*)"],
};
