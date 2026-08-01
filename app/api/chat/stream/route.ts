/**
 * SSE 流式 AI 对话 API (POST)
 *
 * 请求体:
 *   { projectId, message, model?, contextFiles?, sessionId? }
 *
 * 以 Server-Sent Events 方式流式推送 AI 回复内容。
 * 若提供 sessionId，则会读取历史消息作为上下文，并将新消息追加到该会话；
 * 否则创建新的对话会话。
 *
 * 推送消息格式（每条 JSON）:
 *   { stage: "start" }
 *   { stage: "delta", data: { content } }   // 增量内容
 *   { stage: "done", data: { sessionId, content, usage } }
 *   { stage: "error", data: { error } }
 */

import { requireAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chatCompletion, ModelMessage } from "@/lib/models";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  fileContext?: string;
  timestamp?: string;
}

function sseEncode(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildContextBlock(contextFiles?: string[] | null): string {
  if (!Array.isArray(contextFiles) || contextFiles.length === 0) return "";
  const list = contextFiles.map((f) => `- ${f}`).join("\n");
  return `\n\n【当前关注的上下文文件】\n${list}\n请在回答时参考这些文件的相关内容。`;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  // 先做认证，失败时直接返回 SSE 错误
  let session: { userId?: string } | null;
  try {
    session = await requireAuth();
  } catch (error) {
    const msg =
      error instanceof Error && error.message === "Unauthorized"
        ? "Unauthorized"
        : error instanceof Error
        ? error.message
        : "Internal server error";
    return new Response(sseEncode({ stage: "error", data: { error: msg } }), {
      status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(payload)));
      };

      try {
        const body = await request.json();
        const { projectId, message, model, contextFiles, sessionId } = body ?? {};

        if (!projectId || !message) {
          send({
            stage: "error",
            data: { error: "缺少必填字段: projectId, message" },
          });
          controller.close();
          return;
        }

        // 校验项目归属
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { userId: true, name: true, description: true },
        });

        if (!project) {
          send({ stage: "error", data: { error: "项目不存在" } });
          controller.close();
          return;
        }

        if (project.userId !== session.userId) {
          send({ stage: "error", data: { error: "Forbidden" } });
          controller.close();
          return;
        }

        const useModel = model || "gpt-4o";
        const ctxFiles = Array.isArray(contextFiles) ? contextFiles : null;

        // 读取历史消息（若提供 sessionId）
        let existingMessages: ChatMessage[] = [];
        let chatSessionId: string | null = null;
        let chatTitle = "新对话";

        if (sessionId) {
          const existing = await prisma.chatSession.findUnique({
            where: { id: sessionId },
          });
          if (existing && existing.userId === session.userId) {
            chatSessionId = existing.id;
            chatTitle = existing.title;
            if (Array.isArray(existing.messages)) {
              existingMessages = existing.messages as unknown as ChatMessage[];
            }
          }
        }

        send({ stage: "start", data: { sessionId: chatSessionId } });

        const systemPrompt = `你是 Agent Forge 的 AI 编程助手，专注于帮助开发者编写、审查和优化代码。
当前项目：${project.name}
项目描述：${project.description || "（未提供）"}${buildContextBlock(ctxFiles)}

请根据用户的问题提供专业、准确的回答。涉及代码时给出完整可运行的示例，并解释关键点。`;

        // 构建消息列表（截断历史避免超出 token 限制，保留最近 10 条）
        const recentHistory = existingMessages.slice(-10);
        const messages: ModelMessage[] = [
          { role: "system", content: systemPrompt },
          ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: String(message) },
        ];

        // 调用 AI（GitHub Models 不支持原生流式，这里用分段模拟流式推送）
        const aiResponse = await chatCompletion(messages, {
          model: useModel,
          temperature: 0.7,
          maxTokens: 4000,
        });

        const fullContent = aiResponse.content;

        // 将回复按段落/块分块推送，模拟流式体验
        const chunkSize = 80; // 每块字符数
        for (let i = 0; i < fullContent.length; i += chunkSize) {
          const chunk = fullContent.slice(i, i + chunkSize);
          send({ stage: "delta", data: { content: chunk } });
        }

        // 保存对话到数据库
        const now = new Date().toISOString();
        const newMessages: ChatMessage[] = [
          ...existingMessages,
          { role: "user", content: String(message), timestamp: now },
          {
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
          },
        ];

        if (!chatTitle || chatTitle === "新对话") {
          chatTitle =
            typeof message === "string" && message.length > 0
              ? message.slice(0, 20)
              : "新对话";
        }

        if (chatSessionId) {
          await prisma.chatSession.update({
            where: { id: chatSessionId },
            data: {
              messages: newMessages as unknown as Prisma.InputJsonValue,
              model: useModel,
              contextFiles: ctxFiles ?? Prisma.JsonNull,
              title: chatTitle,
            },
          });
        } else {
          const created = await prisma.chatSession.create({
            data: {
              projectId,
              userId: session.userId!,
              title: chatTitle,
              messages: newMessages as unknown as Prisma.InputJsonValue,
              model: useModel,
              contextFiles: ctxFiles ?? Prisma.JsonNull,
            },
          });
          chatSessionId = created.id;
        }

        // 记录分析事件
        try {
          await prisma.analyticsEvent.create({
            data: {
              userId: session.userId,
              projectId,
              eventType: "chat-message",
              model: useModel,
              tokensUsed: aiResponse.usage?.total_tokens || 0,
              duration: Date.now() - startTime,
              metadata: { sessionId: chatSessionId },
            },
          });
        } catch {
          // 忽略分析事件写入错误
        }

        send({
          stage: "done",
          data: {
            sessionId: chatSessionId,
            content: fullContent,
            usage: aiResponse.usage,
          },
        });
      } catch (error) {
        send({
          stage: "error",
          data: {
            error: error instanceof Error ? error.message : "Internal server error",
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
