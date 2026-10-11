// 集群清单（inventory）实时数据 hook：应有节点 vs 实报节点对账。
import { useEffect, useState, useCallback } from 'react';
import { fetchInventory, type Inventory } from './cluster';

export function useInventory() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInv(await fetchInventory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { inv, loading, refresh: load };
}
