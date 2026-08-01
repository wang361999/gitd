/**
 * tests/test-provenance.js
 * 溯源脚本核心逻辑测试
 * 测试 AI 检测信号、多信号融合、置信度计算等
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

const scriptPath = path.join(__dirname, "..", "scripts", "run-provenance.js");
const scriptContent = fs.readFileSync(scriptPath, "utf8");

// 移除末尾的 main() 调用
const scriptWithoutMain = scriptContent.replace(/\nmain\(\);\s*$/, "");

// 追加导出语句，使 const 变量在沙箱外可访问
const scriptWithExports = scriptWithoutMain + `
;this.__exports = {
  analyzeCommitAI, AI_TOOLS, AI_SIGNALS, AI_COMMIT_PATTERNS,
  AI_AUTHOR_NAMES, confidenceLevel, AI_COMMIT_PATTERNS,
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
  Buffer, setTimeout, clearTimeout,
};

vm.createContext(sandbox);
vm.runInContext(scriptWithExports, sandbox);

const {
  analyzeCommitAI, AI_TOOLS, AI_SIGNALS,
  AI_COMMIT_PATTERNS, AI_AUTHOR_NAMES, confidenceLevel,
} = sandbox.__exports || {};

// ============================================================
// 测试用例
// ============================================================

console.log("\n========================================");
console.log(" 溯源脚本核心逻辑测试");
console.log("========================================\n");

// --- AI 工具检测 ---

console.log("AI 工具检测:");

test("检测 GitHub Copilot Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: GitHub Copilot <copilot@github.com>",
    "user", "user@example.com"
  );
  assert.ok(result.isAI, "应检测为 AI");
  assert.strictEqual(result.model, "github-copilot");
  assert.ok(result.confidence >= 0.90);
});

test("检测 Cursor 生成标记", () => {
  const result = analyzeCommitAI(
    "feat: implement auth\n\nGenerated with Cursor",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
  assert.strictEqual(result.model, "cursor");
});

test("检测 Claude Code Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "refactor: update API\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
  assert.strictEqual(result.model, "claude-code");
});

test("检测 [AI:model] 标记", () => {
  const result = analyzeCommitAI(
    "feat: add component [AI:gpt-4o]",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
  assert.ok(result.confidence >= 0.90);
});

test("检测 Windsurf Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: Windsurf <noreply@windsurf.com>",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
  assert.strictEqual(result.model, "windsurf");
});

test("检测 Aider 生成标记", () => {
  const result = analyzeCommitAI(
    "fix: resolve bug\n\nGenerated with Aider",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
});

test("检测 Gemini Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: Gemini <noreply@google.com>",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
});

test("检测 Cline Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: Cline",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
});

test("检测 Cody (Sourcegraph) Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: Cody <noreply@sourcegraph.com>",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
});

test("检测 DeepSeek Co-Authored-By", () => {
  const result = analyzeCommitAI(
    "feat: add feature\n\nCo-Authored-By: DeepSeek",
    "user", "user@example.com"
  );
  assert.ok(result.isAI);
});

// --- AI 作者名检测 ---

console.log("\nAI 作者名检测:");

test("检测 AI 机器人作者名 (copilot)", () => {
  const result = analyzeCommitAI("feat: update", "github-copilot", "copilot@github.com");
  assert.ok(result.isAI);
});

test("检测 AI 机器人作者名 (cursor)", () => {
  const result = analyzeCommitAI("feat: update", "cursor-bot", "bot@cursor.sh");
  assert.ok(result.isAI);
});

// --- 人类提交不应被误判 ---

console.log("\n误报抑制:");

test("普通人类提交不应被检测为 AI", () => {
  const result = analyzeCommitAI(
    "fix: resolve login bug\n\nThe issue was caused by a race condition in the auth middleware.",
    "John Doe", "john@example.com"
  );
  assert.ok(!result.isAI);
  assert.strictEqual(result.confidence, 0);
});

test("纯文本提交不应被检测为 AI", () => {
  const result = analyzeCommitAI(
    "docs: update README", "Jane Smith", "jane@example.com"
  );
  assert.ok(!result.isAI);
});

// --- 多信号融合 ---

console.log("\n多信号融合:");

test("多信号叠加提升置信度", () => {
  const result = analyzeCommitAI(
    "feat: add feature [AI:copilot]\n\nCo-Authored-By: GitHub Copilot <copilot@github.com>",
    "copilot", "copilot@github.com"
  );
  assert.ok(result.isAI);
  assert.ok(result.confidence >= 0.95);
  assert.ok(result.signals.length >= 2);
});

// --- 置信度分级 ---

console.log("\n置信度分级:");

test("高置信度分级 (>= 0.80)", () => {
  assert.strictEqual(confidenceLevel(0.90), "high");
  assert.strictEqual(confidenceLevel(0.80), "high");
});

test("中置信度分级 (0.50-0.79)", () => {
  assert.strictEqual(confidenceLevel(0.60), "medium");
  assert.strictEqual(confidenceLevel(0.50), "medium");
});

test("低置信度分级 (< 0.50)", () => {
  assert.strictEqual(confidenceLevel(0.40), "low");
  assert.strictEqual(confidenceLevel(0.0), "low");
});

// --- AI 工具完整性 ---

console.log("\nAI 工具完整性:");

test("所有 AI 工具都有必要的字段", () => {
  assert.ok(AI_TOOLS, "AI_TOOLS 应存在");
  for (const [toolId, tool] of Object.entries(AI_TOOLS)) {
    assert.ok(tool.names, `${toolId} 应有 names`);
    assert.ok(Array.isArray(tool.names));
    assert.ok(tool.coAuthorPatterns);
    assert.ok(Array.isArray(tool.coAuthorPatterns));
    assert.ok(tool.commitPatterns);
    assert.ok(Array.isArray(tool.commitPatterns));
  }
});

test("AI 工具数量 >= 15", () => {
  const toolCount = Object.keys(AI_TOOLS).length;
  assert.ok(toolCount >= 15, `AI 工具数量应 >= 15，当前: ${toolCount}`);
});

// --- 信号配置完整性 ---

console.log("\n信号配置:");

test("所有 AI 信号都有 weight 和 name", () => {
  assert.ok(AI_SIGNALS, "AI_SIGNALS 应存在");
  for (const [key, signal] of Object.entries(AI_SIGNALS)) {
    assert.ok(typeof signal.weight === "number", `${key}.weight 应为数字`);
    assert.ok(signal.weight > 0 && signal.weight <= 1);
    assert.ok(signal.name, `${key} 应有 name`);
  }
});

// --- 模式匹配准确性 ---

console.log("\n模式匹配准确性:");

test("AI_COMMIT_PATTERNS 能匹配常见 AI 标记", () => {
  assert.ok(AI_COMMIT_PATTERNS, "AI_COMMIT_PATTERNS 应存在");
  const testCases = [
    "[AI:gpt-4o] add feature",
    "Generated by Copilot",
    "Generated with Cursor",
    "AI-generated code",
    "🤖 generated by bot",
    "AI-assisted development",
  ];
  for (const tc of testCases) {
    const matched = AI_COMMIT_PATTERNS.some(p => p.test(tc));
    assert.ok(matched, `应匹配: "${tc}"`);
  }
});

test("AI_AUTHOR_NAMES 包含所有已知 AI 工具", () => {
  assert.ok(AI_AUTHOR_NAMES, "AI_AUTHOR_NAMES 应存在");
  const expected = ["copilot", "cursor", "claude", "chatgpt", "codeium", "windsurf", "aider", "gemini", "deepseek"];
  for (const name of expected) {
    assert.ok(AI_AUTHOR_NAMES.includes(name), `AI_AUTHOR_NAMES 应包含 "${name}"`);
  }
});

// ============================================================
// 结果汇总
// ============================================================

console.log("\n========================================");
console.log(` 溯源测试结果: ${passed} 通过, ${failed} 失败`);
console.log("========================================");

if (failed > 0) {
  console.log("\n失败详情:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
