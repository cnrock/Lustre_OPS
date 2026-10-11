// Lustre OPS 前端鉴权工具：token 存储 + 带鉴权的请求封装。
// 所有对 /api 的请求都应通过 authFetch，自动附带 Authorization。

const TOKEN_KEY = 'lustre_token';

export type CurrentUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer' | 'readonly';
  status: string;
  createdAt?: string;
  lastLogin?: string;
};

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 未授权时触发的事件，供 App 跳出到登录页 */
export const AUTH_EXPIRED_EVENT = 'lustre-auth-expired';

function notifyExpired() {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  } catch {
    /* ignore */
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { ...(extra || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** 带鉴权的 fetch。401 时清除 token 并广播过期事件。 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = authHeaders((init.headers as Record<string, string>) || {});
  const res = await fetch(input, { ...init, headers, credentials: 'include' });
  if (res.status === 401) {
    setToken(null);
    notifyExpired();
  }
  return res;
}

export async function login(identifier: string, password: string): Promise<CurrentUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username: identifier, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `登录失败 (${res.status})`);
  }
  setToken(data.token);
  return data.user as CurrentUser;
}

export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  setToken(null);
}

export async function fetchMe(): Promise<CurrentUser | null> {
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}
