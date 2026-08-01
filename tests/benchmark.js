/**
 * tests/benchmark.js
 * 综合性能基准测试和准确率评估
 *
 * 评估维度:
 *   1. 安全检测准确率: TPR (真阳性率) / FPR (假阳性率) / F1-Score
 *   2. AI 溯源检测准确率: 多信号检测的精确率和召回率
 *   3. 决策提取准确率: 降级模式的分类准确率和提取覆盖率
 *   4. 性能基准: 核心函数执行时间
 *   5. 规则覆盖度: 安全规则和 AI 工具的覆盖范围
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ============================================================
// 测试框架
// ============================================================

let totalPassed = 0;
let totalFailed = 0;
const benchmarks = {};

function benchmark(name, fn) {
  try {
    const result = fn();
    totalPassed++;
    if (result !== undefined) {
      console.log(`  ✓ ${name}: ${result}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    totalFailed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function measureTime(fn) {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

// ============================================================
// 加载核心脚本
// ============================================================

// 每个脚本需要导出的函数/变量
const SCRIPT_EXPORTS = {
  "run-security.js": [
    "SECRET_RULES", "UNSAFE_CODE_RULES", "shannonEntropy", "detectHighEntropy",
    "isPlaceholder", "isTestFile", "isExampleFile", "isToolFile", "isScriptFile",
    "isInStringLiteral", "isRuleDefinitionLine", "isSuppressed", "isSuppressedBlock",
    "scanLine", "calculateScore", "summarize", "generateRemediationPlan",
    "PLACEHOLDER_VALUES", "SKIP_DIRS", "SKIP_FILES", "SCAN_EXTS",
  ],
  "run-provenance.js": [
    "AI_TOOLS", "AI_SIGNALS", "AI_COMMIT_PATTERNS", "AI_AUTHOR_NAMES",
    "analyzeCommitAI", "isTextFile", "collectFiles", "pct", "confidenceLevel",
  ],
  "run-lore.js": [
    "classifyCommit", "COMMIT_CATEGORIES", "extractJSON",
    "deduplicateDecisions", "semanticDeduplicateDecisions",
    "fallbackDecisionExtraction", "getCommits", "buildEnhancedPrompt",
  ],
};

function loadScript(scriptName) {
  const scriptPath = path.join(__dirname, "..", "scripts", scriptName);
  const scriptContent = fs.readFileSync(scriptPath, "utf8");
  // 移除 main() 调用 (兼容 main(); 和 main().catch(...); 两种形式)
  const scriptWithoutMain = scriptContent
    .replace(/\nmain\(\)\.catch\([^)]+\);\s*$/, "")
    .replace(/\nmain\(\);\s*$/, "");

  // 构建导出代码
  const exportNames = SCRIPT_EXPORTS[scriptName] || [];
  const exportCode = exportNames.length > 0
    ? `\n;this.__exports = { ${exportNames.join(", ")} };`
    : "";

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    process: {
      cwd: () => path.join(__dirname, ".."),
      env: {},
      exit: () => {},
    },
    require: (mod) => {
      if (mod === "fs") return fs;
      if (mod === "path") return path;
      if (mod === "child_process") return { execSync: () => "" };
      return require(mod);
    },
    module: { exports: {} },
    exports: {},
    Set, Map, Object, Array, JSON, Math, Date, RegExp, parseInt, parseFloat,
    Buffer, setTimeout, clearTimeout, Promise,
    fetch: async () => { throw new Error("不应调用 fetch"); },
  };

  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutMain + exportCode, sandbox);
  return sandbox;
}

// 加载安全脚本
const secSandbox = loadScript("run-security.js");
const {
  SECRET_RULES, UNSAFE_CODE_RULES, shannonEntropy, detectHighEntropy,
  isPlaceholder, isTestFile, isExampleFile, isToolFile, isScriptFile,
  isInStringLiteral, isRuleDefinitionLine,
  scanLine, calculateScore,
} = secSandbox.__exports || {};

// 加载溯源脚本
const provSandbox = loadScript("run-provenance.js");
const {
  AI_TOOLS, AI_SIGNALS, AI_COMMIT_PATTERNS, AI_AUTHOR_NAMES,
  analyzeCommitAI,
} = provSandbox.__exports || {};

// 加载决策脚本
const loreSandbox = loadScript("run-lore.js");
const {
  classifyCommit, extractJSON, semanticDeduplicateDecisions,
  fallbackDecisionExtraction, COMMIT_CATEGORIES,
} = loreSandbox.__exports || {};

// ============================================================
// 1. 安全检测准确率评估
// ============================================================

console.log("\n========================================");
console.log(" 1. 安全检测准确率评估");
console.log("========================================\n");

// 真阳性测试数据 (真实的安全问题)
const TRUE_POSITIVES = {
  secrets: [
    { line: 'const key = "AKIAIOSFODNN7XYZABCD";', expected: "AWS Access Key ID" },
    { line: 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234";', expected: "GitHub" },
    { line: `const key = "${"sk_" + "live_"}${"ABCDEFghijkl1234567890ABCD"}";`, expected: "Stripe" },
    { line: 'const token = "xoxb-1234567890-1234567890123";', expected: "Slack" },
    { line: 'const key = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890AB";', expected: "OpenAI" },
    { line: 'const token = "glpat-1234567890abcdefghij";', expected: "GitLab" },
    { line: 'const token = "hf_1234567890abcdefghijklmnopqrstuvwxyz12";', expected: "HuggingFace" },
    { line: "-----BEGIN RSA PRIVATE KEY-----", expected: "Private Key" },
    { line: 'const url = "mongodb://user:password123@host:27017/db";', expected: "Database" },
  ],
  code: [
    { line: "const result = eval(userInput);", expected: "eval" },
    { line: "element.innerHTML = userInput;", expected: "innerHTML" },
    { line: 'db.query(`SELECT * FROM users WHERE id = ${userId}`);', expected: "SQL" },
    { line: 'exec(`ls ${userInput}`);', expected: "exec" },
    { line: "obj.__proto__ = malicious;", expected: "原型" },
  ],
};

// 假阳性测试数据 (不应被报告为安全问题)
const FALSE_POSITIVES = [
  { line: 'const desc = "使用 eval() 执行代码"', file: "app/page.tsx" },
  { line: 'const msg = "innerHTML is dangerous"', file: "app/page.tsx" },
  { line: 'const key = "your-api-key-here";', file: "app/config.ts" },
  { line: 'const key = "replace-me";', file: "app/config.ts" },
  { line: "console.log('processing...');", file: "scripts/build.js" },
  { line: 'const placeholder = "changeme";', file: "app/config.ts" },
  { line: '// This is a comment about eval()', file: "app/page.tsx" },
];

benchmark("安全检测 - 密钥检测真阳性率 (TPR)", () => {
  let detected = 0;
  for (const tp of TRUE_POSITIVES.secrets) {
    const issues = scanLine(SECRET_RULES, tp.line, "app/code.ts", 1, false, false);
    if (issues.length > 0) detected++;
  }
  const tpr = (detected / TRUE_POSITIVES.secrets.length * 100).toFixed(1) + "%";
  benchmarks.secretTPR = tpr;
  benchmarks.secretTP = detected;
  benchmarks.secretTotal = TRUE_POSITIVES.secrets.length;
  assert.ok(detected >= 8, `密钥检测 TPR 应 >= 88.9%，实际: ${tpr} (${detected}/${TRUE_POSITIVES.secrets.length})`);
  return `TPR = ${tpr} (${detected}/${TRUE_POSITIVES.secrets.length})`;
});

benchmark("安全检测 - 代码安全检测真阳性率 (TPR)", () => {
  let detected = 0;
  for (const tp of TRUE_POSITIVES.code) {
    const issues = scanLine(UNSAFE_CODE_RULES, tp.line, "app/code.ts", 1, false, false);
    if (issues.length > 0) detected++;
  }
  const tpr = (detected / TRUE_POSITIVES.code.length * 100).toFixed(1) + "%";
  benchmarks.codeTPR = tpr;
  benchmarks.codeTP = detected;
  benchmarks.codeTotal = TRUE_POSITIVES.code.length;
  assert.ok(detected >= 4, `代码安全检测 TPR 应 >= 80%，实际: ${tpr} (${detected}/${TRUE_POSITIVES.code.length})`);
  return `TPR = ${tpr} (${detected}/${TRUE_POSITIVES.code.length})`;
});

benchmark("安全检测 - 假阳性率 (FPR)", () => {
  let falsePositives = 0;
  for (const fp of FALSE_POSITIVES) {
    // 检查是否为脚本文件 (console.log 在脚本中不报)
    const isScript = isScriptFile(fp.file);
    const issues = scanLine(
      [...SECRET_RULES, ...UNSAFE_CODE_RULES],
      fp.line, fp.file, 1, false, false
    );
    // 过滤掉被正确抑制的
    const realIssues = issues.filter(i => {
      if (isScript && i.type.includes("console.log")) return false;
      return true;
    });
    if (realIssues.length > 0) falsePositives++;
  }
  const fpr = (falsePositives / FALSE_POSITIVES.length * 100).toFixed(1) + "%";
  benchmarks.fpr = fpr;
  benchmarks.fp = falsePositives;
  assert.ok(falsePositives <= 1, `FPR 应 <= 14.3%，实际: ${fpr} (${falsePositives}/${FALSE_POSITIVES.length})`);
  return `FPR = ${fpr} (${falsePositives}/${FALSE_POSITIVES.length})`;
});

benchmark("安全检测 - F1-Score", () => {
  // 使用实际测量值计算 F1-Score
  const tp = (benchmarks.secretTP || 0) + (benchmarks.codeTP || 0);
  const fp = benchmarks.fp || 0;
  const fn = ((benchmarks.secretTotal || 9) - (benchmarks.secretTP || 0))
           + ((benchmarks.codeTotal || 5) - (benchmarks.codeTP || 0));
  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);
  const f1 = 2 * (precision * recall) / (precision + recall);
  benchmarks.f1Score = (f1 * 100).toFixed(1) + "%";
  assert.ok(f1 >= 0.90, `F1-Score 应 >= 90%，实际: ${(f1 * 100).toFixed(1)}%`);
  return `F1 = ${(f1 * 100).toFixed(1)}% (P=${(precision * 100).toFixed(1)}%, R=${(recall * 100).toFixed(1)}%)`;
});

// ============================================================
// 2. AI 溯源检测准确率
// ============================================================

console.log("\n========================================");
console.log(" 2. AI 溯源检测准确率");
console.log("========================================\n");

const AI_COMMITS = [
  { message: "feat: add feature\n\nCo-Authored-By: GitHub Copilot <copilot@github.com>", author: "user", email: "user@example.com", expected: true },
  { message: "Generated with Cursor AI\n\nfeat: implement auth", author: "user", email: "user@example.com", expected: true },
  { message: "feat: add feature [AI:copilot]", author: "copilot", email: "copilot@github.com", expected: true },
  { message: "Co-Authored-By: Claude <noreply@anthropic.com>\n\nrefactor: improve code", author: "user", email: "user@example.com", expected: true },
  { message: "feat: add new endpoint for user management", author: "john", email: "john@example.com", expected: false },
  { message: "fix: resolve null pointer exception", author: "jane", email: "jane@example.com", expected: false },
  { message: "docs: update README", author: "bob", email: "bob@example.com", expected: false },
];

benchmark("AI 溯源 - 检测准确率", () => {
  let correct = 0;
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const commit of AI_COMMITS) {
    const result = analyzeCommitAI(commit.message, commit.author, commit.email);
    const detected = result.isAI;

    if (commit.expected && detected) { truePositives++; correct++; }
    else if (!commit.expected && !detected) { trueNegatives++; correct++; }
    else if (commit.expected && !detected) { falseNegatives++; }
    else if (!commit.expected && detected) { falsePositives++; }
  }

  const accuracy = (correct / AI_COMMITS.length * 100).toFixed(1) + "%";
  benchmarks.aiAccuracy = accuracy;
  assert.ok(correct >= 6, `AI 检测准确率应 >= 85.7%，实际: ${accuracy} (${correct}/${AI_COMMITS.length})`);
  return `准确率 = ${accuracy} (TP=${truePositives}, TN=${trueNegatives}, FP=${falsePositives}, FN=${falseNegatives})`;
});

benchmark("AI 溯源 - AI 工具覆盖数", () => {
  const count = Object.keys(AI_TOOLS).length;
  benchmarks.aiToolCount = count;
  assert.ok(count >= 15, `AI 工具数应 >= 15，实际: ${count}`);
  return `${count} 种 AI 工具`;
});

benchmark("AI 溯源 - 检测信号数", () => {
  const count = Object.keys(AI_SIGNALS).length;
  benchmarks.aiSignalCount = count;
  assert.ok(count >= 5, `检测信号数应 >= 5，实际: ${count}`);
  return `${count} 种检测信号`;
});

// ============================================================
// 3. 决策提取准确率
// ============================================================

console.log("\n========================================");
console.log(" 3. 决策提取准确率");
console.log("========================================\n");

const DECISION_COMMITS = [
  { message: "refactor: migrate authentication from session to JWT", expectedCategory: "architecture", shouldExtract: true },
  { message: "feat: adopt Redis for caching", expectedCategory: "tech_choice", shouldExtract: true },
  { message: "perf: optimize database query performance", expectedCategory: "performance", shouldExtract: true },
  { message: "fix: typo in README", expectedCategory: null, shouldExtract: false },
  { message: "fix XSS vulnerability in user input", expectedCategory: "security", shouldExtract: true },
  { message: "add index to users table for faster lookup", expectedCategory: "data", shouldExtract: true },
  { message: "Merge pull request #42", expectedCategory: null, shouldExtract: false },
  { message: "chore: update dependencies", expectedCategory: null, shouldExtract: false },
];

benchmark("决策提取 - 分类准确率", () => {
  const results = fallbackDecisionExtraction(DECISION_COMMITS.map((c, i) => ({
    sha: `commit${i}`,
    timestamp: "2024-01-01",
    author: "dev",
    message: c.message,
  })));

  let correctExtraction = 0;
  let correctCategory = 0;
  let totalExpected = 0;
  let totalNotExpected = 0;

  for (let i = 0; i < DECISION_COMMITS.length; i++) {
    const expected = DECISION_COMMITS[i];
    const actual = results[i];

    if (expected.shouldExtract) {
      totalExpected++;
      if (actual.decision) {
        correctExtraction++;
        if (expected.expectedCategory && actual.category === expected.expectedCategory) {
          correctCategory++;
        }
      }
    } else {
      totalNotExpected++;
      if (!actual.decision) {
        correctExtraction++;
      }
    }
  }

  const extractionRate = (correctExtraction / DECISION_COMMITS.length * 100).toFixed(1) + "%";
  benchmarks.decisionExtraction = extractionRate;
  assert.ok(correctExtraction >= 6, `提取准确率应 >= 75%，实际: ${extractionRate} (${correctExtraction}/${DECISION_COMMITS.length})`);
  return `提取准确率 = ${extractionRate} (${correctExtraction}/${DECISION_COMMITS.length}), 分类正确 = ${correctCategory}/${totalExpected}`;
});

benchmark("决策提取 - 语义去重效果", () => {
  const decisions = [
    { commit_sha: "a", decision: "Use Redis as caching layer", confidence: 0.9, quality: 0.8 },
    { commit_sha: "b", decision: "Use Redis as caching layer for performance", confidence: 0.85, quality: 0.7 },
    { commit_sha: "c", decision: "Use Redis as cache to improve speed", confidence: 0.88, quality: 0.75 },
    { commit_sha: "d", decision: "Migrate database from MySQL to PostgreSQL", confidence: 0.9, quality: 0.85 },
  ];
  const result = semanticDeduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  benchmarks.dedupResult = `${valid.length}/${decisions.length}`;
  assert.ok(valid.length === 2, `3 个相似决策应去重为 1 个，实际保留: ${valid.length}`);
  return `4 条决策去重为 ${valid.length} 条 (3 条相似合并为 1)`;
});

// ============================================================
// 4. 性能基准
// ============================================================

console.log("\n========================================");
console.log(" 4. 性能基准");
console.log("========================================\n");

benchmark("性能 - scanLine 执行时间 (1000 次)", () => {
  const time = measureTime(() => {
    for (let i = 0; i < 1000; i++) {
      scanLine(SECRET_RULES, 'const key = "AKIAIOSFODNN7XYZABCD";', "test.js", 1, false, false);
    }
  });
  benchmarks.scanLineTime = time.toFixed(2) + "ms";
  assert.ok(time < 500, `1000 次 scanLine 应 < 500ms，实际: ${time.toFixed(2)}ms`);
  return `${time.toFixed(2)}ms (平均 ${(time / 1000).toFixed(3)}ms/次)`;
});

benchmark("性能 - shannonEntropy 执行时间 (10000 次)", () => {
  const testStr = "aB3xY9kL2mN5pQ8rT4sW6uZ0vU7wE3tR5yI2oP9aB4cD6";
  const time = measureTime(() => {
    for (let i = 0; i < 10000; i++) {
      shannonEntropy(testStr);
    }
  });
  benchmarks.entropyTime = time.toFixed(2) + "ms";
  assert.ok(time < 200, `10000 次熵计算应 < 200ms，实际: ${time.toFixed(2)}ms`);
  return `${time.toFixed(2)}ms (平均 ${(time / 10000).toFixed(4)}ms/次)`;
});

benchmark("性能 - analyzeCommitAI 执行时间 (10000 次)", () => {
  const msg = "feat: add feature\n\nCo-Authored-By: GitHub Copilot <copilot@github.com>";
  const time = measureTime(() => {
    for (let i = 0; i < 10000; i++) {
      analyzeCommitAI(msg, "user", "user@example.com");
    }
  });
  benchmarks.aiAnalyzeTime = time.toFixed(2) + "ms";
  assert.ok(time < 500, `10000 次 AI 检测应 < 500ms，实际: ${time.toFixed(2)}ms`);
  return `${time.toFixed(2)}ms (平均 ${(time / 10000).toFixed(4)}ms/次)`;
});

benchmark("性能 - classifyCommit 执行时间 (10000 次)", () => {
  const msg = "feat: add user authentication with JWT";
  const time = measureTime(() => {
    for (let i = 0; i < 10000; i++) {
      classifyCommit(msg);
    }
  });
  benchmarks.classifyTime = time.toFixed(2) + "ms";
  assert.ok(time < 200, `10000 次分类应 < 200ms，实际: ${time.toFixed(2)}ms`);
  return `${time.toFixed(2)}ms (平均 ${(time / 10000).toFixed(4)}ms/次)`;
});

benchmark("性能 - calculateScore 执行时间 (10000 次)", () => {
  const issues = Array.from({ length: 100 }, (_, i) => ({
    file: `file${i % 10}.js`,
    line: i,
    severity: ["critical", "high", "medium", "low"][i % 4],
    type: `type${i % 5}`,
    inTest: false,
    inExample: false,
  }));
  const time = measureTime(() => {
    for (let i = 0; i < 10000; i++) {
      calculateScore(issues);
    }
  });
  benchmarks.scoreTime = time.toFixed(2) + "ms";
  assert.ok(time < 1000, `10000 次评分应 < 1000ms，实际: ${time.toFixed(2)}ms`);
  return `${time.toFixed(2)}ms (平均 ${(time / 10000).toFixed(4)}ms/次)`;
});

// ============================================================
// 5. 规则覆盖度评估
// ============================================================

console.log("\n========================================");
console.log(" 5. 规则覆盖度评估");
console.log("========================================\n");

benchmark("规则覆盖 - 密钥检测规则数", () => {
  const count = SECRET_RULES.length;
  benchmarks.secretRules = count;
  assert.ok(count >= 40, `密钥规则应 >= 40，实际: ${count}`);
  return `${count} 条密钥检测规则`;
});

benchmark("规则覆盖 - 代码安全规则数", () => {
  const count = UNSAFE_CODE_RULES.length;
  benchmarks.codeRules = count;
  assert.ok(count >= 35, `代码安全规则应 >= 35，实际: ${count}`);
  return `${count} 条代码安全规则`;
});

benchmark("规则覆盖 - CWE 类型数", () => {
  const cwes = new Set();
  for (const rule of [...SECRET_RULES, ...UNSAFE_CODE_RULES]) {
    if (rule.cwe) cwes.add(rule.cwe);
  }
  const count = cwes.size;
  benchmarks.cweCount = count;
  assert.ok(count >= 10, `CWE 类型应 >= 10，实际: ${count}`);
  return `${count} 种 CWE 类型`;
});

benchmark("规则覆盖 - 所有规则都有 CWE", () => {
  const missing = [...SECRET_RULES, ...UNSAFE_CODE_RULES].filter(r => !r.cwe);
  assert.strictEqual(missing.length, 0, `${missing.length} 条规则缺少 CWE`);
  return "100% 规则有 CWE 映射";
});

benchmark("规则覆盖 - 严重级别分布", () => {
  const dist = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const rule of [...SECRET_RULES, ...UNSAFE_CODE_RULES]) {
    dist[rule.severity] = (dist[rule.severity] || 0) + 1;
  }
  assert.ok(dist.critical > 0, "应有 critical 级别规则");
  assert.ok(dist.high > 0, "应有 high 级别规则");
  assert.ok(dist.medium > 0, "应有 medium 级别规则");
  return `C=${dist.critical} H=${dist.high} M=${dist.medium} L=${dist.low} I=${dist.info}`;
});

// ============================================================
// 6. 高级边缘场景
// ============================================================

console.log("\n========================================");
console.log(" 6. 高级边缘场景");
console.log("========================================\n");

// 高级安全检测: 更多真阳性
benchmark("边缘 - 更多密钥格式检测", () => {
  const extraTPs = [
    { line: 'const key = "AKIA" + "IOSFODNN7EXAMPLE";', rule: "AWS" },
    { line: 'password = "SuperSecret123!@#"', rule: "password" },
    { line: 'const token = "ya29.1234567890abcdefghijklmnopqrstuvwxyz1234567890";', rule: "Google" },
    { line: 'const key = "AIzaSyD1234567890abcdefghijklmnopqrstuvwxyz1234";', rule: "Google API" },
  ];
  let detected = 0;
  for (const tp of extraTPs) {
    const issues = scanLine(SECRET_RULES, tp.line, "app/code.ts", 1, false, false);
    if (issues.length > 0) detected++;
  }
  const rate = (detected / extraTPs.length * 100).toFixed(0) + "%";
  benchmarks.extraSecretTPR = rate;
  // 至少检测到 2/4 (部分格式可能不在规则中)
  assert.ok(detected >= 2, `额外密钥检测率应 >= 50%，实际: ${rate} (${detected}/${extraTPs.length})`);
  return `${rate} (${detected}/${extraTPs.length})`;
});

// 高级安全检测: 更复杂的假阳性
benchmark("边缘 - 复杂假阳性抑制", () => {
  const complexFPs = [
    { line: '// TODO: replace eval() with Function constructor', file: "app/page.tsx" },
    { line: '/* Warning: innerHTML can cause XSS attacks */', file: "app/page.tsx" },
    { line: 'const explanation = "eval() evaluates JavaScript code";', file: "docs/guide.ts" },
    { line: 'const testKey = "test-key-12345";', file: "app/config.ts" },
    { line: '# This file uses exec() for system calls', file: "app/script.py" },
    { line: 'const note = "See https://example.com for docs";', file: "app/page.tsx" },
  ];
  let falsePositives = 0;
  for (const fp of complexFPs) {
    const issues = scanLine([...SECRET_RULES, ...UNSAFE_CODE_RULES], fp.line, fp.file, 1, false, false);
    if (issues.length > 0) falsePositives++;
  }
  const fpr = (falsePositives / complexFPs.length * 100).toFixed(1) + "%";
  benchmarks.complexFPR = fpr;
  assert.ok(falsePositives <= 2, `复杂 FPR 应 <= 33.3%，实际: ${fpr} (${falsePositives}/${complexFPs.length})`);
  return `FPR = ${fpr} (${falsePositives}/${complexFPs.length})`;
});

// 高级 AI 棯源: 更多种类的 AI 标记
benchmark("边缘 - AI 棯源多场景", () => {
  const edgeCases = [
    { message: "feat: add feature\n\nGenerated by Cursor AI v1.2.0", author: "dev", email: "dev@example.com", expected: true },
    { message: "refactor: improve code quality\n\nThis code was generated by Claude 3.5 Sonnet", author: "dev", email: "dev@example.com", expected: true },
    { message: "fix: resolve bug\n\nCo-Authored-By: Cursor <cursor@cursor.com>", author: "dev", email: "dev@example.com", expected: true },
    { message: "feat: implement new feature\n\n🤖 Generated with Claude Code", author: "dev", email: "dev@example.com", expected: true },
    { message: "refactor: clean up code", author: "alice", email: "alice@company.com", expected: false },
    { message: "fix: handle edge case in parser", author: "bob", email: "bob@company.com", expected: false },
  ];
  let correct = 0;
  for (const commit of edgeCases) {
    const result = analyzeCommitAI(commit.message, commit.author, commit.email);
    if (commit.expected === result.isAI) correct++;
  }
  const accuracy = (correct / edgeCases.length * 100).toFixed(1) + "%";
  benchmarks.aiEdgeAccuracy = accuracy;
  assert.ok(correct >= 5, `AI 边缘场景准确率应 >= 83.3%，实际: ${accuracy} (${correct}/${edgeCases.length})`);
  return `准确率 = ${accuracy} (${correct}/${edgeCases.length})`;
});

// 高级决策提取: 复杂 commit message
benchmark("边缘 - 复杂决策提取", () => {
  const complexCommits = [
    { sha: "c1", timestamp: "2024-01-01", author: "dev", message: "refactor: decouple authentication module from core, extract into separate service" },
    { sha: "c2", timestamp: "2024-01-02", author: "dev", message: "feat: implement lazy loading for route components to reduce initial bundle size" },
    { sha: "c3", timestamp: "2024-01-03", author: "dev", message: "feat: add GraphQL API endpoint for user queries\n\nbecause REST endpoints became too numerous" },
    { sha: "c4", timestamp: "2024-01-04", author: "dev", message: "chore: update package-lock.json" },
    { sha: "c5", timestamp: "2024-01-05", author: "dev", message: "perf: cache database query results with Redis to reduce response time by 80%" },
  ];
  const results = fallbackDecisionExtraction(complexCommits);
  const withDecisions = results.filter(r => r.decision && r.confidence >= 0.4);
  const choreSkipped = results.find(r => r.message?.includes("chore"));
  
  // 应提取至少 3 条决策 (c1, c2, c3, c5 中至少 3 个)
  assert.ok(withDecisions.length >= 3, `复杂决策应提取 >= 3 条，实际: ${withDecisions.length}`);
  // chore commit 不应被提取
  assert.ok(!choreSkipped?.decision, "chore commit 不应提取决策");
  
  benchmarks.complexDecisions = `${withDecisions.length}/${complexCommits.length}`;
  return `提取 ${withDecisions.length}/${complexCommits.length} 条决策, chore 已跳过`;
});

// 健壮性: 空输入和异常数据处理
benchmark("边缘 - 健壮性测试", () => {
  // 空输入
  assert.doesNotThrow(() => scanLine(SECRET_RULES, "", "test.ts", 1, false, false));
  assert.doesNotThrow(() => scanLine(UNSAFE_CODE_RULES, "", "test.ts", 1, false, false));
  assert.doesNotThrow(() => classifyCommit(""));
  assert.doesNotThrow(() => extractJSON(""));
  assert.doesNotThrow(() => fallbackDecisionExtraction([]));
  assert.doesNotThrow(() => semanticDeduplicateDecisions([]));
  assert.doesNotThrow(() => analyzeCommitAI("", "", ""));
  assert.doesNotThrow(() => calculateScore([]));
  
  // 极长输入
  const longLine = "eval(" + "x".repeat(10000) + ")";
  assert.doesNotThrow(() => scanLine(UNSAFE_CODE_RULES, longLine, "test.ts", 1, false, false));
  
  // 特殊字符
  assert.doesNotThrow(() => scanLine(SECRET_RULES, 'const x = "\x00\x01\x02";', "test.ts", 1, false, false));
  assert.doesNotThrow(() => classifyCommit("🎉 feat: add emoji support"));
  
  return "所有健壮性测试通过";
});

// 安全评分合理性
benchmark("边缘 - 安全评分合理性", () => {
  // 无问题 = 100 分
  assert.strictEqual(calculateScore([]), 100, "无问题应得 100 分");
  
  // 单个 critical = 大幅降分
  const criticalScore = calculateScore([
    { file: "app.ts", line: 1, severity: "critical", type: "secret", inTest: false, inExample: false },
  ]);
  assert.ok(criticalScore <= 75, `单个 critical 应 <= 75 分，实际: ${criticalScore}`);
  assert.ok(criticalScore >= 60, `单个 critical 应 >= 60 分，实际: ${criticalScore}`);
  
  // 测试文件中的问题不影响评分
  const testScore = calculateScore([
    { file: "test.ts", line: 1, severity: "critical", type: "secret", inTest: true, inExample: false },
  ]);
  assert.strictEqual(testScore, 100, "测试文件问题不应影响评分");
  
  // info 级别不影响评分
  const infoScore = calculateScore([
    { file: "app.ts", line: 1, severity: "info", type: "console", inTest: false, inExample: false },
  ]);
  assert.strictEqual(infoScore, 100, "info 级别不应影响评分");
  
  return `评分合理 (critical=${criticalScore}, test=100, info=100)`;
});

// ============================================================
// 汇总报告
// ============================================================

console.log("\n========================================");
console.log(" 基准测试汇总报告");
console.log("========================================");
console.log("\n准确率指标:");
console.log(`  密钥检测 TPR:     ${benchmarks.secretTPR || "N/A"}`);
console.log(`  代码安全 TPR:     ${benchmarks.codeTPR || "N/A"}`);
console.log(`  假阳性率 FPR:     ${benchmarks.fpr || "N/A"}`);
console.log(`  F1-Score:         ${benchmarks.f1Score || "N/A"}`);
console.log(`  AI 溯源准确率:    ${benchmarks.aiAccuracy || "N/A"}`);
console.log(`  决策提取准确率:   ${benchmarks.decisionExtraction || "N/A"}`);
console.log(`  语义去重效果:     ${benchmarks.dedupResult || "N/A"}`);
console.log("\n边缘场景指标:");
console.log(`  额外密钥检测:     ${benchmarks.extraSecretTPR || "N/A"}`);
console.log(`  复杂假阳性 FPR:   ${benchmarks.complexFPR || "N/A"}`);
console.log(`  AI 边缘准确率:    ${benchmarks.aiEdgeAccuracy || "N/A"}`);
console.log(`  复杂决策提取:     ${benchmarks.complexDecisions || "N/A"}`);
console.log("\n覆盖度指标:");
console.log(`  密钥检测规则:     ${benchmarks.secretRules || "N/A"} 条`);
console.log(`  代码安全规则:     ${benchmarks.codeRules || "N/A"} 条`);
console.log(`  CWE 类型:         ${benchmarks.cweCount || "N/A"} 种`);
console.log(`  AI 工具:          ${benchmarks.aiToolCount || "N/A"} 种`);
console.log(`  检测信号:         ${benchmarks.aiSignalCount || "N/A"} 种`);
console.log("\n性能指标:");
console.log(`  scanLine:         ${benchmarks.scanLineTime || "N/A"}`);
console.log(`  shannonEntropy:   ${benchmarks.entropyTime || "N/A"}`);
console.log(`  analyzeCommitAI:  ${benchmarks.aiAnalyzeTime || "N/A"}`);
console.log(`  classifyCommit:   ${benchmarks.classifyTime || "N/A"}`);
console.log(`  calculateScore:   ${benchmarks.scoreTime || "N/A"}`);

console.log(`\n========================================`);
console.log(` 基准测试结果: ${totalPassed} 通过, ${totalFailed} 失败`);
console.log(`========================================`);

if (totalFailed > 0) {
  process.exit(1);
}
