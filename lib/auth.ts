import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import { getSetting, requireSetting, getAppUrl, SETTING_KEYS } from "./settings";

export interface SessionData {
  userId?: string;
  githubId?: number;
  username?: string;
  accessToken?: string;
  isLoggedIn?: boolean;
}

/** cookie 配置（不含 password，password 在 getSession 中动态读取） */
function buildSessionOptions(password: string): SessionOptions {
  return {
    password,
    cookieName: "agent-forge-session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    },
  };
}

export async function getSession() {
  const cookieStore = cookies();
  // iron-session 的 password 是同步的，这里从数据库动态读取后构建配置
  const password = await requireSetting(SETTING_KEYS.SESSION_SECRET);
  const sessionOptions = buildSessionOptions(password);
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth(): Promise<SessionData> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getGithubAuthUrl() {
  const clientId = await getSetting(SETTING_KEYS.GITHUB_CLIENT_ID);
  const appUrl = await getAppUrl();
  const redirectUri = `${appUrl}/api/auth?action=callback`;
  const params = new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    scope: "repo workflow read:user user:email",
    state: Math.random().toString(36).substring(7),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
}> {
  const clientId = await getSetting(SETTING_KEYS.GITHUB_CLIENT_ID);
  const clientSecret = await getSetting(SETTING_KEYS.GITHUB_CLIENT_SECRET);
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId || "",
      client_secret: clientSecret || "",
      code,
    }),
  });
  return res.json();
}

export async function getGithubUser(accessToken: string): Promise<{
  id: number;
  login: string;
  email: string | null;
  avatar_url: string | null;
}> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  return res.json();
}
