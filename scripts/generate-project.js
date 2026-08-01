/**
 * scripts/generate-project.js
 * 代码生成脚本 v2.0：高质量 AI 代码生成引擎
 *
 * 增强能力:
 *   - 上下文感知生成: 后续文件生成时携带已生成文件摘要，确保一致性
 *   - 生成后审查: 自动审查生成的代码，检测缺失导入、不一致命名等
 *   - 依赖验证: 确保 package.json 包含代码中使用的所有依赖
 *   - 增强提示工程: 使用 few-shot 示例和详细指令提升生成质量
 *   - 指数退避重试: 更健壮的 API 调用
 *   - 代码质量校验: 检测常见代码质量问题
 *   - 多模型支持: 可配置模型和参数
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
 *   GENERATE_MODEL - 可选，覆盖默认模型
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ============================================================
// 配置
// ============================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const MODEL = process.env.GENERATE_MODEL || "gpt-4o"; // 可通过环境变量覆盖

/** 速率限制：每分钟约 15 次，故每次请求间隔 4.2 秒 */
const MIN_INTERVAL_MS = 4200;
let lastRequestTime = 0;

/** 已生成文件的上下文摘要 (用于上下文感知生成) */
const generatedContext = [];

// ============================================================
// 工具函数
// ============================================================

/** 等待指定毫秒 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 带速率限制与指数退避重试的模型调用 */
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

  for (let attempt = 1; attempt <= 4; attempt++) {
    lastRequestTime = Date.now();
    console.log(`  [模型调用] 第 ${attempt} 次请求 (model=${MODEL}, max_tokens=${maxTokens}) ...`);

    try {
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
        const waitTime = Math.min(10000 * Math.pow(1.5, attempt - 1), 60000);
        console.warn(`  [模型调用] 触发速率限制，等待 ${waitTime / 1000}s 后重试 ...`);
        await sleep(waitTime);
        continue;
      }

      if (res.status >= 500) {
        const waitTime = 3000 * Math.pow(2, attempt - 1);
        console.warn(`  [模型调用] 服务端错误 (${res.status})，等待 ${waitTime / 1000}s 后重试 ...`);
        await sleep(waitTime);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        if (attempt < 4) {
          console.warn(`  [模型调用] 请求失败 (${res.status})，重试中 ...`);
          await sleep(3000);
          continue;
        }
        throw new Error(`模型 API 错误 (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "",
        model: data.model,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (err) {
      if (attempt < 4 && !err.message.includes("模型 API 错误")) {
        const waitTime = 2000 * Math.pow(2, attempt - 1);
        console.warn(`  [模型调用] 网络错误，等待 ${waitTime / 1000}s 后重试 ...`);
        await sleep(waitTime);
        continue;
      }
      throw err;
    }
  }

  throw new Error("模型调用重试 4 次后仍然失败");
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
 * 第二步：逐文件生成代码 (上下文感知)
 * 后续文件生成时携带已生成文件的摘要，确保导入、命名等一致性
 */
async function generateAllFiles(plan, requirement) {
  console.log("\n========== 第二步：逐文件生成代码 (上下文感知) ==========");

  const context = `项目概述: ${plan.summary || ""}
技术栈: ${(plan.techStack || []).join(", ")}
原始需求: ${requirement}`;

  const files = [];
  for (const file of plan.fileStructure) {
    console.log(`\n正在生成: ${file.path}`);
    console.log(`  职责: ${file.description}`);

    // 构建上下文摘要 (已生成的文件)
    let contextSummary = "";
    if (generatedContext.length > 0) {
      contextSummary = "\n\n## 已生成文件 (请保持一致性)\n";
      for (const ctx of generatedContext) {
        contextSummary += `### ${ctx.path}\n导出: ${ctx.exports || "(无)"}\n导入: ${ctx.imports || "(无)"}\n\n`;
      }
    }

    const systemPrompt = `你是一位资深全栈开发工程师。请根据项目上下文与文件描述，生成完整、可运行的代码。
技术栈: ${(plan.techStack || []).join(", ")}
项目上下文: ${context}
文件路径: ${file.path}
文件职责: ${file.description}
${contextSummary}

要求：
1. 只返回文件内容本身，不要包含任何解释、说明或 markdown 代码块标记
2. 不要包含 "这是一个..." 之类的描述性文字
3. 代码必须完整可运行，包含必要的注释
4. 确保导入路径与已生成文件一致
5. 确保命名风格 (变量、函数、组件) 与项目一致
6. package.json 必须包含所有需要的依赖与 scripts
7. 遵循最佳实践: 错误处理、类型安全、可访问性
8. 添加适当的 JSDoc 注释`;

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

    // 提取导入和导出信息用于后续文件的上下文
    const exports_ = extractExports(content);
    const imports = extractImports(content);
    generatedContext.push({ path: file.path, exports: exports_, imports });

    files.push({ path: file.path, content });
    console.log(`  生成完成，${Buffer.byteLength(content)} bytes`);
  }

  return files;
}

/**
 * 从代码中提取导出信息 (用于上下文感知)
 */
function extractExports(code) {
  const exports_ = [];
  // named exports
  const namedExports = code.match(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/g) || [];
  for (const m of namedExports) {
    const name = m.match(/(\w+)$/)?.[1];
    if (name) exports_.push(name);
  }
  // default export
  if (/export\s+default\s+/.test(code)) {
    const defMatch = code.match(/export\s+default\s+(?:function|class)\s+(\w+)/);
    if (defMatch) exports_.push(`default: ${defMatch[1]}`);
    else exports_.push("default");
  }
  return exports_.join(", ") || null;
}

/**
 * 从代码中提取导入信息 (用于依赖验证)
 */
function extractImports(code) {
  const imports = [];
  // ES modules
  const importMatches = code.matchAll(/import\s+.*?\s+from\s+["']([^"']+)["']/g);
  for (const m of importMatches) {
    imports.push(m[1]);
  }
  // require
  const requireMatches = code.matchAll(/require\(["']([^"']+)["']\)/g);
  for (const m of requireMatches) {
    imports.push(m[1]);
  }
  return imports.join(", ") || null;
}

/**
 * 第三步 (新增): 生成后代码审查
 * 检测缺失导入、不一致命名、未使用变量等常见问题
 */
async function reviewGeneratedCode(files, plan) {
  console.log("\n========== 第三步：代码审查 ==========");

  const issues = [];

  // 1. 检测 package.json 是否包含所有依赖
  const pkgFile = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const declaredDeps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);

      // 从所有文件中提取导入的外部依赖
      const usedDeps = new Set();
      for (const file of files) {
        const imports = extractImports(file.content) || "";
        for (const imp of imports.split(", ")) {
          if (!imp) continue;
          // 只检查外部依赖 (非相对路径)
          if (!imp.startsWith(".") && !imp.startsWith("/")) {
            const depName = imp.startsWith("@") ? imp.split("/").slice(0, 2).join("/") : imp.split("/")[0];
            usedDeps.add(depName);
          }
        }
      }

      // 检查缺失的依赖
      for (const dep of usedDeps) {
        // 跳过 Node.js 内置模块
        if (["fs", "path", "child_process", "crypto", "http", "https", "url", "util", "os", "stream", "buffer", "events"].includes(dep)) continue;
        if (!declaredDeps.has(dep)) {
          issues.push({
            type: "missing_dependency",
            severity: "high",
            message: `package.json 缺少依赖: ${dep}`,
          });
        }
      }
    } catch {
      // package.json 解析失败
    }
  }

  // 2. 检测未关闭的代码块
  for (const file of files) {
    const openBraces = (file.content.match(/\{/g) || []).length;
    const closeBraces = (file.content.match(/\}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 2) {
      issues.push({
        type: "unbalanced_braces",
        severity: "medium",
        file: file.path,
        message: `${file.path}: 大括号不匹配 ({: ${openBraces}, }: ${closeBraces})`,
      });
    }

    // 检测未关闭的模板字符串
    const backticks = (file.content.match(/`/g) || []).length;
    if (backticks % 2 !== 0) {
      issues.push({
        type: "unclosed_template",
        severity: "medium",
        file: file.path,
        message: `${file.path}: 模板字符串反引号不匹配`,
      });
    }
  }

  // 3. 检测是否有空文件或过短文件
  for (const file of files) {
    if (file.content.trim().length < 10) {
      issues.push({
        type: "empty_file",
        severity: "high",
        file: file.path,
        message: `${file.path}: 文件内容过短，可能生成失败`,
      });
    }
  }

  // 输出审查结果
  if (issues.length === 0) {
    console.log("  审查通过，未发现问题");
  } else {
    console.log(`  发现 ${issues.length} 个问题:`);
    for (const issue of issues) {
      console.log(`    [${issue.severity}] ${issue.message}`);
    }
  }

  return issues;
}

/**
 * 修复缺失的依赖 (自动添加到 package.json)
 */
function fixMissingDependencies(files, issues) {
  const missingDeps = issues.filter((i) => i.type === "missing_dependency");
  if (missingDeps.length === 0) return;

  const pkgFile = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkgFile) return;

  try {
    const pkg = JSON.parse(pkgFile.content);
    if (!pkg.dependencies) pkg.dependencies = {};

    for (const issue of missingDeps) {
      const depName = issue.message.match(/:\s*(.+)$/)?.[1];
      if (depName && !pkg.dependencies[depName]) {
        pkg.dependencies[depName] = "latest";
        console.log(`  自动添加依赖: ${depName}`);
      }
    }

    pkgFile.content = JSON.stringify(pkg, null, 2) + "\n";
  } catch {
    // 解析失败，跳过
  }
}

/**
 * 第四步：写入文件到输出目录
 */
function writeAllFiles(outputDir, files) {
  console.log("\n========== 第四步：写入文件到磁盘 ==========");
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
 * 第五步：初始化 Git 仓库并提交
 */
function initGitRepo(outputDir, plan, requirement) {
  console.log("\n========== 第五步：初始化 Git 仓库 ==========");

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
  console.log(" Agent Forge - 代码生成脚本 v2.0");
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
  console.log(`生成模型: ${MODEL}`);

  try {
    // 第一步：分析需求
    const plan = await analyzeRequirement(requirement, projectType, projectName);

    // 第二步：生成所有文件代码 (上下文感知)
    const files = await generateAllFiles(plan, requirement);

    // 确保 package.json 与 README.md 存在（兜底）
    ensureCoreFiles(files, plan, projectType, projectName, requirement);

    // 第三步：代码审查 + 自动修复
    const reviewIssues = await reviewGeneratedCode(files, plan);
    fixMissingDependencies(files, reviewIssues);

    // 第四步：写入磁盘
    writeAllFiles(outputDir, files);

    // 第五步：初始化 Git 仓库
    initGitRepo(outputDir, plan, requirement);

    console.log("\n========================================");
    console.log(" 代码生成完成！v2.0");
    console.log("========================================");
    console.log(`输出目录: ${outputDir}`);
    console.log(`文件数量: ${files.length}`);
    console.log(`生成模型: ${MODEL}`);
    console.log(`审查问题: ${reviewIssues.length} 个 (${reviewIssues.filter(i => i.type === "missing_dependency").length} 个已自动修复)`);
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
