import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createRepoWithUserToken,
  verifyRepoAccess,
  triggerWorkflow,
  slugify,
} from "@/lib/github";
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
    const {
      description,
      projectType,
      projectName,
      action,
      repoMode,
      repoOwner,
      repoName,
    } = body ?? {};

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

      // 获取用户 token（用于 workflow 操作用户仓库）
      const repkgUser = await prisma.user.findUnique({
        where: { id: session.userId! },
        select: { accessToken: true },
      });
      if (!repkgUser?.accessToken) {
        return NextResponse.json(
          { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
          { status: 401 }
        );
      }

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
          user_token: repkgUser.accessToken,
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

        // 获取用户 token（用于创建仓库和触发 workflow）
        const retryUser = await prisma.user.findUnique({
          where: { id: session.userId! },
          select: { accessToken: true },
        });
        if (!retryUser?.accessToken) {
          return NextResponse.json(
            { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
            { status: 401 }
          );
        }

        // 如果没有仓库信息，尝试使用用户 token 创建新仓库
        if (!repoOwner || !repoName) {
          const repoSlug = slugify(project.name);
          const repo = await createRepoWithUserToken(
            retryUser.accessToken,
            repoSlug,
            project.description,
            true
          );
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
            user_token: retryUser.accessToken,
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

        // 获取用户 token
        const govRetryUser = await prisma.user.findUnique({
          where: { id: session.userId! },
          select: { accessToken: true },
        });
        if (!govRetryUser?.accessToken) {
          return NextResponse.json(
            { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
            { status: 401 }
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
            user_token: govRetryUser.accessToken,
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

        // 获取用户 token
        const pkgRetryUser = await prisma.user.findUnique({
          where: { id: session.userId! },
          select: { accessToken: true },
        });
        if (!pkgRetryUser?.accessToken) {
          return NextResponse.json(
            { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
            { status: 401 }
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
            user_token: pkgRetryUser.accessToken,
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

    // 2. 获取用户 OAuth token，用于校验或创建用户名下的仓库
    const user = await prisma.user.findUnique({
      where: { id: session.userId! },
      select: { accessToken: true },
    });
    if (!user?.accessToken) {
      throw new Error("未找到用户的 GitHub 访问令牌，请重新登录");
    }
    const userToken = user.accessToken;

    // 3. 根据仓库模式处理目标仓库
    let repoOwnerFinal: string;
    let repoNameFinal: string;
    let repoHtmlUrl: string;

    if (repoMode === "existing") {
      // 使用已有仓库：校验用户对指定仓库具备 push 权限
      if (!repoOwner || !repoName) {
        return NextResponse.json(
          { error: "使用已有仓库时需要提供 repoOwner 和 repoName" },
          { status: 400 }
        );
      }
      const hasAccess = await verifyRepoAccess(
        userToken,
        repoOwner,
        repoName
      );
      if (!hasAccess) {
        return NextResponse.json(
          {
            error:
              "无权访问该仓库或没有 push 权限，请确认仓库地址与登录账号",
          },
          { status: 403 }
        );
      }
      repoOwnerFinal = repoOwner;
      repoNameFinal = repoName;
      repoHtmlUrl = `https://github.com/${repoOwner}/${repoName}`;
    } else {
      // 默认 / 创建新仓库：使用用户 token 在用户账号下创建
      const repoSlug = slugify(projectName);
      const createdRepo = await createRepoWithUserToken(
        userToken,
        repoSlug,
        description,
        true
      );
      repoOwnerFinal = createdRepo.owner;
      repoNameFinal = createdRepo.repo;
      repoHtmlUrl = createdRepo.html_url;
    }

    // 回写仓库信息到 Project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        repoUrl: repoHtmlUrl,
        repoOwner: repoOwnerFinal,
        repoName: repoNameFinal,
      },
    });

    // 4. 创建 Task 记录 (stage: generate, status: pending)
    const task = await prisma.task.create({
      data: {
        projectId,
        stage: TaskStage.generate,
        status: TaskStatus.pending,
      },
    });

    // 5. 触发 generate.yml 工作流（在 Agent Forge 仓库上触发）
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
        repo_owner: repoOwnerFinal,
        repo_name: repoNameFinal,
        task_id: task.id,
        callback_url: callbackUrl,
        user_token: userToken,
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
