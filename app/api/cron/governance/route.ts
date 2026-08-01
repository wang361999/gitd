import { NextResponse } from "next/server";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { triggerWorkflow } from "@/lib/github";
import { getSetting, getAppUrl, getForgeRepo, SETTING_KEYS } from "@/lib/settings";

/**
 * 计算下次运行时间
 * - daily  : 明天同一时间
 * - weekly : 下周一
 * - monthly: 下月 1 号
 */
function calculateNextRunAt(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
  } else {
    // weekly（默认）：下一个周一
    const day = next.getDay(); // 0=周日, 1=周一
    const daysUntilMonday = (8 - day) % 7 || 7;
    next.setDate(next.getDate() + daysUntilMonday);
  }
  return next;
}

/**
 * 定时治理触发端点 (Vercel Cron)
 * GET: 扫描到期的治理计划，为每个计划创建治理项目并触发 governance.yml
 *
 * Cron 计划：每天 UTC 00:00 执行一次（Hobby 计划限制每日一次）
 *
 * 鉴权（三重验证，任一通过即可）：
 * 1. Vercel Cron 自动发送的 Authorization: Bearer <CRON_SECRET>
 * 2. 自定义 header x-cron-secret 与 WEBHOOK_SECRET 比对
 * 3. query ?secret= 与 WEBHOOK_SECRET 比对（兼容旧配置）
 */
export async function GET(request: Request) {
  try {
    // -------------------- 验证 Cron 密钥（三重验证） --------------------
    const { searchParams } = new URL(request.url);
    const expectedSecret = await getSetting(SETTING_KEYS.WEBHOOK_SECRET);
    const cronSecret = process.env.CRON_SECRET; // Vercel Cron 专用密钥

    // 方式1：Vercel Cron 标准鉴权 (Authorization: Bearer xxx)
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    // 方式2：自定义 header
    const headerSecret = request.headers.get("x-cron-secret");

    // 方式3：query 参数
    const querySecret = searchParams.get("secret");

    const providedSecret = bearerToken || headerSecret || querySecret;

    // 验证：提供的密钥必须匹配 WEBHOOK_SECRET 或 CRON_SECRET
    const isValid =
      providedSecret &&
      ((expectedSecret && providedSecret === expectedSecret) ||
        (cronSecret && providedSecret === cronSecret));

    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // -------------------- 查询到期计划 --------------------
    const schedules = await prisma.governanceSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: new Date() } },
      include: { user: { select: { accessToken: true, id: true } } },
    });

    const appUrl = await getAppUrl();
    const callbackUrl = `${appUrl}/api/webhook`;
    const forgeRepo = await getForgeRepo();
    const now = new Date();

    let processed = 0;

    for (const schedule of schedules) {
      try {
        const userToken = schedule.user?.accessToken;
        if (!userToken) {
          console.error(
            `[cron/governance] 计划 ${schedule.id} 的用户缺少 accessToken，跳过`
          );
          continue;
        }

        // 创建治理 Project
        const project = await prisma.project.create({
          data: {
            userId: schedule.userId,
            name: schedule.repoName,
            description: `对仓库 ${schedule.repoOwner}/${schedule.repoName} 的定时治理审查`,
            projectType: "governance-only",
            status: ProjectStatus.governing,
            repoOwner: schedule.repoOwner,
            repoName: schedule.repoName,
            repoUrl: `https://github.com/${schedule.repoOwner}/${schedule.repoName}`,
          },
        });

        // 创建治理 Task
        const task = await prisma.task.create({
          data: {
            projectId: project.id,
            stage: TaskStage.governance,
            status: TaskStatus.pending,
          },
        });

        // 触发 governance.yml
        const runId = await triggerWorkflow(
          forgeRepo.owner,
          forgeRepo.name,
          "governance.yml",
          "main",
          {
            repo_owner: schedule.repoOwner,
            repo_name: schedule.repoName,
            task_id: task.id,
            callback_url: callbackUrl,
            user_token: userToken,
          }
        );

        await prisma.task.update({
          where: { id: task.id },
          data: { actionsRunId: runId, status: TaskStatus.running },
        });

        // 更新计划运行时间与下次运行时间
        await prisma.governanceSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: calculateNextRunAt(schedule.frequency, now),
          },
        });

        processed++;
      } catch (err) {
        // 单个计划失败不中断整体循环
        console.error(
          `[cron/governance] 处理计划 ${schedule.id} 失败:`,
          err
        );
      }
    }

    return NextResponse.json({ processed });
  } catch (error) {
    console.error("[cron/governance] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
