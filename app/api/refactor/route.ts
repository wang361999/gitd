/**
 * AI 重构 API
 *
 * GET:
 *   ?projectId=xxx  获取项目的重构历史
 * POST:
 *   { projectId, filePath, code, type?, model? }
 *   AI 分析代码异味并生成重构方案，保存 Refactoring 记录
 *
 * 支持的重构类型：extract-method（提取方法）、extract-class（提取类）、
 * rename（重命名）、simplify（简化逻辑）等。若未指定 type，由 AI 自动判断。
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/models";

/** 安全解析 AI 返回的 JSON */
function safeJsonParse<T>(content: string, fallback: T): T {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "缺少 projectId 参数" },
        { status: 400 }
      );
    }

    // 校验项目归属
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

    const refactorings = await prisma.refactoring.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        filePath: true,
        reason: true,
        verified: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ refactorings });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[refactor GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const session = await requireAuth();

    const body = await request.json();
    const { projectId, filePath, code, type, model } = body ?? {};

    if (!projectId || !filePath || !code) {
      return NextResponse.json(
        { error: "缺少必填字段: projectId, filePath, code" },
        { status: 400 }
      );
    }

    // 校验项目归属
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const useModel = model || "gpt-4o";
    const refactorType = type || "auto";

    const systemPrompt = `你是一个资深软件工程师，擅长代码重构。请分析以下代码的"代码异味"（code smell），并生成重构后的代码。

${type ? `指定的重构类型：${type}` : "请自动判断最合适的重构类型（如 extract-method、extract-class、rename、simplify 等）。"}

返回 JSON 格式：
{
  "type": "实际采用的重构类型",
  "reason": "重构原因，说明发现了什么代码异味以及为什么需要重构",
  "afterCode": "重构后的完整代码（只包含代码，不要 markdown 标记）"
}
只返回 JSON，不要其他文本。如果代码已经很好无需重构，afterCode 可与原代码相同，reason 说明"代码质量良好，无需重构"。`;

    const refactorResponse = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `项目：${project.name}\n文件路径：${filePath}\n\n原始代码：\n${code}`,
        },
      ],
      { model: useModel, temperature: 0.4, maxTokens: 4000 }
    );

    const result = safeJsonParse(refactorResponse.content, {
      type: refactorType,
      reason: refactorResponse.content,
      afterCode: code,
    });

    const afterCode = String(result.afterCode || code).replace(
      /^```[\w]*\n?|\n?```$/g,
      ""
    );
    const finalType = String(result.type || refactorType);
    const reason = String(result.reason || "AI 自动重构");

    // 持久化重构记录
    const refactoring = await prisma.refactoring.create({
      data: {
        projectId,
        type: finalType,
        filePath,
        beforeCode: String(code),
        afterCode,
        reason,
      },
    });

    // 记录分析事件
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.userId,
          projectId,
          eventType: "refactored",
          model: useModel,
          tokensUsed: refactorResponse.usage?.total_tokens || 0,
          duration: Date.now() - startTime,
          metadata: { refactoringId: refactoring.id, type: finalType },
        },
      });
    } catch {
      // 忽略
    }

    return NextResponse.json({
      refactoring,
      type: finalType,
      reason,
      afterCode,
      usage: refactorResponse.usage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[refactor POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
