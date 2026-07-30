import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSetting,
  saveSettings,
  clearSettingsCache,
  ensureTablesExist,
  SETTING_KEYS,
} from "@/lib/settings";

/**
 * Admin 后台路由（第 10 个 Vercel 函数）
 *
 * 通过 HTTP method 与 query 参数区分操作，使用 cookie 维持管理员登录状态。
 *
 * 密码管理：
 *  - 默认密码存储在 settings 表中，key 为 "ADMIN_PASSWORD"
 *  - 首次访问且无 ADMIN_PASSWORD 时自动生成默认密码 "forge-admin-2026"
 *  - 登录验证通过后设置 cookie "forge-admin=1"（httpOnly, 7 天）
 *
 * GET:
 *  - action=status    : 返回 { isAdmin } 检查 cookie 是否已登录
 *  - action=settings  : 返回所有配置项（脱敏显示 secret 类配置）
 *  - action=projects  : 返回所有用户的所有项目列表（含用户名、状态、创建时间），支持分页
 *  - action=stats     : 返回统计信息
 *  - action=users     : 返回所有用户列表
 *
 * POST  : 登录（body 含 { action: "logout" } 时为退出登录）
 * PUT   : 更新配置
 * DELETE: 删除项目
 */

/** 管理员密码在 settings 表中的 key */
const ADMIN_PASSWORD_KEY = "ADMIN_PASSWORD";

/** 首次访问自动生成的默认密码 */
const DEFAULT_ADMIN_PASSWORD = "forge-admin-2026";

/** 登录 cookie 的有效期（7 天） */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** 需要脱敏的 key 关键词 */
const SECRET_KEYWORDS = ["SECRET", "TOKEN", "PASSWORD"];

// ============================================================
// 辅助函数
// ============================================================

/** 检查请求是否已登录管理员 */
function checkAdmin(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .some((c) => c === "forge-admin=1");
}

/**
 * 脱敏处理：SECRET / TOKEN / PASSWORD 类配置只显示前 4 后 4 位
 * 其余配置原样返回
 */
function maskValue(key: string, value: string): string {
  if (!value) return "";
  const isSecret = SECRET_KEYWORDS.some((kw) => key.toUpperCase().includes(kw));
  if (!isSecret) return value;
  if (value.length <= 8) {
    return "•".repeat(Math.max(value.length, 4));
  }
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`;
}

/**
 * 确保 settings 表中存在 ADMIN_PASSWORD
 * 不存在则写入默认密码 "forge-admin-2026"
 */
async function ensureDefaultPassword(): Promise<string> {
  const existing = await getSetting(ADMIN_PASSWORD_KEY);
  if (existing) return existing;

  await prisma.setting.upsert({
    where: { key: ADMIN_PASSWORD_KEY },
    create: {
      key: ADMIN_PASSWORD_KEY,
      value: DEFAULT_ADMIN_PASSWORD,
      category: "security",
    },
    update: { value: DEFAULT_ADMIN_PASSWORD },
  });

  // 清除配置缓存，保证后续读取立即可见
  clearSettingsCache();
  return DEFAULT_ADMIN_PASSWORD;
}

/** 构造登录成功响应并写入 cookie */
function buildLoginResponse() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("forge-admin", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

/** 构造退出登录响应并清除 cookie */
function buildLogoutResponse() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("forge-admin", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

// ============================================================
// GET
// ============================================================
export async function GET(request: Request) {
  try {
    await ensureTablesExist();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "status";

    // -------------------- status: 检查登录状态 --------------------
    if (action === "status") {
      return NextResponse.json({ isAdmin: checkAdmin(request) });
    }

    // 以下操作均需登录
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // -------------------- settings: 返回脱敏后的配置 --------------------
    if (action === "settings") {
      const allSettings = await getAllSettingsRaw();
      const masked: Record<string, string> = {};
      for (const [key, value] of Object.entries(allSettings)) {
        masked[key] = maskValue(key, value);
      }
      return NextResponse.json({ settings: masked });
    }

    // -------------------- projects: 所有用户的项目列表（分页） --------------------
    if (action === "projects") {
      const page = Math.max(
        1,
        parseInt(searchParams.get("page") || "1", 10)
      );
      const pageSize = Math.max(
        1,
        Math.min(100, parseInt(searchParams.get("pageSize") || "20", 10))
      );
      const skip = (page - 1) * pageSize;

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
          select: {
            id: true,
            name: true,
            projectType: true,
            status: true,
            repoUrl: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: { username: true },
            },
          },
        }),
        prisma.project.count(),
      ]);

      return NextResponse.json({
        projects,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    }

    // -------------------- stats: 统计信息 --------------------
    if (action === "stats") {
      const [
        totalUsers,
        totalProjects,
        totalTasks,
        totalGovernanceReports,
        statusGroups,
        recentProjects,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.project.count(),
        prisma.task.count(),
        prisma.governanceReport.count(),
        prisma.project.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
        prisma.project.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            status: true,
            projectType: true,
            createdAt: true,
            user: { select: { username: true } },
          },
        }),
      ]);

      const projectsByStatus: Record<string, number> = {
        draft: 0,
        building: 0,
        governing: 0,
        packaging: 0,
        done: 0,
        failed: 0,
      };
      for (const g of statusGroups) {
        projectsByStatus[g.status] = g._count.status;
      }

      return NextResponse.json({
        totalUsers,
        totalProjects,
        totalTasks,
        totalGovernanceReports,
        projectsByStatus,
        recentProjects,
      });
    }

    // -------------------- users: 所有用户列表 --------------------
    if (action === "users") {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          githubId: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
          _count: { select: { projects: true } },
        },
      });

      return NextResponse.json({ users });
    }

    return NextResponse.json({ error: "未知的 action" }, { status: 400 });
  } catch (error) {
    console.error("[admin GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * 获取所有配置（含 ADMIN_PASSWORD）的原始值
 * 不依赖 lib/settings 的 SETTING_KEYS 白名单，直接读取数据库
 */
async function getAllSettingsRaw(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ============================================================
// POST: 登录 / 退出登录
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // 退出登录：body 含 { action: "logout" } 时清除 cookie
    if (body?.action === "logout") {
      return buildLogoutResponse();
    }

    // 登录：验证密码
    const { password } = body ?? {};

    if (typeof password !== "string" || !password) {
      return NextResponse.json(
        { error: "请输入密码" },
        { status: 400 }
      );
    }

    // 确保默认密码存在（不存在则创建）
    const adminPassword = await ensureDefaultPassword();

    if (password !== adminPassword) {
      return NextResponse.json(
        { error: "密码错误" },
        { status: 401 }
      );
    }

    return buildLoginResponse();
  } catch (error) {
    console.error("[admin POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT: 更新配置
// ============================================================
export async function PUT(request: Request) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { settings } = body ?? {};

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "缺少 settings 字段" },
        { status: 400 }
      );
    }

    // 仅允许更新以下字段，未提供的保持不变
    const allowedKeys = [
      SETTING_KEYS.GITHUB_CLIENT_ID,
      SETTING_KEYS.GITHUB_CLIENT_SECRET,
      SETTING_KEYS.GITHUB_TOKEN,
      SETTING_KEYS.GITHUB_ORG,
      SETTING_KEYS.APP_URL,
    ];

    const toUpdate: Record<string, string> = {};
    for (const key of allowedKeys) {
      if (typeof settings[key] === "string" && settings[key].trim() !== "") {
        toUpdate[key] = settings[key].trim();
      }
    }

    if (Object.keys(toUpdate).length === 0) {
      return NextResponse.json(
        { error: "没有需要更新的配置项" },
        { status: 400 }
      );
    }

    await saveSettings(toUpdate);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin PUT] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE: 删除项目
// ============================================================
export async function DELETE(request: Request) {
  try {
    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "缺少项目 id 参数" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    // 级联删除（schema 已配置 onDelete: Cascade）
    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin DELETE] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
