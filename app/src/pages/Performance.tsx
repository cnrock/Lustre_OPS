import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 LineChart,
 Line,
 ScatterChart,
 Scatter,
 XAxis,
 YAxis,
 ZAxis,
 CartesianGrid,
 Tooltip,
 Legend,
} from 'recharts';
import { Activity, Clock, RefreshCw, Search } from 'lucide-react';
import { fetchDashboardPerformance, fetchPerformanceLive, fetchPerformanceTrend } from '../lib/lustre-api';

const timeRanges: Record<string, number> = {
 '1h': 1,
 '6h': 6,
 '24h': 24,
 '7d': 168,
};

function roleOf(name: string) {
 if (name.includes('MGS')) return 'MGS';
 if (name.includes('MDT')) return 'MDS';
 if (name.includes('OST')) return 'OSS';
 return 'NODE';
}

function statusOf(read: number, write: number) {
 const total = read + write;
 if (total <= 0) return 'idle';
 if (total < 5) return 'warning';
 return 'healthy';
}

export default function Performance() {
 const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
 const [query, setQuery] = useState('');
 const [summary, setSummary] = useState<any>(null);
 const [nodes, setNodes] = useState<any[]>([]);
 const [trend, setTrend] = useState<any[]>([]);
 const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

 useEffect(() => {
 let active = true;

 async function load() {
 const hours = timeRanges[range];
 const [dashboard, live, trends] = await Promise.all([
 fetchDashboardPerformance(),
 fetchPerformanceLive(Math.min(hours, 24)),
 fetchPerformanceTrend(Math.min(hours, 24)),
 ]);
 if (!active) return;

 setSummary(dashboard);
 setNodes(
 (live?.osts || []).map((item: any) => ({
 id: item.ost_name,
 name: item.ost_name,
 role: roleOf(item.ost_name),
 readBw: item.read_mbps || 0,
 writeBw: item.write_mbps || 0,
 readIops: item.read_iops || 0,
 writeIops: item.write_iops || 0,
 readLatency: 0.1,
 writeLatency: 0.1,
 status: statusOf(item.read_mbps || 0, item.write_mbps || 0),
 totalIops: (item.read_iops || 0) + (item.write_iops || 0),
 }))
 );
 setTrend(
 (trends?.points || []).map((item: any) => ({
 time: item.timestamp?.slice(11, 16) || item.timestamp?.slice(5, 16) || '--',
 readBw: item.read_mbps || 0,
 writeBw: item.write_mbps || 0,
 readIops: item.read_iops || 0,
 writeIops: item.write_iops || 0,
 }))
 );
 setUpdatedAt(new Date());
 }

 load();
 const timer = setInterval(load, 30000);
 return () => {
 active = false;
 clearInterval(timer);
 };
 }, [range]);

 const filteredNodes = useMemo(
 () => nodes.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
 [nodes, query]
 );

 const totalLatencyData = filteredNodes.map((item) => ({
 name: item.name,
 readLatency: item.readLatency,
 writeLatency: item.writeLatency,
 iops: item.totalIops || 1,
 role: item.role,
 }));

 return (
 <div className="min-h-[100dvh] bg-[hsl(var(--muted))] p-6">
 <div className="mb-6 flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <span>性能监控</span>
 <span>/</span>
 <span className="text-foreground ">节点性能</span>
 </div>
 <h1 className="mt-2 text-[36px] font-bold leading-tight tracking-[-0.01em] text-foreground ">
 节点性能监控
 </h1>
 <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] ">
 读取真实 OST 性能速率和最近时间窗口趋势
 </p>
 </div>
 <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <Clock className="h-3.5 w-3.5" />
 最近更新: {updatedAt ? updatedAt.toLocaleTimeString('zh-CN') : '--'}
 <RefreshCw className="h-3.5 w-3.5" />
 </div>
 </div>

 <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-card p-3 ">
 <div className="flex items-center gap-2 rounded-lg bg-[hsl(var(--muted))] px-3 py-2 ">
 <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))] " />
 <input
 value={query}
 onChange={(event) => setQuery(event.target.value)}
 placeholder="搜索 OST..."
 className="w-48 bg-transparent text-sm text-foreground outline-none "
 />
 </div>
 <div className="flex items-center gap-1 rounded-lg bg-[hsl(var(--muted))] p-1 ">
 {(['1h', '6h', '24h', '7d'] as const).map((item) => (
 <button
 key={item}
 onClick={() => setRange(item)}
 className={`rounded-md px-3 py-1.5 text-sm transition-all ${range === item ? 'bg-card text-[#0EA5E9] ' : 'text-[hsl(var(--muted-foreground))] '}`}
 >
 {item}
 </button>
 ))}
 </div>
 </div>

 <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
 {[
 { label: '读取带宽', value: `${summary?.bandwidth?.readMB ?? 0} MB/s`, color: '#0EA5E9' },
 { label: '写入带宽', value: `${summary?.bandwidth?.writeMB ?? 0} MB/s`, color: '#6366F1' },
 { label: '读取 IOPS', value: `${summary?.iops?.read ?? 0}`, color: '#10B981' },
 { label: '写入 IOPS', value: `${summary?.iops?.write ?? 0}`, color: '#F59E0B' },
 ].map((card, index) => (
 <motion.div
 key={card.label}
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: index * 0.08 }}
 className="rounded-xl border border-[hsl(var(--border))] bg-card p-5 "
 >
 <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <Activity className="h-4 w-4" style={{ color: card.color }} />
 {card.label}
 </div>
 <div className="mt-2 text-[30px] font-semibold" style={{ color: card.color }}>{card.value}</div>
 </motion.div>
 ))}
 </div>

 <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5 ">
 <h2 className="mb-4 text-lg font-semibold text-foreground ">读写带宽趋势</h2>
 <div className="h-[320px]">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={trend}>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.3} />
 <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 12 }} />
 <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
 <Tooltip contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8 }} />
 <Legend />
 <Area type="monotone" dataKey="readBw" name="读取带宽" stroke="#0EA5E9" fill="#0EA5E920" strokeWidth={2} />
 <Area type="monotone" dataKey="writeBw" name="写入带宽" stroke="#6366F1" fill="#6366F120" strokeWidth={2} />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>
 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5 ">
 <h2 className="mb-4 text-lg font-semibold text-foreground ">IOPS 趋势</h2>
 <div className="h-[320px]">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={trend}>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.3} />
 <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 12 }} />
 <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
 <Tooltip contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8 }} />
 <Legend />
 <Line type="monotone" dataKey="readIops" name="读取 IOPS" stroke="#10B981" strokeWidth={2} dot={false} />
 <Line type="monotone" dataKey="writeIops" name="写入 IOPS" stroke="#F59E0B" strokeWidth={2} dot={false} />
 </LineChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 <div className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-card p-5 ">
 <h2 className="mb-4 text-lg font-semibold text-foreground ">节点延迟分布</h2>
 <div className="h-[280px]">
 <ResponsiveContainer width="100%" height="100%">
 <ScatterChart>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.3} />
 <XAxis type="number" dataKey="readLatency" name="读取延迟" unit=" ms" tick={{ fill: '#64748B', fontSize: 12 }} />
 <YAxis type="number" dataKey="writeLatency" name="写入延迟" unit=" ms" tick={{ fill: '#64748B', fontSize: 12 }} />
 <ZAxis type="number" dataKey="iops" range={[80, 320]} />
 <Tooltip contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8 }} />
 <Scatter data={totalLatencyData} fill="#0EA5E9" />
 </ScatterChart>
 </ResponsiveContainer>
 </div>
 </div>

 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5 ">
 <div className="mb-4 flex items-center justify-between">
 <h2 className="text-lg font-semibold text-foreground ">节点性能明细</h2>
 <span className="text-sm text-[hsl(var(--muted-foreground))] ">共 {filteredNodes.length} 个目标</span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-sm">
 <thead>
 <tr className="border-b border-[hsl(var(--border))] bg-card ">
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">名称</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">角色</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">读取带宽 MB/s</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">写入带宽 MB/s</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">读取 IOPS</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">写入 IOPS</th>
 <th className="px-4 py-3 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">状态</th>
 </tr>
 </thead>
 <tbody>
 {filteredNodes.map((item) => (
 <tr key={item.id} className="border-b border-[hsl(var(--border))]">
 <td className="px-4 py-3 font-mono text-foreground ">{item.name}</td>
 <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] ">{item.role}</td>
 <td className="px-4 py-3 font-mono text-[#0EA5E9]">{item.readBw.toFixed(2)}</td>
 <td className="px-4 py-3 font-mono text-[#6366F1]">{item.writeBw.toFixed(2)}</td>
 <td className="px-4 py-3 font-mono text-[#10B981]">{item.readIops.toFixed(1)}</td>
 <td className="px-4 py-3 font-mono text-[#F59E0B]">{item.writeIops.toFixed(1)}</td>
 <td className="px-4 py-3">
 <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${item.status === 'healthy' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
 {item.status === 'healthy' ? '活跃' : '低负载'}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
}
