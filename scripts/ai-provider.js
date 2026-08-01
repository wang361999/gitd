/**
 * scripts/ai-provider.js
 * 多模型 API 提供商抽象层 v1.0
 *
 * 功能概述:
 *   - 统一封装 5 个 OpenAI 兼容格式的 API 提供商
 *     (GitHub Models / OpenAI / DeepSeek / Anthropic / Mistral)
 *   - 根据任务复杂度 (simple / moderate / complex) 自动路由到合适的模型
 *   - 支持环境变量 AI_PROVIDER 和 AI_MODEL 覆盖默认路由
 *   - chatCompletion:   带速率限制与指数退避重试的同步调用
 *   - streamCompletion: 流式输出 (SSE) 支持
 *   - 自动检测可用的 API key 并选择提供商
 *
 * 用法:
 *   const { chatCompletion, streamCompletion, selectModel, MODEL_CONFIG } = require("./ai-provider");
 *
 *   // 方式一: 自动选择模型 (根据任务复杂度)
 *   const result = await chatCompletion(
 *     [{ role: "user", content: "你好" }],
 *     { taskComplexity: "simple" }
 *   );
 *   // => { content: "...", model: "gpt-4o-mini", usage: { ... } }
 *
 *   // 方式二: 显式指定模型
 *   const result = await chatCompletion(
 *     [{ role: "user", content: "写一个排序函数" }],
 *     { model: "gpt-4o", temperature: 0.5, maxTokens: 2000 }
 *   );
 *
 *   // 方式三: 流式输出
 *   for await (const chunk of streamCompletion(
 *     [{ role: "user", content: "讲个故事" }],
 *     { model: "gpt-4o-mini" }
 *   )) {
 *     process.stdout.write(chunk);
 *   }
 *
 * 环境变量:
 *   --- 提供商 API Key (至少设置一个) ---
 *   GITHUB_TOKEN        - GitHub Models API Token
 *   OPENAI_API_KEY      - OpenAI API Key
 *   DEEPSEEK_API_KEY    - DeepSeek API Key
 *   ANTHROPIC_API_KEY   - Anthropic API Key (通过 OpenAI 兼容接口调用)
 *   MISTRAL_API_KEY     - Mistral API Key
 *
 *   --- 路由覆盖 (可选) ---
 *   AI_PROVIDER         - 强制使用的提供商 (github / openai / deepseek / anthropic / mistral)
 *   AI_MODEL            - 强制使用的模型名称 (如 gpt-4o, deepseek-v4-pro)
 *
 *   --- 调优 (可选) ---
 *   AI_MAX_RETRIES      - 最大重试次数 (默认 4)
 *   AI_REQUEST_TIMEOUT  - 请求超时毫秒数 (默认 120000，即 2 分钟)
 */

"use strict";

// ============================================================
// 提供商配置
// ============================================================

/**
 * API 提供商配置表
 * 所有提供商均使用 OpenAI 兼容的 /chat/completions 接口格式
 *
 * 字段说明:
 *   name         - 提供商标识 (与 MODEL_CONFIG 中的 provider 字段对应)
 *   endpoint     - API 基础地址 (不含 /chat/completions 后缀)
 *   apiKeyEnv    - 存放 API Key 的环境变量名
 *   authHeader   - 认证请求头名称 (OpenAI 兼容格式统一使用 Authorization)
 *   authPrefix   - 认证值前缀 (Bearer )
 *   rateLimitMs  - 速率限制: 同一提供商两次请求间的最小间隔 (毫秒)
 *   extraHeaders - 额外请求头 (如 Anthropic 需要 anthropic-version)
 */
const PROVIDERS = {
  github: {
    name: "github",
    endpoint: "https://models.inference.ai.azure.com",
    apiKeyEnv: "GITHUB_TOKEN",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    rateLimitMs: 4200, // GitHub Models 约 15 次/分钟
    extraHeaders: {},
  },
  openai: {
    name: "openai",
    endpoint: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    rateLimitMs: 1000,
    extraHeaders: {},
  },
  deepseek: {
    name: "deepseek",
    endpoint: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    rateLimitMs: 1000,
    extraHeaders: {},
  },
  anthropic: {
    name: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    rateLimitMs: 1000,
    extraHeaders: {
      "anthropic-version": "2023-06-01", // Anthropic OpenAI 兼容接口需要的版本头
    },
  },
  mistral: {
    name: "mistral",
    endpoint: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    rateLimitMs: 1000,
    extraHeaders: {},
  },
};

// ============================================================
// 模型配置表
// ============================================================

/**
 * 模型配置表
 *
 * 字段说明:
 *   provider       - 所属提供商 (对应 PROVIDERS 的 key)
 *   contextWindow  - 上下文窗口大小 (token 数)
 *   maxOutput      - 最大输出 token 数
 *   cost           - 每百万 token 的费用 (美元)
 *                    input: 输入费用, output: 输出费用 (未标注的模型暂无费用数据)
 */
const MODEL_CONFIG = {
  "gpt-4o": { provider: "github", contextWindow: 128000, maxOutput: 16000, cost: { input: 2.5, output: 10 } },
  "gpt-4o-mini": { provider: "github", contextWindow: 128000, maxOutput: 16000, cost: { input: 0.15, output: 0.6 } },
  "deepseek-v4-pro": { provider: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "deepseek-v4-flash": { provider: "deepseek", contextWindow: 1000000, maxOutput: 384000 },
  "mistral-large-latest": { provider: "mistral", contextWindow: 256000, maxOutput: 8000 },
  "codestral-latest": { provider: "mistral", contextWindow: 32000, maxOutput: 4000 },
};

// ============================================================
// 任务复杂度 -> 模型路由
// ============================================================

/**
 * 任务复杂度到候选模型的映射 (按优先级排列)
 *
 * selectModel() 会按顺序尝试候选模型，跳过 API key 不可用的提供商
 */
const TASK_COMPLEXITY_MODELS = {
  // simple: 单行补全 / 简单修改 -> 轻量模型，速度快、成本低
  simple: ["gpt-4o-mini", "deepseek-v4-flash", "codestral-latest"],
  // moderate: 函数级生成 -> 中等模型，平衡质量与成本
  moderate: ["gpt-4o", "mistral-large-latest", "deepseek-v4-pro"],
  // complex: 多文件架构 / 复杂逻辑 -> 最强模型，追求最佳质量
  complex: ["gpt-4o", "deepseek-v4-pro", "mistral-large-latest"],
};

// ============================================================
// 全局状态: 速率限制
// ============================================================

/**
 * 记录每个提供商的上次请求时间戳 (毫秒)
 * key: 提供商名称, value: Date.now()
 */
const lastRequestTime = {};

// ============================================================
// 工具函数
// ============================================================

/** 等待指定毫秒 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取环境变量，支持默认值
 * 空字符串视为未设置
 * @param {string} key - 环境变量名
 * @param {*} defaultValue - 默认值
 * @returns {string|undefined}
 */
function getEnv(key, defaultValue) {
  const val = process.env[key];
  return val !== undefined && val !== "" ? val : defaultValue;
}

/**
 * 封装 fetch，增加连接超时控制
 *
 * 超时仅作用于"建立连接 / 接收响应头"阶段。
 * 一旦响应头到达 (fetch resolve)，即清除超时计时器，
 * 后续 body 流式读取不受超时影响 (流式场景需要长时间读取)。
 *
 * @param {string} url - 请求 URL
 * @param {object} init - fetch 初始化选项
 * @param {number} timeoutMs - 超时毫秒数
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // 若调用方传入了 AbortSignal，需要桥接到内部 controller
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }
  }

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId); // 响应头已到达，清除超时
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============================================================
// 提供商检测与模型选择
// ============================================================

/**
 * 获取所有可用的 API 提供商 (已配置 API key 的)
 *
 * @returns {string[]} 可用提供商名称数组，如 ["github", "deepseek"]
 */
function getAvailableProviders() {
  const available = [];
  for (const [name, config] of Object.entries(PROVIDERS)) {
    const key = process.env[config.apiKeyEnv];
    if (key && key.trim()) {
      available.push(name);
    }
  }
  return available;
}

/**
 * 根据任务复杂度自动选择模型
 *
 * 选择逻辑:
 *   1. 若设置了环境变量 AI_MODEL，直接返回该模型 (用户强制覆盖)
 *   2. 获取当前可用的提供商列表
 *   3. 根据 taskComplexity 获取候选模型列表 (按优先级)
 *   4. 从候选列表中选择第一个其提供商可用的模型
 *   5. 若候选模型均不可用，回退到任意可用模型并给出警告
 *
 * @param {string} taskComplexity - 任务复杂度: "simple" | "moderate" | "complex"
 * @returns {string} 模型名称
 * @throws {Error} 没有可用提供商时抛出异常
 */
function selectModel(taskComplexity = "moderate") {
  // 1. 环境变量覆盖: 用户强制指定模型
  const envModel = getEnv("AI_MODEL");
  if (envModel) {
    return envModel;
  }

  // 2. 获取可用提供商
  const available = getAvailableProviders();
  if (available.length === 0) {
    throw new Error(
      "没有可用的 API 提供商。请至少设置以下环境变量之一: " +
        Object.values(PROVIDERS)
          .map((p) => p.apiKeyEnv)
          .join(", ")
    );
  }

  // 3. 根据复杂度获取候选模型列表
  const candidates = TASK_COMPLEXITY_MODELS[taskComplexity] || TASK_COMPLEXITY_MODELS.moderate;

  // 4. 从候选模型中选择第一个其提供商可用的
  for (const model of candidates) {
    const config = MODEL_CONFIG[model];
    if (config && available.includes(config.provider)) {
      return model;
    }
  }

  // 5. 回退: 候选模型均不可用，选择任意可用模型
  for (const [model, config] of Object.entries(MODEL_CONFIG)) {
    if (available.includes(config.provider)) {
      console.warn(
        `[ai-provider] 任务复杂度 "${taskComplexity}" 的候选模型均不可用，回退到 ${model}`
      );
      return model;
    }
  }

  // 理论上不会走到这里 (available 不为空但 MODEL_CONFIG 中无匹配)
  throw new Error("无法选择模型: 有可用提供商但 MODEL_CONFIG 中无对应模型配置");
}

/**
 * 解析提供商与模型 (内部使用)
 *
 * 解析优先级:
 *   模型:   options.model  >  AI_MODEL 环境变量  >  selectModel(taskComplexity)
 *   提供商: options.provider  >  AI_PROVIDER 环境变量  >  MODEL_CONFIG[model].provider
 *
 * @param {object} options - 调用选项
 * @returns {{ provider: object, model: string, apiKey: string }}
 * @throws {Error} 提供商不可用或缺少 API key 时抛出异常
 */
function resolveProviderAndModel(options = {}) {
  // --- 解析模型 ---
  let model;
  if (options.model) {
    model = options.model;
  } else {
    const envModel = getEnv("AI_MODEL");
    model = envModel || selectModel(options.taskComplexity);
  }

  // --- 解析提供商 ---
  let providerName;
  if (options.provider) {
    providerName = options.provider;
  } else {
    const envProvider = getEnv("AI_PROVIDER");
    providerName = envProvider || MODEL_CONFIG[model]?.provider;
  }

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(
      `未知的提供商: "${providerName}"。支持的提供商: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }

  // --- 获取 API Key ---
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      `提供商 "${providerName}" 不可用: 环境变量 ${provider.apiKeyEnv} 未设置。` +
        `当前可用提供商: ${getAvailableProviders().join(", ") || "(无)"}`
    );
  }

  return { provider, model, apiKey };
}

// ============================================================
// 速率限制
// ============================================================

/**
 * 速率限制: 确保同一提供商的两次请求之间至少间隔 rateLimitMs
 * @param {object} provider - 提供商配置
 */
async function enforceRateLimit(provider) {
  const interval = provider.rateLimitMs;
  const lastTime = lastRequestTime[provider.name] || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < interval) {
    await sleep(interval - elapsed);
  }
}

// ============================================================
// chatCompletion: 同步调用 (带速率限制与指数退避重试)
// ============================================================

/**
 * 调用 LLM 进行对话补全 (同步，带速率限制与指数退避重试)
 *
 * @param {Array<{role: string, content: string}>} messages - 消息列表
 * @param {object} [options] - 调用选项
 * @param {string} [options.model] - 模型名称 (覆盖自动选择)
 * @param {string} [options.provider] - 提供商名称 (覆盖自动推断)
 * @param {string} [options.taskComplexity] - 任务复杂度，用于自动选择模型
 *        取值: "simple" | "moderate" | "complex"，默认 "moderate"
 * @param {number} [options.temperature=0.7] - 采样温度 (0~2)
 * @param {number} [options.maxTokens=4000] - 最大输出 token 数
 * @param {object} [options.responseFormat] - 响应格式，如 { type: "json_object" }
 * @param {number} [options.maxRetries] - 最大重试次数 (默认 4 或 AI_MAX_RETRIES)
 * @param {AbortSignal} [options.signal] - 中断信号 (用于取消请求)
 *
 * @returns {Promise<{content: string, model: string, usage: object}>}
 *   - content: 模型输出的文本内容
 *   - model:   实际使用的模型名称
 *   - usage:   token 使用量 { prompt_tokens, completion_tokens, total_tokens }
 *
 * @throws {Error} API 调用失败时抛出异常 (重试耗尽后)
 */
async function chatCompletion(messages, options = {}) {
  const { provider, model, apiKey } = resolveProviderAndModel(options);

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens || 4000;
  const maxRetries = options.maxRetries || parseInt(getEnv("AI_MAX_RETRIES", "4"), 10);
  const timeoutMs = parseInt(getEnv("AI_REQUEST_TIMEOUT", "120000"), 10);

  // 构建请求体 (OpenAI 兼容格式)
  const requestBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  // 可选: 响应格式 (如 JSON 模式)
  if (options.responseFormat) {
    requestBody.response_format = options.responseFormat;
  }

  // 构建请求头
  const headers = {
    "Content-Type": "application/json",
    [provider.authHeader]: `${provider.authPrefix}${apiKey}`,
    ...provider.extraHeaders,
  };

  const url = `${provider.endpoint}/chat/completions`;

  // --- 指数退避重试循环 ---
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 速率限制: 确保请求间隔
    await enforceRateLimit(provider);
    lastRequestTime[provider.name] = Date.now();

    if (attempt > 1) {
      console.log(
        `  [ai-provider] 第 ${attempt}/${maxRetries} 次重试 (model=${model}, provider=${provider.name}) ...`
      );
    }

    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: options.signal,
        },
        timeoutMs
      );

      // --- 429 速率限制: 读取 Retry-After 或指数退避 ---
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        const waitTime =
          retryAfter > 0
            ? retryAfter * 1000
            : Math.min(10000 * Math.pow(1.5, attempt - 1), 60000);
        console.warn(
          `  [ai-provider] 触发速率限制 (429)，等待 ${Math.round(waitTime / 1000)}s 后重试 ...`
        );
        await sleep(waitTime);
        continue;
      }

      // --- 5xx 服务端错误: 指数退避 ---
      if (res.status >= 500) {
        const waitTime = Math.min(3000 * Math.pow(2, attempt - 1), 60000);
        console.warn(
          `  [ai-provider] 服务端错误 (${res.status})，等待 ${Math.round(waitTime / 1000)}s 后重试 ...`
        );
        await sleep(waitTime);
        continue;
      }

      // --- 其他 4xx 客户端错误: 不重试，直接抛出 ---
      if (!res.ok) {
        const errText = await res.text();
        const hint =
          errText.includes("model_not_found") || errText.includes("does not exist")
            ? ` — 模型 "${model}" 可能在提供商 "${provider.name}" 上不可用`
            : "";
        throw new Error(`模型 API 错误 (${res.status}): ${errText.slice(0, 500)}${hint}`);
      }

      // --- 成功: 解析并返回 ---
      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "",
        model: data.model || model,
        usage:
          data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (err) {
      // 用户主动中断: 不重试
      if (err.name === "AbortError") throw err;
      // 已知 API 错误 (4xx 非 429): 不重试
      if (err.message && err.message.startsWith("模型 API 错误")) throw err;
      // 网络错误 / 超时: 指数退避重试
      if (attempt < maxRetries) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.warn(
          `  [ai-provider] 网络错误: ${err.message}，等待 ${Math.round(waitTime / 1000)}s 后重试 ...`
        );
        await sleep(waitTime);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `模型调用重试 ${maxRetries} 次后仍然失败 (model=${model}, provider=${provider.name})`
  );
}

// ============================================================
// streamCompletion: 流式调用 (SSE)
// ============================================================

/**
 * 流式调用 LLM，以异步生成器逐 token 返回内容
 *
 * 重试策略:
 *   仅在"建立连接"阶段重试 (429 / 5xx / 网络错误)。
 *   一旦开始接收流数据，不再重试 (避免重复输出)。
 *
 * 用法:
 *   for await (const chunk of streamCompletion(messages, { model: "gpt-4o" })) {
 *     process.stdout.write(chunk);
 *   }
 *
 * @param {Array<{role: string, content: string}>} messages - 消息列表
 * @param {object} [options] - 调用选项 (同 chatCompletion)
 * @yields {string} 每个文本片段 (delta content)
 */
async function* streamCompletion(messages, options = {}) {
  const { provider, model, apiKey } = resolveProviderAndModel(options);

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens || 4000;
  const maxRetries = options.maxRetries || parseInt(getEnv("AI_MAX_RETRIES", "4"), 10);
  const timeoutMs = parseInt(getEnv("AI_REQUEST_TIMEOUT", "120000"), 10);

  // 构建请求体 (启用流式)
  const requestBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  if (options.responseFormat) {
    requestBody.response_format = options.responseFormat;
  }

  // 构建请求头
  const headers = {
    "Content-Type": "application/json",
    [provider.authHeader]: `${provider.authPrefix}${apiKey}`,
    ...provider.extraHeaders,
  };

  const url = `${provider.endpoint}/chat/completions`;

  // ========== 阶段一: 建立连接 (可重试) ==========
  let res = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await enforceRateLimit(provider);
    lastRequestTime[provider.name] = Date.now();

    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: options.signal,
        },
        timeoutMs
      );

      // 429 / 5xx: 指数退避重试
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const waitTime =
            res.status === 429
              ? Math.min(10000 * Math.pow(1.5, attempt - 1), 60000)
              : Math.min(3000 * Math.pow(2, attempt - 1), 60000);
          console.warn(
            `  [ai-provider] 流式请求返回 ${res.status}，等待 ${Math.round(waitTime / 1000)}s 后重试 (${attempt}/${maxRetries}) ...`
          );
          await sleep(waitTime);
          continue;
        }
        const errText = await res.text();
        throw new Error(`流式模型 API 错误 (${res.status}): ${errText.slice(0, 500)}`);
      }

      // 其他 4xx: 不重试
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`流式模型 API 错误 (${res.status}): ${errText.slice(0, 500)}`);
      }

      // 连接成功，退出重试循环
      break;
    } catch (err) {
      // 用户中断 / API 错误: 不重试
      if (err.name === "AbortError") throw err;
      if (err.message && err.message.startsWith("流式模型 API 错误")) throw err;

      // 网络错误: 指数退避重试
      if (attempt < maxRetries) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.warn(
          `  [ai-provider] 流式连接失败: ${err.message}，等待 ${Math.round(waitTime / 1000)}s 后重试 (${attempt}/${maxRetries}) ...`
        );
        await sleep(waitTime);
        continue;
      }
      throw err;
    }
  }

  if (!res) {
    throw new Error("流式连接失败: 未获得响应");
  }

  // 检查响应体是否存在
  if (!res.body) {
    throw new Error("流式响应没有 body，提供商可能不支持流式输出");
  }

  // ========== 阶段二: 读取 SSE 流 (不可重试，避免重复输出) ==========
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 按行解析: 每条数据以 "data: " 开头
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留最后一条可能不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        // 跳过空行和 SSE 注释 (以冒号开头)
        if (!trimmed || trimmed.startsWith(":")) continue;
        // 只处理 data: 开头的行
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        // 流结束标记
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 忽略无法解析的行 (可能是心跳或部分数据)
        }
      }
    }

    // 处理 buffer 中剩余的最后一条数据
    const remaining = buffer.trim();
    if (remaining.startsWith("data:")) {
      const data = remaining.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* 忽略 */
        }
      }
    }
  } finally {
    // 释放 reader 锁 (部分运行时需要)
    if (typeof reader.releaseLock === "function") {
      reader.releaseLock();
    }
  }
}

// ============================================================
// 模块导出
// ============================================================

module.exports = {
  chatCompletion,
  streamCompletion,
  getAvailableProviders,
  selectModel,
  MODEL_CONFIG,
};

// ============================================================
// 直接运行时的自检演示
// 执行: node scripts/ai-provider.js
// ============================================================

if (require.main === module) {
  (async () => {
    console.log("========================================");
    console.log(" AI Provider 多模型抽象层 - 自检");
    console.log("========================================\n");

    // 1. 显示可用提供商
    const available = getAvailableProviders();
    console.log(`可用提供商: ${available.length ? available.join(", ") : "(无)"}`);

    if (available.length === 0) {
      console.error(
        "\n请至少设置一个 API key 环境变量:\n  " +
          Object.values(PROVIDERS)
            .map((p) => p.apiKeyEnv)
            .join("\n  ")
      );
      process.exit(1);
    }

    // 2. 显示各复杂度的模型路由
    console.log("\n模型路由:");
    for (const complexity of ["simple", "moderate", "complex"]) {
      try {
        const model = selectModel(complexity);
        const provider = MODEL_CONFIG[model]?.provider || "(未知)";
        console.log(`  ${complexity.padEnd(10)} -> ${model} (${provider})`);
      } catch (err) {
        console.log(`  ${complexity.padEnd(10)} -> 选择失败: ${err.message}`);
      }
    }

    // 3. 同步对话测试
    console.log("\n同步对话测试:");
    try {
      const result = await chatCompletion(
        [{ role: "user", content: "请用一句话介绍你自己" }],
        { taskComplexity: "simple", maxTokens: 200 }
      );
      console.log(`  模型: ${result.model}`);
      console.log(`  内容: ${result.content.slice(0, 120)}`);
      console.log(`  用量: ${JSON.stringify(result.usage)}`);
    } catch (err) {
      console.error(`  失败: ${err.message}`);
    }

    // 4. 流式输出测试
    console.log("\n流式输出测试:");
    try {
      process.stdout.write("  ");
      for await (const chunk of streamCompletion(
        [{ role: "user", content: "从 1 数到 5，每个数字之间用空格分隔" }],
        { taskComplexity: "simple", maxTokens: 200 }
      )) {
        process.stdout.write(chunk);
      }
      console.log();
    } catch (err) {
      console.error(`\n  失败: ${err.message}`);
    }

    console.log("\n========================================");
    console.log(" 自检完成");
    console.log("========================================");
  })();
}
