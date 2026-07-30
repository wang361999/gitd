import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { triggerWorkflow } from "@/lib/github";
import { getSetting, getAppUrl, SETTING_KEYS, ensureTablesExist } from "@/lib/settings";

/**
 * Webhook 路由 (POST)
 * 接收 GitHub Actions 完成回调
 * 验证 X-Webhook-Secret，更新 Task，并按阶段流转触发下一阶段工作流
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
    const { taskId, stage, status, log, result } = body ?? {};

    if (!taskId || !stage || !status) {
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
    if (status === "success") {
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
          const runId = await triggerWorkflow(
            repoOwner,
            repoName,
            "governance.yml",
            "main",
            {
              project_id: project.id,
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
          const runId = await triggerWorkflow(
            project.repoOwner,
            project.repoName,
            "package.yml",
            "main",
            {
              project_id: project.id,
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
    } else if (status === "failed") {
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
