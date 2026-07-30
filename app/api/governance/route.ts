import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 治理路由 (GET)
 * 通过 ?projectId=xxx&type=xxx 查询治理数据
 *  - type=provenance : 溯源数据（来源分布、文件列表）
 *  - type=security   : 安全报告（评分、问题列表）
 *  - type=lore       : 决策记录（时间线）
 *  - type=report     : 聚合治理报告
 *  - 无 type         : 治理概览（综合评分 + 三模块摘要）
 */

/** 安全分：风险分越低分越高（riskScore 0 -> 100, 10 -> 0） */
function riskToScore(risk: number): number {
  return Math.max(0, Math.min(100, Math.round((100 - risk * 10) * 10) / 10));
}

/** 将 GovernanceReport.issues (Json) 安全展开为带 filePath 的问题数组 */
function flattenIssues(
  reports: { filePath: string; issues: unknown }[]
): Array<Record<string, unknown>> {
  const allIssues: Array<Record<string, unknown>> = [];
  for (const r of reports) {
    const issues = r.issues;
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        const item: Record<string, unknown> = { filePath: r.filePath };
        if (issue !== null && typeof issue === "object" && !Array.isArray(issue)) {
          // issue 已收窄为对象，合并其字段
          Object.assign(item, issue);
        } else {
          item.value = issue;
        }
        allIssues.push(item);
      }
    }
  }
  return allIssues;
}

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const type = searchParams.get("type");

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId parameter" },
        { status: 400 }
      );
    }

    // -------------------- 权限校验 --------------------
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // -------------------- type=provenance：溯源数据 --------------------
    if (type === "provenance") {
      const reports = await prisma.governanceReport.findMany({
        where: { projectId },
        select: {
          filePath: true,
          source: true,
          modelName: true,
          lineCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // 来源分布
      const sourceMap = new Map<string, number>();
      for (const r of reports) {
        sourceMap.set(r.source, (sourceMap.get(r.source) || 0) + 1);
      }
      const sourceDistribution = Array.from(sourceMap.entries()).map(
        ([source, count]) => ({
          source,
          count,
          percentage:
            reports.length > 0 ? Math.round((count / reports.length) * 100) : 0,
        })
      );

      return NextResponse.json({
        sourceDistribution,
        files: reports,
        totalFiles: reports.length,
      });
    }

    // -------------------- type=security：安全报告 --------------------
    if (type === "security") {
      const reports = await prisma.governanceReport.findMany({
        where: { projectId },
        select: {
          id: true,
          filePath: true,
          riskScore: true,
          issues: true,
          reviewed: true,
          createdAt: true,
        },
        orderBy: { riskScore: "desc" },
      });

      const totalScore = reports.reduce((sum, r) => sum + r.riskScore, 0);
      const avgRiskScore =
        reports.length > 0 ? Math.round((totalScore / reports.length) * 100) / 100 : 0;

      const issues = flattenIssues(reports);

      return NextResponse.json({
        averageRiskScore: avgRiskScore,
        securityScore: riskToScore(avgRiskScore),
        totalIssues: issues.length,
        filesAnalyzed: reports.length,
        issues,
        files: reports,
      });
    }

    // -------------------- type=lore：决策记录时间线 --------------------
    if (type === "lore") {
      const loreRecords = await prisma.loreRecord.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });

      return NextResponse.json({
        timeline: loreRecords,
        totalDecisions: loreRecords.length,
      });
    }

    // -------------------- type=report：聚合治理报告 --------------------
    if (type === "report") {
      const [reports, loreRecords, versions] = await Promise.all([
        prisma.governanceReport.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.loreRecord.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
        }),
        prisma.version.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const totalScore = reports.reduce((sum, r) => sum + r.riskScore, 0);
      const avgRiskScore =
        reports.length > 0 ? Math.round((totalScore / reports.length) * 100) / 100 : 0;

      // 来源统计
      const sources: Record<string, number> = {};
      let totalIssues = 0;
      for (const r of reports) {
        sources[r.source] = (sources[r.source] || 0) + 1;
        if (Array.isArray(r.issues)) totalIssues += r.issues.length;
      }

      return NextResponse.json({
        provenance: {
          totalFiles: reports.length,
          sources,
        },
        security: {
          averageRiskScore: avgRiskScore,
          securityScore: riskToScore(avgRiskScore),
          totalIssues,
        },
        lore: {
          totalDecisions: loreRecords.length,
          decisions: loreRecords,
        },
        versions,
        reports,
      });
    }

    // -------------------- 默认：治理概览（综合评分 + 三模块摘要） --------------------
    const [reports, loreCount] = await Promise.all([
      prisma.governanceReport.findMany({
        where: { projectId },
        select: { source: true, riskScore: true, issues: true, lineCount: true },
      }),
      prisma.loreRecord.count({ where: { projectId } }),
    ]);

    const totalRisk = reports.reduce((sum, r) => sum + r.riskScore, 0);
    const avgRiskScore =
      reports.length > 0 ? Math.round((totalRisk / reports.length) * 100) / 100 : 0;

    const securityScore = riskToScore(avgRiskScore);
    const provenanceScore = Math.min(100, reports.length * 10); // 文件数越多覆盖越高
    const loreScore = Math.min(100, loreCount * 5); // 决策越多越好
    const compositeScore =
      Math.round(((securityScore + provenanceScore + loreScore) / 3) * 10) / 10;

    // 来源分布
    const sourceMap = new Map<string, number>();
    let totalIssues = 0;
    for (const r of reports) {
      sourceMap.set(r.source, (sourceMap.get(r.source) || 0) + 1);
      if (Array.isArray(r.issues)) totalIssues += r.issues.length;
    }

    return NextResponse.json({
      compositeScore,
      provenance: {
        totalFiles: reports.length,
        sourceCount: sourceMap.size,
        sources: Array.from(sourceMap.entries()).map(([source, count]) => ({
          source,
          count,
        })),
        provenanceScore,
      },
      security: {
        averageRiskScore: avgRiskScore,
        securityScore,
        totalIssues,
      },
      lore: {
        totalDecisions: loreCount,
        loreScore,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[governance] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
