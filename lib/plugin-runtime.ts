/**
 * 插件运行时系统
 * 支持自定义插件的注册、加载和执行
 * 提供钩子机制，允许在代码生成、审查、部署等阶段插入自定义逻辑
 */

// ============ 类型定义 ============

export type HookName =
  | "before-generate"
  | "after-generate"
  | "before-review"
  | "after-review"
  | "before-deploy";

export type PluginType =
  | "checker"
  | "generator"
  | "transformer"
  | "validator"
  | "analyzer"
  | "custom";

export interface HookContext {
  hookName: HookName;
  projectId?: string;
  files?: { path: string; content: string }[];
  data?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
  [key: string]: unknown;
}

export interface HookResult {
  modified: boolean;
  files?: { path: string; content: string }[];
  data?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

export interface PluginExecuteInput {
  files?: { path: string; content: string }[];
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PluginExecuteResult {
  success: boolean;
  output?: string;
  files?: { path: string; content: string }[];
  issues?: PluginIssue[];
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PluginIssue {
  file: string;
  line: number | null;
  column: number | null;
  severity: "error" | "warning" | "info";
  rule?: string;
  message: string;
}

export interface Plugin {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  hooks: HookName[];
  execute: (input: PluginExecuteInput) => Promise<PluginExecuteResult>;
  onHook?: (hookName: HookName, context: HookContext) => Promise<HookResult | void>;
}

// ============ 插件注册表 ============

/**
 * 插件注册表
 * 管理所有已注册的插件，支持钩子执行
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();

  /**
   * 注册插件
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginRegistry] 插件 "${plugin.name}" 已存在，将被覆盖`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * 注销插件
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  /**
   * 获取插件
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 列出所有插件
   */
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 执行钩子
   * 遍历所有注册了该钩子的插件，依次执行
   */
  async executeHook(
    hookName: HookName,
    context: HookContext
  ): Promise<HookContext> {
    let currentContext = { ...context };

    for (const plugin of Array.from(this.plugins.values())) {
      if (plugin.hooks.includes(hookName) && plugin.onHook) {
        try {
          const result = await plugin.onHook(hookName, currentContext);
          if (result) {
            // 合并钩子结果到上下文
            if (result.files) {
              currentContext.files = result.files;
            }
            if (result.data) {
              currentContext.data = {
                ...(currentContext.data || {}),
                ...result.data,
              };
            }
            if (result.warnings) {
              currentContext.warnings = [
                ...(currentContext.warnings || []),
                ...result.warnings,
              ];
            }
            if (result.errors) {
              currentContext.errors = [
                ...(currentContext.errors || []),
                ...result.errors,
              ];
            }
          }
        } catch (error) {
          console.error(
            `[PluginRegistry] 插件 "${plugin.name}" 执行钩子 "${hookName}" 失败:`,
            error
          );
          currentContext.errors = [
            ...(currentContext.errors || []),
            `插件 "${plugin.name}" 执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
          ];
        }
      }
    }

    return currentContext;
  }

  /**
   * 清空所有插件
   */
  clear(): void {
    this.plugins.clear();
  }
}

// 全局插件注册表实例
export const pluginRegistry = new PluginRegistry();

// ============ 内置插件 ============

/**
 * TypeScript 类型检查器
 * 通过静态分析检查常见的 TypeScript 类型错误
 */
export const TypeScriptChecker: Plugin = {
  name: "typescript-checker",
  version: "1.0.0",
  type: "checker",
  description: "检查 TypeScript 类型错误，包括隐式 any、类型不匹配等",
  hooks: ["before-generate", "after-generate", "before-review"],
  async execute(input: PluginExecuteInput): Promise<PluginExecuteResult> {
    const files = input.files || [];
    const issues: PluginIssue[] = [];

    for (const file of files) {
      // 只检查 .ts/.tsx 文件
      if (!file.path.match(/\.(ts|tsx)$/)) continue;

      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 检查隐式 any (函数参数缺少类型)
        const funcParamMatch = line.match(
          /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\))\s*\(([^)]*)\)/
        );
        if (funcParamMatch) {
          const params = funcParamMatch[1];
          if (params.trim()) {
            const paramList = params.split(",");
            for (const param of paramList) {
              const trimmed = param.trim();
              // 参数没有类型注解（没有冒号）且不是解构/剩余参数
              if (
                trimmed &&
                !trimmed.includes(":") &&
                !trimmed.startsWith("{") &&
                !trimmed.startsWith("...")
              ) {
                issues.push({
                  file: file.path,
                  line: lineNum,
                  column: null,
                  severity: "warning",
                  rule: "no-implicit-any",
                  message: `参数 "${trimmed}" 缺少类型注解，可能为隐式 any 类型`,
                });
              }
            }
          }
        }

        // 检查 any 类型的显式使用
        const anyMatch = line.match(/:\s*any\b/);
        if (anyMatch) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: anyMatch.index ? anyMatch.index + 1 : null,
            severity: "warning",
            rule: "no-explicit-any",
            message: "显式使用 any 类型，建议使用更具体的类型",
          });
        }

        // 检查可能的 null/undefined 访问
        if (line.includes("?.") === false && line.match(/\w+\.\w+/)) {
          // 检查链式访问但缺少可选链
          const chainMatch = line.match(/(\w+)\.(\w+)\.(\w+)/);
          if (chainMatch && !line.includes("if") && !line.includes("?.")) {
            issues.push({
              file: file.path,
              line: lineNum,
              column: null,
              severity: "info",
              rule: "prefer-optional-chaining",
              message: "考虑使用可选链操作符 (?.) 防止 null/undefined 访问错误",
            });
          }
        }

        // 检查非空断言 (!) 的使用
        const nonNullMatch = line.match(/(\w+)!/);
        if (nonNullMatch && !line.includes("//") && !line.match(/!=|!==/)) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: nonNullMatch.index ? nonNullMatch.index + 1 : null,
            severity: "info",
            rule: "no-non-null-assertion",
            message: "使用非空断言 (!)，建议添加 null 检查",
          });
        }
      }

      // 检查缺少返回类型注解的导出函数
      const exportFuncPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
      let exportMatch;
      while ((exportMatch = exportFuncPattern.exec(file.content)) !== null) {
        const funcName = exportMatch[1];
        // 查找函数声明的完整行
        const funcLineIndex = file.content
          .substring(0, exportMatch.index)
          .split("\n").length;
        const funcLine = lines[funcLineIndex - 1] || "";
        if (!funcLine.includes("): ")) {
          issues.push({
            file: file.path,
            line: funcLineIndex,
            column: null,
            severity: "info",
            rule: "explicit-function-return-type",
            message: `导出函数 "${funcName}" 缺少返回类型注解`,
          });
        }
      }
    }

    return {
      success: true,
      issues,
      metadata: {
        filesChecked: files.filter((f) => f.path.match(/\.(ts|tsx)$/)).length,
        issueCount: issues.length,
      },
    };
  },
};

/**
 * ESLint 检查器
 * 通过静态分析检查常见的代码规范问题
 */
export const ESLintRunner: Plugin = {
  name: "eslint-runner",
  version: "1.0.0",
  type: "checker",
  description: "运行 ESLint 规则检查，识别代码规范问题",
  hooks: ["before-review", "after-generate"],
  async execute(input: PluginExecuteInput): Promise<PluginExecuteResult> {
    const files = input.files || [];
    const issues: PluginIssue[] = [];

    for (const file of files) {
      if (!file.path.match(/\.(ts|tsx|js|jsx)$/)) continue;

      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 检查 console.log
        if (line.includes("console.log(")) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: line.indexOf("console.log") + 1,
            severity: "warning",
            rule: "no-console",
            message: "生产代码中不应使用 console.log",
          });
        }

        // 检查未使用的变量 (简化检查)
        const varDeclMatch = line.match(
          /(?:const|let|var)\s+(\w+)\s*=/
        );
        if (varDeclMatch) {
          const varName = varDeclMatch[1];
          // 检查变量是否在后续代码中使用
          const remainingContent = file.content.substring(
            file.content.indexOf(line) + line.length
          );
          if (!remainingContent.includes(varName)) {
            issues.push({
              file: file.path,
              line: lineNum,
              column: line.indexOf(varName) + 1,
              severity: "warning",
              rule: "no-unused-vars",
              message: `变量 "${varName}" 已声明但未使用`,
            });
          }
        }

        // 检查 var 声明
        if (line.match(/\bvar\s+/)) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: line.indexOf("var") + 1,
            severity: "warning",
            rule: "no-var",
            message: "使用 let 或 const 代替 var",
          });
        }

        // 检查 == 而非 ===
        const looseEqMatch = line.match(/[^=!<>]==[^=]/);
        if (looseEqMatch) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: looseEqMatch.index ? looseEqMatch.index + 2 : null,
            severity: "warning",
            rule: "eqeqeq",
            message: "使用严格相等 === 代替 ==",
          });
        }

        // 检查行尾分号 (可选规则)
        if (
          line.trim() &&
          !line.trim().startsWith("//") &&
          !line.trim().startsWith("/*") &&
          !line.trim().startsWith("*") &&
          !line.trim().endsWith(";") &&
          !line.trim().endsWith("{") &&
          !line.trim().endsWith("}") &&
          !line.trim().endsWith(",") &&
          !line.trim().endsWith("\\") &&
          !line.trim().endsWith("(") &&
          !line.trim().endsWith("[") &&
          !line.trim().includes("=>") &&
          line.match(/(?:const|let|var|return|throw|import|export)\b/)
        ) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: line.length,
            severity: "info",
            rule: "semi",
            message: "行尾缺少分号",
          });
        }
      }

      // 检查文件末尾换行
      if (file.content.length > 0 && !file.content.endsWith("\n")) {
        issues.push({
          file: file.path,
          line: lines.length,
          column: null,
          severity: "info",
          rule: "eol-last",
          message: "文件末尾应有换行符",
        });
      }
    }

    return {
      success: true,
      issues,
      metadata: {
        filesChecked: files.filter((f) =>
          f.path.match(/\.(ts|tsx|js|jsx)$/)
        ).length,
        issueCount: issues.length,
      },
    };
  },
};

/**
 * 依赖完整性验证器
 * 检查文件中的 import/require 语句是否在 package.json 中声明
 */
export const DependencyValidator: Plugin = {
  name: "dependency-validator",
  version: "1.0.0",
  type: "validator",
  description: "验证项目依赖完整性，检查未声明的依赖和缺失的模块",
  hooks: ["before-generate", "before-deploy"],
  async execute(input: PluginExecuteInput): Promise<PluginExecuteResult> {
    const files = input.files || [];
    const issues: PluginIssue[] = [];

    // 查找 package.json
    const packageJsonFile = files.find((f) => f.path.endsWith("package.json"));
    const declaredDeps = new Set<string>();

    if (packageJsonFile) {
      try {
        const pkg = JSON.parse(packageJsonFile.content);
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        Object.keys(deps).forEach((dep) => declaredDeps.add(dep));
      } catch {
        issues.push({
          file: "package.json",
          line: null,
          column: null,
          severity: "error",
          rule: "invalid-package-json",
          message: "package.json 格式无效",
        });
      }
    } else {
      issues.push({
        file: "package.json",
        line: null,
        column: null,
        severity: "warning",
        rule: "missing-package-json",
        message: "未找到 package.json 文件",
      });
    }

    // 内置模块列表
    const builtins = new Set([
      "fs", "path", "os", "http", "https", "url", "crypto", "stream",
      "buffer", "util", "events", "child_process", "net", "dns", "tls",
      "zlib", "querystring", "assert", "process", "console", "module",
    ]);

    // 检查所有文件的 import/require
    const importRegex =
      /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"`]([^'"`]+)['"`]/g;
    const allFilePaths = new Set(files.map((f) => f.path));

    for (const file of files) {
      let match;
      while ((match = importRegex.exec(file.content)) !== null) {
        const importPath = match[1];
        const lineNum =
          file.content.substring(0, match.index).split("\n").length;

        // 跳过内置模块
        if (builtins.has(importPath) || importPath.startsWith("node:")) {
          continue;
        }

        // 跳过相对路径导入
        if (importPath.startsWith(".") || importPath.startsWith("/")) {
          const dir = file.path.substring(0, file.path.lastIndexOf("/"));
          const fullPath = `${dir}/${importPath}`.replace(/\/+/g, "/");
          const candidates = [
            fullPath,
            `${fullPath}.ts`,
            `${fullPath}.tsx`,
            `${fullPath}.js`,
            `${fullPath}.jsx`,
            `${fullPath}/index.ts`,
            `${fullPath}/index.tsx`,
            `${fullPath}/index.js`,
          ];
          if (!candidates.some((c) => allFilePaths.has(c))) {
            issues.push({
              file: file.path,
              line: lineNum,
              column: null,
              severity: "error",
              rule: "missing-module",
              message: `导入的模块不存在: "${importPath}"`,
            });
          }
          continue;
        }

        // 检查第三方依赖
        const depName = importPath.startsWith("@")
          ? importPath.split("/").slice(0, 2).join("/")
          : importPath.split("/")[0];

        if (packageJsonFile && !declaredDeps.has(depName)) {
          issues.push({
            file: file.path,
            line: lineNum,
            column: null,
            severity: "warning",
            rule: "undeclared-dependency",
            message: `依赖 "${depName}" 未在 package.json 中声明`,
          });
        }
      }
    }

    return {
      success: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      metadata: {
        filesChecked: files.length,
        declaredDependencies: declaredDeps.size,
        issueCount: issues.length,
      },
    };
  },
};

// ============ 内置插件加载 ============

let builtInPluginsLoaded = false;

/**
 * 加载内置插件
 */
export function loadBuiltInPlugins(): PluginRegistry {
  if (!builtInPluginsLoaded) {
    pluginRegistry.register(TypeScriptChecker);
    pluginRegistry.register(ESLintRunner);
    pluginRegistry.register(DependencyValidator);
    builtInPluginsLoaded = true;
  }
  return pluginRegistry;
}

/**
 * 执行插件
 */
export async function executePlugin(
  pluginName: string,
  input: PluginExecuteInput
): Promise<PluginExecuteResult> {
  const plugin = pluginRegistry.get(pluginName);
  if (!plugin) {
    return {
      success: false,
      error: `插件 "${pluginName}" 未注册`,
    };
  }

  try {
    return await plugin.execute(input);
  } catch (error) {
    console.error(`[executePlugin] 插件 "${pluginName}" 执行失败:`, error);
    return {
      success: false,
      error: `插件执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}
