/**
 * scripts/run-lore.js
 * 决策提取脚本 v2.0：智能技术决策分析引擎
 *
 * 增强能力:
 *   - 智能预过滤: 自动分类 commit，跳过非决策性提交 (merge, chore, typo, etc.)
 *   - Few-shot 提示工程: 包含高质量示例提升提取准确性
 *   - 多维度决策分类: 架构决策、技术选型、安全决策、性能优化等
 *   - 置信度评分: 每条决策附带提取置信度
 *   - 决策去重: 相似决策自动合并
 *   - 指数退避重试: 更健壮的 API 调用
 *   - 上下文增强: 提取 commit body 中的更多上下文
 *   - 批量优化: 动态批次大小，适应上下文窗口
 *
 * 输出: .lore/decisions.jsonl
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const MODEL = process.env.LORE_MODEL || "gpt-4o";
const MIN_INTERVAL_MS = 4200;

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".lore");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "decisions.jsonl");

/** 每批分析的 commit 数量 */
const BATCH_SIZE = 5;
/** 单个 commit message 最大长度 */
const MAX_COMMIT_MSG_LEN = 2000;

let lastRequestTime = 0;

// ============================================================
// 工具函数
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

// ============================================================
// Commit 预分类引擎
// ============================================================

/** Commit 分类规则 */
const COMMIT_CATEGORIES = {
  DECISION: "decision",      // 包含技术决策
  MERGE: "merge",            // 合并提交
  CHORE: "chore",            // 杂项维护
  TYPO: "typo",              // 修复拼写
  FORMAT: "format",          // 格式化
  DOCS: "docs",              // 文档变更
  REVERT: "revert",          // 回滚
  CI: "ci",                  // CI/CD 变更
  DEPENDENCY: "dependency",  // 依赖更新
};

/**
 * 预分类 commit，过滤掉明显不含技术决策的提交
 * 返回 { category, shouldAnalyze, reason }
 */
function classifyCommit(message) {
  const firstLine = message.split("\n")[0].trim();
  const lower = firstLine.toLowerCase();

  // Merge commit
  if (lower.startsWith("merge ") || lower.startsWith("merge pull request") || lower.startsWith("merge branch")) {
    return { category: COMMIT_CATEGORIES.MERGE, shouldAnalyze: false, reason: "合并提交" };
  }

  // Revert
  if (lower.startsWith("revert ") || lower.startsWith("revert:")) {
    return { category: COMMIT_CATEGORIES.REVERT, shouldAnalyze: false, reason: "回滚提交" };
  }

  // 纯格式化
  if (/^(format|style|lint|prettier|eslint)[: ]/i.test(firstLine) && firstLine.length < 60) {
    return { category: COMMIT_CATEGORIES.FORMAT, shouldAnalyze: false, reason: "格式化提交" };
  }

  // 纯拼写修复
  if (/^(typo|fix typo|spelling)[: ]/i.test(firstLine) && firstLine.length < 60) {
    return { category: COMMIT_CATEGORIES.TYPO, shouldAnalyze: false, reason: "拼写修复" };
  }

  // 纯 CI/CD 变更
  if (/^(ci|chore\(ci\)|build)[: ]/i.test(firstLine) && /(?:github action|workflow|travis|circleci|jenkins|pipeline)/i.test(firstLine)) {
    return { category: COMMIT_CATEGORIES.CI, shouldAnalyze: false, reason: "CI/CD 变更" };
  }

  // 纯依赖更新 (bump/upgrade)
  if (/^(chore|build|deps)\(deps\)[: ]/i.test(firstLine) || /^bump\s+/i.test(firstLine) || /^upgrade\s+/i.test(firstLine)) {
    // 依赖更新可能含安全决策，如果是 security 相关则保留
    if (!/security|cve|vulnerability/i.test(firstLine)) {
      return { category: COMMIT_CATEGORIES.DEPENDENCY, shouldAnalyze: false, reason: "依赖更新" };
    }
  }

  // 纯文档变更 (仅修改 .md 文件)
  if (/^docs[: ]/i.test(firstLine) && firstLine.length < 80 && !/(?:api|architecture|design|decision|rfc|adr)/i.test(firstLine)) {
    return { category: COMMIT_CATEGORIES.DOCS, shouldAnalyze: false, reason: "纯文档变更" };
  }

  // 纯 chore (太短且无实质内容)
  if (/^chore[: ]/i.test(firstLine) && firstLine.length < 50) {
    return { category: COMMIT_CATEGORIES.CHORE, shouldAnalyze: false, reason: "杂项维护" };
  }

  return { category: COMMIT_CATEGORIES.DECISION, shouldAnalyze: true, reason: "可能包含技术决策" };
}

// ============================================================
// API 调用
// ============================================================

/**
 * 指数退避重试的模型调用
 */
async function chatCompletion(messages, options = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error("环境变量 GITHUB_TOKEN 未设置，无法调用 GitHub Models API");
  }

  const maxTokens = options.maxTokens || 4000;
  const temperature = options.temperature ?? 0.2;

  // 速率限制
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    lastRequestTime = Date.now();

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
          response_format: { type: "json_object" },
        }),
      });

      if (res.status === 429) {
        const waitTime = Math.min(10000 * Math.pow(1.5, attempt - 1), 60000);
        console.warn(`  [模型调用] 触发速率限制，等待 ${waitTime / 1000}s 后重试 (第 ${attempt} 次) ...`);
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
      return data.choices?.[0]?.message?.content || "";
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

// ============================================================
// JSON 提取（多策略）
// ============================================================

/**
 * 多策略 JSON 提取
 * 1. 尝试直接 JSON.parse
 * 2. 尝试从 code block 提取
 * 3. 尝试从文本中匹配 JSON 数组/对象
 * 4. 尝试修复常见 JSON 格式错误
 */
function extractJSON(text) {
  if (!text) return null;

  // 策略 1: 直接解析
  try {
    return JSON.parse(text.trim());
  } catch { /* 继续尝试 */ }

  // 策略 2: 从 code block 提取
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch { /* 继续尝试 */ }
  }

  // 策略 3: 匹配 JSON 对象 (包含 decisions 数组)
  const objMatch = text.match(/\{[\s\S]*"decisions"[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* 继续尝试 */ }
  }

  // 策略 3b: 匹配 JSON 数组
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) {
        return { decisions: parsed };
      }
    } catch { /* 继续尝试 */ }
  }

  // 策略 4: 修复常见 JSON 错误 (尾逗号、未转义换行等)
  const fixed = text
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\n/g, "\\n")
    .trim();

  try {
    return JSON.parse(fixed);
  } catch { /* 放弃 */ }

  return null;
}

// ============================================================
// Commit 获取
// ============================================================

/** 获取所有 commit 信息 */
function getCommits() {
  const format = "%H%x09%an%x09%aI%x09%B%x1e";
  const raw = git(`log --all --format="${format}"`);
  if (!raw) return [];

  const records = raw.split("\x1e").filter((r) => r.trim());
  const commits = [];

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [sha, author, timestamp, ...msgParts] = trimmed.split("\t");
    const message = msgParts.join("\t").trim();
    if (sha && message) {
      commits.push({ sha, author: author || "", timestamp: timestamp || "", message });
    }
  }

  return commits;
}

// ============================================================
// 代码变更上下文提取
// ============================================================

/**
 * 获取 commit 的代码变更摘要
 * 提取变更的文件列表和关键 diff 行，为决策分析提供更多上下文
 */
function getCommitDiffSummary(sha) {
  const shortSha = sha.slice(0, 12);
  
  // 获取变更文件列表
  const filesRaw = git(`show --name-only --format="" ${shortSha}`);
  const files = filesRaw.split("\n").filter(f => f.trim());
  
  if (files.length === 0) return null;
  
  // 获取 diff 统计
  const statRaw = git(`show --stat --format="" ${shortSha}`);
  const fileChanges = [];
  
  for (const file of files.slice(0, 10)) { // 最多 10 个文件
    // 获取该文件的 diff (最多 20 行变更)
    const diffRaw = git(`diff ${shortSha}~1..${shortSha} -- "${file}" 2>/dev/null || show ${shortSha} -- "${file}"`);
    if (!diffRaw) continue;
    
    const diffLines = diffRaw.split("\n");
    const addedLines = [];
    const removedLines = [];
    
    for (const line of diffLines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.slice(1).trim());
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines.push(line.slice(1).trim());
      }
    }
    
    // 只保留非空、有意义的变更行
    const meaningfulAdded = addedLines.filter(l => l.length > 5 && !l.startsWith("//")).slice(0, 10);
    const meaningfulRemoved = removedLines.filter(l => l.length > 5 && !l.startsWith("//")).slice(0, 5);
    
    if (meaningfulAdded.length > 0 || meaningfulRemoved.length > 0) {
      fileChanges.push({
        file,
        added: meaningfulAdded,
        removed: meaningfulRemoved,
      });
    }
  }
  
  return {
    fileCount: files.length,
    files: files.slice(0, 10),
    changes: fileChanges,
  };
}

/**
 * 构建增强的分析 prompt，包含代码变更上下文
 */
function buildEnhancedPrompt(batch) {
  const systemPrompt = `你是一位资深的技术架构师与技术决策分析师，擅长从 Git commit 历史和代码变更中提取技术决策信息。

你的任务是分析以下 Git commit 记录及其代码变更，提取每个 commit 蕴含的技术决策。

## 分析规则

1. **只提取真正的技术决策**: 跳过纯 bug 修复、格式化、依赖更新等无决策内容的 commit
2. **结合代码变更分析**: 不仅看 commit message，还要分析实际代码变更来推断决策
3. **决策分类**: 为每个决策分配一个类别:
   - "architecture": 架构决策（如分层结构、模块划分、设计模式选择）
   - "tech_choice": 技术选型（如选择某个框架、库、工具）
   - "security": 安全决策（如认证方案、加密策略、权限模型）
   - "performance": 性能优化（如缓存策略、索引优化、懒加载）
   - "data": 数据决策（如数据库设计、数据模型、迁移策略）
   - "api": API 设计（如 RESTful 规范、GraphQL、版本管理）
   - "infra": 基础设施（如部署方案、容器化、CI/CD）
   - "testing": 测试策略（如测试框架选择、覆盖率要求）
   - "other": 其他技术决策

4. **提取字段**:
   - context: 决策的上下文 / 要解决的问题背景
   - decision: 最终采纳的技术决策内容（简洁明确）
   - rejected: 被否决的替代方案（如果没有则 null）
   - constraints: 决策受到的约束条件（如果没有则 null）
   - category: 决策类别（上述之一）
   - confidence: 提取置信度 (0.0-1.0)，1.0 表示 commit 明确表达了决策
   - rationale: 决策理由（如果有则提取，否则 null）

5. **如果 commit 不包含技术决策**，将 confidence 设为 0.0，其他字段设为 null

6. **质量评分**: 为每条有效决策评估质量 (quality: 0.0-1.0):
   - 1.0: 决策明确、上下文完整、有理由和约束
   - 0.7: 决策明确但缺少部分上下文
   - 0.4: 决策可推断但不够明确
   - 0.0: 无决策

## 输出格式

返回 JSON 对象，格式如下:
{
  "decisions": [
    {
      "commit_sha": "commit 的完整 sha",
      "category": "architecture|tech_choice|security|performance|data|api|infra|testing|other",
      "context": "决策上下文",
      "decision": "决策内容",
      "rejected": null 或 "被否决的方案",
      "constraints": null 或 "约束条件",
      "rationale": null 或 "决策理由",
      "confidence": 0.0-1.0,
      "quality": 0.0-1.0
    }
  ]
}

## 示例

输入:
commit_sha: abc123
message: refactor: 将用户认证从 session 迁移到 JWT，因为需要支持移动端和第三方应用
code_changes:
  file: src/auth/middleware.ts
  added: ["import jwt from 'jsonwebtoken';", "export function authenticateToken(req, res, next) {", "  const token = req.headers['authorization'];"]

输出:
{
  "decisions": [
    {
      "commit_sha": "abc123",
      "category": "security",
      "context": "需要支持移动端和第三方应用的认证",
      "decision": "将用户认证从 session-based 迁移到 JWT",
      "rejected": "session-based 认证",
      "constraints": "需要兼容移动端和第三方应用",
      "rationale": "JWT 无状态特性更适合分布式和移动端场景",
      "confidence": 0.95,
      "quality": 0.9
    }
  ]
}`;

  const input = batch.map((c) => {
    const msg = c.message.length > MAX_COMMIT_MSG_LEN
      ? c.message.slice(0, MAX_COMMIT_MSG_LEN) + "... (truncated)"
      : c.message;
    
    // 包含代码变更上下文
    let codeContext = "";
    if (c.diffSummary && c.diffSummary.changes.length > 0) {
      codeContext = "\ncode_changes:\n" + c.diffSummary.changes.map(ch => 
        `  file: ${ch.file}\n  added: ${JSON.stringify(ch.added.slice(0, 5))}\n  removed: ${JSON.stringify(ch.removed.slice(0, 3))}`
      ).join("\n");
    }
    
    return `commit_sha: ${c.sha}\nmessage: ${msg}${codeContext}`;
  }).join("\n---\n");

  return { systemPrompt, input };
}

// ============================================================
// 决策分析
// ============================================================

/**
 * 构建分析 prompt (含 few-shot 示例)
 */
function buildAnalysisPrompt(batch) {
  const systemPrompt = `你是一位资深的技术架构师与技术决策分析师，擅长从 Git commit 历史中提取技术决策信息。

你的任务是分析以下 Git commit 记录，提取每个 commit 蕴含的技术决策。

## 分析规则

1. **只提取真正的技术决策**: 跳过纯 bug 修复、格式化、依赖更新等无决策内容的 commit
2. **决策分类**: 为每个决策分配一个类别:
   - "architecture": 架构决策（如分层结构、模块划分、设计模式选择）
   - "tech_choice": 技术选型（如选择某个框架、库、工具）
   - "security": 安全决策（如认证方案、加密策略、权限模型）
   - "performance": 性能优化（如缓存策略、索引优化、懒加载）
   - "data": 数据决策（如数据库设计、数据模型、迁移策略）
   - "api": API 设计（如 RESTful 规范、GraphQL、版本管理）
   - "infra": 基础设施（如部署方案、容器化、CI/CD）
   - "testing": 测试策略（如测试框架选择、覆盖率要求）
   - "other": 其他技术决策

3. **提取字段**:
   - context: 决策的上下文 / 要解决的问题背景
   - decision: 最终采纳的技术决策内容（简洁明确）
   - rejected: 被否决的替代方案（如果没有则 null）
   - constraints: 决策受到的约束条件（如果没有则 null）
   - category: 决策类别（上述之一）
   - confidence: 提取置信度 (0.0-1.0)，1.0 表示 commit 明确表达了决策

4. **如果 commit 不包含技术决策**，将 confidence 设为 0.0，其他字段设为 null

## 输出格式

返回 JSON 对象，格式如下:
{
  "decisions": [
    {
      "commit_sha": "commit 的完整 sha",
      "category": "architecture|tech_choice|security|performance|data|api|infra|testing|other",
      "context": "决策上下文",
      "decision": "决策内容",
      "rejected": null 或 "被否决的方案",
      "constraints": null 或 "约束条件",
      "confidence": 0.0-1.0
    }
  ]
}

## 示例

输入:
commit_sha: abc123
message: refactor: 将用户认证从 session 迁移到 JWT，因为需要支持移动端和第三方应用

输出:
{
  "decisions": [
    {
      "commit_sha": "abc123",
      "category": "security",
      "context": "需要支持移动端和第三方应用的认证",
      "decision": "将用户认证从 session-based 迁移到 JWT",
      "rejected": "session-based 认证",
      "constraints": "需要兼容移动端和第三方应用",
      "confidence": 0.95
    }
  ]
}

输入:
commit_sha: def456
message: fix: 修复登录页面的样式错误

输出:
{
  "decisions": [
    {
      "commit_sha": "def456",
      "category": "other",
      "context": null,
      "decision": null,
      "rejected": null,
      "constraints": null,
      "confidence": 0.0
    }
  ]
}`;

  const input = batch
    .map((c) => {
      // 截断过长的 commit message
      const msg = c.message.length > MAX_COMMIT_MSG_LEN
        ? c.message.slice(0, MAX_COMMIT_MSG_LEN) + "... (truncated)"
        : c.message;
      return `commit_sha: ${c.sha}\nmessage: ${msg}`;
    })
    .join("\n---\n");

  return { systemPrompt, input };
}

/**
 * 调用模型分析一批 commit 的技术决策 (含代码变更上下文)
 */
async function analyzeCommitsBatch(batch) {
  // 为每个 commit 获取代码变更摘要
  const batchWithContext = batch.map(commit => {
    let diffSummary = null;
    try {
      diffSummary = getCommitDiffSummary(commit.sha);
    } catch {
      // 获取 diff 失败不影响主流程
    }
    return { ...commit, diffSummary };
  });

  const { systemPrompt, input } = buildEnhancedPrompt(batchWithContext);

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请分析以下 ${batchWithContext.length} 个 commit:\n\n${input}` },
    ],
    { temperature: 0.2, maxTokens: 4000 }
  );

  const parsed = extractJSON(response);
  const decisions = parsed?.decisions || (Array.isArray(parsed) ? parsed : []);

  // 与原始 commit 关联，补全信息
  return batchWithContext.map((commit) => {
    const matched = decisions.find(
      (d) =>
        d.commit_sha === commit.sha ||
        commit.sha.startsWith(d.commit_sha || "___") ||
        d.commit_sha?.startsWith(commit.sha.slice(0, 8))
    );

    const confidence = matched?.confidence ?? 0;
    const hasDecision = confidence >= 0.5 && matched?.decision;

    return {
      commit_sha: commit.sha,
      timestamp: commit.timestamp,
      author: commit.author,
      category: hasDecision ? (matched.category || "other") : "none",
      context: hasDecision ? (matched.context || "（未能提取决策上下文）") : null,
      decision: hasDecision ? matched.decision : null,
      rejected: hasDecision ? (matched.rejected ?? null) : null,
      constraints: hasDecision ? (matched.constraints ?? null) : null,
      rationale: hasDecision ? (matched.rationale ?? null) : null,
      confidence: confidence,
      quality: hasDecision ? (matched.quality ?? confidence) : 0,
      message: commit.message.split("\n")[0],
    };
  });
}

/**
 * 决策去重: 合并相似的决策记录
 */
function deduplicateDecisions(decisions) {
  const valid = decisions.filter((d) => d.decision && d.confidence >= 0.5);
  const invalid = decisions.filter((d) => !d.decision || d.confidence < 0.5);

  // 简单去重: 决策内容前 50 字符相同视为重复
  const seen = new Map();
  const deduped = [];

  for (const d of valid) {
    const key = (d.decision || "").slice(0, 50).toLowerCase();
    if (seen.has(key)) {
      // 保留置信度更高的
      const existing = seen.get(key);
      if (d.confidence > existing.confidence) {
        const idx = deduped.findIndex((x) => x === existing);
        if (idx >= 0) deduped[idx] = d;
        seen.set(key, d);
      }
    } else {
      seen.set(key, d);
      deduped.push(d);
    }
  }

  // 合并: 有效决策在前，无效在后
  return [...deduped, ...invalid];
}

/**
 * 语义相似度去重: 使用 Jaccard 相似度比较决策内容
 * 比简单的前缀匹配更准确
 */
function semanticDeduplicateDecisions(decisions) {
  const valid = decisions.filter((d) => d.decision && d.confidence >= 0.5);
  const invalid = decisions.filter((d) => !d.decision || d.confidence < 0.5);

  /**
   * 简单词干提取 (Porter 风格简化版)
   * 处理常见英文词尾变化: -ing, -ed, -es, -s, -er, -ly, -tion, -e
   */
  function stem(word) {
    let w = word.toLowerCase();
    // -tion -> -t
    w = w.replace(/tion$/, "t");
    // -ing -> 去掉 (caching -> cach)
    if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
    // -edly -> 去掉
    if (w.length > 5 && w.endsWith("edly")) w = w.slice(0, -4);
    // -ed -> 去掉
    if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
    // -ly -> 去掉
    if (w.length > 4 && w.endsWith("ly")) w = w.slice(0, -2);
    // -er -> 去掉
    if (w.length > 4 && w.endsWith("er")) w = w.slice(0, -2);
    // -es -> 去掉
    if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
    // -s -> 去掉
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    // -e -> 去掉 (cache -> cach, 使其与 caching 词干一致)
    if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
    return w;
  }

  /** 停用词表 (不参与相似度计算) */
  const STOPWORDS = new Set([
    "use", "as", "to", "for", "the", "a", "an", "in", "on", "at", "by", "with",
    "and", "or", "of", "from", "is", "are", "wa", "be", "been", "have", "ha",
    "do", "doe", "did", "will", "would", "could", "should", "may", "might",
    "thi", "that", "the", "it", "it", "we", "you", "they", "he", "she",
    "new", "add", "via", "into", "your", "our", "their",
  ]);

  /** 分词 + 词干提取 + 停用词过滤 */
  function tokenize(text) {
    return new Set(
      text.toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .map((w) => stem(w))
        .filter((w) => !STOPWORDS.has(w) && w.length > 1)
    );
  }

  /**
   * 改进的相似度计算: 结合 Jaccard 和 Overlap 系数
   * Jaccard: |A ∩ B| / |A ∪ B|  — 衡量整体相似度
   * Overlap: |A ∩ B| / min(|A|, |B|)  — 衡量子集关系 (短文本被长文本包含时更有效)
   * 取两者最大值，降低因附加描述导致的相似度稀释
   */
  function similarity(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    const jaccard = intersection / union;
    const overlap = intersection / Math.min(setA.size, setB.size);
    return Math.max(jaccard, overlap);
  }

  const seen = [];
  const deduped = [];

  for (const d of valid) {
    const tokens = tokenize(d.decision || "");
    let isDuplicate = false;
    let duplicateIdx = -1;

    for (let i = 0; i < seen.length; i++) {
      const sim = similarity(tokens, seen[i]);
      if (sim > 0.6) {
        isDuplicate = true;
        duplicateIdx = i;
        break;
      }
    }

    if (isDuplicate) {
      // 保留质量更高的
      const existing = deduped[duplicateIdx];
      const dQuality = d.quality ?? d.confidence;
      const existingQuality = existing.quality ?? existing.confidence;
      if (dQuality > existingQuality) {
        deduped[duplicateIdx] = d;
        seen[duplicateIdx] = tokens;
      }
    } else {
      seen.push(tokens);
      deduped.push(d);
    }
  }

  return [...deduped, ...invalid];
}

/**
 * 降级模式: 当 API 不可用时，使用规则匹配提取简单决策
 */
function fallbackDecisionExtraction(commits) {
  const decisions = [];

  /** 规则匹配模式 (扩展版) */
  const DECISION_PATTERNS = [
    // === 架构决策 ===
    {
      pattern: /(?:refactor|refactoring|migrat\w*|switch\w*\s+to|mov\w+\s+to|chang\w+\s+from)[\s:]+(.+?)(?:\s+(?:to|because|for|since|due to)\s+(.+))?$/i,
      category: "architecture",
      extractDecision: (m) => m[1]?.trim() || "",
    },
    {
      pattern: /(?:decouple|extract|abstract|encapsulat\w*)\s+(.+?)(?:\s+(?:into|from|to)\s+(.+))?$/i,
      category: "architecture",
      extractDecision: (m) => `${m[1]?.trim() || ""}${m[2] ? ` -> ${m[2].trim()}` : ""}`,
    },
    {
      pattern: /(?:introduc\w*|add\w*|implement\w*)\s+(?:the\s+)?(?:layer|pattern|module|service|middleware|plugin|hook|provider)\s+(?:for\s+)?(.+?)$/i,
      category: "architecture",
      extractDecision: (m) => `引入 ${m[1]?.trim() || ""}`,
    },
    // === 技术选型 ===
    {
      pattern: /(?:adopt|integrat\w*|intro\w*|switch\w*\s+to|replac\w*\s+with)\s+(\w+(?:[-.@/]\w+)*)\s*(?:for|as|to|instead of)?/i,
      category: "tech_choice",
      extractDecision: (m) => `采用 ${m[1]}`,
    },
    {
      pattern: /(?:use)\s+(\w+(?:[-.@/]\w+)*)\s+(?:for|as|to)\s/i,
      category: "tech_choice",
      extractDecision: (m) => `使用 ${m[1]}`,
    },
    {
      pattern: /(?:upgrad\w*|bump\w*|update\w*)\s+(\w+(?:[-.@/]\w+)*)\s*(?:to\s+)?v?(\d[\d.]*)?/i,
      category: "tech_choice",
      extractDecision: (m) => `升级 ${m[1]}${m[2] ? ` 至 v${m[2]}` : ""}`,
    },
    // === 性能优化 ===
    {
      pattern: /(?:optimi\w*|improve|speed\s+up|accelerat\w*|cache|memoiz\w*)[\s:]+(.+?)(?:\s+(?:for|because|to)\s+(.+))?$/i,
      category: "performance",
      extractDecision: (m) => m[1]?.trim() || "",
    },
    {
      pattern: /(?:reduc\w*|eliminat\w*|remov\w*|avoid)\s+(.+?)(?:\s+(?:redundant|unnecessary|duplicate)\s+)?(.+)?$/i,
      category: "performance",
      extractDecision: (m) => `减少 ${m[1]?.trim() || ""}`,
    },
    {
      pattern: /(?:lazy\s+load|defer|preload|prefetch|code\s+split|tree\s+shake|bundle\s+size)\w*/i,
      category: "performance",
      extractDecision: (m) => m[0]?.trim() || "性能优化",
    },
    // === 安全决策 ===
    {
      pattern: /(?:secur\w*|auth\w*|encrypt\w*|token\w*|password|sanitiz\w*|validat\w*|verif\w*)[\s:]+(?:updat\w*|chang\w*|fix\w*|improv\w*|add\w*|implement\w*|enforc\w*)\s*(.+)?$/i,
      category: "security",
      extractDecision: (m) => m[1]?.trim() || "安全相关改进",
    },
    {
      pattern: /(?:fix|patch|resolv\w*|address)\s+(?:security|vulnerab\w*|cve|xss|csrf|sqli|injection|exploit)\w*/i,
      category: "security",
      extractDecision: (m) => `修复安全问题: ${m[0]?.trim() || ""}`,
    },
    // === 数据/数据库 ===
    {
      pattern: /(?:schema|migration|database|table|column|index|constraint|foreign\s+key|primary\s+key)[\s:]+(?:add\w*|creat\w*|modif\w*|alter\w*|drop\w*|renam\w*)\s*(.+)?$/i,
      category: "data",
      extractDecision: (m) => m[1]?.trim() || "数据库变更",
    },
    {
      pattern: /(?:add|create|modify|alter|drop)\s+(?:table|column|index|constraint|migration)\s+(.+)/i,
      category: "data",
      extractDecision: (m) => `数据库变更: ${m[1]?.trim() || ""}`,
    },
    // === API 设计 ===
    {
      pattern: /(?:api|endpoint|route|rest|graphql|webhook)[\s:]+(?:add\w*|updat\w*|deprecat\w*|remov\w*|chang\w*|version)\w*\s*(.+)?$/i,
      category: "api",
      extractDecision: (m) => m[1]?.trim() || "API 变更",
    },
    {
      pattern: /(?:version\s+|v)(\d+)\s+(?:api|endpoint|interface)\s+(.+)/i,
      category: "api",
      extractDecision: (m) => `API v${m[1]}: ${m[2]?.trim() || ""}`,
    },
    // === 基础设施 ===
    {
      pattern: /(?:docker|kubernetes|k8s|container|deploy|ci\/cd|pipeline|terraform|ansible|helm)[\s:]+(.+)?$/i,
      category: "infra",
      extractDecision: (m) => m[1]?.trim() || "基础设施变更",
    },
    {
      pattern: /(?:add|updat\w*|configur\w*)\s+(?:docker|k8s|ci|cd|pipeline|workflow|github\s+action)\w*/i,
      category: "infra",
      extractDecision: (m) => m[0]?.trim() || "基础设施配置",
    },
    // === 测试策略 ===
    {
      pattern: /(?:test|spec|coverage|mock|stub|fixture|snapshot|e2e|integration\s+test)[\s:]+(?:add\w*|updat\w*|improv\w*|increas\w*|fix\w*)\s*(.+)?$/i,
      category: "testing",
      extractDecision: (m) => m[1]?.trim() || "测试改进",
    },
    // === 通用功能决策 (可能包含架构决策) ===
    {
      pattern: /^(?:feat|feature|add|implement|support)[\s:]+(.+?)(?:\s+(?:to|for|in|using|with)\s+(.+))?$/i,
      category: "other",
      extractDecision: (m) => {
        const feature = m[1]?.trim() || "";
        const context = m[2]?.trim();
        return context ? `${feature} (使用 ${context})` : feature;
      },
    },
  ];

  /** Conventional commit 类型到决策类别的映射 */
  const CONVENTIONAL_MAP = {
    "feat": "other",
    "fix": "other",
    "refactor": "architecture",
    "perf": "performance",
    "security": "security",
    "docs": null,      // 文档不提取决策
    "style": null,     // 格式不提取决策
    "test": "testing",
    "build": "infra",
    "ci": "infra",
    "chore": null,
  };

  /** 支持通用提取的 commit 类型 (其他类型只在匹配到具体模式时才提取) */
  const GENERIC_EXTRACTION_TYPES = new Set(["feat", "refactor"]);

  /** 琐碎提交描述关键词 (不提取决策) */
  const TRIVIAL_KEYWORDS = ["typo", "spelling", "grammar", "whitespace", "format", "lint", "import order", "semicolon"];

  for (const commit of commits) {
    const firstLine = commit.message.split("\n")[0];
    let extracted = null;
    let skipExtraction = false; // Conventional Commit 明确跳过的类型 (chore, docs, style 等)

    // 1. 尝试 Conventional Commit 格式: type(scope): description
    const convMatch = firstLine.match(/^(\w+)(?:\(([^)]+)\))?\s*[:：]\s*(.+)$/);
    if (convMatch) {
      const [, type, scope, description] = convMatch;
      const category = CONVENTIONAL_MAP[type.toLowerCase()];

      if (category === null) {
        // 明确不需要提取决策的类型 (chore, docs, style)
        skipExtraction = true;
      } else if (category !== undefined) {
        // 检查是否为琐碎提交
        const isTrivial = TRIVIAL_KEYWORDS.some(kw => description.toLowerCase().includes(kw));

        if (!isTrivial) {
          // 尝试从描述中提取决策
          for (const rule of DECISION_PATTERNS) {
            const match = description.match(rule.pattern);
            if (match) {
              extracted = {
                category: rule.category !== "other" ? rule.category : category,
                decision: rule.extractDecision(match),
                confidence: 0.6,
              };
              break;
            }
          }

          // 如果没有匹配到具体模式，且类型支持通用提取，使用通用提取
          if (!extracted && GENERIC_EXTRACTION_TYPES.has(type.toLowerCase()) && description.length > 10) {
            extracted = {
              category,
              decision: scope ? `${scope}: ${description}` : description,
              confidence: 0.5,
            };
          }
        }
      }
    }

    // 2. 如果 Conventional Commit 未匹配且未明确跳过，尝试所有模式
    if (!extracted && !skipExtraction) {
      for (const rule of DECISION_PATTERNS) {
        const match = firstLine.match(rule.pattern);
        if (match) {
          extracted = {
            category: rule.category,
            decision: rule.extractDecision(match),
            confidence: 0.5,
          };
          break;
        }
      }
    }

    // 3. 尝试从 commit body 中提取更多上下文
    let rationale = null;
    const bodyLines = commit.message.split("\n").slice(1).filter(l => l.trim());
    for (const line of bodyLines) {
      // 查找理由相关的内容
      if (/^(?:because|since|due to|reason|rationale|why|为了|因为|由于)[:：\s]/i.test(line.trim())) {
        rationale = line.trim().replace(/^(?:because|since|due to|reason|rationale|why|为了|因为|由于)[:：\s]*/i, "");
        break;
      }
    }

    decisions.push({
      commit_sha: commit.sha,
      timestamp: commit.timestamp,
      author: commit.author,
      category: extracted?.category || "none",
      context: extracted ? (rationale ? `（降级模式）${rationale}` : "（降级模式提取）") : null,
      decision: extracted?.decision || null,
      rejected: null,
      constraints: null,
      rationale: rationale || null,
      confidence: extracted ? (rationale ? Math.min(extracted.confidence + 0.1, 0.7) : extracted.confidence) : 0,
      quality: extracted ? (rationale ? 0.5 : 0.4) : 0,
      message: firstLine,
    });
  }

  return decisions;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("========================================");
  console.log(" Agent Forge - Lore 决策提取脚本 v2.0");
  console.log(" 智能技术决策分析引擎");
  console.log("========================================");

  const isRepo = git("rev-parse --is-inside-work-tree").trim();
  if (isRepo !== "true") {
    console.error("错误: 当前目录不是 git 仓库");
    process.exit(1);
  }

  console.log("\n[1/4] 获取 git commit 历史 ...");
  const allCommits = getCommits();
  console.log(`  共获取 ${allCommits.length} 条 commit 记录`);

  if (allCommits.length === 0) {
    console.warn("  没有提交记录，生成空文件");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, "", "utf8");
    return;
  }

  console.log("\n[2/4] 智能预过滤: 分类 commit ...");
  const filtered = [];
  const skipped = { merge: 0, revert: 0, format: 0, typo: 0, ci: 0, dependency: 0, docs: 0, chore: 0 };

  for (const commit of allCommits) {
    const { category, shouldAnalyze, reason } = classifyCommit(commit.message);
    if (shouldAnalyze) {
      filtered.push(commit);
    } else {
      skipped[category] = (skipped[category] || 0) + 1;
    }
  }

  console.log(`  过滤后剩余 ${filtered.length}/${allCommits.length} 条 commit 需要分析`);
  console.log(`  跳过: 合并=${skipped.merge} 回滚=${skipped.revert} 格式化=${skipped.format} 拼写=${skipped.typo} CI=${skipped.ci} 依赖=${skipped.dependency} 文档=${skipped.docs} 杂项=${skipped.chore}`);

  if (filtered.length === 0) {
    console.warn("  过滤后无 commit 需要分析，生成空文件");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, "", "utf8");
    return;
  }

  console.log(`\n[3/4] 调用 GitHub Models 分析技术决策 (每批 ${BATCH_SIZE} 条) ...`);
  const allDecisions = [];
  let usingFallback = false;
  let analyzedCount = 0;
  let decisionCount = 0;

  // 检查 API 是否可用
  if (!GITHUB_TOKEN) {
    console.warn("  ⚠ GITHUB_TOKEN 未设置，使用降级模式 (规则匹配) ...");
    usingFallback = true;
    const fallbackDecisions = fallbackDecisionExtraction(filtered);
    allDecisions.push(...fallbackDecisions);
    console.log(`  降级模式提取完成: ${fallbackDecisions.filter(d => d.decision).length} 条可能决策`);
  } else {
    const batches = [];
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
      batches.push(filtered.slice(i, i + BATCH_SIZE));
    }

    let consecutiveFailures = 0;

    for (let i = 0; i < batches.length; i++) {
      console.log(`  [${i + 1}/${batches.length}] 分析 ${batches[i].length} 条 commit (含代码变更上下文) ...`);
      try {
        const decisions = await analyzeCommitsBatch(batches[i]);
        allDecisions.push(...decisions);
        analyzedCount += decisions.length;
        const batchDecisions = decisions.filter((d) => d.decision && d.confidence >= 0.5);
        decisionCount += batchDecisions.length;
        consecutiveFailures = 0;
        console.log(`    完成，提取到 ${batchDecisions.length}/${decisions.length} 条有效决策`);
      } catch (err) {
        consecutiveFailures++;
        console.warn(`    该批次分析失败: ${err.message}`);
        
        // 连续失败 3 次，切换到降级模式
        if (consecutiveFailures >= 3) {
          console.warn(`  ⚠ 连续 ${consecutiveFailures} 次失败，切换到降级模式 ...`);
          usingFallback = true;
          const remainingCommits = batches.slice(i).flat();
          const fallbackDecisions = fallbackDecisionExtraction(remainingCommits);
          allDecisions.push(...fallbackDecisions);
          console.log(`  降级模式提取: ${fallbackDecisions.filter(d => d.decision).length} 条可能决策`);
          break;
        }

        // 记录失败但继续
        for (const commit of batches[i]) {
          allDecisions.push({
            commit_sha: commit.sha,
            timestamp: commit.timestamp,
            author: commit.author,
            category: "error",
            context: null,
            decision: null,
            rejected: null,
            constraints: null,
            rationale: null,
            confidence: 0,
            quality: 0,
            message: commit.message.split("\n")[0],
          });
        }
      }
    }

    if (!usingFallback) {
      console.log(`\n  分析完成: ${analyzedCount} 条 commit，提取到 ${decisionCount} 条有效决策`);
    }
  }

  console.log("\n[4/4] 决策去重并写入 .lore/decisions.jsonl ...");

  // 去重
  const deduped = usingFallback 
    ? deduplicateDecisions(allDecisions) 
    : semanticDeduplicateDecisions(allDecisions);
  const finalDecisionCount = deduped.filter((d) => d.decision && d.confidence >= 0.5).length;
  console.log(`  去重后: ${finalDecisionCount} 条有效决策`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonlContent = deduped.map((d) => JSON.stringify(d)).join("\n") + "\n";
  fs.writeFileSync(OUTPUT_FILE, jsonlContent, "utf8");

  // 统计分类分布
  const categoryStats = {};
  for (const d of deduped) {
    if (d.confidence >= 0.5) {
      categoryStats[d.category] = (categoryStats[d.category] || 0) + 1;
    }
  }

  // 质量统计
  const qualityStats = { high: 0, medium: 0, low: 0 };
  for (const d of deduped) {
    if (d.confidence >= 0.5) {
      const q = d.quality ?? d.confidence;
      if (q >= 0.8) qualityStats.high++;
      else if (q >= 0.5) qualityStats.medium++;
      else qualityStats.low++;
    }
  }

  console.log("\n========================================");
  console.log(" Lore 决策提取完成！v2.0");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`总 commit 数: ${allCommits.length}`);
  console.log(`分析 commit 数: ${analyzedCount}`);
  console.log(`有效决策数: ${finalDecisionCount}`);
  console.log(`决策去重数: ${allDecisions.filter((d) => d.decision && d.confidence >= 0.5).length - finalDecisionCount}`);

  if (Object.keys(categoryStats).length > 0) {
    console.log("\n决策分类分布:");
    for (const [cat, count] of Object.entries(categoryStats).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count} 条`);
    }
  }

  // 输出示例预览
  const firstDecision = deduped.find((d) => d.decision && d.confidence >= 0.5);
  if (firstDecision) {
    console.log("\n示例决策:");
    console.log(`  commit: ${firstDecision.commit_sha.slice(0, 8)}`);
    console.log(`  分类: ${firstDecision.category}`);
    console.log(`  决策: ${firstDecision.decision}`);
    console.log(`  置信度: ${firstDecision.confidence}`);
  }

  console.log(`决策质量: 高=${qualityStats.high} 中=${qualityStats.medium} 低=${qualityStats.low}`);
  if (usingFallback) {
    console.log("⚠ 本次分析使用降级模式 (规则匹配)，建议配置 GITHUB_TOKEN 获取更准确的结果");
  }
}

main().catch((err) => {
  console.error("\n决策提取失败:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
