/**
 * scripts/generate-report.js
 * 报告生成脚本：读取溯源、安全、决策三个模块的产物，聚合生成自包含 HTML 治理报告。
 *
 * 输入:
 *   - .forge/provenance.json
 *   - .forge/security-report.json
 *   - .lore/decisions.jsonl
 *
 * 输出: .forge/governance-report.html （内联 CSS，无外部依赖）
 *
 * 报告内容:
 *   1. 项目摘要
 *   2. 代码来源分布（人类 vs AI）
 *   3. 安全评分与问题列表
 *   4. 决策时间线
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const FORGE_DIR = path.join(ROOT, ".forge");
const LORE_DIR = path.join(ROOT, ".lore");

const PROVENANCE_FILE = path.join(FORGE_DIR, "provenance.json");
const SECURITY_FILE = path.join(FORGE_DIR, "security-report.json");
const DECISIONS_FILE = path.join(LORE_DIR, "decisions.jsonl");
const OUTPUT_FILE = path.join(FORGE_DIR, "governance-report.html");

// ============================================================
// 工具函数
// ============================================================

/** 读取并解析 JSON 文件，失败返回 null */
function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`  读取 ${file} 失败: ${err.message}`);
    return null;
  }
}

/** 读取 JSONL 文件，返回对象数组 */
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const content = fs.readFileSync(file, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`  读取 ${file} 失败: ${err.message}`);
    return [];
  }
}

/** HTML 转义 */
function esc(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 执行 git 命令 */
function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/** 获取项目名称（从 git remote 或目录名） */
function getProjectName() {
  const remote = git("remote get-url origin");
  if (remote) {
    const match = remote.match(/[:/]([^/]+?)(\.git)?$/);
    if (match) return match[1];
  }
  return path.basename(ROOT);
}

/** 获取仓库信息 */
function getRepoInfo() {
  const remote = git("remote get-url origin");
  let owner = "";
  let repo = getProjectName();
  if (remote) {
    const m = remote.match(/[:/]([^/]+)\/([^/]+?)(\.git)?$/);
    if (m) {
      owner = m[1];
      repo = m[2];
    }
  }
  return { owner, repo, remote };
}

/** 格式化日期 */
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

/** 根据安全评分返回颜色 */
function scoreColor(score) {
  if (score >= 80) return "#16a34a"; // 绿
  if (score >= 60) return "#ca8a04"; // 黄
  if (score >= 40) return "#ea580c"; // 橙
  return "#dc2626"; // 红
}

/** 根据严重程度返回颜色标签 */
function severityColor(sev) {
  return (
    { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#2563eb" }[
      sev
    ] || "#6b7280"
  );
}

/** 安全评分对应文字描述 */
function scoreLabel(score) {
  if (score >= 80) return "良好";
  if (score >= 60) return "一般";
  if (score >= 40) return "较差";
  return "危险";
}

/** 计算百分比 */
function pct(part, total) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

// ============================================================
// HTML 片段生成
// ============================================================

function renderHeader(projectName, repoInfo) {
  const now = fmtDate(new Date().toISOString());
  return `
  <header class="report-header">
    <div class="brand">
      <span class="logo">FORGE</span>
      <span class="subtitle">治理报告 · Governance Report</span>
    </div>
    <h1>${esc(projectName)}</h1>
    <div class="meta">
      <span>仓库: ${esc(repoInfo.owner)} / ${esc(repoInfo.repo)}</span>
      <span>生成时间: ${now}</span>
    </div>
  </header>`;
}

function renderSummaryCards(provenance, security, decisions) {
  const totalFiles = provenance?.summary?.totalFiles ?? "—";
  const totalLines = provenance?.summary?.totalLines ?? "—";
  const score = security?.score ?? "—";
  const decisionCount = decisions.length;
  const scoreC = typeof score === "number" ? scoreColor(score) : "#6b7280";

  const cards = [
    { label: "文件总数", value: totalFiles, color: "#2563eb" },
    { label: "代码行数", value: totalLines, color: "#7c3aed" },
    {
      label: "安全评分",
      value: `${score} / 100`,
      color: scoreC,
      sub: typeof score === "number" ? scoreLabel(score) : "",
    },
    { label: "决策记录", value: decisionCount, color: "#0891b2" },
  ];

  return `
  <section class="cards">
    ${cards
      .map(
        (c) => `
      <div class="card">
        <div class="card-value" style="color:${c.color}">${esc(c.value)}</div>
        <div class="card-label">${esc(c.label)}</div>
        ${c.sub ? `<div class="card-sub" style="color:${c.color}">${esc(c.sub)}</div>` : ""}
      </div>`
      )
      .join("")}
  </section>`;
}

function renderProvenance(provenance) {
  if (!provenance) {
    return section("代码来源分布", `<p class="empty">未找到溯源数据 (.forge/provenance.json)</p>`);
  }

  const s = provenance.summary || {};
  const ai = s.aiLines || 0;
  const human = s.humanLines || 0;
  const total = s.totalLines || ai + human || 1;
  const aiPct = pct(ai, total);
  const humanPct = pct(human, total);

  // 模型分布统计
  const modelStats = {};
  if (Array.isArray(provenance.files)) {
    for (const file of provenance.files) {
      for (const line of file.lines || []) {
        if (line.source === "ai" && line.model) {
          modelStats[line.model] = (modelStats[line.model] || 0) + 1;
        }
      }
    }
  }
  const modelRows = Object.entries(modelStats)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([model, count]) =>
        `<tr><td><code>${esc(model)}</code></td><td>${count}</td><td>${pct(count, ai)}%</td></tr>`
    )
    .join("");

  return section(
    "代码来源分布",
    `
    <div class="dist-bar">
      <div class="dist-ai" style="width:${aiPct}%">AI ${aiPct}%</div>
      <div class="dist-human" style="width:${humanPct}%">人类 ${humanPct}%</div>
    </div>
    <table class="data-table">
      <tr><th>来源</th><th>行数</th><th>占比</th></tr>
      <tr><td><span class="dot" style="background:#7c3aed"></span> AI 生成</td><td>${ai}</td><td>${aiPct}%</td></tr>
      <tr><td><span class="dot" style="background:#2563eb"></span> 人类编写</td><td>${human}</td><td>${humanPct}%</td></tr>
      <tr class="total-row"><td>合计</td><td>${total}</td><td>100%</td></tr>
    </table>
    ${
      modelRows
        ? `<h3>AI 模型分布</h3>
           <table class="data-table">
             <tr><th>模型</th><th>行数</th><th>占 AI 比例</th></tr>
             ${modelRows}
           </table>`
        : ""
    }`
  );
}

function renderSecurity(security) {
  if (!security) {
    return section("安全检查", `<p class="empty">未找到安全报告 (.forge/security-report.json)</p>`);
  }

  const score = security.score ?? 0;
  const s = security.summary || {};
  const issues = security.issues || [];
  const topIssues = issues.slice(0, 20);
  const depVuln = security.dependencies?.vulnerable || 0;

  const severityBadges = ["critical", "high", "medium", "low"]
    .map(
      (sev) =>
        `<span class="badge" style="background:${severityColor(sev)}">${sevLabel(
          sev
        )}: ${s[sev] || 0}</span>`
    )
    .join("");

  const issueRows = topIssues
    .map(
      (issue) => `
      <tr>
        <td><span class="badge" style="background:${severityColor(issue.severity)}">${esc(
        issue.severity
      )}</span></td>
        <td>${esc(issue.type)}</td>
        <td title="${esc(issue.snippet || "")}">${esc(issue.file)}:${esc(issue.line)}</td>
        <td>${esc(issue.description)}</td>
        <td>${esc(issue.suggestion)}</td>
      </tr>`
    )
    .join("");

  return section(
    "安全检查",
    `
    <div class="security-score">
      <div class="score-ring" style="border-color:${scoreColor(score)}">
        <span style="color:${scoreColor(score)}">${score}</span>
        <small>评分</small>
      </div>
      <div class="score-info">
        <div class="score-status" style="color:${scoreColor(score)}">${scoreLabel(
      score
    )}</div>
        <div>${severityBadges}</div>
        <div class="dep-info">依赖漏洞: ${depVuln} 个</div>
      </div>
    </div>
    ${
      issues.length > 0
        ? `<h3>问题列表 (显示前 ${topIssues.length} / ${issues.length} 项)</h3>
           <div class="table-wrap">
           <table class="issue-table">
             <tr><th>严重度</th><th>类型</th><th>位置</th><th>描述</th><th>建议</th></tr>
             ${issueRows}
           </table>
           </div>`
        : `<p class="empty">未发现安全问题</p>`
    }`
  );
}

function sevLabel(sev) {
  return { critical: "严重", high: "高危", medium: "中危", low: "低危" }[sev] || sev;
}

function renderDecisions(decisions) {
  if (decisions.length === 0) {
    return section("决策时间线", `<p class="empty">未找到决策记录 (.lore/decisions.jsonl)</p>`);
  }

  // 按时间倒序
  const sorted = [...decisions].sort((a, b) => {
    return (b.timestamp || "").localeCompare(a.timestamp || "");
  });

  const items = sorted
    .map(
      (d) => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-head">
            <span class="timeline-sha">${esc((d.commit_sha || "").slice(0, 8))}</span>
            <span class="timeline-date">${fmtDate(d.timestamp)}</span>
            <span class="timeline-author">${esc(d.author || "")}</span>
          </div>
          <div class="timeline-body">
            <p><strong>上下文:</strong> ${esc(d.context)}</p>
            <p class="decision-line"><strong>决策:</strong> ${esc(d.decision)}</p>
            ${
              d.rejected
                ? `<p class="rejected-line"><strong>否决方案:</strong> ${esc(d.rejected)}</p>`
                : ""
            }
            ${
              d.constraints
                ? `<p><strong>约束:</strong> ${esc(d.constraints)}</p>`
                : ""
            }
            ${d.message ? `<p class="commit-msg"><code>${esc(d.message.split("\n")[0])}</code></p>` : ""}
          </div>
        </div>
      </div>`
    )
    .join("");

  return section("决策时间线", `<div class="timeline">${items}</div>`);
}

/** 包裹一个 section */
function section(title, inner) {
  return `
  <section class="report-section">
    <h2>${esc(title)}</h2>
    ${inner}
  </section>`;
}

/** 生成完整 HTML */
function buildHtml(projectName, repoInfo, provenance, security, decisions) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} - 治理报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: #f1f5f9;
    color: #1e293b;
    line-height: 1.6;
    padding: 24px;
  }
  .container { max-width: 960px; margin: 0 auto; }

  /* 头部 */
  .report-header {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    color: #fff;
    padding: 32px;
    border-radius: 12px;
    margin-bottom: 24px;
  }
  .brand { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .logo {
    font-weight: 800; letter-spacing: 2px; font-size: 14px;
    background: #6366f1; padding: 4px 10px; border-radius: 4px;
  }
  .subtitle { color: #94a3b8; font-size: 13px; }
  .report-header h1 { font-size: 28px; margin-bottom: 12px; }
  .meta { display: flex; gap: 24px; color: #94a3b8; font-size: 13px; flex-wrap: wrap; }

  /* 摘要卡片 */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card {
    background: #fff; border-radius: 10px; padding: 24px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .card-value { font-size: 32px; font-weight: 700; }
  .card-label { color: #64748b; font-size: 13px; margin-top: 4px; }
  .card-sub { font-size: 12px; margin-top: 4px; font-weight: 600; }

  /* 区块 */
  .report-section {
    background: #fff; border-radius: 10px; padding: 28px; margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .report-section h2 { font-size: 20px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
  .report-section h3 { font-size: 15px; margin: 20px 0 12px; color: #475569; }

  /* 来源分布条 */
  .dist-bar {
    display: flex; height: 36px; border-radius: 8px; overflow: hidden; margin-bottom: 20px;
  }
  .dist-ai { background: #7c3aed; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; min-width: 40px; }
  .dist-human { background: #2563eb; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; min-width: 40px; }

  /* 表格 */
  .data-table, .issue-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .data-table th, .data-table td, .issue-table th, .issue-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .data-table th, .issue-table th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 13px; }
  .total-row td { font-weight: 700; background: #f8fafc; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

  /* 安全评分 */
  .security-score { display: flex; align-items: center; gap: 32px; margin-bottom: 20px; flex-wrap: wrap; }
  .score-ring {
    width: 120px; height: 120px; border-radius: 50%; border: 8px solid;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .score-ring span { font-size: 36px; font-weight: 800; }
  .score-ring small { font-size: 12px; color: #94a3b8; }
  .score-info { flex: 1; min-width: 200px; }
  .score-status { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    color: #fff; font-size: 12px; font-weight: 600; margin-right: 8px; margin-bottom: 6px;
  }
  .dep-info { color: #64748b; font-size: 13px; margin-top: 8px; }
  .table-wrap { overflow-x: auto; }
  .issue-table td { vertical-align: top; }

  /* 时间线 */
  .timeline { position: relative; padding-left: 24px; }
  .timeline::before { content: ""; position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
  .timeline-item { position: relative; margin-bottom: 24px; }
  .timeline-dot { position: absolute; left: -24px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #6366f1; border: 2px solid #fff; box-shadow: 0 0 0 2px #6366f1; }
  .timeline-content { background: #f8fafc; border-radius: 8px; padding: 16px; }
  .timeline-head { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; }
  .timeline-sha { font-family: monospace; background: #1e293b; color: #fff; padding: 1px 8px; border-radius: 4px; }
  .timeline-date { color: #64748b; }
  .timeline-author { color: #64748b; }
  .timeline-body p { margin-bottom: 6px; font-size: 14px; }
  .decision-line { color: #0f172a; }
  .rejected-line { color: #b91c1c; }
  .commit-msg { margin-top: 10px; }
  .commit-msg code { font-size: 12px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; word-break: break-all; }

  .empty { color: #94a3b8; font-style: italic; padding: 16px 0; }
  code { font-family: "SFMono-Regular", Consolas, monospace; }

  footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<div class="container">
  ${renderHeader(projectName, repoInfo)}
  ${renderSummaryCards(provenance, security, decisions)}
  ${renderProvenance(provenance)}
  ${renderSecurity(security)}
  ${renderDecisions(decisions)}
  <footer>由 Agent Forge 自动生成 · ${fmtDate(new Date().toISOString())}</footer>
</div>
</body>
</html>`;
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("========================================");
  console.log(" Agent Forge - 治理报告生成脚本");
  console.log("========================================");

  console.log("\n[1/3] 读取各模块数据 ...");
  const provenance = readJson(PROVENANCE_FILE);
  console.log(
    `  溯源数据: ${provenance ? "已加载" : "缺失"} ${
      provenance ? "(" + (provenance.summary?.totalFiles || 0) + " 文件)" : ""
    }`
  );

  const security = readJson(SECURITY_FILE);
  console.log(
    `  安全报告: ${security ? "已加载" : "缺失"} ${
      security ? "(评分 " + security.score + ", " + (security.issues?.length || 0) + " 问题)" : ""
    }`
  );

  const decisions = readJsonl(DECISIONS_FILE);
  console.log(`  决策记录: ${decisions.length} 条`);

  console.log("\n[2/3] 聚合数据并生成 HTML ...");
  const repoInfo = getRepoInfo();
  const projectName = repoInfo.repo || getProjectName();
  console.log(`  项目: ${projectName}`);

  const html = buildHtml(projectName, repoInfo, provenance, security, decisions);

  console.log("\n[3/3] 写入 .forge/governance-report.html ...");
  fs.mkdirSync(FORGE_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, html, "utf8");

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log("\n========================================");
  console.log(" 治理报告生成完成！");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`文件大小: ${sizeKB} KB`);
  console.log(`溯源文件: ${provenance?.summary?.totalFiles || 0} 个`);
  console.log(`安全评分: ${security?.score ?? "—"} / 100`);
  console.log(`决策记录: ${decisions.length} 条`);
}

main();
