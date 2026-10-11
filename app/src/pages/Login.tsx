import { useState, type FormEvent } from 'react';
import { HardDrive, Loader2, Lock, User } from 'lucide-react';
import { login } from '@/lib/auth';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07172b] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#10233f] bg-[#0b1c33] p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <HardDrive className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Lustre 监控运维</h1>
            <p className="text-[11px] text-slate-400">HPC Storage Console</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">用户名 / 邮箱</span>
            <div className="flex items-center gap-2 rounded-md border border-[#1c3352] bg-[#0e2440] px-3 py-2 focus-within:border-blue-500">
              <User className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                className="w-full bg-transparent text-sm text-white outline-none placeholder-slate-500"
                placeholder="admin"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">密码</span>
            <div className="flex items-center gap-2 rounded-md border border-[#1c3352] bg-[#0e2440] px-3 py-2 focus-within:border-blue-500">
              <Lock className="h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-transparent text-sm text-white outline-none placeholder-slate-500"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          Lustre OPS v1.0 · 需授权访问
        </p>
      </div>
    </div>
  );
}
