/**
 * AI 对话编程引擎
 * 支持上下文感知的多轮对话编程
 * 从项目信息、编码规则、上下文文件自动构建系统提示词，
 * 与 AI 进行多轮交互式编程对话
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";
import { getSetting, requireSetting, SETTING_KEYS } from "./settings";

// ============ 类型定义 ============

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: string;
  model?: string;
  tokensUsed?: number;
}

export interface ChatSession {
  id: string;
  projectId: string;
  userId: string | null;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ArchitecturePlan {
  id: string;
  projectId: string;
  content: string;
  codingRules: string[];
  techStack: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextFiles?: string[];
}

export interface SendMessageResult {
  reply: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface QuickCommandResult {
  systemPrompt: string;
  userMessage: string;
}

// ============ 表初始化 ============

let aiChatTablesInitialized = false;

/**
 * 确保 AI 对话相关数据库表已创建
 */
async function ensureAiChatTablesExist(): Promise<void> {
  if (aiChatTablesInitialized) return;

  try {
    // chat_sessions 表 — 存储对话会话及其消息
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "userId" TEXT,
        "title" TEXT NOT NULL DEFAULT '新对话',
        "messages" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
      );
    `);

    // architecture_plans 表 — 存储项目架构方案和编码规则
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "architecture_plans" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "codingRules" JSONB NOT NULL DEFAULT '[]',
        "techStack" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "architecture_plans_pkey" PRIMARY KEY ("id")
      );
    `);

    aiChatTablesInitialized = true;
  } catch (error) {
    console.error("[ensureAiChatTablesExist] 创建表失败:", error);
    aiChatTablesInitialized = true;
  }
}

// ============ 辅助函数 ============

/**
 * 从 GitHub 仓库获取文件内容
 */
async function fetchFileFromGitHub(
  owner: string,
  repo: string,
  path: string,
  branch: string = "main"
): Promise<string> {
  try {
    const token = await requireSetting(SETTING_KEYS.GITHUB_TOKEN);
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3.raw",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`获取文件失败 (${res.status}): ${path}`);
    }

    return await res.text();
  } catch (error) {
    console.error(`[fetchFileFromGitHub] 获取 ${path} 失败:`, error);
    return `// 无法获取文件: ${path}`;
  }
}

/**
 * 获取项目的架构方案
 */
async function getArchitecturePlan(
  projectId: string
): Promise<ArchitecturePlan | null> {
  await ensureAiChatTablesExist();
  try {
    const rows = await prisma.$queryRawUnsafe<ArchitecturePlan[]>(
      `SELECT * FROM "architecture_plans" WHERE "projectId" = $1 ORDER BY "updatedAt" DESC LIMIT 1`,
      projectId
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("[getArchitecturePlan] 查询失败:", error);
    return null;
  }
}

// ============ 核心功能 ============

/**
 * 创建对话会话
 */
export async function createChatSession(
  projectId: string,
  userId: string,
  title: string = "新对话"
): Promise<ChatSession> {
  await ensureAiChatTablesExist();

  const id = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "chat_sessions" ("id", "projectId", "userId", "title", "messages", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    id,
    projectId,
    userId,
    title,
    JSON.stringify([]),
    now,
    now
  );

  return {
    id,
    projectId,
    userId,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取项目的对话列表
 */
export async function getChatSessions(
  projectId: string
): Promise<ChatSession[]> {
  await ensureAiChatTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<ChatSession[]>(
      `SELECT * FROM "chat_sessions" WHERE "projectId" = $1 ORDER BY "updatedAt" DESC`,
      projectId
    );
    return rows.map((row) => ({
      ...row,
      messages:
        typeof row.messages === "string"
          ? JSON.parse(row.messages)
          : row.messages || [],
    }));
  } catch (error) {
    console.error("[getChatSessions] 查询失败:", error);
    return [];
  }
}

/**
 * 获取单个对话
 */
export async function getChatSession(id: string): Promise<ChatSession | null> {
  await ensureAiChatTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<ChatSession[]>(
      `SELECT * FROM "chat_sessions" WHERE "id" = $1`,
      id
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      ...row,
      messages:
        typeof row.messages === "string"
          ? JSON.parse(row.messages)
          : row.messages || [],
    };
  } catch (error) {
    console.error("[getChatSession] 查询失败:", error);
    return null;
  }
}

/**
 * 构建系统提示词
 * 包含项目信息、编码规则、上下文文件内容
 */
export async function buildSystemPrompt(
  projectId: string,
  contextFiles?: string[]
): Promise<string> {
  // 获取项目信息
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error(`项目不存在: ${projectId}`);
  }

  // 获取架构方案
  const archPlan = await getArchitecturePlan(projectId);

  // 构建系统提示词
  const parts: string[] = [];

  parts.push("你是一个资深全栈开发工程师 AI 助手，正在协助用户进行编程开发。");
  parts.push("请根据项目上下文提供专业、准确的编程建议。");

  // 项目信息
  parts.push("\n## 项目信息");
  parts.push(`- 项目名称: ${project.name}`);
  parts.push(`- 项目描述: ${project.description}`);
  parts.push(`- 项目类型: ${project.projectType}`);
  if (project.repoOwner && project.repoName) {
    parts.push(`- 代码仓库: ${project.repoOwner}/${project.repoName}`);
  }

  // 架构方案和编码规则
  if (archPlan) {
    parts.push("\n## 架构方案");
    parts.push(archPlan.content);

    if (archPlan.codingRules && archPlan.codingRules.length > 0) {
      parts.push("\n## 编码规则");
      archPlan.codingRules.forEach((rule, index) => {
        parts.push(`${index + 1}. ${rule}`);
      });
    }

    if (archPlan.techStack && archPlan.techStack.length > 0) {
      parts.push("\n## 技术栈");
      parts.push(archPlan.techStack.join(", "));
    }
  }

  // 上下文文件内容
  if (contextFiles && contextFiles.length > 0 && project.repoOwner && project.repoName) {
    parts.push("\n## 上下文文件");

    for (const filePath of contextFiles) {
      try {
        const content = await fetchFileFromGitHub(
          project.repoOwner,
          project.repoName,
          filePath
        );
        parts.push(`\n### ${filePath}`);
        parts.push("```");
        parts.push(content);
        parts.push("```");
      } catch (error) {
        parts.push(`\n### ${filePath}`);
        parts.push(`(无法获取文件内容: ${error instanceof Error ? error.message : "未知错误"})`);
      }
    }
  }

  parts.push("\n## 注意事项");
  parts.push("- 回复使用中文");
  parts.push("- 代码要完整可运行，包含必要注释");
  parts.push("- 遵循项目已有的编码规则和架构约定");
  parts.push("- 如果需要修改文件，请明确指出文件路径和修改内容");

  return parts.join("\n");
}

/**
 * 处理快捷指令
 * 支持: /fix, /test, /refactor, /explain, /optimize
 */
export function handleQuickCommand(
  message: string
): QuickCommandResult {
  const trimmed = message.trim();

  // 匹配快捷指令格式: /command [参数] (使用 [\s\S] 替代 /s 标志以兼容低版本 target)
  const match = trimmed.match(/^(\/\w+)\s*([\s\S]*)$/);
  if (!match) {
    return { systemPrompt: "", userMessage: message };
  }

  const command = match[1].toLowerCase();
  const content = match[2].trim() || "请分析以下代码";

  const commandConfigs: Record<string, { systemPrompt: string; userMessage: string }> = {
    "/fix": {
      systemPrompt:
        "你是一个 Bug 修复专家。请分析用户提供的代码，找出潜在的 Bug 和问题，并提供具体的修复方案。" +
        "请按以下格式回答:\n1. 问题描述\n2. 根本原因\n3. 修复方案（包含完整代码）\n4. 修复说明",
      userMessage: `请检查并修复以下代码中的问题:\n\n${content}`,
    },
    "/test": {
      systemPrompt:
        "你是一个测试工程师。请为用户提供的代码编写全面的单元测试。" +
        "要求:\n1. 覆盖所有核心逻辑分支\n2. 包含正常情况和边界情况\n3. 使用主流测试框架\n4. 测试代码要完整可运行",
      userMessage: `请为以下代码编写测试用例:\n\n${content}`,
    },
    "/refactor": {
      systemPrompt:
        "你是一个代码重构专家。请分析用户提供的代码，识别代码异味，并提供重构方案。" +
        "请按以下格式回答:\n1. 代码异味分析\n2. 重构方案\n3. 重构后的完整代码\n4. 重构收益说明",
      userMessage: `请重构以下代码以提升可读性和可维护性:\n\n${content}`,
    },
    "/explain": {
      systemPrompt:
        "你是一个技术导师。请用清晰易懂的方式解释用户提供的代码。" +
        "请按以下格式回答:\n1. 功能概述\n2. 逐段解析\n3. 关键设计点\n4. 可能的改进建议",
      userMessage: `请解释以下代码的功能和实现细节:\n\n${content}`,
    },
    "/optimize": {
      systemPrompt:
        "你是一个性能优化专家。请分析用户提供的代码，识别性能瓶颈，并提供优化方案。" +
        "请按以下格式回答:\n1. 性能分析\n2. 优化方案\n3. 优化后的完整代码\n4. 预期性能提升",
      userMessage: `请优化以下代码的性能:\n\n${content}`,
    },
  };

  const config = commandConfigs[command];
  if (!config) {
    return { systemPrompt: "", userMessage: message };
  }

  return config;
}

/**
 * 发送消息并获取 AI 回复
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  options?: SendMessageOptions
): Promise<SendMessageResult> {
  await ensureAiChatTablesExist();

  // 获取会话
  const session = await getChatSession(sessionId);
  if (!session) {
    throw new Error(`对话会话不存在: ${sessionId}`);
  }

  // 处理快捷指令
  const quickCommand = handleQuickCommand(message);

  // 构建系统提示词
  const baseSystemPrompt = await buildSystemPrompt(
    session.projectId,
    options?.contextFiles
  );

  // 如果有快捷指令的增强提示，追加到系统提示词
  const fullSystemPrompt = quickCommand.systemPrompt
    ? `${baseSystemPrompt}\n\n## 当前任务模式\n${quickCommand.systemPrompt}`
    : baseSystemPrompt;

  // 实际发送的用户消息
  const actualUserMessage = quickCommand.userMessage || message;

  // 构建消息列表（系统提示 + 历史消息 + 新消息）
  const messages: ModelMessage[] = [
    { role: "system", content: fullSystemPrompt },
  ];

  // 添加历史消息（最多保留最近 20 条以控制上下文长度）
  const recentHistory = session.messages.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // 添加当前用户消息
  messages.push({ role: "user", content: actualUserMessage });

  // 调用 AI
  const response = await chatCompletion(messages, {
    model: options?.model,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  // 构建新的消息记录
  const now = new Date().toISOString();
  const userMessage: ChatMessage = {
    role: "user",
    content: message, // 保存原始消息（包含快捷指令）
    timestamp: now,
  };
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: response.content,
    timestamp: now,
    model: response.model,
    tokensUsed: response.usage?.total_tokens || 0,
  };

  // 更新会话消息
  const updatedMessages = [...session.messages, userMessage, assistantMessage];

  await prisma.$executeRawUnsafe(
    `UPDATE "chat_sessions" SET "messages" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
    JSON.stringify(updatedMessages),
    sessionId
  );

  return {
    reply: response.content,
    usage: response.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * 删除对话
 */
export async function deleteChatSession(id: string): Promise<void> {
  await ensureAiChatTablesExist();

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "chat_sessions" WHERE "id" = $1`,
      id
    );
  } catch (error) {
    console.error("[deleteChatSession] 删除失败:", error);
    throw new Error(`删除对话失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}
