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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* 柔和光晕背景（Apple 式渐变） */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="absolute bottom-[-160px] right-[-80px] h-[360px] w-[360px] rounded-full bg-emerald-500/[0.06] blur-3xl" />
      </div>

      <div className="ops-fade-up relative w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <HardDrive className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-foreground">Lustre 监控运维</h1>
          <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">HPC Storage Console</p>
        </div>

        <div className="ops-card p-7">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[hsl(var(--muted-foreground))]">用户名 / 邮箱</span>
              <div className="flex items-center gap-2 rounded-xl border bg-[hsl(var(--muted))] px-3.5 py-2.5 transition-colors focus-within:border-primary/50 focus-within:bg-background">
                <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                  className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-[hsl(var(--muted-foreground))]"
                  placeholder="admin"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-[hsl(var(--muted-foreground))]">密码</span>
              <div className="flex items-center gap-2 rounded-xl border bg-[hsl(var(--muted))] px-3.5 py-2.5 transition-colors focus-within:border-primary/50 focus-within:bg-background">
                <Lock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-[hsl(var(--muted-foreground))]"
                  placeholder="••••••••"
                />
              </div>
            </label>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="ops-btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-medium disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? '登录中…' : '登录'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
          Lustre OPS · 需授权访问
        </p>
      </div>
    </div>
  );
}
