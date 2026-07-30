/**
 * scripts/run-security.js
 * 安全检查脚本：扫描硬编码密钥、依赖漏洞、不安全代码模式，输出安全报告。
 *
 * 输出: .forge/security-report.json
 *   {
 *     "generatedAt": "ISO 时间",
 *     "score": 0-100,
 *     "summary": { "total": N, "critical": N, "high": N, "medium": N, "low": N },
 *     "issues": [
 *       { "file": "...", "line": N, "severity": "critical|high|medium|low", "type": "...", "description": "...", "suggestion": "..." }
 *     ],
 *     "dependencies": { "vulnerable": N, "details": [...] }
 *   }
 *
 * 环境变量: 无强制要求
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".forge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "security-report.json");

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
  "coverage",
]);

/** 需要扫描的文件扩展名 */
const SCAN_EXTS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".py",
  ".java",
  ".go",
  ".rb",
  ".php",
  ".env",
  ".yaml",
  ".yml",
  ".json",
  ".sh",
  ".sql",
]);

// ============================================================
// 检测规则
// ============================================================

/** 硬编码密钥 / 凭证检测规则 */
const SECRET_RULES = [
  {
    name: "AWS Access Key",
    severity: "critical",
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: "检测到 AWS Access Key ID 硬编码",
    suggestion: "使用环境变量或密钥管理服务 (AWS Secrets Manager / 环境变量) 存储",
  },
  {
    name: "AWS Secret Key",
    severity: "critical",
    pattern: /aws_secret_access_key\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/gi,
    description: "检测到 AWS Secret Access Key 硬编码",
    suggestion: "将密钥移至环境变量或密钥管理服务",
  },
  {
    name: "GitHub Token",
    severity: "critical",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    description: "检测到 GitHub Personal Access Token 硬编码",
    suggestion: "使用 GitHub Secrets 或环境变量存储 token",
  },
  {
    name: "Generic API Key",
    severity: "high",
    pattern: /(api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi,
    description: "检测到通用 API Key 硬编码",
    suggestion: "将 API Key 存储在环境变量中，不要写入代码",
  },
  {
    name: "Bearer Token",
    severity: "high",
    pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/g,
    description: "检测到 Bearer Token 硬编码",
    suggestion: "从环境变量动态获取 token",
  },
  {
    name: "Password Assignment",
    severity: "high",
    pattern: /(password|passwd|pwd)\s*[:=]\s*["'][^"'\s]{6,}["']/gi,
    description: "检测到密码明文赋值",
    suggestion: "密码不应硬编码，应使用安全的凭证存储",
  },
  {
    name: "Private Key Block",
    severity: "critical",
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    description: "检测到私钥文件内容",
    suggestion: "私钥文件不应提交到代码仓库，加入 .gitignore",
  },
  {
    name: "Connection String",
    severity: "high",
    pattern: /(mongodb(\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到含凭证的数据库连接字符串",
    suggestion: "连接字符串中的密码应来自环境变量",
  },
];

/** 不安全代码模式检测规则 */
const UNSAFE_CODE_RULES = [
  {
    name: "eval 使用",
    severity: "high",
    pattern: /\beval\s*\(/g,
    description: "使用了 eval()，存在代码注入风险",
    suggestion: "避免使用 eval，改用 JSON.parse 或更安全的替代方案",
  },
  {
    name: "innerHTML 赋值",
    severity: "high",
    pattern: /\.innerHTML\s*=/g,
    description: "直接设置 innerHTML，存在 XSS 风险",
    suggestion: "使用 textContent 或对内容进行转义后再插入 DOM",
  },
  {
    name: "dangerouslySetInnerHTML",
    severity: "high",
    pattern: /dangerouslySetInnerHTML/g,
    description: "React 中使用 dangerouslySetInnerHTML，存在 XSS 风险",
    suggestion: "确保数据来源可信，或使用 DOMPurify 进行清洗",
  },
  {
    name: "SQL 字符串拼接",
    severity: "high",
    pattern: /(execute|query|exec)\s*\(\s*["'`].*?\$\{.*?\}.*?["'`]/gi,
    description: "SQL 查询使用字符串拼接，存在 SQL 注入风险",
    suggestion: "使用参数化查询 / 预编译语句",
  },
  {
    name: "document.write",
    severity: "medium",
    pattern: /document\.write\s*\(/g,
    description: "使用 document.write，存在 XSS 与覆盖文档风险",
    suggestion: "使用 DOM API 操作元素内容",
  },
  {
    name: "Function 构造器",
    severity: "high",
    pattern: /new\s+Function\s*\(/g,
    description: "使用 new Function() 动态执行代码，存在注入风险",
    suggestion: "避免动态代码执行，使用静态定义",
  },
  {
    name: "child_process exec 拼接",
    severity: "high",
    pattern: /(?:exec|execSync)\s*\(\s*["'`].*?\$\{.*?\}.*?["'`]/gi,
    description: "child_process exec 使用字符串拼接，存在命令注入风险",
    suggestion: "使用 execFile 并以数组形式传参，避免 shell 拼接",
  },
  {
    name: "disable SSL 校验",
    severity: "medium",
    pattern: /rejectUnauthorized\s*:\s*false/g,
    description: "禁用了 SSL 证书校验",
    suggestion: "生产环境不要禁用证书校验，应配置正确的 CA 证书",
  },
  {
    name: "crypto Math.random",
    severity: "medium",
    pattern: /Math\.random\s*\(/g,
    description: "使用 Math.random() 生成随机数（不安全）",
    suggestion: "涉及安全场景请使用 crypto.getRandomValues 或 crypto.randomBytes",
  },
];

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_WEIGHT = { critical: 25, high: 10, medium: 4, low: 1 };

/** 递归收集需扫描的文件 */
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
      const ext = path.extname(entry.name).toLowerCase();
      // .env 类文件
      if (SCAN_EXTS.has(ext) || entry.name.startsWith(".env")) {
        results.push(relPath);
      }
    }
  }
  return results;
}

/** 对单行应用规则，返回匹配到的 issues */
function scanLine(rules, lineText, file, lineNum) {
  const issues = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0; // 重置 lastIndex (g 标志)
    const match = rule.pattern.exec(lineText);
    if (match) {
      issues.push({
        file,
        line: lineNum,
        severity: rule.severity,
        type: rule.name,
        description: rule.description,
        suggestion: rule.suggestion,
        snippet: lineText.trim().slice(0, 120),
      });
    }
  }
  return issues;
}

/** 扫描单个文件 */
function scanFile(file) {
  const issues = [];
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    // 跳过注释行（简单启发式）
    const trimmed = lineText.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      // 注释中仍扫描密钥泄露，但不扫描不安全代码
      issues.push(...scanLine(SECRET_RULES, lineText, file, i + 1));
      continue;
    }
    issues.push(...scanLine(SECRET_RULES, lineText, file, i + 1));
    issues.push(...scanLine(UNSAFE_CODE_RULES, lineText, file, i + 1));
  }

  return issues;
}

/** 运行 npm audit 获取依赖漏洞 */
function runNpmAudit() {
  console.log("\n  运行 npm audit 检查依赖漏洞 ...");

  if (!fs.existsSync(path.join(ROOT, "package.json"))) {
    console.log("  未找到 package.json，跳过依赖审计");
    return { vulnerable: 0, details: [] };
  }

  let auditData;
  try {
    const raw = execSync("npm audit --json", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    auditData = JSON.parse(raw);
  } catch (err) {
    // npm audit 在有漏洞时退出码非 0，但 stdout 仍有 JSON
    if (err.stdout) {
      try {
        auditData = JSON.parse(err.stdout);
      } catch {
        console.warn("  npm audit 输出解析失败");
        return { vulnerable: 0, details: [] };
      }
    } else {
      console.warn("  npm audit 执行失败:", (err.message || "").slice(0, 100));
      return { vulnerable: 0, details: [] };
    }
  }

  const vulnerabilities = auditData.vulnerabilities || {};
  const details = [];

  for (const [pkg, info] of Object.entries(vulnerabilities)) {
    const severity = info.severity || "medium";
    const via = Array.isArray(info.via) ? info.via : [];
    const advisory = via.find((v) => typeof v === "object");
    details.push({
      package: pkg,
      severity,
      title: advisory?.title || "未知漏洞",
      url: advisory?.url || null,
      range: info.range || null,
      fixAvailable: !!info.fixAvailable,
    });
  }

  // 转换为统一 issues 格式
  const depIssues = details.map((d) => ({
    file: "package.json",
    line: 0,
    severity: d.severity,
    type: `依赖漏洞: ${d.package}`,
    description: `${d.package} ${d.range || ""} 存在漏洞: ${d.title}`,
    suggestion: d.fixAvailable ? "运行 npm audit fix 修复" : "升级或替换该依赖",
  }));

  return {
    vulnerable: details.length,
    details,
    issues: depIssues,
  };
}

/** 计算安全评分 (0-100) */
function calculateScore(issues) {
  let penalty = 0;
  for (const issue of issues) {
    penalty += SEVERITY_WEIGHT[issue.severity] || 1;
  }
  const score = Math.max(0, 100 - penalty);
  return score;
}

/** 统计摘要 */
function summarize(issues) {
  const summary = { total: issues.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    summary[issue.severity] = (summary[issue.severity] || 0) + 1;
  }
  return summary;
}

/** 主流程 */
function main() {
  console.log("========================================");
  console.log(" Agent Forge - 安全检查脚本");
  console.log("========================================");

  console.log("\n[1/3] 收集并扫描源码文件 ...");
  const files = collectFiles(ROOT);
  console.log(`  共发现 ${files.length} 个待扫描文件`);

  let allIssues = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileIssues = scanFile(file);
    if (fileIssues.length > 0) {
      console.log(`  [${i + 1}/${files.length}] ${file}: 发现 ${fileIssues.length} 个问题`);
    }
    allIssues.push(...fileIssues);
  }

  console.log(`\n[2/3] 扫描代码问题完成，共 ${allIssues.length} 个问题`);

  // 依赖漏洞审计
  const audit = runNpmAudit();
  if (audit.issues) {
    allIssues.push(...audit.issues);
  }

  // 按严重程度排序
  allIssues.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  console.log(`\n[3/3] 生成安全报告 ...`);
  const score = calculateScore(allIssues);
  const summary = summarize(allIssues);

  const report = {
    generatedAt: new Date().toISOString(),
    score,
    summary,
    issues: allIssues,
    dependencies: {
      vulnerable: audit.vulnerable || 0,
      details: audit.details || [],
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("\n========================================");
  console.log(" 安全检查完成！");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`安全评分: ${score}/100`);
  console.log(`问题统计: 严重=${summary.critical} 高危=${summary.high} 中危=${summary.medium} 低危=${summary.low}`);
  console.log(`依赖漏洞: ${report.dependencies.vulnerable} 个`);
}

main();
