/**
 * scripts/collect-governance.js
 * 治理数据聚合脚本 v2.0：读取 provenance.json、security-report.json、decisions.jsonl，
 * 聚合为紧凑的 JSON 摘要，供 governance.yml 回调时发送给 webhook 写入数据库。
 *
 * 增强:
 *   - 兼容 v1 和 v2 数据格式
 *   - 传递置信度、分类等 v2 新字段
 *   - 更精确的风险评分计算
 *
 * 输出: stdout 输出 JSON（供 workflow 读取）
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PROVENANCE_FILE = path.join(ROOT, ".forge", "provenance.json");
const SECURITY_FILE = path.join(ROOT, ".forge", "security-report.json");
const LORE_FILE = path.join(ROOT, ".lore", "decisions.jsonl");

const SEVERITY_WEIGHT = { critical: 25, high: 10, medium: 4, low: 1, info: 0 };

/** 安全读取 JSON 文件 */
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 安全读取 JSONL 文件 */
function readJsonl(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw
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
  } catch {
    return [];
  }
}

/**
 * 聚合溯源数据：将 per-line 的 provenance 数据聚合为 per-file 摘要
 * 每个文件取主导来源（AI 或人类）和模型名
 * v2: 包含置信度和 AI 比例
 */
function aggregateProvenance(provenance) {
  if (!provenance || !provenance.files) return [];

  return provenance.files.map((fileEntry) => {
    const lines = fileEntry.lines || [];
    const lineCount = lines.length;

    let aiLines = 0;
    let humanLines = 0;
    const modelCounts = {};
    let totalConfidence = 0;
    let aiConfidenceCount = 0;

    for (const line of lines) {
      if (line.source === "ai") {
        aiLines++;
        if (line.model) {
          modelCounts[line.model] = (modelCounts[line.model] || 0) + 1;
        }
        // v2: 置信度
        if (typeof line.confidence === "number") {
          totalConfidence += line.confidence;
          aiConfidenceCount++;
        }
      } else {
        humanLines++;
      }
    }

    // 主导来源
    const source = aiLines >= humanLines ? "ai" : "human";

    // 主导模型（出现次数最多的）
    let modelName = null;
    let maxCount = 0;
    for (const [model, count] of Object.entries(modelCounts)) {
      if (count > maxCount) {
        maxCount = count;
        modelName = model;
      }
    }

    // 如果是 AI 来源，source 字段包含模型信息
    const sourceField = source === "ai" && modelName ? `ai:${modelName}` : source;

    // v2: 平均置信度
    const avgConfidence = aiConfidenceCount > 0 ? totalConfidence / aiConfidenceCount : null;

    return {
      filePath: fileEntry.path,
      source: sourceField,
      modelName: source === "ai" ? modelName : null,
      lineCount,
      aiLines,
      humanLines,
      aiRatio: lineCount > 0 ? Math.round((aiLines / lineCount) * 1000) / 10 : 0,
      avgConfidence,
    };
  });
}

/**
 * 按文件分组安全问题，计算每个文件的风险分
 * v2: 使用递减惩罚算法
 */
function aggregateSecurity(security) {
  const fileMap = new Map();

  if (security && security.issues) {
    for (const issue of security.issues) {
      const filePath = issue.file || "unknown";
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { issues: [], riskScore: 0, severityCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } });
      }
      const entry = fileMap.get(filePath);
      entry.issues.push({
        type: issue.type,
        severity: issue.severity,
        line: issue.line || 0,
        description: issue.description || "",
        suggestion: issue.suggestion || "",
        cwe: issue.cwe || null,
      });
      entry.riskScore += SEVERITY_WEIGHT[issue.severity] || 1;
      entry.severityCount[issue.severity] = (entry.severityCount[issue.severity] || 0) + 1;
    }
  }

  return fileMap;
}

/**
 * 合并溯源和安全数据，生成 GovernanceReport 格式的数据
 * v2: 包含更多字段
 */
function mergeGovernanceData(provenanceFiles, securityMap) {
  return provenanceFiles.map((file) => {
    const secEntry = securityMap.get(file.filePath);
    return {
      filePath: file.filePath,
      source: file.source,
      modelName: file.modelName,
      lineCount: file.lineCount,
      aiLines: file.aiLines,
      humanLines: file.humanLines,
      aiRatio: file.aiRatio,
      avgConfidence: file.avgConfidence,
      riskScore: secEntry ? secEntry.riskScore : 0,
      issues: secEntry ? secEntry.issues : [],
    };
  });
}

/**
 * 转换 Lore 决策记录为数据库格式
 * v2: 包含分类和置信度，过滤无效决策
 */
function transformLoreRecords(loreData) {
  return loreData
    .filter((record) => {
      // v2: 只保留有效决策
      const hasDecision = record.decision && record.decision !== "（未能提取决策内容）";
      const confidence = record.confidence ?? 1;
      return hasDecision && confidence >= 0.5;
    })
    .map((record) => ({
      commitSha: record.commit_sha || record.commitSha || "",
      timestamp: record.timestamp || "",
      author: record.author || "",
      category: record.category || "other",
      context: record.context || "",
      decision: record.decision || "",
      rejected: record.rejected || null,
      constraints: record.constraints || null,
      confidence: record.confidence ?? 1,
      message: record.message || "",
    }));
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("========================================");
  console.log(" Agent Forge - 治理数据聚合 v2.0");
  console.log("========================================");

  // 读取溯源数据
  const provenance = readJson(PROVENANCE_FILE);
  if (!provenance) {
    console.warn("  未找到 provenance.json，溯源数据为空");
  } else {
    console.log(`  溯源数据: v${provenance.version || "1.0"}`);
  }

  // 读取安全报告
  const security = readJson(SECURITY_FILE);
  if (!security) {
    console.warn("  未找到 security-report.json，安全数据为空");
  } else {
    console.log(`  安全报告: v${security.version || "1.0"} (评分 ${security.score ?? "—"})`);
  }

  // 读取决策记录
  const loreData = readJsonl(LORE_FILE);
  const validLore = loreData.filter((d) => d.decision && (d.confidence ?? 1) >= 0.5);
  console.log(`  决策记录: ${loreData.length} 条 (${validLore.length} 条有效)`);

  // 聚合溯源数据
  const provenanceFiles = aggregateProvenance(provenance);
  console.log(`  聚合 ${provenanceFiles.length} 个文件的溯源数据`);

  // 聚合安全数据
  const securityMap = aggregateSecurity(security);
  console.log(`  聚合 ${securityMap.size} 个文件的安全问题`);

  // 合并数据
  const governanceReports = mergeGovernanceData(provenanceFiles, securityMap);
  console.log(`  生成 ${governanceReports.length} 条治理报告记录`);

  // 转换决策记录
  const loreRecords = transformLoreRecords(loreData);
  console.log(`  转换 ${loreRecords.length} 条有效决策记录`);

  // 输出到 stdout
  const output = {
    version: "2.0",
    generatedAt: new Date().toISOString(),
    summary: {
      provenanceVersion: provenance?.version || "1.0",
      securityVersion: security?.version || "1.0",
      securityScore: security?.score ?? null,
      securityGrade: security?.scoreGrade || null,
      totalFiles: provenanceFiles.length,
      totalDecisions: loreRecords.length,
      totalIssues: security?.summary?.total || 0,
    },
    governanceReports,
    loreRecords,
  };

  console.log("\n========================================");
  console.log(" 治理数据聚合完成！v2.0");
  console.log("========================================");

  // 输出 JSON 到 stdout（供 workflow 读取）
  process.stdout.write(JSON.stringify(output));
}

main();
