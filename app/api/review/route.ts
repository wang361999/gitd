/**
 * 代码审查 API
 *
 * GET:
 *   ?projectId=xxx  获取项目的审查报告列表
 * POST:
 *   { projectId, files, model? }
 *   对文件进行五维度 AI 审查，保存 CodeReview 记录
 *
 * 五个审查维度:
 *   functionality（功能性）、quality（代码质量）、performance（性能）、
 *   security（安全性）、robustness（健壮性）
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/models";

interface ReviewFile {
  path: string;
  content: string;
}

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

    const reviews = await prisma.codeReview.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        overallScore: true,
        dimensions: true,
        fixedIssues: true,
        reviewModel: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[review GET] error:", error);
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
    const { projectId, files, model } = body ?? {};

    if (!projectId || !files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "缺少必填字段: projectId, files（文件数组）" },
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

    // 构建待审查的文件内容文本
    const fileList = (files as ReviewFile[])
      .map((f) => `--- 文件: ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const systemPrompt = `你是一个资深代码审查专家。请对以下代码进行五维度审查，每个维度评分 0-100，并列出发现的问题。

五个维度：
1. functionality（功能性）：是否正确实现了预期功能
2. quality（代码质量）：可读性、可维护性、是否符合规范
3. performance（性能）：是否存在性能瓶颈或低效操作
4. security（安全性）：是否存在安全漏洞或风险
5. robustness（健壮性）：错误处理、边界条件、异常处理

返回 JSON 格式：
{
  "dimensions": { "functionality": 0, "quality": 0, "performance": 0, "security": 0, "robustness": 0 },
  "overallScore": 0,
  "issues": [
    { "type": "bug|security|performance|style|maintainability", "severity": "critical|high|medium|low", "file": "文件路径", "message": "问题描述", "suggestion": "修复建议" }
  ]
}
只返回 JSON，不要其他文本。`;

    const reviewResponse = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `项目：${project.name}\n\n待审查代码：\n${fileList}` },
      ],
      { model: useModel, temperature: 0.3, maxTokens: 4000 }
    );

    const reviewResult = safeJsonParse(reviewResponse.content, {
      dimensions: {
        functionality: 0,
        quality: 0,
        performance: 0,
        security: 0,
        robustness: 0,
      },
      overallScore: 0,
      issues: [],
    });

    const dimensions = reviewResult.dimensions || {
      functionality: 0,
      quality: 0,
      performance: 0,
      security: 0,
      robustness: 0,
    };

    // 若 AI 未给出总评分，则取五维度平均
    let overallScore = Number(reviewResult.overallScore) || 0;
    if (!overallScore) {
      const vals = [
        Number(dimensions.functionality) || 0,
        Number(dimensions.quality) || 0,
        Number(dimensions.performance) || 0,
        Number(dimensions.security) || 0,
        Number(dimensions.robustness) || 0,
      ];
      overallScore = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    const issues = Array.isArray(reviewResult.issues) ? reviewResult.issues : [];

    // 持久化审查记录
    const review = await prisma.codeReview.create({
      data: {
        projectId,
        overallScore,
        dimensions,
        issues,
        reviewModel: useModel,
      },
    });

    // 记录分析事件
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.userId,
          projectId,
          eventType: "code-reviewed",
          model: useModel,
          tokensUsed: reviewResponse.usage?.total_tokens || 0,
          duration: Date.now() - startTime,
          metadata: { reviewId: review.id, overallScore },
        },
      });
    } catch {
      // 忽略
    }

    return NextResponse.json({
      review,
      dimensions,
      overallScore,
      issues,
      usage: reviewResponse.usage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[review POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
