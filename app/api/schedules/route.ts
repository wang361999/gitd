import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyRepoAccess } from "@/lib/github";

/**
 * 计算下次运行时间
 * - daily  : 明天同一时间
 * - weekly : 下周一
 * - monthly: 下月 1 号
 */
function calculateNextRunAt(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  } else {
    // weekly（默认）：下一个周一
    const day = next.getDay(); // 0=周日, 1=周一
    const daysUntilMonday = (8 - day) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
  }
  return next;
}

/**
 * 定时治理计划路由
 * GET  : 查询当前用户的所有定时计划
 * POST : 创建定时治理计划
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.userId!;

    const schedules = await prisma.governanceSchedule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[schedules] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const userId = session.userId!;

    const body = await request.json();
    const { repoOwner, repoName, frequency } = body ?? {};

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: "Missing required fields: repoOwner, repoName" },
        { status: 400 }
      );
    }

    const freq = frequency || "weekly";

    // 获取用户 token 并校验仓库 push 权限
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true },
    });
    if (!user?.accessToken) {
      return NextResponse.json(
        { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
        { status: 401 }
      );
    }
    const userToken = user.accessToken;

    const hasAccess = await verifyRepoAccess(userToken, repoOwner, repoName);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "无权访问该仓库或没有 push 权限" },
        { status: 403 }
      );
    }

    const nextRunAt = calculateNextRunAt(freq);

    const schedule = await prisma.governanceSchedule.create({
      data: {
        userId,
        repoOwner,
        repoName,
        frequency: freq,
        nextRunAt,
      },
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[schedules] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
