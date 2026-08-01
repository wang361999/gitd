/**
 * tests/test-security.js
 * 安全检查脚本核心逻辑测试
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

const scriptPath = path.join(__dirname, "..", "scripts", "run-security.js");
const scriptContent = fs.readFileSync(scriptPath, "utf8");
const scriptWithoutMain = scriptContent.replace(/\nmain\(\);\s*$/, "");

const scriptWithExports = scriptWithoutMain + `
;this.__exports = {
  SECRET_RULES, UNSAFE_CODE_RULES, shannonEntropy, detectHighEntropy,
  isPlaceholder, isTestFile, isExampleFile, isToolFile, isScriptFile,
  isInStringLiteral, isRuleDefinitionLine,
  scanLine, calculateScore,
  generateRemediationPlan, isSuppressed, isSuppressedBlock, SUPPRESS_PATTERNS,
  PLACEHOLDER_VALUES, TEST_FILE_PATTERNS, EXAMPLE_FILE_PATTERNS,
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
  SECRET_RULES, UNSAFE_CODE_RULES, shannonEntropy, detectHighEntropy,
  isPlaceholder, isTestFile, isExampleFile, isToolFile, isScriptFile,
  isInStringLiteral, isRuleDefinitionLine,
  scanLine, calculateScore,
  generateRemediationPlan, isSuppressed, isSuppressedBlock,
} = sandbox.__exports || {};

// ============================================================
// 测试用例
// ============================================================

console.log("\n========================================");
console.log(" 安全检查脚本核心逻辑测试");
console.log("========================================\n");

// --- 密钥检测规则 ---

console.log("密钥检测规则:");

test("检测 AWS Access Key ID", () => {
  const line = 'const key = "AKIAIOSFODNN7XYZABCD";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 AWS Access Key");
  assert.strictEqual(issues[0].severity, "critical");
});

test("检测 GitHub Personal Access Token", () => {
  const line = 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 GitHub Token");
});

test("检测 Stripe Live Secret Key", () => {
  // 动态构建测试密钥，避免触发 GitHub Push Protection
  const prefix = "sk_" + "live_";
  const body = "ABCDEF" + "ghijkl" + "1234567890" + "ABCD";
  const line = `const key = "${prefix}${body}";`;
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 Stripe Key");
});

test("检测 Slack Bot Token", () => {
  const line = 'const token = "xoxb-1234567890-1234567890123";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 Slack Token");
});

test("检测 OpenAI API Key", () => {
  const line = 'const key = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890AB";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 OpenAI API Key");
  assert.strictEqual(issues[0].severity, "critical");
});

test("检测 GitLab Personal Access Token", () => {
  const line = 'const token = "glpat-1234567890abcdefghij";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 GitLab Token");
});

test("检测 HuggingFace Token", () => {
  const line = 'const token = "hf_1234567890abcdefghijklmnopqrstuvwxyz12";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 HuggingFace Token");
});

test("检测 Private Key Block", () => {
  const line = "-----BEGIN RSA PRIVATE KEY-----";
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到私钥");
  assert.strictEqual(issues[0].severity, "critical");
});

test("检测数据库连接字符串含密码", () => {
  const line = 'const url = "mongodb://user:password123@host:27017/db";';
  const issues = scanLine(SECRET_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到数据库连接字符串");
});

// --- 密钥检测规则数量 ---

console.log("\n密钥检测规则数量:");

test("密钥检测规则 >= 40 条", () => {
  assert.ok(SECRET_RULES.length >= 40, `密钥规则应 >= 40，当前: ${SECRET_RULES.length}`);
});

test("不安全代码规则 >= 35 条", () => {
  assert.ok(UNSAFE_CODE_RULES.length >= 35, `代码规则应 >= 35，当前: ${UNSAFE_CODE_RULES.length}`);
});

// --- 不安全代码检测 ---

console.log("\n不安全代码检测:");

test("检测 eval() 使用", () => {
  const line = "const result = eval(userInput);";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("eval")), "应检测到 eval");
});

test("检测 innerHTML 赋值", () => {
  const line = "element.innerHTML = userInput;";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("innerHTML")), "应检测到 innerHTML");
});

test("检测 dangerouslySetInnerHTML", () => {
  const line = "<div dangerouslySetInnerHTML={{__html: data}} />";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("dangerouslySetInnerHTML")));
});

test("检测 SQL 字符串拼接", () => {
  const line = 'db.query(`SELECT * FROM users WHERE id = ${userId}`);';
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到 SQL 注入风险");
});

test("检测 child_process exec 拼接", () => {
  const line = 'exec(`ls ${userInput}`);';
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.length > 0, "应检测到命令注入风险");
});

test("检测不安全的 crypto.createCipher", () => {
  const line = "const cipher = crypto.createCipher('aes-256-cbc', key);";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("createCipher")), "应检测到废弃的 createCipher");
});

test("检测开放重定向", () => {
  const line = "res.redirect(req.query.url);";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("重定向")), "应检测到开放重定向");
});

test("检测原型污染", () => {
  const line = "obj.__proto__ = malicious;";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "test.js", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("原型")), "应检测到原型污染");
});

// --- 熵值计算 ---

console.log("\n熵值计算:");

test("Shannon 熵值计算 - 高熵字符串", () => {
  const highEntropy = "aB3xY9kL2mN5pQ8rT4sW6uZ0vU7wE3tR5yI2oP9aB4cD6";
  const entropy = shannonEntropy(highEntropy);
  assert.ok(entropy > 4.0, `高熵字符串熵值应 > 4.0，实际: ${entropy.toFixed(2)}`);
});

test("Shannon 熵值计算 - 低熵字符串", () => {
  const lowEntropy = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const entropy = shannonEntropy(lowEntropy);
  assert.ok(entropy < 1.0, `低熵字符串熵值应 < 1.0，实际: ${entropy.toFixed(2)}`);
});

test("短字符串熵值为 0", () => {
  assert.strictEqual(shannonEntropy("short"), 0);
  assert.strictEqual(shannonEntropy(""), 0);
  assert.strictEqual(shannonEntropy(null), 0);
});

test("高熵字符串检测", () => {
  const line = 'const key = "aB3xY9kL2mN5pQ8rT4sW6uZ0vU7wE3tR5yI2oP9aB4cD6";';
  const issues = detectHighEntropy(line, "test.js", 1);
  assert.ok(issues.length > 0, "应检测到高熵字符串");
});

// --- 误报抑制 ---

console.log("\n误报抑制:");

test("占位符检测", () => {
  assert.ok(isPlaceholder("your-api-key"), "应检测到占位符");
  assert.ok(isPlaceholder("replace-me"), "应检测到占位符");
  assert.ok(isPlaceholder("YOUR_TOKEN_HERE"), "应检测到占位符");
  assert.ok(!isPlaceholder("AKIAIOSFODNN7XYZABCD"), "真实格式密钥不应被判定为占位符");
});

test("测试文件检测", () => {
  assert.ok(isTestFile("src/auth.test.js"), "应识别 .test.js");
  assert.ok(isTestFile("src/__tests__/auth.js"), "应识别 __tests__");
  assert.ok(isTestFile("tests/unit/auth.spec.ts"), "应识别 .spec.ts");
  assert.ok(!isTestFile("src/auth.js"), "普通文件不应被识别为测试文件");
});

test("示例文件检测", () => {
  assert.ok(isExampleFile(".env.example"), "应识别 .example");
  assert.ok(isExampleFile("config.sample"), "应识别 .sample");
  assert.ok(!isExampleFile("config.json"), "普通文件不应被识别为示例文件");
});

test("测试文件中密钥降级处理", () => {
  const line = 'const key = "AKIAIOSFODNN7XYZABCD";';
  const issues = scanLine(SECRET_RULES, line, "auth.test.js", 1, true, false);
  assert.ok(issues.length > 0, "测试文件中仍应报告");
  assert.ok(issues[0].severity === "low", "测试文件中 critical 应降级为 low");
});

// --- 抑制注释 ---

console.log("\n抑制注释:");

test("行内抑制注释 - forge:ignore-next-line", () => {
  const lines = ["// forge:ignore-next-line", "const key = 'secret';"];
  assert.ok(isSuppressed(lines, 2), "第 2 行应被抑制");
});

test("行内抑制注释 - noqa", () => {
  const lines = ["# noqa", "password = 'secret'"];
  assert.ok(isSuppressed(lines, 2), "第 2 行应被抑制");
});

test("行内抑制注释 - eslint-disable-next-line", () => {
  const lines = ["// eslint-disable-next-line", "eval('code');"];
  assert.ok(isSuppressed(lines, 2), "第 2 行应被抑制");
});

test("块级抑制 - forge:ignore-start/end", () => {
  const lines = [
    "// forge:ignore-start",
    "const key1 = 'secret1';",
    "const key2 = 'secret2';",
    "// forge:ignore-end",
    "const key3 = 'secret3';",
  ];
  assert.ok(isSuppressedBlock(lines, 2), "第 2 行应在抑制块内");
  assert.ok(isSuppressedBlock(lines, 3), "第 3 行应在抑制块内");
  assert.ok(!isSuppressedBlock(lines, 5), "第 5 行不应在抑制块内");
});

test("块级抑制 - eslint-disable/enable", () => {
  const lines = [
    "/* eslint-disable */",
    "eval('code');",
    "/* eslint-enable */",
    "eval('more');",
  ];
  assert.ok(isSuppressedBlock(lines, 2), "第 2 行应在抑制块内");
  assert.ok(!isSuppressedBlock(lines, 4), "第 4 行不应在抑制块内");
});

// --- 安全评分 ---

console.log("\n安全评分:");

test("无问题评分为 100", () => {
  assert.strictEqual(calculateScore([]), 100);
});

test("单个 critical 问题大幅降分", () => {
  const issues = [{ file: "a.js", line: 1, severity: "critical", type: "test" }];
  const score = calculateScore(issues);
  assert.ok(score < 75, `单个 critical 应降至 < 75，实际: ${score}`);
});

test("多个问题递减惩罚", () => {
  const single = [{ file: "a.js", line: 1, severity: "medium", type: "test" }];
  const multiple = [
    { file: "a.js", line: 1, severity: "medium", type: "test" },
    { file: "a.js", line: 2, severity: "medium", type: "test" },
    { file: "a.js", line: 3, severity: "medium", type: "test" },
  ];
  const singleScore = calculateScore(single);
  const multiScore = calculateScore(multiple);
  assert.ok(multiScore < singleScore, "多问题评分应低于单问题");
  assert.ok(multiScore > singleScore - 12, "递减惩罚: 后续惩罚应递减");
});

test("分散在多文件的问题有合理惩罚", () => {
  const singleFile = [
    { file: "a.js", line: 1, severity: "high", type: "eval" },
    { file: "a.js", line: 2, severity: "high", type: "eval" },
    { file: "a.js", line: 3, severity: "high", type: "eval" },
  ];
  const multiFile = [
    { file: "a.js", line: 1, severity: "high", type: "eval" },
    { file: "b.js", line: 1, severity: "high", type: "eval" },
    { file: "c.js", line: 1, severity: "high", type: "eval" },
  ];
  assert.ok(calculateScore(singleFile) < 100, "单文件多问题应有惩罚");
  assert.ok(calculateScore(multiFile) < 100, "多文件问题应有惩罚");
});

// --- 修复优先级 ---

console.log("\n修复优先级建议:");

test("Critical 密钥泄露生成 P0 建议", () => {
  const issues = [
    { file: "a.js", line: 1, severity: "critical", type: "AWS Access Key ID" },
  ];
  const plan = generateRemediationPlan(issues);
  assert.ok(plan.some(p => p.priority.includes("P0")), "应有 P0 优先级建议");
});

test("High 问题生成 P1 建议", () => {
  const issues = [
    { file: "a.js", line: 1, severity: "high", type: "eval() 使用" },
  ];
  const plan = generateRemediationPlan(issues);
  assert.ok(plan.some(p => p.priority.includes("P1")), "应有 P1 优先级建议");
});

test("无问题时不生成建议", () => {
  const plan = generateRemediationPlan([]);
  assert.strictEqual(plan.length, 0, "无问题时不应有建议");
});

// --- 规则完整性 ---

console.log("\n规则完整性:");

test("所有密钥规则都有 CWE 映射", () => {
  for (const rule of SECRET_RULES) {
    assert.ok(rule.cwe, `规则 "${rule.name}" 应有 CWE 映射`);
    assert.ok(rule.cwe.startsWith("CWE-"), `规则 "${rule.name}" 的 CWE 格式应正确`);
  }
});

test("所有密钥规则都有建议", () => {
  for (const rule of SECRET_RULES) {
    assert.ok(rule.suggestion, `规则 "${rule.name}" 应有修复建议`);
    assert.ok(rule.description, `规则 "${rule.name}" 应有描述`);
  }
});

test("所有规则都有 severity", () => {
  const validSeverities = ["critical", "high", "medium", "low", "info"];
  for (const rule of [...SECRET_RULES, ...UNSAFE_CODE_RULES]) {
    assert.ok(validSeverities.includes(rule.severity), `规则 "${rule.name}" 的 severity 应有效`);
  }
});

// --- 高级误报抑制 (v2.1) ---

console.log("\n高级误报抑制 (v2.1):");

test("工具文件识别", () => {
  assert.ok(isToolFile("scripts/run-security.js"), "应识别安全扫描器自身");
  assert.ok(isToolFile("scripts/run-provenance.js"), "应识别溯源脚本");
  assert.ok(isToolFile("tests/test-security.js"), "应识别测试文件");
  assert.ok(!isToolFile("app/page.tsx"), "应用代码不应被识别为工具文件");
  assert.ok(!isToolFile("lib/auth.ts"), "库文件不应被识别为工具文件");
});

test("脚本文件识别", () => {
  assert.ok(isScriptFile("scripts/generate-project.js"), "应识别 scripts/ 目录文件");
  assert.ok(isScriptFile("scripts/run-lore.js"), "应识别 scripts/ 目录文件");
  assert.ok(!isScriptFile("app/page.tsx"), "应用代码不应被识别为脚本文件");
  assert.ok(!isScriptFile("lib/auth.ts"), "库文件不应被识别为脚本文件");
});

test("字符串字面量检测 - 双引号", () => {
  const line = 'const desc = "使用 eval() 执行代码"';
  const matchIndex = line.indexOf("eval()");
  assert.ok(isInStringLiteral(line, matchIndex, 6), "双引号内的 eval() 应被识别为字符串");
});

test("字符串字面量检测 - 单引号", () => {
  const line = "const msg = 'eval is dangerous'";
  const matchIndex = line.indexOf("eval");
  assert.ok(isInStringLiteral(line, matchIndex, 4), "单引号内的 eval 应被识别为字符串");
});

test("字符串字面量检测 - 非字符串", () => {
  const line = "const result = eval(userInput);";
  const matchIndex = line.indexOf("eval()");
  assert.ok(!isInStringLiteral(line, matchIndex, 6), "非字符串中的 eval() 不应被识别为字符串");
});

test("字符串字面量检测 - 反引号模板", () => {
  const line = "const sql = `SELECT * FROM users WHERE id = ${userId}`";
  const matchIndex = line.indexOf("SELECT");
  assert.ok(isInStringLiteral(line, matchIndex, 6), "反引号内的内容应被识别为字符串");
});

test("规则定义行识别", () => {
  assert.ok(isRuleDefinitionLine('    pattern: /eval\\(/g,'), "应识别 pattern 定义行");
  assert.ok(isRuleDefinitionLine('    name: "eval() 使用",'), "应识别 name 定义行");
  assert.ok(isRuleDefinitionLine('    severity: "high",'), "应识别 severity 定义行");
  assert.ok(!isRuleDefinitionLine("const result = eval(input);"), "不应将普通代码识别为规则定义");
});

test("工具文件问题不影响评分", () => {
  const issues = [
    { file: "scripts/run-security.js", line: 1, severity: "critical", type: "eval", inTest: false, inExample: false },
    { file: "app/page.tsx", line: 1, severity: "medium", type: "xss", inTest: false, inExample: false },
  ];
  const score = calculateScore(issues);
  // 只有 app/page.tsx 的 medium 问题影响评分，扣 4 分
  assert.ok(score === 96, `工具文件问题应被排除，预期 96，实际: ${score}`);
});

test("测试文件问题不影响评分", () => {
  const issues = [
    { file: "auth.test.js", line: 1, severity: "critical", type: "key", inTest: true, inExample: false },
    { file: "app/page.tsx", line: 1, severity: "high", type: "xss", inTest: false, inExample: false },
  ];
  const score = calculateScore(issues);
  // 只有 app/page.tsx 的 high 问题影响评分
  assert.ok(score < 100, "生产代码问题应影响评分");
  assert.ok(score > 80, "测试文件问题应被排除，评分不应过低");
});

test("info 级别问题不影响评分", () => {
  const issues = [
    { file: "app/page.tsx", line: 1, severity: "info", type: "console.log", inTest: false, inExample: false },
    { file: "app/page.tsx", line: 2, severity: "info", type: "console.log", inTest: false, inExample: false },
    { file: "app/page.tsx", line: 3, severity: "info", type: "console.log", inTest: false, inExample: false },
  ];
  const score = calculateScore(issues);
  assert.strictEqual(score, 100, "info 级别问题不应影响评分");
});

test("脚本文件中 console.log 不被检测", () => {
  const line = "console.log('processing...');";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "scripts/generate-project.js", 1, false, false);
  assert.ok(issues.length === 0 || !issues.some(i => i.type.includes("console.log")), "脚本文件中 console.log 不应被检测");
});

test("应用代码中 console.log 仍被检测", () => {
  const line = "console.log('debug info');";
  const issues = scanLine(UNSAFE_CODE_RULES, line, "app/page.tsx", 1, false, false);
  assert.ok(issues.some(i => i.type.includes("console.log")), "应用代码中 console.log 应被检测");
});

// ============================================================
// 结果汇总
// ============================================================

console.log("\n========================================");
console.log(` 安全测试结果: ${passed} 通过, ${failed} 失败`);
console.log("========================================");

if (failed > 0) {
  console.log("\n失败详情:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err}`);
  }
  process.exit(1);
}
