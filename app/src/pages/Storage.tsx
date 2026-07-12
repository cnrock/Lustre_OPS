import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
} from 'recharts';
import { HardDrive, RefreshCw, TrendingUp, Database } from 'lucide-react';
import { fetchInodeStats, fetchStorage, fetchStorageForecast } from '../lib/lustre-api';
import toast from 'react-hot-toast';

function formatStorage(gb: number) {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}

function formatNumber(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function getUsageColor(percent: number) {
  if (percent >= 90) return '#EF4444';
  if (percent >= 80) return '#F59E0B';
  return '#10B981';
}

export default function Storage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storage, setStorage] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [inodes, setInodes] = useState<any[]>([]);
  const [error, setError] = useState('');

  const loadStorageData = useCallback(async (showToast = false) => {
    setRefreshing(true);
    setError('');
    try {
      const [storageData, forecastData, inodeData] = await Promise.all([
        fetchStorage(),
        fetchStorageForecast(24, 7),
        fetchInodeStats(),
      ]);
      setStorage(storageData);
      setForecast(forecastData);
      setInodes(inodeData?.items || []);
      if (!storageData) {
        setError('没有获取到容量数据，请确认 Lustre API 服务已启动并可访问。');
      }
      if (showToast) {
        if (storageData) toast.success('容量数据已刷新');
        else toast.error('容量数据刷新失败，请检查 API 服务');
      }
    } catch {
      setError('容量数据刷新失败，请检查 API 服务或网络连接。');
      if (showToast) toast.error('容量数据刷新失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStorageData();
    const timer = setInterval(() => loadStorageData(false), 30000);
    return () => {
      clearInterval(timer);
    };
  }, [loadStorageData]);

  const ostTargets = useMemo(
    () => (storage?.osts || []).filter((item: any) => item.type === 'OST'),
    [storage]
  );
  const forecastChart = useMemo(() => {
    const history = (forecast?.history || []).slice(-12).map((item: any) => ({
      label: item.label,
      actual: item.used_gb,
    }));
    const predicted = (forecast?.forecast || []).map((item: any) => ({
      label: item.label,
      predicted: item.predicted_gb,
      upper: item.upper_gb,
      lower: item.lower_gb,
    }));
    return [...history, ...predicted];
  }, [forecast]);

  const summaryCards = [
    {
      title: '总容量',
      value: formatStorage(storage?.summary?.totalCapacity || 0),
      sub: `已用 ${formatStorage(storage?.summary?.totalUsed || 0)}`,
      color: '#0EA5E9',
      icon: HardDrive,
    },
    {
      title: 'OST 使用率',
      value: `${storage?.summary?.ost?.percent?.toFixed?.(1) ?? 0}%`,
      sub: `${storage?.summary?.ost?.count ?? 0} 个 OST，${storage?.summary?.ost?.over80 ?? 0} 个超过 80%`,
      color: getUsageColor(storage?.summary?.ost?.percent || 0),
      icon: Database,
    },
    {
      title: '日增长',
      value: `${forecast?.growth_per_day_gb ?? 0} GB/天`,
      sub: forecast?.thresholds?.['80']
        ? `80% 预计 ${forecast.thresholds['80'].days} 天后`
        : '样本不足，暂不预测',
      color: '#8B5CF6',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0A0F1A] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
            <span>存储监控</span>
            <span>/</span>
            <span className="text-slate-900 dark:text-[#F1F5F9]">容量与 Inode</span>
          </div>
          <h1 className="mt-2 text-[36px] font-bold leading-tight tracking-[-0.01em] text-slate-900 dark:text-[#F1F5F9]">
            存储容量监控
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">
            仅展示当前 Lustre 环境真实容量、增长趋势和 inode 使用情况
          </p>
        </div>
        <button
          onClick={() => loadStorageData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-[#111827] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '刷新中...' : '刷新容量数据'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-medium">容量数据暂不可用</div>
          <div className="mt-1 text-amber-100/80">{error}</div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {summaryCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]"
          >
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#94A3B8]">
              <card.icon className="h-4 w-4" style={{ color: card.color }} />
              {card.title}
            </div>
            <div className="mt-2 text-[30px] font-semibold" style={{ color: card.color }}>
              {loading ? '--' : card.value}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-[#64748B]">{card.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">OST 容量分布</h2>
          <span className="text-sm text-slate-500 dark:text-[#64748B]">{ostTargets.length} 个 OST</span>
        </div>
        <div className="h-[360px]">
          {ostTargets.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ostTargets
                  .map((item: any) => ({
                    name: item.name,
                    percent: item.usage_percent || 0,
                  }))
                  .sort((a: any, b: any) => b.percent - a.percent)}
                layout="vertical"
                margin={{ left: 16, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.3} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} width={120} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, '使用率']}
                  contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8 }}
                />
                <Bar dataKey="percent" radius={[0, 6, 6, 0]}>
                  {ostTargets.map((item: any) => (
                    <Cell key={item.name} fill={getUsageColor(item.usage_percent || 0)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/70 text-center">
              <HardDrive className="mb-3 h-8 w-8 text-slate-500" />
              <div className="text-sm font-medium text-slate-700 dark:text-[#F1F5F9]">暂无 OST 容量数据</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">启动 Lustre API 后将自动显示各 OST 使用率。</div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827] lg:col-span-3">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">容量预测</h2>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8 }} />
                <Area type="monotone" dataKey="actual" name="历史" stroke="#8B5CF6" fill="#8B5CF620" strokeWidth={2} />
                <Line type="monotone" dataKey="predicted" name="预测" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="upper" name="上界" stroke="none" fill="#F59E0B14" />
                <Area type="monotone" dataKey="lower" name="下界" stroke="none" fill="#0A0F1A" fillOpacity={1} />
                <ReferenceLine
                  y={(storage?.summary?.totalCapacity || 0) * 0.8}
                  stroke="#F59E0B"
                  strokeDasharray="4 4"
                  label={{ value: '80%', fill: '#F59E0B', fontSize: 10 }}
                />
                <ReferenceLine
                  y={(storage?.summary?.totalCapacity || 0) * 0.9}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  label={{ value: '90%', fill: '#EF4444', fontSize: 10 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">预测摘要</h3>
            <div className="space-y-2 text-sm text-slate-600 dark:text-[#94A3B8]">
              <div>当前增长速率: <span className="text-slate-900 dark:text-[#F1F5F9]">{forecast?.growth_per_day_gb ?? 0} GB/天</span></div>
              <div>80% 阈值: <span className="text-slate-900 dark:text-[#F1F5F9]">{forecast?.thresholds?.['80']?.date || '--'}</span></div>
              <div>90% 阈值: <span className="text-slate-900 dark:text-[#F1F5F9]">{forecast?.thresholds?.['90']?.date || '--'}</span></div>
              <div>100% 阈值: <span className="text-slate-900 dark:text-[#F1F5F9]">{forecast?.thresholds?.['100']?.date || '--'}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">当前文件系统</h3>
            <div className="space-y-2 text-sm text-slate-600 dark:text-[#94A3B8]">
              <div>总容量: {formatStorage(storage?.summary?.totalCapacity || 0)}</div>
              <div>已用容量: {formatStorage(storage?.summary?.totalUsed || 0)}</div>
              <div>可用容量: {formatStorage(storage?.summary?.totalAvailable || 0)}</div>
              <div>OST 数量: {storage?.summary?.ost?.count ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#1E293B] bg-white p-5 dark:bg-[#111827]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">真实 Inode 使用情况</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">来自 `lfs df -i /lustre/client` 的实时结果</p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {inodes.length > 0 ? inodes.map((inode: any) => (
            <div key={inode.id} className="rounded-lg border border-[#1E293B] bg-slate-50 p-4 dark:bg-[#0D1320]">
              <div className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{inode.name}</div>
              <div className="mt-2 text-2xl font-semibold" style={{ color: getUsageColor(inode.percent) }}>
                {inode.percent}%
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white dark:bg-[#1E293B]">
                <div className="h-full rounded-full" style={{ width: `${inode.percent}%`, backgroundColor: getUsageColor(inode.percent) }} />
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-[#64748B]">
                已用 {formatNumber(inode.used)} / {formatNumber(inode.total)}
              </div>
            </div>
          )) : (
            <div className="col-span-full rounded-lg border border-dashed border-slate-700/70 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-[#0D1320] dark:text-[#64748B]">
              暂无 Inode 数据，等待后端采集结果。
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#1E293B] bg-white dark:bg-[#1A2234]">
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">目标</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">总 Inode</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">已用</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">可用</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">使用率</th>
              </tr>
            </thead>
            <tbody>
              {inodes.map((inode: any) => (
                <tr key={inode.id} className="border-b border-[#1E293B]">
                  <td className="px-4 py-3 font-mono text-slate-900 dark:text-[#F1F5F9]">{inode.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-[#94A3B8]">{formatNumber(inode.total)}</td>
                  <td className="px-4 py-3 font-mono text-slate-900 dark:text-[#F1F5F9]">{formatNumber(inode.used)}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-[#94A3B8]">{formatNumber(inode.available)}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: getUsageColor(inode.percent) }}>{inode.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
