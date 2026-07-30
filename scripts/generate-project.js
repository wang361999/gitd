/**
 * scripts/generate-project.js
 * 代码生成脚本：调用 GitHub Models (GPT-4o) 分析需求并生成完整项目代码
 *
 * 用法:
 *   node scripts/generate-project.js \
 *     --requirement "需求描述" \
 *     --project-type web \
 *     --project-name my-app \
 *     --output-dir ./generated
 *
 * 环境变量:
 *   GITHUB_TOKEN - GitHub Token，用于调用 GitHub Models API
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ============================================================
// 配置
// ============================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const MODEL = "gpt-4o"; // 默认使用 GPT-4o

/** 速率限制：每分钟约 15 次，故每次请求间隔 4.2 秒 */
const MIN_INTERVAL_MS = 4200;
let lastRequestTime = 0;

// ============================================================
// 工具函数
// ============================================================

/** 等待指定毫秒 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 带速率限制与重试的模型调用 */
async function chatCompletion(messages, options = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error("环境变量 GITHUB_TOKEN 未设置，无法调用 GitHub Models API");
  }

  const maxTokens = options.maxTokens || 4000;
  const temperature = options.temperature ?? 0.5;

  // 速率限制
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    lastRequestTime = Date.now();
    console.log(`  [模型调用] 第 ${attempt} 次请求 (model=${MODEL}, max_tokens=${maxTokens}) ...`);

    const res = await fetch(`${MODELS_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (res.status === 429) {
      console.warn(`  [模型调用] 触发速率限制，等待 10 秒后重试 ...`);
      await sleep(10000);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      if (attempt < 3) {
        console.warn(`  [模型调用] 请求失败 (${res.status})，重试中 ...`);
        await sleep(3000);
        continue;
      }
      throw new Error(`模型 API 错误 (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: data.model,
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  throw new Error("模型调用重试 3 次后仍然失败");
}

/** 从模型返回中提取 JSON（容错处理） */
function extractJSON(text) {
  if (!text) return null;
  // 优先匹配 ```json 代码块
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {
      /* 忽略，继续尝试 */
    }
  }
  // 尝试匹配对象 / 数组
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      /* 忽略 */
    }
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      /* 忽略 */
    }
  }
  return null;
}

/** 同步执行 shell 命令 */
function exec(cmd, opts = {}) {
  console.log(`  [exec] ${cmd}`);
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

/** 递归写入文件（自动创建目录） */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  [写入] ${filePath} (${Buffer.byteLength(content)} bytes)`);
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ============================================================
// 核心逻辑
// ============================================================

/**
 * 第一步：分析需求，生成项目结构方案
 */
async function analyzeRequirement(requirement, projectType, projectName) {
  console.log("\n========== 第一步：分析需求 ==========");
  console.log(`需求: ${requirement}`);
  console.log(`项目类型: ${projectType}`);
  console.log(`项目名称: ${projectName}`);

  const systemPrompt = `你是一位资深软件架构师。请根据用户的需求描述，设计一个完整的、可直接运行的项目结构方案。
项目类型: ${projectType}
项目名称: ${projectName}

对于 web 类型，请基于 Next.js 14 (App Router) 设计结构。
对于 desktop 类型，请基于 Electron 设计结构。
对于 mobile 类型，请基于 React Native 设计结构。

返回 JSON 格式，严格遵循如下结构：
{
  "projectName": "string",
  "summary": "项目的一句话概述",
  "techStack": ["string"],
  "fileStructure": [
    { "path": "相对路径", "description": "该文件的职责描述" }
  ]
}
要求：
1. 只返回 JSON，不要包含任何解释文字或 markdown 标记
2. fileStructure 必须包含 package.json、README.md 以及核心源码文件
3. 文件数量控制在 8 ~ 15 个之间`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: requirement },
    ],
    { temperature: 0.3, maxTokens: 2500 }
  );

  const parsed = extractJSON(response.content);
  if (!parsed || !parsed.fileStructure) {
    throw new Error("无法解析需求分析结果，模型返回: " + response.content.slice(0, 200));
  }

  console.log(`\n分析完成：`);
  console.log(`  概述: ${parsed.summary || "(无)"}`);
  console.log(`  技术栈: ${(parsed.techStack || []).join(", ")}`);
  console.log(`  文件数: ${parsed.fileStructure.length}`);

  return parsed;
}

/**
 * 第二步：逐文件生成代码
 */
async function generateAllFiles(plan, requirement) {
  console.log("\n========== 第二步：逐文件生成代码 ==========");

  const context = `项目概述: ${plan.summary || ""}
技术栈: ${(plan.techStack || []).join(", ")}
原始需求: ${requirement}`;

  const files = [];
  for (const file of plan.fileStructure) {
    console.log(`\n正在生成: ${file.path}`);
    console.log(`  职责: ${file.description}`);

    const systemPrompt = `你是一位资深全栈开发工程师。请根据项目上下文与文件描述，生成完整、可运行的代码。
技术栈: ${(plan.techStack || []).join(", ")}
项目上下文: ${context}
文件路径: ${file.path}
文件职责: ${file.description}

要求：
1. 只返回文件内容本身，不要包含任何解释、说明或 markdown 代码块标记
2. 不要包含 "这是一个..." 之类的描述性文字
3. 代码必须完整可运行，包含必要的注释
4. package.json 必须包含所有需要的依赖与 scripts`;

    const response = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请生成文件: ${file.path}` },
      ],
      { temperature: 0.4, maxTokens: 4000 }
    );

    // 清理可能的 markdown 代码块包裹
    let content = response.content.trim();
    content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");

    files.push({ path: file.path, content });
    console.log(`  生成完成，${Buffer.byteLength(content)} bytes`);
  }

  return files;
}

/**
 * 第三步：写入文件到输出目录
 */
function writeAllFiles(outputDir, files) {
  console.log("\n========== 第三步：写入文件到磁盘 ==========");
  console.log(`输出目录: ${outputDir}`);

  // 清空输出目录（若已存在）
  if (fs.existsSync(outputDir)) {
    console.log(`  输出目录已存在，先清空`);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    writeFile(fullPath, file.content);
  }

  console.log(`\n共写入 ${files.length} 个文件`);
}

/**
 * 第四步：初始化 Git 仓库并提交
 */
function initGitRepo(outputDir, plan, requirement) {
  console.log("\n========== 第四步：初始化 Git 仓库 ==========");

  const cwd = { cwd: outputDir };

  exec("git init", cwd);
  exec("git config user.name agent-forge-bot", cwd);
  exec("git config user.email agent-forge-bot@users.noreply.github.com", cwd);
  exec("git add -A", cwd);

  // 生成简短的中文需求摘要（取前 50 字符，换行替换为空格）
  const summary = (requirement || "").replace(/\n/g, " ").trim().slice(0, 50);
  // AI 标记用于后续溯源：[AI:model_name]
  const aiTag = `[AI:${MODEL}]`;
  const commitMessage = `feat: 初始化项目 - ${plan.projectName || "generated-project"}

需求摘要: ${summary}
生成模型: ${MODEL}

${aiTag}`;

  // 使用 -F 从临时文件读取 commit message，避免特殊字符转义问题
  const msgFile = path.join(outputDir, ".git", "COMMIT_MSG");
  fs.writeFileSync(msgFile, commitMessage, "utf8");
  exec(`git commit -F "${msgFile}"`, cwd);
  fs.unlinkSync(msgFile);

  const log = exec("git log --oneline -1", cwd);
  console.log(`\n提交完成: ${log.trim()}`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("========================================");
  console.log(" Agent Forge - 代码生成脚本");
  console.log("========================================");

  const args = parseArgs(process.argv);

  const requirement = args.requirement || "";
  const projectType = (args["project-type"] || "web").toLowerCase();
  const projectName = args["project-name"] || "generated-project";
  const outputDir = path.resolve(args["output-dir"] || "./generated");

  if (!requirement) {
    console.error("错误: 缺少必填参数 --requirement");
    process.exit(1);
  }

  if (!GITHUB_TOKEN) {
    console.error("错误: 环境变量 GITHUB_TOKEN 未设置");
    process.exit(1);
  }

  console.log(`项目类型: ${projectType}`);
  console.log(`项目名称: ${projectName}`);
  console.log(`输出目录: ${outputDir}`);

  try {
    // 第一步：分析需求
    const plan = await analyzeRequirement(requirement, projectType, projectName);

    // 第二步：生成所有文件代码
    const files = await generateAllFiles(plan, requirement);

    // 确保 package.json 与 README.md 存在（兜底）
    ensureCoreFiles(files, plan, projectType, projectName, requirement);

    // 第三步：写入磁盘
    writeAllFiles(outputDir, files);

    // 第四步：初始化 Git 仓库
    initGitRepo(outputDir, plan, requirement);

    console.log("\n========================================");
    console.log(" 代码生成完成！");
    console.log("========================================");
    console.log(`输出目录: ${outputDir}`);
    console.log(`文件数量: ${files.length}`);
    console.log(`生成模型: ${MODEL}`);
  } catch (err) {
    console.error("\n========================================");
    console.error(" 代码生成失败！");
    console.error("========================================");
    console.error(err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

/**
 * 兜底：若模型未生成 package.json / README.md，则补一个最简版本
 */
function ensureCoreFiles(files, plan, projectType, projectName, requirement) {
  const paths = files.map((f) => f.path);

  if (!paths.some((p) => p === "package.json" || p.endsWith("/package.json") || p === "README.md" || p.endsWith("/README.md"))) {
    // 至少补 README
    files.push({
      path: "README.md",
      content: `# ${projectName}\n\n${plan.summary || "由 Agent Forge 自动生成的项目。"}\n\n## 需求\n\n${requirement}\n\n## 技术栈\n\n${(plan.techStack || []).join(", ")}\n`,
    });
  }
}

main();
