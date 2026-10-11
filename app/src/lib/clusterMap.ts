// 把后端实时数据映射为配置页使用的 ClusterNode / FileSystemConfig 结构。
import { useClusterData } from './clusterStore';
import type { ApiNode } from './cluster';
import type { ClusterNode, FileSystemConfig, NodeParameter, FileSystemParameter } from '@/data/mockClusterConfig';

const ROLE_HOST = { mgs: '管理', mds: '元数据', oss: '对象存储', client: '客户端', mixed: '混合' } as const;

// 常见参数的中文说明（未知参数回退为通用说明）
const PARAM_DESC: Record<string, { desc: string; impact: NodeParameter['impact']; range?: string; category?: string }> = {
  'osc.*.max_rpcs_in_flight': { desc: 'OSC 最大并发 RPC 请求数', impact: 'high', range: '1-256', category: '性能参数' },
  'mdc.max_rpcs_in_flight': { desc: 'MDC 最大并发 RPC 请求数', impact: 'high', range: '1-256', category: '性能参数' },
  'llite.*.max_read_ahead_mb': { desc: '客户端预读大小（MB）', impact: 'medium', range: '16-4096', category: '性能参数' },
  'llite.*.max_cached_mb': { desc: '客户端最大缓存（MB）', impact: 'medium', range: '16-8192', category: '性能参数' },
  'ldlm.namespaces.*.lru_size': { desc: 'DLM 锁 LRU 大小', impact: 'medium', range: '100-100000', category: '性能参数' },
  'mdc.*.timeouts': { desc: 'MDC 超时（恢复/重连）时间', impact: 'high', category: '恢复参数' },
};

function mapNode(n: ApiNode): ClusterNode {
  return {
    id: n.id,
    name: n.name || n.id,
    role: (['mgs', 'mds', 'oss', 'client'].includes(n.role) ? n.role : 'client') as ClusterNode['role'],
    ip: n.ip || '-',
    status: (n.status === 'online' ? 'online' : 'offline') as ClusterNode['status'],
    uptime: '-',
    lustreVersion: n.lustreVersion || '-',
    kernelVersion: n.kernelVersion || '-',
    nid: n.nid || '-',
    lastHeartbeat: n.lastHeartbeat || '-',
    services: (n.services || []).map((s) => ({ name: s.name, status: (s.status === 'running' ? 'running' : 'stopped') as 'running' | 'stopped', pid: null, startTime: '-' })),
    parameters: [],
  };
}

export function useLiveClusterNodes(): ClusterNode[] {
  const { nodes } = useClusterData();
  return nodes.map(mapNode);
}

export function useLiveFileSystems(): FileSystemConfig[] {
  const { config, nodes } = useClusterData();
  if (!config) return [];
  const params: FileSystemParameter[] = (config.parameters || []).map((p, i) => {
    const meta = PARAM_DESC[p.name] || { desc: '运行时参数（实时读取）', impact: 'medium' as const, category: '性能参数' };
    return {
      id: `lp-${i}`,
      name: p.name,
      currentValue: p.currentValue,
      defaultValue: '-',
      type: 'string',
      description: meta.desc,
      impact: meta.impact,
      category: meta.category || '性能参数',
      modified: false,
    };
  });
  const stripeCount = config.stripe.find((s) => /stripe_count/i.test(s.key))?.value || '-';
  const stripeSize = config.stripe.find((s) => /stripe_size/i.test(s.key))?.value || '-';
  return [{
    id: 'fs-live',
    name: config.fsName || 'lustre',
    mountPoint: config.mount || '/lustre',
    nodeCount: nodes.length,
    isDefault: true,
    stripeCount: Number(stripeCount) || 1,
    stripeSize: Number(stripeSize) || 1048576,
    checksum: 'crc32c',
    parameters: params,
  }];
}

export { ROLE_HOST };
