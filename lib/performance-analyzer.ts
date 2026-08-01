/**
 * AI 代码性能分析引擎
 * 识别性能瓶颈并生成优化建议
 * 覆盖 N+1 查询、不必要渲染、内存泄漏、大循环、重复计算、未释放资源等场景
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";

// ============ 类型定义 ============

export interface PerformanceFile {
  path: string;
  content: string;
}

export type PerformanceIssueType =
  | "n-plus-1-query"
  | "unnecessary-render"
  | "memory-leak"
  | "large-loop"
  | "redundant-computation"
  | "unreleased-resource"
  | "blocking-operation"
  | "inefficient-data-structure";

export interface PerformanceIssue {
  type: PerformanceIssueType;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line: number | null;
  title: string;
  description: string;
  impact: string;
}

export interface Optimization {
  file: string;
  title: string;
  description: string;
  beforeCode: string;
  afterCode: string;
  expectedImprovement: string;
}

export interface PerformanceReport {
  id?: string;
  projectId?: string;
  score: number; // 0-100
  issues: PerformanceIssue[];
  optimizations: Optimization[];
  model?: string;
  createdAt?: Date;
}

export interface BundleAnalysis {
  totalSize: number; // bytes
  modules: {
    name: string;
    size: number;
    percentage: number;
  }[];
  warnings: string[];
  recommendations: string[];
}

export interface QueryAnalysis {
  efficiency: number; // 0-100
  issues: string[];
  suggestions: string[];
  estimatedQueryCount: number;
}

// ============ 表初始化 ============

let perfTablesInitialized = false;

/**
 * 确保性能分析相关数据库表已创建
 */
async function ensurePerfTablesExist(): Promise<void> {
  if (perfTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "performance_reports" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "files" JSONB NOT NULL DEFAULT '[]',
        "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "issues" JSONB NOT NULL DEFAULT '[]',
        "optimizations" JSONB NOT NULL DEFAULT '[]',
        "modelName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "performance_reports_pkey" PRIMARY KEY ("id")
      );
    `);
    perfTablesInitialized = true;
  } catch (error) {
    console.error("[ensurePerfTablesExist] 创建表失败:", error);
    perfTablesInitialized = true;
  }
}

// ============ 核心功能 ============

/**
 * AI 分析性能
 * 检查 N+1 查询、不必要渲染、内存泄漏、大循环、重复计算、未释放资源
 */
export async function analyzePerformance(
  projectId: string,
  files: PerformanceFile[]
): Promise<PerformanceReport> {
  await ensurePerfTablesExist();

  const filesContent = files
    .map((f) => `### 文件: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const systemPrompt = `你是一个性能优化专家。请从以下角度分析代码的性能问题：

1. **N+1 查询 (n-plus-1-query)**: 循环中执行数据库查询，应批量获取
2. **不必要渲染 (unnecessary-render)**: React 组件不必要的重渲染
3. **内存泄漏 (memory-leak)**: 事件监听器、定时器、订阅未清理
4. **大循环 (large-loop)**: 低效的循环操作，可优化算法
5. **重复计算 (redundant-computation)**: 可缓存的重复计算
6. **未释放资源 (unreleased-resource)**: 文件句柄、连接未关闭
7. **阻塞操作 (blocking-operation)**: 同步阻塞操作，应异步化
8. **低效数据结构 (inefficient-data-structure)**: 使用了不合适的数据结构

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "score": 数字(0-100, 100为最优),
  "issues": [
    {
      "type": "问题类型",
      "severity": "critical|high|medium|low",
      "file": "文件路径",
      "line": 行号或null,
      "title": "问题标题",
      "description": "问题描述",
      "impact": "性能影响说明"
    }
  ],
  "optimizations": [
    {
      "file": "文件路径",
      "title": "优化标题",
      "description": "优化说明",
      "beforeCode": "优化前代码",
      "afterCode": "优化后代码",
      "expectedImprovement": "预期改进"
    }
  ]
}`;

  const userMessage = `请分析以下代码的性能问题：\n\n${filesContent}`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 4000,
  });

  let report: PerformanceReport;

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    report = {
      score: typeof parsed.score === "number" ? parsed.score : 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      optimizations: Array.isArray(parsed.optimizations) ? parsed.optimizations : [],
      model: response.model,
    };
  } catch (error) {
    console.error("[analyzePerformance] JSON 解析失败:", error);
    report = {
      score: 0,
      issues: [],
      optimizations: [],
      model: response.model,
    };
  }

  // 保存到数据库
  const id = `perf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "performance_reports" ("id", "projectId", "files", "score", "issues", "optimizations", "modelName", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      id,
      projectId,
      JSON.stringify(files.map((f) => f.path)),
      report.score,
      JSON.stringify(report.issues),
      JSON.stringify(report.optimizations),
      report.model || null
    );
    report.id = id;
    report.projectId = projectId;
  } catch (error) {
    console.error("[analyzePerformance] 保存报告失败:", error);
  }

  return report;
}

/**
 * 分析包大小
 */
export async function analyzeBundleSize(
  importTree: {
    name: string;
    size: number;
    dependencies?: string[];
  }[]
): Promise<BundleAnalysis> {
  const totalSize = importTree.reduce((sum, mod) => sum + mod.size, 0);

  const modules = importTree
    .map((mod) => ({
      name: mod.name,
      size: mod.size,
      percentage: totalSize > 0 ? Math.round((mod.size / totalSize) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.size - a.size);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 检查大模块
  for (const mod of modules) {
    if (mod.size > 100 * 1024) {
      // > 100KB
      warnings.push(`模块 "${mod.name}" 体积较大 (${formatSize(mod.size)})，考虑代码分割或懒加载`);
    }
    if (mod.percentage > 20) {
      warnings.push(`模块 "${mod.name}" 占总体积 ${mod.percentage}%，是包大小的主要贡献者`);
    }
  }

  // 检查总大小
  if (totalSize > 500 * 1024) {
    warnings.push(`包总体积较大 (${formatSize(totalSize)})，建议优化`);
    recommendations.push("考虑使用动态导入 (dynamic import) 进行代码分割");
    recommendations.push("检查是否有未使用的依赖可以移除");
    recommendations.push("使用 tree-shaking 移除无用代码");
  }

  if (totalSize > 1024 * 1024) {
    warnings.push(`包总体积过大 (${formatSize(totalSize)})，严重影响首屏加载性能`);
    recommendations.push("必须进行代码分割，将首屏不需要的代码延迟加载");
  }

  // 检查重复依赖
  const depCount = new Map<string, number>();
  for (const mod of importTree) {
    if (mod.dependencies) {
      for (const dep of mod.dependencies) {
        depCount.set(dep, (depCount.get(dep) || 0) + 1);
      }
    }
  }
  for (const [dep, count] of Array.from(depCount.entries())) {
    if (count > 1) {
      warnings.push(`依赖 "${dep}" 被引用 ${count} 次，可能存在重复打包`);
      recommendations.push(`考虑将 "${dep}" 提取为共享模块 (externals/shared)`);
    }
  }

  if (recommendations.length === 0 && warnings.length === 0) {
    recommendations.push("包大小正常，无需优化");
  }

  return {
    totalSize,
    modules,
    warnings,
    recommendations,
  };
}

/**
 * 分析数据库查询效率
 */
export async function analyzeDatabaseQueries(
  code: string
): Promise<QueryAnalysis> {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let estimatedQueryCount = 0;

  // 静态检查常见数据库性能问题

  // 检查循环中的查询 (N+1)
  const loopQueryPattern = /(?:for|while|forEach|map|filter|reduce)\s*\(.*?\)\s*\{[\s\S]*?(?:findMany|findUnique|findFirst|find|query|execute|select\(|\.query\()/g;
  const loopQueryMatches = code.match(loopQueryPattern) || [];
  if (loopQueryMatches.length > 0) {
    issues.push(`检测到 ${loopQueryMatches.length} 处可能的 N+1 查询（循环内执行数据库查询）`);
    suggestions.push("使用批量查询 (batch query) 或 IN 子句替代循环内查询");
    suggestions.push("考虑使用 dataloader 模式批量加载数据");
    estimatedQueryCount += loopQueryMatches.length * 10; // 估算
  }

  // 检查 SELECT *
  const selectAllPattern = /select\s+\*/gi;
  const selectAllMatches = code.match(selectAllPattern) || [];
  if (selectAllMatches.length > 0) {
    issues.push(`检测到 ${selectAllMatches.length} 处 SELECT * 查询，可能返回不必要的字段`);
    suggestions.push("只查询需要的字段，避免 SELECT *");
  }

  // 检查缺少分页
  const findManyPattern = /findMany\s*\(/g;
  const findManyMatches = code.match(findManyPattern) || [];
  const takePattern = /take\s*:/g;
  const takeMatches = code.match(takePattern) || [];
  if (findManyMatches.length > 0 && takeMatches.length < findManyMatches.length) {
    issues.push("部分 findMany 查询缺少分页限制，可能返回大量数据");
    suggestions.push("为所有 findMany 查询添加 take/skip 分页参数");
  }
  estimatedQueryCount += findManyMatches.length;

  // 检查缺少索引提示
  const wherePattern = /where\s*:\s*\{/g;
  const whereMatches = code.match(wherePattern) || [];
  if (whereMatches.length > 0) {
    suggestions.push("确保查询条件中的字段已建立数据库索引");
  }

  // 检查事务使用
  const transactionPattern = /transaction|\\$transaction/g;
  const hasMultipleQueries = estimatedQueryCount > 1;
  const hasTransaction = code.match(transactionPattern);
  if (hasMultipleQueries && !hasTransaction) {
    suggestions.push("多个相关查询考虑使用事务保证一致性");
  }

  // 计算效率分数
  let efficiency = 100;
  efficiency -= issues.length * 15;
  efficiency -= Math.min(suggestions.length * 5, 30);
  efficiency = Math.max(0, efficiency);

  return {
    efficiency,
    issues,
    suggestions,
    estimatedQueryCount: Math.max(estimatedQueryCount, 1),
  };
}

/**
 * 生成优化建议
 */
export async function generateOptimization(
  issue: PerformanceIssue,
  code: string
): Promise<Optimization> {
  const systemPrompt = `你是一个性能优化专家。请针对给定的性能问题，提供具体的优化方案。

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "file": "文件路径",
  "title": "优化标题",
  "description": "优化说明",
  "beforeCode": "优化前代码",
  "afterCode": "优化后完整代码",
  "expectedImprovement": "预期性能改进说明"
}`;

  const userMessage = `## 性能问题
- 类型: ${issue.type}
- 严重程度: ${issue.severity}
- 文件: ${issue.file}
- 行号: ${issue.line || "未知"}
- 标题: ${issue.title}
- 描述: ${issue.description}
- 影响: ${issue.impact}

## 相关代码
\`\`\`
${code}
\`\`\`

请提供优化方案。`;

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
    const parsed = JSON.parse(jsonStr);

    return {
      file: parsed.file || issue.file,
      title: parsed.title || issue.title,
      description: parsed.description || issue.description,
      beforeCode: parsed.beforeCode || code,
      afterCode: parsed.afterCode || "",
      expectedImprovement: parsed.expectedImprovement || "性能改进未知",
    };
  } catch (error) {
    console.error("[generateOptimization] JSON 解析失败:", error);
    return {
      file: issue.file,
      title: issue.title,
      description: issue.description,
      beforeCode: code,
      afterCode: code,
      expectedImprovement: response.content,
    };
  }
}

/**
 * 保存性能报告
 */
export async function savePerformanceReport(
  projectId: string,
  report: PerformanceReport
): Promise<string> {
  await ensurePerfTablesExist();

  const id = report.id || `perf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "performance_reports" ("id", "projectId", "files", "score", "issues", "optimizations", "modelName", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      id,
      projectId,
      JSON.stringify([]),
      report.score,
      JSON.stringify(report.issues),
      JSON.stringify(report.optimizations),
      report.model || null
    );
    return id;
  } catch (error) {
    console.error("[savePerformanceReport] 保存失败:", error);
    throw new Error(`保存性能报告失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 获取性能报告历史
 */
export async function getPerformanceReports(
  projectId: string
): Promise<PerformanceReport[]> {
  await ensurePerfTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        projectId: string;
        files: unknown;
        score: number;
        issues: unknown;
        optimizations: unknown;
        modelName: string | null;
        createdAt: Date;
      }>
    >(
      `SELECT * FROM "performance_reports" WHERE "projectId" = $1 ORDER BY "createdAt" DESC`,
      projectId
    );

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      score: row.score,
      issues:
        typeof row.issues === "string" ? JSON.parse(row.issues) : row.issues || [],
      optimizations:
        typeof row.optimizations === "string"
          ? JSON.parse(row.optimizations)
          : row.optimizations || [],
      model: row.modelName || undefined,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error("[getPerformanceReports] 查询失败:", error);
    return [];
  }
}

// ============ 辅助函数 ============

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
