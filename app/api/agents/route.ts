/**
 * 自定义 AI Agent CRUD API
 *
 * GET:
 *   获取当前用户的 Agent 列表（含公开 Agent）
 * POST:
 *   创建新 Agent { name, description?, systemPrompt, tools, model?, isPublic? }
 * PUT:
 *   ?id=xxx  更新 Agent { name?, description?, systemPrompt?, tools?, model?, isPublic? }
 * DELETE:
 *   ?id=xxx  删除 Agent
 *
 * Agent 拥有自定义系统提示词、可用工具集与知识库，可用于特定场景的 AI 编程任务。
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 允许的工具集 */
const ALLOWED_TOOLS = [
  "code-gen",
  "review",
  "test",
  "refactor",
  "bugfix",
  "chat",
  "performance",
] as const;

/** 校验 tools 数组合法性 */
function validateTools(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return tools.filter((t): t is string =>
    typeof t === "string" && (ALLOWED_TOOLS as readonly string[]).includes(t)
  );
}

export async function GET() {
  try {
    const session = await requireAuth();

    // 返回当前用户创建的 Agent 以及所有公开 Agent
    const agents = await prisma.customAgent.findMany({
      where: {
        OR: [{ userId: session.userId! }, { isPublic: true }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        tools: true,
        model: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ agents });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agents GET] error:", error);
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
    const { name, description, systemPrompt, tools, model, isPublic } = body ?? {};

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { error: "缺少必填字段: name, systemPrompt" },
        { status: 400 }
      );
    }

    const validatedTools = validateTools(tools);
    if (validatedTools.length === 0) {
      return NextResponse.json(
        { error: `tools 必须是非空数组，可选值: ${ALLOWED_TOOLS.join(", ")}` },
        { status: 400 }
      );
    }

    const agent = await prisma.customAgent.create({
      data: {
        userId: session.userId!,
        name: String(name),
        description: typeof description === "string" ? description : null,
        systemPrompt: String(systemPrompt),
        tools: validatedTools,
        model: typeof model === "string" ? model : "gpt-4o",
        isPublic: Boolean(isPublic),
        knowledgeBase: { entries: [] },
      },
    });

    return NextResponse.json({ agent });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agents POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
    }

    // 校验归属权
    const existing = await prisma.customAgent.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, systemPrompt, tools, model, isPublic } = body ?? {};

    // 构建更新数据（仅更新提供的字段）
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof description === "string") data.description = description;
    if (typeof systemPrompt === "string" && systemPrompt.trim())
      data.systemPrompt = systemPrompt.trim();
    if (typeof model === "string" && model.trim()) data.model = model.trim();
    if (typeof isPublic === "boolean") data.isPublic = isPublic;
    if (Array.isArray(tools)) {
      const validatedTools = validateTools(tools);
      if (validatedTools.length > 0) {
        data.tools = validatedTools;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "没有需要更新的字段" },
        { status: 400 }
      );
    }

    const agent = await prisma.customAgent.update({
      where: { id },
      data,
    });

    return NextResponse.json({ agent });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agents PUT] error:", error);
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

    const existing = await prisma.customAgent.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
    }

    if (existing.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.customAgent.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[agents DELETE] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
