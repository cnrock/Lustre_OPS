export interface LogEntry {
  id: string;
  node: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  timestamp: string;
  source?: string;
}

export interface LogNodeStatus {
  node: string;
  collecting: boolean;
  lastSync: string;
  logSize: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  codeBlocks?: { code: string }[];
}

export interface HealthCheckStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'done' | 'warning' | 'error';
  progress: number;
  totalChecks: number;
  completedChecks: number;
}

export interface HealthCheckFinding {
  id: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedNodes: string[];
  recommendation: string;
  remediation?: HealthCheckRemediation;
}

export interface HealthCheckRemediation {
  actionId: string;
  title: string;
  summary: string;
  risk: 'low' | 'medium' | 'high';
  canAutoFix: boolean;
  manualSteps: string[];
  validationSteps: string[];
  commands: Array<{ label: string; command: string; danger?: boolean }>;
}

export interface HealthCheckCategoryResult {
  name: string;
  score: number;
  status: 'passed' | 'warning' | 'failed';
  checks: number;
  passed: number;
  warnings: number;
  failed: number;
}

export interface InspectionReport {
  id: string;
  name: string;
  cluster: string;
  triggerType: 'manual' | 'scheduled' | 'alert';
  healthScore: number;
  checksPassed: number;
  checksFailed: number;
  checksWarned: number;
  duration: string;
  createdAt: string;
  findings: HealthCheckFinding[];
  categoryScores: HealthCheckCategoryResult[];
}

export interface PerformanceSnapshot {
  label: string;
  readBandwidth: number;
  writeBandwidth: number;
  readIops: number;
  writeIops: number;
  readLatency: number;
  writeLatency: number;
}

// Log Analysis Data
export const logCollectionStatus: LogNodeStatus[] = [
  { node: 'MGS', collecting: true, lastSync: '2分钟前', logSize: '156 MB' },
  { node: 'MDS-1', collecting: true, lastSync: '1分钟前', logSize: '234 MB' },
  { node: 'MDS-2', collecting: true, lastSync: '3分钟前', logSize: '198 MB' },
  { node: 'OSS-1', collecting: true, lastSync: '1分钟前', logSize: '312 MB' },
  { node: 'OSS-2', collecting: true, lastSync: '2分钟前', logSize: '298 MB' },
  { node: 'OSS-3', collecting: true, lastSync: '1分钟前', logSize: '287 MB' },
  { node: 'OSS-4', collecting: true, lastSync: '2分钟前', logSize: '301 MB' },
  { node: 'OSS-5', collecting: true, lastSync: '1分钟前', logSize: '276 MB' },
  { node: 'OSS-6', collecting: true, lastSync: '3分钟前', logSize: '289 MB' },
  { node: 'OSS-7', collecting: true, lastSync: '1分钟前', logSize: '345 MB' },
  { node: 'Client-23', collecting: false, lastSync: '15分钟前', logSize: '89 MB' },
];

export const allLogEntries: LogEntry[] = [
  { id: 'log-001', node: 'OSS-7', level: 'WARN', message: '磁盘使用率超过 85%，建议扩容', timestamp: '2024-01-15 08:23:14', source: 'lustre' },
  { id: 'log-002', node: 'Client-23', level: 'ERROR', message: '连接 MGS 超时，重试中...', timestamp: '2024-01-15 08:18:42', source: 'lnet' },
  { id: 'log-003', node: 'MDS-2', level: 'WARN', message: '写入延迟 4.1ms，超过阈值 4.0ms', timestamp: '2024-01-15 08:15:30', source: 'lustre' },
  { id: 'log-004', node: 'MGS', level: 'INFO', message: '心跳检测正常，所有服务在线', timestamp: '2024-01-15 08:10:05', source: 'lustre' },
  { id: 'log-005', node: 'OSS-3', level: 'INFO', message: 'OST 恢复完成，恢复正常服务', timestamp: '2024-01-15 08:05:22', source: 'lustre' },
  { id: 'log-006', node: 'OSS-12', level: 'DEBUG', message: '清理过期缓存，释放 2.3GB', timestamp: '2024-01-15 08:00:11', source: 'lustre' },
  { id: 'log-007', node: 'Client-23', level: 'ERROR', message: 'LNet: connection refused from 10.0.23.7', timestamp: '2024-01-15 07:55:33', source: 'lnet' },
  { id: 'log-008', node: 'OSS-7', level: 'WARN', message: '写入带宽下降至 45 MB/s (预期: >100 MB/s)', timestamp: '2024-01-15 07:52:10', source: 'lustre' },
  { id: 'log-009', node: 'MDS-1', level: 'INFO', message: '元数据操作正常，当前负载 34%', timestamp: '2024-01-15 07:48:22', source: 'lustre' },
  { id: 'log-010', node: 'OSS-5', level: 'INFO', message: '数据平衡完成，迁移 12.4 GB 数据', timestamp: '2024-01-15 07:45:00', source: 'lfs' },
  { id: 'log-011', node: 'Client-15', level: 'WARN', message: 'IB 链路质量下降，延迟增加 15%', timestamp: '2024-01-15 07:40:18', source: 'lnet' },
  { id: 'log-012', node: 'OSS-2', level: 'DEBUG', message: '内存使用: 12.4 GB / 64 GB (19%)', timestamp: '2024-01-15 07:35:05', source: 'syslog' },
  { id: 'log-013', node: 'MDS-2', level: 'ERROR', message: '配置与主节点不一致: ldiskfs vs zfs', timestamp: '2024-01-15 07:30:44', source: 'lustre' },
  { id: 'log-014', node: 'MGS', level: 'INFO', message: '服务注册成功，节点 MDS-2 已连接', timestamp: '2024-01-15 07:25:12', source: 'lustre' },
  { id: 'log-015', node: 'OSS-8', level: 'INFO', message: 'OST 挂载成功，可用空间 18.2 TB', timestamp: '2024-01-15 07:20:00', source: 'lustre' },
  { id: 'log-016', node: 'Client-23', level: 'ERROR', message: 'RPC 超时: 未能从 OSS-7 获取数据', timestamp: '2024-01-15 07:15:33', source: 'lustre' },
  { id: 'log-017', node: 'OSS-7', level: 'WARN', message: 'IO 等待时间增加至 23ms', timestamp: '2024-01-15 07:10:18', source: 'lustre' },
  { id: 'log-018', node: 'MDS-1', level: 'INFO', message: '备份完成，耗时 3分12秒', timestamp: '2024-01-15 07:05:00', source: 'lfs' },
  { id: 'log-019', node: 'Client-30', level: 'DEBUG', message: '缓存命中率达到 94%', timestamp: '2024-01-15 07:00:11', source: 'lustre' },
  { id: 'log-020', node: 'OSS-4', level: 'WARN', message: '温度警告: CPU 温度 72°C (阈值: 70°C)', timestamp: '2024-01-15 06:55:44', source: 'syslog' },
];

export const aiAnalysisHistory: { id: string; query: string; timestamp: string; type: 'analysis' | 'chart' | 'error' }[] = [
  { id: 'hist-1', query: '分析 Client-23 频繁断开连接原因', timestamp: '今天 09:15', type: 'analysis' },
  { id: 'hist-2', query: '最近24小时异常摘要', timestamp: '今天 08:30', type: 'analysis' },
  { id: 'hist-3', query: 'OSS-7 性能下降诊断', timestamp: '昨天 16:45', type: 'chart' },
  { id: 'hist-4', query: '本周错误趋势分析', timestamp: '昨天 10:20', type: 'analysis' },
  { id: 'hist-5', query: '网络连接问题分析', timestamp: '上周三 14:00', type: 'analysis' },
];

// Health Check Data
export const healthCheckSteps: HealthCheckStep[] = [
  { id: 'step-1', name: '节点连通性', status: 'pending', progress: 0, totalChecks: 48, completedChecks: 0 },
  { id: 'step-2', name: '配置一致性', status: 'pending', progress: 0, totalChecks: 24, completedChecks: 0 },
  { id: 'step-3', name: '性能基准', status: 'pending', progress: 0, totalChecks: 32, completedChecks: 0 },
  { id: 'step-4', name: '容量趋势', status: 'pending', progress: 0, totalChecks: 20, completedChecks: 0 },
  { id: 'step-5', name: '网络路径', status: 'pending', progress: 0, totalChecks: 32, completedChecks: 0 },
  { id: 'step-6', name: '日志异常扫描', status: 'pending', progress: 0, totalChecks: 16, completedChecks: 0 },
];

export const sampleFindings: HealthCheckFinding[] = [
  {
    id: 'f-1',
    category: '存储容量',
    severity: 'warning',
    title: 'OSS-7 磁盘使用率 87.3%',
    description: '对象存储服务器 OSS-7 磁盘空间使用率达到 87.3%，超过警告阈值 85%',
    affectedNodes: ['OSS-7'],
    recommendation: '建议清理旧数据或扩容 OST 存储容量',
  },
  {
    id: 'f-2',
    category: '网络健康',
    severity: 'warning',
    title: 'Client-23 连接不稳定',
    description: '客户端节点 Client-23 与 MGS 连接不稳定，过去24小时内断开 47 次',
    affectedNodes: ['Client-23'],
    recommendation: '检查 IB 交换机端口状态 (SW-IB-02:端口14)',
  },
  {
    id: 'f-3',
    category: '性能指标',
    severity: 'warning',
    title: '写入延迟 P99 8.7ms',
    description: '集群写入延迟 P99 达到 8.7ms，高于预期阈值 5ms',
    affectedNodes: ['MDS-2', 'OSS-7'],
    recommendation: '优化写入路径，检查存储队列深度',
  },
  {
    id: 'f-4',
    category: '配置一致性',
    severity: 'info',
    title: 'MDS-2 配置与主节点差异',
    description: 'MDS-2 的 Lustre 配置文件与主 MDS-1 存在 3 项差异',
    affectedNodes: ['MDS-2'],
    recommendation: '建议同步配置文件，保持集群配置一致性',
  },
  {
    id: 'f-5',
    category: '日志异常扫描',
    severity: 'info',
    title: '发现重复错误模式',
    description: '检测到 Client-23 的 LNet 连接错误在过去7天内重复出现 329 次',
    affectedNodes: ['Client-23'],
    recommendation: '建议升级 IB 网卡驱动至最新版本',
  },
];

export const categoryResults: HealthCheckCategoryResult[] = [
  { name: '集群状态', score: 98, status: 'passed', checks: 48, passed: 47, warnings: 1, failed: 0 },
  { name: '性能指标', score: 85, status: 'warning', checks: 32, passed: 29, warnings: 3, failed: 0 },
  { name: '存储容量', score: 78, status: 'warning', checks: 20, passed: 17, warnings: 3, failed: 0 },
  { name: '网络健康', score: 92, status: 'passed', checks: 32, passed: 30, warnings: 1, failed: 1 },
  { name: '配置一致性', score: 95, status: 'passed', checks: 24, passed: 23, warnings: 1, failed: 0 },
  { name: '日志异常', score: 82, status: 'warning', checks: 16, passed: 14, warnings: 2, failed: 0 },
];

export const aiDiagnosisText = `根据本次检查结果，AI 助手识别到以下关键模式:

关联分析: 三个警告可能存在关联
Client-23 的网络不稳定可能与 OSS-7 的高负载有关。
高负载导致响应延迟增加，进而触发客户端重连。

趋势预测: 如果不处理
• OSS-7 将在 12 天内达到 90% 容量阈值
• Client-23 的断连频率可能从 47次/天 增加到 80次/天

优先级建议:
1. 【高】处理 OSS-7 容量问题 — 影响数据写入
2. 【中】排查 Client-23 网络 — 影响作业稳定性
3. 【低】同步 MDS-2 配置 — 非紧急

建议操作顺序:
① 在 OSS-7 上运行 lfs migrate 平衡数据
② 检查 SW-IB-02 端口14 的物理连接
③ 监控 Client-23 24小时确认改善`;

// Reports Data
export const inspectionReports: InspectionReport[] = [
  {
    id: 'rpt-001',
    name: 'cluster-hpc-prod-01_2025-01-15_09:35',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'manual',
    healthScore: 87,
    checksPassed: 154,
    checksFailed: 0,
    checksWarned: 2,
    duration: '3分18秒',
    createdAt: '2025-01-15 09:35:12',
    findings: sampleFindings,
    categoryScores: categoryResults,
  },
  {
    id: 'rpt-002',
    name: 'cluster-hpc-prod-01_2025-01-14_08:20',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'scheduled',
    healthScore: 92,
    checksPassed: 155,
    checksFailed: 0,
    checksWarned: 1,
    duration: '2分45秒',
    createdAt: '2025-01-14 08:20:05',
    findings: [
      {
        id: 'f-6',
        category: '网络健康',
        severity: 'warning',
        title: 'Client-23 连接不稳定',
        description: '客户端节点 Client-23 与 MGS 连接不稳定',
        affectedNodes: ['Client-23'],
        recommendation: '检查 IB 交换机端口状态',
      },
    ],
    categoryScores: [
      { name: '集群状态', score: 99, status: 'passed', checks: 48, passed: 48, warnings: 0, failed: 0 },
      { name: '性能指标', score: 94, status: 'passed', checks: 32, passed: 31, warnings: 1, failed: 0 },
      { name: '存储容量', score: 88, status: 'passed', checks: 20, passed: 18, warnings: 2, failed: 0 },
      { name: '网络健康', score: 85, status: 'warning', checks: 32, passed: 30, warnings: 1, failed: 1 },
      { name: '配置一致性', score: 96, status: 'passed', checks: 24, passed: 23, warnings: 1, failed: 0 },
      { name: '日志异常', score: 90, status: 'passed', checks: 16, passed: 15, warnings: 1, failed: 0 },
    ],
  },
  {
    id: 'rpt-003',
    name: 'cluster-hpc-prod-01_2025-01-13_14:00',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'manual',
    healthScore: 94,
    checksPassed: 155,
    checksFailed: 0,
    checksWarned: 1,
    duration: '2分52秒',
    createdAt: '2025-01-13 14:00:33',
    findings: [
      {
        id: 'f-7',
        category: '存储容量',
        severity: 'warning',
        title: 'OSS-7 磁盘使用率 84.5%',
        description: '磁盘使用率接近警告阈值',
        affectedNodes: ['OSS-7'],
        recommendation: '监控容量增长趋势',
      },
    ],
    categoryScores: [
      { name: '集群状态', score: 100, status: 'passed', checks: 48, passed: 48, warnings: 0, failed: 0 },
      { name: '性能指标', score: 96, status: 'passed', checks: 32, passed: 32, warnings: 0, failed: 0 },
      { name: '存储容量', score: 85, status: 'warning', checks: 20, passed: 18, warnings: 2, failed: 0 },
      { name: '网络健康', score: 98, status: 'passed', checks: 32, passed: 32, warnings: 0, failed: 0 },
      { name: '配置一致性', score: 97, status: 'passed', checks: 24, passed: 24, warnings: 0, failed: 0 },
      { name: '日志异常', score: 92, status: 'passed', checks: 16, passed: 15, warnings: 1, failed: 0 },
    ],
  },
  {
    id: 'rpt-004',
    name: 'cluster-hpc-prod-01_2025-01-12_09:00',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'alert',
    healthScore: 76,
    checksPassed: 152,
    checksFailed: 2,
    checksWarned: 4,
    duration: '4分10秒',
    createdAt: '2025-01-12 09:00:18',
    findings: sampleFindings.concat([
      {
        id: 'f-8',
        category: '集群状态',
        severity: 'critical',
        title: 'Client-23 完全离线',
        description: 'Client-23 无法连接到集群',
        affectedNodes: ['Client-23'],
        recommendation: '检查网络物理连接和网卡状态',
      },
    ]),
    categoryScores: [
      { name: '集群状态', score: 85, status: 'warning', checks: 48, passed: 46, warnings: 1, failed: 1 },
      { name: '性能指标', score: 78, status: 'warning', checks: 32, passed: 28, warnings: 4, failed: 0 },
      { name: '存储容量', score: 75, status: 'warning', checks: 20, passed: 16, warnings: 3, failed: 1 },
      { name: '网络健康', score: 72, status: 'failed', checks: 32, passed: 28, warnings: 2, failed: 2 },
      { name: '配置一致性', score: 94, status: 'passed', checks: 24, passed: 24, warnings: 0, failed: 0 },
      { name: '日志异常', score: 80, status: 'warning', checks: 16, passed: 14, warnings: 2, failed: 0 },
    ],
  },
  {
    id: 'rpt-005',
    name: 'cluster-hpc-prod-01_2025-01-11_20:00',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'scheduled',
    healthScore: 89,
    checksPassed: 154,
    checksFailed: 0,
    checksWarned: 2,
    duration: '3分05秒',
    createdAt: '2025-01-11 20:00:00',
    findings: sampleFindings.slice(0, 2),
    categoryScores: [
      { name: '集群状态', score: 97, status: 'passed', checks: 48, passed: 47, warnings: 1, failed: 0 },
      { name: '性能指标', score: 90, status: 'passed', checks: 32, passed: 30, warnings: 2, failed: 0 },
      { name: '存储容量', score: 82, status: 'warning', checks: 20, passed: 17, warnings: 3, failed: 0 },
      { name: '网络健康', score: 90, status: 'passed', checks: 32, passed: 30, warnings: 1, failed: 1 },
      { name: '配置一致性', score: 95, status: 'passed', checks: 24, passed: 23, warnings: 1, failed: 0 },
      { name: '日志异常', score: 88, status: 'passed', checks: 16, passed: 14, warnings: 2, failed: 0 },
    ],
  },
  {
    id: 'rpt-006',
    name: 'cluster-hpc-prod-01_2025-01-10_10:30',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'manual',
    healthScore: 91,
    checksPassed: 155,
    checksFailed: 0,
    checksWarned: 1,
    duration: '2分58秒',
    createdAt: '2025-01-10 10:30:45',
    findings: [
      {
        id: 'f-9',
        category: '存储容量',
        severity: 'warning',
        title: 'OSS-7 磁盘使用率 82.1%',
        description: '磁盘使用率持续上升',
        affectedNodes: ['OSS-7'],
        recommendation: '监控容量增长',
      },
    ],
    categoryScores: [
      { name: '集群状态', score: 99, status: 'passed', checks: 48, passed: 48, warnings: 0, failed: 0 },
      { name: '性能指标', score: 93, status: 'passed', checks: 32, passed: 31, warnings: 1, failed: 0 },
      { name: '存储容量', score: 88, status: 'passed', checks: 20, passed: 18, warnings: 2, failed: 0 },
      { name: '网络健康', score: 95, status: 'passed', checks: 32, passed: 31, warnings: 1, failed: 0 },
      { name: '配置一致性', score: 97, status: 'passed', checks: 24, passed: 24, warnings: 0, failed: 0 },
      { name: '日志异常', score: 90, status: 'passed', checks: 16, passed: 15, warnings: 1, failed: 0 },
    ],
  },
  {
    id: 'rpt-007',
    name: 'cluster-hpc-prod-01_2025-01-09_16:15',
    cluster: 'cluster-hpc-prod-01',
    triggerType: 'scheduled',
    healthScore: 93,
    checksPassed: 156,
    checksFailed: 0,
    checksWarned: 0,
    duration: '2分40秒',
    createdAt: '2025-01-09 16:15:22',
    findings: [],
    categoryScores: [
      { name: '集群状态', score: 100, status: 'passed', checks: 48, passed: 48, warnings: 0, failed: 0 },
      { name: '性能指标', score: 96, status: 'passed', checks: 32, passed: 32, warnings: 0, failed: 0 },
      { name: '存储容量', score: 90, status: 'passed', checks: 20, passed: 19, warnings: 1, failed: 0 },
      { name: '网络健康', score: 98, status: 'passed', checks: 32, passed: 32, warnings: 0, failed: 0 },
      { name: '配置一致性', score: 98, status: 'passed', checks: 24, passed: 24, warnings: 0, failed: 0 },
      { name: '日志异常', score: 94, status: 'passed', checks: 16, passed: 16, warnings: 0, failed: 0 },
    ],
  },
];

export const reportTrendData = [
  { date: '01-09', overall: 93, storage: 90, network: 98, performance: 96 },
  { date: '01-10', overall: 91, storage: 88, network: 95, performance: 93 },
  { date: '01-11', overall: 89, storage: 82, network: 90, performance: 90 },
  { date: '01-12', overall: 76, storage: 75, network: 72, performance: 78 },
  { date: '01-13', overall: 94, storage: 85, network: 98, performance: 96 },
  { date: '01-14', overall: 92, storage: 88, network: 85, performance: 94 },
  { date: '01-15', overall: 87, storage: 78, network: 92, performance: 85 },
];
