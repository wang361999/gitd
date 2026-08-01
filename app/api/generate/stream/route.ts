/**
 * SSE 流式代码生成 API (POST)
 *
 * 接收需求描述，通过 AI 分阶段生成完整项目代码，并以 Server-Sent Events (SSE)
 * 方式向前端推送进度与产物。
 *
 * 请求体:
 *   { requirement: string, projectType: string, projectName: string, model?: string, tdd?: boolean }
 *
 * 推送阶段（每条消息为 JSON: { stage, data, progress }）:
 *   1. plan        — 架构分析（技术栈、文件结构、编码规范等）
 *   2. generating  — 逐文件生成代码
 *   3. review      — 代码审查总结
 *   4. done        — 生成完成
 *
 * 使用 ReadableStream + text/event-stream 实现 SSE。
 */

import { requireAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chatCompletion, ModelMessage } from "@/lib/models";

/** 将一条 SSE 消息编码为 `data: ...\n\n` 格式 */
function sseEncode(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** 安全解析 AI 返回的 JSON（兼容带 markdown 包裹或额外文本的情况） */
function safeJsonParse<T>(content: string, fallback: T): T {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  let session: { userId?: string } | null = null;
  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response(
        sseEncode({ stage: "error", data: { error: "Unauthorized" }, progress: 0 }),
        { status: 401, headers: { "Content-Type": "text/event-stream" } }
      );
    }
    return new Response(
      sseEncode({
        stage: "error",
        data: { error: error instanceof Error ? error.message : "Internal server error" },
        progress: 0,
      }),
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(payload)));
      };

      try {
        const body = await request.json();
        const {
          requirement,
          projectType,
          projectName,
          model,
          tdd,
        } = body ?? {};

        if (!requirement || !projectName) {
          send({
            stage: "error",
            data: { error: "Missing required fields: requirement, projectName" },
            progress: 0,
          });
          controller.close();
          return;
        }

        const useModel = model || "gpt-4o";
        const pType = projectType || "web";

        // ============================================================
        // 阶段 1: plan — 架构分析
        // ============================================================
        send({ stage: "plan", data: { status: "analyzing" }, progress: 10 });

        const planPrompt: ModelMessage[] = [
          {
            role: "system",
            content: `你是一个资深软件架构师。分析用户需求，输出结构化的项目方案。
返回 JSON 格式，包含字段：
- summary: 项目概述
- techStack: 技术栈数组
- fileStructure: [{ path, description }] 文件结构
- codingRules: 编码规范数组
- dependencies: 依赖对象 { name: version }
- architecture: 架构说明（可选）
- testingStrategy: 测试策略（可选）
- securityConsiderations: 安全考虑（可选）
${tdd ? "请采用 TDD（测试驱动开发）策略，优先规划测试文件。" : ""}
项目类型：${pType}
注意：只返回 JSON，不要其他文本。`,
          },
          {
            role: "user",
            content: `项目名称：${projectName}\n需求描述：${requirement}`,
          },
        ];

        const planResponse = await chatCompletion(planPrompt, {
          model: useModel,
          temperature: 0.3,
          maxTokens: 3000,
        });

        const plan = safeJsonParse(planResponse.content, {
          summary: requirement,
          techStack: [],
          fileStructure: [],
          codingRules: [],
          dependencies: {},
          architecture: null,
          testingStrategy: null,
          securityConsiderations: null,
        });

        // 持久化架构方案（关联项目可能不存在，这里仅尝试，失败不影响流程）
        let projectId: string | null = null;
        try {
          const project = await prisma.project.create({
            data: {
              userId: session.userId!,
              name: projectName,
              description: requirement,
              projectType: pType,
              status: "building",
            },
          });
          projectId = project.id;

          await prisma.architecturePlan.create({
            data: {
              projectId,
              summary: String(plan.summary ?? requirement),
              techStack: plan.techStack ?? [],
              fileStructure: plan.fileStructure ?? [],
              codingRules: plan.codingRules ?? [],
              dependencies: plan.dependencies ?? {},
              architecture: (plan.architecture as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              testingStrategy: plan.testingStrategy ?? null,
              securityConsiderations: plan.securityConsiderations ?? null,
            },
          });
        } catch {
          // 数据库写入失败不阻断生成流程
        }

        send({
          stage: "plan",
          data: { plan, projectId },
          progress: 30,
        });

        // ============================================================
        // 阶段 2: generating — 逐文件生成
        // ============================================================
        const fileStructure: { path: string; description: string }[] =
          Array.isArray(plan.fileStructure) ? plan.fileStructure : [];

        const generatedFiles: { path: string; content: string }[] = [];
        const techStack: string[] = Array.isArray(plan.techStack)
          ? plan.techStack
          : [];

        const totalFiles = Math.max(fileStructure.length, 1);
        let fileIndex = 0;

        for (const file of fileStructure) {
          const baseProgress = 30;
          const span = 50; // generating 阶段占总进度 30~80
          const progress = Math.round(
            baseProgress + (fileIndex / totalFiles) * span
          );
          send({
            stage: "generating",
            data: { file: file.path, status: "start", index: fileIndex, total: totalFiles },
            progress,
          });

          try {
            const fileResponse = await chatCompletion(
              [
                {
                  role: "system",
                  content: `你是一个资深全栈开发工程师。根据项目上下文和文件描述生成完整的代码文件。
技术栈：${techStack.join(", ")}
项目概述：${plan.summary}
文件路径：${file.path}
文件描述：${file.description}
要求：只返回文件内容，不要包含 markdown 代码块标记或解释。代码要完整可运行，包含必要注释。`,
                },
                { role: "user", content: `请生成文件：${file.path}` },
              ],
              { model: useModel, temperature: 0.5, maxTokens: 4000 }
            );

            const fileContent = fileResponse.content.replace(
              /^```[\w]*\n?|\n?```$/g,
              ""
            );
            generatedFiles.push({ path: file.path, content: fileContent });

            send({
              stage: "generating",
              data: {
                file: file.path,
                status: "done",
                content: fileContent,
                index: fileIndex,
                total: totalFiles,
              },
              progress: Math.round(
                baseProgress + ((fileIndex + 1) / totalFiles) * span
              ),
            });
          } catch (err) {
            send({
              stage: "generating",
              data: {
                file: file.path,
                status: "error",
                error: err instanceof Error ? err.message : "生成失败",
              },
              progress,
            });
          }
          fileIndex++;
        }

        // ============================================================
        // 阶段 3: review — 代码审查
        // ============================================================
        send({ stage: "review", data: { status: "reviewing" }, progress: 85 });

        let reviewSummary = null;
        try {
          const reviewResponse = await chatCompletion(
            [
              {
                role: "system",
                content: `你是一个资深代码审查专家。对以下生成的项目文件进行整体审查。
返回 JSON：{ overallScore: 0-100, summary: string, improvements: string[] }
只返回 JSON。`,
              },
              {
                role: "user",
                content: `项目：${projectName}\n技术栈：${techStack.join(", ")}\n文件清单：\n${generatedFiles
                  .map((f) => `- ${f.path}`)
                  .join("\n")}`,
              },
            ],
            { model: useModel, temperature: 0.3, maxTokens: 2000 }
          );

          reviewSummary = safeJsonParse(reviewResponse.content, {
            overallScore: 0,
            summary: reviewResponse.content,
            improvements: [],
          });

          // 持久化代码审查记录
          if (projectId) {
            await prisma.codeReview.create({
              data: {
                projectId,
                overallScore: Number(reviewSummary.overallScore) || 0,
                dimensions: {
                  functionality: 0,
                  quality: 0,
                  performance: 0,
                  security: 0,
                  robustness: 0,
                },
                issues: reviewSummary.improvements || [],
                reviewModel: useModel,
              },
            });
          }

          send({ stage: "review", data: { review: reviewSummary }, progress: 95 });
        } catch (err) {
          send({
            stage: "review",
            data: {
              error: err instanceof Error ? err.message : "审查失败",
            },
            progress: 95,
          });
        }

        // ============================================================
        // 阶段 4: done — 完成
        // ============================================================
        if (projectId) {
          try {
            await prisma.project.update({
              where: { id: projectId },
              data: { status: "done" },
            });
          } catch {
            // 状态更新失败不阻断
          }
        }

        send({
          stage: "done",
          data: {
            projectId,
            projectName,
            files: generatedFiles,
            plan,
            review: reviewSummary,
          },
          progress: 100,
        });
      } catch (error) {
        send({
          stage: "error",
          data: {
            error: error instanceof Error ? error.message : "Internal server error",
          },
          progress: 0,
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
