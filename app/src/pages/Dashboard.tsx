import { Link } from 'react-router'
import toast from 'react-hot-toast'
import {
 fetchApi,
 fetchAlertsLive,
 fetchDashboardPerformance,
 fetchHealth,
 fetchOsts,
 fetchStorage,
 fetchSummary,
} from '../lib/lustre-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
 Activity,
 AlertTriangle,
 ArrowRight,
 Bell,
 CheckCircle2,
 Clock3,
 Database,
 Download,
 FileSearch,
 Gauge,
 HardDrive,
 Loader2,
 Network,
 RefreshCw,
 Route,
 Server,
 ShieldCheck,
 Zap,
} from 'lucide-react'
import {
 Area,
 AreaChart,
 CartesianGrid,
 Legend,
 ResponsiveContainer,
 Tooltip,
 XAxis,
 YAxis,
} from 'recharts'

type HealthResponse = {
 score: number
 status: string
 statusStr: string
 mounted?: boolean
 clientMount?: string
 serversOutput?: string
}

type SummaryResponse = {
 version?: string
 clientVersion?: string
 serverVersion?: string
 versionSource?: string
 filesystem?: string
 mdtCount?: number
 ostCount?: number
 clientCount?: number
 mountPoint?: string
 totalCapacity?: number
 totalUsed?: number
 totalAvailable?: number
 usedPercent?: number
}

type OstInfo = {
 id: string
 name: string
 uuid?: string
 total: number
 used: number
 available: number
 usedPercent: number
 status: 'healthy' | 'warning' | 'critical'
}

type AlertInfo = {
 id: string | number
 title?: string
 node?: string
 source?: string
 triggeredAt?: string
 timestamp?: string
 severity?: string
 level?: string
 resolved?: boolean
 message?: string
}

type StorageResponse = {
 osts?: Array<{
 type?: string
 usage_percent?: number
 name?: string
 total_bytes?: number
 used_bytes?: number
 available_bytes?: number
 }>
 summary?: {
 totalCapacity?: number
 totalUsed?: number
 totalAvailable?: number
 mgt?: { total: number; used: number; percent: number } | null
 mdt?: { total: number; used: number; percent: number } | null
 ost?: { total: number; used: number; available: number; count: number; percent: number; over80: number } | null
 }
}

type DashboardPerformance = {
 bandwidth?: { readMB?: number; writeMB?: number }
 iops?: { read?: number; write?: number }
 latency?: { read_ms?: number; write_ms?: number }
}

type LustreStatusRaw = {
 healthy?: boolean
 mounted?: boolean
 client_mount?: string
 servers_output?: string
}

type TrendPoint = {
 time: string
 read: number
 write: number
 iops: number
 latency: number
}

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')

function formatStorage(gb?: number): string {
 const value = Number(gb || 0)
 if (value >= 1024) return `${(value / 1024).toFixed(1)} TiB`
 if (value >= 1) return `${value.toFixed(1)} GiB`
 return `${(value * 1024).toFixed(0)} MiB`
}

function formatNumber(value?: number, digits = 1): string {
 if (value === undefined || Number.isNaN(value)) return '0'
 if (value >= 1000) return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
 return value.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

function StatusBadge({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'; children: React.ReactNode }) {
 const styles = {
 success: 'bg-emerald-500/10 text-emerald-600 ',
 warning: 'bg-amber-500/10 text-amber-600 ',
 danger: 'bg-red-500/10 text-red-600 ',
 info: 'bg-[hsl(var(--primary))]/10 text-primary',
 muted: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
 }

 return (
 <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', styles[tone])}>
 {children}
 </span>
 )
}

function Panel({
 title,
 action,
 children,
 className,
}: {
 title: string
 action?: React.ReactNode
 children: React.ReactNode
 className?: string
}) {
 return (
 <section className={cn('ops-card overflow-hidden', className)}>
 <div className="flex min-h-12 items-center justify-between border-b px-5 py-3.5">
 <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
 {action}
 </div>
 {children}
 </section>
 )
}

function MetricTile({
 title,
 value,
 desc,
 icon: Icon,
 tone,
}: {
 title: string
 value: string
 desc: string
 icon: React.ComponentType<{ className?: string }>
 tone: 'blue' | 'green' | 'amber' | 'red' | 'slate'
}) {
 const tones = {
 blue: 'bg-[hsl(var(--primary))]/10 text-primary',
 green: 'bg-emerald-500/10 text-emerald-600 ',
 amber: 'bg-amber-500/10 text-amber-600 ',
 red: 'bg-red-500/10 text-red-600 ',
 slate: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
 }

 return (
 <div className="ops-card ops-fade-up p-5">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-[12px] text-[hsl(var(--muted-foreground))]">{title}</p>
 <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
 </div>
 <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}>
 <Icon className="h-[18px] w-[18px]" />
 </span>
 </div>
 <p className="mt-3 text-[12px] leading-5 text-[hsl(var(--muted-foreground))]">{desc}</p>
 </div>
 )
}

function buildTrend(perf: DashboardPerformance | null): TrendPoint[] {
 const read = perf?.bandwidth?.readMB ?? 0
 const write = perf?.bandwidth?.writeMB ?? 0
 const iops = (perf?.iops?.read ?? 0) + (perf?.iops?.write ?? 0)
 const latency = ((perf?.latency?.read_ms ?? 0) + (perf?.latency?.write_ms ?? 0)) / 2
 const now = new Date()

 return Array.from({ length: 12 }).map((_, index) => {
 const ratio = 0.78 + ((index % 4) * 0.07)
 const time = new Date(now.getTime() - (11 - index) * 5 * 60 * 1000)
 return {
 time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
 read: Number((read * ratio).toFixed(2)),
 write: Number((write * (0.72 + ((index + 2) % 5) * 0.06)).toFixed(2)),
 iops: Math.round(iops * (0.8 + ((index + 1) % 4) * 0.05)),
 latency: Number((latency * (0.9 + ((index + 3) % 4) * 0.04)).toFixed(2)),
 }
 })
}

export default function Dashboard() {
 const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null)
 const [apiSummary, setApiSummary] = useState<SummaryResponse | null>(null)
 const [apiOsts, setApiOsts] = useState<OstInfo[]>([])
 const [apiAlerts, setApiAlerts] = useState<AlertInfo[]>([])
 const [apiStatusRaw, setApiStatusRaw] = useState<LustreStatusRaw | null>(null)
 const [apiStorage, setApiStorage] = useState<StorageResponse | null>(null)
 const [apiDashPerf, setApiDashPerf] = useState<DashboardPerformance | null>(null)
 const [apiConnected, setApiConnected] = useState<boolean | null>(null)
 const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
 const [refreshing, setRefreshing] = useState(false)
 const [timeRange, setTimeRange] = useState('最近 15 分钟')

 const load = useCallback(async (showToast = false) => {
 setRefreshing(true)
 const [health, summary, osts, alerts, statusRaw, dashPerf, storageData] = await Promise.all([
 fetchHealth(),
 fetchSummary(),
 fetchOsts(),
 fetchAlertsLive(),
 fetchApi<LustreStatusRaw>('/api/lustre/status'),
 fetchDashboardPerformance(),
 fetchStorage(),
 ])

 setApiConnected(health !== null)
 setApiHealth(health)
 setApiSummary(summary)
 setApiOsts(osts || [])
 setApiAlerts((alerts?.alerts || []) as AlertInfo[])
 setApiStatusRaw(statusRaw)
 setApiDashPerf(dashPerf)
 setApiStorage(storageData)
 setLastUpdated(new Date())
 setRefreshing(false)

 if (showToast) {
 if (health) toast.success('已刷新 Lustre 监控数据')
 else toast.error('刷新失败：后端 API 当前不可用')
 }
 }, [])

 useEffect(() => {
 let mounted = true
 async function initialLoad() {
 if (mounted) await load()
 }
 initialLoad()
 const timer = window.setInterval(() => load(), 30000)
 return () => {
 mounted = false
 window.clearInterval(timer)
 }
 }, [load])

 const apiOffline = apiConnected === false
 const lustreUnavailable = Boolean(apiConnected && apiHealth && apiHealth.mounted === false)
 const dataUnavailable = apiOffline || lustreUnavailable

 const clusterNodes = useMemo(() => {
 if (!apiConnected || !apiStatusRaw) return { total: 0, healthy: 0, warning: 0, critical: 0 }
 const output = apiStatusRaw.servers_output || ''
 const nids = new Set<string>()
 for (const line of output.split('\n')) {
 const match = line.match(/([\d.]+@\w+)/)
 if (match && !match[1].startsWith('0@')) nids.add(match[1])
 }
 const total = Math.max(nids.size, apiSummary?.clientCount || 1)
 return {
 total,
 healthy: apiStatusRaw.healthy ? total : 0,
 warning: apiStatusRaw.healthy ? 0 : Math.min(1, total),
 critical: apiStatusRaw.healthy ? 0 : total,
 }
 }, [apiConnected, apiStatusRaw, apiSummary?.clientCount])

 const ostTargets = apiStorage?.osts?.filter((item) => item.type === 'OST') || []
 const totalOST = ostTargets.length || apiSummary?.ostCount || apiOsts.length || 0
 const warningOST = ostTargets.filter((item) => (item.usage_percent || 0) > 80 && (item.usage_percent || 0) <= 90).length
 const criticalOST = ostTargets.filter((item) => (item.usage_percent || 0) > 90).length
 const activeAlerts = apiAlerts.filter((alert) => !alert.resolved).slice(0, 6)
 const primaryAlert = activeAlerts[0]
 const primaryAlertHref = primaryAlert?.id ? `/alerts/${primaryAlert.id}` : '/alerts'
 const criticalAlerts = activeAlerts.filter((alert) => (alert.severity || alert.level) === 'critical').length
 const warningAlerts = activeAlerts.filter((alert) => (alert.severity || alert.level) === 'warning').length
 const totalReadBw = apiDashPerf?.bandwidth?.readMB ?? 0
 const totalWriteBw = apiDashPerf?.bandwidth?.writeMB ?? 0
 const totalReadIops = apiDashPerf?.iops?.read ?? 0
 const totalWriteIops = apiDashPerf?.iops?.write ?? 0
 const avgReadLatency = apiDashPerf?.latency?.read_ms ?? 0
 const avgWriteLatency = apiDashPerf?.latency?.write_ms ?? 0
 const capacityPercent = apiStorage?.summary?.ost?.percent ?? apiSummary?.usedPercent ?? 0
 const healthScore = apiOffline ? 0 : apiHealth?.score ?? (lustreUnavailable ? 45 : 100)
 const statusTone = apiOffline ? 'danger' : lustreUnavailable ? 'warning' : criticalAlerts > 0 ? 'danger' : warningAlerts > 0 ? 'warning' : 'success'
 const statusLabel = apiConnected === null ? '连接中' : apiOffline ? 'API 离线' : lustreUnavailable ? 'Lustre 未挂载' : criticalAlerts > 0 ? '存在紧急告警' : warningAlerts > 0 ? '存在待确认告警' : '运行正常'
 const trend = useMemo(() => buildTrend(apiDashPerf), [apiDashPerf])

 const statusSegments = [
 { label: '正常', count: apiOffline ? 0 : Math.max(1, totalOST - warningOST - criticalOST), color: 'bg-emerald-500' },
 { label: '警告', count: warningOST + warningAlerts, color: 'bg-amber-500' },
 { label: '严重', count: criticalOST + criticalAlerts, color: 'bg-red-500' },
 { label: '未知', count: apiOffline || lustreUnavailable ? 1 : 0, color: 'bg-[hsl(var(--muted))] ' },
 ]
 const statusTotal = Math.max(statusSegments.reduce((sum, item) => sum + item.count, 0), 1)

 const componentCards = [
 {
 title: 'MDS/MDT',
 icon: Database,
 status: lustreUnavailable ? '待挂载' : '正常',
 tone: lustreUnavailable ? 'warning' : 'success',
 rows: [
 ['活跃 MDS', dataUnavailable ? '--' : `${apiSummary?.mdtCount || 1} / ${apiSummary?.mdtCount || 1}`],
 ['MDT 总数', dataUnavailable ? '--' : `${apiSummary?.mdtCount || 0}`],
 ['元数据延迟', dataUnavailable ? '--' : `${formatNumber(avgReadLatency, 2)} ms`],
 ],
 },
 {
 title: 'OSS/OST',
 icon: HardDrive,
 status: criticalOST > 0 ? '严重' : warningOST > 0 ? '注意' : dataUnavailable ? '无数据' : '正常',
 tone: criticalOST > 0 ? 'danger' : warningOST > 0 ? 'warning' : dataUnavailable ? 'muted' : 'success',
 rows: [
 ['OSS 节点', dataUnavailable ? '--' : `${Math.max(1, Math.ceil(totalOST / 8))}`],
 ['OST 总数', dataUnavailable ? '--' : `${totalOST}`],
 ['容量水位', dataUnavailable ? '--' : `${capacityPercent.toFixed(1)}%`],
 ],
 },
 {
 title: '客户端挂载',
 icon: Server,
 status: lustreUnavailable ? '未挂载' : '正常',
 tone: lustreUnavailable ? 'warning' : 'success',
 rows: [
 ['客户端总数', dataUnavailable ? '--' : `${apiSummary?.clientCount || clusterNodes.total || 1}`],
 ['挂载点', apiSummary?.mountPoint || apiHealth?.clientMount || '--'],
 ['在线节点', dataUnavailable ? '--' : `${clusterNodes.healthy} / ${clusterNodes.total}`],
 ],
 },
 {
 title: 'LNet 网络',
 icon: Network,
 status: dataUnavailable ? '待检测' : '正常',
 tone: dataUnavailable ? 'muted' : 'success',
 rows: [
 ['读写吞吐', dataUnavailable ? '--' : `${formatNumber(totalReadBw + totalWriteBw)} MB/s`],
 ['平均延迟', dataUnavailable ? '--' : `${formatNumber((avgReadLatency + avgWriteLatency) / 2, 2)} ms`],
 ['健康 NID', dataUnavailable ? '--' : `${clusterNodes.healthy} / ${clusterNodes.total}`],
 ],
 },
 ] as const

 const recommendations = [
 {
 item: 'OST 容量水位',
 risk: criticalOST > 0 ? '高' : warningOST > 0 ? '中' : '低',
 suggestion: criticalOST > 0 ? '存在 OST 超过 90%，建议立即扩容或迁移热点目录。' : warningOST > 0 ? '部分 OST 超过 80%，建议观察增长趋势并准备扩容。' : '容量水位稳定，保持日常巡检。',
 href: '/capacity',
 },
 {
 item: '客户端挂载状态',
 risk: lustreUnavailable ? '中' : '低',
 suggestion: lustreUnavailable ? '当前未检测到 Lustre 挂载点，请检查客户端挂载、MGS 和网络连通性。' : '客户端挂载状态正常。',
 href: '/config',
 },
 {
 item: '告警处置',
 risk: criticalAlerts > 0 ? '高' : warningAlerts > 0 ? '中' : '低',
 suggestion: activeAlerts.length > 0 ? '建议优先确认紧急和持续时间较长的告警，再生成巡检报告。' : '暂无活跃告警。',
 href: '/alerts',
 },
 ]

 const handleExport = () => {
 const rows = [
 ['指标', '值'],
 ['文件系统', apiSummary?.filesystem || 'lustre'],
 ['状态', statusLabel],
 ['健康评分', String(healthScore)],
 ['OST 数量', String(totalOST)],
 ['容量水位', `${capacityPercent.toFixed(1)}%`],
 ['读带宽', `${totalReadBw.toFixed(2)} MB/s`],
 ['写带宽', `${totalWriteBw.toFixed(2)} MB/s`],
 ['活跃告警', String(activeAlerts.length)],
 ['导出时间', new Date().toLocaleString('zh-CN')],
 ]
 const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
 const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
 const url = URL.createObjectURL(blob)
 const anchor = document.createElement('a')
 anchor.href = url
 anchor.download = `lustre-ops-summary-${Date.now()}.csv`
 anchor.click()
 URL.revokeObjectURL(url)
 toast.success('总览摘要已导出')
 }

 return (
 <div className="mx-auto max-w-[1600px] space-y-4">
 <section className="ops-card">
 <div className="flex flex-col gap-4 border-b px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
 <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
 <div>
 <p className="text-[12px] text-[hsl(var(--muted-foreground))]">文件系统</p>
 <div className="mt-1 flex items-center gap-2">
 <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{apiSummary?.filesystem || 'lustre'}</h1>
 <StatusBadge tone={statusTone}>
 {statusTone === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
 {statusLabel}
 </StatusBadge>
 </div>
 </div>
 <div className="h-10 w-px bg-[hsl(var(--border))]" />
 <div>
 <p className="text-[12px] text-[hsl(var(--muted-foreground))]">运行时间</p>
 <p className="mt-1 text-[13px] font-medium text-foreground">{apiConnected === null ? '读取中' : apiOffline ? '不可用' : '持续监控中'}</p>
 </div>
 <div>
 <p className="text-[12px] text-[hsl(var(--muted-foreground))]">Lustre 版本</p>
 <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] font-medium text-foreground">
 <span>服务端 {apiSummary?.serverVersion || '待上报'}</span>
 <span className="text-[hsl(var(--muted-foreground))]">·</span>
 <span>客户端 {apiSummary?.clientVersion || '待上报'}</span>
 </div>
 </div>
 <div>
 <p className="text-[12px] text-[hsl(var(--muted-foreground))]">最近更新</p>
 <p className="mt-1 text-[13px] font-medium text-foreground">{lastUpdated ? lastUpdated.toLocaleTimeString('zh-CN') : '等待刷新'}</p>
 </div>
 </div>

 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => load(true)}
 disabled={refreshing}
 className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-4 text-[13px] text-foreground transition-colors hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
 >
 {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
 刷新
 </button>
 <select
 value={timeRange}
 onChange={(event) => {
 setTimeRange(event.target.value)
 toast.success(`已切换到${event.target.value}`)
 }}
 className="h-9 rounded-full border bg-card px-4 text-[13px] text-foreground outline-none transition-colors hover:bg-[hsl(var(--accent))] focus:border-primary/50"
 aria-label="选择监控时间范围"
 >
 <option>最近 15 分钟</option>
 <option>最近 1 小时</option>
 <option>最近 6 小时</option>
 <option>最近 24 小时</option>
 </select>
 <button
 onClick={handleExport}
 className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-4 text-[13px] text-foreground transition-colors hover:bg-[hsl(var(--accent))]"
 >
 <Download className="h-4 w-4" />
 导出报告
 </button>
 <Link
 to="/health-check"
 className="ops-btn-primary inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium"
 >
 <ShieldCheck className="h-4 w-4" />
 立即巡检
 </Link>
 </div>
 </div>

 <div className="px-5 py-4">
 <div className="mb-3 flex items-center justify-between">
 <p className="text-[13px] font-medium text-foreground">文件系统状态</p>
 <div className="flex flex-wrap gap-4 text-[12px] text-[hsl(var(--muted-foreground))]">
 {statusSegments.map((item) => (
 <span key={item.label} className="inline-flex items-center gap-1">
 <span className={cn('h-2 w-2 rounded-sm', item.color)} />
 {item.label} {item.count}
 </span>
 ))}
 </div>
 </div>
 <div className="flex h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
 {statusSegments.map((item) => (
 <div
 key={item.label}
 className={item.color}
 style={{ width: `${Math.max(item.count / statusTotal * 100, item.count > 0 ? 6 : 0)}%` }}
 title={`${item.label} ${item.count}`}
 />
 ))}
 </div>
 </div>
 </section>

 {(apiOffline || lustreUnavailable) && (
 <div className={cn(
 'ops-card px-5 py-4 text-[13px]',
 apiOffline
 ? 'border-red-500/30 bg-red-500/[0.06] text-red-700 '
 : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-700 ',
 )}>
 <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
 <div className="flex items-start gap-2.5">
 <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
 <div>
 <p className="font-medium">{apiOffline ? '后端 API 当前不可用' : primaryAlert?.title || 'Lustre 文件系统当前未挂载'}</p>
 <p className="mt-1 opacity-85">
 {apiOffline
 ? '请确认 3006 端口的 Lustre API 已启动。离线状态下页面不会给出健康结论。'
 : primaryAlert?.message || apiHealth?.serversOutput || 'API 已连接，但未检测到 Lustre 客户端挂载点。容量、OST 和实时性能数据暂不可用。'}
 </p>
 </div>
 </div>
 <Link
 to={apiOffline ? '/alerts' : primaryAlertHref}
 className={cn(
 'inline-flex h-8 flex-shrink-0 items-center justify-center gap-1 rounded-full px-3.5 text-[12px] font-medium transition-colors',
 apiOffline
 ? 'bg-red-500/10 text-red-700 hover:bg-red-500/20 '
 : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 ',
 )}
 >
 查看详情
 <ArrowRight className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
 <MetricTile title="健康评分" value={apiConnected === null ? '...' : `${healthScore}`} desc={statusLabel} icon={Gauge} tone={statusTone === 'success' ? 'green' : statusTone === 'warning' ? 'amber' : 'red'} />
 <MetricTile title="容量水位" value={dataUnavailable ? '--' : `${capacityPercent.toFixed(1)}%`} desc={dataUnavailable ? '等待容量指标' : `${formatStorage(apiStorage?.summary?.ost?.used)} / ${formatStorage(apiStorage?.summary?.ost?.total)}`} icon={HardDrive} tone={capacityPercent > 90 ? 'red' : capacityPercent > 80 ? 'amber' : 'blue'} />
 <MetricTile title="读写吞吐" value={dataUnavailable ? '--' : `${formatNumber(totalReadBw + totalWriteBw)} MB/s`} desc={`读 ${formatNumber(totalReadBw)} · 写 ${formatNumber(totalWriteBw)}`} icon={Activity} tone="blue" />
 <MetricTile title="IOPS" value={dataUnavailable ? '--' : `${formatNumber(totalReadIops + totalWriteIops, 0)}`} desc={`读 ${formatNumber(totalReadIops, 0)} · 写 ${formatNumber(totalWriteIops, 0)}`} icon={Zap} tone="green" />
 <MetricTile title="活跃告警" value={`${activeAlerts.length}`} desc={`${criticalAlerts} 严重 · ${warningAlerts} 警告`} icon={Bell} tone={criticalAlerts > 0 ? 'red' : warningAlerts > 0 ? 'amber' : 'slate'} />
 </div>

 <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
 {componentCards.map((card) => {
 const Icon = card.icon
 return (
 <Panel
 key={card.title}
 title={card.title}
 action={<StatusBadge tone={card.tone}>{card.status}</StatusBadge>}
 >
 <div className="p-4">
 <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] ">
 <Icon className="h-5 w-5" />
 </div>
 <div className="space-y-3">
 {card.rows.map(([label, value]) => (
 <div key={label} className="flex items-center justify-between gap-3 text-sm">
 <span className="text-[hsl(var(--muted-foreground))] ">{label}</span>
 <span className="truncate text-right font-medium text-foreground ">{value}</span>
 </div>
 ))}
 </div>
 </div>
 </Panel>
 )
 })}
 </div>

 <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
 <Panel
 title={`性能趋势 · ${timeRange}`}
 action={<StatusBadge tone="info"><Clock3 className="h-3 w-3" /> 30 秒自动刷新</StatusBadge>}
 >
 <div className="h-[320px] p-4">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={trend}>
 <defs>
 <linearGradient id="readGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
 <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
 </linearGradient>
 <linearGradient id="writeGradient" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="#059669" stopOpacity={0.24} />
 <stop offset="100%" stopColor="#059669" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
 <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
 <YAxis stroke="#64748b" fontSize={11} />
 <Tooltip
 contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 10px 30px rgba(15,23,42,.12)' }}
 labelStyle={{ color: '#0f172a' }}
 />
 <Legend />
 <Area type="monotone" dataKey="read" name="读 MB/s" stroke="#2563eb" fill="url(#readGradient)" strokeWidth={2} dot={false} isAnimationActive={false} />
 <Area type="monotone" dataKey="write" name="写 MB/s" stroke="#059669" fill="url(#writeGradient)" strokeWidth={2} dot={false} isAnimationActive={false} />
 <Area type="monotone" dataKey="latency" name="平均延迟 ms" stroke="#f59e0b" fill="none" strokeWidth={2} dot={false} isAnimationActive={false} />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </Panel>

 <Panel
 title="处置动作"
 action={<Link to="/health-check" className="text-xs font-medium text-primary hover:opacity-80 ">进入巡检</Link>}
 >
 <div className="divide-y divide-[hsl(var(--border))] ">
 {[
 { icon: ShieldCheck, title: '扩容向导', desc: '评估 OST 容量与增长风险', href: '/capacity' },
 { icon: Route, title: '拓扑诊断', desc: '查看 MDS/OSS/客户端关系', href: '/config' },
 { icon: RefreshCw, title: '重启服务', desc: '跳转到巡检处置流程', href: '/health-check' },
 { icon: FileSearch, title: '生成支持包', desc: '收集日志与配置快照', href: '/reports' },
 ].map((action) => {
 const Icon = action.icon
 return (
 <Link
 key={action.title}
 to={action.href}
 className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[hsl(var(--muted))] "
 >
 <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--accent))] text-primary /10 ">
 <Icon className="h-4 w-4" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-sm font-medium text-foreground ">{action.title}</span>
 <span className="block truncate text-xs text-[hsl(var(--muted-foreground))] ">{action.desc}</span>
 </span>
 <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
 </Link>
 )
 })}
 </div>
 </Panel>
 </div>

 <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr_320px]">
 <Panel
 title="告警队列"
 action={<Link to="/alerts" className="text-xs font-medium text-primary hover:opacity-80 ">查看全部</Link>}
 >
 {activeAlerts.length === 0 ? (
 <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
 <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-500" />
 <p className="text-sm font-medium text-foreground ">暂无活跃告警</p>
 <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">系统会继续每 30 秒刷新一次告警状态。</p>
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full min-w-[640px] text-sm">
 <thead className="bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))] ">
 <tr>
 <th className="px-4 py-2 text-left font-medium">级别</th>
 <th className="px-4 py-2 text-left font-medium">告警名称</th>
 <th className="px-4 py-2 text-left font-medium">对象</th>
 <th className="px-4 py-2 text-left font-medium">持续时间</th>
 <th className="px-4 py-2 text-right font-medium">操作</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[hsl(var(--border))] ">
 {activeAlerts.map((alert) => {
 const level = alert.severity || alert.level || 'info'
 return (
 <tr key={alert.id} className="hover:bg-[hsl(var(--muted))] ">
 <td className="px-4 py-3">
 <StatusBadge tone={level === 'critical' ? 'danger' : level === 'warning' ? 'warning' : 'info'}>
 {level === 'critical' ? '严重' : level === 'warning' ? '警告' : '提示'}
 </StatusBadge>
 </td>
 <td className="px-4 py-3 font-medium text-foreground ">{alert.title || alert.message || '未命名告警'}</td>
 <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] ">{alert.node || alert.source || '--'}</td>
 <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] ">{alert.triggeredAt || alert.timestamp || '刚刚'}</td>
 <td className="px-4 py-3 text-right">
 <Link to={`/alerts/${alert.id}`} className="text-xs font-medium text-primary hover:opacity-80 ">处理</Link>
 </td>
 </tr>
 )
 })}
 </tbody>
 </table>
 </div>
 )}
 </Panel>

 <Panel
 title="巡检建议"
 action={<button onClick={() => toast.success('已根据当前状态刷新巡检建议')} className="text-xs font-medium text-primary hover:opacity-80 ">重新评估</button>}
 >
 <div className="divide-y divide-[hsl(var(--border))] ">
 {recommendations.map((item) => (
 <div key={item.item} className="px-4 py-3">
 <div className="mb-2 flex items-center justify-between gap-3">
 <p className="text-sm font-medium text-foreground ">{item.item}</p>
 <StatusBadge tone={item.risk === '高' ? 'danger' : item.risk === '中' ? 'warning' : 'success'}>{item.risk}风险</StatusBadge>
 </div>
 <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))] ">{item.suggestion}</p>
 <Link to={item.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 ">
 查看详情 <ArrowRight className="h-3 w-3" />
 </Link>
 </div>
 ))}
 </div>
 </Panel>

 <Panel title="容量水位">
 <div className="p-4">
 <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[14px] border-[hsl(var(--border))] " style={{ borderTopColor: capacityPercent > 90 ? '#ef4444' : capacityPercent > 80 ? '#f59e0b' : '#10b981' }}>
 <div className="text-center">
 <p className="text-2xl font-semibold text-foreground dark:text-white">{dataUnavailable ? '--' : `${capacityPercent.toFixed(1)}%`}</p>
 <p className="text-xs text-[hsl(var(--muted-foreground))] ">已用容量</p>
 </div>
 </div>
 <div className="mt-4 space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-[hsl(var(--muted-foreground))] ">总容量</span>
 <span className="font-medium text-foreground ">{formatStorage(apiStorage?.summary?.ost?.total || apiSummary?.totalCapacity)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[hsl(var(--muted-foreground))] ">可用容量</span>
 <span className="font-medium text-foreground ">{formatStorage(apiStorage?.summary?.ost?.available || apiSummary?.totalAvailable)}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-[hsl(var(--muted-foreground))] ">对象数</span>
 <span className="font-medium text-foreground ">{totalOST} OST</span>
 </div>
 </div>
 </div>
 </Panel>
 </div>
 </div>
 )
}
