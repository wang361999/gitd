/**
 * scripts/run-lore.js
 * 决策提取脚本：获取 git log 所有 commit messages，调用 GitHub Models 分析
 * 每个 commit 蕴含的技术决策，输出 JSONL 决策记录。
 *
 * 输出: .lore/decisions.jsonl （每行一个 JSON 对象）
 *   { "commit_sha": "...", "timestamp": "...", "author": "...",
 *     "context": "...", "decision": "...", "rejected": null, "constraints": null,
 *     "message": "原始 commit message" }
 *
 * 环境变量:
 *   GITHUB_TOKEN - GitHub Token，用于调用 GitHub Models API
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const MODEL = "gpt-4o";
const MIN_INTERVAL_MS = 4200; // 速率限制

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".lore");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "decisions.jsonl");

/** 每批分析的 commit 数量 */
const BATCH_SIZE = 5;

let lastRequestTime = 0;

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

/** 调用 GitHub Models 进行推理 */
async function chatCompletion(messages, options = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error("环境变量 GITHUB_TOKEN 未设置，无法调用 GitHub Models API");
  }

  const maxTokens = options.maxTokens || 4000;
  const temperature = options.temperature ?? 0.3;

  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    lastRequestTime = Date.now();

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
      console.warn("  [模型调用] 触发速率限制，等待 10 秒后重试 ...");
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
    return data.choices?.[0]?.message?.content || "";
  }
  throw new Error("模型调用重试 3 次后仍然失败");
}

/** 从模型返回中提取 JSON 数组 */
function extractJSONArray(text) {
  if (!text) return [];
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1].trim());
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      /* 忽略 */
    }
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      /* 忽略 */
    }
  }
  return [];
}

/** 获取所有 commit 信息 */
function getCommits() {
  // 格式: <sha>\t<author>\t<timestamp>\t<message>
  const format = "%H%x09%an%x09%aI%x09%B%x1e"; // 用 \x1e 分隔每条记录
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

/**
 * 调用模型分析一批 commit 的技术决策
 */
async function analyzeCommitsBatch(batch) {
  const systemPrompt = `你是一位资深的技术架构师与技术决策分析师。
请分析下面这批 Git commit 记录，提取每个 commit 蕴含的技术决策信息。

对于每个 commit，判断：
- context: 决策的上下文 / 要解决的问题背景
- decision: 最终采纳的技术决策内容
- rejected: 被否决的替代方案（如果没有则返回 null）
- constraints: 决策受到的约束条件（如果没有则返回 null）

只返回 JSON 数组，不要包含任何解释文字或 markdown 标记。每个元素结构如下：
{
  "commit_sha": "该 commit 的 sha",
  "context": "...",
  "decision": "...",
  "rejected": null 或 "...",
  "constraints": null 或 "..."
}`;

  const input = batch
    .map((c) => `commit_sha: ${c.sha}\nmessage: ${c.message}`)
    .join("\n---\n");

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    { temperature: 0.3, maxTokens: 4000 }
  );

  const decisions = extractJSONArray(response);

  // 与原始 commit 关联，补全信息
  return batch.map((commit) => {
    const matched = decisions.find(
      (d) => d.commit_sha === commit.sha || commit.sha.startsWith(d.commit_sha || "___")
    );
    return {
      commit_sha: commit.sha,
      timestamp: commit.timestamp,
      author: commit.author,
      context: matched?.context || "（未能提取决策上下文）",
      decision: matched?.decision || "（未能提取决策内容）",
      rejected: matched?.rejected ?? null,
      constraints: matched?.constraints ?? null,
      message: commit.message,
    };
  });
}

/** 主流程 */
async function main() {
  console.log("========================================");
  console.log(" Agent Forge - Lore 决策提取脚本");
  console.log("========================================");

  const isRepo = git("rev-parse --is-inside-work-tree").trim();
  if (isRepo !== "true") {
    console.error("错误: 当前目录不是 git 仓库");
    process.exit(1);
  }

  console.log("\n[1/3] 获取 git commit 历史 ...");
  const commits = getCommits();
  console.log(`  共获取 ${commits.length} 条 commit 记录`);

  if (commits.length === 0) {
    console.warn("  没有提交记录，生成空文件");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, "", "utf8");
    return;
  }

  console.log(`\n[2/3] 调用 GitHub Models 分析技术决策 (每批 ${BATCH_SIZE} 条) ...`);
  const allDecisions = [];
  const batches = [];
  for (let i = 0; i < commits.length; i += BATCH_SIZE) {
    batches.push(commits.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    console.log(`  [${i + 1}/${batches.length}] 分析 ${batches[i].length} 条 commit ...`);
    try {
      const decisions = await analyzeCommitsBatch(batches[i]);
      allDecisions.push(...decisions);
      console.log(`    完成，提取到 ${decisions.length} 条决策`);
    } catch (err) {
      console.warn(`    该批次分析失败: ${err.message}`);
      // 失败时仍写入占位记录，保留 commit 信息
      for (const commit of batches[i]) {
        allDecisions.push({
          commit_sha: commit.sha,
          timestamp: commit.timestamp,
          author: commit.author,
          context: "（分析失败）",
          decision: "（分析失败）",
          rejected: null,
          constraints: null,
          message: commit.message,
        });
      }
    }
  }

  console.log(`\n[3/3] 写入 .lore/decisions.jsonl ...`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonlContent = allDecisions.map((d) => JSON.stringify(d)).join("\n") + "\n";
  fs.writeFileSync(OUTPUT_FILE, jsonlContent, "utf8");

  console.log("\n========================================");
  console.log(" Lore 决策提取完成！");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`决策记录: ${allDecisions.length} 条`);

  // 输出示例预览
  if (allDecisions.length > 0) {
    console.log("\n示例决策:");
    console.log(`  commit: ${allDecisions[0].commit_sha.slice(0, 8)}`);
    console.log(`  决策: ${allDecisions[0].decision}`);
  }
}

main().catch((err) => {
  console.error("\n决策提取失败:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
