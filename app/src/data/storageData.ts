export interface StorageTarget {
  id: string;
  name: string;
  type: 'MGT' | 'MDT' | 'OST';
  total: number; // GB
  used: number; // GB
  available: number; // GB
  percent: number;
  files: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
}

export interface OSTDetail extends StorageTarget {
  inodeTotal: number;
  inodeUsed: number;
  inodePercent: number;
  host: string;
  pool: string;
}

export interface StripingConfig {
  filesystem: string;
  defaultStripeCount: number;
  defaultStripeSize: string;
  stripePattern: string;
  poolAssignment: string;
  policies: {
    directory: string;
    stripeCount: number;
    stripeSize: string;
    ostPool: string;
    inherited: boolean;
  }[];
}

export interface ForecastPoint {
  day: string;
  actual?: number;
  predicted?: number;
  upper?: number;
  lower?: number;
}

export interface InodeUsage {
  id: string;
  name: string;
  total: number;
  used: number;
  available: number;
  percent: number;
  growthRate: number; // per day
  daysToExhaust: number | null;
}

export const storageTargets: StorageTarget[] = [
  { id: 'mgt-1', name: 'MGT-1', type: 'MGT', total: 10240, used: 2150, available: 8090, percent: 21, files: 1200000, status: 'healthy' },
  { id: 'mdt-1', name: 'MDT-1', type: 'MDT', total: 41943040, used: 22020096, available: 19922944, percent: 52.5, files: 890000, status: 'healthy' },
  { id: 'mdt-2', name: 'MDT-2', type: 'MDT', total: 41943040, used: 25165824, available: 16777216, percent: 60, files: 950000, status: 'healthy' },
  { id: 'ost-1', name: 'OST-1', type: 'OST', total: 19327352832, used: 12884901888, available: 6442450944, percent: 66.7, files: 450000, status: 'healthy' },
  { id: 'ost-2', name: 'OST-2', type: 'OST', total: 19327352832, used: 13529146982, available: 5798205850, percent: 70, files: 480000, status: 'healthy' },
  { id: 'ost-3', name: 'OST-3', type: 'OST', total: 19327352832, used: 14260633600, available: 5066719232, percent: 73.8, files: 510000, status: 'healthy' },
  { id: 'ost-4', name: 'OST-4', type: 'OST', total: 19327352832, used: 15461882266, available: 3865470566, percent: 80, files: 520000, status: 'warning' },
  { id: 'ost-5', name: 'OST-5', type: 'OST', total: 19327352832, used: 15032385536, available: 4294967296, percent: 77.8, files: 490000, status: 'warning' },
  { id: 'ost-6', name: 'OST-6', type: 'OST', total: 19327352832, used: 16213567488, available: 3113785344, percent: 83.9, files: 550000, status: 'warning' },
  { id: 'ost-7', name: 'OST-7', type: 'OST', total: 19327352832, used: 17394606080, available: 1952746752, percent: 90, files: 580000, status: 'critical' },
  { id: 'ost-8', name: 'OST-8', type: 'OST', total: 19327352832, used: 14602888806, available: 4724464026, percent: 75.6, files: 500000, status: 'healthy' },
  { id: 'ost-9', name: 'OST-9', type: 'OST', total: 19327352832, used: 13529146982, available: 5798205850, percent: 70, files: 470000, status: 'healthy' },
  { id: 'ost-10', name: 'OST-10', type: 'OST', total: 19327352832, used: 12562779392, available: 6764573440, percent: 65, files: 440000, status: 'healthy' },
  { id: 'ost-11', name: 'OST-11', type: 'OST', total: 19327352832, used: 13958643712, available: 5368709120, percent: 72.2, files: 460000, status: 'healthy' },
  { id: 'ost-12', name: 'OST-12', type: 'OST', total: 19327352832, used: 14817637171, available: 4509715661, percent: 76.7, files: 495000, status: 'healthy' },
];

export const ostDetails: OSTDetail[] = storageTargets
  .filter((t) => t.type === 'OST')
  .map((t, i) => ({
    ...t,
    inodeTotal: 500000000,
    inodeUsed: Math.floor(500000000 * (0.4 + Math.random() * 0.3)),
    inodePercent: Math.floor(40 + Math.random() * 30),
    host: `oss-${(i % 12) + 1}`,
    pool: i < 6 ? 'pool-fast' : 'pool-standard',
  }));

export const capacitySummary = {
  mgt: { used: 2.1, total: 10, percent: 21, files: 1200000 },
  mdt: { used: 45, total: 80, percent: 56, dirs: 890000 },
  ost: { used: 156, total: 216, percent: 72, count: 12, over80: 3 },
};

export const stripingConfig: StripingConfig = {
  filesystem: 'lustre01',
  defaultStripeCount: 4,
  defaultStripeSize: '1 MB',
  stripePattern: 'RAID 0',
  poolAssignment: 'pool-fast',
  policies: [
    { directory: '/', stripeCount: 1, stripeSize: '1 MB', ostPool: 'default', inherited: true },
    { directory: '/scratch', stripeCount: 2, stripeSize: '1 MB', ostPool: 'pool-standard', inherited: false },
    { directory: '/projects', stripeCount: 4, stripeSize: '4 MB', ostPool: 'pool-fast', inherited: false },
    { directory: '/home', stripeCount: 1, stripeSize: '1 MB', ostPool: 'default', inherited: false },
    { directory: '/datasets', stripeCount: 8, stripeSize: '4 MB', ostPool: 'pool-fast', inherited: false },
  ],
};

function generateForecast(): ForecastPoint[] {
  const data: ForecastPoint[] = [];
  const baseUsed = 140; // TB
  const growthRate = 2.3; // TB/day
  const today = new Date();
  for (let i = -30; i <= 30; i++) {
    const d = new Date(today.getTime() + i * 24 * 3600 * 1000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    if (i <= 0) {
      const actual = baseUsed + (i + 30) * growthRate + (Math.random() - 0.5) * 3;
      data.push({ day: label, actual: Number(actual.toFixed(1)) });
    } else {
      const predicted = baseUsed + (i + 30) * growthRate;
      const variance = 1.5 + i * 0.1;
      data.push({
        day: label,
        predicted: Number(predicted.toFixed(1)),
        upper: Number((predicted + variance * 3).toFixed(1)),
        lower: Number((predicted - variance * 3).toFixed(1)),
      });
    }
  }
  return data;
}

export const forecastData = generateForecast();

export const inodeUsageData: InodeUsage[] = [
  { id: 'mdt-1', name: 'MDT-1', total: 500000000, used: 210000000, available: 290000000, percent: 42, growthRate: 120000, daysToExhaust: null },
  { id: 'mdt-2', name: 'MDT-2', total: 500000000, used: 390000000, available: 110000000, percent: 78, growthRate: 180000, daysToExhaust: 45 },
  { id: 'ost-1', name: 'OST-1', total: 500000000, used: 150000000, available: 350000000, percent: 30, growthRate: 50000, daysToExhaust: null },
  { id: 'ost-2', name: 'OST-2', total: 500000000, used: 175000000, available: 325000000, percent: 35, growthRate: 55000, daysToExhaust: null },
  { id: 'ost-3', name: 'OST-3', total: 500000000, used: 200000000, available: 300000000, percent: 40, growthRate: 60000, daysToExhaust: null },
  { id: 'ost-4', name: 'OST-4', total: 500000000, used: 225000000, available: 275000000, percent: 45, growthRate: 65000, daysToExhaust: null },
  { id: 'ost-5', name: 'OST-5', total: 500000000, used: 195000000, available: 305000000, percent: 39, growthRate: 58000, daysToExhaust: null },
  { id: 'ost-6', name: 'OST-6', total: 500000000, used: 240000000, available: 260000000, percent: 48, growthRate: 70000, daysToExhaust: null },
  { id: 'ost-7', name: 'OST-7', total: 500000000, used: 260000000, available: 240000000, percent: 52, growthRate: 75000, daysToExhaust: null },
  { id: 'ost-8', name: 'OST-8', total: 500000000, used: 205000000, available: 295000000, percent: 41, growthRate: 62000, daysToExhaust: null },
];

export function getStatusBadge(status: string) {
  switch (status) {
    case 'healthy':
      return { label: '健康', color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
    case 'warning':
      return { label: '警告', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'critical':
      return { label: '临界', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
    case 'offline':
      return { label: '离线', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
    default:
      return { label: '未知', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' };
  }
}

export function formatBytes(gb: number): string {
  if (gb >= 1048576) return `${(gb / 1048576).toFixed(1)} PB`;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
