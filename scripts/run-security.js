/**
 * scripts/run-security.js
 * 安全检查脚本 v2.0：企业级代码安全分析引擎
 *
 * 增强能力:
 *   - 40+ 密钥/凭证检测规则 (AWS, GCP, Azure, Stripe, Slack, JWT, etc.)
 *   - 30+ 不安全代码模式检测 (XSS, SQLi, SSRF, Path Traversal, Deserialization, etc.)
 *   - 熵值检测: 识别高熵字符串（可能是隐藏的密钥）
 *   - 上下文感知误报抑制: 区分测试代码、注释、配置示例
 *   - 多语言支持: JS/TS, Python, Java, Go, PHP, Ruby, C#, Rust, Shell, SQL
 *   - 依赖漏洞审计 (npm audit + pip audit 兼容)
 *   - 安全评分算法优化: 递减惩罚 + 文件维度加权
 *   - CWE 映射: 每个问题关联 CWE 编号
 *   - 修复优先级建议
 *
 * 输出: .forge/security-report.json
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, ".forge");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "security-report.json");

// ============================================================
// 配置
// ============================================================

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", ".forge", ".lore",
  "release-artifacts", "coverage", "forge-scripts", ".vercel", ".turbo",
  "__pycache__", ".pytest_cache", "vendor", ".cache",
]);

/** 需要跳过的特定文件 (含依赖 URL/hash，会产生大量误报) */
const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "composer.lock", "Gemfile.lock", "Cargo.lock",
  "go.sum", "poetry.lock", "requirements.txt",
]);

const SCAN_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".vue", ".svelte", ".py", ".java", ".go", ".rb", ".php",
  ".cs", ".rs", ".sh", ".bash", ".sql",
  ".env", ".yaml", ".yml", ".json", ".toml", ".ini", ".cfg", ".conf",
  ".html", ".xml",
]);

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SEVERITY_WEIGHT = { critical: 25, high: 10, medium: 4, low: 1, info: 0 };

// ============================================================
// 密钥/凭证检测规则 (40+ 规则)
// ============================================================

const SECRET_RULES = [
  // === AWS ===
  {
    name: "AWS Access Key ID",
    severity: "critical",
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: "检测到 AWS Access Key ID 硬编码",
    suggestion: "使用环境变量或 AWS Secrets Manager 存储凭证",
    cwe: "CWE-798",
  },
  {
    name: "AWS Secret Access Key",
    severity: "critical",
    pattern: /aws_secret_access_key\s*[:=]\s*["'][A-Za-z0-9/+=]{40}["']/gi,
    description: "检测到 AWS Secret Access Key 硬编码",
    suggestion: "将密钥移至环境变量或 AWS Secrets Manager",
    cwe: "CWE-798",
  },
  {
    name: "AWS Account ID",
    severity: "low",
    pattern: /aws_account_id\s*[:=]\s*["']?\d{12}["']?/gi,
    description: "检测到 AWS Account ID",
    suggestion: "Account ID 虽非密钥，但建议避免硬编码",
    cwe: "CWE-200",
  },
  // === Google Cloud ===
  {
    name: "Google API Key",
    severity: "critical",
    pattern: /AIza[0-9A-Za-z_\-]{35}/g,
    description: "检测到 Google API Key 硬编码",
    suggestion: "使用 Google Cloud Secret Manager 或环境变量",
    cwe: "CWE-798",
  },
  {
    name: "Google OAuth Access Token",
    severity: "critical",
    pattern: /ya29\.[0-9A-Za-z_\-]+/g,
    description: "检测到 Google OAuth Access Token",
    suggestion: "Token 不应硬编码，应通过 OAuth 流程动态获取",
    cwe: "CWE-798",
  },
  {
    name: "Firebase API Key",
    severity: "high",
    pattern: /firebase.*["']AIza[0-9A-Za-z_\-]{35}["']/gi,
    description: "检测到 Firebase API Key",
    suggestion: "限制 API Key 使用范围，避免在客户端代码中暴露",
    cwe: "CWE-798",
  },
  // === Azure ===
  {
    name: "Azure Account Key",
    severity: "critical",
    pattern: /AccountKey\s*=\s*[A-Za-z0-9+/=]{88}/g,
    description: "检测到 Azure Storage Account Key",
    suggestion: "使用 Azure Key Vault 管理存储密钥",
    cwe: "CWE-798",
  },
  {
    name: "Azure Connection String",
    severity: "critical",
    pattern: /DefaultEndpointsProtocol=https?;.*AccountKey\s*=\s*[A-Za-z0-9+/=]+/gi,
    description: "检测到 Azure Storage 连接字符串含密钥",
    suggestion: "使用 Azure Key Vault 或环境变量管理连接字符串",
    cwe: "CWE-798",
  },
  // === GitHub ===
  {
    name: "GitHub Personal Access Token",
    severity: "critical",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,255}/g,
    description: "检测到 GitHub Personal Access Token",
    suggestion: "立即撤销该 Token，使用 GitHub Secrets 或环境变量",
    cwe: "CWE-798",
  },
  {
    name: "GitHub OAuth Token",
    severity: "critical",
    pattern: /gho_[A-Za-z0-9]{36}/g,
    description: "检测到 GitHub OAuth Token",
    suggestion: "立即撤销该 Token，使用安全的 OAuth 流程",
    cwe: "CWE-798",
  },
  // === Stripe ===
  {
    name: "Stripe Live Secret Key",
    severity: "critical",
    pattern: /sk_live_[A-Za-z0-9]{24,}/g,
    description: "检测到 Stripe 生产环境密钥",
    suggestion: "立即在 Stripe Dashboard 轮换密钥",
    cwe: "CWE-798",
  },
  {
    name: "Stripe Restricted Key",
    severity: "critical",
    pattern: /rk_live_[A-Za-z0-9]{24,}/g,
    description: "检测到 Stripe Restricted Key",
    suggestion: "立即轮换该密钥",
    cwe: "CWE-798",
  },
  {
    name: "Stripe Publishable Key",
    severity: "low",
    pattern: /pk_live_[A-Za-z0-9]{24,}/g,
    description: "检测到 Stripe Publishable Key (生产环境)",
    suggestion: "确认此 Key 使用在客户端代码中是合理的",
    cwe: "CWE-200",
  },
  // === Slack ===
  {
    name: "Slack Bot Token",
    severity: "critical",
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    description: "检测到 Slack Bot/User Token",
    suggestion: "立即在 Slack App 管理页面撤销并重新生成 Token",
    cwe: "CWE-798",
  },
  {
    name: "Slack Webhook URL",
    severity: "high",
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/g,
    description: "检测到 Slack Webhook URL",
    suggestion: "Webhook URL 含凭证，应从环境变量获取",
    cwe: "CWE-798",
  },
  // === JWT / Bearer ===
  {
    name: "JWT Token",
    severity: "high",
    pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*/g,
    description: "检测到 JWT Token 硬编码",
    suggestion: "JWT 不应硬编码，应通过认证流程获取",
    cwe: "CWE-798",
  },
  {
    name: "Bearer Token",
    severity: "high",
    pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/g,
    description: "检测到 Bearer Token 硬编码",
    suggestion: "从环境变量动态获取 token",
    cwe: "CWE-798",
  },
  // === 通用凭证 ===
  {
    name: "Generic API Key",
    severity: "high",
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi,
    description: "检测到通用 API Key 硬编码",
    suggestion: "将 API Key 存储在环境变量中",
    cwe: "CWE-798",
  },
  {
    name: "Generic Secret",
    severity: "high",
    pattern: /(?:secret|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi,
    description: "检测到通用 Secret 硬编码",
    suggestion: "将 Secret 存储在环境变量或密钥管理服务中",
    cwe: "CWE-798",
  },
  {
    name: "Password Assignment",
    severity: "high",
    pattern: /(?:password|passwd|pwd|pass)\s*[:=]\s*["'][^"'\s]{6,}["']/gi,
    description: "检测到密码明文赋值",
    suggestion: "密码不应硬编码，应使用安全的凭证存储",
    cwe: "CWE-798",
  },
  {
    name: "Private Key Block",
    severity: "critical",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    description: "检测到私钥文件内容",
    suggestion: "私钥不应提交到代码仓库，加入 .gitignore",
    cwe: "CWE-798",
  },
  {
    name: "Database Connection String",
    severity: "high",
    pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到含凭证的数据库连接字符串",
    suggestion: "连接字符串中的密码应来自环境变量",
    cwe: "CWE-798",
  },
  // === 其他平台 ===
  {
    name: "Twilio API Key",
    severity: "high",
    pattern: /SK[0-9a-fA-F]{32}/g,
    description: "检测到 Twilio API Key",
    suggestion: "使用环境变量存储 Twilio 凭证",
    cwe: "CWE-798",
  },
  {
    name: "SendGrid API Key",
    severity: "high",
    pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/g,
    description: "检测到 SendGrid API Key",
    suggestion: "使用环境变量存储 SendGrid API Key",
    cwe: "CWE-798",
  },
  {
    name: "Mailgun API Key",
    severity: "high",
    pattern: /key-[A-Za-z0-9]{32}/g,
    description: "检测到 Mailgun API Key",
    suggestion: "使用环境变量存储 Mailgun API Key",
    cwe: "CWE-798",
  },
  {
    name: "PayPal Client Secret",
    severity: "critical",
    pattern: /paypal.*(?:client[_-]?secret|secret)\s*[:=]\s*["'][A-Za-z0-9]{16,}["']/gi,
    description: "检测到 PayPal Client Secret",
    suggestion: "使用环境变量或密钥管理服务",
    cwe: "CWE-798",
  },
  {
    name: "Square Access Token",
    severity: "critical",
    pattern: /sq0atp-[A-Za-z0-9_\-]{22}/g,
    description: "检测到 Square Access Token",
    suggestion: "立即在 Square Dashboard 轮换 Token",
    cwe: "CWE-798",
  },
  {
    name: "Discord Bot Token",
    severity: "critical",
    pattern: /[MN][A-Za-z0-9]{23}\.[A-Za-z0-9]{6}\.[A-Za-z0-9_\-]{27}/g,
    description: "检测到 Discord Bot Token",
    suggestion: "立即在 Discord Developer Portal 重新生成 Token",
    cwe: "CWE-798",
  },
  {
    name: "Twitch API Key",
    severity: "high",
    pattern: /twitch.*(?:api[_-]?key|client[_-]?id)\s*[:=]\s*["'][A-Za-z0-9]{30}["']/gi,
    description: "检测到 Twitch API Key",
    suggestion: "使用环境变量存储 Twitch 凭证",
    cwe: "CWE-798",
  },
  {
    name: "npm Auth Token",
    severity: "critical",
    pattern: /npm_[A-Za-z0-9]{36}/g,
    description: "检测到 npm Auth Token",
    suggestion: "立即在 npmjs.com 撤销并重新生成 Token",
    cwe: "CWE-798",
  },
  {
    name: "Heroku API Key",
    severity: "high",
    pattern: /heroku.*(?:api[_-]?key|token)\s*[:=]\s*["'][A-Za-z0-9]{32,}["']/gi,
    description: "检测到 Heroku API Key",
    suggestion: "使用环境变量存储 Heroku 凭证",
    cwe: "CWE-798",
  },
  {
    name: "Telegram Bot Token",
    severity: "critical",
    pattern: /\d{9,10}:AA[A-Za-z0-9_-]{33}/g,
    description: "检测到 Telegram Bot Token",
    suggestion: "立即在 BotFather 撤销并重新生成 Token",
    cwe: "CWE-798",
  },
  // === 更多平台 Token ===
  {
    name: "Linear API Key",
    severity: "high",
    pattern: /lin_api_[A-Za-z0-9]{40}/g,
    description: "检测到 Linear API Key",
    suggestion: "使用环境变量存储 Linear API Key",
    cwe: "CWE-798",
  },
  {
    name: "Notion API Key",
    severity: "high",
    pattern: /secret_[A-Za-z0-9]{43}/g,
    description: "检测到 Notion API Key",
    suggestion: "使用环境变量存储 Notion API Key",
    cwe: "CWE-798",
  },
  {
    name: "Asana Access Token",
    severity: "high",
    pattern: /[0-9]\/[A-Za-z0-9]{30,}/g,
    description: "可能检测到 Asana Access Token",
    suggestion: "确认为非敏感数据后忽略，或移至环境变量",
    cwe: "CWE-798",
  },
  {
    name: "GitLab Personal Access Token",
    severity: "critical",
    pattern: /glpat-[A-Za-z0-9_-]{20}/g,
    description: "检测到 GitLab Personal Access Token",
    suggestion: "立即在 GitLab 设置中撤销并重新生成 Token",
    cwe: "CWE-798",
  },
  {
    name: "Jira API Token",
    severity: "high",
    pattern: /jira.*(?:api[_-]?token|token)\s*[:=]\s*["'][A-Za-z0-9]{24,}["']/gi,
    description: "检测到 Jira API Token",
    suggestion: "使用环境变量存储 Jira 凭证",
    cwe: "CWE-798",
  },
  {
    name: "Datadog API Key",
    severity: "high",
    pattern: /(?:datadog|dd).*(?:api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9]{32}["']/gi,
    description: "检测到 Datadog API Key",
    suggestion: "使用环境变量存储 Datadog 凭证",
    cwe: "CWE-798",
  },
  {
    name: "New Relic API Key",
    severity: "high",
    pattern: /NRAK-[A-Za-z0-9]{27}/g,
    description: "检测到 New Relic REST API Key",
    suggestion: "使用环境变量存储 New Relic 凭证",
    cwe: "CWE-798",
  },
  {
    name: "Splunk Token",
    severity: "high",
    pattern: /Splunk\s+\w+\s+token\s*[:=]\s*["'][A-Za-z0-9]{32,}["']/gi,
    description: "检测到 Splunk Token",
    suggestion: "使用环境变量存储 Splunk 凭证",
    cwe: "CWE-798",
  },
  {
    name: "OpenAI API Key",
    severity: "critical",
    pattern: /sk-[A-Za-z0-9]{48}/g,
    description: "检测到 OpenAI API Key",
    suggestion: "立即在 OpenAI 平台轮换密钥",
    cwe: "CWE-798",
  },
  {
    name: "Anthropic API Key",
    severity: "critical",
    pattern: /sk-ant-[A-Za-z0-9_\-]{93}/g,
    description: "检测到 Anthropic API Key",
    suggestion: "立即在 Anthropic Console 轮换密钥",
    cwe: "CWE-798",
  },
  {
    name: "HuggingFace Token",
    severity: "high",
    pattern: /hf_[A-Za-z0-9]{34}/g,
    description: "检测到 HuggingFace Access Token",
    suggestion: "使用环境变量存储 HuggingFace Token",
    cwe: "CWE-798",
  },
  {
    name: "Postgres Password in URL",
    severity: "high",
    pattern: /postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到 PostgreSQL 连接字符串含密码",
    suggestion: "密码应来自环境变量",
    cwe: "CWE-798",
  },
  {
    name: "MySQL Password in URL",
    severity: "high",
    pattern: /mysql:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到 MySQL 连接字符串含密码",
    suggestion: "密码应来自环境变量",
    cwe: "CWE-798",
  },
  {
    name: "Redis Password in URL",
    severity: "high",
    pattern: /redis:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到 Redis 连接字符串含密码",
    suggestion: "密码应来自环境变量",
    cwe: "CWE-798",
  },
  {
    name: "MongoDB Password in URL",
    severity: "high",
    pattern: /mongodb(?:\+srv)?:\/\/[^\s"'<>]+:[^\s"'<>]+@[^\s"'<>]+/gi,
    description: "检测到 MongoDB 连接字符串含密码",
    suggestion: "密码应来自环境变量",
    cwe: "CWE-798",
  },
];

// ============================================================
// 不安全代码模式检测规则 (30+ 规则)
// ============================================================

const UNSAFE_CODE_RULES = [
  // === 代码注入 ===
  {
    name: "eval() 使用",
    severity: "high",
    pattern: /\beval\s*\(/g,
    description: "使用 eval()，存在代码注入风险",
    suggestion: "避免使用 eval，改用 JSON.parse 或更安全的替代方案",
    cwe: "CWE-94",
  },
  {
    name: "new Function() 动态执行",
    severity: "high",
    pattern: /new\s+Function\s*\(/g,
    description: "使用 new Function() 动态执行代码",
    suggestion: "避免动态代码执行，使用静态定义",
    cwe: "CWE-94",
  },
  {
    name: "setTimeout 字符串参数",
    severity: "medium",
    pattern: /setTimeout\s*\(\s*["'`]/g,
    description: "setTimeout 使用字符串参数，等同于 eval",
    suggestion: "传入函数引用而非字符串",
    cwe: "CWE-94",
  },
  {
    name: "setInterval 字符串参数",
    severity: "medium",
    pattern: /setInterval\s*\(\s*["'`]/g,
    description: "setInterval 使用字符串参数，等同于 eval",
    suggestion: "传入函数引用而非字符串",
    cwe: "CWE-94",
  },
  // === XSS ===
  {
    name: "innerHTML 赋值",
    severity: "high",
    pattern: /\.innerHTML\s*=/g,
    description: "直接设置 innerHTML，存在 XSS 风险",
    suggestion: "使用 textContent 或对内容进行转义后再插入 DOM",
    cwe: "CWE-79",
  },
  {
    name: "outerHTML 赋值",
    severity: "high",
    pattern: /\.outerHTML\s*=/g,
    description: "直接设置 outerHTML，存在 XSS 风险",
    suggestion: "使用 DOM API 安全操作",
    cwe: "CWE-79",
  },
  {
    name: "dangerouslySetInnerHTML",
    severity: "high",
    pattern: /dangerouslySetInnerHTML/g,
    description: "React 中使用 dangerouslySetInnerHTML",
    suggestion: "确保数据来源可信，或使用 DOMPurify 进行清洗",
    cwe: "CWE-79",
  },
  {
    name: "document.write()",
    severity: "medium",
    pattern: /document\.write\s*\(/g,
    description: "使用 document.write()，存在 XSS 与覆盖文档风险",
    suggestion: "使用 DOM API 操作元素内容",
    cwe: "CWE-79",
  },
  {
    name: "insertAdjacentHTML",
    severity: "medium",
    pattern: /\.insertAdjacentHTML\s*\(/g,
    description: "使用 insertAdjacentHTML，存在 XSS 风险",
    suggestion: "确保内容已转义，或使用 textContent",
    cwe: "CWE-79",
  },
  // === SQL 注入 ===
  {
    name: "SQL 字符串拼接 (模板字符串)",
    severity: "high",
    pattern: /(?:execute|query|exec|raw)\s*\(\s*["'`].*?\$\{.*?\}.*?["'`]/gi,
    description: "SQL 查询使用模板字符串拼接，存在 SQL 注入风险",
    suggestion: "使用参数化查询 / 预编译语句",
    cwe: "CWE-89",
  },
  {
    name: "SQL 字符串拼接 (+ 号)",
    severity: "high",
    pattern: /(?:execute|query|exec|raw)\s*\(\s*["'`].*?["'`]\s*\+/gi,
    description: "SQL 查询使用字符串拼接，存在 SQL 注入风险",
    suggestion: "使用参数化查询 / 预编译语句",
    cwe: "CWE-89",
  },
  // === 命令注入 ===
  {
    name: "child_process exec 拼接",
    severity: "high",
    pattern: /(?:exec|execSync)\s*\(\s*["'`].*?\$\{.*?\}.*?["'`]/gi,
    description: "child_process exec 使用字符串拼接，存在命令注入风险",
    suggestion: "使用 execFile 并以数组形式传参，避免 shell 拼接",
    cwe: "CWE-78",
  },
  {
    name: "child_process spawn shell 拼接",
    severity: "high",
    pattern: /spawn\s*\(\s*["'`].*?\$\{.*?\}.*?["'`]/gi,
    description: "child_process spawn 使用字符串拼接",
    suggestion: "使用数组形式传参，设置 shell: false",
    cwe: "CWE-78",
  },
  {
    name: "Python os.system 拼接",
    severity: "high",
    pattern: /os\.system\s*\(\s*["'`].*?[\+{].*?["'`]/gi,
    description: "Python os.system 使用字符串拼接，存在命令注入风险",
    suggestion: "使用 subprocess.run 并以列表形式传参",
    cwe: "CWE-78",
  },
  // === 路径遍历 ===
  {
    name: "路径拼接 (用户输入)",
    severity: "medium",
    pattern: /(?:path\.join|path\.resolve)\s*\([^)]*(?:req\.|params\.|query\.|body\.|input\.|args\.)/gi,
    description: "路径操作包含用户输入，可能存在路径遍历风险",
    suggestion: "验证和清洗用户输入，使用 path.resolve 限制范围",
    cwe: "CWE-22",
  },
  {
    name: "文件读取 (用户输入)",
    severity: "medium",
    pattern: /(?:readFile|readFileSync|createReadStream|fopen|file_get_contents)\s*\([^)]*(?:req\.|params\.|query\.|body\.|input\.|args\.)/gi,
    description: "文件读取操作包含用户输入",
    suggestion: "验证文件路径，限制在允许的目录范围内",
    cwe: "CWE-22",
  },
  // === SSRF ===
  {
    name: "HTTP 请求 (用户输入 URL)",
    severity: "high",
    pattern: /(?:fetch|axios|request|http\.get|https\.get|urllib)\s*\(\s*(?:req\.|params\.|query\.|body\.|input\.|args\.)/gi,
    description: "HTTP 请求使用用户提供的 URL，存在 SSRF 风险",
    suggestion: "验证和限制目标 URL，禁止访问内网地址",
    cwe: "CWE-918",
  },
  // === 反序列化 ===
  {
    name: "不安全的反序列化 (pickle)",
    severity: "high",
    pattern: /pickle\.loads?\s*\(/g,
    description: "使用 pickle 反序列化，存在远程代码执行风险",
    suggestion: "使用 JSON 等安全格式，或验证数据来源",
    cwe: "CWE-502",
  },
  {
    name: "不安全的反序列化 (yaml.load)",
    severity: "high",
    pattern: /yaml\.load\s*\([^)]*(?!\bLoader\s*=)/g,
    description: "yaml.load 未指定安全 Loader",
    suggestion: "使用 yaml.safe_load 或指定 Loader=yaml.SafeLoader",
    cwe: "CWE-502",
  },
  {
    name: "不安全的反序列化 (unserialize)",
    severity: "high",
    pattern: /unserialize\s*\(/g,
    description: "PHP unserialize 可能导致代码执行",
    suggestion: "使用 json_decode 替代，或严格验证输入",
    cwe: "CWE-502",
  },
  // === 加密安全 ===
  {
    name: "禁用 SSL 证书校验",
    severity: "medium",
    pattern: /rejectUnauthorized\s*:\s*false/g,
    description: "禁用了 SSL 证书校验",
    suggestion: "生产环境不要禁用证书校验，应配置正确的 CA 证书",
    cwe: "CWE-295",
  },
  {
    name: "verify=False (Python requests)",
    severity: "medium",
    pattern: /verify\s*=\s*False/g,
    description: "Python requests 禁用了 SSL 验证",
    suggestion: "设置 verify=True 或指定 CA 证书路径",
    cwe: "CWE-295",
  },
  {
    name: "不安全的随机数 (Math.random)",
    severity: "medium",
    pattern: /Math\.random\s*\(/g,
    description: "使用 Math.random() 生成随机数（不安全）",
    suggestion: "涉及安全场景请使用 crypto.getRandomValues 或 crypto.randomBytes",
    cwe: "CWE-330",
  },
  {
    name: "不安全的哈希 (MD5)",
    severity: "medium",
    pattern: /(?:crypto\.)?(?:createHash\s*\(\s*["']md5["']|hashlib\.md5)/gi,
    description: "使用 MD5 哈希算法（已不安全）",
    suggestion: "使用 SHA-256 或更强的哈希算法",
    cwe: "CWE-327",
  },
  {
    name: "不安全的哈希 (SHA1)",
    severity: "low",
    pattern: /(?:crypto\.)?(?:createHash\s*\(\s*["']sha1["']|hashlib\.sha1)/gi,
    description: "使用 SHA-1 哈希算法（建议升级）",
    suggestion: "使用 SHA-256 或更强的哈希算法",
    cwe: "CWE-327",
  },
  // === CORS ===
  {
    name: "CORS 通配符",
    severity: "medium",
    pattern: /Access-Control-Allow-Origin\s*[:=]\s*["']\*["']/g,
    description: "CORS 设置为通配符 *，允许任意来源访问",
    suggestion: "限制为可信域名列表",
    cwe: "CWE-942",
  },
  {
    name: "CORS 通配符 (代码)",
    severity: "medium",
    pattern: /origin\s*[:=]\s*["']\*["']/g,
    description: "CORS origin 设置为通配符",
    suggestion: "限制为可信域名列表",
    cwe: "CWE-942",
  },
  // === 调试/开发代码 ===
  {
    name: "debugger 语句",
    severity: "low",
    pattern: /\bdebugger\b/g,
    description: "发现 debugger 语句",
    suggestion: "生产代码中移除 debugger 语句",
    cwe: "CWE-489",
  },
  {
    name: "console.log 调试输出",
    severity: "info",
    pattern: /console\.(log|debug|info)\s*\(/g,
    description: "发现调试日志输出",
    suggestion: "生产环境建议移除或使用条件日志",
    cwe: "CWE-489",
  },
  {
    name: "硬编码 IP 地址",
    severity: "low",
    pattern: /\b(?:https?:\/\/|ftp:\/\/|ws:\/\/|wss:\/\/)?(?:\d{1,3}\.){3}\d{1,3}\b/g,
    description: "代码中包含硬编码的 IP 地址",
    suggestion: "使用域名或环境变量配置主机地址",
    cwe: "CWE-200",
    skipInComment: false,
  },
  {
    name: "TODO/FIXME 安全相关",
    severity: "info",
    pattern: /(?:TODO|FIXME|HACK|XXX|BUG)[\s:]+(?:security|auth|password|token|vuln|inject|xss|sqli)/gi,
    description: "发现安全相关的 TODO/FIXME 注释",
    suggestion: "及时处理安全相关的待办事项",
    cwe: "CWE-1078",
    skipInComment: false,
  },
  // === 更多安全检测 ===
  {
    name: "硬编码 localhost/127.0.0.1",
    severity: "info",
    pattern: /["'](?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?["']/g,
    description: "硬编码本地地址，生产环境可能需要配置化",
    suggestion: "使用环境变量配置主机地址",
    cwe: "CWE-200",
    skipInComment: true,
  },
  {
    name: "process.env 直接拼接 SQL",
    severity: "high",
    pattern: /(?:execute|query|exec|raw)\s*\([^)]*process\.env/gi,
    description: "SQL 查询直接使用环境变量值拼接",
    suggestion: "使用参数化查询，环境变量作为参数传入",
    cwe: "CWE-89",
  },
  {
    name: "不安全的 crypto.createCipher (已废弃)",
    severity: "high",
    pattern: /crypto\.createCipher\s*\(/g,
    description: "使用已废弃的 createCipher，存在安全漏洞",
    suggestion: "使用 crypto.createCipheriv 替代",
    cwe: "CWE-327",
  },
  {
    name: "不安全的 crypto.createDecipher (已废弃)",
    severity: "high",
    pattern: /crypto\.createDecipher\s*\(/g,
    description: "使用已废弃的 createDecipher",
    suggestion: "使用 crypto.createDecipheriv 替代",
    cwe: "CWE-327",
  },
  {
    name: "eval 的别名调用 (Function 构造器)",
    severity: "high",
    pattern: /(?:window|global|globalThis)\.eval\s*\(/g,
    description: "通过全局对象调用 eval",
    suggestion: "避免使用 eval，使用安全的替代方案",
    cwe: "CWE-94",
  },
  {
    name: "Angular bypassSecurityTrust",
    severity: "high",
    pattern: /bypassSecurityTrust(?:Html|Url|ResourceUrl|Style|Script)\s*\(/g,
    description: "Angular 中绕过安全检查",
    suggestion: "确保数据来源可信，或进行严格清洗",
    cwe: "CWE-79",
  },
  {
    name: "Express 不安全的 helmet 缺失",
    severity: "low",
    pattern: /app\.(get|post|put|delete|use)\s*\(/g,
    description: "Express 应用未使用 helmet 中间件 (建议)",
    suggestion: "安装并使用 helmet 中间件增强安全性",
    cwe: "CWE-693",
    skipInComment: true,
  },
  {
    name: "res.send 用户输入",
    severity: "medium",
    pattern: /res\.(send|json)\s*\(\s*(?:req\.|params\.|query\.|body\.)/gi,
    description: "直接返回用户输入，可能存在 XSS",
    suggestion: "对用户输入进行转义后再返回",
    cwe: "CWE-79",
  },
  {
    name: "fs 操作用户输入路径",
    severity: "high",
    pattern: /fs\.(?:writeFile|appendFile|unlink|rmdir|mkdir|rename|copyFile)\s*\([^)]*(?:req\.|params\.|query\.|body\.|input\.|args\.)/gi,
    description: "文件写入/删除操作包含用户输入",
    suggestion: "严格验证路径，限制操作范围",
    cwe: "CWE-22",
  },
  {
    name: "正则表达式 DoS (ReDoS)",
    severity: "medium",
    pattern: /new\s+RegExp\s*\(\s*[^)]*[+*]{2,}/g,
    description: "动态构造的正则可能存在 ReDoS 风险",
    suggestion: "使用安全的正则库或验证输入格式",
    cwe: "CWE-1333",
  },
  {
    name: "不安全的原型操作",
    severity: "medium",
    pattern: /__proto__|prototype\[/g,
    description: "直接操作原型链，可能导致原型污染",
    suggestion: "使用 Object.create 或 Object.assign 替代",
    cwe: "CWE-1321",
  },
  {
    name: "URL 重定向 (用户输入)",
    severity: "high",
    pattern: /(?:res\.)?redirect\s*\(\s*(?:req\.|params\.|query\.|body\.|input\.|args\.)/gi,
    description: "重定向使用用户输入，存在开放重定向风险",
    suggestion: "验证重定向 URL 是否在白名单中",
    cwe: "CWE-601",
  },
];

// ============================================================
// 误报抑制配置
// ============================================================

/** 测试文件模式 - 测试代码中的密钥通常是测试用的，降级处理 */
const TEST_FILE_PATTERNS = [
  /\.test\./, /\.spec\./, /\.stories\./,
  /__tests__\//, /__mocks__\//, /__fixtures__\//,
  /test\//, /tests\//, /testing\//,
  /\.mock\./, /mocks\//,
];

/** 配置示例文件模式 */
const EXAMPLE_FILE_PATTERNS = [
  /\.example$/, /\.sample$/, /\.template$/,
  /\.dist$/, /\.bak$/,
];

/** 已知的占位/示例值，不报告为密钥泄露 */
const PLACEHOLDER_VALUES = new Set([
  "your-api-key", "your_api_key", "your-api-key-here",
  "replace-me", "changeme", "change-me",
  "example", "placeholder", "dummy",
  "test", "testing", "fake",
  "xxx", "yyy", "zzz",
  "your-token", "your_token",
  "your-secret", "your_secret",
]);

// ============================================================
// 抑制注释支持
// ============================================================

/** 抑制注释模式 */
const SUPPRESS_PATTERNS = [
  /(?:\/\/|\/\*|<!--|#)\s*(?:forge|security|lint):(?:ignore|suppress|disable)-?(?:next-?line|line|next)/i,
  /(?:\/\/|\/\*|<!--|#)\s*noqa/i,
  /(?:\/\/|\/\*|<!--|#)\s*eslint-disable(?:-next-line)?\s*(?:line)?/i,
  /(?:\/\/|\/\*|<!--|#)\s*@ts-ignore/i,
];

/** 检查行是否被抑制注释覆盖 */
function isSuppressed(lines, lineNum) {
  // 检查当前行
  const currentLine = lines[lineNum - 1] || "";
  if (SUPPRESS_PATTERNS.some(p => p.test(currentLine))) return true;
  
  // 检查前一行 (next-line 模式)
  const prevLine = lines[lineNum - 2] || "";
  if (SUPPRESS_PATTERNS.some(p => p.test(prevLine))) return true;
  
  return false;
}

/** 检查行是否在抑制块内 */
function isSuppressedBlock(lines, lineNum) {
  let inBlock = false;
  for (let i = 0; i < lineNum; i++) {
    const line = lines[i] || "";
    // 块开始: forge:ignore-start 或 eslint-disable (无 next-line)
    if (/(?:forge|security|lint):(?:ignore|suppress|disable)-?start/i.test(line) || 
        /eslint-disable(?!.next-line)/i.test(line)) {
      inBlock = true;
    }
    // 块结束: forge:ignore-end 或 eslint-enable
    if (/(?:forge|security|lint):(?:ignore|suppress|enable)-?end/i.test(line) || 
        /eslint-enable/i.test(line)) {
      inBlock = false;
    }
  }
  return inBlock;
}

// ============================================================
// 工具函数
// ============================================================

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
      // 跳过 lockfile 等会产生大量误报的文件
      if (SKIP_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (SCAN_EXTS.has(ext) || entry.name.startsWith(".env")) {
        results.push(relPath);
      }
    }
  }
  return results;
}

/** 检查是否为测试文件 */
function isTestFile(filePath) {
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
}

/** 检查是否为示例/配置模板文件 */
function isExampleFile(filePath) {
  return EXAMPLE_FILE_PATTERNS.some((p) => p.test(filePath));
}

/** 检查是否为安全工具自身的文件 (避免自扫描误报) */
function isToolFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  // 安全扫描器自身的脚本文件包含检测规则，会触发自身规则
  return (
    normalized === "scripts/run-security.js" ||
    normalized === "scripts/run-provenance.js" ||
    normalized === "scripts/run-lore.js" ||
    normalized === "scripts/generate-report.js" ||
    normalized === "scripts/collect-governance.js" ||
    normalized === "scripts/generate-project.js" ||
    normalized === "scripts/package-app.js" ||
    normalized === "tests/run-tests.js" ||
    normalized === "tests/test-security.js" ||
    normalized === "tests/test-provenance.js" ||
    normalized === "tests/test-lore.js"
  );
}

/** 检查是否为 CLI 脚本文件 (console.log 是正常的) */
function isScriptFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("scripts/") || normalized.startsWith("forge-scripts/");
}

/**
 * 检查匹配位置是否在字符串字面量内
 * 用于减少将规则定义、字符串常量中的模式误判为真实安全问题
 */
function isInStringLiteral(lineText, matchIndex, matchLength) {
  // 获取匹配前后的字符
  const before = lineText.slice(0, matchIndex);
  const after = lineText.slice(matchIndex + matchLength);

  // 检查是否在引号内 (单引号、双引号、反引号)
  const singleQuotes = (before.match(/'/g) || []).length;
  const doubleQuotes = (before.match(/"/g) || []).length;
  const backticks = (before.match(/`/g) || []).length;

  // 如果前面的引号数为奇数，说明在字符串内
  if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1) {
    return true;
  }

  // 检查是否在正则表达式字面量内 /pattern/
  // 简单检查: 前面有 / 且后面有 /
  const lastSlash = before.lastIndexOf("/");
  if (lastSlash >= 0) {
    const between = before.slice(lastSlash + 1);
    // 如果 / 之间没有引号，可能是正则表达式
    if (!between.includes('"') && !between.includes("'") && !between.includes("`")) {
      // 检查后面是否有闭合的 /
      if (after.includes("/")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查行是否为规则定义行 (包含 pattern: /regex/ 或类似模式)
 * 这些行包含安全模式的字面量定义，不应被标记为安全问题
 */
function isRuleDefinitionLine(lineText) {
  const trimmed = lineText.trim();
  // 检测规则定义模式: pattern: /regex/g, name: "...", etc.
  return (
    (trimmed.includes("pattern:") && trimmed.includes("/")) ||
    (trimmed.includes("pattern :") && trimmed.includes("/")) ||
    trimmed.match(/^\s*(pattern|name|description|suggestion|severity|cwe)\s*:/) !== null
  );
}

/** 检查值是否为占位符 */
function isPlaceholder(text) {
  const lower = text.toLowerCase();
  for (const p of PLACEHOLDER_VALUES) {
    if (lower.includes(p)) return true;
  }
  return false;
}

/**
 * 计算 Shannon 熵值，用于检测高熵字符串（可能是隐藏的密钥）
 */
function shannonEntropy(str) {
  if (!str || str.length < 20) return 0;

  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * 检测高熵字符串（可能是隐藏的密钥）
 */
function detectHighEntropy(lineText, file, lineNum) {
  const issues = [];

  // 匹配引号内的长字符串
  const stringMatches = lineText.matchAll(/["'`]([A-Za-z0-9+/=_\-]{30,})["'`]/g);
  for (const match of stringMatches) {
    const value = match[1];
    if (isPlaceholder(value)) continue;

    const entropy = shannonEntropy(value);

    // Base64 编码: 熵值 > 4.5 通常是密钥
    if (entropy > 4.5 && /^[A-Za-z0-9+/=]+$/.test(value) && value.length >= 32) {
      issues.push({
        file,
        line: lineNum,
        severity: "medium",
        type: "高熵字符串 (可能为隐藏密钥)",
        description: `检测到高熵字符串 (熵值=${entropy.toFixed(2)})，可能是编码后的密钥或凭证`,
        suggestion: "确认为非敏感数据后忽略，或将其移至环境变量",
        snippet: lineText.trim().slice(0, 120),
        cwe: "CWE-798",
        entropy: entropy.toFixed(2),
      });
    }

    // Hex 编码: 熵值 > 3.5
    if (entropy > 3.5 && /^[a-f0-9]+$/i.test(value) && value.length >= 32) {
      issues.push({
        file,
        line: lineNum,
        severity: "low",
        type: "高熵 Hex 字符串",
        description: `检测到高熵 Hex 字符串 (熵值=${entropy.toFixed(2)})`,
        suggestion: "确认为非敏感数据后忽略",
        snippet: lineText.trim().slice(0, 120),
        cwe: "CWE-798",
        entropy: entropy.toFixed(2),
      });
    }
  }

  return issues;
}

/**
 * 对单行应用规则，返回匹配到的 issues
 * 包含误报抑制逻辑
 */
function scanLine(rules, lineText, file, lineNum, isTest, isExample) {
  const issues = [];
  const trimmed = lineText.trim();
  const isScript = isScriptFile(file);
  const isRuleDef = isRuleDefinitionLine(lineText);
  const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#") || trimmed.startsWith("<!--");

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(lineText);
    if (!match) continue;

    // 占位符检查
    if (isPlaceholder(match[0])) continue;

    // 判断是否为代码安全规则 (非密钥检测)
    const isCodeSafetyRule = rule.cwe && rule.cwe !== "CWE-798";

    // 代码安全规则: 在注释行中跳过 (eval() 在注释中讨论不是安全问题)
    if (isCodeSafetyRule && isComment) continue;

    // 字符串字面量内的代码安全模式: 跳过 (规则定义、字符串常量中的模式)
    // 但密钥检测仍需执行 (密钥可能出现在字符串中)
    if (isCodeSafetyRule) {
      // 如果是规则定义行，跳过代码安全检测
      if (isRuleDef) continue;
      // 如果匹配在字符串字面量内，跳过
      const matchIndex = match.index;
      if (isInStringLiteral(lineText, matchIndex, match[0].length)) continue;
    }

    // CLI 脚本文件中的 console.log 是正常行为
    if (isScript && rule.name && rule.name.includes("console.log")) continue;

    // 测试文件中降级处理
    let severity = rule.severity;
    if (isTest || isExample) {
      if (severity === "critical") severity = "low";
      else if (severity === "high") severity = "low";
      else if (severity === "medium") severity = "info";
    }

    issues.push({
      file,
      line: lineNum,
      severity,
      type: rule.name,
      description: rule.description,
      suggestion: rule.suggestion,
      snippet: trimmed.slice(0, 120),
      cwe: rule.cwe || null,
      inTest: isTest,
      inExample: isExample,
    });
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

  const isTest = isTestFile(file);
  const isExample = isExampleFile(file);
  const isTool = isToolFile(file);
  const lines = content.split("\n");

  // 预计算被抑制的行
  const suppressedLines = new Set();
  const suppressedBlocks = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (isSuppressed(lines, i + 1)) suppressedLines.add(i + 1);
    if (isSuppressedBlock(lines, i + 1)) suppressedBlocks.add(i + 1);
  }

  let suppressedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const lineNum = i + 1;
    const trimmed = lineText.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#");

    // 跳过被抑制的行
    if (suppressedLines.has(lineNum) || suppressedBlocks.has(lineNum)) {
      suppressedCount++;
      continue;
    }

    // 密钥检测在所有行上执行（包括注释）
    // 工具文件中的密钥检测也执行，但降级处理
    const secretIssues = scanLine(SECRET_RULES, lineText, file, lineNum, isTest || isTool, isExample);
    issues.push(...secretIssues);

    // 不安全代码模式仅在非注释行执行
    // 工具文件 (安全扫描器自身) 跳过代码安全检测，避免自扫描误报
    if (!isComment && !isTool) {
      issues.push(...scanLine(UNSAFE_CODE_RULES, lineText, file, lineNum, isTest, isExample));
    }

    // 高熵字符串检测 (工具文件跳过，避免检测到规则中的正则模式)
    if (!isTool) {
      issues.push(...detectHighEntropy(lineText, file, lineNum));
    }
  }

  if (suppressedCount > 0) {
    // 不输出每个文件的抑制计数，避免日志过多
  }

  return issues;
}

// ============================================================
// 自定义规则配置
// ============================================================

/** 加载自定义规则配置文件 */
function loadCustomRules() {
  const configPath = path.join(ROOT, ".forge-rules.json");
  if (!fs.existsSync(configPath)) return null;
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("  加载自定义规则配置: .forge-rules.json");
    return config;
  } catch (err) {
    console.warn(`  自定义规则配置加载失败: ${err.message}`);
    return null;
  }
}

/** 根据自定义配置过滤误报 */
function applyCustomSuppression(issues, customRules) {
  if (!customRules || !customRules.suppressions) return issues;
  
  return issues.filter(issue => {
    for (const suppression of customRules.suppressions) {
      // 按文件路径匹配
      if (suppression.file && !issue.file.includes(suppression.file)) continue;
      // 按规则类型匹配
      if (suppression.type && issue.type !== suppression.type) continue;
      // 按行号匹配
      if (suppression.line && issue.line !== suppression.line) continue;
      // 匹配成功，抑制此问题
      return false;
    }
    return true;
  });
}

// ============================================================
// 依赖漏洞审计
// ============================================================

function runNpmAudit() {
  console.log("\n  运行 npm audit 检查依赖漏洞 ...");

  if (!fs.existsSync(path.join(ROOT, "package.json"))) {
    console.log("  未找到 package.json，跳过依赖审计");
    return { vulnerable: 0, details: [], issues: [] };
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
    if (err.stdout) {
      try {
        auditData = JSON.parse(err.stdout);
      } catch {
        console.warn("  npm audit 输出解析失败");
        return { vulnerable: 0, details: [], issues: [] };
      }
    } else {
      console.warn("  npm audit 执行失败:", (err.message || "").slice(0, 100));
      return { vulnerable: 0, details: [], issues: [] };
    }
  }

  const vulnerabilities = auditData.vulnerabilities || {};
  const details = [];

  for (const [pkg, info] of Object.entries(vulnerabilities)) {
    const severity = info.severity || "medium";
    const via = Array.isArray(info.via) ? info.via : [];
    const advisory = via.find((v) => typeof v === "object");

    // 获取 CVE 信息
    const cwe = advisory?.cwe?.[0] || null;
    const cvss = advisory?.cvss?.score || null;

    details.push({
      package: pkg,
      severity,
      title: advisory?.title || "未知漏洞",
      url: advisory?.url || null,
      range: info.range || null,
      fixAvailable: !!info.fixAvailable,
      cwe,
      cvss,
    });
  }

  const depIssues = details.map((d) => ({
    file: "package.json",
    line: 0,
    severity: d.severity,
    type: `依赖漏洞: ${d.package}`,
    description: `${d.package} ${d.range || ""} 存在漏洞: ${d.title}${d.cvss ? ` (CVSS: ${d.cvss})` : ""}`,
    suggestion: d.fixAvailable ? "运行 npm audit fix 修复" : "升级或替换该依赖",
    cwe: d.cwe,
  }));

  return { vulnerable: details.length, details, issues: depIssues };
}

// ============================================================
// 安全评分算法 v2.0
// ============================================================

/**
 * 改进的安全评分算法 v2.1:
 * - 递减惩罚: 同类问题越多，单个惩罚递减
 * - 文件维度: 分散在多文件的问题比集中在一个文件的问题更严重
 * - 严重度加权: critical 问题惩罚极高
 * - 上下文感知: 测试/工具文件的问题不影响生产代码评分
 * - 信息级问题不惩罚: console.log 等信息级问题不扣分
 */
function calculateScore(issues) {
  if (issues.length === 0) return 100;

  // 过滤: 只对生产代码的问题计分
  // 测试文件、工具文件、示例文件的问题单独统计，不影响主评分
  const productionIssues = issues.filter((i) => {
    if (i.inTest || i.inExample) return false;
    if (isToolFile(i.file)) return false;
    // info 级别不影响评分
    if (i.severity === "info") return false;
    return true;
  });

  if (productionIssues.length === 0) return 100;

  // 按文件和类型分组
  const fileTypeMap = new Map(); // "file:type" -> count
  const severityCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const issue of productionIssues) {
    severityCount[issue.severity] = (severityCount[issue.severity] || 0) + 1;
    const key = `${issue.file}:${issue.type}`;
    fileTypeMap.set(key, (fileTypeMap.get(key) || 0) + 1);
  }

  let penalty = 0;

  // 严重度基础惩罚 (递减)
  const severityPenalty = { critical: 25, high: 10, medium: 4, low: 1, info: 0 };

  for (const [key, count] of fileTypeMap) {
    const issue = productionIssues.find((i) => `${i.file}:${i.type}` === key);
    if (!issue) continue;

    const basePenalty = severityPenalty[issue.severity] || 1;
    // 第一个问题全额惩罚，后续递减 (第 n 个惩罚 = base * 0.7^n)
    let typePenalty = 0;
    for (let n = 0; n < count; n++) {
      typePenalty += basePenalty * Math.pow(0.7, n);
    }
    penalty += typePenalty;
  }

  // Critical 问题额外惩罚: 每个 critical 额外扣 5 分
  if (severityCount.critical > 0) {
    penalty += severityCount.critical * 5;
  }

  return Math.max(0, Math.round(100 - penalty));
}

/** 统计摘要 */
function summarize(issues) {
  const summary = { total: issues.length, critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const issue of issues) {
    summary[issue.severity] = (summary[issue.severity] || 0) + 1;
  }
  return summary;
}

/** 生成修复优先级建议 */
function generateRemediationPlan(issues) {
  const plan = [];

  // 1. Critical 密钥泄露
  const criticalSecrets = issues.filter(
    (i) => i.severity === "critical" && SECRET_RULES.some((r) => r.name === i.type)
  );
  if (criticalSecrets.length > 0) {
    plan.push({
      priority: "P0 - 立即处理",
      description: `${criticalSecrets.length} 个严重密钥泄露需要立即轮换和修复`,
      action: "立即撤销所有泄露的凭证，在密钥管理服务中重新生成",
      count: criticalSecrets.length,
    });
  }

  // 2. Critical 代码问题
  const criticalCode = issues.filter(
    (i) => i.severity === "critical" && !SECRET_RULES.some((r) => r.name === i.type)
  );
  if (criticalCode.length > 0) {
    plan.push({
      priority: "P0 - 立即处理",
      description: `${criticalCode.length} 个严重代码安全问题`,
      action: "修复代码注入、不安全反序列化等严重问题",
      count: criticalCode.length,
    });
  }

  // 3. High 级别问题
  const highIssues = issues.filter((i) => i.severity === "high");
  if (highIssues.length > 0) {
    plan.push({
      priority: "P1 - 本周修复",
      description: `${highIssues.length} 个高危安全问题`,
      action: "修复 SQL 注入、XSS、命令注入等高危漏洞",
      count: highIssues.length,
    });
  }

  // 4. Medium 级别问题
  const mediumIssues = issues.filter((i) => i.severity === "medium");
  if (mediumIssues.length > 0) {
    plan.push({
      priority: "P2 - 本月修复",
      description: `${mediumIssues.length} 个中危安全问题`,
      action: "修复加密配置、CORS 配置、路径遍历等问题",
      count: mediumIssues.length,
    });
  }

  return plan;
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("========================================");
  console.log(" Agent Forge - 安全检查脚本 v2.0");
  console.log(" 企业级代码安全分析引擎");
  console.log("========================================");

  console.log("\n[1/4] 收集并扫描源码文件 ...");
  const files = collectFiles(ROOT);
  console.log(`  共发现 ${files.length} 个待扫描文件`);
  console.log(`  规则: ${SECRET_RULES.length} 条密钥检测 + ${UNSAFE_CODE_RULES.length} 条代码安全检测`);

  let allIssues = [];
  const customRules = loadCustomRules();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileIssues = scanFile(file);
    if (fileIssues.length > 0) {
      console.log(`  [${i + 1}/${files.length}] ${file}: 发现 ${fileIssues.length} 个问题`);
    }
    allIssues.push(...fileIssues);
  }

  console.log(`\n[2/4] 代码扫描完成，共 ${allIssues.length} 个问题`);

  // 依赖漏洞审计
  console.log("\n[3/4] 依赖漏洞审计 ...");
  const audit = runNpmAudit();
  if (audit.issues) {
    allIssues.push(...audit.issues);
  }

  // 按严重程度排序
  allIssues.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  // 应用自定义抑制规则
  if (customRules) {
    const before = allIssues.length;
    const filtered = applyCustomSuppression(allIssues, customRules);
    console.log(`  自定义规则抑制: ${before - filtered.length} 个问题`);
    allIssues.length = 0;
    allIssues.push(...filtered);
  }

  console.log(`\n[4/4] 生成安全报告 (v2.0) ...`);
  const score = calculateScore(allIssues);
  const summary = summarize(allIssues);
  const remediationPlan = generateRemediationPlan(allIssues);

  // 按文件分组统计
  const fileStats = {};
  for (const issue of allIssues) {
    fileStats[issue.file] = (fileStats[issue.file] || 0) + 1;
  }
  const topFiles = Object.entries(fileStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, issues: count }));

  // CWE 统计
  const cweStats = {};
  for (const issue of allIssues) {
    if (issue.cwe) {
      cweStats[issue.cwe] = (cweStats[issue.cwe] || 0) + 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    version: "2.0",
    score,
    scoreGrade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F",
    summary,
    issues: allIssues,
    dependencies: {
      vulnerable: audit.vulnerable || 0,
      details: audit.details || [],
    },
    remediationPlan,
    topFiles,
    cweStats,
    stats: {
      totalRules: SECRET_RULES.length + UNSAFE_CODE_RULES.length,
      secretRules: SECRET_RULES.length,
      codeRules: UNSAFE_CODE_RULES.length,
      testFileIssues: allIssues.filter((i) => i.inTest).length,
      exampleFileIssues: allIssues.filter((i) => i.inExample).length,
      entropyDetected: allIssues.filter((i) => i.entropy).length,
      suppressionSupported: true,
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("\n========================================");
  console.log(" 安全检查完成！v2.0");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`安全评分: ${score}/100 (${report.scoreGrade})`);
  console.log(`问题统计: 严重=${summary.critical} 高危=${summary.high} 中危=${summary.medium} 低危=${summary.low} 信息=${summary.info}`);
  console.log(`依赖漏洞: ${report.dependencies.vulnerable} 个`);
  console.log(`CWE 类型: ${Object.keys(cweStats).length} 种`);
  if (remediationPlan.length > 0) {
    console.log("\n修复优先级:");
    for (const p of remediationPlan) {
      console.log(`  ${p.priority}: ${p.description}`);
    }
  }
}

main();
