/**
 * 项目知识库系统
 * AI 自动学习项目约定、架构决策、历史 Bug
 * 支持从 commit、代码审查中自动提取知识
 */

import { chatCompletion, ModelMessage } from "./models";
import { prisma } from "./prisma";

// ============ 类型定义 ============

export type KnowledgeCategory =
  | "architecture"
  | "convention"
  | "bug-pattern"
  | "best-practice"
  | "tech-decision"
  | "performance-tip"
  | "security-note"
  | "other";

export interface KnowledgeEntry {
  id: string;
  projectId: string | null;
  agentId: string | null;
  category: KnowledgeCategory;
  question: string;
  answer: string;
  source: string | null;
  createdAt: Date;
}

export interface AddEntryData {
  projectId?: string;
  agentId?: string;
  category: KnowledgeCategory;
  question: string;
  answer: string;
  source?: string;
}

export interface GetEntriesFilter {
  projectId?: string;
  agentId?: string;
  category?: KnowledgeCategory;
}

export interface SearchResult {
  entry: KnowledgeEntry;
  relevance: number; // 0-1
  reason: string;
}

export interface CommitData {
  sha: string;
  message: string;
  diff?: string;
  author?: string;
  files?: string[];
}

export interface ReviewData {
  overallScore?: number;
  issues?: {
    dimension?: string;
    severity?: string;
    title: string;
    description: string;
    suggestion?: string;
  }[];
  dimensions?: Record<string, { score: number; summary: string }>;
}

export interface LearnedEntry {
  category: KnowledgeCategory;
  question: string;
  answer: string;
  source: string;
}

// ============ 表初始化 ============

let knowledgeTablesInitialized = false;

/**
 * 确保知识库相关数据库表已创建
 */
async function ensureKnowledgeTablesExist(): Promise<void> {
  if (knowledgeTablesInitialized) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "knowledge_entries" (
        "id" TEXT NOT NULL,
        "projectId" TEXT,
        "agentId" TEXT,
        "category" TEXT NOT NULL DEFAULT 'other',
        "question" TEXT NOT NULL,
        "answer" TEXT NOT NULL,
        "source" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
      );
    `);

    // 添加索引以加速查询
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_knowledge_project" ON "knowledge_entries" ("projectId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_knowledge_category" ON "knowledge_entries" ("category");
    `);

    knowledgeTablesInitialized = true;
  } catch (error) {
    console.error("[ensureKnowledgeTablesExist] 创建表失败:", error);
    knowledgeTablesInitialized = true;
  }
}

// ============ 核心功能 ============

/**
 * 添加知识条目
 */
export async function addEntry(data: AddEntryData): Promise<string> {
  await ensureKnowledgeTablesExist();

  const id = `kb_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "knowledge_entries" ("id", "projectId", "agentId", "category", "question", "answer", "source", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      id,
      data.projectId || null,
      data.agentId || null,
      data.category || "other",
      data.question,
      data.answer,
      data.source || null
    );
    return id;
  } catch (error) {
    console.error("[addEntry] 添加失败:", error);
    throw new Error(`添加知识条目失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 查询知识条目
 */
export async function getEntries(
  filter: GetEntriesFilter
): Promise<KnowledgeEntry[]> {
  await ensureKnowledgeTablesExist();

  try {
    let query = `SELECT * FROM "knowledge_entries" WHERE 1=1`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.projectId) {
      query += ` AND "projectId" = $${paramIndex++}`;
      params.push(filter.projectId);
    }
    if (filter.agentId) {
      query += ` AND "agentId" = $${paramIndex++}`;
      params.push(filter.agentId);
    }
    if (filter.category) {
      query += ` AND "category" = $${paramIndex++}`;
      params.push(filter.category);
    }

    query += ` ORDER BY "createdAt" DESC`;

    const rows = await prisma.$queryRawUnsafe<KnowledgeEntry[]>(
      query,
      ...params
    );

    return rows;
  } catch (error) {
    console.error("[getEntries] 查询失败:", error);
    return [];
  }
}

/**
 * 删除知识条目
 */
export async function deleteEntry(id: string): Promise<boolean> {
  await ensureKnowledgeTablesExist();

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_entries" WHERE "id" = $1`,
      id
    );
    return true;
  } catch (error) {
    console.error("[deleteEntry] 删除失败:", error);
    return false;
  }
}

/**
 * 语义搜索知识库
 * 使用 AI 进行语义匹配，返回相关度排序的结果
 */
export async function searchKnowledge(
  query: string,
  projectId?: string
): Promise<SearchResult[]> {
  await ensureKnowledgeTablesExist();

  // 先获取候选条目（全部或指定项目的）
  let candidates: KnowledgeEntry[];
  if (projectId) {
    // 获取项目级别和全局级别的条目
    candidates = await prisma.$queryRawUnsafe<KnowledgeEntry[]>(
      `SELECT * FROM "knowledge_entries" WHERE "projectId" = $1 OR "projectId" IS NULL ORDER BY "createdAt" DESC LIMIT 50`,
      projectId
    );
  } else {
    candidates = await prisma.$queryRawUnsafe<KnowledgeEntry[]>(
      `SELECT * FROM "knowledge_entries" ORDER BY "createdAt" DESC LIMIT 50`
    );
  }

  if (candidates.length === 0) {
    return [];
  }

  // 如果条目较少，使用简单的文本匹配
  if (candidates.length <= 5) {
    return candidates
      .map((entry) => {
        const score = calculateTextRelevance(query, entry);
        return {
          entry,
          relevance: score,
          reason: score > 0.5 ? "文本高度匹配" : "文本部分匹配",
        };
      })
      .filter((r) => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);
  }

  // 使用 AI 进行语义匹配
  const systemPrompt = `你是一个知识检索专家。请根据用户查询，从知识库条目中找出最相关的结果。

请返回 JSON 数组格式（只返回 JSON，不要其他文本）：
[
  {
    "id": "条目ID",
    "relevance": 0到1之间的相关度分数,
    "reason": "相关原因说明"
  }
]

只返回相关度大于 0.3 的条目，按相关度从高到低排序。`;

  const entriesForAI = candidates.map((e) => ({
    id: e.id,
    category: e.category,
    question: e.question,
    answer: e.answer.substring(0, 200), // 截断以控制 token
  }));

  const userMessage = `## 用户查询\n${query}\n\n## 知识库条目\n${JSON.stringify(entriesForAI, null, 2)}\n\n请找出与查询最相关的条目。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await chatCompletion(messages, {
      temperature: 0.2,
      maxTokens: 2000,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 将 AI 结果与原始条目关联
    const results: SearchResult[] = [];
    for (const item of parsed) {
      const entry = candidates.find((e) => e.id === item.id);
      if (entry) {
        results.push({
          entry,
          relevance: typeof item.relevance === "number" ? item.relevance : 0.5,
          reason: item.reason || "语义匹配",
        });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  } catch (error) {
    console.error("[searchKnowledge] AI 语义搜索失败，回退到文本匹配:", error);
    // 回退到文本匹配
    return candidates
      .map((entry) => {
        const score = calculateTextRelevance(query, entry);
        return {
          entry,
          relevance: score,
          reason: "文本匹配（AI 搜索不可用）",
        };
      })
      .filter((r) => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);
  }
}

/**
 * 从 commit 自动学习
 * 分析 commit message 和 diff，提取技术决策、Bug 修复经验
 */
export async function autoLearnFromCommit(
  projectId: string,
  commitData: CommitData
): Promise<string[]> {
  const systemPrompt = `你是一个技术知识提取专家。请分析以下 Git commit 信息，提取有价值的技术知识。

可以从以下方面提取知识：
1. 技术决策 (tech-decision): 为什么选择某种技术方案
2. Bug 修复经验 (bug-pattern): 修复了什么 Bug，如何修复的
3. 最佳实践 (best-practice): 代码改进中体现的最佳实践
4. 架构决策 (architecture): 架构相关的变更和决策
5. 性能优化 (performance-tip): 性能相关的改进
6. 安全注意事项 (security-note): 安全相关的修复

请返回 JSON 数组格式（只返回 JSON，不要其他文本）：
[
  {
    "category": "知识类别",
    "question": "知识问题（简明描述）",
    "answer": "知识答案（详细说明）",
    "source": "commit:commitSha"
  }
]

如果 commit 没有值得提取的知识，返回空数组 []。`;

  let userMessage = `## Commit 信息\n- SHA: ${commitData.sha}\n- Message: ${commitData.message}\n`;
  if (commitData.author) {
    userMessage += `- Author: ${commitData.author}\n`;
  }
  if (commitData.files && commitData.files.length > 0) {
    userMessage += `- Files: ${commitData.files.join(", ")}\n`;
  }
  if (commitData.diff) {
    // 截断过长的 diff
    const truncatedDiff =
      commitData.diff.length > 3000
        ? commitData.diff.substring(0, 3000) + "\n... (diff 已截断)"
        : commitData.diff;
    userMessage += `\n## Diff\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n`;
  }

  userMessage += "\n请分析以上 commit，提取有价值的知识。";

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await chatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 3000,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 保存提取的知识条目
    const entryIds: string[] = [];
    for (const item of parsed as LearnedEntry[]) {
      if (item.question && item.answer) {
        const id = await addEntry({
          projectId,
          category: item.category || "other",
          question: item.question,
          answer: item.answer,
          source: item.source || `commit:${commitData.sha.substring(0, 7)}`,
        });
        entryIds.push(id);
      }
    }

    return entryIds;
  } catch (error) {
    console.error("[autoLearnFromCommit] 知识提取失败:", error);
    return [];
  }
}

/**
 * 从代码审查学习
 * 提取常见问题和最佳实践
 */
export async function autoLearnFromReview(
  projectId: string,
  reviewData: ReviewData
): Promise<string[]> {
  const systemPrompt = `你是一个代码审查知识提取专家。请从以下代码审查结果中提取可复用的知识。

可以从以下方面提取知识：
1. 最佳实践 (best-practice): 审查中发现的优秀实践或建议
2. Bug 模式 (bug-pattern): 常见的 Bug 模式和避免方法
3. 性能优化 (performance-tip): 性能相关的建议
4. 安全注意事项 (security-note): 安全相关的建议
5. 代码规范 (convention): 代码风格和规范建议

请返回 JSON 数组格式（只返回 JSON，不要其他文本）：
[
  {
    "category": "知识类别",
    "question": "知识问题（简明描述）",
    "answer": "知识答案（详细说明，包含最佳实践建议）",
    "source": "code-review"
  }
]

如果审查结果没有值得提取的知识，返回空数组 []。`;

  const userMessage = `## 代码审查结果\n${JSON.stringify(reviewData, null, 2)}\n\n请从以上审查结果中提取有价值的知识。`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await chatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 3000,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : response.content;
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // 保存提取的知识条目
    const entryIds: string[] = [];
    for (const item of parsed as LearnedEntry[]) {
      if (item.question && item.answer) {
        const id = await addEntry({
          projectId,
          category: item.category || "other",
          question: item.question,
          answer: item.answer,
          source: item.source || "code-review",
        });
        entryIds.push(id);
      }
    }

    return entryIds;
  } catch (error) {
    console.error("[autoLearnFromReview] 知识提取失败:", error);
    return [];
  }
}

/**
 * 为 AI 对话构建知识库上下文
 * 搜索相关知识条目，返回上下文字符串
 */
export async function buildContext(
  projectId: string,
  query: string
): Promise<string> {
  const results = await searchKnowledge(query, projectId);

  if (results.length === 0) {
    return "";
  }

  const parts: string[] = ["## 项目知识库上下文"];

  // 最多包含 5 条相关知识
  const topResults = results.slice(0, 5);
  for (const result of topResults) {
    parts.push(`\n### ${result.entry.question}`);
    parts.push(result.entry.answer);
    if (result.entry.source) {
      parts.push(`(来源: ${result.entry.source}, 相关度: ${(result.relevance * 100).toFixed(0)}%)`);
    }
  }

  return parts.join("\n");
}

// ============ 辅助函数 ============

/**
 * 计算文本相关度（简单的关键词匹配）
 */
function calculateTextRelevance(
  query: string,
  entry: KnowledgeEntry
): number {
  const queryLower = query.toLowerCase();
  const questionLower = entry.question.toLowerCase();
  const answerLower = entry.answer.toLowerCase();

  let score = 0;

  // 完全匹配问题
  if (questionLower === queryLower) {
    score += 1.0;
  }

  // 问题包含查询
  if (questionLower.includes(queryLower)) {
    score += 0.7;
  }

  // 查询包含问题关键词
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);
  for (const word of queryWords) {
    if (questionLower.includes(word)) {
      score += 0.2;
    }
    if (answerLower.includes(word)) {
      score += 0.1;
    }
  }

  // 答案包含查询
  if (answerLower.includes(queryLower)) {
    score += 0.4;
  }

  return Math.min(score, 1.0);
}
