/**
 * 五维度 AI 代码审查引擎
 * 维度: 功能正确性 / 代码质量 / 性能 / 安全性 / 健壮性
 * 结合静态检查与 AI 分析，全面评估代码质量
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";

// ============ 类型定义 ============

export interface ReviewFile {
  path: string;
  content: string;
}

export type ReviewDimension =
  | "functionality"
  | "quality"
  | "performance"
  | "security"
  | "robustness";

export interface DimensionScore {
  score: number; // 0-100
  summary: string;
  issues: string[];
}

export interface ReviewIssue {
  dimension: ReviewDimension;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line: number | null;
  title: string;
  description: string;
  suggestion: string;
}

export interface CodeReviewResult {
  id?: string;
  projectId?: string;
  overallScore: number; // 0-100
  dimensions: {
    functionality: DimensionScore;
    quality: DimensionScore;
    performance: DimensionScore;
    security: DimensionScore;
    robustness: DimensionScore;
  };
  issues: ReviewIssue[];
  model?: string;
  createdAt?: Date;
}

export interface FixSuggestion {
  issue: string;
  fixedCode: string;
  explanation: string;
}

export interface StaticCheckResult {
  passed: boolean;
  issues: string[];
}

// ============ 表初始化 ============

let codeReviewTablesInitialized = false;

/**
 * 确保代码审查相关数据库表已创建
 */
async function ensureCodeReviewTablesExist(): Promise<void> {
  if (codeReviewTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "code_reviews" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "files" JSONB NOT NULL DEFAULT '[]',
        "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "dimensions" JSONB NOT NULL DEFAULT '{}',
        "issues" JSONB NOT NULL DEFAULT '[]',
        "modelName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "code_reviews_pkey" PRIMARY KEY ("id")
      );
    `);
    codeReviewTablesInitialized = true;
  } catch (error) {
    console.error("[ensureCodeReviewTablesExist] 创建表失败:", error);
    codeReviewTablesInitialized = true;
  }
}

// ============ 静态检查函数（不调用 AI） ============

/**
 * 括号匹配检查
 * 检查圆括号、方括号、花括号的配对情况
 */
export function checkBraceBalance(code: string): StaticCheckResult {
  const issues: string[] = [];
  const pairs: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const openers = "([{";

  // 简化处理：忽略字符串和注释中的括号
  const cleanCode = code
    .replace(/\/\/.*$/gm, "") // 移除单行注释
    .replace(/\/\*[\s\S]*?\*\//g, "") // 移除多行注释
    .replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, ""); // 移除字符串

  const stack: { char: string; line: number }[] = [];
  let line = 1;

  for (let i = 0; i < cleanCode.length; i++) {
    const char = cleanCode[i];
    if (char === "\n") {
      line++;
      continue;
    }

    if (openers.includes(char)) {
      stack.push({ char, line });
    } else if (char in pairs) {
      if (stack.length === 0) {
        issues.push(`第 ${line} 行: 多余的闭合括号 "${char}"`);
      } else {
        const top = stack.pop()!;
        if (top.char !== pairs[char]) {
          issues.push(
            `第 ${line} 行: 括号不匹配，期望 "${pairs[char]}" 的闭合符，但找到 "${char}"（第 ${top.line} 行开始的括号未正确闭合）`
          );
        }
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    issues.push(`第 ${unclosed.line} 行: 未闭合的括号 "${unclosed.char}"`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * 模板字符串闭合检查
 * 检查反引号和 ${} 表达式的配对情况
 */
export function checkTemplateLiterals(code: string): StaticCheckResult {
  const issues: string[] = [];

  // 检查反引号是否成对
  const backtickCount = (code.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    issues.push(`反引号数量为奇数 (${backtickCount})，可能存在未闭合的模板字符串`);
  }

  // 检查 ${ } 配对
  const cleanCode = code.replace(/\/\/.*$/gm, "");
  const expressionOpens = (cleanCode.match(/\$\{/g) || []).length;
  // 统计在模板字符串内的 } 闭合
  const expressionCloses = (cleanCode.match(/\}/g) || []).length;

  if (expressionOpens > expressionCloses) {
    issues.push(
      `模板字符串表达式 ${expressionOpens} 个 "${"${"}" 开始符，但只有 ${expressionCloses} 个 "}" 闭合符，可能存在未闭合的模板表达式`
    );
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * 空文件检测
 */
export function checkEmptyFile(code: string): StaticCheckResult {
  const issues: string[] = [];
  const trimmed = code.trim();

  if (trimmed === "") {
    issues.push("文件内容为空");
  } else if (trimmed.length < 10) {
    issues.push(`文件内容过少 (${trimmed.length} 字符)，可能缺少实际代码`);
  }

  // 检查是否只有注释
  const withoutComments = code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/#.*$/gm, "")
    .trim();

  if (withoutComments === "" && trimmed !== "") {
    issues.push("文件只包含注释，没有实际代码");
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * 依赖完整性检查
 * 检查文件中使用的 import/require 是否在提供的文件列表中存在
 */
export function checkMissingDependencies(
  files: ReviewFile[]
): StaticCheckResult {
  const issues: string[] = [];

  // 收集所有文件路径
  const filePaths = new Set(files.map((f) => f.path));

  // 从 package.json 中提取依赖
  const packageJsonFile = files.find((f) => f.path.endsWith("package.json"));
  const declaredDeps = new Set<string>();
  if (packageJsonFile) {
    try {
      const pkg = JSON.parse(packageJsonFile.content);
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };
      Object.keys(deps).forEach((dep) => declaredDeps.add(dep));
    } catch {
      // package.json 解析失败，忽略
    }
  }

  // 检查每个文件的 import 语句
  const importRegex =
    /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"`]([^'"`]+)['"`]/g;

  for (const file of files) {
    let match;
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1];

      // 跳过 Node.js 内置模块
      if (isBuiltinModule(importPath)) continue;

      // 跳过相对路径导入
      if (importPath.startsWith(".") || importPath.startsWith("/")) {
        // 尝试解析相对路径
        const dir = file.path.substring(0, file.path.lastIndexOf("/"));
        const resolved = resolveImportPath(dir, importPath, filePaths);
        if (!resolved) {
          issues.push(
            `${file.path}: 导入的文件不存在 "${importPath}"`
          );
        }
        continue;
      }

      // 检查第三方依赖
      const depName = importPath.startsWith("@")
        ? importPath.split("/").slice(0, 2).join("/")
        : importPath.split("/")[0];

      if (packageJsonFile && !declaredDeps.has(depName)) {
        issues.push(
          `${file.path}: 依赖 "${depName}" 未在 package.json 中声明`
        );
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/** 判断是否为 Node.js 内置模块 */
function isBuiltinModule(name: string): boolean {
  const builtins = [
    "fs", "path", "os", "http", "https", "url", "crypto", "stream",
    "buffer", "util", "events", "child_process", "net", "dns", "tls",
    "zlib", "querystring", "assert", "process", "console", "module",
    "cluster", "dgram", "readline", "repl", "timers", "vm", "worker_threads",
    "perf_hooks", "async_hooks", "inspector", "trace_events", "v8", "tty",
  ];
  return builtins.includes(name) || name.startsWith("node:");
}

/** 解析相对导入路径 */
function resolveImportPath(
  dir: string,
  importPath: string,
  filePaths: Set<string>
): boolean {
  const fullPath = `${dir}/${importPath}`.replace(/\/+/g, "/");
  const candidates = [
    fullPath,
    `${fullPath}.ts`,
    `${fullPath}.tsx`,
    `${fullPath}.js`,
    `${fullPath}.jsx`,
    `${fullPath}/index.ts`,
    `${fullPath}/index.tsx`,
    `${fullPath}/index.js`,
    `${fullPath}/index.jsx`,
  ];

  return candidates.some((c) => filePaths.has(c));
}

// ============ AI 代码审查 ============

/**
 * 对文件进行五维度审查
 */
export async function reviewCode(
  projectId: string,
  files: ReviewFile[]
): Promise<CodeReviewResult> {
  await ensureCodeReviewTablesExist();

  // 先执行静态检查
  const staticIssues: string[] = [];
  for (const file of files) {
    const braceCheck = checkBraceBalance(file.content);
    const templateCheck = checkTemplateLiterals(file.content);
    const emptyCheck = checkEmptyFile(file.content);

    if (!braceCheck.passed) {
      braceCheck.issues.forEach((issue) =>
        staticIssues.push(`[${file.path}] ${issue}`)
      );
    }
    if (!templateCheck.passed) {
      templateCheck.issues.forEach((issue) =>
        staticIssues.push(`[${file.path}] ${issue}`)
      );
    }
    if (!emptyCheck.passed) {
      emptyCheck.issues.forEach((issue) =>
        staticIssues.push(`[${file.path}] ${issue}`)
      );
    }
  }

  // 构建 AI 审查提示词
  const filesContent = files
    .map((f) => `### 文件: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `你是一个资深代码审查专家。请从以下五个维度对代码进行全面审查：

1. **功能正确性 (functionality)**: 代码是否正确实现了预期功能，逻辑是否正确
2. **代码质量 (quality)**: 代码可读性、命名规范、注释、代码结构、DRY 原则
3. **性能 (performance)**: 算法效率、资源使用、潜在性能瓶颈
4. **安全性 (security)**: 输入验证、注入风险、敏感信息泄露、权限控制
5. **健壮性 (robustness)**: 错误处理、边界条件、异常恢复、资源清理

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "overallScore": 数字(0-100),
  "dimensions": {
    "functionality": { "score": 数字, "summary": "总结", "issues": ["问题1", "问题2"] },
    "quality": { "score": 数字, "summary": "总结", "issues": ["问题1"] },
    "performance": { "score": 数字, "summary": "总结", "issues": ["问题1"] },
    "security": { "score": 数字, "summary": "总结", "issues": ["问题1"] },
    "robustness": { "score": 数字, "summary": "总结", "issues": ["问题1"] }
  },
  "issues": [
    {
      "dimension": "functionality|quality|performance|security|robustness",
      "severity": "critical|high|medium|low",
      "file": "文件路径",
      "line": 行号或null,
      "title": "问题标题",
      "description": "问题描述",
      "suggestion": "修复建议"
    }
  ]
}`;

  const userMessage = `请审查以下代码文件：\n\n${filesContent}`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 4000,
  });

  // 解析 AI 返回的 JSON
  let reviewResult: CodeReviewResult;
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    reviewResult = {
      overallScore: parsed.overallScore ?? 0,
      dimensions: {
        functionality: parsed.dimensions?.functionality || {
          score: 0,
          summary: "",
          issues: [],
        },
        quality: parsed.dimensions?.quality || {
          score: 0,
          summary: "",
          issues: [],
        },
        performance: parsed.dimensions?.performance || {
          score: 0,
          summary: "",
          issues: [],
        },
        security: parsed.dimensions?.security || {
          score: 0,
          summary: "",
          issues: [],
        },
        robustness: parsed.dimensions?.robustness || {
          score: 0,
          summary: "",
          issues: [],
        },
      },
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      model: response.model,
    };
  } catch (error) {
    console.error("[reviewCode] JSON 解析失败:", error);
    // 解析失败时返回基本结果
    reviewResult = {
      overallScore: 0,
      dimensions: {
        functionality: { score: 0, summary: "解析失败", issues: [] },
        quality: { score: 0, summary: "解析失败", issues: [] },
        performance: { score: 0, summary: "解析失败", issues: [] },
        security: { score: 0, summary: "解析失败", issues: [] },
        robustness: { score: 0, summary: "解析失败", issues: [] },
      },
      issues: [],
      model: response.model,
    };
  }

  // 将静态检查问题追加到 issues
  for (const staticIssue of staticIssues) {
    reviewResult.issues.push({
      dimension: "quality",
      severity: "medium",
      file: "multiple",
      line: null,
      title: "静态检查问题",
      description: staticIssue,
      suggestion: "请修复上述静态检查问题",
    });
  }

  // 保存到数据库
  const id = `review_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "code_reviews" ("id", "projectId", "files", "overallScore", "dimensions", "issues", "modelName", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      id,
      projectId,
      JSON.stringify(files.map((f) => f.path)),
      reviewResult.overallScore,
      JSON.stringify(reviewResult.dimensions),
      JSON.stringify(reviewResult.issues),
      reviewResult.model || null
    );
    reviewResult.id = id;
    reviewResult.projectId = projectId;
  } catch (error) {
    console.error("[reviewCode] 保存审查记录失败:", error);
  }

  return reviewResult;
}

/**
 * 获取项目的审查历史
 */
export async function getReviews(
  projectId: string
): Promise<CodeReviewResult[]> {
  await ensureCodeReviewTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        projectId: string;
        files: unknown;
        overallScore: number;
        dimensions: unknown;
        issues: unknown;
        modelName: string | null;
        createdAt: Date;
      }>
    >(
      `SELECT * FROM "code_reviews" WHERE "projectId" = $1 ORDER BY "createdAt" DESC`,
      projectId
    );

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      overallScore: row.overallScore,
      dimensions:
        typeof row.dimensions === "string"
          ? JSON.parse(row.dimensions)
          : row.dimensions,
      issues:
        typeof row.issues === "string" ? JSON.parse(row.issues) : row.issues,
      model: row.modelName || undefined,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error("[getReviews] 查询失败:", error);
    return [];
  }
}

/**
 * 针对单个问题生成修复建议
 */
export async function generateFixSuggestion(
  issue: ReviewIssue,
  code: string
): Promise<FixSuggestion> {
  const systemPrompt = `你是一个代码修复专家。针对给定的代码审查问题，提供具体的修复方案。
请返回 JSON 格式（只返回 JSON）：
{
  "issue": "问题总结",
  "fixedCode": "修复后的完整代码",
  "explanation": "修复说明"
}`;

  const userMessage = `## 代码审查问题
- 维度: ${issue.dimension}
- 严重程度: ${issue.severity}
- 文件: ${issue.file}
- 行号: ${issue.line || "未知"}
- 标题: ${issue.title}
- 描述: ${issue.description}
- 建议: ${issue.suggestion}

## 需要修复的代码
\`\`\`
${code}
\`\`\`

请提供修复方案。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 4000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("[generateFixSuggestion] JSON 解析失败:", error);
    return {
      issue: issue.title,
      fixedCode: code,
      explanation: response.content,
    };
  }
}

/**
 * 批量审查（分批调用避免超出 token 限制）
 */
export async function batchReview(
  files: ReviewFile[],
  batchSize: number = 3
): Promise<CodeReviewResult[]> {
  const results: CodeReviewResult[] = [];

  // 按 batchSize 分批
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    try {
      // 使用临时 projectId 进行批量审查
      const result = await reviewCode("batch_review", batch);
      results.push(result);
    } catch (error) {
      console.error(`[batchReview] 第 ${Math.floor(i / batchSize) + 1} 批审查失败:`, error);
      // 继续处理下一批
    }
  }

  // 如果有多批结果，合并为一个汇总结果
  if (results.length > 1) {
    const merged: CodeReviewResult = {
      overallScore: Math.round(
        results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
      ),
      dimensions: {
        functionality: mergeDimension(results.map((r) => r.dimensions.functionality)),
        quality: mergeDimension(results.map((r) => r.dimensions.quality)),
        performance: mergeDimension(results.map((r) => r.dimensions.performance)),
        security: mergeDimension(results.map((r) => r.dimensions.security)),
        robustness: mergeDimension(results.map((r) => r.dimensions.robustness)),
      },
      issues: results.flatMap((r) => r.issues),
    };
    return [merged];
  }

  return results;
}

/** 合并多个维度评分 */
function mergeDimension(dims: DimensionScore[]): DimensionScore {
  if (dims.length === 0) {
    return { score: 0, summary: "", issues: [] };
  }
  return {
    score: Math.round(dims.reduce((sum, d) => sum + d.score, 0) / dims.length),
    summary: dims.map((d) => d.summary).filter(Boolean).join("; "),
    issues: dims.flatMap((d) => d.issues || []),
  };
}
