import { NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { ProjectStatus, TaskStage, TaskStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createRepoWithUserToken,
  pushMultipleFiles,
  triggerWorkflow,
  slugify,
} from "@/lib/github";
import { getAppUrl, getForgeRepo } from "@/lib/settings";

const MAX_FILES = 100;

/** 需要忽略的目录片段 */
const IGNORED_SEGMENTS = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  ".cache/",
  "coverage/",
  "__pycache__/",
  ".venv/",
  "venv/",
];

/** 需要忽略的文件名 */
const IGNORED_FILES = [
  ".ds_store",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

/** 已知文本文件扩展名 */
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx",
  ".css", ".scss", ".sass", ".less", ".html", ".htm", ".vue", ".svelte",
  ".py", ".go", ".rs", ".java", ".kt", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".php", ".swift", ".sh", ".bash", ".zsh", ".yml", ".yaml", ".toml",
  ".ini", ".cfg", ".conf", ".env", ".txt", ".sql", ".xml", ".svg", ".graphql",
  ".gql", ".proto", ".dockerfile",
]);

/** 判断 ZIP 条目是否为可治理的文本文件 */
function isGovernableTextFile(entryName: string): boolean {
  const lower = entryName.toLowerCase();

  // 过滤目录条目
  if (lower.endsWith("/")) return false;

  // 过滤无用目录
  if (IGNORED_SEGMENTS.some((seg) => lower.includes(seg))) return false;

  // 过滤无用文件
  const base = lower.substring(lower.lastIndexOf("/") + 1);
  if (IGNORED_FILES.includes(base)) return false;

  // 无扩展名的常见配置文件
  if (
    base === "dockerfile" ||
    base === ".gitignore" ||
    base === ".dockerignore" ||
    base.startsWith(".eslintrc") ||
    base.startsWith(".prettierrc") ||
    base.startsWith(".env")
  ) {
    return true;
  }

  const ext = lower.substring(lower.lastIndexOf("."));
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * 上传文件治理路由 (POST)
 * 接收 FormData（ZIP 文件），解压后推送到用户新仓库并触发治理审查
 */
export async function POST(request: Request) {
  // 在 try 外声明，便于出错时回滚项目状态
  let projectId: string | null = null;

  try {
    const session = await requireAuth();
    const userId = session.userId!;

    // 获取用户 token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true },
    });
    if (!user?.accessToken) {
      return NextResponse.json(
        { error: "未找到用户的 GitHub 访问令牌，请重新登录" },
        { status: 401 }
      );
    }
    const userToken = user.accessToken;

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectName =
      (formData.get("projectName") as string) || "uploaded-code";

    if (!file) {
      return NextResponse.json(
        { error: "Missing required field: file (ZIP)" },
        { status: 400 }
      );
    }

    // 读取 ZIP 内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // 过滤目录与无用文件，提取文本文件
    const files: { path: string; content: string }[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!isGovernableTextFile(entry.entryName)) continue;
      files.push({
        path: entry.entryName,
        content: entry.getData().toString("utf-8"),
      });
      if (files.length >= MAX_FILES) break;
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "ZIP 中未找到可治理的文本文件" },
        { status: 400 }
      );
    }

    // 创建仓库（归属用户本人账号）
    const repo = await createRepoWithUserToken(
      userToken,
      slugify(projectName),
      "上传代码治理审查",
      true
    );

    // 推送文件到仓库
    await pushMultipleFiles(
      userToken,
      repo.owner,
      repo.repo,
      files,
      "Initial upload for governance review [AI:upload]"
    );

    // 创建 Project
    const project = await prisma.project.create({
      data: {
        userId,
        name: projectName,
        description: `上传代码 ${projectName} 的治理审查`,
        projectType: "upload",
        status: ProjectStatus.governing,
        repoOwner: repo.owner,
        repoName: repo.repo,
        repoUrl: repo.html_url,
      },
    });
    projectId = project.id;

    // 创建治理 Task
    const task = await prisma.task.create({
      data: {
        projectId,
        stage: TaskStage.governance,
        status: TaskStatus.pending,
      },
    });

    // 触发 governance.yml
    const appUrl = await getAppUrl();
    const callbackUrl = `${appUrl}/api/webhook`;
    const forgeRepo = await getForgeRepo();

    const runId = await triggerWorkflow(
      forgeRepo.owner,
      forgeRepo.name,
      "governance.yml",
      "main",
      {
        repo_owner: repo.owner,
        repo_name: repo.repo,
        task_id: task.id,
        callback_url: callbackUrl,
        user_token: userToken,
      }
    );

    await prisma.task.update({
      where: { id: task.id },
      data: { actionsRunId: runId, status: TaskStatus.running },
    });

    return NextResponse.json({ projectId, taskId: task.id });
  } catch (error) {
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
    console.error("[upload] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
