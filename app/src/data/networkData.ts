export interface MultipathSession {
  id: string;
  node: string;
  sourcePort: string;
  sourceIp: string;
  targetPort: string;
  targetIp: string;
  protocol: 'IB' | 'RoCE' | 'TCP';
  pathCount: number;
  activePaths: number;
  totalBandwidth: string;
  utilization: number;
  status: 'healthy' | 'degraded' | 'failed';
  failoverTime: string;
  paths: PathDetail[];
}

export interface PathDetail {
  id: string;
  name: string;
  state: 'active' | 'failed' | 'standby';
  priority: number;
  latency: number;
  throughput: string;
  errorCount: number;
  lastFailover: string;
}

export interface ProtocolCard {
  name: string;
  protocol: 'IB' | 'RDMA' | 'Ethernet';
  currentBandwidth: string;
  peakBandwidth: string;
  avgLatency: string;
  p99Latency: string;
  activeLinks: number;
  totalLinks: number;
  status: 'healthy' | 'degraded' | 'failed';
}

export interface BandwidthDataPoint {
  time: string;
  ib: number;
  roce: number;
  tcp: number;
}

export interface ProtocolLatency {
  protocol: string;
  min: number;
  avg: number;
  p99: number;
  max: number;
}

export interface NetworkEvent {
  id: string;
  timestamp: string;
  type: 'failure' | 'failover' | 'recovery' | 'warning';
  title: string;
  description: string;
  affectedNodes: string[];
  duration?: string;
  resolution: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface TopologyNode {
  id: string;
  name: string;
  type: 'switch' | 'client' | 'server' | 'mds' | 'oss';
  x: number;
  y: number;
  status: 'healthy' | 'degraded' | 'failed';
  utilization: number;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  status: 'healthy' | 'degraded' | 'failed' | 'standby';
  protocol: 'IB' | 'RDMA' | 'Ethernet';
  bandwidth: string;
  utilization: number;
  thickness: number;
}

export const multipathSessions: MultipathSession[] = [
  {
    id: 'mp-1',
    node: 'Client-01',
    sourcePort: 'ib0',
    sourceIp: '192.168.10.11',
    targetPort: 'sw-ib-01/p1',
    targetIp: '192.168.10.1',
    protocol: 'IB',
    pathCount: 4,
    activePaths: 4,
    totalBandwidth: '160 Gbps',
    utilization: 62,
    status: 'healthy',
    failoverTime: '—',
    paths: [
      { id: 'p1', name: '路径1', state: 'active', priority: 1, latency: 1.2, throughput: '38 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p2', name: '路径2', state: 'active', priority: 2, latency: 1.3, throughput: '42 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p3', name: '路径3', state: 'standby', priority: 3, latency: 1.1, throughput: '0 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p4', name: '路径4', state: 'standby', priority: 4, latency: 1.4, throughput: '0 Gbps', errorCount: 0, lastFailover: '—' },
    ],
  },
  {
    id: 'mp-2',
    node: 'Client-18',
    sourcePort: 'ib0',
    sourceIp: '192.168.10.28',
    targetPort: 'sw-ib-02/p4',
    targetIp: '192.168.10.2',
    protocol: 'IB',
    pathCount: 4,
    activePaths: 3,
    totalBandwidth: '120 Gbps',
    utilization: 58,
    status: 'degraded',
    failoverTime: '2分钟前',
    paths: [
      { id: 'p1', name: '路径1', state: 'active', priority: 1, latency: 1.5, throughput: '35 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p2', name: '路径2', state: 'failed', priority: 2, latency: 999, throughput: '0 Gbps', errorCount: 12, lastFailover: '2分钟前' },
      { id: 'p3', name: '路径3', state: 'active', priority: 3, latency: 1.8, throughput: '38 Gbps', errorCount: 0, lastFailover: '2分钟前' },
      { id: 'p4', name: '路径4', state: 'standby', priority: 4, latency: 1.6, throughput: '0 Gbps', errorCount: 0, lastFailover: '—' },
    ],
  },
  {
    id: 'mp-3',
    node: 'OSS-7',
    sourcePort: 'mlx5_0',
    sourceIp: '192.168.20.17',
    targetPort: 'sw-ib-01/p8',
    targetIp: '192.168.10.1',
    protocol: 'RoCE',
    pathCount: 2,
    activePaths: 2,
    totalBandwidth: '50 Gbps',
    utilization: 78,
    status: 'degraded',
    failoverTime: '15分钟前',
    paths: [
      { id: 'p1', name: '路径1', state: 'active', priority: 1, latency: 2.1, throughput: '22 Gbps', errorCount: 3, lastFailover: '15分钟前' },
      { id: 'p2', name: '路径2', state: 'active', priority: 2, latency: 2.5, throughput: '17 Gbps', errorCount: 5, lastFailover: '—' },
    ],
  },
  {
    id: 'mp-4',
    node: 'MDS-1',
    sourcePort: 'ib0',
    sourceIp: '192.168.20.11',
    targetPort: 'sw-ib-02/p1',
    targetIp: '192.168.10.2',
    protocol: 'IB',
    pathCount: 4,
    activePaths: 4,
    totalBandwidth: '400 Gbps',
    utilization: 45,
    status: 'healthy',
    failoverTime: '—',
    paths: [
      { id: 'p1', name: '路径1', state: 'active', priority: 1, latency: 0.8, throughput: '95 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p2', name: '路径2', state: 'active', priority: 2, latency: 0.9, throughput: '98 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p3', name: '路径3', state: 'standby', priority: 3, latency: 0.8, throughput: '0 Gbps', errorCount: 0, lastFailover: '—' },
      { id: 'p4', name: '路径4', state: 'standby', priority: 4, latency: 0.9, throughput: '0 Gbps', errorCount: 0, lastFailover: '—' },
    ],
  },
  {
    id: 'mp-5',
    node: 'Client-23',
    sourcePort: 'eth0',
    sourceIp: '192.168.30.33',
    targetPort: 'sw-eth-01/p6',
    targetIp: '192.168.30.1',
    protocol: 'TCP',
    pathCount: 2,
    activePaths: 0,
    totalBandwidth: '0 Gbps',
    utilization: 0,
    status: 'failed',
    failoverTime: '5分钟前',
    paths: [
      { id: 'p1', name: '路径1', state: 'failed', priority: 1, latency: 999, throughput: '0 Gbps', errorCount: 45, lastFailover: '5分钟前' },
      { id: 'p2', name: '路径2', state: 'failed', priority: 2, latency: 999, throughput: '0 Gbps', errorCount: 38, lastFailover: '5分钟前' },
    ],
  },
];

export const protocolCards: ProtocolCard[] = [
  {
    name: 'InfiniBand',
    protocol: 'IB',
    currentBandwidth: '512 Gbps',
    peakBandwidth: '640 Gbps',
    avgLatency: '1.2 μs',
    p99Latency: '2.8 μs',
    activeLinks: 64,
    totalLinks: 64,
    status: 'healthy',
  },
  {
    name: 'RoCE v2',
    protocol: 'RDMA',
    currentBandwidth: '256 Gbps',
    peakBandwidth: '300 Gbps',
    avgLatency: '3.5 μs',
    p99Latency: '8.2 μs',
    activeLinks: 24,
    totalLinks: 24,
    status: 'healthy',
  },
  {
    name: 'Ethernet / LNet',
    protocol: 'Ethernet',
    currentBandwidth: '79 Gbps',
    peakBandwidth: '100 Gbps',
    avgLatency: '45 μs',
    p99Latency: '120 μs',
    activeLinks: 8,
    totalLinks: 10,
    status: 'degraded',
  },
];

export const bandwidthHistory: BandwidthDataPoint[] = [
  { time: '00:00', ib: 420, roce: 200, tcp: 65 },
  { time: '00:05', ib: 445, roce: 210, tcp: 68 },
  { time: '00:10', ib: 470, roce: 225, tcp: 70 },
  { time: '00:15', ib: 490, roce: 240, tcp: 72 },
  { time: '00:20', ib: 500, roce: 248, tcp: 74 },
  { time: '00:25', ib: 495, roce: 242, tcp: 73 },
  { time: '00:30', ib: 505, roce: 250, tcp: 75 },
  { time: '00:35', ib: 510, roce: 255, tcp: 76 },
  { time: '00:40', ib: 508, roce: 253, tcp: 77 },
  { time: '00:45', ib: 512, roce: 256, tcp: 79 },
];

export const protocolLatencyData: ProtocolLatency[] = [
  { protocol: 'InfiniBand', min: 0.8, avg: 1.2, p99: 2.8, max: 4.5 },
  { protocol: 'RoCE v2', min: 2.1, avg: 3.5, p99: 8.2, max: 15.3 },
  { protocol: 'TCP/IP', min: 25, avg: 45, p99: 120, max: 350 },
];

export const networkEvents: NetworkEvent[] = [
  {
    id: 'ne-1',
    timestamp: '14:32:15',
    type: 'failover',
    title: '路径切换',
    description: 'Client-18 IB端口2链路断开，自动切换至端口1',
    affectedNodes: ['Client-18'],
    duration: '2秒',
    resolution: '自动恢复',
    severity: 'warning',
  },
  {
    id: 'ne-2',
    timestamp: '14:28:03',
    type: 'warning',
    title: '性能降级',
    description: 'OSS-7 RoCE链路丢包率升至0.3%',
    affectedNodes: ['OSS-7'],
    resolution: '监控中',
    severity: 'warning',
  },
  {
    id: 'ne-3',
    timestamp: '14:15:42',
    type: 'failure',
    title: '链路故障',
    description: 'Client-23 连接中断，所有路径不可用',
    affectedNodes: ['Client-23'],
    resolution: '待处理',
    severity: 'critical',
  },
  {
    id: 'ne-4',
    timestamp: '13:58:21',
    type: 'recovery',
    title: '链路恢复',
    description: 'OSS-3 IB链路从降级状态恢复至正常',
    affectedNodes: ['OSS-3'],
    duration: '3分钟',
    resolution: '自动恢复',
    severity: 'info',
  },
  {
    id: 'ne-5',
    timestamp: '13:45:00',
    type: 'warning',
    title: '拥塞告警',
    description: 'sw-ib-01 端口利用率超过85%',
    affectedNodes: ['sw-ib-01'],
    resolution: '已缓解',
    severity: 'warning',
  },
  {
    id: 'ne-6',
    timestamp: '13:20:18',
    type: 'failover',
    title: '路径切换',
    description: 'MDS-2 主路径切换至备用路径',
    affectedNodes: ['MDS-2'],
    duration: '1秒',
    resolution: '自动恢复',
    severity: 'info',
  },
];

export const topologyNodes: TopologyNode[] = [
  // Switches (center)
  { id: 'sw1', name: 'SW-IB-01', type: 'switch', x: 350, y: 200, status: 'healthy', utilization: 72 },
  { id: 'sw2', name: 'SW-IB-02', type: 'switch', x: 550, y: 200, status: 'healthy', utilization: 65 },
  { id: 'sw3', name: 'SW-ETH-01', type: 'switch', x: 450, y: 360, status: 'degraded', utilization: 88 },

  // MGS/MDS (top)
  { id: 'mgs', name: 'MGS', type: 'mds', x: 150, y: 80, status: 'healthy', utilization: 35 },
  { id: 'mds1', name: 'MDS-1', type: 'mds', x: 300, y: 80, status: 'healthy', utilization: 42 },
  { id: 'mds2', name: 'MDS-2', type: 'mds', x: 450, y: 80, status: 'healthy', utilization: 38 },

  // OSS (left)
  { id: 'oss1', name: 'OSS-1', type: 'oss', x: 100, y: 280, status: 'healthy', utilization: 55 },
  { id: 'oss2', name: 'OSS-2', type: 'oss', x: 100, y: 340, status: 'healthy', utilization: 60 },
  { id: 'srv3', name: 'OSS-3', type: 'oss', x: 180, y: 320, status: 'healthy', utilization: 48 },
  { id: 'srv7', name: 'OSS-7', type: 'oss', x: 200, y: 400, status: 'degraded', utilization: 78 },
  { id: 'srv8', name: 'OSS-8', type: 'oss', x: 100, y: 400, status: 'healthy', utilization: 52 },

  // Clients (right)
  { id: 'c1', name: 'Client-01', type: 'client', x: 650, y: 120, status: 'healthy', utilization: 40 },
  { id: 'c2', name: 'Client-02', type: 'client', x: 720, y: 160, status: 'healthy', utilization: 35 },
  { id: 'c18', name: 'Client-18', type: 'client', x: 680, y: 280, status: 'degraded', utilization: 62 },
  { id: 'c23', name: 'Client-23', type: 'client', x: 720, y: 340, status: 'failed', utilization: 0 },
  { id: 'c5', name: 'Client-05', type: 'client', x: 620, y: 320, status: 'healthy', utilization: 45 },
];

export const topologyLinks: TopologyLink[] = [
  { id: 'l1', source: 'mgs', target: 'sw1', status: 'healthy', protocol: 'IB', bandwidth: '100 Gbps', utilization: 35, thickness: 3 },
  { id: 'l2', source: 'mds1', target: 'sw1', status: 'healthy', protocol: 'IB', bandwidth: '100 Gbps', utilization: 42, thickness: 3 },
  { id: 'l3', source: 'mds2', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '100 Gbps', utilization: 38, thickness: 3 },
  { id: 'l4', source: 'oss1', target: 'sw1', status: 'healthy', protocol: 'IB', bandwidth: '56 Gbps', utilization: 55, thickness: 2 },
  { id: 'l5', source: 'oss2', target: 'sw1', status: 'healthy', protocol: 'IB', bandwidth: '56 Gbps', utilization: 60, thickness: 2 },
  { id: 'l6', source: 'srv3', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '56 Gbps', utilization: 48, thickness: 2 },
  { id: 'l7', source: 'srv7', target: 'sw1', status: 'degraded', protocol: 'RDMA', bandwidth: '25 Gbps', utilization: 78, thickness: 2 },
  { id: 'l8', source: 'srv8', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '56 Gbps', utilization: 52, thickness: 2 },
  { id: 'l9', source: 'c1', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '40 Gbps', utilization: 40, thickness: 2 },
  { id: 'l10', source: 'c2', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '40 Gbps', utilization: 35, thickness: 2 },
  { id: 'l11', source: 'c18', target: 'sw2', status: 'degraded', protocol: 'IB', bandwidth: '30 Gbps', utilization: 62, thickness: 2 },
  { id: 'l12', source: 'c23', target: 'sw3', status: 'failed', protocol: 'Ethernet', bandwidth: '0 Gbps', utilization: 0, thickness: 1 },
  { id: 'l13', source: 'c5', target: 'sw3', status: 'healthy', protocol: 'Ethernet', bandwidth: '10 Gbps', utilization: 45, thickness: 1 },
  { id: 'l14', source: 'sw1', target: 'sw2', status: 'healthy', protocol: 'IB', bandwidth: '200 Gbps', utilization: 55, thickness: 4 },
];
