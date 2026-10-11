import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
 AreaChart,
 Area,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
 RadarChart,
 PolarGrid,
 PolarAngleAxis,
 PolarRadiusAxis,
 Radar,
 Legend,
 BarChart,
 Bar,
} from 'recharts';
import {
 PlayCircle,
 GitCompare,
 Download,
 Search,
 FileText,
 CheckCircle2,
 AlertTriangle,
 XCircle,
 ChevronDown,
 ChevronUp,
 BarChart3,
 X,
 Share2,
 Printer,
 Trash2,
 Eye,
 ChevronLeft,
 ChevronRight,
 Settings,
 Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
 inspectionReports,
 reportTrendData,
} from '@/data/aiHealthData';
import type { InspectionReport, HealthCheckFinding } from '@/data/aiHealthData';

// ─── Score Badge ─────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
 let color = '#10B981';
 if (score < 70) { color = '#EF4444'; }
 else if (score < 90) { color = '#F59E0B'; }
 return (
 <div className="flex items-center gap-2">
 <span className="text-base font-bold tabular-nums" style={{ color }}>{score}</span>
 <div className="h-1.5 w-10 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
 <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
 </div>
 </div>
 );
}

// ─── Finding in Report Detail ────────────────────────────────────────────
function ReportFindingItem({ finding, index }: { finding: HealthCheckFinding; index: number }) {
 const [expanded, setExpanded] = useState(false);
 const cfg = {
 critical: { color: '#EF4444', bg: 'bg-[#EF4444]/10', label: '紧急', icon: XCircle },
 warning: { color: '#F59E0B', bg: 'bg-[#F59E0B]/10', label: '警告', icon: AlertTriangle },
 info: { color: '#3B82F6', bg: 'bg-[#3B82F6]/10', label: '信息', icon: CheckCircle2 },
 }[finding.severity];
 const Icon = cfg.icon;

 return (
 <motion.div
 initial={{ opacity: 0, y: 5 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: index * 0.04 }}
 className="rounded-2xl border border-[hsl(var(--border))] bg-card overflow-hidden"
 >
 <button
 onClick={() => setExpanded(!expanded)}
 className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-card transition-colors"
 >
 <Icon className="h-4 w-4 shrink-0" style={{ color: cfg.color }} />
 <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', cfg.bg)} style={{ color: cfg.color }}>
 {cfg.label}
 </span>
 <span className="text-xs text-[hsl(var(--muted-foreground))] ">{finding.category}</span>
 <span className="flex-1 text-left text-sm text-foreground truncate">{finding.title}</span>
 {expanded ? <ChevronUp className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] " /> : <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] " />}
 </button>
 <AnimatePresence>
 {expanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 transition={{ duration: 0.2 }}
 className="overflow-hidden"
 >
 <div className="px-3 pb-2.5 pt-1 space-y-1.5">
 <p className="text-xs text-[hsl(var(--muted-foreground))] ">{finding.description}</p>
 <div className="flex flex-wrap gap-1">
 {finding.affectedNodes.map((n) => (
 <span key={n} className="rounded bg-card px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] ">{n}</span>
 ))}
 </div>
 <div className="rounded bg-[hsl(var(--muted))] p-2">
 <span className="text-[10px] text-[hsl(var(--muted-foreground))] ">建议: </span>
 <span className="text-xs text-foreground ">{finding.recommendation}</span>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </motion.div>
 );
}

// ─── Report Detail Modal ───────────────────────────────────────────────────
function ReportDetailModal({ report, onClose }: { report: InspectionReport; onClose: () => void }) {
 const [activeTab, setActiveTab] = useState('overview');
 const handlePrint = () => {
 window.print();
 toast.success(`已打开报告 ${report.name} 的打印窗口`);
 };

 const radarData = report.categoryScores.map((c) => ({
 category: c.name,
 score: c.score,
 fullMark: 100,
 }));

 const tabs = [
 { id: 'overview', label: '概览' },
 { id: 'cluster', label: '集群状态' },
 { id: 'performance', label: '性能指标' },
 { id: 'storage', label: '存储容量' },
 { id: 'network', label: '网络健康' },
 { id: 'config', label: '配置一致性' },
 { id: 'logs', label: '日志异常' },
 { id: 'ai', label: 'AI诊断' },
 ];

 const scoreColor = report.healthScore >= 90 ? '#10B981' : report.healthScore >= 70 ? '#F59E0B' : '#EF4444';

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
 onClick={onClose}
 >
 <motion.div
 initial={{ scale: 0.97, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.97, opacity: 0 }}
 transition={{ duration: 0.3 }}
 onClick={(e: any) => e.stopPropagation()}
 className="flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card border border-[hsl(var(--border))]"
 >
 {/* Modal Header */}
 <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
 <div>
 <h2 className="text-lg font-bold text-foreground ">{report.name}</h2>
 <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] ">
 <span>{report.cluster}</span>
 <span>·</span>
 <span>{report.createdAt}</span>
 <span>·</span>
 <span>{report.duration}</span>
 <span>·</span>
 <span className={cn(
 'rounded px-1.5 py-0.5',
 report.triggerType === 'manual' && 'bg-[#0EA5E9]/10 text-[#0EA5E9]',
 report.triggerType === 'scheduled' && 'bg-[#6366F1]/10 text-[#6366F1]',
 report.triggerType === 'alert' && 'bg-[#EF4444]/10 text-[#EF4444]',
 )}>
 {report.triggerType === 'manual' ? '手动' : report.triggerType === 'scheduled' ? '定时' : '告警触发'}
 </span>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <div className="text-center">
 <div className="text-3xl font-bold tabular-nums" style={{ color: scoreColor }}>{report.healthScore}</div>
 <div className="text-[10px] text-[hsl(var(--muted-foreground))] ">/100</div>
 </div>
 <div className="flex gap-1">
 <button
 type="button"
 aria-label={`导出报告 ${report.name}`}
 title="导出报告"
 onClick={() => toast.success(`已导出报告 ${report.name}`)}
 className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 >
 <Download className="h-4 w-4" />
 </button>
 <button
 type="button"
 aria-label={`分享报告 ${report.name}`}
 title="分享报告"
 onClick={() => toast('分享功能待接入外部通知渠道')}
 className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 >
 <Share2 className="h-4 w-4" />
 </button>
 <button
 type="button"
 aria-label={`打印报告 ${report.name}`}
 title="打印报告"
 onClick={handlePrint}
 className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 >
 <Printer className="h-4 w-4" />
 </button>
 <button
 type="button"
 aria-label="关闭报告详情"
 title="关闭"
 onClick={onClose}
 className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex items-center gap-1 overflow-x-auto border-b border-[hsl(var(--border))] px-6 py-2">
 {tabs.map((tab) => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={cn(
 'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
 activeTab === tab.id
 ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]'
 : 'text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-[hsl(var(--muted-foreground))] '
 )}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto p-6">
 {activeTab === 'overview' && (
 <div className="space-y-6">
 {/* Summary cards */}
 <div className="grid grid-cols-3 gap-4">
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4 text-center">
 <div className="flex items-center justify-center gap-1 text-[#10B981]">
 <CheckCircle2 className="h-4 w-4" />
 <span className="text-2xl font-bold tabular-nums">{report.checksPassed}</span>
 </div>
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">检查通过</div>
 </div>
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4 text-center">
 <div className="flex items-center justify-center gap-1 text-[#F59E0B]">
 <AlertTriangle className="h-4 w-4" />
 <span className="text-2xl font-bold tabular-nums">{report.checksWarned}</span>
 </div>
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">警告</div>
 </div>
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4 text-center">
 <div className="flex items-center justify-center gap-1 text-[#EF4444]">
 <XCircle className="h-4 w-4" />
 <span className="text-2xl font-bold tabular-nums">{report.checksFailed}</span>
 </div>
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">失败</div>
 </div>
 </div>

 {/* Radar chart */}
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4">
 <h3 className="mb-4 text-sm font-semibold text-foreground ">评分分布</h3>
 <div className="h-64">
 <ResponsiveContainer width="100%" height="100%">
 <RadarChart data={radarData}>
 <PolarGrid stroke="#1E293B" />
 <PolarAngleAxis dataKey="category" tick={{ fill: '#94A3B8', fontSize: 11 }} />
 <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 10 }} />
 <Radar
 name="评分"
 dataKey="score"
 stroke="#0EA5E9"
 fill="#0EA5E9"
 fillOpacity={0.2}
 strokeWidth={2}
 />
 </RadarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Key findings */}
 {report.findings.length > 0 && (
 <div>
 <h3 className="mb-3 text-sm font-semibold text-foreground ">关键发现</h3>
 <div className="space-y-2">
 {report.findings.slice(0, 3).map((finding, i) => (
 <ReportFindingItem key={finding.id} finding={finding} index={i} />
 ))}
 </div>
 </div>
 )}
 </div>
 )}

 {activeTab === 'ai' && (
 <div className="rounded-xl border-l-[3px] border-[#0EA5E9] bg-card p-4">
 <div className="flex items-center gap-2 mb-3">
 <BarChart3 className="h-5 w-5 text-[#0EA5E9]" />
 <h3 className="text-sm font-semibold text-foreground ">AI 诊断建议</h3>
 </div>
 <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
 根据本次检查结果，AI 助手识别到集群整体健康状态为{report.healthScore >= 90 ? '优秀' : report.healthScore >= 70 ? '良好' : '需关注'}。
 {report.checksWarned > 0 && ` 发现 ${report.checksWarned} 个警告项需要关注。`}
 {report.checksFailed > 0 && ` 有 ${report.checksFailed} 项检查失败，建议立即处理。`}
 整体趋势较上次检查{report.healthScore > 90 ? '保持稳定' : '略有下降'}，建议按照优先级处理发现的问题。
 </p>
 </div>
 )}

 {(activeTab === 'cluster' || activeTab === 'performance' || activeTab === 'storage' || activeTab === 'network' || activeTab === 'config' || activeTab === 'logs') && (
 <div className="space-y-4">
 <h3 className="text-sm font-semibold text-foreground ">{tabs.find(t => t.id === activeTab)?.label}详情</h3>
 <p className="text-sm text-[hsl(var(--muted-foreground))] ">该分类检查包含多项子检查，所有结果已汇总到报告中。</p>
 </div>
 )}
 </div>
 </motion.div>
 </motion.div>
 );
}

// ─── Comparison View ───────────────────────────────────────────────────────
function ComparisonView({ reportA, reportB, onClose }: { reportA: InspectionReport; reportB: InspectionReport; onClose: () => void }) {
 const deltaScore = reportA.healthScore - reportB.healthScore;
 const comparisonData = reportA.categoryScores.map((cat) => {
 const otherCat = reportB.categoryScores.find((c) => c.name === cat.name);
 return {
 name: cat.name,
 a: cat.score,
 b: otherCat?.score || 0,
 delta: cat.score - (otherCat?.score || 0),
 };
 });

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
 onClick={onClose}
 >
 <motion.div
 initial={{ scale: 0.97, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.97, opacity: 0 }}
 transition={{ duration: 0.3 }}
 onClick={(e: any) => e.stopPropagation()}
 className="flex h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-card border border-[hsl(var(--border))]"
 >
 <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
 <h2 className="text-lg font-bold text-foreground ">报告对比</h2>
 <button onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground ">
 <X className="h-4 w-4" />
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-6">
 {/* Score comparison */}
 <div className="mb-6 grid grid-cols-2 gap-4">
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4">
 <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">报告 A</div>
 <div className="text-lg font-bold text-foreground ">{reportA.name}</div>
 <div className="mt-2 text-3xl font-bold" style={{ color: reportA.healthScore >= 90 ? '#10B981' : reportA.healthScore >= 70 ? '#F59E0B' : '#EF4444' }}>
 {reportA.healthScore}
 </div>
 </div>
 <div className="rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4">
 <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1">报告 B</div>
 <div className="text-lg font-bold text-foreground ">{reportB.name}</div>
 <div className="mt-2 text-3xl font-bold" style={{ color: reportB.healthScore >= 90 ? '#10B981' : reportB.healthScore >= 70 ? '#F59E0B' : '#EF4444' }}>
 {reportB.healthScore}
 </div>
 </div>
 </div>

 <div className="mb-4 rounded-lg bg-card p-3 text-center">
 <span className="text-sm text-[hsl(var(--muted-foreground))] ">评分差异: </span>
 <span className={cn('text-sm font-bold', deltaScore >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]')}>
 {deltaScore >= 0 ? '+' : ''}{deltaScore}
 </span>
 </div>

 {/* Bar chart comparison */}
 <div className="h-64 rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] p-4 mb-6">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={comparisonData} barGap={4}>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
 <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 11 }} />
 <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} />
 <Tooltip
 contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: '8px' }}
 itemStyle={{ color: '#F1F5F9', fontSize: '12px' }}
 labelStyle={{ color: '#94A3B8', fontSize: '11px' }}
 />
 <Legend wrapperStyle={{ color: '#94A3B8', fontSize: '12px' }} />
 <Bar dataKey="a" name={reportA.name.slice(-8)} fill="#0EA5E9" radius={[4, 4, 0, 0]} />
 <Bar dataKey="b" name={reportB.name.slice(-8)} fill="#6366F1" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </div>

 {/* Delta table */}
 <table className="w-full text-left text-sm">
 <thead>
 <tr className="border-b border-[hsl(var(--border))]">
 <th className="py-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">分类</th>
 <th className="py-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">报告 A</th>
 <th className="py-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">报告 B</th>
 <th className="py-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">变化</th>
 </tr>
 </thead>
 <tbody>
 {comparisonData.map((row) => (
 <tr key={row.name} className="border-b border-[hsl(var(--border))] hover:bg-card ">
 <td className="py-2.5 text-foreground ">{row.name}</td>
 <td className="py-2.5 text-[hsl(var(--muted-foreground))] tabular-nums">{row.a}</td>
 <td className="py-2.5 text-[hsl(var(--muted-foreground))] tabular-nums">{row.b}</td>
 <td className={cn('py-2.5 font-medium tabular-nums', row.delta >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]')}>
 {row.delta >= 0 ? '+' : ''}{row.delta}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </motion.div>
 </motion.div>
 );
}

// ─── Schedule Settings Modal ──────────────────────────────────────────────
function ScheduleModal({ onClose }: { onClose: () => void }) {
 const handleSave = () => {
 toast.success('定时报告设置已暂存，等待后端任务接口接入后生效');
 onClose();
 };

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
 onClick={onClose}
 >
 <motion.div
 initial={{ scale: 0.97, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 exit={{ scale: 0.97, opacity: 0 }}
 onClick={(e: any) => e.stopPropagation()}
 className="w-full max-w-lg rounded-2xl bg-card border border-[hsl(var(--border))] p-6"
 >
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-lg font-bold text-foreground ">定时报告设置</h2>
 <button
 type="button"
 aria-label="关闭定时报告设置"
 title="关闭"
 onClick={onClose}
 className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground "
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 <div className="space-y-4">
 <div>
 <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] ">报告名称模板</label>
 <input
 defaultValue="{cluster}_{date}_巡检报告"
 className="mt-1 w-full rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-foreground focus:border-[#0EA5E9] focus:outline-none"
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] ">执行频率</label>
 <select className="mt-1 w-full rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] focus:border-[#0EA5E9] focus:outline-none">
 <option>每天</option>
 <option>每周</option>
 <option>每月</option>
 </select>
 </div>
 <div>
 <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] ">执行时间</label>
 <input
 type="time"
 defaultValue="02:00"
 className="mt-1 w-full rounded-lg bg-[hsl(var(--muted))] border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] focus:border-[#0EA5E9] focus:outline-none"
 />
 </div>
 </div>
 <div>
 <label className="text-xs font-medium text-[hsl(var(--muted-foreground))] ">通知方式</label>
 <div className="mt-2 flex gap-3">
 <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <input type="checkbox" defaultChecked className="rounded border-[hsl(var(--border))] bg-[hsl(var(--muted))] " />
 邮件通知
 </label>
 <label className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <input type="checkbox" className="rounded border-[hsl(var(--border))] bg-[hsl(var(--muted))] " />
 飞书通知
 </label>
 </div>
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button type="button" onClick={onClose} className="rounded-2xl border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-card transition-colors">
 取消
 </button>
 <button type="button" onClick={handleSave} className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity">
 保存设置
 </button>
 </div>
 </div>
 </motion.div>
 </motion.div>
 );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function Reports() {
 const [reports] = useState<InspectionReport[]>(() => {
 const stored = JSON.parse(localStorage.getItem('health-reports') || '[]');
 // Merge stored reports with mock data, avoiding duplicates by id
 const merged = [...stored];
 for (const r of inspectionReports) {
 if (!merged.some((m: InspectionReport) => m.id === r.id)) {
 merged.push(r);
 }
 }
 return merged;
 });
 const [searchQuery, setSearchQuery] = useState('');
 const [scoreFilter, setScoreFilter] = useState('all');
 const [typeFilter, setTypeFilter] = useState('all');
 const [sortBy, setSortBy] = useState('latest');
 const [selectedReport, setSelectedReport] = useState<InspectionReport | null>(null);
 const [comparison, setComparison] = useState<[InspectionReport | null, InspectionReport | null]>([null, null]);
 const [showComparison, setShowComparison] = useState(false);
 const [showSchedule, setShowSchedule] = useState(false);
 const [exportingId, setExportingId] = useState<string | null>(null);
 const [currentPage, setCurrentPage] = useState(1);
 const pageSize = 5;

 const filteredReports = useMemo(() => {
 let result = [...reports];
 if (searchQuery) {
 result = result.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.cluster.toLowerCase().includes(searchQuery.toLowerCase()));
 }
 if (scoreFilter !== 'all') {
 result = result.filter((r) => {
 if (scoreFilter === 'excellent') return r.healthScore >= 90;
 if (scoreFilter === 'good') return r.healthScore >= 70 && r.healthScore < 90;
 if (scoreFilter === 'warning') return r.healthScore < 70;
 return true;
 });
 }
 if (typeFilter !== 'all') {
 result = result.filter((r) => r.triggerType === typeFilter);
 }
 if (sortBy === 'latest') result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
 if (sortBy === 'score') result.sort((a, b) => b.healthScore - a.healthScore);
 if (sortBy === 'issues') result.sort((a, b) => (b.checksWarned + b.checksFailed) - (a.checksWarned + a.checksFailed));
 return result;
 }, [reports, searchQuery, scoreFilter, typeFilter, sortBy]);

 const paginatedReports = filteredReports.slice((currentPage - 1) * pageSize, currentPage * pageSize);
 const totalPages = Math.ceil(filteredReports.length / pageSize);

 const handleCompareSelect = (report: InspectionReport) => {
 if (comparison[0]?.id === report.id) {
 setComparison([null, comparison[1]]);
 return;
 }
 if (comparison[1]?.id === report.id) {
 setComparison([comparison[0], null]);
 return;
 }
 if (!comparison[0]) {
 setComparison([report, comparison[1]]);
 } else if (!comparison[1]) {
 setComparison([comparison[0], report]);
 } else {
 setComparison([report, null]);
 }
 };

 const handleExport = (id: string) => {
 const report = reports.find((item) => item.id === id);
 setExportingId(id);
 setTimeout(() => {
 setExportingId(null);
 toast.success(report ? `已导出报告 ${report.name}` : '报告导出完成');
 }, 1200);
 };

 const stats = {
 total: reports.length,
 avgScore: (reports.reduce((s, r) => s + r.healthScore, 0) / reports.length).toFixed(1),
 totalIssues: reports.reduce((s, r) => s + r.checksWarned + r.checksFailed, 0),
 resolved: Math.floor(reports.reduce((s, r) => s + r.checksWarned + r.checksFailed, 0) * 0.87),
 };

 return (
 <div className="min-h-[calc(100dvh-4rem)] bg-[hsl(var(--muted))] ">
 <div className="p-6">
 {/* ── Header ── */}
 <div className="mb-6 flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] ">
 <span>运维工具</span>
 <span>/</span>
 <span className="text-[#0EA5E9]">巡检报告</span>
 </div>
 <h1 className="mt-1 text-3xl font-bold text-foreground ">巡检报告库</h1>
 <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))] ">历史健康检查报告 · 趋势分析 · 报告对比</p>
 </div>
 <div className="flex gap-2">
 <button
 onClick={() => toast('请前往“健康巡检”页面执行新的真实巡检')}
 className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
 >
 <PlayCircle className="h-4 w-4" />
 新建检查
 </button>
 <button
 onClick={() => setShowComparison(true)}
 disabled={!comparison[0] || !comparison[1]}
 className={cn(
 'flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
 comparison[0] && comparison[1]
 ? 'border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground '
 : 'border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] cursor-not-allowed'
 )}
 >
 <GitCompare className="h-4 w-4" />
 对比报告
 </button>
 <button
 onClick={() => setShowSchedule(true)}
 className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-card px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 >
 <Settings className="h-4 w-4" />
 定时设置
 </button>
 </div>
 </div>

 {/* ── Stats + Trend ── */}
 <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
 {/* Stats Cards */}
 <div className="lg:col-span-2 grid grid-cols-2 gap-4">
 {[
 { value: stats.total, label: '总报告数', sub: '近30天生成的报告', color: 'text-foreground ', isClass: true },
 { value: stats.avgScore, label: '平均健康评分', sub: '较上月 +2.3', color: '#10B981' },
 { value: stats.totalIssues, label: '累计发现问题', sub: `已解决 ${stats.resolved} (87%)`, color: '#F59E0B' },
 { value: '2.3', label: '平均检查频率/周', sub: '最近7天 3 次', color: '#0EA5E9' },
 ].map((stat, i) => (
 <motion.div
 key={stat.label}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: i * 0.08 }}
 className="rounded-xl bg-card border border-[hsl(var(--border))] p-4"
 >
 {stat.isClass ? (<div className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</div>) : (<div className="text-2xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</div>)}
 <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] ">{stat.label}</div>
 <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))] ">{stat.sub}</div>
 </motion.div>
 ))}
 </div>

 {/* Trend Chart */}
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 transition={{ delay: 0.2 }}
 className="lg:col-span-3 rounded-xl bg-card border border-[hsl(var(--border))] p-4"
 >
 <h3 className="mb-2 text-sm font-semibold text-foreground ">健康评分趋势 (近7天)</h3>
 <div className="h-48">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={reportTrendData}>
 <defs>
 <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
 <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} />
 <YAxis domain={[60, 100]} tick={{ fill: '#64748B', fontSize: 11 }} />
 <Tooltip
 contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #1E293B', borderRadius: '8px' }}
 itemStyle={{ color: '#F1F5F9', fontSize: '12px' }}
 labelStyle={{ color: '#94A3B8', fontSize: '11px' }}
 />
 <Legend wrapperStyle={{ color: '#94A3B8', fontSize: '11px' }} />
 <Area type="monotone" dataKey="overall" name="整体评分" stroke="#0EA5E9" fill="url(#colorOverall)" strokeWidth={2} />
 <Area type="monotone" dataKey="storage" name="存储" stroke="#8B5CF6" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
 <Area type="monotone" dataKey="network" name="网络" stroke="#06B6D4" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
 <Area type="monotone" dataKey="performance" name="性能" stroke="#6366F1" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </motion.div>
 </div>

 {/* ── Filter Bar ── */}
 <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-card border border-[hsl(var(--border))] p-3">
 <div className="relative flex-1 min-w-[200px]">
 <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))] " />
 <input
 type="text"
 placeholder="搜索报告名称或集群..."
 value={searchQuery}
 onChange={(e: any) => setSearchQuery(e.target.value)}
 className="w-full rounded-lg bg-[hsl(var(--muted))] pl-9 pr-3 py-1.5 text-sm text-foreground placeholder-[#64748B] border border-[hsl(var(--border))] focus:border-[#0EA5E9] focus:outline-none transition-colors"
 />
 </div>
 <select
 value={scoreFilter}
 onChange={(e: any) => setScoreFilter(e.target.value)}
 className="rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] focus:border-[#0EA5E9] focus:outline-none"
 >
 <option value="all">全部评分</option>
 <option value="excellent">{'>=90 优秀'}</option>
 <option value="good">70-89 良好</option>
 <option value="warning">{'<70 需关注'}</option>
 </select>
 <select
 value={typeFilter}
 onChange={(e: any) => setTypeFilter(e.target.value)}
 className="rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] focus:border-[#0EA5E9] focus:outline-none"
 >
 <option value="all">全部类型</option>
 <option value="manual">手动触发</option>
 <option value="scheduled">定时任务</option>
 <option value="alert">告警触发</option>
 </select>
 <select
 value={sortBy}
 onChange={(e: any) => setSortBy(e.target.value)}
 className="rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-sm text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] focus:border-[#0EA5E9] focus:outline-none"
 >
 <option value="latest">最新</option>
 <option value="score">评分</option>
 <option value="issues">问题数</option>
 </select>
 </div>

 {/* ── Reports Table ── */}
 <div className="rounded-xl bg-card border border-[hsl(var(--border))] overflow-hidden">
 <table className="w-full text-left">
 <thead>
 <tr className="bg-card ">
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] w-8">选择</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">报告名称</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">集群</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">触发方式</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">健康评分</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">问题统计</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">耗时</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">生成时间</th>
 <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))] ">操作</th>
 </tr>
 </thead>
 <tbody>
 {paginatedReports.map((report, i) => (
 <motion.tr
 key={report.id}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.03 }}
 className="border-b border-[hsl(var(--border))] hover:bg-card transition-colors"
 >
 <td className="px-4 py-3">
 <input
 type="checkbox"
 checked={comparison[0]?.id === report.id || comparison[1]?.id === report.id}
 onChange={() => handleCompareSelect(report)}
 className="rounded border-[hsl(var(--border))] bg-[hsl(var(--muted))] "
 />
 </td>
 <td className="px-4 py-3">
 <button
 onClick={() => setSelectedReport(report)}
 className="flex items-center gap-2 text-sm text-foreground hover:text-[#0EA5E9] transition-colors"
 >
 <FileText className="h-4 w-4 text-[#0EA5E9]" />
 <span className="truncate max-w-[180px]">{report.name}</span>
 </button>
 </td>
 <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{report.cluster}</td>
 <td className="px-4 py-3">
 <span className={cn(
 'rounded px-2 py-0.5 text-[10px] font-medium',
 report.triggerType === 'manual' && 'bg-[#0EA5E9]/10 text-[#0EA5E9]',
 report.triggerType === 'scheduled' && 'bg-[#6366F1]/10 text-[#6366F1]',
 report.triggerType === 'alert' && 'bg-[#EF4444]/10 text-[#EF4444]',
 )}>
 {report.triggerType === 'manual' ? '手动' : report.triggerType === 'scheduled' ? '定时' : '告警触发'}
 </span>
 </td>
 <td className="px-4 py-3"><ScoreBadge score={report.healthScore} /></td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-1.5 text-xs">
 {report.checksWarned > 0 && (
 <span className="text-[#F59E0B]">{report.checksWarned}⚠️</span>
 )}
 {report.checksFailed > 0 && (
 <span className="text-[#EF4444]">{report.checksFailed}🔴</span>
 )}
 <span className="text-[#10B981]">{report.checksPassed}✓</span>
 </div>
 </td>
 <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{report.duration}</td>
 <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] ">{report.createdAt}</td>
 <td className="px-4 py-3">
 <div className="flex items-center gap-1">
 <button
 onClick={() => setSelectedReport(report)}
 className="rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-[#0EA5E9] transition-colors"
 title="查看"
 aria-label={`查看报告 ${report.name}`}
 >
 <Eye className="h-3.5 w-3.5" />
 </button>
 <button
 onClick={() => handleExport(report.id)}
 className="rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground transition-colors"
 title="下载PDF"
 aria-label={`下载报告 ${report.name}`}
 >
 {exportingId === report.id ? (
 <Check className="h-3.5 w-3.5 text-[#10B981]" />
 ) : (
 <Download className="h-3.5 w-3.5" />
 )}
 </button>
 <button
 onClick={() => toast('删除报告需要后端审计接口确认，当前未执行删除')}
 className="rounded p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-[#EF4444] transition-colors"
 title="删除"
 aria-label={`删除报告 ${report.name}`}
 >
 <Trash2 className="h-3.5 w-3.5" />
 </button>
 </div>
 </td>
 </motion.tr>
 ))}
 </tbody>
 </table>

 {/* Pagination */}
 <div className="flex items-center justify-between border-t border-[hsl(var(--border))] px-4 py-3">
 <span className="text-xs text-[hsl(var(--muted-foreground))] ">
 共 {filteredReports.length} 条记录
 </span>
 <div className="flex items-center gap-1">
 <button
 onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
 disabled={currentPage === 1}
 aria-label="上一页"
 className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground disabled:opacity-30 transition-colors"
 >
 <ChevronLeft className="h-4 w-4" />
 </button>
 {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
 <button
 key={page}
 onClick={() => setCurrentPage(page)}
 className={cn(
 'rounded px-2.5 py-1 text-xs transition-colors',
 currentPage === page
 ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]'
 : 'text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground '
 )}
 >
 {page}
 </button>
 ))}
 <button
 onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
 disabled={currentPage === totalPages}
 aria-label="下一页"
 className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-card hover:text-foreground disabled:opacity-30 transition-colors"
 >
 <ChevronRight className="h-4 w-4" />
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* ── Modals ── */}
 <AnimatePresence>
 {selectedReport && (
 <ReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />
 )}
 </AnimatePresence>

 <AnimatePresence>
 {showComparison && comparison[0] && comparison[1] && (
 <ComparisonView
 reportA={comparison[0]}
 reportB={comparison[1]}
 onClose={() => { setShowComparison(false); setComparison([null, null]); }}
 />
 )}
 </AnimatePresence>

 <AnimatePresence>
 {showSchedule && <ScheduleModal onClose={() => setShowSchedule(false)} />}
 </AnimatePresence>
 </div>
 );
}
