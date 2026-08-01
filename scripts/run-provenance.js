/**
 * scripts/run-provenance.js
 * 溯源脚本 v2.0：多信号 AI 代码来源识别引擎
 *
 * 增强能力:
 *   - 多维度 AI 检测: commit message 标记、Co-Authored-By、AI 作者模式、文件内容特征
 *   - 支持 GitHub Copilot, Cursor, Claude Code, Codeium, ChatGPT 等主流 AI 编程工具
 *   - 置信度评分: 每行代码附带 AI 归属置信度 (0.0-1.0)
 *   - .gitignore 感知: 自动跳过 gitignore 排除的文件
 *   - 增量缓存: 支持增量分析，避免重复 git blame
 *   - 文件级 AI 比例分析
 *   - 作者维度统计
 *
 * 输出: .forge/provenance.json
 *   {
 *     "generatedAt": "ISO 时间",
 *     "version": "2.0",
 *     "summary": {
 *       "totalFiles": N, "totalLines": N, "aiLines": N, "humanLines": N,
 *       "aiRatio": F, "confidence": { "high": N, "medium": N, "low": N }
 *     },
 *     "authors": [{ "name": "...", "commits": N, "aiCommits": N, "humanCommits": N }],
 *     "models": [{ "name": "...", "lines": N, "commits": N }],
 *     "files": [
 *       { "path": "...", "aiRatio": F, "lines": [
 *         { "line": 1, "author": "...", "model": "...|null", "commitSha": "...",
 *           "timestamp": "...", "source": "ai|human", "confidence": F, "signals": [...] }
 *       ] }
 *     ]
 *   }
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".forge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "provenance.json");
const CACHE_FILE = path.join(OUTPUT_DIR, "provenance-cache.json");

// ============================================================
// 增量缓存管理
// ============================================================

/** 读取上次运行的缓存 */
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    // 验证缓存版本
    if (data.version !== "2.0") return null;
    // 检查 HEAD 是否变化
    const currentHead = git("rev-parse HEAD").trim();
    if (data.headCommit === currentHead) {
      console.log("  HEAD 未变化，使用缓存数据");
      return data;
    }
    // 检查是否有增量变化
    const changedFiles = git(`diff --name-only ${data.headCommit}..HEAD`).trim();
    if (!changedFiles) {
      console.log("  无文件变更，使用缓存数据");
      return data;
    }
    data.changedFiles = changedFiles.split("\n").filter(Boolean);
    console.log(`  检测到 ${data.changedFiles.length} 个变更文件，使用增量分析`);
    return data;
  } catch {
    return null;
  }
}

/** 保存缓存 */
function saveCache(data) {
  try {
    const cacheData = {
      version: "2.0",
      headCommit: git("rev-parse HEAD").trim(),
      savedAt: new Date().toISOString(),
      ...data,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), "utf8");
  } catch (err) {
    console.warn(`  缓存保存失败: ${err.message}`);
  }
}

// ============================================================
// 配置
// ============================================================

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
  "forge-scripts",
  ".vercel",
  ".turbo",
  "coverage",
  ".nuxt",
  ".output",
  "__pycache__",
  ".pytest_cache",
  "vendor",
]);

/** 需要跳过的文件扩展名 */
const SKIP_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".gz", ".tar", ".7z", ".rar",
  ".lock", ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".mp3", ".wav", ".avi", ".mov",
  ".bin", ".exe", ".dll", ".so", ".dylib", ".class",
  ".wasm", ".jar", ".war",
  ".min.js", ".min.css",
]);

const MAX_FILE_LINES = 10000;

// ============================================================
// AI 检测信号引擎
// ============================================================

/**
 * AI 编程工具检测信号配置
 * 每个信号有独立的权重，多个信号叠加提升置信度
 */
const AI_SIGNALS = {
  // 强信号: commit message 中的显式 AI 标记
  COMMIT_TAG: { weight: 0.95, name: "commit_tag" },
  // 强信号: Co-Authored-By 中的 AI 工具
  CO_AUTHOR_AI: { weight: 0.90, name: "co_author_ai" },
  // 中信号: 作者名匹配已知 AI 工具/机器人
  AI_AUTHOR: { weight: 0.75, name: "ai_author" },
  // 中信号: commit message 含 AI 生成特征词
  COMMIT_PATTERN: { weight: 0.60, name: "commit_pattern" },
  // 弱信号: 邮箱匹配已知 AI 服务
  AI_EMAIL: { weight: 0.55, name: "ai_email" },
};

/**
 * 已知 AI 编程工具标识
 */
const AI_TOOLS = {
  "github-copilot": {
    names: ["GitHub Copilot", "copilot", "Copilot"],
    emails: ["copilot@github.com", "noreply@github.com"],
    coAuthorPatterns: [/GitHub\s*Copilot/i, /copilot/i],
    commitPatterns: [/Co-Authored-By.*[Cc]opilot/i],
  },
  "cursor": {
    names: ["Cursor", "Cursor AI", "cursor-ai"],
    emails: ["cursor@cursor.com", "ai@cursor.sh"],
    coAuthorPatterns: [/Cursor/i],
    commitPatterns: [/Generated\s+(?:with|by|using)\s+Cursor/i, /Co-Authored-By.*Cursor/i],
  },
  "claude-code": {
    names: ["Claude", "Claude Code", "Anthropic Claude"],
    emails: ["noreply@anthropic.com", "claude@anthropic.com"],
    coAuthorPatterns: [/Claude/i, /Anthropic/i],
    commitPatterns: [/Co-Authored-By.*Claude/i, /Generated\s+(?:with|by)\s+Claude/i],
  },
  "chatgpt": {
    names: ["ChatGPT", "GPT-4", "GPT-4o", "OpenAI"],
    emails: ["noreply@openai.com"],
    coAuthorPatterns: [/ChatGPT/i, /OpenAI/i],
    commitPatterns: [/Co-Authored-By.*ChatGPT/i, /Generated\s+(?:with|by)\s+(?:ChatGPT|GPT)/i],
  },
  "codeium": {
    names: ["Codeium"],
    emails: ["noreply@codeium.com"],
    coAuthorPatterns: [/Codeium/i],
    commitPatterns: [/Co-Authored-By.*Codeium/i],
  },
  "jetbrains-ai": {
    names: ["JetBrains AI", "AI Assistant"],
    emails: [],
    coAuthorPatterns: [/JetBrains\s*AI/i, /AI\s*Assistant/i],
    commitPatterns: [/Co-Authored-By.*JetBrains/i],
  },
  "tabnine": {
    names: ["Tabnine"],
    emails: ["noreply@tabnine.com"],
    coAuthorPatterns: [/Tabnine/i],
    commitPatterns: [/Co-Authored-By.*Tabnine/i],
  },
  "amazon-q": {
    names: ["Amazon Q", "AWS Q Developer", "CodeWhisperer"],
    emails: [],
    coAuthorPatterns: [/Amazon\s*Q/i, /CodeWhisperer/i],
    commitPatterns: [/Co-Authored-By.*Amazon\s*Q/i, /Generated\s+by\s+CodeWhisperer/i],
  },
  "windsurf": {
    names: ["Windsurf", "Windsurf AI"],
    emails: [],
    coAuthorPatterns: [/Windsurf/i],
    commitPatterns: [/Generated\s+(?:with|by)\s+Windsurf/i, /Co-Authored-By.*Windsurf/i],
  },
  "aider": {
    names: ["Aider", "aider-ai"],
    emails: [],
    coAuthorPatterns: [/Aider/i],
    commitPatterns: [/Co-Authored-By.*Aider/i, /Generated\s+with\s+Aider/i],
  },
  "cline": {
    names: ["Cline", "Claude Dev"],
    emails: [],
    coAuthorPatterns: [/Cline/i, /Claude\s*Dev/i],
    commitPatterns: [/Co-Authored-By.*Cline/i],
  },
  "continue": {
    names: ["Continue", "Continue AI"],
    emails: [],
    coAuthorPatterns: [/Continue/i],
    commitPatterns: [/Co-Authored-By.*Continue/i],
  },
  "cody": {
    names: ["Cody", "Sourcegraph Cody"],
    emails: ["noreply@sourcegraph.com"],
    coAuthorPatterns: [/Cody/i, /Sourcegraph/i],
    commitPatterns: [/Co-Authored-By.*Cody/i],
  },
  "gemini": {
    names: ["Gemini", "Google Gemini", "Gemini Code Assist"],
    emails: ["noreply@google.com"],
    coAuthorPatterns: [/Gemini/i],
    commitPatterns: [/Co-Authored-By.*Gemini/i, /Generated\s+(?:with|by)\s+Gemini/i],
  },
  "deepseek": {
    names: ["DeepSeek", "DeepSeek Coder"],
    emails: [],
    coAuthorPatterns: [/DeepSeek/i],
    commitPatterns: [/Co-Authored-By.*DeepSeek/i],
  },
  "codey": {
    names: ["Codey", "Google Codey"],
    emails: [],
    coAuthorPatterns: [/Codey/i],
    commitPatterns: [/Co-Authored-By.*Codey/i],
  },
};

/** AI 生成的 commit message 特征模式 */
const AI_COMMIT_PATTERNS = [
  /\[AI:/i,
  /\[Generated/i,
  /\[Copilot/i,
  /Generated\s+(?:by|with|using)\s+(?:AI|Copilot|Cursor|Claude|GPT|ChatGPT)/i,
  /AI[-_\s]generated/i,
  /Co-Authored-By.*(?:AI|Copilot|Cursor|Claude|GPT|ChatGPT|Codeium|Tabnine)/i,
  /🤖/, // 机器人 emoji
  /AI[-_\s]assisted/i,
  /Generated\s+(?:by|with|using)\s+(?:Windsurf|Aider|Cline|Continue|Cody|Gemini|DeepSeek)/i,
  /Co-Authored-By.*(?:Windsurf|Aider|Cline|Continue|Cody|Gemini|DeepSeek|Codey)/i,
  /AI[-_\s]coded/i,
  /🤖.*(?:generated|wrote|created)/i,
];

/** 已知的 AI 机器人作者名 */
const AI_AUTHOR_NAMES = [
  "copilot", "github-copilot", "cursor", "claude", "chatgpt",
  "codeium", "tabnine", "codewhisperer", "amazon-q",
  "ai-assistant", "ai-bot", "devbot", "codebot",
  "windsurf", "aider", "cline", "continue", "cody", "gemini", "deepseek", "codey", "gemini-code-assist",
];

// ============================================================
// 工具函数
// ============================================================

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

/** 获取 .gitignore 排除的文件模式 */
function getGitignorePatterns() {
  const gitignorePath = path.join(ROOT, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];

  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    return content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/** 检查文件路径是否被 gitignore 排除 */
function isGitignored(filePath) {
  // 使用 git check-ignore 一次性检查
  try {
    const result = execSync(`git check-ignore "${filePath}"`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/** 判断是否为文本文件 */
function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTS.has(ext)) return false;

  // 跳过 min.js / min.css
  if (/\.(min\.js|min\.css)$/.test(filePath)) return false;

  try {
    const buf = fs.readFileSync(filePath);
    if (buf.indexOf(0) !== -1) return false; // 含 NULL 字节视为二进制
    // 检查文件头是否为已知二进制格式
    if (buf.length > 4) {
      const header = buf.slice(0, 4);
      // ZIP, PNG, JPEG, GIF, PDF 等魔数
      if (header[0] === 0x50 && header[1] === 0x4b) return false; // PK (zip)
      if (header[0] === 0x89 && header[1] === 0x50) return false; // PNG
      if (header[0] === 0xff && header[1] === 0xd8) return false; // JPEG
    }
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

// ============================================================
// 多信号 AI 检测引擎
// ============================================================

/**
 * 分析单个 commit 的 AI 来源信号
 * 返回 { isAI, model, confidence, signals }
 */
function analyzeCommitAI(message, author, authorMail) {
  const signals = [];
  let model = null;
  let confidence = 0;

  // 信号 1: commit message 中的 [AI:model] 标记
  const tagMatch = message.match(/\[AI:([^\]]+)\]/i);
  if (tagMatch) {
    model = tagMatch[1].trim();
    signals.push({ signal: AI_SIGNALS.COMMIT_TAG.name, weight: AI_SIGNALS.COMMIT_TAG.weight });
    confidence = Math.max(confidence, AI_SIGNALS.COMMIT_TAG.weight);
  }

  // 信号 2: Co-Authored-By 中的 AI 工具
  const coAuthorLines = message.match(/Co-Authored-By:.*$/gmi) || [];
  for (const line of coAuthorLines) {
    for (const [toolId, tool] of Object.entries(AI_TOOLS)) {
      for (const pattern of tool.coAuthorPatterns) {
        if (pattern.test(line)) {
          if (!model) model = toolId;
          signals.push({ signal: AI_SIGNALS.CO_AUTHOR_AI.name, weight: AI_SIGNALS.CO_AUTHOR_AI.weight, tool: toolId });
          confidence = Math.max(confidence, AI_SIGNALS.CO_AUTHOR_AI.weight);
        }
      }
    }
  }

  // 信号 3: commit message 匹配 AI 生成模式
  for (const pattern of AI_COMMIT_PATTERNS) {
    if (pattern.test(message)) {
      signals.push({ signal: AI_SIGNALS.COMMIT_PATTERN.name, weight: AI_SIGNALS.COMMIT_PATTERN.weight });
      confidence = Math.max(confidence, AI_SIGNALS.COMMIT_PATTERN.weight);
      // 尝试从模式中提取模型名
      if (!model) {
        for (const [toolId, tool] of Object.entries(AI_TOOLS)) {
          for (const cp of tool.commitPatterns) {
            if (cp.test(message)) {
              model = toolId;
              break;
            }
          }
        }
      }
    }
  }

  // 信号 4: 作者名匹配 AI 工具
  if (author) {
    const authorLower = author.toLowerCase();
    for (const aiName of AI_AUTHOR_NAMES) {
      if (authorLower.includes(aiName)) {
        if (!model) model = aiName;
        signals.push({ signal: AI_SIGNALS.AI_AUTHOR.name, weight: AI_SIGNALS.AI_AUTHOR.weight, match: aiName });
        confidence = Math.max(confidence, AI_SIGNALS.AI_AUTHOR.weight);
      }
    }
  }

  // 信号 5: 作者邮箱匹配 AI 服务
  if (authorMail) {
    const emailLower = authorMail.toLowerCase();
    for (const [toolId, tool] of Object.entries(AI_TOOLS)) {
      for (const email of tool.emails) {
        if (emailLower.includes(email.toLowerCase())) {
          if (!model) model = toolId;
          signals.push({ signal: AI_SIGNALS.AI_EMAIL.name, weight: AI_SIGNALS.AI_EMAIL.weight, tool: toolId });
          confidence = Math.max(confidence, AI_SIGNALS.AI_EMAIL.weight);
        }
      }
    }
  }

  // 多信号融合: 如果有多个信号，提升置信度
  if (signals.length > 1) {
    const combinedWeight = 1 - signals.reduce((acc, s) => acc * (1 - s.weight), 1);
    confidence = Math.min(1.0, combinedWeight * 1.1); // 多信号加成
  }

  return {
    isAI: confidence >= 0.50,
    model: confidence >= 0.50 ? model : null,
    confidence: Math.round(confidence * 100) / 100,
    signals: signals.map((s) => s.signal),
  };
}

/**
 * 构建 commit sha -> AI 分析结果的缓存
 * 批量获取 commit 信息提升性能
 */
function buildCommitCache(shas) {
  const cache = new Map();
  const unique = [...new Set(shas)].filter(Boolean);

  console.log(`  构建 commit 缓存，共 ${unique.length} 个唯一 commit ...`);

  // 批量获取 commit 信息: sha, author, email, message
  for (const sha of unique) {
    const shortSha = sha.slice(0, 12);
    const rawInfo = git(`log -1 --format="%an%x09%ae%x09%B" ${shortSha}`);

    if (!rawInfo) {
      cache.set(sha, { isAI: false, model: null, confidence: 0, signals: [] });
      continue;
    }

    const [author, authorMail, ...msgParts] = rawInfo.split("\t");
    const message = msgParts.join("\t").trim();

    const analysis = analyzeCommitAI(message, author, authorMail);
    cache.set(sha, analysis);
  }

  return cache;
}

/**
 * 批量获取 commit 信息的优化版本
 * 使用单次 git log 获取所有 commit 元数据
 */
function buildCommitCacheOptimized(shas) {
  const cache = new Map();
  const unique = [...new Set(shas)].filter(Boolean);

  console.log(`  构建 commit 缓存，共 ${unique.length} 个唯一 commit (批量模式) ...`);

  if (unique.length === 0) return cache;

  // 批量获取所有 commit 的元数据 (一次 git log 调用)
  const shaArgs = unique.map(s => s.slice(0, 12)).join(" ");
  const format = "%H%x09%an%x09%ae%x09%B%x1e";
  const rawOutput = git(`log --no-walk --format="${format}" ${shaArgs}`);

  if (rawOutput) {
    const records = rawOutput.split("\x1e").filter(r => r.trim());
    for (const record of records) {
      const trimmed = record.trim();
      if (!trimmed) continue;
      const [sha, author, authorMail, ...msgParts] = trimmed.split("\t");
      const message = msgParts.join("\t").trim();
      const analysis = analyzeCommitAI(message, author, authorMail);
      cache.set(sha, analysis);
    }
  }

  // 补充: 对未在批量结果中找到的 commit，单独查询
  for (const sha of unique) {
    if (!cache.has(sha)) {
      const shortSha = sha.slice(0, 12);
      const rawInfo = git(`log -1 --format="%an%x09%ae%x09%B" ${shortSha}`);
      if (!rawInfo) {
        cache.set(sha, { isAI: false, model: null, confidence: 0, signals: [] });
        continue;
      }
      const [author, authorMail, ...msgParts] = rawInfo.split("\t");
      const message = msgParts.join("\t").trim();
      cache.set(sha, analyzeCommitAI(message, author, authorMail));
    }
  }

  return cache;
}

// ============================================================
// git blame 解析
// ============================================================

/**
 * 解析 git blame --line-porcelain 输出
 * 提取每行的作者、commit、时间戳、commit message
 */
function blameFile(filePath) {
  const output = git(`blame --line-porcelain -w -M -C -- "${filePath}"`);
  if (!output) return [];

  const lines = output.split("\n");
  const result = [];

  let currentLine = null;
  let inHeader = true; // header 行之后的内容行（实际代码）之前是元数据

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 行头格式: <sha> <orig-line> <final-line> [<num-lines>]
    const headerMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/);
    if (headerMatch) {
      if (currentLine) result.push(currentLine);

      currentLine = {
        line: parseInt(headerMatch[3], 10),
        author: null,
        authorMail: null,
        authorTime: null,
        commitSha: headerMatch[1],
        summary: null,
      };
      inHeader = true;
      continue;
    }

    if (!currentLine || !inHeader) continue;

    if (line.startsWith("author ")) {
      currentLine.author = line.slice(7);
    } else if (line.startsWith("author-mail ")) {
      currentLine.authorMail = line.slice(12);
    } else if (line.startsWith("author-time ")) {
      const ts = parseInt(line.slice(12), 10);
      currentLine.authorTime = ts ? new Date(ts * 1000).toISOString() : null;
    } else if (line.startsWith("summary ")) {
      currentLine.summary = line.slice(8);
    } else if (line.startsWith("\t")) {
      // 实际代码行，header 部分结束
      inHeader = false;
    }
  }
  if (currentLine) result.push(currentLine);

  return result;
}

// ============================================================
// 统计聚合
// ============================================================

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function pct(part, total) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

/** 置信度分级 */
function confidenceLevel(conf) {
  if (conf >= 0.80) return "high";
  if (conf >= 0.50) return "medium";
  return "low";
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("========================================");
  console.log(" Agent Forge - 溯源扫描脚本 v2.0");
  console.log(" 多信号 AI 代码来源识别引擎");
  console.log("========================================");

  const isRepo = git("rev-parse --is-inside-work-tree").trim();
  if (isRepo !== "true") {
    console.error("错误: 当前目录不是 git 仓库");
    process.exit(1);
  }

  console.log("\n[1/5] 收集仓库文件 (gitignore 感知) ...");
  const cache = loadCache();
  const cachedBlameData = cache?.blameData || {};
  const allFiles = collectFiles(ROOT);

  // 过滤掉 gitignored 文件
  const files = allFiles.filter((f) => !isGitignored(f));
  const skipped = allFiles.length - files.length;
  console.log(`  共发现 ${allFiles.length} 个文本文件${skipped > 0 ? ` (跳过 ${skipped} 个 gitignored)` : ""}`);

  console.log("\n[2/5] 对每个文件执行 git blame ...");
  const fileResults = [];
  let totalLines = 0;
  const allShas = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    process.stdout.write(`  [${i + 1}/${files.length}] ${file} ... `);

    const lineCount = countLines(file);
    if (lineCount > MAX_FILE_LINES) {
      console.log(`跳过 (行数 ${lineCount} 超过上限 ${MAX_FILE_LINES})`);
      continue;
    }

    // Before calling blameFile, check cache
    if (cachedBlameData[file]) {
      console.log(`[cached]`);
      fileResults.push({ path: file, blameLines: cachedBlameData[file] });
      totalLines += cachedBlameData[file].length;
      for (const bl of cachedBlameData[file]) {
        allShas.push(bl.commitSha);
      }
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

  console.log("\n[3/5] 多信号 AI 检测引擎分析 commit 来源 ...");
  const commitCache = buildCommitCacheOptimized(allShas);

  // 统计 AI 工具分布
  const aiStats = { totalCommits: 0, aiCommits: 0 };
  const modelStats = {};
  const authorStats = {};

  for (const [, info] of commitCache) {
    aiStats.totalCommits++;
    if (info.isAI) {
      aiStats.aiCommits++;
      if (info.model) {
        modelStats[info.model] = modelStats[info.model] || { lines: 0, commits: 0 };
        modelStats[info.model].commits++;
      }
    }
  }

  console.log(`  检测到 ${aiStats.aiCommits}/${aiStats.totalCommits} 个 AI 相关 commit`);

  console.log("\n[4/5] 聚合溯源结果（含置信度评分）...");

  let aiLines = 0;
  let humanLines = 0;
  const confidenceStats = { high: 0, medium: 0, low: 0 };

  const output = {
    generatedAt: new Date().toISOString(),
    version: "2.0",
    summary: {
      totalFiles: fileResults.length,
      totalLines,
      aiLines: 0,
      humanLines: 0,
      aiRatio: 0,
      confidence: { high: 0, medium: 0, low: 0 },
    },
    authors: [],
    models: [],
    files: fileResults.map((fr) => {
      let fileAiLines = 0;
      let fileHumanLines = 0;

      const lines = fr.blameLines.map((bl) => {
        const info = commitCache.get(bl.commitSha) || { isAI: false, model: null, confidence: 0, signals: [] };

        // 作者统计
        if (bl.author) {
          if (!authorStats[bl.author]) {
            authorStats[bl.author] = { commits: new Set(), aiCommits: 0, humanCommits: 0, lines: 0 };
          }
          authorStats[bl.author].commits.add(bl.commitSha);
          authorStats[bl.author].lines++;
          if (info.isAI) {
            authorStats[bl.author].aiCommits++;
            fileAiLines++;
            aiLines++;
            if (info.model) {
              modelStats[info.model] = modelStats[info.model] || { lines: 0, commits: 0 };
              modelStats[info.model].lines++;
            }
            const level = confidenceLevel(info.confidence);
            confidenceStats[level]++;
          } else {
            authorStats[bl.author].humanCommits++;
            fileHumanLines++;
            humanLines++;
          }
        }

        return {
          line: bl.line,
          author: bl.author,
          model: info.isAI ? info.model : null,
          commitSha: bl.commitSha,
          timestamp: bl.authorTime,
          source: info.isAI ? "ai" : "human",
          confidence: info.confidence,
          signals: info.signals,
        };
      });

      return {
        path: fr.path,
        aiRatio: fr.blameLines.length > 0 ? Math.round((fileAiLines / fr.blameLines.length) * 1000) / 10 : 0,
        lines,
      };
    }),
  };

  // 填充摘要
  output.summary.aiLines = aiLines;
  output.summary.humanLines = humanLines;
  output.summary.aiRatio = totalLines > 0 ? Math.round((aiLines / totalLines) * 1000) / 10 : 0;
  output.summary.confidence = confidenceStats;

  // 作者统计
  output.authors = Object.entries(authorStats)
    .map(([name, stats]) => ({
      name,
      commits: stats.commits.size,
      aiCommits: stats.aiCommits,
      humanCommits: stats.humanCommits,
      lines: stats.lines,
    }))
    .sort((a, b) => b.lines - a.lines);

  // 模型统计
  output.models = Object.entries(modelStats)
    .map(([name, stats]) => ({ name, lines: stats.lines, commits: stats.commits }))
    .sort((a, b) => b.lines - a.lines);

  console.log("\n[5/5] 写入 .forge/provenance.json ...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  // 保存缓存
  const blameDataForCache = {};
  for (const fr of fileResults) {
    blameDataForCache[fr.path] = fr.blameLines;
  }
  saveCache({ blameData: blameDataForCache });

  console.log("\n========================================");
  console.log(" 溯源扫描完成！v2.0");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`文件总数: ${output.summary.totalFiles}`);
  console.log(`代码总行数: ${output.summary.totalLines}`);
  console.log(`AI 生成行数: ${aiLines} (${pct(aiLines, totalLines)}%)`);
  console.log(`人类编写行数: ${humanLines} (${pct(humanLines, totalLines)}%)`);
  console.log(`AI 比例: ${output.summary.aiRatio}%`);
  console.log(`置信度分布: 高=${confidenceStats.high} 中=${confidenceStats.medium} 低=${confidenceStats.low}`);
  console.log(`AI 模型数: ${output.models.length}`);
  console.log(`贡献者数: ${output.authors.length}`);
  if (output.models.length > 0) {
    console.log("\n模型分布:");
    for (const m of output.models.slice(0, 5)) {
      console.log(`  ${m.name}: ${m.lines} 行 (${m.commits} commits)`);
    }
  }
}

main();
