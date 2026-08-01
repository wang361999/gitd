/**
 * AI 编程效能分析引擎
 * 统计和分析 AI 编程活动的各项指标
 * 支持项目级、用户级、全局级的多维度分析
 */

import { prisma } from "./prisma";

// ============ 类型定义 ============

export interface TrackEventData {
  userId?: string;
  projectId?: string;
  eventType: string;
  model?: string;
  tokensUsed?: number;
  duration?: number; // ms
  metadata?: Record<string, unknown>;
}

export interface ProjectAnalytics {
  totalFiles: number;
  aiGeneratedFiles: number;
  aiPercentage: number;
  reviewScores: {
    average: number;
    latest: number;
    trend: number[];
  };
  bugFixCount: number;
  refactorCount: number;
  totalTokens: number;
  totalEvents: number;
}

export interface UserAnalytics {
  totalProjects: number;
  totalTokens: number;
  modelUsage: {
    model: string;
    count: number;
    tokens: number;
  }[];
  avgQualityScore: number;
  efficiency: number; // 0-100
  totalEvents: number;
}

export interface GlobalAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalEvents: number;
  modelDistribution: {
    model: string;
    count: number;
    percentage: number;
  }[];
  qualityTrend: {
    period: string;
    avgScore: number;
    reviewCount: number;
  }[];
}

export interface ModelUsageStats {
  model: string;
  totalCalls: number;
  totalTokens: number;
  avgDuration: number;
  percentage: number;
}

export interface QualityTrendPoint {
  period: string;
  avgScore: number;
  reviewCount: number;
  projectId?: string;
}

export interface TimeRange {
  start?: Date;
  end?: Date;
  days?: number;
}

// ============ 表初始化 ============

let analyticsTablesInitialized = false;

/**
 * 确保分析统计相关数据库表已创建
 */
async function ensureAnalyticsTablesExist(): Promise<void> {
  if (analyticsTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "analytics_events" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "projectId" TEXT,
        "eventType" TEXT NOT NULL,
        "model" TEXT,
        "tokensUsed" INTEGER NOT NULL DEFAULT 0,
        "duration" INTEGER,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
      );
    `);

    // 添加索引以加速查询
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_user" ON "analytics_events" ("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_project" ON "analytics_events" ("projectId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_model" ON "analytics_events" ("model");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_event_type" ON "analytics_events" ("eventType");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_created" ON "analytics_events" ("createdAt");
    `);

    analyticsTablesInitialized = true;
  } catch (error) {
    console.error("[ensureAnalyticsTablesExist] 创建表失败:", error);
    analyticsTablesInitialized = true;
  }
}

// ============ 核心功能 ============

/**
 * 记录事件
 */
export async function trackEvent(data: TrackEventData): Promise<string> {
  await ensureAnalyticsTablesExist();

  const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "analytics_events" ("id", "userId", "projectId", "eventType", "model", "tokensUsed", "duration", "metadata", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      id,
      data.userId || null,
      data.projectId || null,
      data.eventType,
      data.model || null,
      data.tokensUsed || 0,
      data.duration || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    );
    return id;
  } catch (error) {
    console.error("[trackEvent] 记录失败:", error);
    // 不抛出错误，分析事件记录失败不应影响主流程
    return "";
  }
}

/**
 * 获取项目分析
 */
export async function getProjectAnalytics(
  projectId: string
): Promise<ProjectAnalytics> {
  await ensureAnalyticsTablesExist();

  try {
    // 统计文件数（从 governance_reports 获取）
    const fileStats = await prisma.$queryRawUnsafe<
      Array<{ total: number; ai_generated: number }>
    >(
      `SELECT 
        COUNT(DISTINCT "filePath") as total,
        COUNT(DISTINCT CASE WHEN "source" LIKE 'ai:%' THEN "filePath" END) as ai_generated
      FROM "governance_reports" 
      WHERE "projectId" = $1`,
      projectId
    );

    const totalFiles = fileStats[0]?.total || 0;
    const aiGeneratedFiles = fileStats[0]?.ai_generated || 0;

    // 获取代码审查分数
    const reviewStats = await prisma.$queryRawUnsafe<
      Array<{ avg_score: number; latest_score: number; count: number }>
    >(
      `SELECT 
        COALESCE(AVG("overallScore"), 0) as avg_score,
        COALESCE(MAX("overallScore"), 0) as latest_score,
        COUNT(*) as count
      FROM "code_reviews" 
      WHERE "projectId" = $1`,
      projectId
    );

    const reviewTrend = await prisma.$queryRawUnsafe<
      Array<{ overall_score: number }>
    >(
      `SELECT "overallScore" as overall_score 
      FROM "code_reviews" 
      WHERE "projectId" = $1 
      ORDER BY "createdAt" ASC`,
      projectId
    );

    // 获取 Bug 修复数
    const bugFixCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "bug_fixes" WHERE "projectId" = $1`,
      projectId
    );

    // 获取重构数
    const refactorCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "refactorings" WHERE "projectId" = $1`,
      projectId
    );

    // 获取 token 使用量
    const tokenStats = await prisma.$queryRawUnsafe<
      Array<{ total_tokens: number; total_events: number }>
    >(
      `SELECT 
        COALESCE(SUM("tokensUsed"), 0) as total_tokens,
        COUNT(*) as total_events
      FROM "analytics_events" 
      WHERE "projectId" = $1`,
      projectId
    );

    return {
      totalFiles,
      aiGeneratedFiles,
      aiPercentage: totalFiles > 0 ? Math.round((aiGeneratedFiles / totalFiles) * 100) : 0,
      reviewScores: {
        average: Math.round(reviewStats[0]?.avg_score || 0),
        latest: Math.round(reviewStats[0]?.latest_score || 0),
        trend: reviewTrend.map((r) => r.overall_score),
      },
      bugFixCount: bugFixCount[0]?.count || 0,
      refactorCount: refactorCount[0]?.count || 0,
      totalTokens: tokenStats[0]?.total_tokens || 0,
      totalEvents: tokenStats[0]?.total_events || 0,
    };
  } catch (error) {
    console.error("[getProjectAnalytics] 分析失败:", error);
    return {
      totalFiles: 0,
      aiGeneratedFiles: 0,
      aiPercentage: 0,
      reviewScores: { average: 0, latest: 0, trend: [] },
      bugFixCount: 0,
      refactorCount: 0,
      totalTokens: 0,
      totalEvents: 0,
    };
  }
}

/**
 * 获取用户分析
 */
export async function getUserAnalytics(
  userId: string
): Promise<UserAnalytics> {
  await ensureAnalyticsTablesExist();

  try {
    // 获取用户的项目数
    const projectCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "projects" WHERE "userId" = $1`,
      userId
    );

    // 获取用户的 token 使用量和事件数
    const tokenStats = await prisma.$queryRawUnsafe<
      Array<{ total_tokens: number; total_events: number }>
    >(
      `SELECT 
        COALESCE(SUM("tokensUsed"), 0) as total_tokens,
        COUNT(*) as total_events
      FROM "analytics_events" 
      WHERE "userId" = $1`,
      userId
    );

    // 获取模型使用分布
    const modelUsage = await prisma.$queryRawUnsafe<
      Array<{ model: string; count: number; tokens: number }>
    >(
      `SELECT 
        COALESCE("model", 'unknown') as model,
        COUNT(*) as count,
        COALESCE(SUM("tokensUsed"), 0) as tokens
      FROM "analytics_events" 
      WHERE "userId" = $1 AND "model" IS NOT NULL
      GROUP BY "model"
      ORDER BY count DESC`,
      userId
    );

    // 获取用户的平均代码质量分数
    const qualityStats = await prisma.$queryRawUnsafe<
      Array<{ avg_score: number }>
    >(
      `SELECT COALESCE(AVG(cr."overallScore"), 0) as avg_score
      FROM "code_reviews" cr
      INNER JOIN "projects" p ON cr."projectId" = p."id"
      WHERE p."userId" = $1`,
      userId
    );

    // 计算效率分数（基于 token 使用效率和代码质量）
    const totalTokens = tokenStats[0]?.total_tokens || 0;
    const totalProjects = projectCount[0]?.count || 0;
    const avgQuality = Math.round(qualityStats[0]?.avg_score || 0);
    const totalEvents = tokenStats[0]?.total_events || 0;

    // 效率 = (代码质量分数 * 0.4) + (项目活跃度 * 0.3) + (token 效率 * 0.3)
    const projectActivity =
      totalProjects > 0 ? Math.min(100, (totalEvents / totalProjects) * 10) : 0;
    const tokenEfficiency =
      totalTokens > 0 ? Math.min(100, (avgQuality / Math.max(totalTokens / 1000, 1)) * 50) : 0;
    const efficiency = Math.round(avgQuality * 0.4 + projectActivity * 0.3 + tokenEfficiency * 0.3);

    return {
      totalProjects,
      totalTokens,
      modelUsage: modelUsage.map((m) => ({
        model: m.model,
        count: m.count,
        tokens: m.tokens,
      })),
      avgQualityScore: avgQuality,
      efficiency: Math.min(100, Math.max(0, efficiency)),
      totalEvents,
    };
  } catch (error) {
    console.error("[getUserAnalytics] 分析失败:", error);
    return {
      totalProjects: 0,
      totalTokens: 0,
      modelUsage: [],
      avgQualityScore: 0,
      efficiency: 0,
      totalEvents: 0,
    };
  }
}

/**
 * 全局分析（管理员）
 */
export async function getGlobalAnalytics(): Promise<GlobalAnalytics> {
  await ensureAnalyticsTablesExist();

  try {
    // 统计用户数
    const userCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "users"`
    );

    // 统计项目数
    const projectCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "projects"`
    );

    // 统计事件数
    const eventCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count FROM "analytics_events"`
    );

    // 模型分布
    const modelDist = await prisma.$queryRawUnsafe<
      Array<{ model: string; count: number }>
    >(
      `SELECT 
        COALESCE("model", 'unknown') as model,
        COUNT(*) as count
      FROM "analytics_events" 
      WHERE "model" IS NOT NULL
      GROUP BY "model"
      ORDER BY count DESC`
    );

    const totalModelCalls = modelDist.reduce((sum, m) => sum + m.count, 0);

    // 质量趋势（按周统计）
    const qualityTrend = await prisma.$queryRawUnsafe<
      Array<{ period: string; avg_score: number; review_count: number }>
    >(
      `SELECT 
        TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD') as period,
        COALESCE(AVG("overallScore"), 0) as avg_score,
        COUNT(*) as review_count
      FROM "code_reviews"
      WHERE "createdAt" >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY period ASC`
    );

    return {
      totalUsers: userCount[0]?.count || 0,
      totalProjects: projectCount[0]?.count || 0,
      totalEvents: eventCount[0]?.count || 0,
      modelDistribution: modelDist.map((m) => ({
        model: m.model,
        count: m.count,
        percentage:
          totalModelCalls > 0
            ? Math.round((m.count / totalModelCalls) * 10000) / 100
            : 0,
      })),
      qualityTrend: qualityTrend.map((q) => ({
        period: q.period,
        avgScore: Math.round(q.avg_score),
        reviewCount: q.review_count,
      })),
    };
  } catch (error) {
    console.error("[getGlobalAnalytics] 分析失败:", error);
    return {
      totalUsers: 0,
      totalProjects: 0,
      totalEvents: 0,
      modelDistribution: [],
      qualityTrend: [],
    };
  }
}

/**
 * 模型使用统计
 */
export async function getModelUsageStats(
  timeRange?: TimeRange
): Promise<ModelUsageStats[]> {
  await ensureAnalyticsTablesExist();

  try {
    // 构建时间范围条件
    let timeCondition = "";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (timeRange?.start && timeRange?.end) {
      timeCondition = ` WHERE "createdAt" BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(timeRange.start, timeRange.end);
    } else if (timeRange?.days) {
      timeCondition = ` WHERE "createdAt" >= NOW() - INTERVAL '${timeRange.days} days'`;
    } else if (timeRange?.start) {
      timeCondition = ` WHERE "createdAt" >= $${paramIndex++}`;
      params.push(timeRange.start);
    }

    const query = `SELECT 
      COALESCE("model", 'unknown') as model,
      COUNT(*) as total_calls,
      COALESCE(SUM("tokensUsed"), 0) as total_tokens,
      COALESCE(AVG("duration"), 0) as avg_duration
    FROM "analytics_events"${timeCondition}
    GROUP BY "model"
    ORDER BY total_calls DESC`;

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        model: string;
        total_calls: number;
        total_tokens: number;
        avg_duration: number;
      }>
    >(query, ...params);

    const totalCalls = rows.reduce((sum, r) => sum + r.total_calls, 0);

    return rows.map((r) => ({
      model: r.model,
      totalCalls: r.total_calls,
      totalTokens: r.total_tokens,
      avgDuration: Math.round(r.avg_duration),
      percentage:
        totalCalls > 0
          ? Math.round((r.total_calls / totalCalls) * 10000) / 100
          : 0,
    }));
  } catch (error) {
    console.error("[getModelUsageStats] 查询失败:", error);
    return [];
  }
}

/**
 * 代码质量趋势
 */
export async function getQualityTrend(
  projectId?: string,
  weeks: number = 12
): Promise<QualityTrendPoint[]> {
  await ensureAnalyticsTablesExist();

  try {
    let query: string;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (projectId) {
      query = `SELECT 
        TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD') as period,
        COALESCE(AVG("overallScore"), 0) as avg_score,
        COUNT(*) as review_count
      FROM "code_reviews"
      WHERE "projectId" = $${paramIndex++} AND "createdAt" >= NOW() - INTERVAL '${weeks} weeks'
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY period ASC`;
      params.push(projectId);
    } else {
      query = `SELECT 
        TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD') as period,
        COALESCE(AVG("overallScore"), 0) as avg_score,
        COUNT(*) as review_count
      FROM "code_reviews"
      WHERE "createdAt" >= NOW() - INTERVAL '${weeks} weeks'
      GROUP BY DATE_TRUNC('week', "createdAt")
      ORDER BY period ASC`;
    }

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        period: string;
        avg_score: number;
        review_count: number;
      }>
    >(query, ...params);

    return rows.map((r) => ({
      period: r.period,
      avgScore: Math.round(r.avg_score),
      reviewCount: r.review_count,
      projectId,
    }));
  } catch (error) {
    console.error("[getQualityTrend] 查询失败:", error);
    return [];
  }
}
