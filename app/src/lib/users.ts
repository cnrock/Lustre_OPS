// 用户管理 API 客户端（对接后端 /api/users）。
import { authFetch } from './auth';

export type ApiUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer' | 'readonly';
  status: 'active' | 'inactive';
  createdAt?: string;
  lastLogin?: string;
};

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function listUsers(): Promise<ApiUser[]> {
  const res = await authFetch('/api/users');
  const data = await parse<{ users: ApiUser[] }>(res);
  return data.users || [];
}

export async function createUser(input: {
  username: string;
  email: string;
  password: string;
  role: ApiUser['role'];
  status: ApiUser['status'];
}): Promise<ApiUser> {
  const res = await authFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parse<{ user: ApiUser }>(res);
  return data.user;
}

export async function updateUser(
  id: number,
  patch: Partial<{ email: string; role: ApiUser['role']; status: ApiUser['status']; password: string }>,
): Promise<ApiUser> {
  const res = await authFetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parse<{ user: ApiUser }>(res);
  return data.user;
}

export async function deleteUser(id: number): Promise<void> {
  const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
  await parse<{ ok: boolean }>(res);
}
