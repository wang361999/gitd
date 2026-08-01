/**
 * 性能分析 API
 *
 * GET:
 *   ?projectId=xxx  获取项目的性能报告列表
 * POST:
 *   { projectId, files, model? }
 *   AI 分析代码性能瓶颈，保存 PerformanceReport 记录
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/models";

interface AnalysisFile {
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

    const reports = await prisma.performanceReport.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        score: true,
        issues: true,
        optimizations: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[performance GET] error:", error);
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

    // 构建待分析的文件内容
    const fileList = (files as AnalysisFile[])
      .map((f) => `--- 文件: ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const systemPrompt = `你是一个资深性能优化专家。请分析以下代码的性能瓶颈，给出整体性能评分（0-100），列出问题与优化建议。

关注点：算法复杂度、数据库查询、内存使用、I/O 操作、缓存策略、并发处理、渲染性能等。

返回 JSON 格式：
{
  "score": 0,
  "issues": [
    { "type": "complexity|database|memory|io|cache|concurrency|rendering", "severity": "critical|high|medium|low", "file": "文件路径", "description": "问题描述", "suggestion": "优化建议" }
  ],
  "optimizations": [
    { "category": "分类", "impact": "high|medium|low", "description": "优化描述" }
  ]
}
只返回 JSON，不要其他文本。`;

    const perfResponse = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `项目：${project.name}\n\n待分析代码：\n${fileList}`,
        },
      ],
      { model: useModel, temperature: 0.3, maxTokens: 4000 }
    );

    const result = safeJsonParse(perfResponse.content, {
      score: 0,
      issues: [],
      optimizations: [],
    });

    const score = Math.max(0, Math.min(100, Number(result.score) || 0));
    const issues = Array.isArray(result.issues) ? result.issues : [];
    const optimizations = Array.isArray(result.optimizations)
      ? result.optimizations
      : [];

    // 持久化性能报告
    const report = await prisma.performanceReport.create({
      data: {
        projectId,
        score,
        issues,
        optimizations,
      },
    });

    // 记录分析事件
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.userId,
          projectId,
          eventType: "performance-analyzed",
          model: useModel,
          tokensUsed: perfResponse.usage?.total_tokens || 0,
          duration: Date.now() - startTime,
          metadata: { reportId: report.id, score },
        },
      });
    } catch {
      // 忽略
    }

    return NextResponse.json({
      report,
      score,
      issues,
      optimizations,
      usage: perfResponse.usage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[performance POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
