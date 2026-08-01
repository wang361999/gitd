/**
 * 多 AI Provider 配置管理
 * 管理 5 个 API 提供商的配置和路由
 * 支持 GitHub Models、OpenAI、DeepSeek、Anthropic、Mistral
 * 根据任务复杂度自动选择最优模型
 */

import { getSetting, saveSettings } from "./settings";

// ============ 类型定义 ============

export type ProviderName = "github" | "openai" | "deepseek" | "anthropic" | "mistral";

export type TaskComplexity = "simple" | "moderate" | "complex";

export interface ProviderConfig {
  name: ProviderName;
  displayName: string;
  apiBase: string;
  apiKeySettingKey: string;
  authHeader: string;
  authPrefix: string;
  defaultModel: string;
  models: string[];
  enabled: boolean;
  description: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderName;
  contextWindow: number; // tokens
  maxOutput: number; // tokens
  costPerInputToken: number; // USD per token
  costPerOutputToken: number; // USD per token
  description: string;
  capabilities: string[];
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export interface ProviderTestResult {
  provider: ProviderName;
  success: boolean;
  latency: number; // ms
  message: string;
  models?: string[];
}

// ============ Provider 配置 ============

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  github: {
    name: "github",
    displayName: "GitHub Models",
    apiBase: "https://models.inference.ai.azure.com",
    apiKeySettingKey: "GITHUB_TOKEN",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultModel: "gpt-4o",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "o1-preview",
      "o1-mini",
      "Llama-3.1-405B-Instruct",
      "Llama-3.2-11B-Vision-Instruct",
      "Mistral-large",
      "Phi-4",
      "DeepSeek-R1",
    ],
    enabled: true,
    description: "GitHub Models API，免费额度每天约 150 次请求",
  },
  openai: {
    name: "openai",
    displayName: "OpenAI",
    apiBase: "https://api.openai.com/v1",
    apiKeySettingKey: "AI_PROVIDER_OPENAI_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    enabled: false,
    description: "OpenAI 官方 API，支持 GPT 系列模型",
  },
  deepseek: {
    name: "deepseek",
    displayName: "DeepSeek",
    apiBase: "https://api.deepseek.com/v1",
    apiKeySettingKey: "AI_PROVIDER_DEEPSEEK_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    enabled: false,
    description: "DeepSeek API，性价比高，擅长代码生成",
  },
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic Claude",
    apiBase: "https://api.anthropic.com/v1",
    apiKeySettingKey: "AI_PROVIDER_ANTHROPIC_API_KEY",
    authHeader: "x-api-key",
    authPrefix: "",
    defaultModel: "claude-3-5-sonnet-20241022",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
    ],
    enabled: false,
    description: "Anthropic Claude API，擅长长文本理解和代码分析",
  },
  mistral: {
    name: "mistral",
    displayName: "Mistral AI",
    apiBase: "https://api.mistral.ai/v1",
    apiKeySettingKey: "AI_PROVIDER_MISTRAL_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    defaultModel: "mistral-large-latest",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    enabled: false,
    description: "Mistral AI API，开源友好，欧洲部署",
  },
};

// ============ 模型配置 ============

export const MODEL_CONFIG: ModelInfo[] = [
  // GitHub Models
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "github",
    contextWindow: 128000,
    maxOutput: 16384,
    costPerInputToken: 0.0000025,
    costPerOutputToken: 0.00001,
    description: "OpenAI GPT-4o 多模态旗舰模型",
    capabilities: ["chat", "code", "vision", "reasoning"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "github",
    contextWindow: 128000,
    maxOutput: 16384,
    costPerInputToken: 0.00000015,
    costPerOutputToken: 0.0000006,
    description: "GPT-4o 轻量版，速度快、成本低",
    capabilities: ["chat", "code", "vision"],
  },
  {
    id: "o1-preview",
    name: "o1 Preview",
    provider: "github",
    contextWindow: 128000,
    maxOutput: 32768,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.00006,
    description: "OpenAI o1 推理模型，擅长复杂推理",
    capabilities: ["chat", "reasoning", "code"],
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    provider: "github",
    contextWindow: 128000,
    maxOutput: 65536,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000012,
    description: "o1 轻量版，推理能力优秀",
    capabilities: ["chat", "reasoning", "code"],
  },
  {
    id: "Llama-3.1-405B-Instruct",
    name: "Llama 3.1 405B",
    provider: "github",
    contextWindow: 128000,
    maxOutput: 4096,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000003,
    description: "Meta Llama 3.1 405B 大型开源模型",
    capabilities: ["chat", "code", "reasoning"],
  },
  {
    id: "Phi-4",
    name: "Phi-4",
    provider: "github",
    contextWindow: 16384,
    maxOutput: 4096,
    costPerInputToken: 0.0000005,
    costPerOutputToken: 0.0000005,
    description: "微软 Phi-4 小型高效模型",
    capabilities: ["chat", "code"],
  },
  {
    id: "DeepSeek-R1",
    name: "DeepSeek R1",
    provider: "github",
    contextWindow: 64000,
    maxOutput: 8192,
    costPerInputToken: 0.00000055,
    costPerOutputToken: 0.00000219,
    description: "DeepSeek R1 推理模型",
    capabilities: ["chat", "reasoning", "code"],
  },
  // OpenAI
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextWindow: 128000,
    maxOutput: 4096,
    costPerInputToken: 0.00001,
    costPerOutputToken: 0.00003,
    description: "GPT-4 Turbo，性价比高的旗舰模型",
    capabilities: ["chat", "code", "vision", "reasoning"],
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    contextWindow: 16385,
    maxOutput: 4096,
    costPerInputToken: 0.0000005,
    costPerOutputToken: 0.0000015,
    description: "GPT-3.5 Turbo，经济型模型",
    capabilities: ["chat", "code"],
  },
  // DeepSeek
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    contextWindow: 64000,
    maxOutput: 8192,
    costPerInputToken: 0.00000027,
    costPerOutputToken: 0.0000011,
    description: "DeepSeek 对话模型，性价比极高",
    capabilities: ["chat", "code"],
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "deepseek",
    contextWindow: 64000,
    maxOutput: 8192,
    costPerInputToken: 0.00000027,
    costPerOutputToken: 0.0000011,
    description: "DeepSeek 代码专用模型",
    capabilities: ["code"],
  },
  // Anthropic
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 8192,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    description: "Claude 3.5 Sonnet，代码和推理能力强",
    capabilities: ["chat", "code", "vision", "reasoning"],
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 4096,
    costPerInputToken: 0.000015,
    costPerOutputToken: 0.000075,
    description: "Claude 3 Opus，最强推理能力",
    capabilities: ["chat", "code", "vision", "reasoning"],
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    contextWindow: 200000,
    maxOutput: 4096,
    costPerInputToken: 0.00000025,
    costPerOutputToken: 0.00000125,
    description: "Claude 3 Haiku，快速轻量",
    capabilities: ["chat", "code", "vision"],
  },
  // Mistral
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    provider: "mistral",
    contextWindow: 32000,
    maxOutput: 8192,
    costPerInputToken: 0.000002,
    costPerOutputToken: 0.000006,
    description: "Mistral Large，旗舰模型",
    capabilities: ["chat", "code", "reasoning"],
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    provider: "mistral",
    contextWindow: 32000,
    maxOutput: 8192,
    costPerInputToken: 0.0000002,
    costPerOutputToken: 0.0000006,
    description: "Mistral Small，经济型模型",
    capabilities: ["chat", "code"],
  },
];

// ============ 任务复杂度模型映射 ============

export const TASK_COMPLEXITY_MODELS: Record<TaskComplexity, ModelInfo[]> = {
  simple: MODEL_CONFIG.filter(
    (m) =>
      m.id === "gpt-4o-mini" ||
      m.id === "gpt-3.5-turbo" ||
      m.id === "claude-3-haiku-20240307" ||
      m.id === "mistral-small-latest" ||
      m.id === "Phi-4" ||
      m.id === "deepseek-chat"
  ),
  moderate: MODEL_CONFIG.filter(
    (m) =>
      m.id === "gpt-4o" ||
      m.id === "gpt-4-turbo" ||
      m.id === "claude-3-5-sonnet-20241022" ||
      m.id === "mistral-large-latest" ||
      m.id === "Llama-3.1-405B-Instruct" ||
      m.id === "deepseek-coder"
  ),
  complex: MODEL_CONFIG.filter(
    (m) =>
      m.id === "o1-preview" ||
      m.id === "o1-mini" ||
      m.id === "claude-3-opus-20240229" ||
      m.id === "DeepSeek-R1" ||
      m.id === "gpt-4o"
  ),
};

// ============ 核心功能 ============

/**
 * 获取已配置的提供商列表
 * 检查哪些提供商已设置 API Key
 */
export async function getAvailableProviders(): Promise<ProviderConfig[]> {
  const available: ProviderConfig[] = [];

  for (const [name, config] of Object.entries(PROVIDERS)) {
    const apiKey = await getSetting(config.apiKeySettingKey);
    if (apiKey) {
      available.push({ ...config, enabled: true });
    }
  }

  return available;
}

/**
 * 根据复杂度选择模型
 * 优先选择已配置 API Key 的提供商的模型
 */
export async function selectModel(
  taskComplexity: TaskComplexity
): Promise<ModelInfo> {
  const candidates = TASK_COMPLEXITY_MODELS[taskComplexity] || [];
  if (candidates.length === 0) {
    // 回退到 GPT-4o
    return MODEL_CONFIG[0];
  }

  // 获取已配置的提供商
  const availableProviders = await getAvailableProviders();
  const availableProviderNames = new Set(availableProviders.map((p) => p.name));

  // 优先选择已配置提供商的模型
  const configuredCandidate = candidates.find((m) =>
    availableProviderNames.has(m.provider)
  );

  if (configuredCandidate) {
    return configuredCandidate;
  }

  // 如果没有已配置的提供商，返回第一个候选（GitHub Models 总是默认可用）
  return candidates[0];
}

/**
 * 获取提供商配置
 */
export async function getProviderConfig(
  providerName: ProviderName
): Promise<ProviderConfig | null> {
  const config = PROVIDERS[providerName];
  if (!config) return null;

  const apiKey = await getSetting(config.apiKeySettingKey);
  return {
    ...config,
    enabled: Boolean(apiKey),
  };
}

/**
 * 保存提供商配置到 settings 表
 */
export async function saveProviderConfig(
  providerName: ProviderName,
  apiKey: string
): Promise<void> {
  const config = PROVIDERS[providerName];
  if (!config) {
    throw new Error(`未知的提供商: ${providerName}`);
  }

  await saveSettings({
    [config.apiKeySettingKey]: apiKey,
  });
}

/**
 * 测试提供商连接
 */
export async function testProviderConnection(
  providerName: ProviderName
): Promise<ProviderTestResult> {
  const config = await getProviderConfig(providerName);
  if (!config) {
    return {
      provider: providerName,
      success: false,
      latency: 0,
      message: `未知的提供商: ${providerName}`,
    };
  }

  const apiKey = await getSetting(config.apiKeySettingKey);
  if (!apiKey) {
    return {
      provider: providerName,
      success: false,
      latency: 0,
      message: `提供商 ${config.displayName} 未配置 API Key`,
    };
  }

  const startTime = Date.now();

  try {
    // 根据提供商类型构建测试请求
    let endpoint: string;
    let headers: Record<string, string>;

    if (providerName === "anthropic") {
      // Anthropic 使用不同的 API 格式
      endpoint = `${config.apiBase}/messages`;
      headers = {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
    } else {
      endpoint = `${config.apiBase}/chat/completions`;
      const authValue = config.authPrefix
        ? `${config.authPrefix} ${apiKey}`
        : apiKey;
      headers = {
        [config.authHeader]: authValue,
        "Content-Type": "application/json",
      };
    }

    const body =
      providerName === "anthropic"
        ? JSON.stringify({
            model: config.defaultModel,
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
          })
        : JSON.stringify({
            model: config.defaultModel,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 10,
          });

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    const latency = Date.now() - startTime;

    if (res.ok) {
      return {
        provider: providerName,
        success: true,
        latency,
        message: `连接成功，延迟 ${latency}ms`,
        models: config.models,
      };
    } else {
      const errText = await res.text();
      return {
        provider: providerName,
        success: false,
        latency,
        message: `连接失败 (${res.status}): ${errText.substring(0, 200)}`,
      };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      provider: providerName,
      success: false,
      latency,
      message: `连接异常: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

/**
 * 返回所有模型信息列表
 */
export function getAllModels(): ModelInfo[] {
  return [...MODEL_CONFIG];
}

/**
 * 费用估算
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): CostEstimate {
  const modelInfo = MODEL_CONFIG.find((m) => m.id === model);

  if (!modelInfo) {
    // 未知模型，返回零成本
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: "USD",
    };
  }

  const inputCost = inputTokens * modelInfo.costPerInputToken;
  const outputCost = outputTokens * modelInfo.costPerOutputToken;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: "USD",
  };
}
