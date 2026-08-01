/**
 * 模型管理 API (GET)
 *
 * 返回可用 AI 模型列表，包含模型名称、提供商、上下文窗口、费用等信息。
 *
 * 优先从 lib/ai-provider-config.ts 导入配置（如果该文件存在），
 * 否则返回基于 lib/models.ts 中 AVAILABLE_MODELS 的默认模型列表。
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { AVAILABLE_MODELS } from "@/lib/models";

/** 默认模型元信息表（当 ai-provider-config 不存在时使用） */
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: string[];
  description: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: AVAILABLE_MODELS.GPT_4O,
    name: "GPT-4o",
    provider: "OpenAI",
    contextWindow: 128000,
    maxOutput: 16384,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    capabilities: ["chat", "code", "reasoning", "vision"],
    description: "OpenAI 旗舰多模态模型，适合复杂代码生成与推理任务",
  },
  {
    id: AVAILABLE_MODELS.GPT_4O_MINI,
    name: "GPT-4o mini",
    provider: "OpenAI",
    contextWindow: 128000,
    maxOutput: 16384,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    capabilities: ["chat", "code"],
    description: "轻量高效模型，适合日常对话与简单代码任务",
  },
  {
    id: AVAILABLE_MODELS.O1_PREVIEW,
    name: "o1-preview",
    provider: "OpenAI",
    contextWindow: 128000,
    maxOutput: 32768,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
    capabilities: ["reasoning", "code"],
    description: "强推理模型，适合复杂算法与架构设计",
  },
  {
    id: AVAILABLE_MODELS.O1_MINI,
    name: "o1-mini",
    provider: "OpenAI",
    contextWindow: 128000,
    maxOutput: 65536,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.012,
    capabilities: ["reasoning", "code"],
    description: "推理模型的精简版本，性价比更高",
  },
  {
    id: AVAILABLE_MODELS.LLAMA_3_1_405B,
    name: "Llama-3.1-405B-Instruct",
    provider: "Meta",
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: ["chat", "code"],
    description: "Meta 开源大模型，405B 参数，免费额度可用",
  },
  {
    id: AVAILABLE_MODELS.LLAMA_3_2_11B,
    name: "Llama-3.2-11B-Vision-Instruct",
    provider: "Meta",
    contextWindow: 128000,
    maxOutput: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: ["chat", "code", "vision"],
    description: "Meta 轻量视觉模型，支持图像理解",
  },
  {
    id: AVAILABLE_MODELS.MISTRAL_LARGE,
    name: "Mistral-large",
    provider: "Mistral AI",
    contextWindow: 32000,
    maxOutput: 4096,
    costPer1kInput: 0.002,
    costPer1kOutput: 0.006,
    capabilities: ["chat", "code"],
    description: "Mistral AI 旗舰模型，擅长代码与多语言任务",
  },
  {
    id: AVAILABLE_MODELS.PHI_4,
    name: "Phi-4",
    provider: "Microsoft",
    contextWindow: 16000,
    maxOutput: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: ["chat", "code", "reasoning"],
    description: "微软小参数高性能模型，适合推理与数学",
  },
  {
    id: AVAILABLE_MODELS.DEEPSEEK_R1,
    name: "DeepSeek-R1",
    provider: "DeepSeek",
    contextWindow: 64000,
    maxOutput: 8192,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.0022,
    capabilities: ["reasoning", "code"],
    description: "DeepSeek 推理模型，擅长数学与代码推理",
  },
];

export async function GET() {
  try {
    await requireAuth();

    // 尝试从 lib/ai-provider-config.ts 动态导入配置
    // 若该文件不存在，则使用默认模型列表
    let models: ModelInfo[] = DEFAULT_MODELS;
    try {
      const providerConfig = await import("@/lib/ai-provider-config");
      if (
        providerConfig &&
        typeof providerConfig === "object" &&
        "models" in providerConfig &&
        Array.isArray((providerConfig as { models: unknown }).models)
      ) {
        models = (providerConfig as { models: ModelInfo[] }).models;
      }
    } catch {
      // ai-provider-config 不存在，使用默认列表
    }

    return NextResponse.json({
      models,
      default: AVAILABLE_MODELS.GPT_4O,
      total: models.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[models GET] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
