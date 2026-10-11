import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
 Legend,
} from 'recharts';
import {
 AlertOctagon,
 AlertTriangle,
 Info,
 CheckCircle2,
 BellOff,
 Plus,
 Download,
 Search,
 ChevronRight,
 Mail,
 MessageCircle,
 Send,
 Check,
 Loader2,
 Server,
 Wifi,
 Gauge,
 HardDrive,
 Eye,
 VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import {
 alertVolumeData,
 defaultEmailConfig,
 defaultFeishuConfig,
} from '@/data/alertsData';
import type { AlertHistoryItem, AlertRule } from '@/data/alertsData';
import { fetchAlertsActive, fetchAlertsHistory, fetchAlertRules, saveAlertRule, deleteAlertRule, testNotify, setChannel, fetchChannels } from '@/lib/cluster';

const severityConfig = {
 critical: { color: '#EF4444', bg: 'bg-[#EF4444]/10', text: 'text-[#EF4444]', label: '紧急', icon: AlertOctagon },
 warning: { color: '#F59E0B', bg: 'bg-[#F59E0B]/10', text: 'text-[#F59E0B]', label: '警告', icon: AlertTriangle },
 info: { color: '#3B82F6', bg: 'bg-[#3B82F6]/10', text: 'text-[#3B82F6]', label: '信息', icon: Info },
};

const categoryConfig = {
 storage: { icon: HardDrive, label: '存储' },
 network: { icon: Wifi, label: '网络' },
 performance: { icon: Gauge, label: '性能' },
 node: { icon: Server, label: '节点' },
};

function SeverityBadge({ severity }: { severity: keyof typeof severityConfig }) {
 const config = severityConfig[severity];
 const Icon = config.icon;
 return (
 <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', config.bg, config.text)}>
 <Icon className="h-3 w-3" />
 {config.label}
 </span>
 );
}

export default function AlertsPage() {
 const [activeTab, setActiveTab] = useState('active');
 const [severityFilter, setSeverityFilter] = useState<string>('全部');
 const [categoryFilter, setCategoryFilter] = useState<string>('全部');
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedAlert, setSelectedAlert] = useState<AlertHistoryItem | null>(null);
 const [detailOpen, setDetailOpen] = useState(false);
 const [ruleModalOpen, setRuleModalOpen] = useState(false);
 const [rules, setRules] = useState<AlertRule[]>([]);
 const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);
 const [historyRows, setHistoryRows] = useState<AlertHistoryItem[]>([]);
 const [ruleStep, setRuleStep] = useState(1);
 const [testEmailLoading, setTestEmailLoading] = useState(false);
 const [testFeishuLoading, setTestFeishuLoading] = useState(false);
 const [emailConfig, setEmailConfig] = useState(defaultEmailConfig);
 const [feishuConfig, setFeishuConfig] = useState(defaultFeishuConfig);
 const [showFeishuPreview, setShowFeishuPreview] = useState(false);

 // 从后端加载真实告警与规则
 const loadAlerts = useCallback(async () => {
 const map = (a: any): AlertHistoryItem => ({
 id: String(a.id),
 severity: a.level,
 title: a.title,
 description: a.message,
 category: /ost|mdt|容量|使用率|storage/i.test(a.title + a.message || '') ? 'storage' as const : /lnet|nid|network|网络|连接/i.test(a.title + a.message || '') ? 'network' as const : 'node' as const,
 node: a.source || '—',
 triggeredAt: a.timestamp,
 resolvedAt: a.resolved_at || '—',
 resolutionTime: '—',
 resolvedBy: '—',
 status: a.resolved ? 'resolved' as const : 'open' as const,
 });
 try {
 const [active, hist] = await Promise.all([fetchAlertsActive(), fetchAlertsHistory()]);
 setAlerts(active.map(map));
 setHistoryRows(hist.map(map));
 } catch { /* ignore */ }
 }, []);

 const loadRulesData = useCallback(async () => {
 const rs = await fetchAlertRules();
 setRules(rs.map((r) => ({
 id: r.id,
 name: r.name,
 metric: r.metric,
 condition: r.condition,
 threshold: r.threshold,
 severity: r.severity,
 channels: [],
 enabled: !!r.enabled,
 interval: '60s',
 duration: '0',
 tags: [],
 })));
 }, []);

 useEffect(() => {
 void loadAlerts();
 void loadRulesData();
 // 加载已保存的通知渠道配置（飞书）
 (async () => {
 const ch = await fetchChannels();
 const f = ch.feishu;
 if (f) {
 setFeishuConfig((prev) => ({
 ...prev,
 webhookUrl: (f.webhookMasked as string) || prev.webhookUrl,
 }));
 }
 })();
 // 每 30s 刷新一次活跃告警
 const timer = window.setInterval(() => { void loadAlerts(); }, 30000);
 return () => window.clearInterval(timer);
 }, [loadAlerts, loadRulesData]);

 const filteredAlerts = (activeTab === 'history' ? historyRows : alerts).filter((alert) => {
 if (severityFilter !== '全部' && alert.severity !== severityFilter) return false;
 if (categoryFilter !== '全部' && alert.category !== categoryFilter) return false;
 if (searchQuery && !alert.title.includes(searchQuery) && !alert.description.includes(searchQuery)) return false;
 return true;
 });

 const openAlertDetail = (alert: AlertHistoryItem) => {
 setSelectedAlert(alert);
 setDetailOpen(true);
 };

 const toggleRule = async (id: string) => {
 const r = rules.find((x) => x.id === id);
 if (!r) return;
 await saveAlertRule({ id: r.id, name: r.name, metric: r.metric, condition: r.condition, threshold: r.threshold, severity: r.severity, enabled: !r.enabled });
 void loadRulesData();
 };

 const handleTestEmail = () => {
 setTestEmailLoading(true);
 setTimeout(() => {
 setTestEmailLoading(false);
 toast.error('邮件通知暂未接入，请使用飞书渠道');
 }, 800);
 };

 const handleTestFeishu = async () => {
 setTestFeishuLoading(true);
 try {
 const r = await testNotify('feishu');
 if (r.ok) toast.success('飞书测试消息已发送，请查看群消息');
 else toast.error(r.message || '发送失败，请先在“通知设置”配置并启用飞书 Webhook');
 } catch {
 toast.error('发送失败');
 } finally {
 setTestFeishuLoading(false);
 setShowFeishuPreview(true);
 }
 };

 // Stats
 const criticalCount = alerts.filter((a) => a.severity === 'critical' && a.status === 'open').length;
 const warningCount = alerts.filter((a) => a.severity === 'warning' && a.status === 'open').length;
 const infoCount = alerts.filter((a) => a.severity === 'info' && a.status === 'open').length;
 const resolvedToday = historyRows.filter((a) => a.status === 'resolved').length;
 const silencedCount = rules.filter((r) => !r.enabled).length;

 return (
 <div className="min-h-[100dvh] bg-[hsl(var(--muted))] p-6">
 {/* Page Header */}
 <motion.div
 initial={{ opacity: 0, y: -10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
 className="mb-6"
 >
 <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <span>告警中心</span>
 <ChevronRight className="h-4 w-4" />
 <span className="text-foreground ">告警管理</span>
 </div>
 <div className="mt-2 flex items-end justify-between">
 <div>
 <h1 className="text-4xl font-bold tracking-tight text-foreground ">告警与通知</h1>
 <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] ">集群异常监控 · 告警规则 · 通知渠道配置</p>
 </div>
 <div className="flex gap-2">
 <Button
 onClick={() => setRuleModalOpen(true)}
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 >
 <Plus className="mr-1 h-4 w-4" />
 新建告警规则
 </Button>
 <Button
 variant="outline"
 onClick={() => {
 setActiveTab('rules');
 toast('已切换到告警规则页，可继续配置静默策略');
 }}
 className="border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:text-foreground "
 >
 <BellOff className="mr-1 h-4 w-4" />
 静默管理
 </Button>
 <Button
 variant="outline"
 onClick={() => toast.success(`已导出 ${filteredAlerts.length} 条告警记录（测试环境为模拟导出）`)}
 className="border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:text-foreground "
 >
 <Download className="mr-1 h-4 w-4" />
 导出日志
 </Button>
 </div>
 </div>
 </motion.div>

 {/* Alert Stats Bar */}
 <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
 {[
 {
 label: '紧急告警',
 value: String(criticalCount),
 sub: '需立即处理',
 icon: AlertOctagon,
 color: '#EF4444',
 pulse: true,
 },
 {
 label: '警告告警',
 value: String(warningCount),
 sub: '需关注',
 icon: AlertTriangle,
 color: '#F59E0B',
 pulse: false,
 },
 {
 label: '信息通知',
 value: String(infoCount),
 sub: '仅供参考',
 icon: Info,
 color: '#3B82F6',
 pulse: false,
 },
 {
 label: '今日已解决',
 value: String(resolvedToday),
 sub: '平均解决时间 8分钟',
 icon: CheckCircle2,
 color: '#10B981',
 pulse: false,
 },
 {
 label: '静默中',
 value: String(silencedCount),
 sub: '2条规则静默',
 icon: BellOff,
 color: '#64748B',
 pulse: false,
 },
 ].map((stat, i) => (
 <motion.div
 key={stat.label}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
 className={cn(
 'relative rounded-xl border border-[hsl(var(--border))] bg-card p-5 transition-all hover:border-[#3B82F6]/30',
 stat.pulse && 'animate-pulse'
 )}
 >
 <div className="flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${stat.color}15` }}>
 <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
 </div>
 <span className="text-sm text-[hsl(var(--muted-foreground))] ">{stat.label}</span>
 </div>
 <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: stat.color }}>
 {stat.value}
 </div>
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">{stat.sub}</div>
 </motion.div>
 ))}
 </div>

 {/* Tabbed Content */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.5, delay: 0.4 }}
 >
 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="mb-4 border border-[hsl(var(--border))] bg-card ">
 <TabsTrigger value="active" className="data-[state=active]:bg-[#0EA5E9]/20 data-[state=active]:text-[#0EA5E9]">
 活跃告警
 </TabsTrigger>
 <TabsTrigger value="history" className="data-[state=active]:bg-[#0EA5E9]/20 data-[state=active]:text-[#0EA5E9]">
 告警历史
 </TabsTrigger>
 <TabsTrigger value="rules" className="data-[state=active]:bg-[#0EA5E9]/20 data-[state=active]:text-[#0EA5E9]">
 告警规则
 </TabsTrigger>
 <TabsTrigger value="notifications" className="data-[state=active]:bg-[#0EA5E9]/20 data-[state=active]:text-[#0EA5E9]">
 通知设置
 </TabsTrigger>
 </TabsList>

 {/* Tab 1: Active Alerts */}
 <TabsContent value="active" className="mt-0">
 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5">
 {/* Filter Bar */}
 <div className="mb-4 flex flex-wrap items-center gap-3">
 <div className="flex items-center gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-1">
 <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] " />
 <Input
 placeholder="搜索告警..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-7 w-48 border-0 bg-transparent text-sm text-foreground placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-0"
 />
 </div>
 <div className="flex gap-1">
 {['全部', 'critical', 'warning', 'info'].map((s) => (
 <button
 key={s}
 onClick={() => setSeverityFilter(s)}
 className={cn(
 'rounded-md px-2.5 py-1 text-xs transition-colors',
 severityFilter === s ? 'bg-[#0EA5E9]/20 text-[#0EA5E9]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--muted-foreground))] '
 )}
 >
 {s === '全部' ? '全部' : severityConfig[s as keyof typeof severityConfig].label}
 </button>
 ))}
 </div>
 <div className="flex gap-1">
 {['全部', 'storage', 'network', 'performance', 'node'].map((c) => (
 <button
 key={c}
 onClick={() => setCategoryFilter(c)}
 className={cn(
 'rounded-md px-2.5 py-1 text-xs transition-colors',
 categoryFilter === c ? 'bg-[#6366F1]/20 text-[#6366F1]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--muted-foreground))] '
 )}
 >
 {c === '全部' ? '全部' : categoryConfig[c as keyof typeof categoryConfig].label}
 </button>
 ))}
 </div>
 </div>

 {/* Alert Cards */}
 <div className="space-y-3">
 {filteredAlerts.filter((a) => a.status === 'open').length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 text-[hsl(var(--muted-foreground))] ">
 <CheckCircle2 className="mb-3 h-12 w-12 text-[#10B981]" />
 <p>当前无活跃告警</p>
 </div>
 ) : (
 filteredAlerts
 .filter((a) => a.status === 'open')
 .map((alert, i) => (
 <motion.div
 key={alert.id}
 initial={{ opacity: 0, x: -20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.3, delay: i * 0.1 }}
 onClick={() => openAlertDetail(alert)}
 className={cn(
 'cursor-pointer rounded-2xl border-l-4 bg-[hsl(var(--muted))] p-4 transition-all hover:bg-card ',
 alert.severity === 'critical'
 ? 'border-l-[#EF4444]'
 : alert.severity === 'warning'
 ? 'border-l-[#F59E0B]'
 : 'border-l-[#3B82F6]'
 )}
 >
 <div className="flex items-start justify-between">
 <div className="flex items-start gap-3">
 <div className="mt-0.5">
 <SeverityBadge severity={alert.severity} />
 </div>
 <div>
 <div className="font-medium text-foreground ">{alert.title}</div>
 <div className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))] ">{alert.description}</div>
 <div className="mt-2 flex flex-wrap items-center gap-2">
 <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] ">
 {categoryConfig[alert.category].label}
 </Badge>
 <Badge variant="outline" className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] ">
 {alert.node}
 </Badge>
 <span className="text-xs text-[hsl(var(--muted-foreground))] ">{alert.triggeredAt}</span>
 </div>
 </div>
 </div>
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="outline"
 className="h-7 border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={(e) => {
 e.stopPropagation();
 toast.success(`已确认告警: ${alert.title}`);
 }}
 >
 <Check className="mr-1 h-3 w-3" />
 确认
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="h-7 border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={(e) => e.stopPropagation()}
 >
 <VolumeX className="mr-1 h-3 w-3" />
 静默
 </Button>
 </div>
 </div>
 </motion.div>
 ))
 )}
 </div>
 </div>
 </TabsContent>

 {/* Tab 2: Alert History */}
 <TabsContent value="history" className="mt-0">
 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5">
 <div className="mb-4 flex items-center justify-between">
 <div className="flex gap-1">
 {['全部', 'critical', 'warning', 'info'].map((s) => (
 <button
 key={s}
 onClick={() => setSeverityFilter(s)}
 className={cn(
 'rounded-md px-2.5 py-1 text-xs transition-colors',
 severityFilter === s ? 'bg-[#0EA5E9]/20 text-[#0EA5E9]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--muted-foreground))] '
 )}
 >
 {s === '全部' ? '全部' : severityConfig[s as keyof typeof severityConfig].label}
 </button>
 ))}
 </div>
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">
 本周告警总数: 45 · MTTR: 12分钟 · 重复告警: 3
 </div>
 </div>

 {/* Alert Volume Chart */}
 <div className="mb-4" style={{ height: 200 }}>
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={alertVolumeData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
 <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
 <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
 <Tooltip
 contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9' }}
 itemStyle={{ fontSize: 12 }}
 />
 <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
 <Bar dataKey="critical" name="紧急" fill="#EF4444" radius={[4, 4, 0, 0]} />
 <Bar dataKey="warning" name="警告" fill="#F59E0B" radius={[4, 4, 0, 0]} />
 <Bar dataKey="info" name="信息" fill="#3B82F6" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </div>

 {/* History Table */}
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-[hsl(var(--border))] text-left text-xs uppercase text-[hsl(var(--muted-foreground))] ">
 <th className="px-3 py-3 font-medium">告警</th>
 <th className="px-3 py-3 font-medium">级别</th>
 <th className="px-3 py-3 font-medium">分类</th>
 <th className="px-3 py-3 font-medium">节点</th>
 <th className="px-3 py-3 font-medium">触发时间</th>
 <th className="px-3 py-3 font-medium">解决时间</th>
 <th className="px-3 py-3 font-medium">耗时</th>
 <th className="px-3 py-3 font-medium">处理人</th>
 <th className="px-3 py-3 font-medium">状态</th>
 </tr>
 </thead>
 <tbody>
 {filteredAlerts.map((alert) => (
 <tr
 key={alert.id}
 onClick={() => openAlertDetail(alert)}
 className="cursor-pointer border-b border-[hsl(var(--border))] transition-colors hover:bg-card "
 >
 <td className="px-3 py-3">
 <div className="max-w-[200px] truncate font-medium text-foreground ">{alert.title}</div>
 </td>
 <td className="px-3 py-3">
 <SeverityBadge severity={alert.severity} />
 </td>
 <td className="px-3 py-3 text-[hsl(var(--muted-foreground))] ">{categoryConfig[alert.category].label}</td>
 <td className="px-3 py-3 text-[hsl(var(--muted-foreground))] ">{alert.node}</td>
 <td className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{alert.triggeredAt}</td>
 <td className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{alert.resolvedAt}</td>
 <td className="px-3 py-3 text-xs tabular-nums text-[hsl(var(--muted-foreground))] ">{alert.resolutionTime}</td>
 <td className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{alert.resolvedBy}</td>
 <td className="px-3 py-3">
 {alert.status === 'resolved' ? (
 <span className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-xs text-[#10B981]">
 <CheckCircle2 className="h-3 w-3" /> 已解决
 </span>
 ) : alert.status === 'acknowledged' ? (
 <span className="inline-flex items-center gap-1 rounded-full bg-[#0EA5E9]/10 px-2 py-0.5 text-xs text-[#0EA5E9]">
 <Eye className="h-3 w-3" /> 已确认
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 rounded-full bg-[#EF4444]/10 px-2 py-0.5 text-xs text-[#EF4444]">
 <AlertOctagon className="h-3 w-3" /> 未处理
 </span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </TabsContent>

 {/* Tab 3: Alert Rules */}
 <TabsContent value="rules" className="mt-0">
 <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-5">
 <div className="mb-4 flex items-center justify-between">
 <h3 className="text-lg font-semibold text-foreground ">告警规则</h3>
 <Button
 onClick={() => setRuleModalOpen(true)}
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 >
 <Plus className="mr-1 h-4 w-4" />
 新建规则
 </Button>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-[hsl(var(--border))] text-left text-xs uppercase text-[hsl(var(--muted-foreground))] ">
 <th className="px-3 py-3 font-medium">规则名称</th>
 <th className="px-3 py-3 font-medium">监控指标</th>
 <th className="px-3 py-3 font-medium">条件</th>
 <th className="px-3 py-3 font-medium">阈值</th>
 <th className="px-3 py-3 font-medium">级别</th>
 <th className="px-3 py-3 font-medium">通知渠道</th>
 <th className="px-3 py-3 font-medium">状态</th>
 <th className="px-3 py-3 font-medium">操作</th>
 </tr>
 </thead>
 <tbody>
 {rules.map((rule) => (
 <tr key={rule.id} className="border-b border-[hsl(var(--border))] transition-colors hover:bg-card ">
 <td className="px-3 py-3 font-medium text-foreground ">{rule.name}</td>
 <td className="px-3 py-3 text-[hsl(var(--muted-foreground))] ">{rule.metric}</td>
 <td className="px-3 py-3 text-[hsl(var(--muted-foreground))] ">{rule.condition}</td>
 <td className="px-3 py-3 font-medium tabular-nums text-foreground ">{rule.threshold}</td>
 <td className="px-3 py-3">
 <SeverityBadge severity={rule.severity} />
 </td>
 <td className="px-3 py-3 text-[hsl(var(--muted-foreground))] ">{(rule.channels || []).join(', ') || '—'}</td>
 <td className="px-3 py-3">
 <Switch
 checked={rule.enabled}
 onCheckedChange={() => toggleRule(rule.id)}
 />
 </td>
 <td className="px-3 py-3">
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-xs text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={() => toast('在“新建规则”中修改指标/阈值后可覆盖同名规则')}
 >
 编辑
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-xs text-[#EF4444] hover:text-[#EF4444]"
 onClick={async () => { await deleteAlertRule(rule.id); toast.success('规则已删除'); void loadRulesData(); }}
 >
 删除
 </Button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </TabsContent>

 {/* Tab 4: Notification Settings */}
 <TabsContent value="notifications" className="mt-0">
 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 {/* Email Configuration */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4 }}
 className="rounded-xl border border-[hsl(var(--border))] bg-card p-5"
 >
 <div className="mb-4 flex items-center gap-2">
 <Mail className="h-5 w-5 text-[#0EA5E9]" />
 <h3 className="text-lg font-semibold text-foreground ">邮件通知</h3>
 </div>
 <div className="space-y-3">
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">SMTP服务器</label>
 <Input
 value={emailConfig.smtpServer}
 onChange={(e) => setEmailConfig({ ...emailConfig, smtpServer: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">端口</label>
 <Input
 value={emailConfig.port}
 onChange={(e) => setEmailConfig({ ...emailConfig, port: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">发件人地址</label>
 <Input
 value={emailConfig.sender}
 onChange={(e) => setEmailConfig({ ...emailConfig, sender: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 />
 </div>
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">用户名</label>
 <Input
 value={emailConfig.username}
 onChange={(e) => setEmailConfig({ ...emailConfig, username: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">密码</label>
 <Input
 type="password"
 value={emailConfig.password}
 onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 placeholder="输入SMTP密码"
 />
 </div>
 <div className="flex items-center gap-2">
 <Switch
 checked={emailConfig.tls}
 onCheckedChange={(v) => setEmailConfig({ ...emailConfig, tls: v })}
 />
 <span className="text-sm text-[hsl(var(--muted-foreground))] ">启用 TLS</span>
 </div>
 <div className="flex gap-2 pt-2">
 <Button
 variant="outline"
 className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={handleTestEmail}
 disabled={testEmailLoading}
 >
 {testEmailLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
 发送测试邮件
 </Button>
 <Button className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90">
 保存
 </Button>
 </div>
 </div>
 </motion.div>

 {/* Feishu Webhook Configuration */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.4, delay: 0.1 }}
 className="rounded-xl border border-[hsl(var(--border))] bg-card p-5"
 >
 <div className="mb-4 flex items-center gap-2">
 <MessageCircle className="h-5 w-5 text-[#6366F1]" />
 <h3 className="text-lg font-semibold text-foreground ">飞书Webhook机器人</h3>
 </div>
 <div className="space-y-3">
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">Webhook URL</label>
 <Input
 value={feishuConfig.webhookUrl}
 onChange={(e) => setFeishuConfig({ ...feishuConfig, webhookUrl: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
 />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">密钥 (可选)</label>
 <Input
 type="password"
 value={feishuConfig.secret}
 onChange={(e) => setFeishuConfig({ ...feishuConfig, secret: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 placeholder="签名密钥"
 />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">@指定用户 (可选)</label>
 <Input
 value={feishuConfig.atUsers}
 onChange={(e) => setFeishuConfig({ ...feishuConfig, atUsers: e.target.value })}
 className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground "
 placeholder="@admin @ops-team"
 />
 </div>
 <div className="flex gap-2 pt-2">
 <Button
 variant="outline"
 className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={handleTestFeishu}
 disabled={testFeishuLoading}
 >
 {testFeishuLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
 发送测试消息
 </Button>
 <Button
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 onClick={async () => {
 const ok = await setChannel('feishu', {
 enabled: true,
 webhookUrl: feishuConfig.webhookUrl,
 secret: feishuConfig.secret,
 atUsers: feishuConfig.atUsers,
 });
 if (ok) toast.success('飞书通知已保存并启用');
 else toast.error('保存失败');
 }}
 >
 保存
 </Button>
 </div>

 {/* Feishu Preview Card */}
 <AnimatePresence>
 {showFeishuPreview && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 className="mt-3 overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3"
 >
 <div className="mb-2 text-xs text-[hsl(var(--muted-foreground))] ">飞书消息预览</div>
 <div className="rounded-lg bg-card p-3">
 <div className="flex items-start gap-2">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EF4444]/10">
 <AlertOctagon className="h-4 w-4 text-[#EF4444]" />
 </div>
 <div>
 <div className="text-sm font-medium text-foreground ">🔔 LustreOps 告警通知</div>
 <div className="mt-1 text-xs text-[#EF4444]">【紧急】Client-23 连接中断</div>
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">客户端节点 Client-23 与 MGS 连接中断超过5分钟</div>
 <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-[hsl(var(--muted-foreground))] ">
 <span>节点: Client-23</span>
 <span>时间: 14:15:42</span>
 </div>
 </div>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </motion.div>
 </div>
 </TabsContent>
 </Tabs>
 </motion.div>

 {/* Alert Detail Modal */}
 <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
 <DialogContent className="max-w-2xl border-[hsl(var(--border))] bg-card text-foreground ">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-foreground ">
 {selectedAlert && <SeverityBadge severity={selectedAlert.severity} />}
 {selectedAlert?.title}
 </DialogTitle>
 <DialogDescription className="text-[hsl(var(--muted-foreground))] ">{selectedAlert?.description}</DialogDescription>
 </DialogHeader>
 {selectedAlert && (
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-3 text-sm">
 <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">触发时间</div>
 <div className="mt-1 text-foreground ">{selectedAlert.triggeredAt}</div>
 </div>
 <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">节点</div>
 <div className="mt-1 text-foreground ">{selectedAlert.node}</div>
 </div>
 <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">分类</div>
 <div className="mt-1 text-foreground ">{categoryConfig[selectedAlert.category].label}</div>
 </div>
 <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">状态</div>
 <div className="mt-1">
 {selectedAlert.status === 'resolved' ? (
 <span className="text-[#10B981]">已解决</span>
 ) : selectedAlert.status === 'acknowledged' ? (
 <span className="text-[#0EA5E9]">已确认</span>
 ) : (
 <span className="text-[#EF4444]">未处理</span>
 )}
 </div>
 </div>
 </div>

 {/* Timeline */}
 <div className="relative pl-4">
 <div className="absolute left-1.5 top-0 bottom-0 w-px bg-card " />
 <div className="space-y-3">
 <div className="relative flex items-start gap-3">
 <div className="absolute -left-[9px] mt-1 h-2 w-2 rounded-full bg-[#EF4444]" />
 <div>
 <div className="text-sm font-medium text-foreground ">告警触发</div>
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">{selectedAlert.triggeredAt}</div>
 </div>
 </div>
 {selectedAlert.status === 'resolved' && (
 <div className="relative flex items-start gap-3">
 <div className="absolute -left-[9px] mt-1 h-2 w-2 rounded-full bg-[#10B981]" />
 <div>
 <div className="text-sm font-medium text-foreground ">已解决</div>
 <div className="text-xs text-[hsl(var(--muted-foreground))] ">{selectedAlert.resolvedAt} · 耗时 {selectedAlert.resolutionTime}</div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 <DialogFooter className="flex gap-2">
 {selectedAlert?.status === 'open' && (
 <Button
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 onClick={() => {
 toast.success('告警已确认');
 setDetailOpen(false);
 }}
 >
 <Check className="mr-1 h-4 w-4" />
 确认告警
 </Button>
 )}
 <Button
 variant="outline"
 className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={() => {
 toast.success('已设置静默 1小时');
 setDetailOpen(false);
 }}
 >
 <VolumeX className="mr-1 h-4 w-4" />
 静默1小时
 </Button>
 <Button
 variant="outline"
 className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={() => setDetailOpen(false)}
 >
 关闭
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* New Rule Modal */}
 <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
 <DialogContent className="max-w-lg border-[hsl(var(--border))] bg-card text-foreground ">
 <DialogHeader>
 <DialogTitle className="text-foreground ">新建告警规则</DialogTitle>
 <DialogDescription className="text-[hsl(var(--muted-foreground))] ">步骤 {ruleStep} / 3</DialogDescription>
 </DialogHeader>
 <div className="space-y-4">
 {ruleStep === 1 && (
 <>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">规则名称</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " placeholder="例如: OST容量告警" />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">描述</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " placeholder="规则描述..." />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">严重级别</label>
 <div className="flex gap-2">
 {(['critical', 'warning', 'info'] as const).map((s) => (
 <button
 key={s}
 className={cn(
 'rounded-md px-3 py-1.5 text-xs transition-colors',
 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-foreground '
 )}
 >
 {severityConfig[s].label}
 </button>
 ))}
 </div>
 </div>
 </>
 )}
 {ruleStep === 2 && (
 <>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">监控指标</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " placeholder="ost.used_percent" />
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">运算符</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " value=">" />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">阈值</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " placeholder="85" />
 </div>
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">评估间隔</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " value="每1分钟" />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">持续时间</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " value="持续5分钟" />
 </div>
 </>
 )}
 {ruleStep === 3 && (
 <>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">通知渠道</label>
 <div className="flex gap-3">
 <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <input type="checkbox" className="rounded border-[hsl(var(--border))]" defaultChecked />
 邮件
 </label>
 <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <input type="checkbox" className="rounded border-[hsl(var(--border))]" defaultChecked />
 飞书
 </label>
 </div>
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">告警冷却</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " value="15分钟" />
 </div>
 <div>
 <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))] ">升级设置</label>
 <Input className="border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-foreground " placeholder="30分钟未确认升级通知给..." />
 </div>
 </>
 )}
 </div>
 <DialogFooter className="flex gap-2">
 {ruleStep > 1 && (
 <Button
 variant="outline"
 className="border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-foreground "
 onClick={() => setRuleStep(ruleStep - 1)}
 >
 上一步
 </Button>
 )}
 {ruleStep < 3 ? (
 <Button
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 onClick={() => setRuleStep(ruleStep + 1)}
 >
 下一步
 </Button>
 ) : (
 <Button
 className="bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90"
 onClick={() => {
 toast.success('告警规则已创建');
 setRuleModalOpen(false);
 setRuleStep(1);
 }}
 >
 保存并启用
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
