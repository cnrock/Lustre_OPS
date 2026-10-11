// 集群节点 / 告警规则 / 通知渠道 API 客户端。
import { authFetch } from './auth';

export type ApiNode = {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  role: 'mgs' | 'mds' | 'oss' | 'client' | 'mixed' | string;
  nid: string;
  lustreVersion: string;
  kernelVersion: string;
  services: Array<{ name: string; status: string }>;
  targetMounts: string[];
  lastHeartbeat: string;
  status: string;
};

export async function fetchNodes(): Promise<ApiNode[]> {
  const res = await authFetch('/api/nodes');
  if (!res.ok) return [];
  const data = await res.json();
  return data.nodes || [];
}

export type ApiAlertRule = {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: number | boolean;
  duration?: string;
  channels?: string;
};

export async function fetchAlertRules(): Promise<ApiAlertRule[]> {
  const res = await authFetch('/api/alert-rules');
  if (!res.ok) return [];
  const data = await res.json();
  return data.rules || [];
}

export async function saveAlertRule(rule: Partial<ApiAlertRule>): Promise<boolean> {
  const res = await authFetch('/api/alert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return res.ok;
}

export async function deleteAlertRule(id: string): Promise<boolean> {
  const res = await authFetch(`/api/alert-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.ok;
}

export type ApiAlert = {
  id: number;
  timestamp: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  source: string;
  resolved?: number;
  resolved_at?: string;
};

export async function fetchAlertsActive(): Promise<ApiAlert[]> {
  const res = await authFetch('/api/alerts/active');
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

export async function fetchAlertsHistory(): Promise<ApiAlert[]> {
  const res = await authFetch('/api/alerts/history');
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

export type NotificationChannel = {
  enabled?: boolean;
  webhookConfigured?: boolean;
  webhookMasked?: string;
  [k: string]: unknown;
};

export async function fetchChannels(): Promise<Record<string, NotificationChannel>> {
  const res = await authFetch('/api/notification-channels');
  if (!res.ok) return {};
  const data = await res.json();
  return data.channels || {};
}

export async function setChannel(type: string, payload: Record<string, unknown>): Promise<boolean> {
  const res = await authFetch(`/api/notification-channels/${encodeURIComponent(type)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function testNotify(channel = 'feishu'): Promise<{ ok: boolean; message?: string }> {
  const res = await authFetch('/api/notify/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: !!data.ok, message: data.message };
}

export type ClusterConfigLive = {
  mount: string;
  fsName: string;
  lustreVersion: string;
  stripe: Array<{ key: string; value: string }>;
  parameters: Array<{ name: string; currentValue: string; source: string }>;
};

export async function fetchClusterConfig(): Promise<ClusterConfigLive | null> {
  const res = await authFetch('/api/cluster/config');
  if (!res.ok) return null;
  return res.json();
}

export type InventoryServer = {
  name: string; role: string; mgmtIp?: string; lnet?: string[];
  reporting: boolean; status: string; lastHeartbeat?: string | null;
};
export type Inventory = {
  cluster: string;
  networks: Record<string, { cidr: string; gateway?: string; purpose?: string }>;
  servers: InventoryServer[];
  storageArrays: Array<{ name: string; mgmtIp: string; bmcIp?: string; type?: string }>;
  summary: {
    expectedServers: number; reportingServers: number;
    missingServers: string[]; totalReportedNodes: number;
  };
};

export async function fetchInventory(): Promise<Inventory | null> {
  const res = await authFetch('/api/inventory');
  if (!res.ok) return null;
  return res.json();
}
