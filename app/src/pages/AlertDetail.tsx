import { Link, useNavigate, useParams } from 'react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
 AlertTriangle,
 ArrowLeft,
 Bot,
 CheckCircle2,
 Clock3,
 FileSearch,
 Loader2,
 RefreshCw,
 Route,
 Server,
 ShieldCheck,
 Sparkles,
 TerminalSquare,
} from 'lucide-react'
import {
 analyzeAlert,
 fetchAlertDetail,
 type AlertAnalysisResult,
} from '../lib/lustre-api'

type AlertDetailRecord = {
 id: string | number
 timestamp?: string
 level?: 'critical' | 'warning' | 'info' | string
 title?: string
 message?: string
 source?: string
 resolved?: boolean | number
 resolved_at?: string | null
}

const levelMap = {
 critical: { label: '紧急', badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:border-red-500/30' },
 warning: { label: '警告', badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' },
 info: { label: '信息', badge: 'bg-[hsl(var(--accent))] text-primary border-primary/30 /10 ' },
}

function normalizeLevel(level?: string) {
 if (level === 'critical' || level === 'warning' || level === 'info') return level
 return 'info'
}

function formatTime(value?: string | null) {
 if (!value) return '--'
 const parsed = new Date(value)
 if (Number.isNaN(parsed.getTime())) return value
 return parsed.toLocaleString('zh-CN')
}

function buildSuggestions(alert: AlertDetailRecord) {
 const text = `${alert.title || ''} ${alert.message || ''}`.toLowerCase()
 if (text.includes('mounted') || text.includes('mount') || text.includes('未挂载') || text.includes('no such device')) {
 return [
 '确认客户端挂载点是否存在：执行 mount | grep lustre 或 lfs df。',
 '检查 MGS/MDS/OSS 服务和 LNet 网络是否正常：执行 lctl list_nids、lfs check servers。',
 '确认 /etc/fstab 或挂载脚本中的 MGS NID、文件系统名称、挂载路径是否正确。',
 '如网络和服务恢复后仍未挂载，按变更窗口重新执行客户端挂载命令并观察日志中心异常日志。',
 ]
 }
 if (text.includes('nid') || text.includes('lnet') || text.includes('network')) {
 return [
 '检查节点 LNet NID 是否可见：执行 lctl list_nids。',
 '确认管理网、IB/OPA 网络和路由配置没有丢包或链路降级。',
 '查看相关节点 dmesg、/var/log/messages 中的 LNet 或连接超时日志。',
 ]
 }
 if (text.includes('ost') || text.includes('capacity') || text.includes('容量')) {
 return [
 '查看 OST 容量水位和热点目录，优先处理超过 90% 的目标。',
 '确认是否存在异常大文件、短时写入峰值或数据倾斜。',
 '按运维策略执行数据迁移、清理临时文件或扩容操作。',
 ]
 }
 return [
 '先在巡检管理中重新执行一次集群巡检，确认告警是否仍然存在。',
 '在日志中心筛选当前节点和 ERROR/WARN 日志，定位最近 30 分钟内的异常上下文。',
 '如果告警持续存在，记录告警 ID、节点、时间和日志片段后再执行修复动作。',
 ]
}

export default function AlertDetail() {
 const { id } = useParams()
 const navigate = useNavigate()
 const [alert, setAlert] = useState<AlertDetailRecord | null>(null)
 const [analysis, setAnalysis] = useState<AlertAnalysisResult | null>(null)
 const [analysisLoading, setAnalysisLoading] = useState(false)
 const [analysisError, setAnalysisError] = useState('')
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')

 const load = useCallback(async (showToast = false) => {
 if (!id) {
 setError('缺少告警 ID，无法加载详情')
 setLoading(false)
 return
 }
 setLoading(true)
 setError('')
 setAnalysisError('')
 const data = await fetchAlertDetail(id)
 if (!data?.alert) {
 setAlert(null)
 setError(data?.message || '没有找到这条告警，可能已被清理或归档')
 setLoading(false)
 if (showToast) toast.error('告警详情加载失败')
 return
 }
 setAlert(data.alert)
 setLoading(false)
 if (showToast) toast.success('告警详情已刷新')
 }, [id])

 useEffect(() => {
 let mounted = true
 async function initialLoad() {
 if (mounted) await load()
 }
 initialLoad()
 return () => {
 mounted = false
 }
 }, [load])

 const level = normalizeLevel(alert?.level)
 const levelConfig = levelMap[level]
 const suggestions = useMemo(() => (alert ? buildSuggestions(alert) : []), [alert])
 const resolved = Boolean(alert?.resolved)

 const runAnalysis = async () => {
 if (!id || analysisLoading) return
 setAnalysisLoading(true)
 setAnalysisError('')
 try {
 const result = await analyzeAlert(id)
 if (!result?.answer) throw new Error('后端未返回分析内容')
 setAnalysis(result)
 if (result.mode === 'ai') toast.success('智能分析已完成')
 else toast.success('已生成本地保守分析')
 } catch (err) {
 const message = err instanceof Error ? err.message : '执行失败'
 setAnalysisError(message)
 toast.error(message)
 } finally {
 setAnalysisLoading(false)
 }
 }

 return (
 <div className="mx-auto max-w-[1280px] space-y-4">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <div className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <Link to="/dashboard" className="hover:text-primary ">控制台</Link>
 <span>/</span>
 <Link to="/alerts" className="hover:text-primary ">告警管理</Link>
 <span>/</span>
 <span className="font-medium text-foreground ">告警详情</span>
 </div>
 <h1 className="text-2xl font-semibold text-foreground dark:text-white">告警详情</h1>
 <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] ">查看告警来源、原始信息和建议处置步骤。</p>
 </div>
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => navigate(-1)}
 className="inline-flex h-9 items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-card px-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] "
 >
 <ArrowLeft className="h-4 w-4" />
 返回
 </button>
 <button
 onClick={() => load(true)}
 disabled={loading}
 className="inline-flex h-9 items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-card px-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-60 "
 >
 {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
 刷新
 </button>
 </div>
 </div>

 {loading ? (
 <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] shadow-sm ">
 <Loader2 className="mr-2 h-5 w-5 animate-spin" />
 正在加载告警详情...
 </div>
 ) : error ? (
 <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 ">
 <div className="flex items-start gap-3">
 <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
 <div>
 <p className="font-medium">暂时无法查看这条告警</p>
 <p className="mt-1 text-sm opacity-85">{error}</p>
 <div className="mt-4 flex flex-wrap gap-2">
 <Link to="/alerts" className="inline-flex h-9 items-center rounded-md bg-amber-600 px-3 text-sm font-medium text-white hover:bg-amber-500">返回告警管理</Link>
 <button onClick={() => load(true)} className="inline-flex h-9 items-center rounded-md border border-amber-300 px-3 text-sm font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:hover:bg-amber-500/10">重新加载</button>
 </div>
 </div>
 </div>
 </div>
 ) : alert ? (
 <>
 <section className="rounded-2xl border border-[hsl(var(--border))] bg-card shadow-sm ">
 <div className="border-b border-[hsl(var(--border))] px-5 py-4 ">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
 <div>
 <div className="mb-3 flex flex-wrap items-center gap-2">
 <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${levelConfig.badge}`}>
 <AlertTriangle className="h-3.5 w-3.5" />
 {levelConfig.label}
 </span>
 <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${resolved ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 ' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] '}`}>
 {resolved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
 {resolved ? '已恢复' : '处理中'}
 </span>
 <span className="text-xs text-[hsl(var(--muted-foreground))] ">告警 ID：{alert.id}</span>
 </div>
 <h2 className="text-xl font-semibold text-foreground dark:text-white">{alert.title || '未命名告警'}</h2>
 <p className="mt-2 max-w-4xl text-sm leading-6 text-[hsl(var(--muted-foreground))] ">{alert.message || '这条告警没有附加描述。'}</p>
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-0 divide-y divide-[hsl(var(--border))] md:grid-cols-3 md:divide-x md:divide-y-0">
 <div className="p-5">
 <div className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <Server className="h-4 w-4" />
 告警对象
 </div>
 <p className="text-sm font-medium text-foreground ">{alert.source || '未标记节点'}</p>
 </div>
 <div className="p-5">
 <div className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <Clock3 className="h-4 w-4" />
 触发时间
 </div>
 <p className="text-sm font-medium text-foreground ">{formatTime(alert.timestamp)}</p>
 </div>
 <div className="p-5">
 <div className="mb-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <CheckCircle2 className="h-4 w-4" />
 恢复时间
 </div>
 <p className="text-sm font-medium text-foreground ">{formatTime(alert.resolved_at)}</p>
 </div>
 </div>
 </section>

 <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
 <section className="rounded-2xl border border-[hsl(var(--border))] bg-card p-5 shadow-sm ">
 <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
 <div className="flex items-start gap-2">
 <Bot className="mt-0.5 h-5 w-5 text-primary " />
 <div>
 <h3 className="font-semibold text-foreground dark:text-white">智能分析与人工处置建议</h3>
 <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))] ">
 模型只做诊断分析和人工操作建议；涉及存储数据、挂载、重启、配置修改的动作必须由运维管理员手动确认执行。
 </p>
 </div>
 </div>
 <button
 onClick={runAnalysis}
 disabled={analysisLoading}
 className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
 >
 {analysisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
 {analysisLoading ? '分析中' : '智能分析'}
 </button>
 </div>

 {analysisError && (
 <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 ">
 {analysisError}
 </div>
 )}

 {analysis ? (
 <div className="space-y-3">
 <div className="flex flex-wrap items-center gap-2 text-xs">
 <span className="rounded-full border border-primary/30 bg-[hsl(var(--accent))] px-2 py-1 font-medium text-primary /10 ">
 {analysis.mode === 'ai' ? '大模型分析' : '本地保守分析'}
 </span>
 {analysis.model && <span className="text-[hsl(var(--muted-foreground))] ">模型：{analysis.model}</span>}
 {analysis.context?.checkedAt && <span className="text-[hsl(var(--muted-foreground))] ">检查时间：{formatTime(analysis.context.checkedAt)}</span>}
 </div>
 <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm leading-6 text-foreground ">
 {analysis.answer}
 </pre>
 {analysis.message && analysis.mode !== 'ai' && (
 <p className="text-xs leading-5 text-amber-700 ">说明：{analysis.message}</p>
 )}
 </div>
 ) : (
 <div className="space-y-3">
 <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))] ">
 点击“智能分析”后，系统会先收集只读检查上下文，再让模型基于告警现象、Lustre 状态、LNet、挂载配置和最近日志给出人工处置建议。
 </div>
 <ol className="space-y-3">
 {suggestions.map((item, index) => (
 <li key={item} className="flex gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-sm leading-6 text-[hsl(var(--muted-foreground))] ">
 <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{index + 1}</span>
 <span>{item}</span>
 </li>
 ))}
 </ol>
 </div>
 )}
 </section>

 <section className="rounded-2xl border border-[hsl(var(--border))] bg-card p-5 shadow-sm ">
 <h3 className="mb-4 font-semibold text-foreground dark:text-white">后续操作</h3>
 <div className="space-y-2">
 <Link to="/health-check" className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:border-primary/50 hover:bg-[hsl(var(--accent))] hover:text-primary dark:hover:opacity-90/10">
 <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />进入巡检管理</span>
 <Route className="h-4 w-4" />
 </Link>
 <Link to="/logs" className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:border-primary/50 hover:bg-[hsl(var(--accent))] hover:text-primary dark:hover:opacity-90/10">
 <span className="inline-flex items-center gap-2"><FileSearch className="h-4 w-4" />查看异常日志</span>
 <TerminalSquare className="h-4 w-4" />
 </Link>
 <Link to="/alerts" className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:border-primary/50 hover:bg-[hsl(var(--accent))] hover:text-primary dark:hover:opacity-90/10">
 <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />返回告警队列</span>
 <ArrowLeft className="h-4 w-4" />
 </Link>
 </div>
 </section>
 </div>
 </>
 ) : null}
 </div>
 )
}
