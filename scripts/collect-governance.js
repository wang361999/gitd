/**
 * scripts/collect-governance.js
 * 治理数据聚合脚本：读取 provenance.json、security-report.json、decisions.jsonl，
 * 聚合为紧凑的 JSON 摘要，供 governance.yml 回调时发送给 webhook 写入数据库。
 *
 * 输出: stdout 输出 JSON（供 workflow 读取）
 *   {
 *     "governanceReports": [
 *       { "filePath": "...", "source": "ai|human", "modelName": "...|null",
 *         "lineCount": N, "riskScore": F, "issues": [...] }
 *     ],
 *     "loreRecords": [
 *       { "commitSha": "...", "context": "...", "decision": "...",
 *         "rejected": null|"...", "constraints": null|"..." }
 *     ]
 *   }
 *
 * 环境变量: 无
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PROVENANCE_FILE = path.join(ROOT, ".forge", "provenance.json");
const SECURITY_FILE = path.join(ROOT, ".forge", "security-report.json");
const LORE_FILE = path.join(ROOT, ".lore", "decisions.jsonl");

const SEVERITY_WEIGHT = { critical: 25, high: 10, medium: 4, low: 1 };

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
 */
function aggregateProvenance(provenance) {
  if (!provenance || !provenance.files) return [];

  return provenance.files.map((fileEntry) => {
    const lines = fileEntry.lines || [];
    const lineCount = lines.length;

    let aiLines = 0;
    let humanLines = 0;
    const modelCounts = {};

    for (const line of lines) {
      if (line.source === "ai") {
        aiLines++;
        if (line.model) {
          modelCounts[line.model] = (modelCounts[line.model] || 0) + 1;
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

    return {
      filePath: fileEntry.path,
      source: sourceField,
      modelName: source === "ai" ? modelName : null,
      lineCount,
      aiLines,
      humanLines,
    };
  });
}

/**
 * 按文件分组安全问题，计算每个文件的风险分
 */
function aggregateSecurity(security) {
  const fileMap = new Map();

  if (security && security.issues) {
    for (const issue of security.issues) {
      const filePath = issue.file || "unknown";
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { issues: [], riskScore: 0 });
      }
      const entry = fileMap.get(filePath);
      entry.issues.push({
        type: issue.type,
        severity: issue.severity,
        line: issue.line || 0,
        description: issue.description || "",
        suggestion: issue.suggestion || "",
      });
      entry.riskScore += SEVERITY_WEIGHT[issue.severity] || 1;
    }
  }

  return fileMap;
}

/**
 * 合并溯源和安全数据，生成 GovernanceReport 格式的数据
 */
function mergeGovernanceData(provenanceFiles, securityMap) {
  return provenanceFiles.map((file) => {
    const secEntry = securityMap.get(file.filePath);
    return {
      filePath: file.filePath,
      source: file.source,
      modelName: file.modelName,
      lineCount: file.lineCount,
      riskScore: secEntry ? secEntry.riskScore : 0,
      issues: secEntry ? secEntry.issues : [],
    };
  });
}

/**
 * 转换 Lore 决策记录为数据库格式
 */
function transformLoreRecords(loreData) {
  return loreData.map((record) => ({
    commitSha: record.commit_sha || record.commitSha || "",
    context: record.context || "",
    decision: record.decision || "",
    rejected: record.rejected || null,
    constraints: record.constraints || null,
  }));
}

// ============================================================
// 主流程
// ============================================================

function main() {
  console.log("========================================");
  console.log(" Agent Forge - 治理数据聚合");
  console.log("========================================");

  // 读取溯源数据
  const provenance = readJson(PROVENANCE_FILE);
  if (!provenance) {
    console.warn("  未找到 provenance.json，溯源数据为空");
  }

  // 读取安全报告
  const security = readJson(SECURITY_FILE);
  if (!security) {
    console.warn("  未找到 security-report.json，安全数据为空");
  }

  // 读取决策记录
  const loreData = readJsonl(LORE_FILE);
  console.log(`  读取到 ${loreData.length} 条决策记录`);

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
  console.log(`  转换 ${loreRecords.length} 条决策记录`);

  // 输出到 stdout
  const output = {
    governanceReports,
    loreRecords,
  };

  console.log("\n========================================");
  console.log(" 治理数据聚合完成！");
  console.log("========================================");

  // 输出 JSON 到 stdout（供 workflow 读取）
  process.stdout.write(JSON.stringify(output));
}

main();
