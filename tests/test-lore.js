/**
 * tests/test-lore.js
 * 决策提取脚本核心逻辑测试
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ============================================================
// 测试框架
// ============================================================

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ============================================================
// 导入被测函数
// ============================================================

const scriptPath = path.join(__dirname, "..", "scripts", "run-lore.js");
const scriptContent = fs.readFileSync(scriptPath, "utf8");
const scriptWithoutMain = scriptContent.replace(/\nmain\(\)\.catch\([^)]+\);\s*$/, "");

const scriptWithExports = scriptWithoutMain + `
;this.__exports = {
  classifyCommit, COMMIT_CATEGORIES, extractJSON,
  deduplicateDecisions, semanticDeduplicateDecisions,
  fallbackDecisionExtraction,
};
`;

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
vm.runInContext(scriptWithExports, sandbox);

const {
  classifyCommit, COMMIT_CATEGORIES, extractJSON,
  deduplicateDecisions, semanticDeduplicateDecisions,
  fallbackDecisionExtraction,
} = sandbox.__exports || {};

// ============================================================
// 测试用例
// ============================================================

console.log("\n========================================");
console.log(" 决策提取脚本核心逻辑测试");
console.log("========================================\n");

// --- Commit 预分类 ---

console.log("Commit 预分类:");

test("合并提交应被过滤", () => {
  const result = classifyCommit("Merge pull request #123 from feature/auth");
  assert.ok(!result.shouldAnalyze, "合并提交不应分析");
  assert.strictEqual(result.category, COMMIT_CATEGORIES.MERGE);
});

test("Merge branch 提交应被过滤", () => {
  const result = classifyCommit("Merge branch 'main' into develop");
  assert.ok(!result.shouldAnalyze);
});

test("Revert 提交应被过滤", () => {
  const result = classifyCommit("Revert: feat: add auth module");
  assert.ok(!result.shouldAnalyze);
  assert.strictEqual(result.category, COMMIT_CATEGORIES.REVERT);
});

test("格式化提交应被过滤", () => {
  const result = classifyCommit("format: run prettier on all files");
  assert.ok(!result.shouldAnalyze);
});

test("拼写修复应被过滤", () => {
  const result = classifyCommit("typo: fix spelling in README");
  assert.ok(!result.shouldAnalyze);
});

test("纯 CI/CD 变更应被过滤", () => {
  const result = classifyCommit("ci: update github actions workflow");
  assert.ok(!result.shouldAnalyze);
});

test("普通依赖更新应被过滤", () => {
  const result = classifyCommit("chore(deps): bump express from 4.17 to 4.18");
  assert.ok(!result.shouldAnalyze);
});

test("安全相关依赖更新应保留分析", () => {
  const result = classifyCommit("chore(deps): bump lodash to fix security vulnerability CVE-2021-23337");
  assert.ok(result.shouldAnalyze);
});

test("纯文档变更应被过滤", () => {
  const result = classifyCommit("docs: fix typo in installation guide");
  assert.ok(!result.shouldAnalyze);
});

test("架构相关文档应保留分析", () => {
  const result = classifyCommit("docs: add architecture decision record for API design");
  assert.ok(result.shouldAnalyze);
});

test("技术决策提交应保留分析", () => {
  const result = classifyCommit("refactor: migrate from session to JWT authentication");
  assert.ok(result.shouldAnalyze);
});

test("功能提交应保留分析", () => {
  const result = classifyCommit("feat: add Redis caching layer for API responses");
  assert.ok(result.shouldAnalyze);
});

// --- JSON 提取 ---

console.log("\nJSON 提取:");

test("直接 JSON 解析", () => {
  const input = '{"decisions": [{"commit_sha": "abc", "confidence": 0.9}]}';
  const result = extractJSON(input);
  assert.ok(result);
  assert.ok(result.decisions);
  assert.strictEqual(result.decisions.length, 1);
});

test("从 code block 提取 JSON", () => {
  const input = 'Here is the result:\n```json\n{"decisions": [{"commit_sha": "abc"}]}\n```';
  const result = extractJSON(input);
  assert.ok(result);
  assert.ok(result.decisions);
});

test("从文本中匹配 JSON 对象", () => {
  const input = 'Analysis complete.\n{"decisions": [{"commit_sha": "abc", "confidence": 0.8}]}\nDone.';
  const result = extractJSON(input);
  assert.ok(result);
  assert.ok(result.decisions);
});

test("从文本中匹配 JSON 数组", () => {
  const input = 'Result:\n[{"commit_sha": "abc", "confidence": 0.9}]\nEnd.';
  const result = extractJSON(input);
  assert.ok(result);
  assert.ok(result.decisions, "应包装为 decisions");
});

test("修复尾逗号", () => {
  const input = '{"decisions": [{"commit_sha": "abc", "confidence": 0.9,}]}';
  const result = extractJSON(input);
  assert.ok(result);
});

test("空输入返回 null", () => {
  assert.strictEqual(extractJSON(""), null);
  assert.strictEqual(extractJSON(null), null);
  assert.strictEqual(extractJSON(undefined), null);
});

test("无效 JSON 返回 null", () => {
  assert.strictEqual(extractJSON("not json at all"), null);
});

// --- 决策去重 (简单) ---

console.log("\n决策去重 (简单):");

test("相同决策前缀去重", () => {
  // 使用前 50 字符相同的长决策文本
  const prefix = "Migrate the entire authentication system from session-based to JWT";
  const decisions = [
    { commit_sha: "aaa", decision: prefix + " for mobile support", confidence: 0.9 },
    { commit_sha: "bbb", decision: prefix + " for mobile support and scalability", confidence: 0.8 },
    { commit_sha: "ccc", decision: "Add Redis caching layer", confidence: 0.85 },
  ];
  const result = deduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  assert.strictEqual(valid.length, 2, `应去重为 2 条，实际: ${valid.length}`);
});

test("保留置信度更高的决策", () => {
  const prefix = "Switch database from MySQL to PostgreSQL for better performance";
  const decisions = [
    { commit_sha: "aaa", decision: prefix + " and reliability", confidence: 0.7 },
    { commit_sha: "bbb", decision: prefix + " and reliability and scalability", confidence: 0.95 },
  ];
  const result = deduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  assert.strictEqual(valid.length, 1, `应去重为 1 条，实际: ${valid.length}`);
  assert.strictEqual(valid[0].confidence, 0.95);
});

test("无效决策保留在末尾", () => {
  const decisions = [
    { commit_sha: "aaa", decision: "有效决策", confidence: 0.9 },
    { commit_sha: "bbb", decision: null, confidence: 0 },
    { commit_sha: "ccc", decision: "另一个有效决策", confidence: 0.85 },
  ];
  const result = deduplicateDecisions(decisions);
  assert.ok(result[0].decision, "第一条应为有效决策");
  assert.ok(result[1].decision, "第二条应为有效决策");
  assert.ok(!result[2].decision, "第三条应为无效决策");
});

// --- 语义去重 ---

console.log("\n语义去重:");

test("语义相似的决策去重", () => {
  const decisions = [
    { commit_sha: "aaa", decision: "Use Redis as caching layer to improve API response speed", confidence: 0.9, quality: 0.8 },
    { commit_sha: "bbb", decision: "Use Redis as caching layer to improve API response speed significantly", confidence: 0.85, quality: 0.7 },
    { commit_sha: "ccc", decision: "Migrate database from MySQL to PostgreSQL", confidence: 0.9, quality: 0.85 },
  ];
  const result = semanticDeduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  assert.strictEqual(valid.length, 2, `语义相似的决策应去重，实际: ${valid.length}`);
});

test("语义不同的决策保留", () => {
  const decisions = [
    { commit_sha: "aaa", decision: "Use JWT for authentication", confidence: 0.9 },
    { commit_sha: "bbb", decision: "Use Redis for caching", confidence: 0.85 },
    { commit_sha: "ccc", decision: "Use Docker for containerization", confidence: 0.9 },
  ];
  const result = semanticDeduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  assert.strictEqual(valid.length, 3, "语义不同的决策应全部保留");
});

test("语义去重保留质量更高的", () => {
  const decisions = [
    { commit_sha: "aaa", decision: "Adopt TypeScript for type safe development", confidence: 0.8, quality: 0.6 },
    { commit_sha: "bbb", decision: "Adopt TypeScript for type safe development with strict mode", confidence: 0.9, quality: 0.9 },
  ];
  const result = semanticDeduplicateDecisions(decisions);
  const valid = result.filter(d => d.decision && d.confidence >= 0.5);
  assert.strictEqual(valid.length, 1, `应去重为 1 条，实际: ${valid.length}`);
  assert.strictEqual(valid[0].quality, 0.9);
});

// --- 降级模式 ---

console.log("\n降级模式:");

test("降级模式提取重构决策", () => {
  const commits = [
    { sha: "abc123", timestamp: "2024-01-01", author: "dev", message: "refactor: migrate authentication from session to JWT" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.strictEqual(result.length, 1);
  assert.ok(result[0].decision, "应提取到决策");
  assert.strictEqual(result[0].category, "architecture");
  assert.ok(result[0].confidence >= 0.5);
});

test("降级模式提取技术选型", () => {
  const commits = [
    { sha: "def456", timestamp: "2024-01-02", author: "dev", message: "feat: adopt Redis for caching" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到决策");
  assert.ok(result[0].decision.includes("Redis"));
});

test("降级模式提取性能优化", () => {
  const commits = [
    { sha: "ghi789", timestamp: "2024-01-03", author: "dev", message: "perf: optimize database query with index" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到决策");
});

test("降级模式对无决策 commit 返回空决策", () => {
  const commits = [
    { sha: "jkl012", timestamp: "2024-01-04", author: "dev", message: "fix: typo in README" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.strictEqual(result[0].decision, null);
  assert.strictEqual(result[0].confidence, 0);
});

test("降级模式处理多个 commit", () => {
  const commits = [
    { sha: "aaa", timestamp: "2024-01-01", author: "dev1", message: "refactor: restructure authentication module" },
    { sha: "bbb", timestamp: "2024-01-02", author: "dev2", message: "feat: add new feature" },
    { sha: "ccc", timestamp: "2024-01-03", author: "dev3", message: "chore: update deps" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.strictEqual(result.length, 3);
  const withDecisions = result.filter(r => r.decision);
  assert.ok(withDecisions.length >= 1, `至少应提取到 1 条决策，实际: ${withDecisions.length}`);
});

// --- Commit 分类完整性 ---

console.log("\nCommit 分类完整性:");

test("所有分类类别都有定义", () => {
  assert.ok(COMMIT_CATEGORIES, "COMMIT_CATEGORIES 应存在");
  const expected = ["decision", "merge", "chore", "typo", "format", "docs", "revert", "ci", "dependency"];
  for (const cat of expected) {
    assert.ok(Object.values(COMMIT_CATEGORIES).includes(cat), `应有分类: ${cat}`);
  }
});

test("分类函数始终返回 category, shouldAnalyze, reason", () => {
  const testMessages = [
    "feat: add feature",
    "Merge pull request #1",
    "fix: bug fix",
    "docs: update docs",
    "refactor: big refactor",
  ];
  for (const msg of testMessages) {
    const result = classifyCommit(msg);
    assert.ok(result.category !== undefined, `应有 category: "${msg}"`);
    assert.ok(result.shouldAnalyze !== undefined, `应有 shouldAnalyze: "${msg}"`);
    assert.ok(result.reason, `应有 reason: "${msg}"`);
  }
});

// --- 增强降级模式测试 (v2.1) ---

console.log("\n增强降级模式 (v2.1):");

test("Conventional Commit 格式解析 - feat", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "feat: add user authentication with JWT" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "feat commit 应提取到决策");
  assert.ok(result[0].confidence >= 0.4, "置信度应 >= 0.4");
});

test("Conventional Commit 格式解析 - refactor", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "refactor: migrate from session to JWT authentication" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "refactor commit 应提取到决策");
  assert.strictEqual(result[0].category, "architecture");
});

test("Conventional Commit 格式解析 - perf", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "perf: optimize database query performance" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "perf commit 应提取到决策");
});

test("Conventional Commit 格式解析 - scope", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "feat(auth): add OAuth2 provider support" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "带 scope 的 commit 应提取到决策");
});

test("琐碎提交不提取决策", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "fix: typo in README" },
    { sha: "def", timestamp: "2024-01-02", author: "dev", message: "fix: spelling error in comments" },
    { sha: "ghi", timestamp: "2024-01-03", author: "dev", message: "style: format whitespace" },
  ];
  const result = fallbackDecisionExtraction(commits);
  for (const r of result) {
    assert.ok(!r.decision, `琐碎提交不应提取决策: ${r.message}`);
    assert.strictEqual(r.confidence, 0, `琐碎提交置信度应为 0: ${r.message}`);
  }
});

test("数据库决策提取", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "add index to users table for faster lookup" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到数据库决策");
  assert.strictEqual(result[0].category, "data");
});

test("API 决策提取", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "api: add new REST endpoint for user management" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到 API 决策");
});

test("基础设施决策提取", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "add docker containerization support" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到基础设施决策");
});

test("从 commit body 提取理由", () => {
  const commits = [
    {
      sha: "abc",
      timestamp: "2024-01-01",
      author: "dev",
      message: "refactor: migrate from REST to GraphQL\n\nbecause REST endpoints became too numerous and hard to maintain",
    },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到决策");
  assert.ok(result[0].rationale, "应提取到理由");
  assert.ok(result[0].rationale.includes("REST"), `理由应包含 REST: ${result[0].rationale}`);
  assert.ok(result[0].confidence >= 0.6, "有理由的决策置信度应更高");
});

test("技术选型升级提取", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "upgrade react to 18.3.1" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到升级决策");
  assert.ok(result[0].decision.includes("react"), `决策应包含 react: ${result[0].decision}`);
  assert.strictEqual(result[0].category, "tech_choice");
});

test("安全漏洞修复提取", () => {
  const commits = [
    { sha: "abc", timestamp: "2024-01-01", author: "dev", message: "fix XSS vulnerability in user input" },
  ];
  const result = fallbackDecisionExtraction(commits);
  assert.ok(result[0].decision, "应提取到安全决策");
  assert.strictEqual(result[0].category, "security");
});

// ============================================================
// 结果汇总
// ============================================================

console.log("\n========================================");
console.log(` 决策提取测试结果: ${passed} 通过, ${failed} 失败`);
console.log("========================================");

if (failed > 0) {
  console.log("\n失败详情:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
