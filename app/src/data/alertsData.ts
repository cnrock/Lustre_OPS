export interface AlertHistoryItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  category: 'storage' | 'network' | 'performance' | 'node';
  node: string;
  triggeredAt: string;
  resolvedAt: string;
  resolutionTime: string;
  resolvedBy: string;
  status: 'resolved' | 'acknowledged' | 'open';
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: string;
  severity: 'critical' | 'warning' | 'info';
  channels: string[];
  enabled: boolean;
  interval: string;
  duration: string;
  tags: string[];
}

export interface NotificationChannel {
  type: 'email' | 'feishu';
  enabled: boolean;
  config: Record<string, string>;
}

export interface AlertStat {
  label: string;
  value: string;
  subLabel: string;
  color: string;
  icon: string;
}

export const alertHistory: AlertHistoryItem[] = [
  {
    id: 'ah-001',
    severity: 'critical',
    title: 'Client-23 连接中断',
    description: '客户端节点 Client-23 与 MGS 连接中断超过5分钟',
    category: 'network',
    node: 'Client-23',
    triggeredAt: '2024-01-15 14:10:00',
    resolvedAt: '—',
    resolutionTime: '—',
    resolvedBy: '—',
    status: 'open',
  },
  {
    id: 'ah-002',
    severity: 'warning',
    title: 'OSS-7 磁盘利用率超过85%',
    description: '对象存储服务器 OSS-7 磁盘空间即将耗尽，当前87.3%',
    category: 'storage',
    node: 'OSS-7',
    triggeredAt: '2024-01-15 14:02:00',
    resolvedAt: '—',
    resolutionTime: '—',
    resolvedBy: '—',
    status: 'open',
  },
  {
    id: 'ah-003',
    severity: 'warning',
    title: 'MDS-2 写入延迟异常升高',
    description: '元数据服务器 MDS-2 写入延迟超过阈值 10ms，当前 12.3ms',
    category: 'performance',
    node: 'MDS-2',
    triggeredAt: '2024-01-15 14:05:00',
    resolvedAt: '—',
    resolutionTime: '—',
    resolvedBy: '—',
    status: 'open',
  },
  {
    id: 'ah-004',
    severity: 'info',
    title: '集群自动备份完成',
    description: '每日自动备份任务已成功完成，耗时 23分钟',
    category: 'storage',
    node: 'MGS',
    triggeredAt: '2024-01-15 13:00:00',
    resolvedAt: '2024-01-15 13:23:00',
    resolutionTime: '23分钟',
    resolvedBy: 'system',
    status: 'resolved',
  },
  {
    id: 'ah-005',
    severity: 'warning',
    title: 'OSS-3 IB链路降级',
    description: 'OSS-3 InfiniBand链路出现丢包，已自动切换至备用路径',
    category: 'network',
    node: 'OSS-3',
    triggeredAt: '2024-01-15 13:55:00',
    resolvedAt: '2024-01-15 13:58:00',
    resolutionTime: '3分钟',
    resolvedBy: 'auto',
    status: 'resolved',
  },
  {
    id: 'ah-006',
    severity: 'critical',
    title: 'MDS-1 元数据服务中断',
    description: 'MDS-1 元数据服务进程异常退出，已自动重启',
    category: 'node',
    node: 'MDS-1',
    triggeredAt: '2024-01-15 12:30:00',
    resolvedAt: '2024-01-15 12:32:00',
    resolutionTime: '2分钟',
    resolvedBy: 'auto',
    status: 'resolved',
  },
  {
    id: 'ah-007',
    severity: 'info',
    title: 'Client-10 登录成功',
    description: '客户端节点 Client-10 成功挂载文件系统',
    category: 'node',
    node: 'Client-10',
    triggeredAt: '2024-01-15 12:15:00',
    resolvedAt: '2024-01-15 12:15:00',
    resolutionTime: '即时',
    resolvedBy: 'system',
    status: 'resolved',
  },
  {
    id: 'ah-008',
    severity: 'warning',
    title: '网络拥塞告警',
    description: 'sw-ib-01 交换机端口利用率超过85%',
    category: 'network',
    node: 'sw-ib-01',
    triggeredAt: '2024-01-15 11:45:00',
    resolvedAt: '2024-01-15 12:00:00',
    resolutionTime: '15分钟',
    resolvedBy: 'admin',
    status: 'resolved',
  },
];

export const alertRules: AlertRule[] = [
  {
    id: 'rule-1',
    name: 'OST容量超过85%',
    metric: 'ost.used_percent',
    condition: '>',
    threshold: '85',
    severity: 'warning',
    channels: ['邮件', '飞书'],
    enabled: true,
    interval: '每1分钟',
    duration: '持续5分钟',
    tags: ['storage', 'capacity'],
  },
  {
    id: 'rule-2',
    name: '节点连接中断',
    metric: 'node.status',
    condition: '==',
    threshold: 'offline',
    severity: 'critical',
    channels: ['邮件', '飞书', '电话'],
    enabled: true,
    interval: '每30秒',
    duration: '持续1分钟',
    tags: ['node', 'connectivity'],
  },
  {
    id: 'rule-3',
    name: '写入延迟异常',
    metric: 'write_latency.p99',
    condition: '>',
    threshold: '10',
    severity: 'warning',
    channels: ['飞书'],
    enabled: true,
    interval: '每1分钟',
    duration: '持续3分钟',
    tags: ['performance', 'latency'],
  },
  {
    id: 'rule-4',
    name: '网络丢包率',
    metric: 'network.drop_rate',
    condition: '>',
    threshold: '1',
    severity: 'warning',
    channels: ['飞书'],
    enabled: true,
    interval: '每30秒',
    duration: '持续2分钟',
    tags: ['network', 'packet-loss'],
  },
  {
    id: 'rule-5',
    name: '磁盘I/O错误率',
    metric: 'disk.io_error_rate',
    condition: '>',
    threshold: '0.1',
    severity: 'critical',
    channels: ['邮件', '飞书'],
    enabled: false,
    interval: '每1分钟',
    duration: '持续1分钟',
    tags: ['storage', 'disk', 'io'],
  },
  {
    id: 'rule-6',
    name: 'CPU使用率过高',
    metric: 'cpu.usage_percent',
    condition: '>',
    threshold: '95',
    severity: 'warning',
    channels: ['飞书'],
    enabled: true,
    interval: '每1分钟',
    duration: '持续5分钟',
    tags: ['performance', 'cpu'],
  },
];

export const alertVolumeData = [
  { day: '周一', critical: 2, warning: 8, info: 12 },
  { day: '周二', critical: 1, warning: 5, info: 15 },
  { day: '周三', critical: 3, warning: 10, info: 8 },
  { day: '周四', critical: 0, warning: 4, info: 10 },
  { day: '周五', critical: 1, warning: 6, info: 14 },
  { day: '周六', critical: 0, warning: 2, info: 6 },
  { day: '周日', critical: 1, warning: 3, info: 9 },
];

export const defaultEmailConfig = {
  smtpServer: 'smtp.example.com',
  port: '587',
  sender: 'alerts@lustreops.local',
  username: 'alerts@lustreops.local',
  password: '',
  tls: true,
};

export const defaultFeishuConfig = {
  webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
  secret: '',
  atUsers: '@admin',
};
