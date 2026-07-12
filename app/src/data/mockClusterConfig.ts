import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export interface ClusterNode {
  id: string;
  name: string;
  role: 'mgs' | 'mds' | 'oss' | 'client';
  ip: string;
  status: 'online' | 'offline' | 'degraded';
  uptime: string;
  lustreVersion: string;
  kernelVersion: string;
  nid: string;
  lastHeartbeat: string;
  services: NodeService[];
  parameters: NodeParameter[];
}

export interface NodeService {
  name: string;
  status: 'running' | 'stopped' | 'error';
  pid: number | null;
  startTime: string;
  params?: Record<string, string>;
}

export interface NodeParameter {
  name: string;
  currentValue: string;
  defaultValue: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  modified: boolean;
  lastModified?: string;
  modifiedBy?: string;
  type: 'number' | 'string' | 'boolean' | 'enum';
  allowedRange?: string;
}

export interface FileSystemConfig {
  id: string;
  name: string;
  mountPoint: string;
  nodeCount: number;
  isDefault: boolean;
  stripeCount: number;
  stripeSize: number;
  checksum: string;
  parameters: FileSystemParameter[];
}

export interface FileSystemParameter {
  id: string;
  name: string;
  currentValue: string;
  defaultValue: string;
  type: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  lastModified?: string;
  modifiedBy?: string;
  modified: boolean;
}

export interface ConfigHistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  parameterName: string;
  oldValue: string;
  newValue: string;
  nodeName?: string;
  fileSystemName?: string;
}

export interface ConfigDiffEntry {
  parameter: string;
  nodeAValue: string;
  nodeBValue: string;
  status: 'added' | 'removed' | 'modified' | 'same';
}

// Example all-in-one node used when a live cluster inventory is unavailable.
export const clusterNodes: ClusterNode[] = [
  {
    id: 'node-1',
    name: 'lustre-node-01',
    role: 'mgs',
    ip: '10.0.0.11',
    status: 'online',
    uptime: '-',
    lustreVersion: '2.15.4',
    kernelVersion: '4.18.0-513.5.1.el8_9.x86_64',
    nid: '10.0.0.11@tcp',
    lastHeartbeat: '在线',
    services: [
      { name: 'mgs', status: 'running', pid: null, startTime: '-' },
      { name: 'mds', status: 'running', pid: null, startTime: '-' },
      { name: 'ost-0', status: 'running', pid: null, startTime: '-' },
      { name: 'ost-1', status: 'running', pid: null, startTime: '-' },
      { name: 'ost-2', status: 'running', pid: null, startTime: '-' },
      { name: 'llite', status: 'running', pid: null, startTime: '-' },
    ],
    parameters: [
      { name: 'osc_max_dirty_mb', currentValue: '1969', defaultValue: '1969', description: 'OSC最大脏数据缓存（MB）', impact: 'high', modified: false, type: 'number', allowedRange: '1-8192' },
      { name: 'llite_max_read_ahead_mb', currentValue: '492', defaultValue: '492', description: '客户端预读大小（MB）', impact: 'medium', modified: false, type: 'number', allowedRange: '16-4096' },
      { name: 'max_rpcs_in_flight', currentValue: '8', defaultValue: '8', description: '最大并发RPC请求数', impact: 'high', modified: false, type: 'number', allowedRange: '1-64' },
      { name: 'max_mod_rpcs', currentValue: '8', defaultValue: '8', description: '最大并发修改RPC请求数', impact: 'medium', modified: false, type: 'number', allowedRange: '1-64' },
      { name: 'max_easize', currentValue: '65536', defaultValue: '65536', description: '最大扩展属性大小（字节）', impact: 'low', modified: false, type: 'number', allowedRange: '1024-262144' },
    ],
  },
];

export const fileSystems: FileSystemConfig[] = [
  {
    id: 'fs-1',
    name: 'lustrefs',
    mountPoint: '/lustre/client',
    nodeCount: 1,
    isDefault: true,
    stripeCount: 1,
    stripeSize: 1048576,
    checksum: 'crc32c',
    parameters: [
      { id: 'p1', name: 'stripe_count', currentValue: '1', defaultValue: '1', type: 'number', description: '文件系统默认分条数', impact: 'high', category: '存储参数', modified: false },
      { id: 'p2', name: 'stripe_size', currentValue: '1048576', defaultValue: '1048576', type: 'number', description: '文件系统默认分条大小（字节）', impact: 'high', category: '存储参数', modified: false },
      { id: 'p3', name: 'checksum_type', currentValue: 'crc32c', defaultValue: 'crc32c', type: 'enum', description: '数据校验算法类型', impact: 'medium', category: '存储参数', modified: false },
      { id: 'p4', name: 'max_brw_size', currentValue: '1048576', defaultValue: '1048576', type: 'number', description: '最大批量读写大小（字节）', impact: 'medium', category: '网络参数', modified: false },
      { id: 'p5', name: 'network_timeout', currentValue: '50', defaultValue: '50', type: 'number', description: '网络连接超时时间（秒）', impact: 'high', category: '网络参数', modified: false },
      { id: 'p6', name: 'osc_max_dirty_mb', currentValue: '1969', defaultValue: '1969', type: 'number', description: '客户端最大脏数据缓存（MB）', impact: 'medium', category: '性能参数', modified: false },
      { id: 'p7', name: 'llite_max_read_ahead_mb', currentValue: '492', defaultValue: '492', type: 'number', description: '客户端预读大小（MB）', impact: 'medium', category: '性能参数', modified: false },
      { id: 'p8', name: 'max_rpcs_in_flight', currentValue: '8', defaultValue: '8', type: 'number', description: '最大并发RPC请求数', impact: 'high', category: '性能参数', modified: false },
      { id: 'p9', name: 'max_mod_rpcs', currentValue: '8', defaultValue: '8', type: 'number', description: '最大并发修改RPC请求数', impact: 'medium', category: '性能参数', modified: false },
      { id: 'p10', name: 'max_easize', currentValue: '65536', defaultValue: '65536', type: 'number', description: '最大扩展属性大小（字节）', impact: 'low', category: '存储参数', modified: false },
      { id: 'p11', name: 'recovery_time_hard', currentValue: '3600', defaultValue: '3600', type: 'number', description: '硬恢复超时时间（秒）', impact: 'high', category: '恢复参数', modified: false },
      { id: 'p12', name: 'recovery_time_soft', currentValue: '900', defaultValue: '900', type: 'number', description: '软恢复超时时间（秒）', impact: 'medium', category: '恢复参数', modified: false },
      { id: 'p13', name: 'max_filesize', currentValue: '16EB', defaultValue: '16EB', type: 'string', description: '最大文件大小限制', impact: 'low', category: '存储参数', modified: false },
      { id: 'p14', name: 'debug_mask', currentValue: '0x0', defaultValue: '0x0', type: 'string', description: '调试掩码', impact: 'low', category: '调试参数', modified: false },
      { id: 'p15', name: 'conn_keepalive', currentValue: '15', defaultValue: '15', type: 'number', description: '连接保活时间间隔（秒）', impact: 'medium', category: '网络参数', modified: false },
    ],
  },
];

const now = new Date();

export const configHistory: ConfigHistoryEntry[] = [
  { id: 'h1', timestamp: format(now, 'yyyy-MM-dd HH:mm:ss', { locale: zhCN }), user: 'system', parameterName: 'filesystem_created', oldValue: '-', newValue: 'lustrefs on /lustre/client', fileSystemName: 'lustrefs' },
];

export const parameterCategories = [
  { id: 'network', name: '网络参数', count: 3 },
  { id: 'storage', name: '存储参数', count: 5 },
  { id: 'performance', name: '性能参数', count: 4 },
  { id: 'recovery', name: '恢复参数', count: 2 },
  { id: 'debug', name: '调试参数', count: 1 },
];
