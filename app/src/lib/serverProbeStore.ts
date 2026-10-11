// 服务端深度探针数据 hook。
import { useEffect, useState, useCallback } from 'react';
import { fetchServerProbes, type ServerProbe } from './cluster';

export function useServerProbes() {
  const [probes, setProbes] = useState<ServerProbe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProbes(await fetchServerProbes());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  return { probes, loading, refresh: load };
}
