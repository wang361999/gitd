import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkflowRun } from "@/lib/github";

/**
 * 根据阶段和状态计算整体进度 (1-7)
 *  generate:   pending=1, running=2, success=3
 *  governance: pending=3, running=4, success=5
 *  package:    pending=5, running=6, success=7
 */
function computeProgress(stage: string, status: string): number {
  if (stage === "generate") {
    if (status === "pending") return 1;
    if (status === "running") return 2;
    if (status === "success") return 3;
    return 1; // failed
  }
  if (stage === "governance") {
    if (status === "pending") return 3;
    if (status === "running") return 4;
    if (status === "success") return 5;
    return 3; // failed
  }
  if (stage === "package") {
    if (status === "pending") return 5;
    if (status === "running") return 6;
    if (status === "success") return 7;
    return 5; // failed
  }
  return 1;
}

/**
 * 状态路由 (GET)
 * 通过 ?taskId=xxx 查询任务状态
 * 返回 { stage, status, progress, logs, result, projectStatus }
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing taskId parameter" },
        { status: 400 }
      );
    }

    // 从数据库读取 Task（含所属 Project）
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 权限校验：只能查询自己的项目
    if (task.project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 以字符串形式持有当前状态，便于覆盖为实时状态
    let liveStatus: string = task.status;

    // 如果 Task 有关联的 actionsRunId，查询 GitHub Actions 实时状态
    // 仅在尚未终结（pending / running）时查询，避免覆盖 webhook 已写入的最终状态
    if (
      (liveStatus === "pending" || liveStatus === "running") &&
      task.actionsRunId &&
      task.project.repoOwner &&
      task.project.repoName
    ) {
      try {
        const run = await getWorkflowRun(
          task.project.repoOwner,
          task.project.repoName,
          task.actionsRunId
        );
        if (run.status === "completed") {
          liveStatus = run.conclusion === "success" ? "success" : "failed";
        } else {
          // queued / in_progress
          liveStatus = "running";
        }
      } catch {
        // 实时状态查询失败时回退到数据库状态
      }
    }

    return NextResponse.json({
      stage: task.stage,
      status: liveStatus,
      progress: computeProgress(task.stage, liveStatus),
      logs: task.log || "",
      result: task.result,
      projectStatus: task.project.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[status] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
