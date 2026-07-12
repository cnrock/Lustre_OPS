export interface NodePerformance {
  id: string;
  name: string;
  role: 'Client' | 'OSS' | 'MDS' | 'MGS';
  readBw: number; // GB/s
  writeBw: number; // GB/s
  readIops: number; // K/s
  writeIops: number; // K/s
  readLatency: number; // ms
  writeLatency: number; // ms
  status: 'healthy' | 'warning' | 'critical';
  sparklineRead: number[];
  sparklineWrite: number[];
}

export interface TimeSeriesPoint {
  time: string;
  readBandwidth: number;
  writeBandwidth: number;
  readIops: number;
  writeIops: number;
  readLatency: number;
  writeLatency: number;
}

export interface LatencyBubblePoint {
  node: string;
  role: string;
  readLatency: number;
  writeLatency: number;
  iops: number;
  status: 'healthy' | 'warning' | 'critical';
}

function generateSparkline(base: number, variance: number): number[] {
  return Array.from({ length: 10 }, () =>
    Number((base + (Math.random() - 0.5) * variance).toFixed(1))
  );
}

export const nodePerformanceData: NodePerformance[] = [
  { id: 'c-01', name: 'Client-01', role: 'Client', readBw: 1.2, writeBw: 0.8, readIops: 45, writeIops: 32, readLatency: 1.8, writeLatency: 2.1, status: 'healthy', sparklineRead: generateSparkline(1.2, 0.4), sparklineWrite: generateSparkline(0.8, 0.3) },
  { id: 'c-02', name: 'Client-02', role: 'Client', readBw: 1.5, writeBw: 0.9, readIops: 52, writeIops: 38, readLatency: 2.0, writeLatency: 2.3, status: 'healthy', sparklineRead: generateSparkline(1.5, 0.5), sparklineWrite: generateSparkline(0.9, 0.3) },
  { id: 'c-03', name: 'Client-03', role: 'Client', readBw: 0.9, writeBw: 0.6, readIops: 38, writeIops: 25, readLatency: 1.5, writeLatency: 1.9, status: 'healthy', sparklineRead: generateSparkline(0.9, 0.3), sparklineWrite: generateSparkline(0.6, 0.2) },
  { id: 'c-04', name: 'Client-04', role: 'Client', readBw: 1.8, writeBw: 1.1, readIops: 68, writeIops: 45, readLatency: 2.2, writeLatency: 2.8, status: 'healthy', sparklineRead: generateSparkline(1.8, 0.5), sparklineWrite: generateSparkline(1.1, 0.4) },
  { id: 'c-05', name: 'Client-05', role: 'Client', readBw: 2.1, writeBw: 1.4, readIops: 78, writeIops: 52, readLatency: 2.5, writeLatency: 3.1, status: 'warning', sparklineRead: generateSparkline(2.1, 0.6), sparklineWrite: generateSparkline(1.4, 0.5) },
  { id: 'c-06', name: 'Client-06', role: 'Client', readBw: 1.3, writeBw: 0.7, readIops: 48, writeIops: 30, readLatency: 1.9, writeLatency: 2.2, status: 'healthy', sparklineRead: generateSparkline(1.3, 0.4), sparklineWrite: generateSparkline(0.7, 0.3) },
  { id: 'c-07', name: 'Client-07', role: 'Client', readBw: 0.7, writeBw: 0.5, readIops: 30, writeIops: 20, readLatency: 1.4, writeLatency: 1.7, status: 'healthy', sparklineRead: generateSparkline(0.7, 0.2), sparklineWrite: generateSparkline(0.5, 0.2) },
  { id: 'c-08', name: 'Client-08', role: 'Client', readBw: 1.6, writeBw: 1.0, readIops: 58, writeIops: 40, readLatency: 2.1, writeLatency: 2.6, status: 'healthy', sparklineRead: generateSparkline(1.6, 0.5), sparklineWrite: generateSparkline(1.0, 0.4) },
  { id: 'c-09', name: 'Client-09', role: 'Client', readBw: 0.8, writeBw: 0.4, readIops: 35, writeIops: 18, readLatency: 1.6, writeLatency: 1.8, status: 'healthy', sparklineRead: generateSparkline(0.8, 0.3), sparklineWrite: generateSparkline(0.4, 0.2) },
  { id: 'c-10', name: 'Client-10', role: 'Client', readBw: 1.9, writeBw: 1.2, readIops: 72, writeIops: 48, readLatency: 2.3, writeLatency: 2.9, status: 'healthy', sparklineRead: generateSparkline(1.9, 0.5), sparklineWrite: generateSparkline(1.2, 0.4) },
  { id: 'c-11', name: 'Client-11', role: 'Client', readBw: 1.1, writeBw: 0.7, readIops: 42, writeIops: 28, readLatency: 1.7, writeLatency: 2.0, status: 'healthy', sparklineRead: generateSparkline(1.1, 0.3), sparklineWrite: generateSparkline(0.7, 0.3) },
  { id: 'c-12', name: 'Client-12', role: 'Client', readBw: 2.4, writeBw: 1.5, readIops: 88, writeIops: 58, readLatency: 2.8, writeLatency: 3.5, status: 'warning', sparklineRead: generateSparkline(2.4, 0.6), sparklineWrite: generateSparkline(1.5, 0.5) },
  { id: 'c-13', name: 'Client-13', role: 'Client', readBw: 0.6, writeBw: 0.3, readIops: 25, writeIops: 15, readLatency: 1.3, writeLatency: 1.6, status: 'healthy', sparklineRead: generateSparkline(0.6, 0.2), sparklineWrite: generateSparkline(0.3, 0.1) },
  { id: 'c-14', name: 'Client-14', role: 'Client', readBw: 1.4, writeBw: 0.9, readIops: 55, writeIops: 36, readLatency: 2.0, writeLatency: 2.4, status: 'healthy', sparklineRead: generateSparkline(1.4, 0.4), sparklineWrite: generateSparkline(0.9, 0.3) },
  { id: 'c-15', name: 'Client-15', role: 'Client', readBw: 1.7, writeBw: 1.1, readIops: 65, writeIops: 42, readLatency: 2.2, writeLatency: 2.7, status: 'healthy', sparklineRead: generateSparkline(1.7, 0.5), sparklineWrite: generateSparkline(1.1, 0.4) },
  { id: 'c-16', name: 'Client-16', role: 'Client', readBw: 0.5, writeBw: 0.3, readIops: 22, writeIops: 14, readLatency: 1.2, writeLatency: 1.5, status: 'healthy', sparklineRead: generateSparkline(0.5, 0.15), sparklineWrite: generateSparkline(0.3, 0.1) },
  { id: 'c-17', name: 'Client-17', role: 'Client', readBw: 2.0, writeBw: 1.3, readIops: 75, writeIops: 50, readLatency: 2.4, writeLatency: 3.0, status: 'healthy', sparklineRead: generateSparkline(2.0, 0.5), sparklineWrite: generateSparkline(1.3, 0.4) },
  { id: 'c-18', name: 'Client-18', role: 'Client', readBw: 3.2, writeBw: 2.0, readIops: 120, writeIops: 80, readLatency: 4.5, writeLatency: 5.8, status: 'critical', sparklineRead: generateSparkline(3.2, 0.8), sparklineWrite: generateSparkline(2.0, 0.6) },
  { id: 'c-19', name: 'Client-19', role: 'Client', readBw: 1.0, writeBw: 0.6, readIops: 40, writeIops: 26, readLatency: 1.6, writeLatency: 2.0, status: 'healthy', sparklineRead: generateSparkline(1.0, 0.3), sparklineWrite: generateSparkline(0.6, 0.2) },
  { id: 'c-20', name: 'Client-20', role: 'Client', readBw: 1.3, writeBw: 0.8, readIops: 50, writeIops: 34, readLatency: 1.8, writeLatency: 2.2, status: 'healthy', sparklineRead: generateSparkline(1.3, 0.4), sparklineWrite: generateSparkline(0.8, 0.3) },
  { id: 'c-21', name: 'Client-21', role: 'Client', readBw: 0.4, writeBw: 0.2, readIops: 18, writeIops: 10, readLatency: 1.1, writeLatency: 1.4, status: 'healthy', sparklineRead: generateSparkline(0.4, 0.1), sparklineWrite: generateSparkline(0.2, 0.1) },
  { id: 'c-22', name: 'Client-22', role: 'Client', readBw: 1.5, writeBw: 0.9, readIops: 56, writeIops: 38, readLatency: 2.0, writeLatency: 2.5, status: 'healthy', sparklineRead: generateSparkline(1.5, 0.5), sparklineWrite: generateSparkline(0.9, 0.3) },
  { id: 'c-23', name: 'Client-23', role: 'Client', readBw: 0.1, writeBw: 0.05, readIops: 5, writeIops: 2, readLatency: 12.5, writeLatency: 15.2, status: 'critical', sparklineRead: generateSparkline(0.1, 0.05), sparklineWrite: generateSparkline(0.05, 0.02) },
  { id: 'c-24', name: 'Client-24', role: 'Client', readBw: 1.1, writeBw: 0.7, readIops: 44, writeIops: 29, readLatency: 1.7, writeLatency: 2.1, status: 'healthy', sparklineRead: generateSparkline(1.1, 0.3), sparklineWrite: generateSparkline(0.7, 0.3) },
  { id: 'oss-1', name: 'OSS-1', role: 'OSS', readBw: 18.5, writeBw: 14.2, readIops: 185, writeIops: 142, readLatency: 0.8, writeLatency: 1.1, status: 'healthy', sparklineRead: generateSparkline(18.5, 3), sparklineWrite: generateSparkline(14.2, 2.5) },
  { id: 'oss-2', name: 'OSS-2', role: 'OSS', readBw: 22.1, writeBw: 16.8, readIops: 221, writeIops: 168, readLatency: 0.9, writeLatency: 1.2, status: 'healthy', sparklineRead: generateSparkline(22.1, 3.5), sparklineWrite: generateSparkline(16.8, 3) },
  { id: 'oss-3', name: 'OSS-3', role: 'OSS', readBw: 32.1, writeBw: 24.5, readIops: 320, writeIops: 245, readLatency: 1.0, writeLatency: 1.4, status: 'healthy', sparklineRead: generateSparkline(32.1, 5), sparklineWrite: generateSparkline(24.5, 4) },
  { id: 'oss-4', name: 'OSS-4', role: 'OSS', readBw: 19.8, writeBw: 15.1, readIops: 198, writeIops: 151, readLatency: 0.8, writeLatency: 1.1, status: 'healthy', sparklineRead: generateSparkline(19.8, 3), sparklineWrite: generateSparkline(15.1, 2.5) },
  { id: 'oss-5', name: 'OSS-5', role: 'OSS', readBw: 21.5, writeBw: 16.3, readIops: 215, writeIops: 163, readLatency: 0.9, writeLatency: 1.2, status: 'healthy', sparklineRead: generateSparkline(21.5, 3.5), sparklineWrite: generateSparkline(16.3, 3) },
  { id: 'oss-6', name: 'OSS-6', role: 'OSS', readBw: 20.2, writeBw: 15.5, readIops: 202, writeIops: 155, readLatency: 0.8, writeLatency: 1.1, status: 'healthy', sparklineRead: generateSparkline(20.2, 3), sparklineWrite: generateSparkline(15.5, 2.5) },
  { id: 'oss-7', name: 'OSS-7', role: 'OSS', readBw: 15.8, writeBw: 12.1, readIops: 158, writeIops: 121, readLatency: 1.2, writeLatency: 1.6, status: 'warning', sparklineRead: generateSparkline(15.8, 2.5), sparklineWrite: generateSparkline(12.1, 2) },
  { id: 'oss-8', name: 'OSS-8', role: 'OSS', readBw: 23.4, writeBw: 17.8, readIops: 234, writeIops: 178, readLatency: 0.9, writeLatency: 1.2, status: 'healthy', sparklineRead: generateSparkline(23.4, 4), sparklineWrite: generateSparkline(17.8, 3) },
  { id: 'oss-9', name: 'OSS-9', role: 'OSS', readBw: 18.9, writeBw: 14.4, readIops: 189, writeIops: 144, readLatency: 0.8, writeLatency: 1.1, status: 'healthy', sparklineRead: generateSparkline(18.9, 3), sparklineWrite: generateSparkline(14.4, 2.5) },
  { id: 'oss-10', name: 'OSS-10', role: 'OSS', readBw: 24.8, writeBw: 18.9, readIops: 248, writeIops: 189, readLatency: 1.0, writeLatency: 1.3, status: 'healthy', sparklineRead: generateSparkline(24.8, 4), sparklineWrite: generateSparkline(18.9, 3.5) },
  { id: 'oss-11', name: 'OSS-11', role: 'OSS', readBw: 20.5, writeBw: 15.6, readIops: 205, writeIops: 156, readLatency: 0.9, writeLatency: 1.2, status: 'healthy', sparklineRead: generateSparkline(20.5, 3), sparklineWrite: generateSparkline(15.6, 2.5) },
  { id: 'oss-12', name: 'OSS-12', role: 'OSS', readBw: 19.1, writeBw: 14.6, readIops: 191, writeIops: 146, readLatency: 0.8, writeLatency: 1.1, status: 'healthy', sparklineRead: generateSparkline(19.1, 3), sparklineWrite: generateSparkline(14.6, 2.5) },
  { id: 'mds-1', name: 'MDS-1', role: 'MDS', readBw: 5.2, writeBw: 3.8, readIops: 520, writeIops: 380, readLatency: 0.5, writeLatency: 0.7, status: 'healthy', sparklineRead: generateSparkline(5.2, 1), sparklineWrite: generateSparkline(3.8, 0.8) },
  { id: 'mds-2', name: 'MDS-2', role: 'MDS', readBw: 4.8, writeBw: 3.5, readIops: 480, writeIops: 350, readLatency: 0.6, writeLatency: 0.9, status: 'warning', sparklineRead: generateSparkline(4.8, 1), sparklineWrite: generateSparkline(3.5, 0.8) },
  { id: 'mgs-1', name: 'MGS', role: 'MGS', readBw: 0.5, writeBw: 0.3, readIops: 50, writeIops: 30, readLatency: 0.3, writeLatency: 0.4, status: 'healthy', sparklineRead: generateSparkline(0.5, 0.1), sparklineWrite: generateSparkline(0.3, 0.1) },
];

function generateTimeSeries(
  points: number,
  startTime: Date,
  intervalMinutes: number
): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = new Date(startTime.getTime() + i * intervalMinutes * 60000);
    const h = t.getHours().toString().padStart(2, '0');
    const m = t.getMinutes().toString().padStart(2, '0');
    const d = t.getDate().toString().padStart(2, '0');
    const mo = (t.getMonth() + 1).toString().padStart(2, '0');
    const label = points > 48 ? `${mo}-${d} ${h}:${m}` : `${h}:${m}`;
    const base = 10 + Math.sin(i * 0.1) * 3;
    data.push({
      time: label,
      readBandwidth: Number((base + Math.random() * 4).toFixed(1)),
      writeBandwidth: Number((base * 0.7 + Math.random() * 3).toFixed(1)),
      readIops: Number((base * 100 + Math.random() * 50).toFixed(0)),
      writeIops: Number((base * 70 + Math.random() * 40).toFixed(0)),
      readLatency: Number((2 + Math.random() * 2 + Math.sin(i * 0.05) * 1.5).toFixed(1)),
      writeLatency: Number((3 + Math.random() * 2.5 + Math.sin(i * 0.05) * 1.5).toFixed(1)),
    });
  }
  return data;
}

export const timeRangeData: Record<string, TimeSeriesPoint[]> = {
  '1h': generateTimeSeries(12, new Date(Date.now() - 60 * 60000), 5),
  '6h': generateTimeSeries(24, new Date(Date.now() - 6 * 60 * 60000), 15),
  '24h': generateTimeSeries(24, new Date(Date.now() - 24 * 60 * 60000), 60),
  '7d': generateTimeSeries(56, new Date(Date.now() - 7 * 24 * 60 * 60000), 180),
};

export const latencyBubbleData: LatencyBubblePoint[] = nodePerformanceData.map((n) => ({
  node: n.name,
  role: n.role,
  readLatency: n.readLatency,
  writeLatency: n.writeLatency,
  iops: n.readIops + n.writeIops,
  status: n.status,
}));

export function getStatusBadge(status: string) {
  switch (status) {
    case 'healthy':
      return { label: '健康', color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
    case 'warning':
      return { label: '警告', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'critical':
      return { label: '紧急', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
    default:
      return { label: '未知', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  }
}

export function getRoleBadge(role: string) {
  switch (role) {
    case 'Client':
      return { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' };
    case 'OSS':
      return { color: '#06B6D4', bg: 'rgba(6,182,212,0.1)' };
    case 'MDS':
      return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' };
    case 'MGS':
      return { color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
    default:
      return { color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' };
  }
}
