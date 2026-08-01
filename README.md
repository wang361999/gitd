# Agent Forge

> 以治理为核心的 AI 代码平台 — 代码溯源追踪、安全审查、决策记录，自动化打包发布

## 核心理念

**治理是核心，生成和打包只是辅助。**

- 生成代码 → 触发治理的入口
- 打包代码 → 交付治理结果的方式
- 治理代码 → 平台的核心价值

## 四种触发治理的方式

| 触发方式 | 入口 | 适用场景 |
|---------|------|---------|
| 生成后自动治理 | 新建项目 → 生成 → 自动触发 | 新项目 |
| 独立治理已有仓库 | 控制台 → 选择仓库 → 点击治理 | 存量代码审计 |
| 定时自动治理 | 控制台 → 设置定时任务 | 持续监控 |
| 上传文件治理 | 控制台 → 上传代码文件 | 快速分析 |

## 治理报告内容

治理报告回答三个核心问题：

1. **代码是谁写的？** — 代码溯源：逐行追踪每行代码来源，饼图展示 AI 生成 vs 人工编写比例
2. **安不安全？** — 安全审查：风险等级、问题列表、修复建议
3. **为什么这么写？** — 决策记录：关键决策上下文、被否决的替代方案

## 部署

### Vercel 部署

1. 推送代码到 GitHub
2. Vercel 导入仓库（自动检测 Next.js）
3. 添加 Neon 数据库集成（自动注入 `DATABASE_URL`）
4. 首次访问 `/setup` 配置 GitHub OAuth 和 Token
5. 配置 GitHub 仓库 Secrets（`PAT_TOKEN`、`WEBHOOK_SECRET`、`GITHUB_TOKEN`）

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | Neon Postgres 连接串 | 是（Vercel Neon 集成自动注入） |
| `CRON_SECRET` | Vercel Cron 鉴权密钥（可选，增强安全） | 否 |

其余配置（GitHub OAuth、Token、密钥等）通过 `/setup` 页面存入数据库。

### 构建命令

```bash
# 标准构建（不包含数据库推送）
npm run build

# 完整构建（包含数据库 schema 同步，首次部署或 schema 变更时使用）
npm run build:full

# 手动同步数据库
npm run db:push
```

## 动态版本号机制

每次构建自动生成唯一版本号（时间戳 + git hash），客户端检测到版本变化后自动清除缓存并强制刷新，确保新部署的代码立刻生效。

- 构建时：`next.config.js` 生成版本号 → 写入 `public/version.txt` + 注入 `NEXT_PUBLIC_BUILD_VERSION`
- 客户端：`VersionChecker` 组件三层检测（首次加载对比 + 5分钟轮询 + 页面可见性事件）

## 本地开发

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
# 访问 http://localhost:3000
```

## 技术栈

- Next.js 14 + TypeScript + Tailwind CSS
- Prisma 5.22 + Neon Postgres
- GitHub Actions + GitHub Models
- iron-session 认证
- Vercel Cron 定时任务

## 项目结构

```
agent-forge/
├── app/
│   ├── api/               # API 路由
│   │   ├── auth/          # GitHub OAuth 认证
│   │   ├── build/         # 触发构建
│   │   ├── status/        # 查询任务状态
│   │   ├── webhook/       # GitHub Actions 回调
│   │   ├── projects/      # 项目 CRUD（含搜索+类型+状态筛选）
│   │   ├── governance/    # 治理数据
│   │   ├── schedules/     # 定时治理计划 CRUD
│   │   ├── cron/governance/ # Vercel Cron 定时触发
│   │   ├── upload/        # ZIP 文件上传治理
│   │   └── setup/         # 配置向导
│   ├── page.tsx           # 专业级产品落地页
│   ├── dashboard/         # 用户仪表盘
│   ├── new/               # 新建项目（含仓库选择）
│   ├── governance/        # 独立治理页面
│   ├── schedules/         # 定时治理管理
│   ├── upload/            # 文件上传治理
│   ├── project/[id]/      # 项目详情 + 构建进度
│   └── setup/             # 配置向导页面
├── components/             # React 组件
│   ├── governance/        # 治理报告组件（含导出功能）
│   ├── build/             # 构建相关组件
│   ├── VersionChecker.tsx # 动态版本号检测
│   └── ...
├── lib/                   # 核心库
├── prisma/schema.prisma   # 数据库模型
├── .github/workflows/     # 3 个 Actions 工作流
└── scripts/               # 治理脚本
```

## Vercel 函数

| 路由 | 类型 |
|------|------|
| /api/auth | Dynamic |
| /api/build | Dynamic |
| /api/status | Dynamic |
| /api/webhook | Dynamic |
| /api/projects | Dynamic |
| /api/governance | Dynamic |
| /api/setup | Dynamic |
| /api/schedules | Dynamic |
| /api/upload | Dynamic |
| /api/cron/governance | Dynamic |
| /project/[id] | Dynamic |
| /project/[id]/build | Dynamic |
| Middleware | Edge |
| /, /dashboard, /new, /governance, /schedules, /upload, /setup | Static |
