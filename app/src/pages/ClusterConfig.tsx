import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from '../theme-context';
import {
  Download,
  Save,
  Clock,
  Search,
  Server,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  X,
  Check,
  RotateCcw,
  History,
  ArrowLeftRight,
  GitCompare,
  FileText,
  AlertTriangle,
  MoreHorizontal,
  HardDrive,
  Settings2,
  BarChart3,
  Terminal,
  RefreshCw,
  Ban,
} from 'lucide-react';
import {
  configHistory,
  parameterCategories,
  type ClusterNode,
  type FileSystemParameter,
  type ConfigDiffEntry,
} from '@/data/mockClusterConfig';
import { useLiveClusterNodes, useLiveFileSystems } from '@/lib/clusterMap';
import toast from 'react-hot-toast';

const tabs = [
  { id: 'topology', label: '拓扑结构' },
  { id: 'filesystem', label: '文件系统参数' },
  { id: 'nodes', label: '节点配置' },
  { id: 'tuning', label: '调优参数' },
  { id: 'diff', label: '配置对比' },
];

/* ------------------------------------------------------------------ */
/*  Page Header                                                        */
/* ------------------------------------------------------------------ */
function PageHeader({ unsavedCount, onExport, onSave, onHistory }: {
  unsavedCount: number;
  onExport: () => void;
  onSave: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
        <span>集群管理</span>
        <ChevronRightIcon className="h-4 w-4" />
        <span className="text-slate-900 dark:text-[#F1F5F9]">集群配置</span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">集群配置管理</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">
            查看和修改 Lustre 集群配置参数 · 共 1 个节点 · 1 个文件系统
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onExport}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-all hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
          >
            <Download className="h-4 w-4" />
            导出配置
          </button>
          <button
            onClick={onSave}
            disabled={unsavedCount === 0}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              unsavedCount > 0
                ? 'bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white shadow-lg shadow-[#0EA5E9]/20 hover:shadow-[#0EA5E9]/30 hover:scale-[1.02]'
                : 'cursor-not-allowed bg-white dark:bg-[#1E293B] text-slate-500 dark:text-[#64748B]'
            )}
          >
            <Save className="h-4 w-4" />
            保存修改
            {unsavedCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {unsavedCount} 项
              </span>
            )}
          </button>
          <button
            onClick={onHistory}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-all hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
          >
            <Clock className="h-4 w-4" />
            配置历史
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Topology Visualization (SVG-based)                                 */
/* ------------------------------------------------------------------ */
function TopologyDiagram({ selectedNode, onSelectNode }: {
  selectedNode: ClusterNode | null;
  onSelectNode: (node: ClusterNode | null) => void;
}) {
  const clusterNodes = useLiveClusterNodes();
  const { darkMode } = useTheme();
  const mgsNode = clusterNodes.find(n => n.role === 'mgs') || clusterNodes[0] || null;
  const mdsNodes = clusterNodes.filter(n => n.role === 'mds');
  const ossNodes = clusterNodes.filter(n => n.role === 'oss');
  const clientNodes = clusterNodes.filter(n => n.role === 'client');
  const [layout, setLayout] = useState<'hierarchical' | 'circular' | 'force'>('hierarchical');
  const [scale, setScale] = useState(1);

  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    if (layout === 'hierarchical') {
      if (mgsNode) pos.set(mgsNode.id, { x: 300, y: 140 });
      mdsNodes.forEach((n, i) => pos.set(n.id, { x: 150 + i * 300, y: 280 }));
      ossNodes.forEach((n, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        pos.set(n.id, { x: 60 + col * 100, y: 400 + row * 100 });
      });
      clientNodes.forEach((n, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        pos.set(n.id, { x: 40 + col * 70, y: 30 + row * 30 });
      });
    } else if (layout === 'circular') {
      const center = { x: 300, y: 300 };
      const all = [mgsNode, ...mdsNodes, ...ossNodes, ...clientNodes];
      all.forEach((n, i) => {
        const radius = n.role === 'mgs' ? 0 : n.role === 'mds' ? 120 : n.role === 'oss' ? 220 : 280;
        const angle = (i / all.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
      });
    }
    return pos;
  }, [layout, clientNodes, mdsNodes, mgsNode, ossNodes]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'degraded': return '#F59E0B';
      case 'offline': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <div className="relative h-[500px] rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-4">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] p-1">
          {(['hierarchical', 'circular', 'force'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                layout === l ? 'bg-[#0EA5E9]/20 text-[#0EA5E9]' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-600 dark:text-[#94A3B8]'
              )}
            >
              {l === 'hierarchical' ? '层次' : l === 'circular' ? '环形' : '力导向'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] p-1">
          <button
            type="button"
            aria-label="放大拓扑图"
            title="放大拓扑图"
            onClick={() => setScale(s => Math.min(s + 0.2, 2))}
            className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:text-slate-900 dark:text-[#F1F5F9]"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="缩小拓扑图"
            title="缩小拓扑图"
            onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}
            className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:text-slate-900 dark:text-[#F1F5F9]"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="重置拓扑图缩放"
            title="重置拓扑图缩放"
            onClick={() => setScale(1)}
            className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:text-slate-900 dark:text-[#F1F5F9]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <svg
        viewBox="0 0 640 600"
        className="h-full w-full"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center', transition: 'transform 0.3s ease' }}
      >
        {/* Connection lines */}
        <g strokeWidth="1.5" opacity="0.4">
          {/* Clients → MGS (dotted management) */}
          {clientNodes.slice(0, 8).map(c => (
            <line key={`${c.id}-mgs`} x1={nodePositions.get(c.id)?.x ?? 0} y1={nodePositions.get(c.id)?.y ?? 0}
              x2={nodePositions.get(mgsNode.id)?.x ?? 0} y2={nodePositions.get(mgsNode.id)?.y ?? 0}
              stroke="#0EA5E9" strokeDasharray="4 4" />
          ))}
          {/* Clients → MDS (solid metadata) */}
          {clientNodes.slice(0, 6).map(c => (
            mdsNodes.map(m => (
              <line key={`${c.id}-${m.id}`} x1={nodePositions.get(c.id)?.x ?? 0} y1={nodePositions.get(c.id)?.y ?? 0}
                x2={nodePositions.get(m.id)?.x ?? 0} y2={nodePositions.get(m.id)?.y ?? 0}
                stroke="#6366F1" />
            ))
          ))}
          {/* MDS → OSS (solid data) */}
          {mdsNodes.map(m => (
            ossNodes.slice(0, 6).map(o => (
              <line key={`${m.id}-${o.id}`} x1={nodePositions.get(m.id)?.x ?? 0} y1={nodePositions.get(m.id)?.y ?? 0}
                x2={nodePositions.get(o.id)?.x ?? 0} y2={nodePositions.get(o.id)?.y ?? 0}
                stroke="#06B6D4" />
            ))
          ))}
          {/* MGS → MDS */}
          {mdsNodes.map(m => (
            <line key={`mgs-${m.id}`} x1={nodePositions.get(mgsNode.id)?.x ?? 0} y1={nodePositions.get(mgsNode.id)?.y ?? 0}
              x2={nodePositions.get(m.id)?.x ?? 0} y2={nodePositions.get(m.id)?.y ?? 0}
              stroke="#10B981" />
          ))}
        </g>

        {/* Client group indicator */}
        <g>
          <rect x="20" y="10" width="600" height="85" rx="8" fill="rgba(14,165,233,0.06)" stroke="#0EA5E9" strokeOpacity="0.2" strokeDasharray="6 3" />
          <text x="30" y="30" className="fill-[#0EA5E9]" fontSize="12" fontWeight="600">客户端 (Client) — {clientNodes.length} 节点</text>
        </g>

        {/* Nodes */}
        {[mgsNode, ...mdsNodes, ...ossNodes].map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const isSelected = selectedNode?.id === node.id;
          const color = statusColor(node.status);
          const roleColor =
            node.role === 'mgs' ? '#10B981' :
            node.role === 'mds' ? '#8B5CF6' :
            node.role === 'oss' ? '#06B6D4' : '#0EA5E9';

          return (
            <g key={node.id} onClick={() => onSelectNode(node)} style={{ cursor: 'pointer' }}>
              {isSelected && (
                <circle cx={pos.x} cy={pos.y} r={node.role === 'mgs' ? 32 : node.role === 'mds' ? 26 : 22}
                  fill="none" stroke="#0EA5E9" strokeWidth="2" opacity="0.8">
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Shape */}
              {node.role === 'mgs' ? (
                <polygon points={`${pos.x},${pos.y - 24} ${pos.x + 24},${pos.y} ${pos.x},${pos.y + 24} ${pos.x - 24},${pos.y}`}
                  fill={roleColor} opacity="0.2" stroke={color} strokeWidth="2" rx="4" />
              ) : node.role === 'mds' ? (
                <rect x={pos.x - 22} y={pos.y - 22} width="44" height="44" rx="6"
                  fill={roleColor} opacity="0.15" stroke={color} strokeWidth="2" />
              ) : (
                <rect x={pos.x - 20} y={pos.y - 16} width="40" height="32" rx="4"
                  fill={roleColor} opacity="0.15" stroke={color} strokeWidth="2" />
              )}
              {/* Status dot */}
              <circle cx={pos.x + (node.role === 'mgs' ? 16 : node.role === 'mds' ? 14 : 12)}
                cy={pos.y - (node.role === 'mgs' ? 16 : node.role === 'mds' ? 14 : 10)} r="4" fill={color}>
                {node.status === 'online' && <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />}
              </circle>
              {/* Label */}
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" className={darkMode ? "fill-[#F1F5F9]" : "fill-slate-900"} fontSize="10" fontWeight="600">{node.name}</text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(480, 540)">
          <rect x="0" y="0" width="150" height="55" rx="6" className={darkMode ? "fill-[#111827]/90 stroke-[#1E293B]" : "fill-white/90 stroke-slate-200"} />
          {[
            { label: 'MGS', color: '#10B981', shape: 'diamond' },
            { label: 'MDS', color: '#8B5CF6', shape: 'square' },
            { label: 'OSS', color: '#06B6D4', shape: 'rect' },
          ].map((item, i) => (
            <g key={item.label} transform={`translate(10, ${14 + i * 16})`}>
              <rect x="0" y="-4" width="8" height="8" rx="2" fill={item.color} opacity="0.5" />
              <text x="14" y="2" className={darkMode ? "fill-[#94A3B8]" : "fill-slate-600"} fontSize="10">{item.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node Detail Panel                                                  */
/* ------------------------------------------------------------------ */
function NodeDetailPanel({ node }: { node: ClusterNode | null }) {
  if (!node) {
    return (
      <div className="flex h-[500px] flex-col items-center justify-center rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-6 text-center">
        <Server className="mb-3 h-12 w-12 text-[#1E293B]" />
        <p className="text-sm text-slate-500 dark:text-[#64748B]">选择一个节点查看详细配置</p>
        <div className="mt-6 grid grid-cols-2 gap-4 text-center">
          <div className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-3">
            <p className="text-2xl font-bold text-slate-900 dark:text-[#F1F5F9]">1</p>
            <p className="text-xs text-slate-500 dark:text-[#64748B]">总节点数</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-3">
            <p className="text-2xl font-bold text-[#0EA5E9]">2.15.4</p>
            <p className="text-xs text-slate-500 dark:text-[#64748B]">Lustre 版本</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-3">
            <p className="text-2xl font-bold text-[#10B981]">1</p>
            <p className="text-xs text-slate-500 dark:text-[#64748B]">在线节点</p>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-3">
            <p className="text-2xl font-bold text-[#EF4444]">0</p>
            <p className="text-xs text-slate-500 dark:text-[#64748B]">离线节点</p>
          </div>
        </div>
      </div>
    );
  }

  const statusColor = node.status === 'online' ? 'text-[#10B981]' : node.status === 'degraded' ? 'text-[#F59E0B]' : 'text-[#EF4444]';
  const statusBg = node.status === 'online' ? 'bg-[#10B981]/10' : node.status === 'degraded' ? 'bg-[#F59E0B]/10' : 'bg-[#EF4444]/10';
  const roleColor = node.role === 'mgs' ? '#10B981' : node.role === 'mds' ? '#8B5CF6' : node.role === 'oss' ? '#06B6D4' : '#0EA5E9';
  const roleLabel = node.role === 'mgs' ? 'MGS' : node.role === 'mds' ? 'MDS' : node.role === 'oss' ? 'OSS' : 'Client';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      className="h-[500px] overflow-y-auto rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-5"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${roleColor}20` }}>
          <Server className="h-5 w-5" style={{ color: roleColor }} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">{node.name}</h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${roleColor}20`, color: roleColor }}>{roleLabel}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusBg, statusColor)}>
              {node.status === 'online' ? '在线' : node.status === 'degraded' ? '降级' : '离线'}
            </span>
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        {[
          { label: '主机名', value: node.name },
          { label: 'IP 地址', value: node.ip },
          { label: 'Lustre 版本', value: node.lustreVersion },
          { label: '内核版本', value: node.kernelVersion },
          { label: '运行时间', value: node.uptime },
          { label: '最后心跳', value: node.lastHeartbeat },
          { label: 'NID', value: node.nid },
          { label: '状态', value: node.status },
        ].map(item => (
          <div key={item.label} className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-2.5">
            <p className="text-xs text-slate-500 dark:text-[#64748B]">{item.label}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-900 dark:text-[#F1F5F9]">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Services */}
      <div className="mb-4">
        <h4 className="mb-2 text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">服务状态</h4>
        <div className="space-y-1.5">
          {node.services.map(service => (
            <div key={service.name} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', service.status === 'running' ? 'bg-[#10B981]' : service.status === 'error' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]')} />
                <span className="text-sm text-slate-900 dark:text-[#F1F5F9]">{service.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-[#64748B]">
                <span>PID: {service.pid ?? 'N/A'}</span>
                <span>{service.startTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => toast(`节点 ${node.name} 重启操作待接入真实控制接口`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
          <RefreshCw className="h-3 w-3" /> 重启节点
        </button>
        <button onClick={() => toast(`节点 ${node.name} 隔离功能待接入真实控制接口`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
          <Ban className="h-3 w-3" /> 隔离节点
        </button>
        <button onClick={() => toast(`节点 ${node.name} 实时日志查看待接入`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
          <Terminal className="h-3 w-3" /> 查看实时日志
        </button>
        <button onClick={() => toast(`节点 ${node.name} 性能详情待接入`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
          <BarChart3 className="h-3 w-3" /> 查看性能
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  File System Parameters Tab                                           */
/* ------------------------------------------------------------------ */
function FileSystemParametersTab({
  onUnsavedChange,
}: {
  onUnsavedChange: (count: number) => void;
}) {
  const fileSystems = useLiveFileSystems();
  const [fsId, setFsId] = useState(fileSystems[0]?.id || '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('全部');
  const [unsavedParams, setUnsavedParams] = useState<Record<string, string>>({});

  const currentFs = fileSystems.find(f => f.id === fsId) || fileSystems[0];
  const categories = ['全部', ...new Set(currentFs.parameters.map(p => p.category))];

  const filteredParams = currentFs.parameters.filter(p => {
    const matchSearch = searchQuery === '' || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.includes(searchQuery);
    const matchCategory = filterCategory === '全部' || p.category === filterCategory;
    return matchSearch && matchCategory;
  });

  useEffect(() => {
    onUnsavedChange(Object.keys(unsavedParams).length);
  }, [unsavedParams, onUnsavedChange]);

  const startEdit = (param: FileSystemParameter) => {
    setEditingId(param.id);
    setEditValue(unsavedParams[param.id] ?? param.currentValue);
  };

  const saveEdit = (param: FileSystemParameter) => {
    if (editValue !== param.currentValue) {
      setUnsavedParams(prev => ({ ...prev, [param.id]: editValue }));
    } else {
      setUnsavedParams(prev => { const n = { ...prev }; delete n[param.id]; return n; });
    }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const impactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-[#EF4444]/10 text-[#EF4444]';
      case 'medium': return 'bg-[#F59E0B]/10 text-[#F59E0B]';
      case 'low': return 'bg-[#10B981]/10 text-[#10B981]';
      default: return 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]';
    }
  };

  const impactLabel = (impact: string) => {
    switch (impact) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '-';
    }
  };

  return (
    <div className="px-6 pb-6">
      {/* Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={fsId}
            onChange={e => setFsId(e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            {fileSystems.map(fs => (
              <option key={fs.id} value={fs.id}>{fs.name} ({fs.isDefault ? '默认' : fs.mountPoint}) — {fs.nodeCount} 节点</option>
            ))}
          </select>
          <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2">
            <Search className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索配置项..."
              className="w-[200px] bg-transparent text-sm text-slate-900 dark:text-[#F1F5F9] outline-none placeholder:text-slate-500 dark:text-[#64748B]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Quick FS info cards */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        {[
          { label: '分条数', value: currentFs.stripeCount.toString(), icon: Layers },
          { label: '分条大小', value: `${(currentFs.stripeSize / 1024 / 1024).toFixed(0)} MB`, icon: HardDrive },
          { label: '校验算法', value: currentFs.checksum, icon: Check },
          { label: '挂载点', value: currentFs.mountPoint, icon: Server },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] p-4">
            <item.icon className="h-5 w-5 text-[#0EA5E9]" />
            <div>
              <p className="text-xs text-slate-500 dark:text-[#64748B]">{item.label}</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Parameter Table */}
      <div className="overflow-hidden rounded-xl border border-[#1E293B]">
        <table className="w-full">
          <thead>
            <tr className="bg-white dark:bg-[#1A2234]">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">参数名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">当前值</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">默认值</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">范围/类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">描述</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">影响</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredParams.map((param, idx) => {
              const isEditing = editingId === param.id;
              const hasUnsaved = unsavedParams[param.id] !== undefined;
              const displayValue = hasUnsaved ? unsavedParams[param.id] : param.currentValue;
              const isModified = param.modified || hasUnsaved;

              return (
                <motion.tr
                  key={param.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.02, duration: 0.2 }}
                  className={cn(
                    'border-t border-[#1E293B] transition-colors hover:bg-white dark:bg-[#1A2234]/50',
                    isModified && 'border-l-2 border-l-[#F59E0B]'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-[#0EA5E9]">{param.name}</span>
                      {isModified && <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-xs text-[#F59E0B]">已修改</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(param)}
                          onBlur={() => saveEdit(param)}
                          className="w-32 rounded border border-[#3B82F6] bg-slate-50 dark:bg-[#0D1320] px-2 py-1 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`保存参数 ${param.name}`}
                          title="保存参数"
                          onMouseDown={() => saveEdit(param)}
                          className="text-[#10B981]"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`取消编辑参数 ${param.name}`}
                          title="取消编辑"
                          onMouseDown={cancelEdit}
                          className="text-[#EF4444]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(param)}
                        className={cn(
                          'rounded px-2 py-1 text-sm font-mono transition-colors',
                          hasUnsaved ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-slate-50 dark:bg-[#0D1320] text-slate-900 dark:text-[#F1F5F9] hover:bg-white dark:bg-[#1A2234]'
                        )}
                      >
                        {displayValue}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-[#64748B]">{param.defaultValue}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-[#94A3B8]">{param.type}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-[#94A3B8]">{param.description}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', impactColor(param.impact))}>
                      {impactLabel(param.impact)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`查看参数 ${param.name} 详细配置`}
                        title="详细配置"
                        onClick={() => toast(`参数 ${param.name} 详细配置待接入`)}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`恢复参数 ${param.name}`}
                        title="恢复参数"
                        onClick={() => {
                          setUnsavedParams(prev => {
                            const next = { ...prev };
                            delete next[param.id];
                            return next;
                          });
                          toast.success(`参数 ${param.name} 已恢复为当前运行值`);
                        }}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`查看参数 ${param.name} 历史记录`}
                        title="历史记录"
                        onClick={() => toast(`参数 ${param.name} 历史记录待接入`)}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unsaved banner */}
      <AnimatePresence>
        {Object.keys(unsavedParams).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-[300px] right-6 z-50 flex items-center justify-between rounded-xl border border-[#F59E0B]/30 bg-white dark:bg-[#111827]/95 px-6 py-4 shadow-xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
              <span className="text-sm text-slate-900 dark:text-[#F1F5F9]">有 {Object.keys(unsavedParams).length} 项未保存的修改</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUnsavedParams({})}
                className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
              >
                放弃
              </button>
              <button onClick={() => toast.success(`已暂存 ${Object.keys(unsavedParams).length} 项配置修改`)} className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white">
                保存修改
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node Configuration Tab                                             */
/* ------------------------------------------------------------------ */
function NodeConfigurationTab() {
  const clusterNodes = useLiveClusterNodes();
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [diffNodeA, setDiffNodeA] = useState<ClusterNode | null>(null);
  const [diffNodeB, setDiffNodeB] = useState<ClusterNode | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedNodes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedNodes.length === clusterNodes.length) {
      setSelectedNodes([]);
    } else {
      setSelectedNodes(clusterNodes.map(n => n.id));
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-[#10B981]/10 text-[#10B981]';
      case 'degraded': return 'bg-[#F59E0B]/10 text-[#F59E0B]';
      case 'offline': return 'bg-[#EF4444]/10 text-[#EF4444]';
      default: return 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'online': return '在线';
      case 'degraded': return '降级';
      case 'offline': return '离线';
      default: return '未知';
    }
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case 'mgs': return 'bg-[#10B981]/10 text-[#10B981]';
      case 'mds': return 'bg-[#8B5CF6]/10 text-[#8B5CF6]';
      case 'oss': return 'bg-[#06B6D4]/10 text-[#06B6D4]';
      case 'client': return 'bg-[#0EA5E9]/10 text-[#0EA5E9]';
      default: return 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]';
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'mgs': return 'MGS';
      case 'mds': return 'MDS';
      case 'oss': return 'OSS';
      case 'client': return 'Client';
      default: return role;
    }
  };

  const computeDiff = (a: ClusterNode, b: ClusterNode): ConfigDiffEntry[] => {
    const allParams = new Set([...a.parameters.map(p => p.name), ...b.parameters.map(p => p.name)]);
    return Array.from(allParams).map(param => {
      const av = a.parameters.find(p => p.name === param)?.currentValue ?? '';
      const bv = b.parameters.find(p => p.name === param)?.currentValue ?? '';
      let status: ConfigDiffEntry['status'] = 'same';
      if (av === '' && bv !== '') status = 'added';
      else if (bv === '' && av !== '') status = 'removed';
      else if (av !== bv) status = 'modified';
      return { parameter: param, nodeAValue: av, nodeBValue: bv, status };
    }).filter(d => d.status !== 'same');
  };

  return (
    <div className="px-6 pb-6">
      {/* Bulk actions */}
      {selectedNodes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center justify-between rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] px-4 py-3"
        >
          <span className="text-sm text-slate-900 dark:text-[#F1F5F9]">已选择 {selectedNodes.length} 个节点</span>
          <div className="flex items-center gap-2">
            <button onClick={() => toast(`已为 ${selectedNodes.length} 个节点触发批量同步（演示）`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
              <RefreshCw className="h-3.5 w-3.5" /> 批量同步
            </button>
            <button onClick={() => toast(`已为 ${selectedNodes.length} 个节点触发批量重启（演示）`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
              <RotateCcw className="h-3.5 w-3.5" /> 批量重启
            </button>
            <button onClick={() => toast.success(`已导出 ${selectedNodes.length} 个节点的配置（演示）`)} className="flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-[#0D1320] px-3 py-1.5 text-xs text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
              <Download className="h-3.5 w-3.5" /> 导出选中配置
            </button>
          </div>
        </motion.div>
      )}

      {/* Diff selector */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={diffNodeA?.id ?? ''}
          onChange={e => setDiffNodeA(clusterNodes.find(n => n.id === e.target.value) ?? null)}
          className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9]"
        >
          <option value="">选择节点 A</option>
          {clusterNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <ArrowLeftRight className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />
        <select
          value={diffNodeB?.id ?? ''}
          onChange={e => setDiffNodeB(clusterNodes.find(n => n.id === e.target.value) ?? null)}
          className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9]"
        >
          <option value="">选择节点 B</option>
          {clusterNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <button
          onClick={() => setShowDiff(!!diffNodeA && !!diffNodeB)}
          disabled={!diffNodeA || !diffNodeB}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
            diffNodeA && diffNodeB
              ? 'bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white'
              : 'cursor-not-allowed bg-white dark:bg-[#1E293B] text-slate-500 dark:text-[#64748B]'
          )}
        >
          <GitCompare className="h-4 w-4" /> 对比配置
        </button>
      </div>

      {/* Diff view */}
      <AnimatePresence>
        {showDiff && diffNodeA && diffNodeB && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827]"
          >
            <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-3">
              <h3 className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">配置对比</h3>
              <button onClick={() => setShowDiff(false)} className="text-slate-500 dark:text-[#64748B] hover:text-slate-900 dark:text-[#F1F5F9]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-0">
              <div className="border-r border-[#1E293B] px-4 py-3">
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-[#64748B]">{diffNodeA.name} (节点 A)</p>
              </div>
              <div className="border-r border-[#1E293B] px-4 py-3">
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-[#64748B]">参数</p>
              </div>
              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-[#64748B]">{diffNodeB.name} (节点 B)</p>
              </div>
              {computeDiff(diffNodeA, diffNodeB).map((diff, idx) => (
                <motion.div
                  key={diff.parameter}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className="contents"
                >
                  <div className={cn('border-r border-t border-[#1E293B] px-4 py-2 font-mono text-sm',
                    diff.status === 'removed' ? 'bg-[#EF4444]/5 text-[#EF4444]' : diff.status === 'modified' ? 'bg-[#F59E0B]/5 text-slate-900 dark:text-[#F1F5F9]' : 'text-slate-900 dark:text-[#F1F5F9]')}>
                    {diff.nodeAValue || '-'}
                  </div>
                  <div className={cn('border-r border-t border-[#1E293B] px-4 py-2 font-mono text-sm',
                    diff.status === 'modified' ? 'bg-[#F59E0B]/5 text-[#F59E0B]' : 'text-slate-600 dark:text-[#94A3B8]')}>
                    {diff.parameter}
                  </div>
                  <div className={cn('border-t border-[#1E293B] px-4 py-2 font-mono text-sm',
                    diff.status === 'added' ? 'bg-[#10B981]/5 text-[#10B981]' : diff.status === 'modified' ? 'bg-[#F59E0B]/5 text-slate-900 dark:text-[#F1F5F9]' : 'text-slate-900 dark:text-[#F1F5F9]')}>
                    {diff.nodeBValue || '-'}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Node table */}
      <div className="overflow-hidden rounded-xl border border-[#1E293B]">
        <table className="w-full">
          <thead>
            <tr className="bg-white dark:bg-[#1A2234]">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedNodes.length === clusterNodes.length && clusterNodes.length > 0}
                  onChange={selectAll}
                  className="rounded border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] accent-[#0EA5E9]"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">节点名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">角色</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">IP 地址</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">Lustre 版本</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">配置差异</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">操作</th>
            </tr>
          </thead>
          <tbody>
            {clusterNodes.map((node, idx) => {
              const diffCount = node.parameters.filter(p => p.modified).length;
              return (
                <motion.tr
                  key={node.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className="border-t border-[#1E293B] transition-colors hover:bg-white dark:bg-[#1A2234]/50"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedNodes.includes(node.id)}
                      onChange={() => toggleSelect(node.id)}
                      className="rounded border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] accent-[#0EA5E9]"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-900 dark:text-[#F1F5F9]">{node.name}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', roleBadge(node.role))}>
                      {roleLabel(node.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-[#94A3B8]">{node.ip}</td>
                  <td className="px-4 py-3">
                    <span className={cn('flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', statusColor(node.status))}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', node.status === 'online' ? 'bg-[#10B981]' : node.status === 'degraded' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]')} />
                      {statusLabel(node.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-[#94A3B8]">{node.lustreVersion}</td>
                  <td className="px-4 py-3">
                    {diffCount > 0 ? (
                      <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-xs text-[#F59E0B]">{diffCount} 项不同</span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-[#64748B]">无差异</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toast(`节点 ${node.name} 配置详情待接入`)} className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
                        <FileText className="h-4 w-4" />
                      </button>
                      <button onClick={() => toast(`节点 ${node.name} 配置同步待接入`)} className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button onClick={() => toast(`节点 ${node.name} 更多操作菜单待接入`)} className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Configuration History Drawer                                       */
/* ------------------------------------------------------------------ */
function ConfigHistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="fixed right-0 top-0 z-50 h-full w-[600px] border-l border-[#1E293B] bg-white dark:bg-[#111827] shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-[#1E293B] px-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">配置历史</h2>
              <button onClick={onClose} className="rounded p-2 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100%-64px)] overflow-y-auto p-6">
              <div className="relative">
                <div className="absolute left-4 top-0 h-full w-px bg-white dark:bg-[#1E293B]" />
                {configHistory.map((entry, idx) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    className="relative mb-4 pl-10"
                  >
                    <div className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-[#0EA5E9] bg-white dark:bg-[#111827]" />
                    <div
                      className="cursor-pointer rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] p-4 transition-colors hover:border-[#0EA5E9]/30"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{entry.parameterName}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">{entry.timestamp} · {entry.user}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#EF4444]/10 px-2 py-1 font-mono text-xs text-[#EF4444]">{entry.oldValue}</span>
                          <ArrowLeftRight className="h-3 w-3 text-slate-500 dark:text-[#64748B]" />
                          <span className="rounded bg-[#10B981]/10 px-2 py-1 font-mono text-xs text-[#10B981]">{entry.newValue}</span>
                          {expandedId === entry.id ? <ChevronUp className="h-4 w-4 text-slate-500 dark:text-[#64748B]" /> : <ChevronDown className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />}
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedId === entry.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 overflow-hidden"
                          >
                            <div className="rounded bg-white dark:bg-[#111827] p-3">
                              <p className="text-xs text-slate-500 dark:text-[#64748B]">节点: {entry.nodeName || '全局'}</p>
                              <p className="text-xs text-slate-500 dark:text-[#64748B]">文件系统: {entry.fileSystemName || 'N/A'}</p>
                              <div className="mt-3 flex gap-2">
                                <button onClick={() => toast.success(`已回滚 ${entry.parameterName} 到历史版本（演示）`)} className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-3 py-1.5 text-xs font-medium text-white">
                                  回滚到此版本
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Tunable Parameters Tab                                             */
/* ------------------------------------------------------------------ */
function TunableParametersTab() {
  const fileSystems = useLiveFileSystems();
  const [expandedCategory, setExpandedCategory] = useState<string>('network');

  const allParams = (fileSystems[0]?.parameters) || [];

  return (
    <div className="px-6 pb-6">
      <div className="flex gap-6">
        {/* Category sidebar */}
        <div className="w-64 shrink-0 space-y-2">
          {parameterCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setExpandedCategory(cat.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm transition-all',
                expandedCategory === cat.id
                  ? 'border-l-2 border-l-[#0EA5E9] bg-white dark:bg-[#1A2234] text-[#0EA5E9]'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234]/50'
              )}
            >
              <span>{cat.name}</span>
              <span className="rounded-full bg-slate-50 dark:bg-[#0D1320] px-2 py-0.5 text-xs text-slate-500 dark:text-[#64748B]">{cat.count}</span>
            </button>
          ))}
        </div>

        {/* Parameter list */}
        <div className="flex-1">
          <div className="overflow-hidden rounded-xl border border-[#1E293B]">
            <table className="w-full">
              <thead>
                <tr className="bg-white dark:bg-[#1A2234]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">参数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">当前值</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">默认值</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">影响</th>
                </tr>
              </thead>
              <tbody>
                {allParams
                  .filter(p => p.category.includes(parameterCategories.find(c => c.id === expandedCategory)?.name ?? ''))
                  .map((param, idx) => (
                    <motion.tr
                      key={param.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={cn('border-t border-[#1E293B] hover:bg-white dark:bg-[#1A2234]/50', param.modified && 'border-l-2 border-l-[#F59E0B]')}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-[#0EA5E9]">{param.name}</span>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B]">{param.description}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-900 dark:text-[#F1F5F9]">{param.currentValue}</td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-500 dark:text-[#64748B]">{param.defaultValue}</td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs',
                          param.impact === 'high' ? 'bg-[#EF4444]/10 text-[#EF4444]' :
                          param.impact === 'medium' ? 'bg-[#F59E0B]/10 text-[#F59E0B]' :
                          'bg-[#10B981]/10 text-[#10B981]'
                        )}>
                          {param.impact === 'high' ? '高' : param.impact === 'medium' ? '中' : '低'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Config Diff Tab (current vs proposed)                              */
/* ------------------------------------------------------------------ */
function ConfigDiffTab() {
  const fileSystems = useLiveFileSystems();
  const [proposedChanges] = useState<Record<string, string>>({
    stripe_count: '2',
    stripe_size: '2097152',
    max_rpcs_in_flight: '16',
  });

  const fsParams = (fileSystems[0]?.parameters) || [];
  const diffItems = fsParams.filter(p => proposedChanges[p.name] !== undefined);

  return (
    <div className="px-6 pb-6">
      <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#F59E0B]" />
          <span className="text-sm font-medium text-[#F59E0B]">配置对比模式</span>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-[#94A3B8]">对比当前运行配置与建议修改值，确认后应用变更。</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#1E293B]">
        <table className="w-full">
          <thead>
            <tr className="bg-white dark:bg-[#1A2234]">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">参数</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">当前值</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">建议值</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">差异</th>
            </tr>
          </thead>
          <tbody>
            {diffItems.map((param, idx) => {
              const proposed = proposedChanges[param.name];
              const changed = proposed !== param.currentValue;
              return (
                <motion.tr
                  key={param.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className="border-t border-[#1E293B]"
                >
                  <td className="px-4 py-3 font-mono text-sm text-[#0EA5E9]">{param.name}</td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-900 dark:text-[#F1F5F9]">{param.currentValue}</td>
                  <td className="px-4 py-3 font-mono text-sm text-[#F59E0B]">{proposed}</td>
                  <td className="px-4 py-3">
                    {changed ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-xs text-[#F59E0B]">
                        <GitCompare className="h-3 w-3" /> 已变更
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-[#64748B]">无变化</span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={() => toast('已取消建议变更')} className="rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]">
          取消
        </button>
        <button onClick={() => toast.success(`已应用 ${diffItems.length} 项建议变更（演示）`)} className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white">
          应用变更
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function ClusterConfig() {


  const [activeTab, setActiveTab] = useState('topology');
  const [selectedNode, setSelectedNode] = useState<ClusterNode | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const handleExport = () => toast.success('集群配置已导出（演示）');
  const handleSave = () => toast.success(`已保存 ${unsavedCount} 项配置修改（演示）`);

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0A0F1A]">
      <PageHeader
        unsavedCount={unsavedCount}
        onExport={handleExport}
        onSave={handleSave}
        onHistory={() => setHistoryOpen(true)}
      />

      {/* Tab Bar */}
      <div className="sticky top-0 z-40 border-b border-[#1E293B] bg-white dark:bg-[#111827] px-6">
        <div className="flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id ? 'text-slate-900 dark:text-[#F1F5F9]' : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:text-[#F1F5F9]'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="cluster-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0EA5E9]"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'topology' && (
            <motion.div
              key="topology"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-6"
            >
              <div className="grid grid-cols-5 gap-6">
                <div className="col-span-3">
                  <TopologyDiagram selectedNode={selectedNode} onSelectNode={setSelectedNode} />
                </div>
                <div className="col-span-2">
                  <NodeDetailPanel node={selectedNode} />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'filesystem' && (
            <motion.div
              key="filesystem"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FileSystemParametersTab onUnsavedChange={setUnsavedCount} />
            </motion.div>
          )}

          {activeTab === 'nodes' && (
            <motion.div
              key="nodes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <NodeConfigurationTab />
            </motion.div>
          )}

          {activeTab === 'tuning' && (
            <motion.div
              key="tuning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <TunableParametersTab />
            </motion.div>
          )}

          {activeTab === 'diff' && (
            <motion.div
              key="diff"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ConfigDiffTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfigHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
