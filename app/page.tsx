/**
 * Agent Forge 首页 — 专业级产品落地页
 *
 * 定位：AI 代码治理平台（治理审查为核心，代码生成为入口能力）
 * 设计：深色科技风，行业标杆级视觉
 */
export default function HomePage() {
  return (
    <div className="forge-animate-fade-in">
      {/* ================================================================
          Hero 区域
          ================================================================ */}
      <section className="relative overflow-hidden">
        {/* 背景渐变光效 */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-forge-accent/10 blur-[120px]" />
          <div className="absolute right-0 top-40 h-[300px] w-[400px] rounded-full bg-forge-purple/10 blur-[100px]" />
          <div className="absolute left-0 top-60 h-[300px] w-[400px] rounded-full bg-forge-green/5 blur-[100px]" />
        </div>

        <div className="flex flex-col items-center pt-16 pb-12 text-center">
          {/* 标签 */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-forge-border bg-forge-surface/80 px-4 py-1.5 text-sm text-forge-muted backdrop-blur">
            <span className="flex h-2 w-2 items-center justify-center">
              <span className="absolute h-2 w-2 animate-ping rounded-full bg-forge-green opacity-75" />
              <span className="h-1.5 w-1.5 rounded-full bg-forge-green" />
            </span>
            AI 驱动的代码治理与交付平台
          </div>

          {/* 主标题 */}
          <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight text-forge-ink sm:text-6xl">
            让每一行 AI 代码
            <br />
            <span className="bg-gradient-to-r from-forge-accent via-forge-purple to-forge-green bg-clip-text text-transparent">
              可溯源、可审查、可交付
            </span>
          </h1>

          {/* 副标题 */}
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-forge-muted">
            Agent Forge 不只是代码生成工具。它以治理为核心，对 AI 生成的代码进行
            <span className="text-forge-ink"> 溯源追踪、安全审查、决策记录</span>
            ，并自动化打包发布——确保 AI 代码达到生产级质量标准。
          </p>

          {/* CTA 按钮组 */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/api/auth?action=login"
              className="group inline-flex items-center gap-2 rounded-lg bg-forge-accent px-6 py-3 text-base font-medium text-white transition-all hover:brightness-110 hover:shadow-lg hover:shadow-forge-accent/20"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              使用 GitHub 登录
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
              </svg>
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-lg border border-forge-border bg-forge-surface/50 px-6 py-3 text-base font-medium text-forge-ink backdrop-blur transition-all hover:border-forge-muted"
            >
              了解更多
            </a>
          </div>

          {/* 技术标签 */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-forge-muted">
            {['GitHub Models', '代码溯源', '安全扫描', 'Lore 决策记录', '自动打包'].map(
              (tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-forge-border bg-forge-surface/50 px-3 py-1 backdrop-blur"
                >
                  {tag}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ================================================================
          核心价值 — 治理优先
          ================================================================ */}
      <section id="features" className="scroll-mt-20 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-forge-ink">
            为什么是治理，而不只是生成？
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-forge-muted">
            AI 生成代码已经很容易，但保证代码质量、安全性和可维护性才是真正的挑战。
            Agent Forge 将治理流程深度集成到交付管线中。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* 溯源追踪 */}
          <FeatureCard
            title="代码溯源"
            tag="Provenance"
            description="逐行追踪每行代码的来源——是哪个 AI 模型生成的，还是人类编写的。为审计和合规提供完整证据链。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.72.22a.75.75 0 011.06 0l1 1a.75.75 0 01-.72 1.28l-.22.22v.56l1.5 1.5V5.5l-.22.22a.75.75 0 101.06 1.06l.22-.22h.56l1.5 1.5h.56l.22-.22a.75.75 0 111.06 1.06l-.22.22v.56l1.5 1.5v.56l-.22.22a.75.75 0 101.06 1.06l1-1a.75.75 0 000-1.06l-1-1a.75.75 0 00-1.06 0l-.22.22h-.56l-1.5-1.5v-.56l.22-.22a.75.75 0 10-1.06-1.06l-.22.22h-.56l-1.5-1.5v-.56l.22-.22a.75.75 0 000-1.06l-1-1a.75.75 0 00-1.06 0zM8 11a3 3 0 100 6 3 3 0 000-6z" />
              </svg>
            }
            color="text-forge-accent"
            bg="bg-forge-accent/10"
          />

          {/* 安全审查 */}
          <FeatureCard
            title="安全审查"
            tag="Security"
            description="多模型交叉扫描，识别注入风险、敏感信息泄露、依赖漏洞。每条问题附带修复建议和风险评分。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.75.75h2.5a.75.75 0 000-1.5h-1.75v-2.75zM4.5 8a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z" />
              </svg>
            }
            color="text-forge-red"
            bg="bg-forge-red/10"
          />

          {/* 决策记录 */}
          <FeatureCard
            title="决策记录"
            tag="Lore Protocol"
            description="自动提取每个提交的架构决策上下文：为什么选择这个方案、拒绝了什么、有哪些约束。构建项目知识库。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
              </svg>
            }
            color="text-forge-purple"
            bg="bg-forge-purple/10"
          />

          {/* 自动化交付 */}
          <FeatureCard
            title="自动化交付"
            tag="Packaging"
            description="治理通过后，自动打包构建产物并发布 GitHub Release。Web 项目部署到 Vercel，桌面/移动应用生成安装包。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75zM1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V1.75z" />
                <path d="M7.25 6a.75.75 0 01.75.75v3.546l1.22-1.22a.75.75 0 11 1.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V6.75A.75.75 0 017.25 6z" />
              </svg>
            }
            color="text-forge-green"
            bg="bg-forge-green/10"
          />
        </div>
      </section>

      {/* ================================================================
          治理管线可视化
          ================================================================ */}
      <section className="py-12">
        <div className="forge-card overflow-hidden p-8">
          <h2 className="mb-2 text-center text-2xl font-bold text-forge-ink">
            治理管线
          </h2>
          <p className="mb-8 text-center text-sm text-forge-muted">
            从需求到交付，每个阶段都有治理检查点
          </p>

          {/* 管线步骤 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <PipelineStep
              num="01"
              title="需求分析"
              desc="解析需求，设计项目结构"
              icon="search"
            />
            <PipelineStep
              num="02"
              title="代码生成"
              desc="调用 GitHub Models 逐文件生成"
              icon="code"
            />
            <PipelineStep
              num="03"
              title="溯源 + 安全"
              desc="逐行溯源标记，多模型安全扫描"
              icon="shield"
              highlight
            />
            <PipelineStep
              num="04"
              title="决策记录"
              desc="提取架构决策，构建 Lore 知识库"
              icon="book"
              highlight
            />
            <PipelineStep
              num="05"
              title="打包交付"
              desc="自动构建 Release，生成安装说明"
              icon="package"
            />
          </div>

          {/* 治理产出 */}
          <div className="mt-8 grid grid-cols-1 gap-4 border-t border-forge-border pt-6 sm:grid-cols-3">
            <DeliverableItem
              title="治理报告"
              desc="每文件的来源标注、风险评分、问题清单"
            />
            <DeliverableItem
              title="决策日志"
              desc="完整的架构决策记录，含被拒绝方案"
            />
            <DeliverableItem
              title="安全审计"
              desc="漏洞列表、修复建议、合规检查"
            />
          </div>
        </div>
      </section>

      {/* ================================================================
          四种触发治理的方式
          ================================================================ */}
      <section className="py-12">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-forge-ink">
            四种方式，随时触发治理
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-forge-muted">
            无论是新项目、存量代码、还是持续监控，Agent Forge 都能以最适合的方式启动治理审查。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* 方式1：生成后自动治理 */}
          <TriggerCard
            num="01"
            title="生成后自动治理"
            tag="新建项目"
            desc="输入需求 → AI 生成代码 → 推送到仓库 → 自动触发治理。从代码生成到治理审查，一条龙完成。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z" />
              </svg>
            }
            color="text-forge-accent"
            bg="bg-forge-accent/10"
            flow={['需求分析', '代码生成', '自动治理']}
          />

          {/* 方式2：独立治理已有仓库 */}
          <TriggerCard
            num="02"
            title="独立治理已有仓库"
            tag="存量审计"
            desc="选择你拥有权限的 GitHub 仓库，一键触发治理。无需生成代码，直接对存量代码进行安全审查和溯源分析。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.467 0a2.75 2.75 0 011.066 0l5.25 1.307A1.75 1.75 0 0116 3.013v4.69c0 2.96-1.612 5.69-4.165 7.048l-3.322 1.764a1.75 1.75 0 01-1.026 0l-3.322-1.764C2.612 13.393 1 10.663 1 7.703V3.013c0-.79.53-1.482 1.282-1.706L7.467 0z" />
              </svg>
            }
            color="text-forge-green"
            bg="bg-forge-green/10"
            flow={['选择仓库', '触发治理', '查看报告']}
          />

          {/* 方式3：定时自动治理 */}
          <TriggerCard
            num="03"
            title="定时自动治理"
            tag="持续监控"
            desc="设置定时计划，系统按每天/每周/每月频率自动触发治理，持续监控仓库变更，及时发现安全隐患。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zm7-3.25a.75.75 0 00-1.5 0V8c0 .388.294.707.674.748l3.5.375a.75.75 0 10.16-1.492L8.5 7.74V4.75z" />
              </svg>
            }
            color="text-forge-yellow"
            bg="bg-forge-yellow/10"
            flow={['设置计划', '定期触发', '自动报告']}
          />

          {/* 方式4：上传文件治理 */}
          <TriggerCard
            num="04"
            title="上传文件治理"
            tag="快速分析"
            desc="直接上传 ZIP 代码压缩包，系统自动创建仓库、推送代码并执行治理。无需 GitHub 仓库，快速获得治理报告。"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
                <path d="M11.78 4.72a.75.75 0 00-1.06-1.06L8 6.38 5.28 3.66a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25z" />
              </svg>
            }
            color="text-forge-purple"
            bg="bg-forge-purple/10"
            flow={['上传 ZIP', '自动推送', '治理分析']}
          />
        </div>
      </section>

      {/* ================================================================
          能力详解
          ================================================================ */}
      <section className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold text-forge-ink">
          平台能力
        </h2>

        <div className="space-y-6">
          {/* 溯源能力 */}
          <CapabilityRow
            title="代码溯源 (Provenance)"
            description="基于 git-blame 和提交元数据，Agent Forge 将每一行代码标记为 AI 生成或人类编写，并记录生成模型。生成的溯源报告按文件聚合，展示主导来源、AI 代码占比和涉及模型列表。"
            points={[
              '逐行来源标记（AI / Human）',
              '模型名称与 token 用量追踪',
              '按文件聚合的溯源摘要',
              '提交级别的 AI 标签 [AI:model_name]',
            ]}
            badge="合规审计"
            badgeColor="bg-forge-accent/10 text-forge-accent"
          />

          {/* 安全能力 */}
          <CapabilityRow
            title="安全审查 (Security)"
            description="使用多个 AI 模型对生成的代码进行交叉安全审查，识别 OWASP Top 10 漏洞模式、敏感信息泄露、不安全依赖等问题。每条问题附带严重级别、行号和修复建议。"
            points={[
              '多模型交叉验证减少漏报',
              '风险评分（按严重级别加权）',
              '具体行号 + 修复建议',
              '按文件分组的漏洞报告',
            ]}
            badge="安全合规"
            badgeColor="bg-forge-red/10 text-forge-red"
            reversed
          />

          {/* Lore 能力 */}
          <CapabilityRow
            title="Lore 决策记录"
            description="自动分析每个提交的 diff，提取架构决策上下文：当前问题是什么、选择了什么方案、拒绝了什么方案、有哪些约束条件。构建项目的决策知识库，为后续维护提供上下文。"
            points={[
              '自动提取决策上下文',
              '记录被拒绝的替代方案',
              '约束条件归档',
              '按提交 SHA 关联决策记录',
            ]}
            badge="知识沉淀"
            badgeColor="bg-forge-purple/10 text-forge-purple"
          />
        </div>
      </section>

      {/* ================================================================
          技术栈
          ================================================================ */}
      <section className="py-12">
        <div className="forge-card p-8">
          <h2 className="mb-6 text-center text-xl font-semibold text-forge-ink">
            技术架构
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { name: 'Next.js 14', desc: '前端 + API' },
              { name: 'Prisma', desc: '数据模型' },
              { name: 'Neon', desc: 'PostgreSQL' },
              { name: 'GitHub Models', desc: 'AI 推理' },
              { name: 'GitHub Actions', desc: 'CI/CD 管线' },
              { name: 'Vercel', desc: '部署平台' },
            ].map((tech) => (
              <div
                key={tech.name}
                className="rounded-lg border border-forge-border bg-forge-bg p-3 text-center transition-colors hover:border-forge-accent/50"
              >
                <p className="text-sm font-medium text-forge-ink">{tech.name}</p>
                <p className="mt-0.5 text-xs text-forge-muted">{tech.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          CTA 区域
          ================================================================ */}
      <section className="py-12">
        <div className="relative overflow-hidden rounded-2xl border border-forge-border bg-gradient-to-br from-forge-surface to-forge-bg p-10 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[200px] w-[600px] -translate-x-1/2 rounded-full bg-forge-accent/10 blur-[80px]" />
          </div>
          <h2 className="text-3xl font-bold text-forge-ink">
            开始治理你的 AI 代码
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-forge-muted">
            登录后即可创建项目，体验从生成到治理到交付的完整流程。
          </p>
          <a
            href="/api/auth?action=login"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-forge-accent px-6 py-3 text-base font-medium text-white transition-all hover:brightness-110 hover:shadow-lg hover:shadow-forge-accent/20"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            使用 GitHub 登录
          </a>
        </div>
      </section>
    </div>
  );
}

// ================================================================
// 子组件
// ================================================================

function TriggerCard({
  num,
  title,
  tag,
  desc,
  icon,
  color,
  bg,
  flow,
}: {
  num: string;
  title: string;
  tag: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  flow: string[];
}) {
  return (
    <div className="group forge-card p-6 transition-all hover:border-forge-accent/30 hover:bg-forge-surface/80">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} ${color}`}
        >
          {icon}
        </div>
        <span className="font-mono text-2xl font-bold text-forge-border">
          {num}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-base font-semibold text-forge-ink">{title}</h3>
        <span className="rounded-md bg-forge-bg px-2 py-0.5 text-xs text-forge-muted">
          {tag}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-forge-muted">{desc}</p>
      {/* 流程箭头 */}
      <div className="mt-4 flex items-center gap-1.5">
        {flow.map((step, i) => (
          <div key={step} className="flex items-center gap-1.5">
            <span className="rounded-md border border-forge-border bg-forge-bg px-2 py-0.5 text-xs text-forge-muted">
              {step}
            </span>
            {i < flow.length - 1 && (
              <svg
                className="h-3 w-3 text-forge-border"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.5a.75.75 0 010-1.5h7.69L8.22 4.03a.75.75 0 010-1.06z" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  tag,
  description,
  icon,
  color,
  bg,
}: {
  title: string;
  tag: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="group forge-card p-6 transition-all hover:border-forge-accent/30 hover:bg-forge-surface/80">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} ${color}`}
      >
        {icon}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-base font-semibold text-forge-ink">{title}</h3>
        <span className="rounded-md bg-forge-bg px-2 py-0.5 font-mono text-xs text-forge-muted">
          {tag}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-forge-muted">
        {description}
      </p>
    </div>
  );
}

function PipelineStep({
  num,
  title,
  desc,
  icon,
  highlight,
}: {
  num: string;
  title: string;
  desc: string;
  icon: string;
  highlight?: boolean;
}) {
  const icons: Record<string, React.ReactNode> = {
    search: (
      <path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" />
    ),
    code: (
      <path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z" />
    ),
    shield: (
      <path d="M7.467 0a2.75 2.75 0 011.066 0l5.25 1.307A1.75 1.75 0 0116 3.013v4.69c0 2.96-1.612 5.69-4.165 7.048l-3.322 1.764a1.75 1.75 0 01-1.026 0l-3.322-1.764C2.612 13.393 1 10.663 1 7.703V3.013c0-.79.53-1.482 1.282-1.706L7.467 0z" />
    ),
    book: (
      <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9z" />
    ),
    package: (
      <path d="M8.878.392a1.75 1.75 0 00-1.756 0l-5.25 3.045A1.75 1.75 0 001 4.951v6.098c0 .624.332 1.2.872 1.514l5.25 3.045a1.75 1.75 0 001.756 0l5.25-3.045c.54-.313.872-.89.872-1.514V4.951c0-.624-.332-1.2-.872-1.514L8.878.392zM7.875 1.59a.25.25 0 01.25 0l4.63 2.685L8 7.133 3.245 4.275l4.63-2.685zM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.432L2.5 5.677zm6.25 8.271l4.625-2.683a.25.25 0 00.125-.216V5.677L8.75 8.432v5.516z" />
    ),
  };

  return (
    <div
      className={`relative rounded-lg border p-4 transition-all ${
        highlight
          ? 'border-forge-accent/40 bg-forge-accent/5'
          : 'border-forge-border bg-forge-bg'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-forge-muted">{num}</span>
        {highlight && (
          <span className="rounded bg-forge-accent/20 px-1.5 py-0.5 text-xs text-forge-accent">
            治理
          </span>
        )}
      </div>
      <svg
        className="mt-2 h-5 w-5 text-forge-ink"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        {icons[icon]}
      </svg>
      <h4 className="mt-2 text-sm font-semibold text-forge-ink">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-forge-muted">{desc}</p>
    </div>
  );
}

function DeliverableItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <svg
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-forge-green"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
      </svg>
      <div>
        <p className="text-sm font-medium text-forge-ink">{title}</p>
        <p className="mt-0.5 text-xs text-forge-muted">{desc}</p>
      </div>
    </div>
  );
}

function CapabilityRow({
  title,
  description,
  points,
  badge,
  badgeColor,
  reversed,
}: {
  title: string;
  description: string;
  points: string[];
  badge: string;
  badgeColor: string;
  reversed?: boolean;
}) {
  return (
    <div
      className={`forge-card grid grid-cols-1 gap-0 overflow-hidden md:grid-cols-2`}
    >
      <div className={`p-6 ${reversed ? 'md:order-2' : ''}`}>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-forge-ink">{title}</h3>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeColor}`}
          >
            {badge}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-forge-muted">
          {description}
        </p>
      </div>
      <div
        className={`border-t border-forge-border p-6 md:border-l md:border-t-0 ${
          reversed ? 'md:order-1 md:border-r md:border-l-0' : ''
        }`}
      >
        <ul className="space-y-2">
          {points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-sm text-forge-ink"
            >
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-forge-green"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
