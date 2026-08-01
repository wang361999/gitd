/**
 * scripts/generate-report.js
 * 报告生成脚本 v2.0：读取溯源、安全、决策三个模块的产物，
 * 聚合生成自包含 HTML 治理报告。
 *
 * 增强:
 *   - 兼容 v1 和 v2 数据格式
 *   - 展示置信度分布、作者统计、模型分布
 *   - 展示安全评分等级、修复优先级、CWE 统计
 *   - 展示决策分类分布、置信度评分
 *   - 更丰富的可视化（进度条、徽章、分类标签）
 *
 * 输出: .forge/governance-report.html （内联 CSS，无外部依赖）
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

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`  读取 ${file} 失败: ${err.message}`);
    return null;
  }
}

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

function esc(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function getProjectName() {
  const remote = git("remote get-url origin");
  if (remote) {
    const match = remote.match(/[:/]([^/]+?)(\.git)?$/);
    if (match) return match[1];
  }
  return path.basename(ROOT);
}

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

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

function severityColor(sev) {
  return (
    { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#2563eb", info: "#6b7280" }[sev] || "#6b7280"
  );
}

function scoreLabel(score) {
  if (score >= 80) return "良好";
  if (score >= 60) return "一般";
  if (score >= 40) return "较差";
  return "危险";
}

function pct(part, total) {
  if (!total) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

/** 决策分类标签颜色 */
function categoryColor(cat) {
  return {
    architecture: "#6366f1",
    tech_choice: "#8b5cf6",
    security: "#dc2626",
    performance: "#f59e0b",
    data: "#06b6d4",
    api: "#10b981",
    infra: "#3b82f6",
    testing: "#ec4899",
    other: "#6b7280",
    none: "#9ca3af",
    error: "#dc2626",
  }[cat] || "#6b7280";
}

/** 决策分类中文名 */
function categoryName(cat) {
  return {
    architecture: "架构决策",
    tech_choice: "技术选型",
    security: "安全决策",
    performance: "性能优化",
    data: "数据决策",
    api: "API 设计",
    infra: "基础设施",
    testing: "测试策略",
    other: "其他",
    none: "无决策",
    error: "分析错误",
  }[cat] || cat;
}

// ============================================================
// HTML 片段生成
// ============================================================

function section(title, inner, icon = "") {
  return `
  <section class="report-section">
    <h2>${icon} ${esc(title)}</h2>
    ${inner}
  </section>`;
}

function renderHeader(projectName, repoInfo) {
  const now = fmtDate(new Date().toISOString());
  return `
  <header class="report-header">
    <div class="brand">
      <span class="logo">FORGE</span>
      <span class="subtitle">治理报告 · Governance Report v2.0</span>
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
  const scoreGrade = security?.scoreGrade || "";
  const validDecisions = decisions.filter((d) => d.decision && (d.confidence ?? 1) >= 0.5);
  const decisionCount = validDecisions.length;
  const scoreC = typeof score === "number" ? scoreColor(score) : "#6b7280";

  const cards = [
    { label: "文件总数", value: totalFiles, color: "#2563eb", icon: "📁" },
    { label: "代码行数", value: totalLines, color: "#7c3aed", icon: "📝" },
    {
      label: "安全评分",
      value: `${score} / 100`,
      color: scoreC,
      sub: typeof score === "number" ? `${scoreLabel(score)} (${scoreGrade})` : "",
      icon: "🛡️",
    },
    { label: "决策记录", value: decisionCount, color: "#0891b2", icon: "🧠" },
  ];

  return `
  <section class="cards">
    ${cards
      .map(
        (c) => `
      <div class="card">
        <div class="card-icon">${c.icon}</div>
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
    return section("代码来源分布", `<p class="empty">未找到溯源数据 (.forge/provenance.json)</p>`, "🔬");
  }

  const s = provenance.summary || {};
  const ai = s.aiLines || 0;
  const human = s.humanLines || 0;
  const total = s.totalLines || ai + human || 1;
  const aiPct = pct(ai, total);
  const humanPct = pct(human, total);
  const isV2 = provenance.version === "2.0";

  // 模型分布统计
  let modelRows = "";
  if (isV2 && Array.isArray(provenance.models) && provenance.models.length > 0) {
    modelRows = provenance.models
      .map(
        (m) =>
          `<tr><td><code>${esc(m.name)}</code></td><td>${m.lines}</td><td>${m.commits}</td><td>${pct(m.lines, ai)}%</td></tr>`
      )
      .join("");
  } else {
    // v1 兼容: 从 files 数据中统计
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
    modelRows = Object.entries(modelStats)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([model, count]) =>
          `<tr><td><code>${esc(model)}</code></td><td>${count}</td><td>—</td><td>${pct(count, ai)}%</td></tr>`
      )
      .join("");
  }

  // 置信度分布 (v2)
  let confidenceHtml = "";
  if (isV2 && s.confidence) {
    const conf = s.confidence;
    const confTotal = (conf.high || 0) + (conf.medium || 0) + (conf.low || 0);
    confidenceHtml = `
    <div class="confidence-bar">
      <h3>AI 归属置信度分布</h3>
      <div class="conf-stats">
        <div class="conf-item">
          <span class="conf-dot" style="background:#16a34a"></span>
          <span>高置信度</span>
          <strong>${conf.high || 0}</strong>
          <span class="conf-pct">(${pct(conf.high || 0, confTotal)}%)</span>
        </div>
        <div class="conf-item">
          <span class="conf-dot" style="background:#ca8a04"></span>
          <span>中置信度</span>
          <strong>${conf.medium || 0}</strong>
          <span class="conf-pct">(${pct(conf.medium || 0, confTotal)}%)</span>
        </div>
        <div class="conf-item">
          <span class="conf-dot" style="background:#dc2626"></span>
          <span>低置信度</span>
          <strong>${conf.low || 0}</strong>
          <span class="conf-pct">(${pct(conf.low || 0, confTotal)}%)</span>
        </div>
      </div>
    </div>`;
  }

  // 作者统计 (v2)
  let authorHtml = "";
  if (isV2 && Array.isArray(provenance.authors) && provenance.authors.length > 0) {
    const topAuthors = provenance.authors.slice(0, 10);
    authorHtml = `
    <h3>贡献者统计 (Top 10)</h3>
    <div class="table-wrap">
    <table class="data-table">
      <tr><th>作者</th><th>代码行数</th><th>Commit 数</th><th>AI Commit</th><th>人类 Commit</th></tr>
      ${topAuthors
        .map(
          (a) =>
            `<tr>
              <td>${esc(a.name)}</td>
              <td>${a.lines}</td>
              <td>${a.commits}</td>
              <td>${a.aiCommits || 0}</td>
              <td>${a.humanCommits || 0}</td>
            </tr>`
        )
        .join("")}
    </table>
    </div>`;
  }

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
    ${confidenceHtml}
    ${
      modelRows
        ? `<h3>AI 模型分布</h3>
           <div class="table-wrap">
           <table class="data-table">
             <tr><th>模型</th><th>行数</th><th>Commit 数</th><th>占 AI 比例</th></tr>
             ${modelRows}
           </table>
           </div>`
        : ""
    }
    ${authorHtml}`,
    "🔬"
  );
}

function renderSecurity(security) {
  if (!security) {
    return section("安全检查", `<p class="empty">未找到安全报告 (.forge/security-report.json)</p>`, "🛡️");
  }

  const score = security.score ?? 0;
  const grade = security.scoreGrade || "";
  const s = security.summary || {};
  const issues = security.issues || [];
  const topIssues = issues.slice(0, 30);
  const depVuln = security.dependencies?.vulnerable || 0;
  const isV2 = security.version === "2.0";

  const severityBadges = ["critical", "high", "medium", "low", "info"]
    .map(
      (sev) =>
        `<span class="badge" style="background:${severityColor(sev)}">${sevLabel(sev)}: ${s[sev] || 0}</span>`
    )
    .join("");

  const issueRows = topIssues
    .map(
      (issue) => `
      <tr>
        <td><span class="badge" style="background:${severityColor(issue.severity)}">${esc(issue.severity)}</span></td>
        <td>${esc(issue.type)}</td>
        <td title="${esc(issue.snippet || "")}">${esc(issue.file)}:${esc(issue.line)}</td>
        <td>${esc(issue.description)}</td>
        <td>${esc(issue.suggestion)}</td>
        ${isV2 ? `<td>${issue.cwe ? `<code>${esc(issue.cwe)}</code>` : "—"}</td>` : ""}
      </tr>`
    )
    .join("");

  // 修复优先级计划 (v2)
  let remediationHtml = "";
  if (isV2 && Array.isArray(security.remediationPlan) && security.remediationPlan.length > 0) {
    remediationHtml = `
    <h3>修复优先级建议</h3>
    <div class="remediation-plan">
      ${security.remediationPlan
        .map(
          (p) =>
            `<div class="remediation-item">
              <div class="remediation-priority">${esc(p.priority)}</div>
              <div class="remediation-desc">${esc(p.description)}</div>
              <div class="remediation-action">${esc(p.action)}</div>
            </div>`
        )
        .join("")}
    </div>`;
  }

  // CWE 统计 (v2)
  let cweHtml = "";
  if (isV2 && security.cweStats && Object.keys(security.cweStats).length > 0) {
    const cweRows = Object.entries(security.cweStats)
      .sort((a, b) => b[1] - a[1])
      .map(([cwe, count]) => `<tr><td><code>${esc(cwe)}</code></td><td>${count}</td></tr>`)
      .join("");
    cweHtml = `
    <h3>CWE 漏洞类型统计</h3>
    <table class="data-table">
      <tr><th>CWE 编号</th><th>出现次数</th></tr>
      ${cweRows}
    </table>`;
  }

  // Top 问题文件 (v2)
  let topFilesHtml = "";
  if (isV2 && Array.isArray(security.topFiles) && security.topFiles.length > 0) {
    topFilesHtml = `
    <h3>问题最多的文件 (Top 10)</h3>
    <table class="data-table">
      <tr><th>文件</th><th>问题数</th></tr>
      ${security.topFiles.map((f) => `<tr><td>${esc(f.file)}</td><td>${f.issues}</td></tr>`).join("")}
    </table>`;
  }

  return section(
    "安全检查",
    `
    <div class="security-score">
      <div class="score-ring" style="border-color:${scoreColor(score)}">
        <span style="color:${scoreColor(score)}">${score}</span>
        <small>评分 ${grade}</small>
      </div>
      <div class="score-info">
        <div class="score-status" style="color:${scoreColor(score)}">${scoreLabel(score)}</div>
        <div>${severityBadges}</div>
        <div class="dep-info">依赖漏洞: ${depVuln} 个</div>
        ${isV2 && security.stats ? `<div class="dep-info">检测规则: ${security.stats.totalRules || 0} 条 (${security.stats.secretRules || 0} 密钥 + ${security.stats.codeRules || 0} 代码)</div>` : ""}
      </div>
    </div>
    ${remediationHtml}
    ${
      issues.length > 0
        ? `<h3>问题列表 (显示前 ${topIssues.length} / ${issues.length} 项)</h3>
           <div class="table-wrap">
           <table class="issue-table">
             <tr><th>严重度</th><th>类型</th><th>位置</th><th>描述</th><th>建议</th>${isV2 ? "<th>CWE</th>" : ""}</tr>
             ${issueRows}
           </table>
           </div>`
        : `<p class="empty">未发现安全问题 🎉</p>`
    }
    ${cweHtml}
    ${topFilesHtml}`,
    "🛡️"
  );
}

function sevLabel(sev) {
  return { critical: "严重", high: "高危", medium: "中危", low: "低危", info: "信息" }[sev] || sev;
}

function renderDecisions(decisions) {
  // 只展示有效决策
  const valid = decisions.filter((d) => d.decision && (d.confidence ?? 1) >= 0.5);

  if (valid.length === 0) {
    return section("决策时间线", `<p class="empty">未找到有效决策记录 (.lore/decisions.jsonl)</p>`, "🧠");
  }

  // 按时间倒序
  const sorted = [...valid].sort((a, b) => {
    return (b.timestamp || "").localeCompare(a.timestamp || "");
  });

  // 分类统计
  const categoryStats = {};
  for (const d of sorted) {
    const cat = d.category || "other";
    categoryStats[cat] = (categoryStats[cat] || 0) + 1;
  }

  const categoryHtml = Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, count]) =>
        `<span class="badge" style="background:${categoryColor(cat)}">${categoryName(cat)}: ${count}</span>`
    )
    .join("");

  const items = sorted
    .slice(0, 100) // 最多展示 100 条
    .map((d) => {
      const cat = d.category || "other";
      const conf = d.confidence ?? 1;
      const confColor = conf >= 0.8 ? "#16a34a" : conf >= 0.5 ? "#ca8a04" : "#dc2626";
      return `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:${categoryColor(cat)};box-shadow:0 0 0 2px ${categoryColor(cat)}"></div>
        <div class="timeline-content">
          <div class="timeline-head">
            <span class="timeline-sha">${esc((d.commit_sha || "").slice(0, 8))}</span>
            <span class="timeline-date">${fmtDate(d.timestamp)}</span>
            <span class="timeline-author">${esc(d.author || "")}</span>
            <span class="timeline-cat" style="background:${categoryColor(cat)}">${categoryName(cat)}</span>
            <span class="timeline-conf" style="color:${confColor}">置信度 ${(conf * 100).toFixed(0)}%</span>
          </div>
          <div class="timeline-body">
            <p><strong>上下文:</strong> ${esc(d.context)}</p>
            <p class="decision-line"><strong>决策:</strong> ${esc(d.decision)}</p>
            ${d.rejected ? `<p class="rejected-line"><strong>否决方案:</strong> ${esc(d.rejected)}</p>` : ""}
            ${d.constraints ? `<p><strong>约束:</strong> ${esc(d.constraints)}</p>` : ""}
            ${d.message ? `<p class="commit-msg"><code>${esc(d.message)}</code></p>` : ""}
          </div>
        </div>
      </div>`;
    })
    .join("");

  return section(
    "决策时间线",
    `
    <div class="decision-stats">
      <p class="stats-label">决策分类分布:</p>
      <div class="badge-row">${categoryHtml}</div>
      <p class="stats-label" style="margin-top:8px">有效决策: <strong>${valid.length}</strong> / ${decisions.length} 条记录${sorted.length > 100 ? ` (展示最近 100 条)` : ""}</p>
    </div>
    <div class="timeline">${items}</div>`,
    "🧠"
  );
}

// ============================================================
// HTML 构建
// ============================================================

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
  .container { max-width: 1000px; margin: 0 auto; }

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
    position: relative; overflow: hidden;
  }
  .card-icon { font-size: 24px; margin-bottom: 8px; }
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

  /* 置信度 */
  .confidence-bar { margin: 16px 0; padding: 16px; background: #f8fafc; border-radius: 8px; }
  .conf-stats { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 8px; }
  .conf-item { display: flex; align-items: center; gap: 6px; font-size: 14px; }
  .conf-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .conf-pct { color: #94a3b8; font-size: 12px; }

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

  /* 修复优先级 */
  .remediation-plan { display: flex; flex-direction: column; gap: 12px; }
  .remediation-item { background: #f8fafc; border-radius: 8px; padding: 12px 16px; border-left: 4px solid #dc2626; }
  .remediation-priority { font-weight: 700; font-size: 14px; color: #dc2626; }
  .remediation-desc { font-size: 14px; margin-top: 4px; }
  .remediation-action { font-size: 13px; color: #64748b; margin-top: 4px; }

  /* 决策统计 */
  .decision-stats { margin-bottom: 20px; }
  .stats-label { font-size: 14px; color: #475569; margin-bottom: 6px; }
  .badge-row { display: flex; flex-wrap: wrap; gap: 4px; }

  /* 时间线 */
  .timeline { position: relative; padding-left: 24px; }
  .timeline::before { content: ""; position: absolute; left: 6px; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
  .timeline-item { position: relative; margin-bottom: 24px; }
  .timeline-dot { position: absolute; left: -24px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #6366f1; border: 2px solid #fff; box-shadow: 0 0 0 2px #6366f1; }
  .timeline-content { background: #f8fafc; border-radius: 8px; padding: 16px; }
  .timeline-head { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; align-items: center; }
  .timeline-sha { font-family: monospace; background: #1e293b; color: #fff; padding: 1px 8px; border-radius: 4px; }
  .timeline-date { color: #64748b; }
  .timeline-author { color: #64748b; }
  .timeline-cat { color: #fff; padding: 1px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .timeline-conf { font-size: 12px; font-weight: 600; }
  .timeline-body p { margin-bottom: 6px; font-size: 14px; }
  .decision-line { color: #0f172a; font-weight: 500; }
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
  console.log(" Agent Forge - 治理报告生成脚本 v2.0");
  console.log("========================================");

  console.log("\n[1/3] 读取各模块数据 ...");
  const provenance = readJson(PROVENANCE_FILE);
  console.log(
    `  溯源数据: ${provenance ? `已加载 v${provenance.version || "1.0"}` : "缺失"} ${
      provenance ? "(" + (provenance.summary?.totalFiles || 0) + " 文件)" : ""
    }`
  );

  const security = readJson(SECURITY_FILE);
  console.log(
    `  安全报告: ${security ? `已加载 v${security.version || "1.0"}` : "缺失"} ${
      security ? "(评分 " + security.score + ", " + (security.issues?.length || 0) + " 问题)" : ""
    }`
  );

  const decisions = readJsonl(DECISIONS_FILE);
  const validDecisions = decisions.filter((d) => d.decision && (d.confidence ?? 1) >= 0.5);
  console.log(`  决策记录: ${decisions.length} 条 (${validDecisions.length} 条有效)`);

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
  console.log(" 治理报告生成完成！v2.0");
  console.log("========================================");
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log(`文件大小: ${sizeKB} KB`);
  console.log(`溯源文件: ${provenance?.summary?.totalFiles || 0} 个`);
  console.log(`安全评分: ${security?.score ?? "—"} / 100 (${security?.scoreGrade || ""})`);
  console.log(`决策记录: ${validDecisions.length} 条有效 / ${decisions.length} 条总计`);
}

main();
