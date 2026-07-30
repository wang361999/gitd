/**
 * GitHub Models AI 调用封装
 * 通过 GITHUB_TOKEN 调用 GitHub Models API
 * 免费额度：每天约150次请求，每分钟15次
 * 输入上限：8000 token，输出上限：4000 token
 */

import { requireSetting, SETTING_KEYS } from "./settings";

const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 可用模型列表 */
export const AVAILABLE_MODELS = {
  GPT_4O: "gpt-4o",
  GPT_4O_MINI: "gpt-4o-mini",
  O1_PREVIEW: "o1-preview",
  O1_MINI: "o1-mini",
  LLAMA_3_1_405B: "Llama-3.1-405B-Instruct",
  LLAMA_3_2_11B: "Llama-3.2-11B-Vision-Instruct",
  MISTRAL_LARGE: "Mistral-large",
  PHI_4: "Phi-4",
  DEEPSEEK_R1: "DeepSeek-R1",
} as const;

/** 默认模型 */
const DEFAULT_MODEL = AVAILABLE_MODELS.GPT_4O;

/**
 * 调用 GitHub Models 进行推理
 */
export async function chatCompletion(
  messages: ModelMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ModelResponse> {
  const model = options?.model || DEFAULT_MODEL;
  const maxTokens = options?.maxTokens || 4000;
  const temperature = options?.temperature ?? 0.7;

  // 从数据库动态读取系统级 GITHUB_TOKEN
  const token = await requireSetting(SETTING_KEYS.GITHUB_TOKEN);

  const res = await fetch(`${MODELS_ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // 速率限制处理
    if (res.status === 429) {
      throw new Error("RATE_LIMIT: GitHub Models 速率限制，请稍后重试");
    }
    throw new Error(`Model API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0]?.message?.content || "",
    model: data.model,
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * 分析用户需求，生成项目结构方案
 */
export async function analyzeRequirement(
  requirement: string,
  projectType: string
): Promise<{
  projectName: string;
  techStack: string[];
  fileStructure: { path: string; description: string }[];
  summary: string;
}> {
  const systemPrompt = `你是一个资深软件架构师。分析用户的需求描述，输出一个结构化的项目方案。
返回 JSON 格式，包含：projectName, techStack (数组), fileStructure (path + description 的数组), summary。
项目类型：${projectType}
注意：只返回 JSON，不要其他文本。`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: requirement },
    ],
    { temperature: 0.3, maxTokens: 2000 }
  );

  try {
    // 尝试解析 JSON
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response.content);
  } catch {
    return {
      projectName: "generated-project",
      techStack: [],
      fileStructure: [],
      summary: response.content,
    };
  }
}

/**
 * 生成单个文件的代码
 */
export async function generateFile(
  filePath: string,
  fileDescription: string,
  projectContext: string,
  techStack: string[]
): Promise<string> {
  const systemPrompt = `你是一个资深全栈开发工程师。根据项目上下文和文件描述，生成完整的代码文件。
技术栈：${techStack.join(", ")}
项目上下文：${projectContext}
文件路径：${filePath}
文件描述：${fileDescription}

要求：
1. 只返回文件内容，不要包含任何解释或 markdown 标记
2. 代码要完整可运行
3. 包含必要的注释
4. 遵循最佳实践`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请生成文件：${filePath}` },
    ],
    { temperature: 0.5, maxTokens: 4000 }
  );

  return response.content;
}

/**
 * 生成安装说明
 */
export async function generateInstallGuide(
  projectType: string,
  techStack: string[],
  projectName: string
): Promise<string> {
  const systemPrompt = `为以下项目生成一份清晰的安装说明（Markdown格式）：

项目名称：${projectName}
项目类型：${projectType}
技术栈：${techStack.join(", ")}

包含：环境要求、安装步骤、使用方法、常见问题。
只返回 Markdown 内容。`;

  const response = await chatCompletion(
    [{ role: "system", content: systemPrompt }],
    { temperature: 0.3, maxTokens: 2000 }
  );

  return response.content;
}

/**
 * Lore 决策提取：从 commit message 中分析技术决策
 */
export async function extractDecisions(
  commitMessages: { sha: string; message: string; diff?: string }[]
): Promise<
  {
    commitSha: string;
    context: string;
    decision: string;
    rejected: string | null;
    constraints: string | null;
  }[]
> {
  const systemPrompt = `你是一个技术决策分析师。分析 Git commit 记录，提取技术决策信息。
返回 JSON 数组，每个元素包含：commitSha, context (决策上下文), decision (决策内容), rejected (被否决的方案，无则null), constraints (约束条件，无则null)。
只返回 JSON 数组，不要其他文本。`;

  const input = JSON.stringify(
    commitMessages.map((c) => ({ sha: c.sha, message: c.message }))
  );

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    { temperature: 0.3, maxTokens: 4000 }
  );

  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response.content);
  } catch {
    return [];
  }
}

/**
 * 简单的请求队列，避免速率限制
 */
class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minInterval = 4200; // 每分钟15次 = 每4秒1次

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const elapsed = Date.now() - this.lastRequestTime;
          if (elapsed < this.minInterval) {
            await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
          }
          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.processing = false;
  }
}

export const modelQueue = new RequestQueue();

/** 带队列的调用封装 */
export async function queuedChatCompletion(
  messages: ModelMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<ModelResponse> {
  return modelQueue.add(() => chatCompletion(messages, options));
}
