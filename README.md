# Agent Forge

> 基于 Git 原生协议的 AI 代理协作与代码治理平台

## 完全自动化部署（零手动环境变量）

### 工作原理

部署到 Vercel 后，**唯一需要的环境变量是 `DATABASE_URL`**（由 Vercel Neon 集成自动提供）。其余所有配置通过首次访问的 Setup 向导自动落库。

```
Vercel 部署 → Neon 集成自动创建数据库 → DATABASE_URL 自动注入
    ↓
首次访问 → Middleware 检测未配置 → 自动跳转 /setup
    ↓
Setup 向导：输入 GitHub OAuth + Token → 自动生成密钥 → 全部落库
    ↓
配置完成 → 设置 cookie 标记 → 正常使用
```

### 部署步骤

1. **推送代码到 GitHub**

2. **Vercel 导入仓库**
   - Vercel 会自动检测 Next.js 框架
   - 无需手动配置任何环境变量

3. **添加 Neon 数据库集成**
   - 在 Vercel 项目面板 → Storage → Add → Neon
   - Neon 自动创建数据库并注入 `DATABASE_URL` 环境变量
   - 重新部署一次使 `DATABASE_URL` 生效

4. **初始化数据库**
   - 在 Vercel 项目面板 → Settings → Functions → Run Command
   - 或本地执行：`npx prisma db push`（需要先 pull 环境变量）

5. **访问网站**
   - 首次访问自动跳转到 `/setup` 页面
   - 按向导输入 GitHub OAuth App 信息和 Token
   - 系统自动生成 SESSION_SECRET 和 WEBHOOK_SECRET
   - 所有配置自动存入数据库

6. **配置 GitHub 仓库 Secrets**（向导页面会显示具体值）
   - 在 Agent Forge 代码仓库 → Settings → Secrets and variables → Actions
   - 添加 `PAT_TOKEN`（值同 GitHub Token）
   - 添加 `WEBHOOK_SECRET`（值同向导生成的密钥）
   - 添加 `GITHUB_TOKEN`（值同 GitHub Token）

### GitHub OAuth App 创建

- 进入 https://github.com/settings/developers → New OAuth App
- Homepage URL: `https://your-project.vercel.app`
- Authorization callback URL: `https://your-project.vercel.app/api/auth?action=callback`
- Setup 向导会自动显示回调 URL，直接复制即可

### GitHub Personal Access Token 创建

- 进入 https://github.com/settings/tokens → Fine-grained tokens
- 权限：`repo`（Full control of private repos）+ `workflow`（Update GitHub Action workflows）

## Vercel 函数数量

| 路由 | 类型 | 函数 |
|------|------|------|
| /api/auth | Dynamic | 1 |
| /api/build | Dynamic | 2 |
| /api/status | Dynamic | 3 |
| /api/webhook | Dynamic | 4 |
| /api/projects | Dynamic | 5 |
| /api/governance | Dynamic | 6 |
| /api/setup | Dynamic | 7 |
| /project/[id] | Dynamic | 8 |
| /project/[id]/build | Dynamic | 9 |
| Middleware | Edge | - |
| /, /dashboard, /setup | Static | - |

**总计：9 个 serverless 函数**（Vercel 免费版限制 12 个）

## 本地开发

```bash
# 安装依赖
npm install

# 生成 Prisma 客户端
npx prisma generate

# 创建 .env.local，只需一行：
# DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# 同步数据库
npx prisma db push

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000 → 自动跳转到 /setup
```

## 项目结构

```
agent-forge/
├── app/
│   ├── api/               # 7 个 API 路由
│   │   ├── auth/          # GitHub OAuth
│   │   ├── build/         # 触发构建
│   │   ├── status/        # 查询状态
│   │   ├── webhook/       # Actions 回调
│   │   ├── projects/      # 项目 CRUD
│   │   ├── governance/    # 治理数据
│   │   └── setup/         # 自动化配置向导
│   ├── setup/             # 配置向导页面
│   ├── page.tsx           # 首页
│   ├── dashboard/         # 仪表盘
│   └── project/[id]/      # 项目详情 + 构建进度
├── components/             # React 组件
├── lib/
│   ├── settings.ts        # 配置管理器（从数据库读取）
│   ├── prisma.ts          # 数据库客户端
│   ├── auth.ts            # 认证
│   ├── github.ts          # GitHub API
│   └── models.ts          # AI Models
├── prisma/schema.prisma   # 7 张表（含 settings 表）
├── middleware.ts          # 自动跳转 /setup
├── .github/workflows/     # 3 个 Actions 工作流
└── scripts/               # 6 个治理脚本
```

## 技术栈

- Next.js 14 + TypeScript + Tailwind CSS
- Prisma + Neon Postgres
- GitHub Actions + GitHub Models
- iron-session 认证
- 全配置数据库化，零手动环境变量
