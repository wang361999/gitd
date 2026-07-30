import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRepo, triggerWorkflow, slugify } from "@/lib/github";

/**
 * 构建路由 (POST)
 * 接收 { description, projectType, projectName }
 * 流程：创建 Project -> 创建 GitHub 仓库 -> 创建 Task -> 触发 generate.yml
 * 返回 { projectId, taskId }
 */
export async function POST(request: Request) {
  // 在 try 外声明，便于出错时回滚项目状态
  let projectId: string | null = null;

  try {
    const session = await requireAuth();

    const body = await request.json();
    const { description, projectType, projectName } = body ?? {};

    if (!description || !projectName) {
      return NextResponse.json(
        { error: "Missing required fields: description, projectName" },
        { status: 400 }
      );
    }

    // 1. 创建 Project 记录 (status: building)
    const project = await prisma.project.create({
      data: {
        userId: session.userId!,
        name: projectName,
        description,
        projectType: projectType || "web",
        status: ProjectStatus.building,
      },
    });
    projectId = project.id;

    // 2. 调用 createRepo() 创建 GitHub 仓库
    const repoSlug = slugify(projectName);
    const repo = await createRepo(repoSlug, description, true);

    // 回写仓库信息到 Project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        repoUrl: repo.html_url,
        repoOwner: repo.owner,
        repoName: repo.repo,
      },
    });

    // 3. 创建 Task 记录 (stage: generate, status: pending)
    const task = await prisma.task.create({
      data: {
        projectId,
        stage: TaskStage.generate,
        status: TaskStatus.pending,
      },
    });

    // 4. 触发 generate.yml 工作流
    const appUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/webhook`;

    const runId = await triggerWorkflow(
      repo.owner,
      repo.repo,
      "generate.yml",
      "main",
      {
        requirement: description,
        project_type: projectType || "web",
        project_name: projectName,
        repo_owner: repo.owner,
        repo_name: repo.repo,
        task_id: task.id,
        callback_url: callbackUrl,
      }
    );

    // 保存 Actions run id 并标记为 running
    await prisma.task.update({
      where: { id: task.id },
      data: { actionsRunId: runId, status: TaskStatus.running },
    });

    return NextResponse.json({ projectId, taskId: task.id });
  } catch (error) {
    // 出错时将已创建的项目标记为 failed，避免悬挂的 building 状态
    if (projectId) {
      await prisma.project
        .update({
          where: { id: projectId },
          data: { status: ProjectStatus.failed },
        })
        .catch(() => {});
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[build] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
