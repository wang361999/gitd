import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRepo, triggerWorkflow, slugify } from "@/lib/github";
import { getAppUrl, getForgeRepo } from "@/lib/settings";

/**
 * 构建路由 (POST)
 *
 * 模式 A — 全新构建:
 *   body: { description, projectType, projectName }
 *   流程：创建 Project -> 创建 GitHub 仓库 -> 创建 Task -> 触发 generate.yml
 *   返回 { projectId, taskId }
 *
 * 模式 B — 重新打包:
 *   body: { projectId, action: "repackage" }
 *   流程：校验归属 -> 更新状态为 packaging -> 创建 Task -> 触发 package.yml
 *   返回 { projectId, taskId }
 *
 * 模式 C — 重试失败阶段:
 *   body: { projectId, action: "retry" }
 *   流程：校验归属 -> 查找最新失败 Task -> 确定失败阶段 -> 重新触发对应 workflow
 *   返回 { projectId, taskId }
 */
export async function POST(request: Request) {
  // 在 try 外声明，便于出错时回滚项目状态
  let projectId: string | null = null;

  try {
    const session = await requireAuth();

    const body = await request.json();
    const { description, projectType, projectName, action } = body ?? {};

    // ================================================================
    // 模式 B：重新打包
    // ================================================================
    if (action === "repackage" && body.projectId) {
      const pid = body.projectId as string;

      const project = await prisma.project.findUnique({
        where: { id: pid },
        select: {
          id: true,
          userId: true,
          repoOwner: true,
          repoName: true,
          projectType: true,
          name: true,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      if (project.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (!project.repoOwner || !project.repoName) {
        return NextResponse.json(
          { error: "项目缺少仓库信息，无法重新打包" },
          { status: 400 }
        );
      }

      // 更新项目状态为 packaging
      await prisma.project.update({
        where: { id: pid },
        data: { status: ProjectStatus.packaging },
      });

      // 创建打包 Task
      const task = await prisma.task.create({
        data: {
          projectId: pid,
          stage: TaskStage.package,
          status: TaskStatus.pending,
        },
      });

      const appUrl = await getAppUrl();
      const callbackUrl = `${appUrl}/api/webhook`;
      const forgeRepo = await getForgeRepo();

      const runId = await triggerWorkflow(
        forgeRepo.owner,
        forgeRepo.name,
        "package.yml",
        "main",
        {
          project_type: project.projectType || "web",
          project_name: project.name,
          repo_owner: project.repoOwner,
          repo_name: project.repoName,
          task_id: task.id,
          callback_url: callbackUrl,
        }
      );

      await prisma.task.update({
        where: { id: task.id },
        data: { actionsRunId: runId, status: TaskStatus.running },
      });

      return NextResponse.json({ projectId: pid, taskId: task.id });
    }

    // ================================================================
    // 模式 C：重试失败阶段
    // ================================================================
    if (action === "retry" && body.projectId) {
      const pid = body.projectId as string;

      const project = await prisma.project.findUnique({
        where: { id: pid },
        select: {
          id: true,
          userId: true,
          name: true,
          description: true,
          projectType: true,
          repoOwner: true,
          repoName: true,
          repoUrl: true,
          status: true,
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      if (project.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (project.status !== "failed") {
        return NextResponse.json(
          { error: "只有失败的项目可以重试" },
          { status: 400 }
        );
      }

      // 查找最新的失败 Task，确定重试哪个阶段
      const failedTask = await prisma.task.findFirst({
        where: { projectId: pid, status: "failed" },
        orderBy: { createdAt: "desc" },
      });

      const retryStage = failedTask?.stage || "generate";

      const appUrl = await getAppUrl();
      const callbackUrl = `${appUrl}/api/webhook`;
      const forgeRepo = await getForgeRepo();

      // 根据失败阶段触发对应 workflow
      if (retryStage === "generate") {
        // generate 失败：需要仓库信息
        let repoOwner = project.repoOwner;
        let repoName = project.repoName;

        // 如果没有仓库信息，尝试创建新仓库
        if (!repoOwner || !repoName) {
          const repoSlug = slugify(project.name);
          const repo = await createRepo(repoSlug, project.description, true);
          repoOwner = repo.owner;
          repoName = repo.repo;

          await prisma.project.update({
            where: { id: pid },
            data: {
              repoUrl: repo.html_url,
              repoOwner,
              repoName,
              status: ProjectStatus.building,
            },
          });
        } else {
          await prisma.project.update({
            where: { id: pid },
            data: { status: ProjectStatus.building },
          });
        }

        const task = await prisma.task.create({
          data: {
            projectId: pid,
            stage: TaskStage.generate,
            status: TaskStatus.pending,
          },
        });

        const runId = await triggerWorkflow(
          forgeRepo.owner,
          forgeRepo.name,
          "generate.yml",
          "main",
          {
            requirement: project.description,
            project_type: project.projectType || "web",
            project_name: project.name,
            repo_owner: repoOwner,
            repo_name: repoName,
            task_id: task.id,
            callback_url: callbackUrl,
          }
        );

        await prisma.task.update({
          where: { id: task.id },
          data: { actionsRunId: runId, status: TaskStatus.running },
        });

        return NextResponse.json({ projectId: pid, taskId: task.id });
      }

      if (retryStage === "governance") {
        // governance 失败：仓库已存在
        if (!project.repoOwner || !project.repoName) {
          return NextResponse.json(
            { error: "项目缺少仓库信息，无法重试治理" },
            { status: 400 }
          );
        }

        await prisma.project.update({
          where: { id: pid },
          data: { status: ProjectStatus.governing },
        });

        const task = await prisma.task.create({
          data: {
            projectId: pid,
            stage: TaskStage.governance,
            status: TaskStatus.pending,
          },
        });

        const runId = await triggerWorkflow(
          forgeRepo.owner,
          forgeRepo.name,
          "governance.yml",
          "main",
          {
            repo_owner: project.repoOwner,
            repo_name: project.repoName,
            task_id: task.id,
            callback_url: callbackUrl,
          }
        );

        await prisma.task.update({
          where: { id: task.id },
          data: { actionsRunId: runId, status: TaskStatus.running },
        });

        return NextResponse.json({ projectId: pid, taskId: task.id });
      }

      if (retryStage === "package") {
        // package 失败：等同于重新打包
        if (!project.repoOwner || !project.repoName) {
          return NextResponse.json(
            { error: "项目缺少仓库信息，无法重试打包" },
            { status: 400 }
          );
        }

        await prisma.project.update({
          where: { id: pid },
          data: { status: ProjectStatus.packaging },
        });

        const task = await prisma.task.create({
          data: {
            projectId: pid,
            stage: TaskStage.package,
            status: TaskStatus.pending,
          },
        });

        const runId = await triggerWorkflow(
          forgeRepo.owner,
          forgeRepo.name,
          "package.yml",
          "main",
          {
            project_type: project.projectType || "web",
            project_name: project.name,
            repo_owner: project.repoOwner,
            repo_name: project.repoName,
            task_id: task.id,
            callback_url: callbackUrl,
          }
        );

        await prisma.task.update({
          where: { id: task.id },
          data: { actionsRunId: runId, status: TaskStatus.running },
        });

        return NextResponse.json({ projectId: pid, taskId: task.id });
      }

      return NextResponse.json(
        { error: "无法确定重试阶段" },
        { status: 400 }
      );
    }

    // ================================================================
    // 模式 A：全新构建
    // ================================================================
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

    // 4. 触发 generate.yml 工作流（在 Agent Forge 仓库上触发）
    const appUrl = await getAppUrl();
    const callbackUrl = `${appUrl}/api/webhook`;
    const forgeRepo = await getForgeRepo();

    const runId = await triggerWorkflow(
      forgeRepo.owner,
      forgeRepo.name,
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
