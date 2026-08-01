/**
 * AI 代码重构引擎
 * 识别代码异味并生成重构方案
 * 支持八种常见代码异味的检测和重构
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";

// ============ 类型定义 ============

export type CodeSmellType =
  | "long-method"
  | "duplicate-code"
  | "deep-nesting"
  | "complex-condition"
  | "large-class"
  | "long-parameter-list"
  | "feature-envy"
  | "data-clumps";

export type Severity = "critical" | "high" | "medium" | "low";

export interface CodeSmell {
  type: CodeSmellType;
  severity: Severity;
  location: string;
  description: string;
  suggestion: string;
}

export interface Refactoring {
  id?: string;
  projectId?: string;
  type: CodeSmellType;
  filePath: string;
  beforeCode: string;
  afterCode: string;
  reason: string;
  steps: string[];
  verified?: boolean;
  createdAt?: Date;
}

export interface RefactoringVerification {
  isEquivalent: boolean;
  confidence: number; // 0-1
  differences: string[];
  risks: string[];
  recommendation: string;
}

// ============ 代码异味类型描述 ============

export const CODE_SMELL_DESCRIPTIONS: Record<
  CodeSmellType,
  { name: string; description: string }
> = {
  "long-method": {
    name: "过长方法",
    description: "方法过长，职责过多，难以理解和维护",
  },
  "duplicate-code": {
    name: "重复代码",
    description: "存在重复的代码块，违反 DRY 原则",
  },
  "deep-nesting": {
    name: "深层嵌套",
    description: "嵌套层级过深，降低可读性",
  },
  "complex-condition": {
    name: "复杂条件",
    description: "条件表达式过于复杂，难以理解",
  },
  "large-class": {
    name: "过大类",
    description: "类承担过多职责，违反单一职责原则",
  },
  "long-parameter-list": {
    name: "过长参数列表",
    description: "方法参数过多，调用困难和易错",
  },
  "feature-envy": {
    name: "依恋情结",
    description: "方法对其他类的数据感兴趣超过自身",
  },
  "data-clumps": {
    name: "数据泥团",
    description: "多个数据项总是一起出现，应封装为对象",
  },
};

// ============ 表初始化 ============

let refactorTablesInitialized = false;

/**
 * 确保重构相关数据库表已创建
 */
async function ensureRefactorTablesExist(): Promise<void> {
  if (refactorTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "refactorings" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "filePath" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "beforeCode" TEXT NOT NULL,
        "afterCode" TEXT NOT NULL,
        "reason" TEXT,
        "steps" JSONB NOT NULL DEFAULT '[]',
        "verified" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "refactorings_pkey" PRIMARY KEY ("id")
      );
    `);
    refactorTablesInitialized = true;
  } catch (error) {
    console.error("[ensureRefactorTablesExist] 创建表失败:", error);
    refactorTablesInitialized = true;
  }
}

// ============ 核心功能 ============

/**
 * AI 分析代码异味
 */
export async function analyzeCodeSmells(
  code: string,
  filePath: string
): Promise<CodeSmell[]> {
  const smellTypes = Object.entries(CODE_SMELL_DESCRIPTIONS)
    .map(([key, val]) => `- ${key} (${val.name}): ${val.description}`)
    .join("\n");

  const systemPrompt = `你是一个代码质量分析专家。请分析以下代码，识别其中的代码异味。

可识别的代码异味类型：
${smellTypes}

请返回 JSON 数组格式（只返回 JSON，不要其他文本）：
[
  {
    "type": "代码异味类型(如 long-method)",
    "severity": "critical|high|medium|low",
    "location": "代码位置描述(如函数名、行号范围)",
    "description": "异味的具体描述",
    "suggestion": "重构建议"
  }
]

如果没有发现代码异味，返回空数组 []。`;

  const userMessage = `## 文件: ${filePath}\n\`\`\`\n${code}\n\`\`\`\n\n请分析以上代码中的代码异味。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 4000,
  });

  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 验证并过滤结果
    return parsed.filter(
      (item: unknown): item is CodeSmell =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        "description" in item
    );
  } catch (error) {
    console.error("[analyzeCodeSmells] JSON 解析失败:", error);
    return [];
  }
}

/**
 * 生成重构方案
 */
export async function generateRefactoring(
  code: string,
  filePath: string,
  type: CodeSmellType
): Promise<Refactoring> {
  const smellInfo = CODE_SMELL_DESCRIPTIONS[type];

  const systemPrompt = `你是一个代码重构专家。请针对指定的代码异味类型，生成具体的重构方案。

代码异味类型: ${type} (${smellInfo.name})
描述: ${smellInfo.description}

请返回 JSON 格式（只返回 JSON，不要其他文本）：
{
  "type": "${type}",
  "filePath": "${filePath}",
  "beforeCode": "重构前的原始代码",
  "afterCode": "重构后的完整代码",
  "reason": "重构原因和收益说明",
  "steps": ["重构步骤1", "重构步骤2", "..."]
}

要求：
1. 重构后的代码必须保持原有功能不变
2. 代码要完整可运行
3. 每个步骤要清晰明确
4. 注明重构带来的具体收益`;

  const userMessage = `## 文件: ${filePath}\n\`\`\`\n${code}\n\`\`\`\n\n请针对 "${smellInfo.name}" 进行重构。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.4,
    maxTokens: 4000,
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    return {
      type,
      filePath,
      beforeCode: parsed.beforeCode || code,
      afterCode: parsed.afterCode || "",
      reason: parsed.reason || "",
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    };
  } catch (error) {
    console.error("[generateRefactoring] JSON 解析失败:", error);
    return {
      type,
      filePath,
      beforeCode: code,
      afterCode: code,
      reason: "重构方案生成失败，返回原始代码",
      steps: [],
    };
  }
}

/**
 * 验证重构正确性
 * AI 验证重构前后行为是否等价
 */
export async function verifyRefactoring(
  beforeCode: string,
  afterCode: string,
  tests?: string
): Promise<RefactoringVerification> {
  const systemPrompt = `你是一个代码验证专家。请验证重构前后的代码是否行为等价。

请从以下角度分析：
1. 功能是否一致
2. 边界条件是否等价
3. 异常处理是否一致
4. 副作用是否相同
5. 性能是否受影响

请返回 JSON 格式（只返回 JSON）：
{
  "isEquivalent": true或false,
  "confidence": 0到1之间的数字,
  "differences": ["差异1", "差异2"],
  "risks": ["风险1", "风险2"],
  "recommendation": "建议说明"
}`;

  let userMessage = `## 重构前代码
\`\`\`
${beforeCode}
\`\`\`

## 重构后代码
\`\`\`
${afterCode}
\`\`\`
`;

  if (tests) {
    userMessage += `\n## 测试用例\n\`\`\`\n${tests}\n\`\`\`\n`;
    userMessage += "请结合测试用例验证重构的正确性。";
  } else {
    userMessage += "请分析重构前后代码的行为是否等价。";
  }

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
      isEquivalent: parsed.isEquivalent ?? false,
      confidence: parsed.confidence ?? 0,
      differences: Array.isArray(parsed.differences) ? parsed.differences : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      recommendation: parsed.recommendation || "无建议",
    };
  } catch (error) {
    console.error("[verifyRefactoring] JSON 解析失败:", error);
    return {
      isEquivalent: false,
      confidence: 0,
      differences: ["无法解析验证结果"],
      risks: ["验证结果解析失败，建议人工检查"],
      recommendation: "AI 验证结果解析失败，请人工验证重构正确性",
    };
  }
}

/**
 * 保存重构记录
 */
export async function saveRefactoring(
  projectId: string,
  refactoring: Refactoring
): Promise<string> {
  await ensureRefactorTablesExist();

  const id = `refactor_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "refactorings" ("id", "projectId", "filePath", "type", "beforeCode", "afterCode", "reason", "steps", "verified", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      id,
      projectId,
      refactoring.filePath,
      refactoring.type,
      refactoring.beforeCode,
      refactoring.afterCode,
      refactoring.reason || null,
      JSON.stringify(refactoring.steps || []),
      refactoring.verified ?? false
    );
    return id;
  } catch (error) {
    console.error("[saveRefactoring] 保存失败:", error);
    throw new Error(`保存重构记录失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 获取重构历史
 */
export async function getRefactorings(
  projectId: string
): Promise<Refactoring[]> {
  await ensureRefactorTablesExist();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        projectId: string;
        filePath: string;
        type: string;
        beforeCode: string;
        afterCode: string;
        reason: string | null;
        steps: unknown;
        verified: boolean;
        createdAt: Date;
      }>
    >(
      `SELECT * FROM "refactorings" WHERE "projectId" = $1 ORDER BY "createdAt" DESC`,
      projectId
    );

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      filePath: row.filePath,
      type: row.type as CodeSmellType,
      beforeCode: row.beforeCode,
      afterCode: row.afterCode,
      reason: row.reason || "",
      steps:
        typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps || [],
      verified: row.verified,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error("[getRefactorings] 查询失败:", error);
    return [];
  }
}
