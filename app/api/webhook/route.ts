import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { triggerWorkflow } from "@/lib/github";
import { getSetting, getAppUrl, getForgeRepo, SETTING_KEYS, ensureTablesExist } from "@/lib/settings";

/**
 * 将 GitHub Actions 的 job.status 归一化为 TaskStatus 枚举值
 * GitHub Actions: success | failure | cancelled | skipped
 * 数据库枚举:     success | failed
 */
function normalizeStatus(rawStatus: string): TaskStatus {
  if (rawStatus === "success") return TaskStatus.success;
  // failure / cancelled / skipped 均视为失败
  return TaskStatus.failed;
}

/**
 * Webhook 路由 (POST)
 * 接收 GitHub Actions 完成回调
 * 验证 X-Webhook-Secret，更新 Task，并按阶段流转触发下一阶段工作流
 *
 * 治理阶段回调可携带 result.governanceReports 和 result.loreRecords，
 * 本路由会将其写入 GovernanceReport 和 LoreRecord 表。
 */
export async function POST(request: Request) {
  try {
    await ensureTablesExist();

    // -------------------- 验证 webhook 密钥 --------------------
    const webhookSecret = request.headers.get("X-Webhook-Secret");
    const expectedSecret = await getSetting(SETTING_KEYS.WEBHOOK_SECRET);
    if (!webhookSecret || !expectedSecret || webhookSecret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
    }

    // -------------------- 解析请求体 --------------------
    const body = await request.json();
    const { taskId, stage, log, result } = body ?? {};

    // 归一化状态：GitHub Actions 用 failure/cancelled，数据库用 failed
    const rawStatus = body?.status as string;
    const status = normalizeStatus(rawStatus || "");

    if (!taskId || !stage || !rawStatus) {
      return NextResponse.json(
        { error: "Missing required fields: taskId, stage, status" },
        { status: 400 }
      );
    }

    // -------------------- 查询 Task 与 Project --------------------
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const project = task.project;
    const appUrl = await getAppUrl();
    const callbackUrl = `${appUrl}/api/webhook`;

    // -------------------- 更新 Task 记录 --------------------
    // result 仅在提供非空值时写入，避免 Prisma 对 Json 字段的 null 歧义
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        log: log ?? task.log,
        ...(result !== undefined && result !== null ? { result } : {}),
      },
    });

    // -------------------- 成功：按阶段流转 --------------------
    if (status === TaskStatus.success) {
      if (stage === "generate") {
        // generate 成功 -> governing，触发 governance.yml
        // 如果 result 中包含 repoUrl/previewUrl，更新到 project
        const updateData: Record<string, unknown> = {
          status: ProjectStatus.governing,
        };
        if (result?.repoUrl) updateData.repoUrl = result.repoUrl;
        if (result?.repoOwner) updateData.repoOwner = result.repoOwner;
        if (result?.repoName) updateData.repoName = result.repoName;
        if (result?.previewUrl) updateData.previewUrl = result.previewUrl;

        await prisma.project.update({
          where: { id: project.id },
          data: updateData,
        });

        const governanceTask = await prisma.task.create({
          data: {
            projectId: project.id,
            stage: TaskStage.governance,
            status: TaskStatus.pending,
          },
        });

        const repoOwner = result?.repoOwner || project.repoOwner;
        const repoName = result?.repoName || project.repoName;

        if (repoOwner && repoName) {
          const forgeRepo = await getForgeRepo();
          const runId = await triggerWorkflow(
            forgeRepo.owner,
            forgeRepo.name,
            "governance.yml",
            "main",
            {
              repo_owner: repoOwner,
              repo_name: repoName,
              task_id: governanceTask.id,
              callback_url: callbackUrl,
            }
          );
          await prisma.task.update({
            where: { id: governanceTask.id },
            data: { actionsRunId: runId, status: TaskStatus.running },
          });
        }
      } else if (stage === "governance") {
        // -------------------- 治理数据入库 --------------------
        // 从回调 result 中提取治理报告和决策记录，写入数据库
        // 失败不阻塞主流程，仅记录日志
        if (result?.governanceReports && Array.isArray(result.governanceReports)) {
          try {
            // 先清除该项目旧的治理报告（避免重复）
            await prisma.governanceReport.deleteMany({
              where: { projectId: project.id },
            });

            // 批量创建治理报告
            const reports = result.governanceReports.map(
              (report: {
                filePath: string;
                source: string;
                modelName?: string | null;
                lineCount?: number;
                riskScore?: number;
                issues?: unknown;
              }) => ({
                taskId,
                projectId: project.id,
                filePath: report.filePath || "unknown",
                source: report.source || "unknown",
                modelName: report.modelName || null,
                lineCount: report.lineCount || 0,
                riskScore: report.riskScore || 0,
                issues: report.issues ?? [],
              })
            );

            if (reports.length > 0) {
              await prisma.governanceReport.createMany({ data: reports });
              console.log(`[webhook] 写入 ${reports.length} 条治理报告`);
            }
          } catch (govError) {
            console.error("[webhook] 治理报告入库失败:", govError);
          }
        }

        if (result?.loreRecords && Array.isArray(result.loreRecords)) {
          try {
            // 先清除该项目旧的决策记录
            await prisma.loreRecord.deleteMany({
              where: { projectId: project.id },
            });

            const loreRecords = result.loreRecords
              .filter(
                (r: { commitSha?: string }) => r?.commitSha
              )
              .map(
                (r: {
                  commitSha: string;
                  context?: string;
                  decision?: string;
                  rejected?: string | null;
                  constraints?: string | null;
                }) => ({
                  projectId: project.id,
                  commitSha: r.commitSha,
                  context: r.context || "",
                  decision: r.decision || "",
                  rejected: r.rejected || null,
                  constraints: r.constraints || null,
                })
              );

            if (loreRecords.length > 0) {
              await prisma.loreRecord.createMany({ data: loreRecords });
              console.log(`[webhook] 写入 ${loreRecords.length} 条决策记录`);
            }
          } catch (loreError) {
            console.error("[webhook] 决策记录入库失败:", loreError);
          }
        }

        // governance 成功 -> packaging，触发 package.yml
        await prisma.project.update({
          where: { id: project.id },
          data: { status: ProjectStatus.packaging },
        });

        const packageTask = await prisma.task.create({
          data: {
            projectId: project.id,
            stage: TaskStage.package,
            status: TaskStatus.pending,
          },
        });

        if (project.repoOwner && project.repoName) {
          const forgeRepo = await getForgeRepo();
          const runId = await triggerWorkflow(
            forgeRepo.owner,
            forgeRepo.name,
            "package.yml",
            "main",
            {
              project_type: project.projectType,
              repo_owner: project.repoOwner,
              repo_name: project.repoName,
              task_id: packageTask.id,
              callback_url: callbackUrl,
            }
          );
          await prisma.task.update({
            where: { id: packageTask.id },
            data: { actionsRunId: runId, status: TaskStatus.running },
          });
        }
      } else if (stage === "package") {
        // package 成功 -> done
        // 从 result 中提取版本信息，创建 Version 记录
        const updateData: Record<string, unknown> = {
          status: ProjectStatus.done,
        };
        if (result?.downloadUrl) updateData.downloadUrl = result.downloadUrl;
        if (result?.previewUrl) updateData.previewUrl = result.previewUrl;

        await prisma.project.update({
          where: { id: project.id },
          data: updateData,
        });

        // 创建 Version 记录
        if (result?.versionTag || result?.downloadUrl || result?.releaseUrl) {
          await prisma.version.create({
            data: {
              projectId: project.id,
              versionTag: result.versionTag || `v${new Date().toISOString().split('T')[0]}`,
              releaseUrl: result.releaseUrl || null,
              downloadUrl: result.downloadUrl || null,
              releaseNotes: result.releaseNotes || null,
            },
          });
        }
      }
    } else if (status === TaskStatus.failed) {
      // -------------------- 失败：标记项目为 failed --------------------
      await prisma.project.update({
        where: { id: project.id },
        data: { status: ProjectStatus.failed },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
