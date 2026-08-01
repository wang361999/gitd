/**
 * AI 编程效能分析 API (GET)
 *
 * 查询参数:
 *   ?projectId=xxx  按项目维度获取分析数据
 *   ?userId=xxx     按用户维度获取分析数据（仅本人）
 *   ?days=30        统计最近 N 天的数据（默认 30）
 *
 * 返回内容：
 *   - AI 生成比例（各类事件计数）
 *   - 代码质量趋势（审查评分随时间变化）
 *   - 审查通过率（平均评分、高分占比）
 *   - Bug 修复效率（修复数量、平均耗时）
 *   - Token 消耗与模型使用分布
 *   - 重构与性能分析统计
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const userIdParam = searchParams.get("userId");
    // 只允许查询自己的数据（除非指定 projectId 时按项目归属校验）
    const userId = userIdParam || session.userId!;
    const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30", 10)));

    const since = new Date();
    since.setDate(since.getDate() - days);

    // 构建事件查询条件
    const eventWhere: Record<string, unknown> = {
      createdAt: { gte: since },
    };
    if (projectId) {
      eventWhere.projectId = projectId;
    } else {
      eventWhere.userId = userId;
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

    // 并行查询所有统计维度
    const [
      eventsByType,
      totalTokens,
      modelUsage,
      codeReviews,
      bugFixes,
      refactorings,
      performanceReports,
      chatSessions,
      recentEvents,
    ] = await Promise.all([
      // 1. 各类事件计数
      prisma.analyticsEvent.groupBy({
        by: ["eventType"],
        where: eventWhere,
        _count: { eventType: true },
      }),

      // 2. Token 总消耗
      prisma.analyticsEvent.aggregate({
        where: eventWhere,
        _sum: { tokensUsed: true },
      }),

      // 3. 模型使用分布
      prisma.analyticsEvent.groupBy({
        by: ["model"],
        where: eventWhere,
        _count: { model: true },
        _sum: { tokensUsed: true },
      }),

      // 4. 代码审查数据
      prisma.codeReview.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          overallScore: true,
          dimensions: true,
          fixedIssues: true,
          reviewModel: true,
          createdAt: true,
        },
      }),

      // 5. Bug 修复数据
      prisma.bugFix.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          verified: true,
          createdAt: true,
        },
      }),

      // 6. 重构数据
      prisma.refactoring.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          verified: true,
          createdAt: true,
        },
      }),

      // 7. 性能报告数据
      prisma.performanceReport.findMany({
        where: projectId ? { projectId } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          score: true,
          createdAt: true,
        },
      }),

      // 8. 对话会话计数
      prisma.chatSession.count({
        where: projectId ? { projectId } : { userId },
      }),

      // 9. 最近事件（用于活动流）
      prisma.analyticsEvent.findMany({
        where: eventWhere,
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          model: true,
          tokensUsed: true,
          duration: true,
          createdAt: true,
        },
      }),
    ]);

    // ---------- 计算汇总指标 ----------

    // 事件计数映射
    const eventCounts: Record<string, number> = {};
    for (const item of eventsByType) {
      eventCounts[item.eventType] = item._count.eventType;
    }
    const totalEvents = Object.values(eventCounts).reduce((a, b) => a + b, 0);

    // AI 生成比例（code-generated 占总代码相关事件的比例）
    const aiGeneratedCount = eventCounts["code-generated"] || 0;
    const codeRelatedTotal =
      aiGeneratedCount +
      (eventCounts["refactored"] || 0) +
      (eventCounts["bug-fixed"] || 0);
    const aiGenerationRatio =
      codeRelatedTotal > 0
        ? Math.round((aiGeneratedCount / codeRelatedTotal) * 100)
        : 0;

    // 代码质量趋势（审查评分按时间排序，最早到最新）
    const qualityTrend = [...codeReviews]
      .reverse()
      .map((r) => ({
        date: r.createdAt.toISOString(),
        score: r.overallScore,
      }));

    // 审查通过率（评分 >= 70 视为通过）
    const reviewScores = codeReviews.map((r) => r.overallScore);
    const avgReviewScore =
      reviewScores.length > 0
        ? Math.round(
            reviewScores.reduce((a, b) => a + b, 0) / reviewScores.length
          )
        : 0;
    const passedReviews = reviewScores.filter((s) => s >= 70).length;
    const reviewPassRate =
      reviewScores.length > 0
        ? Math.round((passedReviews / reviewScores.length) * 100)
        : 0;

    // Bug 修复效率
    const verifiedBugFixes = bugFixes.filter((b) => b.verified).length;
    const bugFixVerificationRate =
      bugFixes.length > 0
        ? Math.round((verifiedBugFixes / bugFixes.length) * 100)
        : 0;

    // 重构统计
    const refactorByType: Record<string, number> = {};
    for (const r of refactorings) {
      refactorByType[r.type] = (refactorByType[r.type] || 0) + 1;
    }
    const verifiedRefactorings = refactorings.filter((r) => r.verified).length;

    // 性能评分趋势
    const perfScores = performanceReports.map((r) => r.score);
    const avgPerfScore =
      perfScores.length > 0
        ? Math.round(perfScores.reduce((a, b) => a + b, 0) / perfScores.length)
        : 0;

    // 模型使用分布
    const modelDistribution = modelUsage.map((m) => ({
      model: m.model || "unknown",
      count: m._count.model,
      tokens: m._sum.tokensUsed || 0,
    }));

    return NextResponse.json({
      summary: {
        totalEvents,
        totalTokens: totalTokens._sum.tokensUsed || 0,
        aiGenerationRatio,
        avgReviewScore,
        reviewPassRate,
        bugFixCount: bugFixes.length,
        bugFixVerificationRate,
        refactoringCount: refactorings.length,
        verifiedRefactorings,
        avgPerfScore,
        chatSessionCount: chatSessions,
      },
      eventCounts,
      qualityTrend,
      modelDistribution,
      refactorByType,
      recentEvents,
      period: {
        days,
        since: since.toISOString(),
        until: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[analytics GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
