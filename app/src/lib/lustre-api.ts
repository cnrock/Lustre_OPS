import { authFetch } from './auth';
import { LUSTRE_MOUNT } from './mount';

const API_BASE = '/api';

function buildUrl(endpoint: string) {
  const normalized = endpoint.startsWith('/api/')
    ? endpoint.slice(4)
    : endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
  return `${API_BASE}${normalized}`;
}

async function fetchApi<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await authFetch(buildUrl(endpoint), {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.warn(`API ${endpoint} failed`, error);
    return null;
  }
}

export { fetchApi, buildUrl };

export async function fetchHealth() {
  const status = await fetchApi<any>('/api/lustre/status');
  if (!status) return null;
  return {
    score: status.healthy ? 100 : 45,
    status: status.healthy ? 'healthy' : 'unhealthy',
    statusStr: status.healthy ? 'healthy' : 'failed',
    mounted: status.mounted,
    clientMount: status.client_mount,
    serversOutput: status.servers_output,
  };
}

export async function fetchSummary() {
  const latest = await fetchApi<any>('/api/metrics/osts/latest');
  const status = await fetchApi<any>('/api/lustre/status');
  if (!latest?.osts) return null;

  const osts = latest.osts.filter((item: any) => item.type === 'OST');
  const summary = latest.osts.find((item: any) => item.type === 'SUMMARY');
  const mdt = latest.osts.find((item: any) => item.type === 'MDT');
  const totalCapGB = summary
    ? summary.total_bytes / 1024 ** 3
    : osts.reduce((sum: number, item: any) => sum + (item.total_bytes || 0), 0) / 1024 ** 3;
  const totalUsedGB = summary
    ? summary.used_bytes / 1024 ** 3
    : osts.reduce((sum: number, item: any) => sum + (item.used_bytes || 0), 0) / 1024 ** 3;

  return {
    version: status?.server_version || status?.client_version || '',
    clientVersion: status?.client_version || status?.lustre_version || '',
    serverVersion: status?.server_version || '',
    versionSource: status?.server_version_source || '',
    filesystem: summary?.fs_name || 'lustre',
    mdtCount: mdt ? 1 : 0,
    ostCount: osts.length,
    clientCount: 1,
    mountPoint: status?.client_mount || LUSTRE_MOUNT,
    totalCapacity: totalCapGB,
    totalUsed: totalUsedGB,
    totalAvailable: totalCapGB - totalUsedGB,
    usedPercent: totalCapGB > 0 ? Math.round((totalUsedGB / totalCapGB) * 100) : 0,
    rawOsts: latest.osts,
  };
}

export async function fetchStorage() {
  const latest = await fetchApi<any>('/api/metrics/osts/latest');
  if (!latest?.osts) return null;

  const ostList = latest.osts.filter((item: any) => item.type === 'OST');
  const mdtList = latest.osts.filter((item: any) => item.type === 'MDT');
  const summary = latest.osts.find((item: any) => item.type === 'SUMMARY');
  const mgt = latest.osts.find((item: any) => item.type === 'MGT');
  const toGB = (value: number) => (value || 0) / 1024 / 1024 / 1024;

  const ostTotal = ostList.reduce((sum: number, item: any) => sum + toGB(item.total_bytes), 0);
  const ostUsed = ostList.reduce((sum: number, item: any) => sum + toGB(item.used_bytes), 0);
  const ostAvailable = ostList.reduce((sum: number, item: any) => sum + toGB(item.available_bytes), 0);

  return {
    osts: latest.osts,
    summary: {
      totalCapacity: summary ? toGB(summary.total_bytes) : ostTotal,
      totalUsed: summary ? toGB(summary.used_bytes) : ostUsed,
      totalAvailable: summary ? toGB(summary.available_bytes) : ostAvailable,
      mgt: mgt ? { total: toGB(mgt.total_bytes), used: toGB(mgt.used_bytes), percent: mgt.usage_percent || 0 } : null,
      mdt: mdtList.length
        ? {
            total: mdtList.reduce((sum: number, item: any) => sum + toGB(item.total_bytes), 0),
            used: mdtList.reduce((sum: number, item: any) => sum + toGB(item.used_bytes), 0),
            percent: mdtList.reduce((sum: number, item: any) => sum + (item.used_bytes || 0), 0) > 0
              ? Math.round(
                  mdtList.reduce((sum: number, item: any) => sum + (item.used_bytes || 0), 0) /
                  Math.max(mdtList.reduce((sum: number, item: any) => sum + (item.total_bytes || 0), 0), 1) *
                  1000
                ) / 10
              : 0,
          }
        : null,
      ost: {
        total: ostTotal,
        used: ostUsed,
        available: ostAvailable,
        count: ostList.length,
        percent: ostTotal > 0 ? Math.round((ostUsed / ostTotal) * 1000) / 10 : 0,
        over80: ostList.filter((item: any) => (item.usage_percent || 0) >= 80).length,
      },
    },
  };
}

export async function fetchOsts() {
  const data = await fetchApi<any>('/api/metrics/osts/latest');
  if (!data?.osts) return [];
  return data.osts
    .filter((item: any) => item.type === 'OST')
    .map((item: any) => ({
      id: item.name,
      name: item.name,
      uuid: item.uuid,
      total: item.total_bytes,
      used: item.used_bytes,
      available: item.available_bytes,
      usedPercent: item.usage_percent || 0,
      status: (item.usage_percent || 0) >= 90 ? 'critical' : (item.usage_percent || 0) >= 80 ? 'warning' : 'healthy',
    }));
}

export async function fetchPerformanceLive(hours = 1) {
  return fetchApi<any>(`/api/metrics/performance/history?hours=${hours}`);
}

export async function fetchPerformanceTrend(hours = 2) {
  return fetchApi<any>(`/api/metrics/performance/trend?hours=${hours}`);
}

export async function fetchDashboardPerformance() {
  return fetchApi<any>('/api/metrics/dashboard/performance');
}

export async function fetchAlertsLive(limit = 20) {
  return fetchApi<any>(`/api/alerts/active?limit=${limit}`);
}

export async function fetchAlertsHistory(limit = 100) {
  return fetchApi<any>(`/api/alerts/history?limit=${limit}`);
}

export async function fetchAlertDetail(id: string | number) {
  return fetchApi<{
    success?: boolean;
    message?: string;
    alert?: {
      id: string | number;
      timestamp?: string;
      level?: string;
      title?: string;
      message?: string;
      source?: string;
      resolved?: boolean | number;
      resolved_at?: string | null;
    };
  }>(`/api/alerts/${encodeURIComponent(String(id))}`);
}

export type AlertAction = {
  id: string;
  title: string;
  description: string;
  targetNode: string;
  mode: 'diagnostic' | 'repair' | string;
  risk: 'low' | 'medium' | 'high' | string;
  buttonLabel: string;
  commandPreview: string;
  nextStep: string;
};

export type AlertActionRunResult = {
  success?: boolean;
  ok?: boolean;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  nextStep?: string;
  action?: AlertAction;
  results?: Array<{
    label: string;
    command: string;
    exitCode: number;
    ok: boolean;
    output: string;
  }>;
};

export async function fetchAlertActions(id: string | number) {
  return fetchApi<{
    success?: boolean;
    message?: string;
    actions?: AlertAction[];
  }>(`/api/alerts/${encodeURIComponent(String(id))}/actions`);
}

export async function runAlertAction(id: string | number, actionId: string) {
  try {
    const res = await authFetch(buildUrl(`/api/alerts/${encodeURIComponent(String(id))}/actions/${encodeURIComponent(actionId)}/run`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
    });
    const payload = await res.json().catch(() => null) as AlertActionRunResult | null;
    if (!res.ok) {
      throw new Error(payload?.message || `HTTP ${res.status}`);
    }
    return payload;
  } catch (error) {
    console.warn(`API alert action ${actionId} failed`, error);
    throw error;
  }
}

export type AlertAnalysisResult = {
  success?: boolean;
  mode?: 'ai' | 'local_fallback' | string;
  answer?: string;
  model?: string;
  provider?: string;
  message?: string;
  context?: {
    checkedAt?: string;
    host?: string;
    checks?: Array<{
      label: string;
      command: string;
      exitCode: number;
      ok: boolean;
      output: string;
    }>;
  };
};

export async function analyzeAlert(id: string | number) {
  try {
    const res = await authFetch(buildUrl(`/api/alerts/${encodeURIComponent(String(id))}/analysis`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(70000),
    });
    const payload = await res.json().catch(() => null) as AlertAnalysisResult | null;
    if (!res.ok) {
      throw new Error(payload?.message || `HTTP ${res.status}`);
    }
    return payload;
  } catch (error) {
    console.warn(`API alert analysis ${id} failed`, error);
    throw error;
  }
}

export async function fetchNetwork() {
  return fetchApi<any>('/api/lustre/network');
}

export async function fetchStorageForecast(hours = 24, days = 7) {
  return fetchApi<any>(`/api/metrics/storage/forecast?hours=${hours}&days=${days}`);
}

export async function fetchInodeStats() {
  return fetchApi<any>('/api/metrics/storage/inodes');
}
