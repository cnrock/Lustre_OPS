import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Activity, Network, RefreshCw, Wifi } from 'lucide-react';
import { fetchDashboardPerformance, fetchNetwork, fetchPerformanceTrend } from '../lib/lustre-api';

function parseLnetTypes(text: string) {
  const matches = Array.from(text.matchAll(/net type:\s+([a-zA-Z0-9]+)/g)).map((item) => item[1]);
  return matches.filter((value, index) => matches.indexOf(value) === index);
}

function parseNids(nids: string) {
  return (nids || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NetworkPage() {
  const [network, setNetwork] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const [networkData, perfData, trendData] = await Promise.all([
        fetchNetwork(),
        fetchDashboardPerformance(),
        fetchPerformanceTrend(1),
      ]);
      if (!active) return;
      setNetwork(networkData);
      setPerf(perfData);
      setTrend(
        (trendData?.points || []).map((item: any) => ({
          time: item.timestamp?.slice(11, 16) || '--',
          totalBw: (item.read_mbps || 0) + (item.write_mbps || 0),
          readBw: item.read_mbps || 0,
          writeBw: item.write_mbps || 0,
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
  }, []);

  const nids = useMemo(() => parseNids(network?.nids || ''), [network]);
  const netTypes = useMemo(() => parseLnetTypes(network?.lnet || ''), [network]);
  const peerRows = useMemo(
    () =>
      (network?.lnet || '')
        .split('\n')
        .map((item: string) => item.trim())
        .filter((item: string) => item.startsWith('- nid:') || item.startsWith('status:')),
    [network]
  );

  const cards = [
    {
      label: 'LNet 网络类型',
      value: netTypes.length ? netTypes.join(', ') : '无',
      sub: `检测到 ${netTypes.length} 类网络`,
      color: '#10B981',
      icon: Wifi,
    },
    {
      label: '本机 NID',
      value: `${nids.length}`,
      sub: nids[0] || '无',
      color: '#0EA5E9',
      icon: Network,
    },
    {
      label: '当前聚合带宽',
      value: `${((perf?.bandwidth?.readMB || 0) + (perf?.bandwidth?.writeMB || 0)).toFixed(2)} MB/s`,
      sub: `读 ${(perf?.bandwidth?.readMB || 0).toFixed(2)} / 写 ${(perf?.bandwidth?.writeMB || 0).toFixed(2)}`,
      color: '#6366F1',
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0A0F1A] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
            <span>网络监控</span>
            <span>/</span>
            <span className="text-slate-900 dark:text-[#F1F5F9]">存储网络</span>
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 dark:text-[#F1F5F9]">存储网络监控</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">
            基于当前 LNet 实际状态和最近性能样本显示真实网络信息
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#64748B]">
          <RefreshCw className="h-3.5 w-3.5" />
          最近更新: {updatedAt ? updatedAt.toLocaleTimeString('zh-CN') : '--'}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]"
          >
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#94A3B8]">
              <card.icon className="h-4 w-4" style={{ color: card.color }} />
              {card.label}
            </div>
            <div className="mt-2 text-[28px] font-semibold" style={{ color: card.color }}>{card.value}</div>
            <div className="mt-2 text-xs text-slate-500 dark:text-[#64748B]">{card.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">最近 1 小时带宽趋势</h2>
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

      <div className="mb-6 rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">当前 NID 列表</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {nids.length ? (
            nids.map((nid) => (
              <div key={nid} className="rounded-lg border border-[#1E293B] bg-slate-50 p-4 font-mono text-sm text-slate-900 dark:bg-[#0D1320] dark:text-[#F1F5F9]">
                {nid}
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500 dark:text-[#64748B]">未检测到 NID</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">原始 LNet 状态</h2>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {peerRows.length ? (
            peerRows.map((row: string, index: number) => (
              <div key={`${row}-${index}`} className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 font-mono text-xs text-slate-900 dark:bg-[#0D1320] dark:text-[#F1F5F9]">
                {row}
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500 dark:text-[#64748B]">未解析到更多链路状态</div>
          )}
        </div>
        <pre className="overflow-x-auto rounded-lg bg-[#0D1320] p-4 text-xs text-slate-200">{network?.lnet || '无数据'}</pre>
      </div>
    </div>
  );
}
