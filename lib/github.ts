/**
 * GitHub API 封装层
 * 使用系统级 GITHUB_TOKEN 进行仓库管理、Actions 触发、Release 发布
 */

import { getSetting, requireSetting, SETTING_KEYS } from "./settings";

const GITHUB_API = "https://api.github.com";

/** 构建 GitHub API 请求头，token 为空时从数据库读取系统级 GITHUB_TOKEN */
async function ghHeaders(token?: string) {
  const resolvedToken = token || (await requireSetting(SETTING_KEYS.GITHUB_TOKEN));
  return {
    Authorization: `Bearer ${resolvedToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** 创建 GitHub 仓库 */
export async function createRepo(
  name: string,
  description: string,
  isPrivate: boolean = true
): Promise<{ owner: string; repo: string; html_url: string }> {
  const org = await getSetting(SETTING_KEYS.GITHUB_ORG);
  const endpoint = org
    ? `${GITHUB_API}/orgs/${org}/repos`
    : `${GITHUB_API}/user/repos`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { ...(await ghHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to create repo: ${err.message}`);
  }

  const data = await res.json();
  return {
    owner: data.owner.login,
    repo: data.name,
    html_url: data.html_url,
  };
}

/** 使用用户 OAuth token 创建 GitHub 仓库（仓库归属用户本人账号） */
export async function createRepoWithUserToken(
  userToken: string,
  name: string,
  description: string,
  isPrivate: boolean = true
): Promise<{ owner: string; repo: string; html_url: string }> {
  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to create repo with user token: ${err.message}`);
  }

  const data = await res.json();
  return {
    owner: data.owner.login,
    repo: data.name,
    html_url: data.html_url,
  };
}

/** 校验用户对指定仓库是否具备 push 权限 */
export async function verifyRepoAccess(
  userToken: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${userToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) return false;

  const data = await res.json();
  // permissions 可能为 null（例如公开仓库且无 token），需要安全访问
  return Boolean(data?.permissions?.push);
}

/** 触发 GitHub Actions workflow */
export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string,
  ref: string,
  inputs: Record<string, string>
): Promise<number> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: { ...(await ghHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to trigger workflow: ${err.message}`);
  }

  // 获取最新的 workflow run id
  const runsRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/runs?per_page=1`,
    { headers: await ghHeaders() }
  );
  const runsData = await runsRes.json();
  return runsData.workflow_runs[0]?.id || 0;
}

/** 查询 Actions 运行状态 */
export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number
): Promise<{
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}`,
    { headers: await ghHeaders() }
  );
  if (!res.ok) throw new Error("Failed to get workflow run");
  return res.json();
}

/** 获取 Actions 运行日志 */
export async function getWorkflowLogs(
  owner: string,
  repo: string,
  runId: number
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
    { headers: await ghHeaders() }
  );
  if (!res.ok) return "Logs not available";
  // 日志是 zip 格式，返回 URL 供下载
  return `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
}

/** 创建 GitHub Release */
export async function createRelease(
  owner: string,
  repo: string,
  tag: string,
  name: string,
  body: string
): Promise<{ id: number; upload_url: string; html_url: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: { ...(await ghHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name,
      body,
      draft: false,
      prerelease: false,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to create release: ${err.message}`);
  }

  return res.json();
}

/** 上传 Release 资产 */
export async function uploadReleaseAsset(
  uploadUrl: string,
  filename: string,
  content: string,
  contentType: string = "application/octet-stream"
): Promise<{ browser_download_url: string }> {
  const url = uploadUrl.replace("{?name,label}", `?name=${filename}`);
  const bodyData = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(await ghHeaders()),
      "Content-Type": contentType,
      "Content-Length": bodyData.length.toString(),
    },
    body: bodyData,
  });

  if (!res.ok) throw new Error("Failed to upload asset");
  return res.json();
}

/** 推送文件到仓库 (使用 Git Database API) */
export async function pushFileToRepo(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = "main"
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: { ...(await ghHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to push file: ${err.message}`);
  }
}

/** 获取仓库文件树 */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<{ path: string; type: string }[]> {
  // 先获取分支 ref
  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: await ghHeaders() }
  );

  if (!refRes.ok) return [];
  const data = await refRes.json();
  return (data.tree || []).map((item: { path: string; type: string }) => ({
    path: item.path,
    type: item.type,
  }));
}

/** 生成 slug 用于仓库名 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 40);
}

/**
 * 使用用户 token 批量推送多个文件到仓库（Git Database API）
 * 在单个 commit 中完成所有文件的推送
 */
export async function pushMultipleFiles(
  token: string,
  owner: string,
  repo: string,
  files: { path: string; content: string }[],
  commitMessage: string,
  branch: string = "main"
): Promise<{ commitSha: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // 1. 获取分支当前 commit 的 SHA（如果分支不存在，从默认分支创建）
  let baseTreeSha: string | null = null;
  let parentCommitSha: string | null = null;

  try {
    const refRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      { headers }
    );
    if (refRes.ok) {
      const refData = await refRes.json();
      parentCommitSha = refData.object.sha;
      // 获取 commit 的 tree SHA
      const commitRes = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${parentCommitSha}`,
        { headers }
      );
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree.sha;
      }
    }
  } catch {
    // 分支可能不存在，稍后创建
  }

  // 2. 为每个文件创建 blob
  const treeItems: {
    path: string;
    mode: "100644";
    type: "blob";
    sha: string;
  }[] = [];

  for (const file of files) {
    const blobRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: file.content,
          encoding: "utf-8",
        }),
      }
    );
    if (!blobRes.ok) {
      const err = await blobRes.json();
      throw new Error(`Failed to create blob for ${file.path}: ${err.message}`);
    }
    const blobData = await blobRes.json();
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobData.sha,
    });
  }

  // 3. 创建 tree
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    }
  );
  if (!treeRes.ok) {
    const err = await treeRes.json();
    throw new Error(`Failed to create tree: ${err.message}`);
  }
  const treeData = await treeRes.json();

  // 4. 创建 commit
  const commitRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: parentCommitSha ? [parentCommitSha] : [],
      }),
    }
  );
  if (!commitRes.ok) {
    const err = await commitRes.json();
    throw new Error(`Failed to create commit: ${err.message}`);
  }
  const commitData = await commitRes.json();

  // 5. 更新分支引用（或创建新分支）
  if (parentCommitSha) {
    // 分支已存在，更新引用
    const refRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          sha: commitData.sha,
        }),
      }
    );
    if (!refRes.ok) {
      const err = await refRes.json();
      throw new Error(`Failed to update ref: ${err.message}`);
    }
  } else {
    // 分支不存在，创建引用
    const refRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: commitData.sha,
        }),
      }
    );
    if (!refRes.ok) {
      const err = await refRes.json();
      throw new Error(`Failed to create ref: ${err.message}`);
    }
  }

  return { commitSha: commitData.sha };
}
