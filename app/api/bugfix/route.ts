/**
 * 自动 Bug 修复 API
 *
 * GET:
 *   ?projectId=xxx  获取项目的 Bug 修复历史
 * POST:
 *   { projectId, errorLog, code?, model? }
 *   AI 分析错误日志，定位根因，生成修复方案，保存 BugFix 记录
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

    const bugFixes = await prisma.bugFix.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rootCause: true,
        verified: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ bugFixes });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[bugfix GET] error:", error);
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
    const { projectId, errorLog, code, model } = body ?? {};

    if (!projectId || !errorLog) {
      return NextResponse.json(
        { error: "缺少必填字段: projectId, errorLog" },
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

    const systemPrompt = `你是一个资深调试专家。请分析以下错误日志，定位根本原因，并生成修复代码。

${code ? "相关源代码已提供，请基于源代码给出修复。" : "未提供源代码，请根据错误日志推断可能的问题并给出修复方案。"}

返回 JSON 格式：
{
  "rootCause": "根本原因分析，说明错误为什么发生",
  "fixCode": "修复后的完整代码（只包含代码，不要 markdown 标记）。若无源代码，给出修复片段并附带说明。"
}
只返回 JSON，不要其他文本。`;

    const bugfixResponse = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `项目：${project.name}\n\n错误日志：\n${errorLog}${code ? `\n\n相关源代码：\n${code}` : ""}`,
        },
      ],
      { model: useModel, temperature: 0.3, maxTokens: 4000 }
    );

    const result = safeJsonParse(bugfixResponse.content, {
      rootCause: bugfixResponse.content,
      fixCode: code || "",
    });

    const rootCause = String(result.rootCause || "无法确定根本原因");
    const fixCode = String(result.fixCode || "").replace(
      /^```[\w]*\n?|\n?```$/g,
      ""
    );

    // 持久化 Bug 修复记录
    const bugFix = await prisma.bugFix.create({
      data: {
        projectId,
        errorLog: String(errorLog),
        rootCause,
        fixCode,
      },
    });

    // 记录分析事件
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.userId,
          projectId,
          eventType: "bug-fixed",
          model: useModel,
          tokensUsed: bugfixResponse.usage?.total_tokens || 0,
          duration: Date.now() - startTime,
          metadata: { bugFixId: bugFix.id },
        },
      });
    } catch {
      // 忽略
    }

    return NextResponse.json({
      bugFix,
      rootCause,
      fixCode,
      usage: bugfixResponse.usage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[bugfix POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
