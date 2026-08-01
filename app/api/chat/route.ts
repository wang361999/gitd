/**
 * AI 对话 CRUD API
 *
 * GET:
 *   - ?projectId=xxx  获取项目的对话列表
 *   - ?id=xxx         获取单个对话详情（含全部消息）
 * POST:
 *   { projectId, message, model?, contextFiles? }
 *   发送消息并获取 AI 回复，保存到 ChatSession
 * DELETE:
 *   ?id=xxx  删除对话
 *
 * AI 调用使用 chatCompletion，系统提示词会包含上下文文件内容。
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletion, ModelMessage } from "@/lib/models";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  fileContext?: string;
  timestamp?: string;
}

/** 安全解析上下文文件内容（contextFiles 为文件路径数组，此处拼接为文本） */
function buildContextBlock(contextFiles?: string[] | null): string {
  if (!Array.isArray(contextFiles) || contextFiles.length === 0) return "";
  const list = contextFiles.map((f) => `- ${f}`).join("\n");
  return `\n\n【当前关注的上下文文件】\n${list}\n请在回答时参考这些文件的相关内容。`;
}

export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const id = searchParams.get("id");

    // -------------------- 单个对话详情 --------------------
    if (id) {
      const chat = await prisma.chatSession.findUnique({ where: { id } });

      if (!chat) {
        return NextResponse.json({ error: "对话不存在" }, { status: 404 });
      }

      if (chat.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({ chat });
    }

    // -------------------- 项目对话列表 --------------------
    if (!projectId) {
      return NextResponse.json(
        { error: "缺少 projectId 参数" },
        { status: 400 }
      );
    }

    // 校验项目归属
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const chats = await prisma.chatSession.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        model: true,
        contextFiles: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ chats });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[chat GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const session = await requireAuth();

    const body = await request.json();
    const { projectId: pid, message, model, contextFiles } = body ?? {};

    if (!pid || !message) {
      return NextResponse.json(
        { error: "缺少必填字段: projectId, message" },
        { status: 400 }
      );
    }

    // 校验项目归属
    const project = await prisma.project.findUnique({
      where: { id: pid },
      select: { userId: true, name: true, description: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const useModel = model || "gpt-4o";
    const ctxFiles = Array.isArray(contextFiles) ? contextFiles : null;

    // 获取或创建对话会话（此处每次 POST 都创建新会话；前端可先创建再追加）
    // 为保持简单：若无现有会话则新建，标题取消息前 20 字
    const title =
      typeof message === "string" && message.length > 0
        ? message.slice(0, 20)
        : "新对话";

    const existingMessages: ChatMessage[] = [];

    const systemPrompt = `你是 Agent Forge 的 AI 编程助手，专注于帮助开发者编写、审查和优化代码。
当前项目：${project.name}
项目描述：${project.description || "（未提供）"}${buildContextBlock(ctxFiles)}

请根据用户的问题提供专业、准确的回答。涉及代码时给出完整可运行的示例，并解释关键点。`;

    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...existingMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: String(message) },
    ];

    const aiResponse = await chatCompletion(messages, {
      model: useModel,
      temperature: 0.7,
      maxTokens: 4000,
    });

    const now = new Date().toISOString();
    const chatMessages: ChatMessage[] = [
      {
        role: "user",
        content: String(message),
        timestamp: now,
      },
      {
        role: "assistant",
        content: aiResponse.content,
        timestamp: new Date().toISOString(),
      },
    ];

    // 保存对话记录
    const chat = await prisma.chatSession.create({
      data: {
        projectId: pid,
        userId: session.userId!,
        title,
        messages: chatMessages as unknown as Prisma.InputJsonValue,
        model: useModel,
        contextFiles: ctxFiles ?? Prisma.JsonNull,
      },
    });

    // 记录分析事件
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.userId,
          projectId: pid,
          eventType: "chat-message",
          model: useModel,
          tokensUsed: aiResponse.usage?.total_tokens || 0,
          duration: Date.now() - startTime,
          metadata: { sessionId: chat.id },
        },
      });
    } catch {
      // 分析事件写入失败不影响主流程
    }

    return NextResponse.json({
      chat,
      reply: aiResponse.content,
      usage: aiResponse.usage,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[chat POST] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
    }

    const chat = await prisma.chatSession.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!chat) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 });
    }

    if (chat.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.chatSession.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[chat DELETE] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
