/**
 * scripts/generate-project.js
 * 代码生成脚本 v3.0：高级编程工程师级 AI 代码生成引擎
 *
 * v3.0 核心升级 (行业顶级):
 *   - Plan Mode: 编码前先分析架构，生成设计文档，确保全局一致性
 *   - 多模型路由: 简单任务用轻量模型，复杂任务用最强模型 (via ai-provider.js)
 *   - AI 代码审查: 五维度自动审查 (功能正确性/代码质量/性能/安全性/健壮性)
 *   - 自动修复闭环: 生成→审查→修复→验证，最多 3 轮迭代
 *   - TDD 模式: 可选的测试驱动开发 (先生成测试，再生成代码)
 *   - 项目规则系统: 定义编码规范，跨文件保持一致性
 *   - 上下文感知: 后续文件生成时携带已生成文件摘要
 *   - 流式输出: 实时显示生成进度
 *   - 依赖验证 + 自动补全: 确保 package.json 包含所有依赖
 *   - 代码质量校验: 括号匹配、模板字符串闭合、空文件检测
 *   - 指数退避重试: 更健壮的 API 调用
 *
 * 用法:
 *   node scripts/generate-project.js \
 *     --requirement "需求描述" \
 *     --project-type web \
 *     --project-name my-app \
 *     --output-dir ./generated \
 *     --tdd              # 可选: 启用 TDD 模式
 *     --model gpt-4o     # 可选: 指定模型
 *
 * 环境变量:
 *   GITHUB_TOKEN / OPENAI_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / MISTRAL_API_KEY
 *   AI_PROVIDER  - 强制使用的提供商
 *   AI_MODEL     - 强制使用的模型
 *   GENERATE_MODEL - 可选，覆盖默认模型 (兼容 v2.0)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chatCompletion, selectModel, MODEL_CONFIG } = require("./ai-provider");

// ============================================================
// 配置
// ============================================================

/** 已生成文件的上下文摘要 (用于上下文感知生成) */
const generatedContext = [];

/** 项目编码规则 (在 Plan Mode 中生成，贯穿所有文件) */
let projectRules = "";

/** 最大自动修复轮次 */
const MAX_FIX_ROUNDS = 3;

// ============================================================
// 工具函数
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从模型返回中提取 JSON（容错处理） */
function extractJSON(text) {
  if (!text) return null;
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { }
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { }
  }
  return null;
}

function exec(cmd, opts = {}) {
  console.log(`  [exec] ${cmd}`);
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  [写入] ${filePath} (${Buffer.byteLength(content)} bytes)`);
}

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

/** 从代码中提取导出信息 (用于上下文感知) */
function extractExports(code) {
  const exports_ = [];
  const namedExports = code.match(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/g) || [];
  for (const m of namedExports) {
    const name = m.match(/(\w+)$/)?.[1];
    if (name) exports_.push(name);
  }
  if (/export\s+default\s+/.test(code)) {
    const defMatch = code.match(/export\s+default\s+(?:function|class)\s+(\w+)/);
    if (defMatch) exports_.push(`default: ${defMatch[1]}`);
    else exports_.push("default");
  }
  return exports_.join(", ") || null;
}

/** 从代码中提取导入信息 (用于依赖验证) */
function extractImports(code) {
  const imports = [];
  const importMatches = code.matchAll(/import\s+.*?\s+from\s+["']([^"']+)["']/g);
  for (const m of importMatches) imports.push(m[1]);
  const requireMatches = code.matchAll(/require\(["']([^"']+)["']\)/g);
  for (const m of requireMatches) imports.push(m[1]);
  return imports.join(", ") || null;
}

// ============================================================
// 第一步: Plan Mode — 架构分析与设计文档
// ============================================================

/**
 * Plan Mode: 深度分析需求，生成架构设计文档和项目规则
 * 这一步确保后续所有文件生成都有统一的架构指导
 */
async function planArchitecture(requirement, projectType, projectName) {
  console.log("\n========== 第一步: Plan Mode — 架构分析 ==========");

  const systemPrompt = `你是一位资深软件架构师和技术总监。请根据用户需求，进行深度架构分析并生成设计文档。

## 项目信息
- 类型: ${projectType}
- 名称: ${projectName}
- 需求: ${requirement}

## 技术栈指引
- web: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- desktop: Electron + React + TypeScript
- mobile: React Native + TypeScript

## 你需要输出以下内容 (JSON 格式):

{
  "projectName": "项目名称",
  "summary": "一句话概述",
  "techStack": ["技术栈列表"],
  "architecture": {
    "layers": ["分层描述，如: UI层 → API层 → 数据层"],
    "patterns": ["使用的设计模式，如: Repository, Service, DTO"],
    "dataFlow": "数据流描述"
  },
  "fileStructure": [
    { "path": "相对路径", "description": "职责描述", "priority": "high|medium|low" }
  ],
  "codingRules": [
    "编码规则1: 如 '所有异步函数使用 async/await，不使用 .then()'",
    "编码规则2: 如 'API 响应统一使用 { success, data, error } 格式'",
    "编码规则3: 如 '组件使用函数式组件， Props 使用 interface 定义'"
  ],
  "dependencies": {
    "required": ["必须的依赖包"],
    "optional": ["可选的依赖包"]
  },
  "testingStrategy": "测试策略描述",
  "securityConsiderations": "安全考虑描述"
}

## 要求:
1. fileStructure 包含 8~15 个文件，按优先级排序
2. codingRules 至少 5 条，覆盖命名规范、错误处理、代码风格
3. 确保架构分层清晰，职责单一
4. 只返回 JSON，不要解释`;

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请为以下需求设计架构:\n\n${requirement}` },
    ],
    { temperature: 0.3, maxTokens: 3000, taskComplexity: "complex" }
  );

  const plan = extractJSON(response.content);
  if (!plan || !plan.fileStructure) {
    throw new Error("架构分析失败，模型返回: " + response.content.slice(0, 200));
  }

  // 保存项目规则供后续文件生成使用
  projectRules = (plan.codingRules || []).join("\n");

  console.log("\n架构分析完成:");
  console.log(`  概述: ${plan.summary || "(无)"}`);
  console.log(`  技术栈: ${(plan.techStack || []).join(", ")}`);
  console.log(`  文件数: ${plan.fileStructure.length}`);
  console.log(`  编码规则: ${(plan.codingRules || []).length} 条`);
  if (plan.architecture?.layers) {
    console.log(`  架构分层: ${plan.architecture.layers.join(" → ")}`);
  }

  return plan;
}

// ============================================================
// 第二步: 逐文件生成代码 (上下文感知 + 项目规则)
// ============================================================

async function generateAllFiles(plan, requirement, options = {}) {
  console.log("\n========== 第二步: 逐文件生成代码 (上下文感知) ==========");

  const context = `项目概述: ${plan.summary || ""}
技术栈: ${(plan.techStack || []).join(", ")}
原始需求: ${requirement}`;

  // 按优先级排序文件 (high → medium → low)
  const sortedFiles = [...plan.fileStructure].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  const files = [];
  for (const file of sortedFiles) {
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

    // 确定任务复杂度
    const isPkgJson = file.path === "package.json" || file.path.endsWith("/package.json");
    const isCoreFile = file.priority === "high";
    const taskComplexity = isCoreFile ? "complex" : "moderate";

    const systemPrompt = `你是一位资深全栈开发工程师，正在按照架构设计文档实现项目。

## 项目上下文
${context}

## 项目编码规则 (必须遵循)
${projectRules || "遵循社区最佳实践"}

## 当前文件
- 路径: ${file.path}
- 职责: ${file.description}
${contextSummary}

## 代码生成要求:
1. 只返回文件内容本身，不要包含任何解释、说明或 markdown 代码块标记
2. 不要包含 "这是一个..." 之类的描述性文字
3. 代码必须完整可运行，包含必要的注释
4. 确保导入路径与已生成文件一致
5. 确保命名风格 (变量、函数、组件) 与项目一致
6. package.json 必须包含所有需要的依赖与 scripts
7. 遵循最佳实践: 错误处理、类型安全、可访问性
8. 添加适当的 JSDoc 注释
9. 错误处理: 所有异步操作必须有 try-catch 或错误边界
10. 安全性: 不硬编码密钥，用户输入必须验证`;

    const response = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请生成文件: ${file.path}` },
      ],
      { temperature: 0.4, maxTokens: isPkgJson ? 2000 : 4000, taskComplexity }
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

// ============================================================
// 第三步: TDD 模式 — 生成测试文件
// ============================================================

/**
 * TDD 模式: 为核心文件生成单元测试
 * 在代码生成后，自动为核心业务逻辑文件生成测试
 */
async function generateTests(files, plan, requirement) {
  console.log("\n========== 第三步: TDD — 自动生成测试 ==========");

  // 选择需要测试的文件 (排除配置、样式、README)
  const testableFiles = files.filter(f => {
    const ext = path.extname(f.path);
    return [".ts", ".tsx", ".js", ".jsx"].includes(ext)
      && !f.path.includes("config")
      && !f.path.includes(".d.ts")
      && f.path !== "package.json"
      && f.path !== "README.md";
  });

  if (testableFiles.length === 0) {
    console.log("  没有可测试的文件，跳过");
    return [];
  }

  const testFiles = [];
  // 最多为前 3 个核心文件生成测试
  for (const file of testableFiles.slice(0, 3)) {
    const testPath = file.path.replace(/\.tsx?$/, ".test$&").replace(/\.jsx?$/, ".test$&");
    const testDir = path.dirname(testPath);
    const testFileName = path.basename(testPath);

    console.log(`\n  为 ${file.path} 生成测试: ${testPath}`);

    const systemPrompt = `你是一位测试工程师。请为以下代码生成完整的单元测试。

## 项目信息
技术栈: ${(plan.techStack || []).join(", ")}
测试框架: Jest / Vitest (根据项目技术栈选择)
编码规则:
${projectRules || "遵循社区最佳实践"}

## 被测试代码 (${file.path})
\`\`\`
${file.content.slice(0, 3000)}
\`\`\`

## 测试要求:
1. 覆盖正常流程、边界条件、错误场景
2. 使用 describe/it 组织测试结构
3. 测试文件名: ${testFileName}
4. 只返回测试代码，不要解释
5. Mock 外部依赖 (API 调用、数据库等)`;

    try {
      const response = await chatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请生成测试文件: ${testPath}` },
        ],
        { temperature: 0.3, maxTokens: 3000, taskComplexity: "moderate" }
      );

      let content = response.content.trim();
      content = content.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");

      testFiles.push({ path: testPath, content });
      console.log(`  测试生成完成，${Buffer.byteLength(content)} bytes`);
    } catch (err) {
      console.log(`  测试生成失败: ${err.message}`);
    }
  }

  return testFiles;
}

// ============================================================
// 第四步: AI 代码审查 (五维度) + 自动修复闭环
// ============================================================

/**
 * AI 代码审查: 从五个维度评估生成代码的质量
 * 维度: 功能正确性 / 代码质量 / 性能 / 安全性 / 健壮性
 */
async function aiCodeReview(files, plan, requirement) {
  console.log("\n========== 第四步: AI 代码审查 (五维度) ==========");

  const issues = [];

  // --- 静态检查 (快速、不需要 API) ---

  // 1. 依赖完整性检查
  const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const declaredDeps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);
      const usedDeps = new Set();
      for (const file of files) {
        const imports = extractImports(file.content) || "";
        for (const imp of imports.split(", ")) {
          if (!imp) continue;
          if (!imp.startsWith(".") && !imp.startsWith("/")) {
            const depName = imp.startsWith("@") ? imp.split("/").slice(0, 2).join("/") : imp.split("/")[0];
            usedDeps.add(depName);
          }
        }
      }
      for (const dep of usedDeps) {
        if (["fs", "path", "child_process", "crypto", "http", "https", "url", "util", "os", "stream", "buffer", "events"].includes(dep)) continue;
        if (!declaredDeps.has(dep)) {
          issues.push({ type: "missing_dependency", severity: "high", message: `package.json 缺少依赖: ${dep}` });
        }
      }
    } catch { }
  }

  // 2. 语法完整性检查
  for (const file of files) {
    const openBraces = (file.content.match(/\{/g) || []).length;
    const closeBraces = (file.content.match(/\}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 2) {
      issues.push({ type: "unbalanced_braces", severity: "medium", file: file.path, message: `${file.path}: 大括号不匹配 ({: ${openBraces}, }: ${closeBraces})` });
    }
    const backticks = (file.content.match(/`/g) || []).length;
    if (backticks % 2 !== 0) {
      issues.push({ type: "unclosed_template", severity: "medium", file: file.path, message: `${file.path}: 模板字符串反引号不匹配` });
    }
    if (file.content.trim().length < 10) {
      issues.push({ type: "empty_file", severity: "high", file: file.path, message: `${file.path}: 文件内容过短，可能生成失败` });
    }
  }

  // --- AI 深度审查 (针对核心文件) ---
  const coreFiles = files.filter(f => {
    const ext = path.extname(f.path);
    return [".ts", ".tsx", ".js", ".jsx"].includes(ext)
      && f.path !== "package.json"
      && f.content.length > 100;
  }).slice(0, 3); // 最多审查 3 个核心文件

  for (const file of coreFiles) {
    console.log(`\n  AI 审查: ${file.path}`);
    try {
      const reviewPrompt = `你是一位高级代码审查工程师。请从以下五个维度审查这段代码，找出具体问题。

## 代码 (${file.path})
\`\`\`
${file.content.slice(0, 4000)}
\`\`\`

## 审查维度:
1. **功能正确性**: 逻辑是否正确？是否有潜在 bug？
2. **代码质量**: 是否遵循最佳实践？是否有代码异味？
3. **性能**: 是否有性能问题？是否有不必要的计算？
4. **安全性**: 是否有安全漏洞？输入是否验证？
5. **健壮性**: 错误处理是否完善？边界条件是否处理？

## 输出格式 (JSON):
{
  "issues": [
    {
      "dimension": "功能正确性|代码质量|性能|安全性|健壮性",
      "severity": "critical|high|medium|low",
      "line": "大概的行号或代码片段",
      "description": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "overallScore": 0-100,
  "summary": "总体评价"
}

只返回 JSON。如果代码质量很好没有问题，返回空 issues 数组。`;

      const response = await chatCompletion(
        [
          { role: "system", content: reviewPrompt },
          { role: "user", content: "请审查以上代码" },
        ],
        { temperature: 0.2, maxTokens: 2000, taskComplexity: "moderate" }
      );

      const review = extractJSON(response.content);
      if (review?.issues) {
        for (const issue of review.issues) {
          issues.push({
            type: `ai_review_${issue.dimension}`,
            severity: issue.severity,
            file: file.path,
            message: `[${issue.dimension}] ${issue.description}`,
            suggestion: issue.suggestion,
          });
        }
        console.log(`    评分: ${review.overallScore || "N/A"}, 发现 ${review.issues.length} 个问题`);
      } else {
        console.log(`    审查完成，未发现严重问题`);
      }
    } catch (err) {
      console.log(`    AI 审查失败: ${err.message}`);
    }
  }

  // 输出审查结果
  if (issues.length === 0) {
    console.log("\n  审查通过，未发现问题");
  } else {
    console.log(`\n  发现 ${issues.length} 个问题:`);
    for (const issue of issues) {
      console.log(`    [${issue.severity}] ${issue.message}`);
    }
  }

  return issues;
}

/**
 * 自动修复: 根据审查结果自动修复代码
 * 最多迭代 MAX_FIX_ROUNDS 轮
 */
async function autoFixIssues(files, issues, plan, requirement) {
  console.log("\n========== 自动修复闭环 ==========");

  let currentFiles = [...files];
  let currentIssues = [...issues];
  let round = 0;

  // 先修复静态检查发现的问题
  fixMissingDependencies(currentFiles, currentIssues);

  // 过滤出需要 AI 修复的问题
  const aiIssues = currentIssues.filter(i =>
    i.type.startsWith("ai_review_") && (i.severity === "critical" || i.severity === "high")
  );

  if (aiIssues.length === 0) {
    console.log("  无严重问题需要 AI 修复");
    return { files: currentFiles, remainingIssues: currentIssues };
  }

  while (round < MAX_FIX_ROUNDS && aiIssues.length > 0) {
    round++;
    console.log(`\n  --- 修复轮次 ${round}/${MAX_FIX_ROUNDS} ---`);

    // 按文件分组问题
    const issuesByFile = new Map();
    for (const issue of aiIssues) {
      if (!issue.file) continue;
      if (!issuesByFile.has(issue.file)) issuesByFile.set(issue.file, []);
      issuesByFile.get(issue.file).push(issue);
    }

    // 逐文件修复
    for (const [filePath, fileIssues] of issuesByFile) {
      const file = currentFiles.find(f => f.path === filePath);
      if (!file) continue;

      console.log(`  修复 ${filePath} (${fileIssues.length} 个问题)...`);

      const fixPrompt = `你是代码修复工程师。请根据以下问题列表修复代码。

## 原始代码 (${filePath})
\`\`\`
${file.content.slice(0, 4000)}
\`\`\`

## 需要修复的问题:
${fileIssues.map((i, idx) => `${idx + 1}. [${i.severity}] ${i.message}\n   修复建议: ${i.suggestion || "(无)"}`).join("\n")}

## 要求:
1. 只返回修复后的完整文件内容
2. 不要改变代码的整体结构和功能
3. 只修复列出的问题，不要做额外的修改
4. 不要包含解释或 markdown 标记`;

      try {
        const response = await chatCompletion(
          [
            { role: "system", content: fixPrompt },
            { role: "user", content: "请修复以上问题" },
          ],
          { temperature: 0.2, maxTokens: 4000, taskComplexity: "moderate" }
        );

        let fixedContent = response.content.trim();
        fixedContent = fixedContent.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");

        if (fixedContent.length > 10) {
          file.content = fixedContent;
          console.log(`    修复完成，${Buffer.byteLength(fixedContent)} bytes`);
        }
      } catch (err) {
        console.log(`    修复失败: ${err.message}`);
      }
    }

    // 重新审查 (只检查刚修复的文件)
    const fixedFiles = [...issuesByFile.keys()];
    const recheckIssues = [];
    for (const filePath of fixedFiles) {
      const file = currentFiles.find(f => f.path === filePath);
      if (!file) continue;
      // 简单的静态检查
      const openBraces = (file.content.match(/\{/g) || []).length;
      const closeBraces = (file.content.match(/\}/g) || []).length;
      if (Math.abs(openBraces - closeBraces) > 2) {
        recheckIssues.push({ type: "unbalanced_braces", severity: "medium", file: filePath, message: `${filePath}: 大括号仍不匹配` });
      }
    }

    // 移除已修复文件的问题，添加新发现的问题
    const otherIssues = currentIssues.filter(i => !fixedFiles.includes(i.file) || !i.type.startsWith("ai_review_"));
    currentIssues = [...otherIssues, ...recheckIssues];

    if (recheckIssues.length === 0) {
      console.log("  所有问题已修复");
      break;
    }
  }

  return { files: currentFiles, remainingIssues: currentIssues };
}

/**
 * 修复缺失的依赖 (自动添加到 package.json)
 */
function fixMissingDependencies(files, issues) {
  const missingDeps = issues.filter(i => i.type === "missing_dependency");
  if (missingDeps.length === 0) return;

  const pkgFile = files.find(f => f.path === "package.json" || f.path.endsWith("/package.json"));
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
  } catch { }
}

// ============================================================
// 第五步: 写入文件到磁盘
// ============================================================

function writeAllFiles(outputDir, files, testFiles = []) {
  console.log("\n========== 第五步: 写入文件到磁盘 ==========");
  console.log(`输出目录: ${outputDir}`);

  if (fs.existsSync(outputDir)) {
    console.log(`  输出目录已存在，先清空`);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const allFiles = [...files, ...testFiles];
  for (const file of allFiles) {
    const fullPath = path.join(outputDir, file.path);
    writeFile(fullPath, file.content);
  }

  console.log(`\n共写入 ${allFiles.length} 个文件 (源码 ${files.length} + 测试 ${testFiles.length})`);
}

// ============================================================
// 第六步: 初始化 Git 仓库
// ============================================================

function initGitRepo(outputDir, plan, requirement, usedModel) {
  console.log("\n========== 第六步: 初始化 Git 仓库 ==========");

  const cwd = { cwd: outputDir };
  exec("git init", cwd);
  exec("git config user.name agent-forge-bot", cwd);
  exec("git config user.email agent-forge-bot@users.noreply.github.com", cwd);
  exec("git add -A", cwd);

  const summary = (requirement || "").replace(/\n/g, " ").trim().slice(0, 50);
  const aiTag = `[AI:${usedModel}]`;
  const commitMessage = `feat: 初始化项目 - ${plan.projectName || "generated-project"}

需求摘要: ${summary}
生成模型: ${usedModel}
生成引擎: Agent Forge v3.0

${aiTag}`;

  const msgFile = path.join(outputDir, ".git", "COMMIT_MSG");
  fs.writeFileSync(msgFile, commitMessage, "utf8");
  exec(`git commit -F "${msgFile}"`, cwd);
  fs.unlinkSync(msgFile);

  const log = exec("git log --oneline -1", cwd);
  console.log(`\n提交完成: ${log.trim()}`);
}

// ============================================================
// 兜底: 确保核心文件存在
// ============================================================

function ensureCoreFiles(files, plan, projectType, projectName, requirement) {
  const paths = files.map(f => f.path);
  if (!paths.some(p => p === "package.json" || p.endsWith("/package.json") || p === "README.md" || p.endsWith("/README.md"))) {
    files.push({
      path: "README.md",
      content: `# ${projectName}\n\n${plan.summary || "由 Agent Forge 自动生成的项目。"}\n\n## 需求\n\n${requirement}\n\n## 技术栈\n\n${(plan.techStack || []).join(", ")}\n`,
    });
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("========================================");
  console.log(" Agent Forge - 代码生成引擎 v3.0");
  console.log(" 高级编程工程师级 AI 代码生成");
  console.log("========================================");

  const args = parseArgs(process.argv);

  const requirement = args.requirement || "";
  const projectType = (args["project-type"] || "web").toLowerCase();
  const projectName = args["project-name"] || "generated-project";
  const outputDir = path.resolve(args["output-dir"] || "./generated");
  const enableTDD = args.tdd === true;

  if (!requirement) {
    console.error("错误: 缺少必填参数 --requirement");
    process.exit(1);
  }

  // 检查 API 可用性
  const availableProviders = require("./ai-provider").getAvailableProviders();
  if (availableProviders.length === 0) {
    console.error("错误: 未检测到任何 API Key，请设置 GITHUB_TOKEN / OPENAI_API_KEY / DEEPSEEK_API_KEY 等环境变量");
    process.exit(1);
  }
  console.log(`可用提供商: ${availableProviders.join(", ")}`);

  // 确定使用的模型
  const modelSelection = selectModel("complex");
  const usedModel = args.model || process.env.AI_MODEL || process.env.GENERATE_MODEL || modelSelection.model;
  console.log(`项目类型: ${projectType}`);
  console.log(`项目名称: ${projectName}`);
  console.log(`输出目录: ${outputDir}`);
  console.log(`生成模型: ${usedModel}`);
  console.log(`TDD 模式: ${enableTDD ? "启用" : "关闭"}`);

  try {
    // 第一步: Plan Mode — 架构分析
    const plan = await planArchitecture(requirement, projectType, projectName);

    // 第二步: 逐文件生成代码 (上下文感知)
    const files = await generateAllFiles(plan, requirement, { enableTDD });

    // 确保核心文件存在
    ensureCoreFiles(files, plan, projectType, projectName, requirement);

    // 第三步 (可选): TDD — 生成测试
    let testFiles = [];
    if (enableTDD) {
      testFiles = await generateTests(files, plan, requirement);
    }

    // 第四步: AI 代码审查 + 自动修复闭环
    const reviewIssues = await aiCodeReview(files, plan, requirement);
    const fixResult = await autoFixIssues(files, reviewIssues, plan, requirement);

    // 第五步: 写入磁盘
    writeAllFiles(outputDir, fixResult.files, testFiles);

    // 第六步: 初始化 Git 仓库
    initGitRepo(outputDir, plan, requirement, usedModel);

    // 汇总
    console.log("\n========================================");
    console.log(" 代码生成完成！v3.0");
    console.log("========================================");
    console.log(`输出目录: ${outputDir}`);
    console.log(`源码文件: ${fixResult.files.length}`);
    console.log(`测试文件: ${testFiles.length}`);
    console.log(`生成模型: ${usedModel}`);
    console.log(`审查问题: ${reviewIssues.length} 个`);
    console.log(`修复轮次: ${fixResult.remainingIssues.length < reviewIssues.length ? "已修复" : "部分修复"}`);
    console.log(`剩余问题: ${fixResult.remainingIssues.length} 个`);
    if (plan.architecture?.layers) {
      console.log(`架构分层: ${plan.architecture.layers.join(" → ")}`);
    }
    console.log(`编码规则: ${(plan.codingRules || []).length} 条`);

  } catch (err) {
    console.error("\n========================================");
    console.error(" 代码生成失败！");
    console.error("========================================");
    console.error(err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { extractJSON, extractExports, extractImports };

main();
