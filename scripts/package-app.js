/**
 * scripts/package-app.js
 * 打包脚本：根据 project_type 执行不同的打包策略。
 *
 * 用法:
 *   node scripts/package-app.js --project-type desktop --platform win
 *   node scripts/package-app.js --project-type web
 *   node scripts/package-app.js --project-type mobile
 *   node scripts/package-app.js --project-type web --generate-guide
 *
 * 策略:
 *   - web:    不打包，输出部署到 Vercel 的说明
 *   - desktop: 调用 electron-builder 打包 (win / mac)
 *   - mobile:  调用 gradle assembleRelease 打包 APK
 *   - --generate-guide: 调用 GitHub Models 生成安装说明
 *
 * 环境变量:
 *   GITHUB_TOKEN - 生成安装说明时调用 GitHub Models
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const MODEL = "gpt-4o";

const ROOT = process.cwd();

// ============================================================
// 工具函数
// ============================================================

function exec(cmd, opts = {}) {
  console.log(`  [exec] ${cmd}`);
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "inherit", ...opts });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`  [写入] ${filePath} (${Buffer.byteLength(content)} bytes)`);
}

/** 读取 package.json，不存在则返回空对象 */
function readPackageJson() {
  const pkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return {};
  }
}

// ============================================================
// 打包策略
// ============================================================

/**
 * Web 项目：不打包，输出部署到 Vercel 的说明
 */
function packageWeb(pkg) {
  console.log("\n[策略] Web 项目 - 不打包，输出 Vercel 部署说明");

  const projectName = pkg.name || "web-app";
  const notes = `# ${projectName} 部署说明

## 部署到 Vercel

本项目为 Web 应用，推荐部署到 Vercel。

### 前置要求
- Vercel 账号 (https://vercel.com)
- 项目已推送到 GitHub / GitLab / Bitbucket

### 部署步骤
1. 登录 Vercel 控制台
2. 点击 "Add New..." -> "Project"
3. 导入对应 Git 仓库
4. Vercel 会自动识别框架 (Next.js / React / Vite 等)
5. 确认构建配置:
   - Build Command: \`npm run build\`
   - Output Directory: 由框架决定 (Next.js 自动, Vite 为 dist)
6. 添加环境变量 (如有需要)
7. 点击 "Deploy"

### CLI 部署
\`\`\`bash
npm i -g vercel
vercel        # 部署预览环境
vercel --prod # 部署生产环境
\`\`\`

### 自定义域名
在 Vercel 项目 Settings -> Domains 中添加自定义域名。

---
由 Agent Forge 自动生成
`;

  writeFile(path.join(ROOT, "release-notes.md"), notes);
  writeFile(path.join(ROOT, "DEPLOY.md"), notes);

  console.log("\n  Web 项目无需打包，已生成部署说明: DEPLOY.md");
  return { packaged: false, note: "Web 项目直接部署到 Vercel" };
}

/**
 * Desktop 项目：使用 electron-builder 打包
 */
function packageDesktop(pkg, platform) {
  console.log(`\n[策略] Desktop 项目 - 使用 electron-builder 打包 (platform=${platform})`);

  // 确保 electron-builder 可用
  const hasElectronBuilder =
    pkg.devDependencies?.["electron-builder"] ||
    pkg.dependencies?.["electron-builder"];

  if (!hasElectronBuilder) {
    console.log("  未检测到 electron-builder，正在安装 ...");
    exec("npm install --save-dev electron-builder");
  }

  // 确保 build 配置存在
  if (!pkg.build) {
    console.log("  package.json 中缺少 build 配置，写入默认 electron-builder 配置 ...");
    pkg.build = {
      appId: `com.agentforge.${(pkg.name || "app").replace(/[^a-z0-9]/gi, "")}`,
      productName: pkg.name || "Desktop App",
      directories: { output: "release-artifacts" },
      files: ["dist/**/*", "main.js", "package.json"],
      win: { target: ["nsis"] },
      mac: { target: ["dmg"] },
    };
    fs.writeFileSync(
      path.join(ROOT, "package.json"),
      JSON.stringify(pkg, null, 2),
      "utf8"
    );
  }

  const target = platform === "mac" ? "dmg" : "nsis";
  const flag = platform === "mac" ? "--mac" : "--win";

  console.log(`  开始打包 (${flag}) ...`);
  exec(`npx electron-builder ${flag}`);

  // 生成 release-notes
  const notes = `# ${pkg.name || "Desktop App"} 桌面应用发布

## 安装说明
- Windows: 下载 .exe (NSIS) 安装包，双击运行安装
- macOS: 下载 .dmg 文件，拖拽到 Applications 文件夹

## 构建平台
- ${platform === "mac" ? "macOS (dmg)" : "Windows (nsis)"}

---
由 Agent Forge 自动生成
`;
  writeFile(path.join(ROOT, "release-notes.md"), notes);

  console.log("\n  桌面应用打包完成，产物位于 release-artifacts/");
  return { packaged: true, platform, target };
}

/**
 * Mobile 项目：使用 gradle 打包 APK
 */
function packageMobile(pkg) {
  console.log("\n[策略] Mobile 项目 - 使用 gradle 打包 APK");

  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const gradlewPath = path.join(ROOT, gradlew);

  if (!fs.existsSync(gradlewPath)) {
    console.warn("  未找到 gradlew，检查是否存在 android 目录 ...");
    const androidDir = path.join(ROOT, "android");
    if (!fs.existsSync(androidDir)) {
      throw new Error("未找到 Android 项目结构 (android/ 目录或 gradlew)，无法打包 APK");
    }
  }

  console.log("  执行 gradle assembleRelease ...");
  exec(`${gradlew} assembleRelease`);

  // 查找生成的 APK
  const apkDir = path.join(ROOT, "android", "app", "build", "outputs", "apk", "release");
  if (fs.existsSync(apkDir)) {
    fs.mkdirSync(path.join(ROOT, "release-artifacts"), { recursive: true });
    const apks = fs.readdirSync(apkDir).filter((f) => f.endsWith(".apk"));
    for (const apk of apks) {
      const src = path.join(apkDir, apk);
      const dest = path.join(ROOT, "release-artifacts", apk);
      fs.copyFileSync(src, dest);
      console.log(`  复制 APK: ${apk}`);
    }
  }

  const notes = `# ${pkg.name || "Mobile App"} 移动应用发布

## 安装说明
1. 下载 .apk 文件到 Android 设备
2. 在设备上允许 "安装未知来源应用"
3. 点击 apk 文件进行安装

## 备注
- 当前为 release 签名构建
- 如需上架 Google Play，请使用 Play Console 上传 aab

---
由 Agent Forge 自动生成
`;
  writeFile(path.join(ROOT, "release-notes.md"), notes);

  console.log("\n  APK 打包完成，产物位于 release-artifacts/");
  return { packaged: true, platform: "android" };
}

/**
 * 调用 GitHub Models 生成安装说明
 */
async function generateInstallGuide(projectType) {
  console.log("\n[生成安装说明] 调用 GitHub Models ...");

  if (!GITHUB_TOKEN) {
    console.warn("  GITHUB_TOKEN 未设置，跳过安装说明生成");
    return;
  }

  const pkg = readPackageJson();
  const projectName = pkg.name || "项目";
  const techStack = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]
    .slice(0, 10)
    .join(", ");

  const systemPrompt = `为以下项目生成一份清晰、完整的安装说明（Markdown 格式）。

项目名称: ${projectName}
项目类型: ${projectType}
主要依赖: ${techStack || "(未检测到)"}

请包含以下章节：
1. 环境要求 (Node 版本、系统要求等)
2. 安装步骤
3. 运行 / 开发命令
4. 构建与打包
5. 常见问题 (FAQ)

只返回 Markdown 内容，不要包含额外解释。`;

  try {
    const res = await fetch(`${MODELS_ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 2500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`模型 API 错误 (${res.status}): ${err}`);
    }

    const data = await res.json();
    const guide = data.choices?.[0]?.message?.content || "（生成失败）";

    writeFile(path.join(ROOT, "INSTALL.md"), guide);
    console.log("\n  安装说明已生成: INSTALL.md");
  } catch (err) {
    console.warn("  安装说明生成失败:", err.message);
    // 写入兜底说明
    const fallback = `# ${projectName} 安装说明

## 环境要求
- Node.js >= 18

## 安装步骤
\`\`\`bash
npm install
\`\`\`

## 运行
\`\`\`bash
npm run dev
\`\`\`

---
(安装说明自动生成失败，已使用兜底模板)
`;
    writeFile(path.join(ROOT, "INSTALL.md"), fallback);
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("========================================");
  console.log(" Agent Forge - 打包脚本");
  console.log("========================================");

  const args = parseArgs(process.argv);
  const projectType = (args["project-type"] || "web").toLowerCase();
  const platform = args.platform || process.env.PLATFORM || "";

  console.log(`项目类型: ${projectType}`);
  console.log(`平台: ${platform || "(默认)"}`);

  const pkg = readPackageJson();
  console.log(`项目名: ${pkg.name || "(未命名)"}`);

  // 如果仅是生成安装说明模式
  if (args["generate-guide"]) {
    await generateInstallGuide(projectType);
    console.log("\n========================================");
    console.log(" 安装说明生成完成！");
    console.log("========================================");
    return;
  }

  let result;
  try {
    switch (projectType) {
      case "web":
        result = packageWeb(pkg);
        break;
      case "desktop":
        result = packageDesktop(pkg, platform);
        break;
      case "mobile":
        result = packageMobile(pkg);
        break;
      default:
        console.error(`错误: 不支持的项目类型 "${projectType}" (支持: web/desktop/mobile)`);
        process.exit(1);
    }
  } catch (err) {
    console.error("\n打包失败:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }

  console.log("\n========================================");
  console.log(" 打包完成！");
  console.log("========================================");
  console.log(`项目类型: ${projectType}`);
  console.log(`结果: ${JSON.stringify(result)}`);
}

main();
