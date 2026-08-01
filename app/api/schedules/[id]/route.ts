import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 单个定时治理计划路由
 * PATCH  : 启用/停用计划
 * DELETE : 删除计划
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.userId!;
    const { id } = params;

    const body = await request.json();
    const { enabled } = body ?? {};

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid field: enabled" },
        { status: 400 }
      );
    }

    // 验证计划归属
    const existing = await prisma.governanceSchedule.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const schedule = await prisma.governanceSchedule.update({
      where: { id },
      data: { enabled },
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[schedule] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.userId!;
    const { id } = params;

    // 验证计划归属
    const existing = await prisma.governanceSchedule.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.governanceSchedule.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[schedule] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
