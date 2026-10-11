// 集群实时数据 hook：从后端拉取真实节点与文件系统配置，供配置页各子组件复用。
// 采用模块级缓存 + 简单订阅，避免每个子组件重复请求。
import { useEffect, useState } from 'react';
import { fetchNodes, fetchClusterConfig, type ApiNode, type ClusterConfigLive } from './cluster';

type Cache = {
  nodes: ApiNode[];
  config: ClusterConfigLive | null;
  loaded: boolean;
  loading: boolean;
};

const cache: Cache = { nodes: [], config: null, loaded: false, loading: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

async function load(force = false) {
  if (cache.loading) return;
  if (cache.loaded && !force) return;
  cache.loading = true;
  emit();
  try {
    const [nodes, config] = await Promise.all([fetchNodes(), fetchClusterConfig()]);
    cache.nodes = nodes;
    cache.config = config;
    cache.loaded = true;
  } finally {
    cache.loading = false;
    emit();
  }
}

export function refreshClusterData() {
  void load(true);
}

export function useClusterData() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    void load();
    return () => { listeners.delete(fn); };
  }, []);
  return {
    nodes: cache.nodes,
    config: cache.config,
    loaded: cache.loaded,
    loading: cache.loading,
    isEmpty: cache.loaded && cache.nodes.length === 0,
    refresh: () => load(true),
  };
}
