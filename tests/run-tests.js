/**
 * tests/run-tests.js
 * 统一测试运行器 - 运行所有核心脚本测试
 */

const { execSync } = require("child_process");
const path = require("path");

const testFiles = [
  "test-provenance.js",
  "test-security.js",
  "test-lore.js",
];

console.log("╔══════════════════════════════════════╗");
console.log("║   Agent Forge 核心脚本测试套件       ║");
console.log("╚══════════════════════════════════════╝\n");

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n运行: ${file}`);
  console.log("───────────────────────────────────────");
  
  try {
    const output = execSync(`node "${filePath}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(output);
    
    // 解析结果
    const match = output.match(/(\d+) 通过, (\d+) 失败/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
      results.push({ file, passed: parseInt(match[1]), failed: parseInt(match[2]) });
    }
  } catch (err) {
    // 测试有失败时，进程退出码为 1
    const output = err.stdout || "";
    const stderr = err.stderr || "";
    console.log(output);
    if (stderr) console.log(stderr);
    
    const match = output.match(/(\d+) 通过, (\d+) 失败/);
    if (match) {
      totalPassed += parseInt(match[1]);
      totalFailed += parseInt(match[2]);
      results.push({ file, passed: parseInt(match[1]), failed: parseInt(match[2]) });
    } else {
      totalFailed++;
      results.push({ file, passed: 0, failed: 1, error: err.message });
    }
  }
}

console.log("\n╔══════════════════════════════════════╗");
console.log("║           测试结果汇总               ║");
console.log("╚══════════════════════════════════════╝");
console.log("\n测试文件              通过  失败");
console.log("───────────────────────────────────────");
for (const r of results) {
  const status = r.failed === 0 ? "✓" : "✗";
  console.log(`${status} ${r.file.padEnd(20)} ${String(r.passed).padStart(4)}  ${String(r.failed).padStart(4)}`);
}
console.log("───────────────────────────────────────");
console.log(`  ${"总计".padEnd(20)} ${String(totalPassed).padStart(4)}  ${String(totalFailed).padStart(4)}`);
console.log("");

if (totalFailed > 0) {
  console.log(`❌ ${totalFailed} 个测试失败`);
  process.exit(1);
} else {
  console.log(`✅ 全部 ${totalPassed} 个测试通过`);
}
