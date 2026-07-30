/**
 * scripts/run-provenance.js
 * 溯源脚本：扫描仓库所有文件，通过 git blame 分析每行代码来源，
 * 根据 commit message 中的 [AI:model_name] 标记判断 AI 还是人类编写。
 *
 * 输出: .forge/provenance.json
 *   {
 *     "generatedAt": "ISO 时间",
 *     "summary": { "totalFiles": N, "totalLines": N, "aiLines": N, "humanLines": N },
 *     "files": [
 *       { "path": "...", "lines": [
 *         { "line": 1, "author": "...", "model": "gpt-4o|null", "commitSha": "...", "timestamp": "...", "source": "ai|human" }
 *       ] }
 *     ]
 *   }
 *
 * 环境变量: 无强制要求
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".forge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "provenance.json");

/** 需要跳过的目录 */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  ".forge",
  ".lore",
  "release-artifacts",
]);

/** 需要跳过的文件扩展名（二进制 / 产物） */
const SKIP_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".lock",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
]);

const MAX_FILE_LINES = 5000; // 单文件最大分析行数，防止过大文件

/** 执行 git 命令 */
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

/** 判断是否为文本文件 */
function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTS.has(ext)) return false;
  try {
    const buf = fs.readFileSync(filePath);
    // 含 NULL 字节视为二进制
    if (buf.indexOf(0) !== -1) return false;
    return true;
  } catch {
    return false;
  }
}

/** 递归遍历目录，收集所有文本文件 */
function collectFiles(dir, base = dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectFiles(fullPath, base));
    } else if (entry.isFile()) {
      if (isTextFile(fullPath)) {
        results.push(relPath);
      }
    }
  }
  return results;
}

/**
 * 解析 git blame 输出，提取每行的作者、commit、时间戳
 * 使用 --line-porcelain 格式便于解析
 */
function blameFile(filePath) {
  const output = git(`blame --line-porcelain -w -M -C -- "${filePath}"`);
  if (!output) return [];

  const lines = output.split("\n");
  const result = [];

  let currentLine = null;
  let lineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 行头格式: <sha> <orig-line> <final-line> [<num-lines>]
    const headerMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/);
    if (headerMatch) {
      // 保存上一行
      if (currentLine) result.push(currentLine);

      lineNumber = parseInt(headerMatch[3], 10);
      currentLine = {
        line: lineNumber,
        author: null,
        authorMail: null,
        authorTime: null,
        commitSha: headerMatch[1],
        summary: null,
      };
      continue;
    }

    if (!currentLine) continue;

    if (line.startsWith("author ")) {
      currentLine.author = line.slice(7);
    } else if (line.startsWith("author-mail ")) {
      currentLine.authorMail = line.slice(12);
    } else if (line.startsWith("author-time ")) {
      const ts = parseInt(line.slice(12), 10);
      currentLine.authorTime = ts
        ? new Date(ts * 1000).toISOString()
        : null;
    } else if (line.startsWith("summary ")) {
      currentLine.summary = line.slice(8);
    }
  }
  if (currentLine) result.push(currentLine);

  return result;
}

/**
 * 构建 commit sha -> { isAI, model } 的映射缓存
 * 通过解析 commit message 中的 [AI:model_name] 标记判断
 */
function buildCommitCache(shas) {
  const cache = new Map();
  const unique = [...new Set(shas)].filter(Boolean);

  console.log(`  构建 commit 缓存，共 ${unique.length} 个唯一 commit ...`);

  for (const sha of unique) {
    // 用简短 sha 查询 message
    const shortSha = sha.slice(0, 12);
    const message = git(`log -1 --format=%B ${shortSha}`);
    if (!message) {
      cache.set(sha, { isAI: false, model: null });
      continue;
    }
    const match = message.match(/\[AI:([^\]]+)\]/);
    if (match) {
      cache.set(sha, { isAI: true, model: match[1].trim() });
    } else {
      cache.set(sha, { isAI: false, model: null });
    }
  }

  return cache;
}

/** 主流程 */
function main() {
  console.log("========================================");
  console.log(" Agent Forge - 溯源扫描脚本");
  console.log("========================================");

  // 检查是否为 git 仓库
  const isRepo = git("rev-parse --is-inside-work-tree").trim();
  if (isRepo !== "true") {
    console.error("错误: 当前目录不是 git 仓库");
    process.exit(1);
  }

  console.log("\n[1/4] 收集仓库文件 ...");
  const files = collectFiles(ROOT);
  console.log(`  共发现 ${files.length} 个文本文件`);

  console.log("\n[2/4] 对每个文件执行 git blame ...");
  const fileResults = [];
  let totalLines = 0;
  const allShas = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    process.stdout.write(`  [${i + 1}/${files.length}] ${file} ... `);

    // 限制行数
    const lineCount = countLines(file);
    if (lineCount > MAX_FILE_LINES) {
      console.log(`跳过 (行数 ${lineCount} 超过上限 ${MAX_FILE_LINES})`);
      continue;
    }

    const blameLines = blameFile(file);
    if (blameLines.length === 0) {
      console.log("(无 blame 数据)");
      continue;
    }

    for (const bl of blameLines) {
      allShas.push(bl.commitSha);
    }

    fileResults.push({ path: file, blameLines });
    totalLines += blameLines.length;
    console.log(`${blameLines.length} 行`);
  }

  console.log(`\n  共分析 ${totalLines} 行代码`);

  console.log("\n[3/4] 构建 commit 标记缓存，判定 AI / 人类来源 ...");
  const commitCache = buildCommitCache(allShas);

  let aiLines = 0;
  let humanLines = 0;

  console.log("\n[4/4] 聚合溯源结果并写入 .forge/provenance.json ...");
  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: fileResults.length,
      totalLines,
      aiLines: 0,
      humanLines: 0,
    },
    files: fileResults.map((fr) => ({
      path: fr.path,
      lines: fr.blameLines.map((bl) => {
        const info = commitCache.get(bl.commitSha) || { isAI: false, model: null };
        if (info.isAI) aiLines++;
        else humanLines++;
        return {
          line: bl.line,
          author: bl.author,
          model: info.isAI ? info.model : null,
          commitSha: bl.commitSha,
          timestamp: bl.authorTime,
          source: info.isAI ? "ai" : "human",
        };
      }),
    })),
  };

  output.summary.aiLines = aiLines;
  output.summary.humanLines = humanLines;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log("\n========================================");
  console.log(" 溯源扫描完成！");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`文件总数: ${output.summary.totalFiles}`);
  console.log(`代码总行数: ${output.summary.totalLines}`);
  console.log(`AI 生成行数: ${output.summary.aiLines} (${pct(aiLines, totalLines)}%)`);
  console.log(`人类编写行数: ${output.summary.humanLines} (${pct(humanLines, totalLines)}%)`);
}

/** 计算文件行数 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

/** 计算百分比 */
function pct(part, total) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

main();
