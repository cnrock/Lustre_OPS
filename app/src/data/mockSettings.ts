import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'engineer' | 'readonly';
  permissions: string[];
  lastLogin: string;
  status: 'active' | 'inactive';
  avatar?: string;
}

export interface EmailConfig {
  enabled: boolean;
  smtpServer: string;
  port: number;
  sender: string;
  username: string;
  password: string;
  tls: boolean;
}

export interface FeishuConfig {
  enabled: boolean;
  webhookUrl: string;
  secret: string;
  atUsers: string;
  messageTemplate: string;
}

export interface ApiConfig {
  apiKey: string;
  ipWhitelist: string;
  rateLimit: string;
  accessLog: ApiAccessEntry[];
}

export interface ApiAccessEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  ip: string;
  status: number;
}

export interface WebhookConfig {
  inboundUrl: string;
  events: Record<string, boolean>;
  customHeaders: Record<string, string>;
}

export interface DataRetention {
  metricsDays: number;
  logDays: number;
  reportDays: number;
  sampleInterval: string;
  aggregationPolicy: string;
  autoRotate: boolean;
  storageType: 'local' | 's3';
  s3Config?: {
    bucket: string;
    endpoint: string;
    accessKey: string;
    secretKey: string;
  };
}

export interface DisplayPreferences {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  density: 'compact' | 'comfortable';
  animations: 'enabled' | 'reduced' | 'disabled';
  language: string;
  dateFormat: string;
  timeFormat: '24h' | '12h';
  timezone: string;
  defaultPage: string;
  autoRefresh: string;
  tablePageSize: number;
  chartTimeRange: string;
  defaultCards: string[];
  defaultTopologyLayout: string;
  autoRealTime: boolean;
}

export interface AdvancedSettings {
  maxConnections: number;
  queryTimeout: number;
  cacheEnabled: boolean;
  debugMode: boolean;
  logLevel: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  pprofEnabled: boolean;
  autoBackup: 'daily' | 'weekly' | 'disabled';
  backupRetention: number;
  autoCheckUpdate: boolean;
  currentVersion: string;
}

const now = new Date();

export const users: User[] = [
  {
    id: 'u1',
    name: 'admin',
    email: 'admin@lustreops.local',
    role: 'admin',
    permissions: ['全部权限'],
    lastLogin: format(now, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
    status: 'active',
  },
  {
    id: 'u2',
    name: 'zhangsan',
    email: 'zhangsan@lustreops.local',
    role: 'engineer',
    permissions: ['监控查看', '告警管理', '日志分析', '健康检查', '报告查看'],
    lastLogin: format(new Date(now.getTime() - 3600000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
    status: 'active',
  },
  {
    id: 'u3',
    name: 'lisi',
    email: 'lisi@lustreops.local',
    role: 'readonly',
    permissions: ['查看所有页面'],
    lastLogin: format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }),
    status: 'active',
  },
];

export const emailConfig: EmailConfig = {
  enabled: true,
  smtpServer: 'smtp.lustreops.local',
  port: 587,
  sender: 'noreply@lustreops.local',
  username: 'lustreops-mail',
  password: '****************',
  tls: true,
};

export const feishuConfig: FeishuConfig = {
  enabled: true,
  webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx',
  secret: 'xxxxxxxxxxxxxxxx',
  atUsers: 'user1,user2',
  messageTemplate: '【LustreOps告警】\n告警级别: {{severity}}\n告警标题: {{title}}\n节点: {{node}}\n时间: {{timestamp}}',
};

export const apiConfig: ApiConfig = {
  apiKey: 'ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  ipWhitelist: '192.168.0.0/16,10.0.0.0/8',
  rateLimit: '1000 请求/小时',
  accessLog: [
    { id: 'al1', timestamp: format(now, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), endpoint: '/api/v1/cluster/status', method: 'GET', ip: '192.168.1.100', status: 200 },
    { id: 'al2', timestamp: format(new Date(now.getTime() - 300000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), endpoint: '/api/v1/alerts', method: 'GET', ip: '192.168.1.100', status: 200 },
    { id: 'al3', timestamp: format(new Date(now.getTime() - 600000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), endpoint: '/api/v1/metrics', method: 'GET', ip: '192.168.1.101', status: 200 },
    { id: 'al4', timestamp: format(new Date(now.getTime() - 900000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), endpoint: '/api/v1/nodes', method: 'GET', ip: '192.168.1.102', status: 200 },
    { id: 'al5', timestamp: format(new Date(now.getTime() - 1200000), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), endpoint: '/api/v1/health', method: 'POST', ip: '192.168.1.103', status: 201 },
  ],
};

export const webhookConfig: WebhookConfig = {
  inboundUrl: 'https://lustreops.local/api/webhook/inbound/wh_xxxxxxxx',
  events: {
    alertTriggered: true,
    alertAcknowledged: true,
    alertResolved: false,
    checkCompleted: true,
    nodeStatusChanged: false,
  },
  customHeaders: {
    'X-Custom-Auth': 'bearer-token',
  },
};

export const dataRetention: DataRetention = {
  metricsDays: 30,
  logDays: 30,
  reportDays: 90,
  sampleInterval: '5秒',
  aggregationPolicy: '原始数据保留7天，之后按小时聚合',
  autoRotate: true,
  storageType: 'local',
};

export const displayPreferences: DisplayPreferences = {
  theme: 'dark',
  accentColor: '#0EA5E9',
  density: 'comfortable',
  animations: 'enabled',
  language: 'zh-CN',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
  timezone: 'Asia/Shanghai',
  defaultPage: 'dashboard',
  autoRefresh: '5秒',
  tablePageSize: 20,
  chartTimeRange: '15分钟',
  defaultCards: ['readBandwidth', 'writeBandwidth', 'readIops', 'capacity'],
  defaultTopologyLayout: '层次',
  autoRealTime: true,
};

export const advancedSettings: AdvancedSettings = {
  maxConnections: 100,
  queryTimeout: 30,
  cacheEnabled: true,
  debugMode: false,
  logLevel: 'INFO',
  pprofEnabled: false,
  autoBackup: 'daily',
  backupRetention: 7,
  autoCheckUpdate: true,
  currentVersion: 'v2.15.4-20241201',
};
