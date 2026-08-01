/**
 * AI 自动 Bug 修复引擎
 * 分析错误日志，定位根因，生成修复方案
 * 支持七种常见错误类型的分析和修复
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";

// ============ 类型定义 ============

export type ErrorType =
  | "runtime"
  | "syntax"
  | "logic"
  | "null-reference"
  | "type-error"
  | "async-error"
  | "memory-leak";

export type Severity = "critical" | "high" | "medium" | "low";

export interface ErrorAnalysis {
  rootCause: string;
  errorType: ErrorType;
  affectedFiles: string[];
  severity: Severity;
  details?: string;
}

export interface BugFix {
  id?: string;
  projectId?: string;
  errorLog: string;
  rootCause: string;
  errorType: ErrorType;
  severity: Severity;
  affectedFiles: string[];
  fixCode: string;
  explanation: string;
  verificationSteps: string[];
  verified?: boolean;
  createdAt?: Date;
}

export interface FixResult {
  fixCode: string;
  explanation: string;
  verificationSteps: string[];
}

export interface FixVerification {
  isFixed: boolean;
  confidence: number; // 0-1
  remainingIssues: string[];
  recommendation: string;
}

export interface StackTraceInfo {
  file: string | null;
  line: number | null;
  function: string | null;
  message: string;
}

// ============ 错误类型描述 ============

export const ERROR_TYPE_DESCRIPTIONS: Record<
  ErrorType,
  { name: string; description: string }
> = {
  runtime: {
    name: "运行时错误",
    description: "程序运行期间发生的错误，如未定义变量、类型不匹配等",
  },
  syntax: {
    name: "语法错误",
    description: "代码语法不正确，导致解析失败",
  },
  logic: {
    name: "逻辑错误",
    description: "代码语法正确但逻辑有误，产生错误结果",
  },
  "null-reference": {
    name: "空引用错误",
    description: "访问 null 或 undefined 值的属性或方法",
  },
  "type-error": {
    name: "类型错误",
    description: "类型不匹配或无效的类型操作",
  },
  "async-error": {
    name: "异步错误",
    description: "Promise 未正确处理、异步操作异常未捕获",
  },
  "memory-leak": {
    name: "内存泄漏",
    description: "资源未正确释放，导致内存持续增长",
  },
};

// ============ 表初始化 ============

let bugFixTablesInitialized = false;

/**
 * 确保 Bug 修复相关数据库表已创建
 */
async function ensureBugFixTablesExist(): Promise<void> {
  if (bugFixTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "bug_fixes" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "errorLog" TEXT NOT NULL,
        "rootCause" TEXT,
        "errorType" TEXT,
        "severity" TEXT NOT NULL DEFAULT 'medium',
        "affectedFiles" JSONB NOT NULL DEFAULT '[]',
        "fixCode" TEXT,
        "explanation" TEXT,
        "verificationSteps" JSONB NOT NULL DEFAULT '[]',
        "verified" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "bug_fixes_pkey" PRIMARY KEY ("id")
      );
    `);
    bugFixTablesInitialized = true;
  } catch (error) {
    console.error("[ensureBugFixTablesExist] 创建表失败:", error);
    bugFixTablesInitialized = true;
  }
}

// ============ 核心功能 ============

/**
 * 从错误日志提取堆栈信息
 */
export function extractStackTrace(errorLog: string): StackTraceInfo {
  const result: StackTraceInfo = {
    file: null,
    line: null,
    function: null,
    message: errorLog.split("\n")[0]?.trim() || errorLog.trim(),
  };

  // 匹配常见的堆栈跟踪格式
  // 格式1: at functionName (filePath:line:col)
  const atPattern = /at\s+(?:(\S+)\s+)?\(?(.+?):(\d+):\d+\)?/;
  // 格式2: at filePath:line:col
  const simplePattern = /at\s+(.+?):(\d+):\d+/;
  // 格式3: filePath(line,col)
  const v8Pattern = /(.+?):(\d+):\d+/;

  const lines = errorLog.split("\n");
  for (const line of lines) {
    const atMatch = line.match(atPattern);
    if (atMatch) {
      result.function = atMatch[1] || null;
      result.file = atMatch[2] || null;
      result.line = atMatch[3] ? parseInt(atMatch[3], 10) : null;
      break;
    }

    const simpleMatch = line.match(simplePattern);
    if (simpleMatch) {
      result.file = simpleMatch[1] || null;
      result.line = simpleMatch[2] ? parseInt(simpleMatch[2], 10) : null;
      break;
    }

    const v8Match = line.match(v8Pattern);
    if (v8Match && !result.file) {
      result.file = v8Match[1] || null;
      result.line = v8Match[2] ? parseInt(v8Match[2], 10) : null;
      break;
    }
  }

  // 提取错误消息（通常是第一行或包含 "Error:" 的行）
  const errorLine = lines.find((l) => l.includes("Error:") || l.includes("错误"));
  if (errorLine) {
    result.message = errorLine.trim();
  }

  return result;
}

/**
 * AI 分析错误日志
 */
export async function analyzeError(
  errorLog: string,
  code?: string
): Promise<ErrorAnalysis> {
  // 先尝试从堆栈信息提取基本数据
  const stackInfo = extractStackTrace(errorLog);

  const errorTypes = Object.entries(ERROR_TYPE_DESCRIPTIONS)
    .map(([key, val]) => `- ${key} (${val.name}): ${val.description}`)
    .join("\n");

  const systemPrompt = `你是一个 Bug 分析专家。请分析以下错误日志，找出根本原因。

可识别的错误类型：
${errorTypes}

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "rootCause": "根本原因分析",
  "errorType": "错误类型(如 runtime, syntax, logic, null-reference, type-error, async-error, memory-leak)",
  "affectedFiles": ["受影响的文件路径"],
  "severity": "critical|high|medium|low",
  "details": "详细分析说明"
}`;

  let userMessage = `## 错误日志\n\`\`\`\n${errorLog}\n\`\`\`\n`;

  if (code) {
    userMessage += `\n## 相关代码\n\`\`\`\n${code}\n\`\`\`\n`;
    userMessage += "请结合代码分析错误原因。";
  } else {
    userMessage += "请分析以上错误日志，找出根本原因。";
  }

  if (stackInfo.file) {
    userMessage += `\n\n## 堆栈信息\n- 文件: ${stackInfo.file}\n- 行号: ${stackInfo.line || "未知"}\n- 函数: ${stackInfo.function || "未知"}`;
  }

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 3000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    return {
      rootCause: parsed.rootCause || "无法确定根本原因",
      errorType: isValidErrorType(parsed.errorType) ? parsed.errorType : "runtime",
      affectedFiles: Array.isArray(parsed.affectedFiles)
        ? parsed.affectedFiles
        : stackInfo.file
        ? [stackInfo.file]
        : [],
      severity: isValidSeverity(parsed.severity) ? parsed.severity : "medium",
      details: parsed.details || "",
    };
  } catch (error) {
    console.error("[analyzeError] JSON 解析失败:", error);
    return {
      rootCause: response.content,
      errorType: "runtime",
      affectedFiles: stackInfo.file ? [stackInfo.file] : [],
      severity: "medium",
      details: "AI 返回内容无法解析为 JSON，已将原始返回作为根因分析",
    };
  }
}

/**
 * 生成修复代码
 */
export async function generateFix(
  errorLog: string,
  rootCause: string,
  code?: string
): Promise<FixResult> {
  const systemPrompt = `你是一个 Bug 修复专家。请根据错误日志和根因分析，生成具体的修复代码。

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "fixCode": "修复后的完整代码",
  "explanation": "修复说明，包括修改了什么以及为什么",
  "verificationSteps": ["验证步骤1", "验证步骤2", "..."]
}

要求：
1. 修复代码要完整可运行
2. 只修改有问题的部分，不要大幅改动其他代码
3. 验证步骤要具体可操作
4. 说明修复的原理和可能的副作用`;

  let userMessage = `## 错误日志\n\`\`\`\n${errorLog}\n\`\`\`\n\n## 根因分析\n${rootCause}\n`;

  if (code) {
    userMessage += `\n## 需要修复的代码\n\`\`\`\n${code}\n\`\`\`\n`;
    userMessage += "请提供修复后的完整代码。";
  } else {
    userMessage += "请根据以上信息提供修复方案。";
  }

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
      fixCode: parsed.fixCode || "",
      explanation: parsed.explanation || response.content,
      verificationSteps: Array.isArray(parsed.verificationSteps)
        ? parsed.verificationSteps
        : [],
    };
  } catch (error) {
    console.error("[generateFix] JSON 解析失败:", error);
    return {
      fixCode: code || "",
      explanation: response.content,
      verificationSteps: [],
    };
  }
}

/**
 * 验证修复有效性
 * AI 验证修复是否解决问题
 */
export async function verifyFix(
  originalCode: string,
  fixedCode: string,
  errorLog: string
): Promise<FixVerification> {
  const systemPrompt = `你是一个代码验证专家。请验证修复后的代码是否真正解决了原始错误。

请从以下角度分析：
1. 原始错误是否已被修复
2. 修复是否引入了新的问题
3. 代码逻辑是否仍然正确
4. 边界条件是否得到处理

请返回 JSON 格式（只返回 JSON）：
{
  "isFixed": true或false,
  "confidence": 0到1之间的数字,
  "remainingIssues": ["剩余问题1", "剩余问题2"],
  "recommendation": "建议说明"
}`;

  const userMessage = `## 原始错误日志
\`\`\`
${errorLog}
\`\`\`

## 修复前代码
\`\`\`
${originalCode}
\`\`\`

## 修复后代码
\`\`\`
${fixedCode}
\`\`\`

请验证修复是否有效解决了原始错误。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.2,
    maxTokens: 2000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    return {
      isFixed: parsed.isFixed ?? false,
      confidence: parsed.confidence ?? 0,
      remainingIssues: Array.isArray(parsed.remainingIssues)
        ? parsed.remainingIssues
        : [],
      recommendation: parsed.recommendation || "无建议",
    };
  } catch (error) {
    console.error("[verifyFix] JSON 解析失败:", error);
    return {
      isFixed: false,
      confidence: 0,
      remainingIssues: ["验证结果解析失败"],
      recommendation: "AI 验证结果解析失败，请人工验证修复有效性",
    };
  }
}

/**
 * 保存 Bug 修复记录
 */
export async function saveBugFix(
  projectId: string,
  bugFix: BugFix
): Promise<string> {
  await ensureBugFixTablesExist();

  const id = `bugfix_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "bug_fixes" ("id", "projectId", "errorLog", "rootCause", "errorType", "severity", "affectedFiles", "fixCode", "explanation", "verificationSteps", "verified", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      id,
      projectId,
      bugFix.errorLog,
      bugFix.rootCause || null,
      bugFix.errorType || null,
      bugFix.severity || "medium",
      JSON.stringify(bugFix.affectedFiles || []),
      bugFix.fixCode || null,
      bugFix.explanation || null,
      JSON.stringify(bugFix.verificationSteps || []),
      bugFix.verified ?? false
    );
    return id;
  } catch (error) {
    console.error("[saveBugFix] 保存失败:", error);
    throw new Error(`保存 Bug 修复记录失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 获取 Bug 修复历史
 */
export async function getBugFixes(projectId: string): Promise<BugFix[]> {
  await ensureBugFixTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        projectId: string;
        errorLog: string;
        rootCause: string | null;
        errorType: string | null;
        severity: string;
        affectedFiles: unknown;
        fixCode: string | null;
        explanation: string | null;
        verificationSteps: unknown;
        verified: boolean;
        createdAt: Date;
      }>
    >(
      `SELECT * FROM "bug_fixes" WHERE "projectId" = $1 ORDER BY "createdAt" DESC`,
      projectId
    );

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      errorLog: row.errorLog,
      rootCause: row.rootCause || "",
      errorType: (row.errorType as ErrorType) || "runtime",
      severity: (row.severity as Severity) || "medium",
      affectedFiles:
        typeof row.affectedFiles === "string"
          ? JSON.parse(row.affectedFiles)
          : row.affectedFiles || [],
      fixCode: row.fixCode || "",
      explanation: row.explanation || "",
      verificationSteps:
        typeof row.verificationSteps === "string"
          ? JSON.parse(row.verificationSteps)
          : row.verificationSteps || [],
      verified: row.verified,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error("[getBugFixes] 查询失败:", error);
    return [];
  }
}

// ============ 辅助函数 ============

function isValidErrorType(type: unknown): type is ErrorType {
  return (
    typeof type === "string" &&
    type in ERROR_TYPE_DESCRIPTIONS
  );
}

function isValidSeverity(sev: unknown): sev is Severity {
  return typeof sev === "string" && ["critical", "high", "medium", "low"].includes(sev);
}
