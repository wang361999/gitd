import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 项目路由
 * GET:
 *  - 无 id        : 返回当前用户的项目列表（分页 page/pageSize）
 *  - ?id=xxx      : 返回单个项目详情（含 tasks、governanceReports 概览）
 * DELETE:
 *  - ?id=xxx      : 删除项目（仅限自己的项目）
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    // -------------------- 单个项目详情 --------------------
    if (id) {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          tasks: {
            orderBy: { createdAt: "desc" },
          },
          governanceReports: {
            select: {
              id: true,
              filePath: true,
              source: true,
              modelName: true,
              riskScore: true,
              lineCount: true,
              reviewed: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { loreRecords: true, versions: true },
          },
        },
      });

      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      // 权限校验：只能查看自己的项目
      if (project.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({ project });
    }

    // -------------------- 项目列表（分页） --------------------
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") || "10", 10)));
    const skip = (page - 1) * pageSize;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          projectType: true,
          status: true,
          repoUrl: true,
          previewUrl: true,
          downloadUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.project.count({ where: { userId: session.userId } }),
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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[projects GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing project id" }, { status: 400 });
    }

    // 先查询确认归属权
    const project = await prisma.project.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 级联删除（schema 中已配置 onDelete: Cascade，会一并删除关联的 tasks 等记录）
    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[projects DELETE] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
