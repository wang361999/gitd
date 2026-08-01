/**
 * 知识库 API
 *
 * GET:
 *   ?projectId=xxx  获取项目关联的知识条目
 *   ?agentId=xxx    获取 Agent 关联的知识条目
 *   ?category=xxx   按分类筛选（architecture | bug | decision | convention | general）
 *   ?q=xxx          按关键词搜索 question/answer
 * POST:
 *   { projectId?, agentId?, category, question, answer, source? }
 *   添加知识条目
 * DELETE:
 *   ?id=xxx  删除知识条目
 *
 * 知识库用于存储项目/Agent 相关的问答对，可供 AI 在生成、审查等环节引用。
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 允许的分类 */
const ALLOWED_CATEGORIES = [
  "general",
  "architecture",
  "bug",
  "decision",
  "convention",
] as const;

/** 允许的来源 */
const ALLOWED_SOURCES = ["commit", "manual", "ai-generated"];

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const agentId = searchParams.get("agentId");
    const category = searchParams.get("category");
    const q = searchParams.get("q")?.trim() || "";

    // 至少需要指定 projectId 或 agentId 之一
    if (!projectId && !agentId) {
      return NextResponse.json(
        { error: "需要提供 projectId 或 agentId 参数" },
        { status: 400 }
      );
    }

    // 若按项目查询，需校验项目归属
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });
      if (!project) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      if (project.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 若按 Agent 查询，需校验 Agent 归属（公开 Agent 也可读）
    if (agentId) {
      const agent = await prisma.customAgent.findUnique({
        where: { id: agentId },
        select: { userId: true, isPublic: true },
      });
      if (!agent) {
        return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
      }
      if (!agent.isPublic && agent.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 构建查询条件
    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (agentId) where.agentId = agentId;
    if (category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category;
    }
    if (q) {
      where.OR = [
        { question: { contains: q, mode: "insensitive" } },
        { answer: { contains: q, mode: "insensitive" } },
      ];
    }

    const entries = await prisma.knowledgeEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[knowledge GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const { projectId, agentId, category, question, answer, source } = body ?? {};

    if (!question || !answer) {
      return NextResponse.json(
        { error: "缺少必填字段: question, answer" },
        { status: 400 }
      );
    }

    if (!projectId && !agentId) {
      return NextResponse.json(
        { error: "需要提供 projectId 或 agentId" },
        { status: 400 }
      );
    }

    // 校验项目归属
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });
      if (!project) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      if (project.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 校验 Agent 归属
    if (agentId) {
      const agent = await prisma.customAgent.findUnique({
        where: { id: agentId },
        select: { userId: true },
      });
      if (!agent) {
        return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
      }
      if (agent.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 校验分类
    const finalCategory =
      category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)
        ? category
        : "general";

    // 校验来源
    const finalSource =
      source && ALLOWED_SOURCES.includes(source) ? source : "manual";

    const entry = await prisma.knowledgeEntry.create({
      data: {
        projectId: projectId || null,
        agentId: agentId || null,
        category: finalCategory,
        question: String(question),
        answer: String(answer),
        source: finalSource,
      },
    });

    // 若关联了 Agent，同步更新 Agent 的 knowledgeBase 字段
    if (agentId) {
      try {
        const agent = await prisma.customAgent.findUnique({
          where: { id: agentId },
          select: { knowledgeBase: true },
        });
        const kb =
          agent?.knowledgeBase && typeof agent.knowledgeBase === "object"
            ? (agent.knowledgeBase as { entries?: unknown[] })
            : { entries: [] };
        const entries = Array.isArray(kb.entries) ? kb.entries : [];
        entries.push({ question: String(question), answer: String(answer) });
        await prisma.customAgent.update({
          where: { id: agentId },
          data: {
            knowledgeBase: { entries } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch {
        // 同步失败不影响主流程
      }
    }

    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[knowledge POST] error:", error);
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
      return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
    }

    const entry = await prisma.knowledgeEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
    }

    // 权限校验：通过关联的项目或 Agent 判断归属
    let hasPermission = false;

    if (entry.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: entry.projectId },
        select: { userId: true },
      });
      if (project && project.userId === session.userId) {
        hasPermission = true;
      }
    }

    if (!hasPermission && entry.agentId) {
      const agent = await prisma.customAgent.findUnique({
        where: { id: entry.agentId },
        select: { userId: true },
      });
      if (agent && agent.userId === session.userId) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.knowledgeEntry.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[knowledge DELETE] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
