import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlayCircle,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Download,
  Activity,
  Server,
  Gauge,
  HardDrive,
  Network,
  Settings2,
  FileSearch,
  Loader2,
  Wrench,
  ShieldAlert,
  Terminal,
  Copy,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneratedEmptyStateVisual } from '@/components/GeneratedEmptyStateVisual';
import type { HealthCheckCategoryResult, HealthCheckFinding, HealthCheckRemediation, HealthCheckStep } from '@/data/aiHealthData';
import toast from 'react-hot-toast';

type HealthCheckPayload = {
  timestamp: string;
  duration_sec: number;
  cluster: string;
  overallScore: number;
  checksPassed: number;
  checksFailed: number;
  checksWarned: number;
  categories: HealthCheckCategoryResult[];
  findings: HealthCheckFinding[];
  steps: HealthCheckStep[];
  aiDiagnosisText: string;
  executionLogs: Array<{ time: string; status: 'done' | 'warning' | 'error' | 'info'; text: string }>;
};

type RemediationDialogState = {
  finding: HealthCheckFinding;
  plan: HealthCheckRemediation;
} | null;

type HealthRunLogStatus = 'running' | 'done' | 'warning' | 'error' | 'info';

type HealthRunLog = {
  id: string;
  time: string;
  status: HealthRunLogStatus;
  text: string;
  phase?: string;
  command?: string;
  output?: string;
  exitCode?: number;
};

type HealthRunStreamEvent =
  | ({ type: 'log' } & Omit<HealthRunLog, 'id'>)
  | { type: 'result'; payload: HealthCheckPayload }
  | { type: 'error'; message: string };

type RemediationRunResult = {
  ok: boolean;
  message: string;
  mode: string;
  actionId: string;
  results: Array<{ label: string; command: string; exitCode: number; ok: boolean; output: string }>;
  nextStep: string;
};

const DEFAULT_STEPS: HealthCheckStep[] = [
  { id: 'step-1', name: '集群状态', status: 'pending', progress: 0, totalChecks: 5, completedChecks: 0 },
  { id: 'step-2', name: '性能指标', status: 'pending', progress: 0, totalChecks: 3, completedChecks: 0 },
  { id: 'step-3', name: '存储容量', status: 'pending', progress: 0, totalChecks: 6, completedChecks: 0 },
  { id: 'step-4', name: '网络健康', status: 'pending', progress: 0, totalChecks: 3, completedChecks: 0 },
  { id: 'step-5', name: '配置一致性', status: 'pending', progress: 0, totalChecks: 4, completedChecks: 0 },
  { id: 'step-6', name: '日志异常', status: 'pending', progress: 0, totalChecks: 3, completedChecks: 0 },
];

const HEALTH_PHASE_STEP: Record<string, string> = {
  cluster: '集群状态',
  performance: '性能指标',
  storage: '存储容量',
  network: '网络健康',
  database: '配置一致性',
  logs: '日志异常',
  summary: '日志异常',
};

function CircularScore({ score, size = 160 }: { score: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  let color = '#10B981';
  if (score < 70) color = '#EF4444';
  else if (score < 90) color = '#F59E0B';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1E293B" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-slate-500 dark:text-[#64748B]">/100</span>
      </div>
    </div>
  );
}

function CategoryCard({ result, index }: { result: HealthCheckCategoryResult; index: number }) {
  const icons = {
    '集群状态': Server,
    '性能指标': Gauge,
    '存储容量': HardDrive,
    '网络健康': Network,
    '配置一致性': Settings2,
    '日志异常': FileSearch,
  };
  const Icon = icons[result.name as keyof typeof icons] || Activity;
  const color = result.status === 'passed' ? '#10B981' : result.status === 'warning' ? '#F59E0B' : '#EF4444';
  const bgColor = result.status === 'passed' ? 'bg-[#10B981]/10' : result.status === 'warning' ? 'bg-[#F59E0B]/10' : 'bg-[#EF4444]/10';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="rounded-xl bg-white dark:bg-[#111827] border border-[#1E293B] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />
          <span className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{result.name}</span>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', bgColor)} style={{ color }}>
          {result.status === 'passed' ? '通过' : result.status === 'warning' ? '警告' : '失败'}
        </span>
      </div>
      <div className="mb-2 text-2xl font-bold tabular-nums" style={{ color }}>
        {result.score}<span className="text-sm font-normal text-slate-500 dark:text-[#64748B]">/100</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-50 dark:bg-[#0D1320]">
        <div className="h-full rounded-full" style={{ width: `${result.score}%`, backgroundColor: color }} />
      </div>
      <div className="mt-2 text-xs text-slate-500 dark:text-[#64748B]">
        {result.passed}/{result.checks} 通过 · {result.warnings || 0} 警告{result.failed > 0 ? ` · ${result.failed} 失败` : ''}
      </div>
    </motion.div>
  );
}

function StepItem({ step, index }: { step: HealthCheckStep; index: number }) {
  const statusConfig = {
    pending: { icon: null, color: '#64748B', text: '等待中' },
    running: { icon: Loader2, color: '#0EA5E9', text: '执行中...' },
    done: { icon: CheckCircle2, color: '#10B981', text: '已完成' },
    warning: { icon: AlertTriangle, color: '#F59E0B', text: '有警告' },
    error: { icon: XCircle, color: '#EF4444', text: '失败' },
  };
  const config = statusConfig[step.status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 py-2"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${config.color}15` }}>
        {Icon ? <Icon className={cn('h-4 w-4', step.status === 'running' && 'animate-spin')} style={{ color: config.color }} /> : <span className="h-2 w-2 rounded-full bg-[#64748B]" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-900 dark:text-[#F1F5F9]">{step.name}</span>
          <span className="text-xs" style={{ color: config.color }}>{config.text}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-50 dark:bg-[#0D1320]">
          <div className="h-full rounded-full" style={{ width: `${step.progress}%`, backgroundColor: config.color }} />
        </div>
      </div>
      <span className="text-xs text-slate-500 dark:text-[#64748B] tabular-nums">{step.completedChecks}/{step.totalChecks}</span>
    </motion.div>
  );
}

function RunLogDialog({
  open,
  status,
  logs,
  onClose,
  logEndRef,
}: {
  open: boolean;
  status: 'idle' | 'running' | 'success' | 'error';
  logs: HealthRunLog[];
  onClose: () => void;
  logEndRef: RefObject<HTMLDivElement | null>;
}) {
  if (!open) return null;
  const statusMeta = {
    idle: { label: '等待开始', className: 'bg-slate-100 text-slate-600' },
    running: { label: '巡检执行中', className: 'bg-[#0EA5E9]/10 text-[#0EA5E9]' },
    success: { label: '巡检完成', className: 'bg-[#10B981]/10 text-[#10B981]' },
    error: { label: '巡检失败', className: 'bg-[#EF4444]/10 text-[#EF4444]' },
  }[status];
  const logStyle = {
    running: 'border-[#0EA5E9]/40 text-[#38BDF8]',
    done: 'border-[#10B981]/40 text-[#34D399]',
    warning: 'border-[#F59E0B]/40 text-[#FBBF24]',
    error: 'border-[#EF4444]/40 text-[#F87171]',
    info: 'border-slate-600 text-slate-300',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 18 }}
        className="flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#1E293B] bg-white shadow-2xl dark:bg-[#0A0F1A]"
        role="dialog"
        aria-modal="true"
        aria-label="巡检执行日志"
      >
        <div className="flex items-start justify-between border-b border-[#1E293B] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-[#0EA5E9]" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">巡检执行日志</h3>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusMeta.className)}>{statusMeta.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#94A3B8]">
              实时展示后端巡检脚本执行过程，包括命令、阶段结果和输出摘要。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭巡检日志"
            disabled={status === 'running'}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#64748B] dark:hover:bg-[#111827] dark:hover:text-[#F1F5F9]"
            title={status === 'running' ? '巡检执行中，完成后可关闭' : '关闭'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[#020617] p-4 font-mono text-xs leading-6">
          {logs.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              等待后端返回巡检日志...
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className={cn('rounded-lg border bg-white/[0.03] p-3', logStyle[log.status])}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500">[{log.time}]</span>
                    {log.phase && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">{log.phase}</span>}
                    <span>{log.text}</span>
                    {typeof log.exitCode === 'number' && <span className="text-slate-500">exit={log.exitCode}</span>}
                  </div>
                  {log.command && (
                    <div className="mt-2 rounded bg-slate-950 px-2 py-1 text-slate-300">
                      $ {log.command}
                    </div>
                  )}
                  {log.output && (
                    <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-slate-950 px-2 py-2 text-slate-400">{log.output}</pre>
                  )}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#1E293B] px-5 py-3 text-sm text-slate-500 dark:text-[#94A3B8]">
          <span>{logs.length} 条执行日志</span>
          <button
            type="button"
            disabled={status === 'running'}
            onClick={onClose}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
          >
            {status === 'running' ? '巡检执行中' : '关闭'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function buildFallbackRemediation(finding: HealthCheckFinding): HealthCheckRemediation {
  const base = {
    actionId: 'alert-context-precheck',
    title: '告警上下文收集',
    summary: '先收集只读上下文，确认根因后再执行修复，避免误确认或误静默告警。',
    risk: 'medium' as const,
    canAutoFix: false,
    manualSteps: [
      '确认告警级别、影响对象和持续时间。',
      '查看相关节点最近 Lustre/LNet 日志，判断是否为同一根因重复触发。',
      '先处理根因，再确认或关闭告警。',
      '处理后重新执行健康巡检。',
    ],
    validationSteps: ['同类告警不再持续新增。', '重新巡检后相关类别评分提升。'],
    commands: [
      { label: '查看最近 Lustre 日志', command: "journalctl --no-pager -k -n 160 | egrep -i 'lustre|lnet|error|failed|timeout|recovery' | tail -80 || true" },
    ],
  };

  if (finding.id === 'cluster-status' || finding.category === '集群状态') {
    return {
      actionId: 'lustre-service-precheck',
      title: 'Lustre 服务状态修复预检',
      summary: '该问题可能涉及 MGS/MDS/OSS 服务、客户端挂载或底层网络。系统只做只读预检，重启和挂载需要管理员确认。',
      risk: 'high',
      canAutoFix: false,
      manualSteps: [
        '确认 MGS、MDS、OSS 节点是否在线，优先检查管理节点和元数据服务。',
        '执行 `lfs check servers`，确认失败组件名称和错误信息。',
        '检查 `/lustre/client` 是否已挂载；未挂载时确认 MGS NID、网络和挂载参数。',
        '如确认为单个服务异常，在维护窗口执行服务重启或挂载恢复。',
        '恢复后重新执行巡检，并观察 10-15 分钟。',
      ],
      validationSteps: ['`lfs check servers` 返回正常。', '`mountpoint /lustre/client` 返回成功。', '巡检页集群状态恢复。'],
      commands: [
        { label: '检查 Lustre 服务状态', command: 'lfs check servers' },
        { label: '检查客户端挂载点', command: 'mountpoint /lustre/client && findmnt /lustre/client || true' },
        { label: '查看 Lustre 内核日志', command: "journalctl --no-pager -k -n 120 | egrep -i 'lustre|lnet|mgs|mds|oss|ost' | tail -60 || true" },
      ],
    };
  }

  if (finding.id === 'network-nids' || finding.category === '网络健康') {
    return {
      actionId: 'lnet-nid-precheck',
      title: 'LNet/NID 修复预检',
      summary: 'NID 丢失通常与 LNet 配置、网卡、驱动或链路有关。系统只做只读检查，不自动修改 LNet。',
      risk: 'high',
      canAutoFix: false,
      manualSteps: [
        '确认 IB/RoCE/TCP 网络设备是否 UP。',
        '检查交换机端口、链路质量和网卡驱动状态。',
        '核对 LNet 配置是否符合集群规划。',
        '必要时在维护窗口重新加载 LNet 或重启网络服务。',
      ],
      validationSteps: ['`lctl list_nids` 返回有效 NID。', '`lnetctl net show` 能看到预期网络。', '网络健康巡检恢复通过。'],
      commands: [
        { label: '查看本机 NID', command: 'lctl list_nids 2>/dev/null || true' },
        { label: '查看 LNet 网络', command: 'lnetctl net show 2>/dev/null || true' },
        { label: '查看网络设备状态', command: "ip -brief link | egrep -i 'ib|en|eth|bond|roce' || true" },
      ],
    };
  }

  if (finding.id.startsWith('ost-') || finding.category === '存储容量') {
    return {
      actionId: 'ost-capacity-precheck',
      title: 'OST 容量修复预检',
      summary: '容量修复可能涉及删除、迁移或扩容。系统只做容量画像和热点确认，不自动删除数据。',
      risk: 'high',
      canAutoFix: false,
      manualSteps: [
        '确认高水位 OST 名称和业务影响范围。',
        '查找近期增长最快目录，和业务方确认可清理或可迁移数据。',
        '容量超过 90% 时优先扩容或迁移热点目录。',
        '执行清理/迁移前准备回滚方案，避开业务高峰。',
      ],
      validationSteps: ['目标 OST 使用率低于告警阈值。', '写入业务无 ENOSPC 或高延迟错误。', '容量趋势恢复正常。'],
      commands: [
        { label: '查看 Lustre 容量', command: 'lfs df -h /lustre/client 2>/dev/null || lfs df -h 2>/dev/null || true' },
        { label: '查看 inode 使用', command: 'lfs df -i /lustre/client 2>/dev/null || true' },
      ],
    };
  }

  if (finding.id === 'config-single-node' || finding.category === '配置一致性') {
    return {
      actionId: 'collector-coverage-precheck',
      title: '采集覆盖修复预检',
      summary: '当前缺少跨节点指标，常见原因是采集脚本未覆盖全部节点或数据库未写入。',
      risk: 'medium',
      canAutoFix: false,
      manualSteps: [
        '确认采集脚本是否已部署到所有 MDS/OSS/客户端节点。',
        '检查各节点到数据库或采集网关的连通性。',
        '对缺失节点重启采集服务或重新部署采集任务。',
        '等待一个采集周期后重新巡检。',
      ],
      validationSteps: ['数据库中出现多个不同节点指标。', '配置一致性检查可执行跨节点比对。'],
      commands: [
        { label: '统计节点指标数量', command: 'sqlite3 /opt/lustre-data/lustre.db "select count(distinct node_id) from node_metrics;" 2>/dev/null || true' },
        { label: '查看采集相关进程', command: "ps -ef | egrep -i 'lustre|collect|metric' | grep -v grep || true" },
      ],
    };
  }

  return base;
}

function getRemediationPlan(finding: HealthCheckFinding): HealthCheckRemediation {
  return finding.remediation || buildFallbackRemediation(finding);
}

function riskLabel(risk: HealthCheckRemediation['risk']) {
  if (risk === 'high') return { label: '高风险', className: 'bg-red-500/10 text-red-500' };
  if (risk === 'medium') return { label: '中风险', className: 'bg-amber-500/10 text-amber-500' };
  return { label: '低风险', className: 'bg-emerald-500/10 text-emerald-500' };
}

function FindingRow({
  finding,
  index,
  onRemediate,
}: {
  finding: HealthCheckFinding;
  index: number;
  onRemediate: (finding: HealthCheckFinding, plan: HealthCheckRemediation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const remediation = getRemediationPlan(finding);
  const risk = riskLabel(remediation.risk);
  const severityConfig = {
    critical: { color: '#EF4444', bg: 'bg-[#EF4444]/10', label: '紧急' },
    warning: { color: '#F59E0B', bg: 'bg-[#F59E0B]/10', label: '警告' },
    info: { color: '#3B82F6', bg: 'bg-[#3B82F6]/10', label: '信息' },
  };
  const cfg = severityConfig[finding.severity];

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="overflow-hidden rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827]"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-white dark:bg-[#1A2234]"
      >
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', cfg.bg)} style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <span className="rounded bg-white dark:bg-[#1A2234] px-2 py-0.5 text-[10px] text-slate-500 dark:text-[#64748B]">{finding.category}</span>
        <span className="flex-1 text-left text-sm text-slate-900 dark:text-[#F1F5F9]">{finding.title}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-500 dark:text-[#64748B]" /> : <ChevronDown className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-4 pb-3 pt-1">
              <p className="text-xs text-slate-600 dark:text-[#94A3B8]">{finding.description}</p>
              <div className="flex flex-wrap gap-1">
                {finding.affectedNodes.map((node) => (
                  <span key={node} className="rounded bg-white dark:bg-[#1A2234] px-2 py-0.5 text-[10px] text-slate-600 dark:text-[#94A3B8]">{node}</span>
                ))}
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-[#0D1320] p-2">
                <div className="mb-1 text-[10px] font-medium text-slate-500 dark:text-[#64748B]">建议</div>
                <p className="text-xs text-slate-900 dark:text-[#F1F5F9]">{finding.recommendation}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#1E293B] dark:bg-[#0D1320]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-[#0EA5E9]" />
                      <span className="text-xs font-semibold text-slate-900 dark:text-[#F1F5F9]">{remediation.title}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-[#94A3B8]">{remediation.summary}</p>
                  </div>
                  <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', risk.className)}>{risk.label}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-medium text-slate-500 dark:text-[#64748B]">操作建议步骤</div>
                    <ol className="space-y-1">
                      {remediation.manualSteps.map((step, stepIndex) => (
                        <li key={step} className="flex gap-2 text-xs leading-5 text-slate-700 dark:text-[#CBD5E1]">
                          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#0EA5E9]/10 text-[10px] text-[#0EA5E9]">{stepIndex + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium text-slate-500 dark:text-[#64748B]">验证方式</div>
                    <ul className="space-y-1">
                      {remediation.validationSteps.map((step) => (
                        <li key={step} className="flex gap-2 text-xs leading-5 text-slate-700 dark:text-[#CBD5E1]">
                          <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#10B981]" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {remediation.commands.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[10px] font-medium text-slate-500 dark:text-[#64748B]">管理员可参考命令</div>
                    {remediation.commands.slice(0, 3).map((command) => (
                      <div key={command.command} className="rounded border border-slate-200 bg-white p-2 dark:border-[#1E293B] dark:bg-[#111827]">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500 dark:text-[#64748B]">{command.label}</span>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void navigator.clipboard.writeText(command.command);
                              toast.success('命令已复制');
                            }}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#0EA5E9] hover:bg-[#0EA5E9]/10"
                          >
                            <Copy className="h-3 w-3" />
                            复制
                          </button>
                        </div>
                        <code className="block whitespace-pre-wrap break-all rounded bg-slate-950 px-2 py-1.5 text-[11px] leading-5 text-slate-100">{command.command}</code>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemediate(finding, remediation);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0EA5E9] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0284C7]"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    {remediation.canAutoFix ? '一键修复' : '一键修复预检'}
                  </button>
                  <span className="text-[10px] text-slate-500 dark:text-[#64748B]">
                    {remediation.canAutoFix ? '将执行白名单低风险动作' : '不会执行重启、挂载、删除或配置修改'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
}

function getScoreMeta(score: number) {
  const color = score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : '#EF4444';
  const grade = score >= 90 ? '优秀' : score >= 80 ? '良好' : score >= 70 ? '一般' : '需关注';
  return { color, grade };
}

async function runHealthCheckRequest(): Promise<HealthCheckPayload> {
  const res = await fetch('/api/health-check/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function runHealthCheckStream(onLog: (log: Omit<HealthRunLog, 'id'>) => void): Promise<HealthCheckPayload> {
  const res = await fetch('/api/health-check/run-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.body) {
    onLog({
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: 'warning',
      text: '当前浏览器不支持流式读取，已降级为普通巡检请求。',
      phase: 'fallback',
    });
    return runHealthCheckRequest();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload: HealthCheckPayload | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as HealthRunStreamEvent;
      if (event.type === 'log') {
        onLog({
          time: event.time,
          status: event.status,
          text: event.text,
          phase: event.phase,
          command: event.command,
          output: event.output,
          exitCode: event.exitCode,
        });
      } else if (event.type === 'result') {
        finalPayload = event.payload;
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
    if (done) break;
  }

  if (!finalPayload) {
    throw new Error('巡检流结束但未返回结果');
  }
  return finalPayload;
}

async function runRemediationRequest(finding: HealthCheckFinding, plan: HealthCheckRemediation): Promise<RemediationRunResult> {
  const res = await fetch('/api/health-check/remediate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      findingId: finding.id,
      actionId: plan.actionId,
      affectedNodes: finding.affectedNodes,
      execute: plan.canAutoFix,
    }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.message || `HTTP ${res.status}`);
  }
  return payload;
}

export default function HealthCheck() {
  const [phase, setPhase] = useState<'idle' | 'running' | 'complete'>('idle');
  const [steps, setSteps] = useState<HealthCheckStep[]>(DEFAULT_STEPS);
  const [overallProgress, setOverallProgress] = useState(0);
  const [healthData, setHealthData] = useState<HealthCheckPayload | null>(null);
  const [runningError, setRunningError] = useState<string | null>(null);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [runLogStatus, setRunLogStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [runLogs, setRunLogs] = useState<HealthRunLog[]>([]);
  const [remediationDialog, setRemediationDialog] = useState<RemediationDialogState>(null);
  const [remediationRunning, setRemediationRunning] = useState(false);
  const [remediationResult, setRemediationResult] = useState<RemediationRunResult | null>(null);
  const runLogEndRef = useRef<HTMLDivElement | null>(null);

  const score = healthData?.overallScore ?? 0;
  const scoreMeta = getScoreMeta(score);

  const appendRunLog = useCallback((log: Omit<HealthRunLog, 'id'>) => {
    const id = `run-log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setRunLogs((prev) => [...prev, { id, ...log }].slice(-160));
    if (log.phase && HEALTH_PHASE_STEP[log.phase]) {
      setSteps((prev) => prev.map((step) => {
        if (step.name !== HEALTH_PHASE_STEP[log.phase || '']) return step;
        const status = log.status === 'error' ? 'error' : log.status === 'warning' ? 'warning' : log.status === 'done' ? 'done' : 'running';
        return {
          ...step,
          status,
          progress: status === 'done' || status === 'warning' || status === 'error' ? 100 : Math.max(step.progress, 35),
          completedChecks: status === 'done' || status === 'warning' || status === 'error'
            ? step.totalChecks
            : Math.max(step.completedChecks, 1),
        };
      }));
      setOverallProgress((prev) => Math.min(prev + 8, 95));
    }
  }, []);

  const startCheck = useCallback(async () => {
    setPhase('running');
    setRunningError(null);
    setRunLogOpen(true);
    setRunLogStatus('running');
    setRunLogs([]);
    setOverallProgress(3);
    setSteps(DEFAULT_STEPS.map((step, index) => ({
      ...step,
      status: index === 0 ? 'running' : 'pending',
      progress: index === 0 ? 15 : 0,
      completedChecks: 0,
    })));
    appendRunLog({
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      status: 'info',
      text: '已向后端提交巡检任务，等待真实脚本输出。',
      phase: 'start',
    });

    try {
      const data = await runHealthCheckStream(appendRunLog);
      data.executionLogs.forEach((log) => {
        appendRunLog({
          time: log.time,
          status: log.status,
          text: `结果摘要：${log.text}`,
          phase: 'summary',
        });
      });
      setHealthData(data);
      setOverallProgress(100);
      setSteps(data.steps);
      setPhase('complete');
      setRunLogStatus('success');
      toast.success(`真实环境巡检完成，时间 ${new Date(data.timestamp).toLocaleString('zh-CN')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setRunningError(message);
      setPhase('idle');
      setOverallProgress(0);
      setSteps(DEFAULT_STEPS);
      setRunLogStatus('error');
      appendRunLog({
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'error',
        text: `巡检执行失败：${message}`,
        phase: 'error',
      });
      toast.error(`真实巡检执行失败：${message}`);
    }
  }, [appendRunLog]);

  useEffect(() => {
    runLogEndRef.current?.scrollIntoView({ block: 'end' });
  }, [runLogs]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startCheck();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startCheck]);

  const openRemediation = (finding: HealthCheckFinding, plan: HealthCheckRemediation) => {
    setRemediationDialog({ finding, plan });
    setRemediationResult(null);
  };

  const closeRemediation = () => {
    if (remediationRunning) return;
    setRemediationDialog(null);
    setRemediationResult(null);
  };

  const runRemediation = async () => {
    if (!remediationDialog) return;
    setRemediationRunning(true);
    setRemediationResult(null);
    try {
      const result = await runRemediationRequest(remediationDialog.finding, remediationDialog.plan);
      setRemediationResult(result);
      toast.success(result.message || '修复预检已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修复预检失败');
    } finally {
      setRemediationRunning(false);
    }
  };

  const generateReport = useMemo(() => {
    return () => {
      if (!healthData) return;
      const categoryRows = healthData.categories.map((c) => {
        const rowColor = c.score >= 90 ? '#10B981' : c.score >= 70 ? '#F59E0B' : '#EF4444';
        return `<tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${c.name}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:bold;color:${rowColor}">${c.score}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${c.passed}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${c.failed}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${c.warnings}</td>
        </tr>`;
      }).join('');

      const findingsRows = healthData.findings.map((f, index) => {
        const severityColor = f.severity === 'critical' ? '#EF4444' : f.severity === 'warning' ? '#F59E0B' : '#3B82F6';
        const severityLabel = f.severity === 'critical' ? '紧急' : f.severity === 'warning' ? '警告' : '提示';
        const remediation = getRemediationPlan(f);
        const steps = remediation.manualSteps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join('<br/>');
        return `<tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${index + 1}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${f.title}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:${severityColor};font-weight:bold">${severityLabel}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${f.recommendation}<br/><strong>操作步骤:</strong><br/>${steps}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>集群健康巡检报告</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:40px;color:#1a202c;line-height:1.6}
h1{text-align:center;font-size:28px;margin-bottom:8px}
.meta{text-align:center;color:#666;margin-bottom:24px;font-size:14px}
.score-card{text-align:center;padding:24px;background:#f8fafc;border-radius:8px;margin:24px 0;border:2px solid #e2e8f0}
.score-num{font-size:48px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{background:#f1f5f9;padding:10px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px}
.footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:40px}
</style>
</head>
<body>
<h1>集群健康巡检报告</h1>
<p class="meta">集群: ${healthData.cluster} · 时间: ${new Date(healthData.timestamp).toLocaleString('zh-CN')} · 耗时: ${formatTime(healthData.duration_sec)}</p>
<div class="score-card">
  <p style="font-size:14px;color:#64748b;margin-bottom:8px">综合健康评分</p>
  <div class="score-num" style="color:${scoreMeta.color}">${healthData.overallScore}</div>
  <p style="font-size:18px;font-weight:bold;color:${scoreMeta.color}">${scoreMeta.grade}</p>
</div>
<h2>巡检项统计</h2>
<table>
<thead><tr><th>检查类别</th><th style="text-align:center">评分</th><th style="text-align:center">通过</th><th style="text-align:center">失败</th><th style="text-align:center">警告</th></tr></thead>
<tbody>${categoryRows}</tbody>
</table>
<h2>问题发现与修复建议</h2>
<table>
<thead><tr><th style="width:40px">#</th><th>问题描述</th><th style="width:80px">级别</th><th>修复建议</th></tr></thead>
<tbody>${findingsRows}</tbody>
</table>
<p class="footer">Generated by Lustre OPS 智能运维系统</p>
</body></html>`;

      const report = {
        id: `rpt-${Date.now()}`,
        name: `集群健康巡检报告 ${new Date(healthData.timestamp).toLocaleString('zh-CN')}`,
        cluster: healthData.cluster,
        triggerType: 'manual' as const,
        healthScore: healthData.overallScore,
        checksPassed: healthData.checksPassed,
        checksFailed: healthData.checksFailed,
        checksWarned: healthData.checksWarned,
        duration: formatTime(healthData.duration_sec),
        createdAt: healthData.timestamp,
        findings: healthData.findings,
        categoryScores: healthData.categories,
        html,
      };

      const existing = JSON.parse(localStorage.getItem('health-reports') || '[]');
      localStorage.setItem('health-reports', JSON.stringify([report, ...existing]));
      toast.success('巡检报告已生成');
    };
  }, [healthData, scoreMeta.color, scoreMeta.grade]);

  const exportPDF = () => {
    const existing = JSON.parse(localStorage.getItem('health-reports') || '[]');
    const latest = existing[0];
    if (!latest?.html) {
      generateReport();
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(latest.html);
    doc.close();
    setTimeout(() => iframe.contentWindow?.print(), 300);
    setTimeout(() => document.body.removeChild(iframe), 30000);
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-slate-50 dark:bg-[#0A0F1A]">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
            <span>运维工具</span>
            <span>/</span>
            <span className="text-[#0EA5E9]">健康检查</span>
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-[#F1F5F9]">集群健康检查</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">根据当前 Lustre 实际环境执行巡检、生成报告和建议</p>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'running' && (
            <motion.div
              key="running"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="rounded-2xl bg-white dark:bg-[#111827] border border-[#1E293B] p-8"
            >
              <div className="flex items-start gap-8">
                <div className="flex flex-col items-center">
                  <CircularScore score={overallProgress} size={160} />
                  <div className="mt-3 text-sm text-slate-600 dark:text-[#94A3B8]">正在采集真实环境数据</div>
                </div>
                <div className="flex-1">
                  <div className="mb-4 text-sm text-slate-500 dark:text-[#64748B]">
                    巡检中将依次执行 Lustre 服务、客户端挂载、LNet/NID、OST/MDT、target 挂载、fstab、最近内核日志和性能快照等只读检查
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunLogOpen(true)}
                    className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:bg-[#0D1320] dark:text-[#94A3B8] dark:hover:bg-[#1A2234] dark:hover:text-[#F1F5F9]"
                  >
                    <Terminal className="h-4 w-4" />
                    查看实时巡检日志
                  </button>
                  <div className="space-y-1">
                    {steps.map((step, index) => (
                      <StepItem key={step.id} step={step} index={index} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-2xl border border-[#1E293B] bg-white p-10 text-center dark:bg-[#111827]"
            >
              <h2 className="text-2xl font-bold text-slate-900 dark:text-[#F1F5F9]">未获取到巡检结果</h2>
              <p className="mt-2 text-slate-600 dark:text-[#94A3B8]">
                {runningError ? `最近一次巡检失败：${runningError}` : '点击下方按钮开始基于真实 Lustre 环境的巡检'}
              </p>
              <button
                onClick={startCheck}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-8 py-3 text-base font-semibold text-white"
              >
                <PlayCircle className="h-5 w-5" />
                开始健康检查
              </button>
            </motion.div>
          )}

          {phase === 'complete' && healthData && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-[#1E293B] p-8"
                style={{
                  background: `linear-gradient(135deg, ${scoreMeta.color}08 0%, transparent 60%), #111827`,
                  borderColor: `${scoreMeta.color}40`,
                }}
              >
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                  <div className="flex flex-col items-center sm:items-start">
                    <CircularScore score={healthData.overallScore} size={140} />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <span className="inline-block rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: `${scoreMeta.color}20`, color: scoreMeta.color }}>
                      {scoreMeta.grade}
                    </span>
                    <p className="mt-3 text-lg text-slate-900 dark:text-[#F1F5F9]">
                      <span className="text-[#F59E0B]">{healthData.checksWarned} 个警告</span>
                      <span className="mx-2 text-slate-500 dark:text-[#64748B]">·</span>
                      <span className="text-[#EF4444]">{healthData.checksFailed} 个失败</span>
                      <span className="mx-2 text-slate-500 dark:text-[#64748B]">·</span>
                      <span className="text-[#10B981]">{healthData.checksPassed} 项通过</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">
                      检查完成于 {new Date(healthData.timestamp).toLocaleTimeString('zh-CN')} · 耗时 {formatTime(healthData.duration_sec)}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <button onClick={generateReport} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
                        <FileText className="h-4 w-4" />
                        生成报告
                      </button>
                      <button onClick={startCheck} className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0A0F1A] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9] transition-colors">
                        <RotateCcw className="h-4 w-4" />
                        重新检查
                      </button>
                      <button onClick={() => setRunLogOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0A0F1A] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9] transition-colors">
                        <Terminal className="h-4 w-4" />
                        执行日志
                      </button>
                      <button onClick={exportPDF} className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0A0F1A] px-4 py-2 text-sm font-medium text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9] transition-colors">
                        <Download className="h-4 w-4" />
                        导出PDF
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {healthData.categories.map((cat, index) => (
                  <CategoryCard key={cat.name} result={cat} index={index} />
                ))}
              </div>

              <div className="rounded-xl bg-white dark:bg-[#111827] border border-[#1E293B] p-6">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">详细发现</h3>
                {healthData.findings.length ? (
                  <div className="space-y-2">
                    {healthData.findings.map((finding, index) => (
                      <FindingRow key={finding.id} finding={finding} index={index} onRemediate={openRemediation} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#1E293B] px-6 py-5 text-center">
                    <GeneratedEmptyStateVisual
                      src="visuals/lustre-inspection-clear.webp"
                      alt="Lustre 集群巡检通过"
                      fallbackIcon={CheckCircle2}
                    />
                    <div className="mt-2 text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">本次巡检未发现异常</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#64748B]">
                      当前结论仅覆盖本次巡检实际执行的节点和检查项，请继续按计划保持周期巡检。
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border-l-[3px] border-[#0EA5E9] bg-white dark:bg-[#1A2234] p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#0EA5E9]" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">巡检建议</h3>
                </div>
                <div className="space-y-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-[#94A3B8]">
                  {healthData.aiDiagnosisText}
                </div>
                <button
                  onClick={() => toast('工单系统联动尚未接入，本次仅保留巡检建议')}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-[#0EA5E9]/30 bg-[#0EA5E9]/10 px-4 py-2 text-sm text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  应用建议到工单系统
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          <AnimatePresence>
            {runLogOpen && (
              <RunLogDialog
                open={runLogOpen}
                status={runLogStatus}
                logs={runLogs}
                onClose={() => setRunLogOpen(false)}
                logEndRef={runLogEndRef}
              />
            )}
          </AnimatePresence>

          {remediationDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
              onClick={closeRemediation}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-[#1E293B] dark:bg-[#111827]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="remediation-title"
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-[#1E293B] dark:bg-[#111827]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-[#F59E0B]" />
                      <h3 id="remediation-title" className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">
                        {remediationDialog.plan.canAutoFix ? '确认一键修复' : '确认执行安全修复预检'}
                      </h3>
                      <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', riskLabel(remediationDialog.plan.risk).className)}>
                        {riskLabel(remediationDialog.plan.risk).label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-[#94A3B8]">{remediationDialog.finding.title}</p>
                  </div>
                  <button
                    onClick={closeRemediation}
                    disabled={remediationRunning}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#1A2234] dark:hover:text-white"
                    aria-label="关闭修复弹窗"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-5 px-5 py-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="font-medium">安全说明</p>
                    <p className="mt-1 leading-6">
                      当前不会让大语言模型直接执行系统命令；本功能只调用后端白名单 Runbook。
                      {remediationDialog.plan.canAutoFix ? '该动作属于低风险白名单动作，执行前仍会记录结果。' : '该动作涉及生产风险，本次只执行只读预检并给出手动修复步骤。'}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">{remediationDialog.plan.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-[#94A3B8]">{remediationDialog.plan.summary}</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-[#1E293B]">
                      <h5 className="mb-3 text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">管理员手动操作步骤</h5>
                      <ol className="space-y-2">
                        {remediationDialog.plan.manualSteps.map((step, index) => (
                          <li key={step} className="flex gap-2 text-sm leading-6 text-slate-700 dark:text-[#CBD5E1]">
                            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#0EA5E9]/10 text-xs text-[#0EA5E9]">{index + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 dark:border-[#1E293B]">
                      <h5 className="mb-3 text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">修复后验证</h5>
                      <ul className="space-y-2">
                        {remediationDialog.plan.validationSteps.map((step) => (
                          <li key={step} className="flex gap-2 text-sm leading-6 text-slate-700 dark:text-[#CBD5E1]">
                            <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-[#10B981]" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4 dark:border-[#1E293B]">
                    <div className="mb-3 flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-[#0EA5E9]" />
                      <h5 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">安全预检命令</h5>
                    </div>
                    <div className="space-y-2">
                      {remediationDialog.plan.commands.map((command) => (
                        <div key={command.command} className="rounded-lg bg-slate-950 p-3 text-slate-100">
                          <p className="mb-1 text-xs text-slate-400">{command.label}</p>
                          <code className="whitespace-pre-wrap break-all text-xs leading-5">{command.command}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  {remediationResult && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <h5 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{remediationResult.message}</h5>
                      </div>
                      <div className="space-y-3">
                        {remediationResult.results.map((result) => (
                          <div key={`${result.label}-${result.command}`} className="rounded border border-emerald-200 bg-white p-3 dark:border-emerald-500/20 dark:bg-[#0D1320]">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-slate-900 dark:text-[#F1F5F9]">{result.label}</span>
                              <span className={cn('rounded px-2 py-0.5 text-[10px] font-medium', result.ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')}>
                                exit {result.exitCode}
                              </span>
                            </div>
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-xs leading-5 text-slate-100">{result.output || '无输出'}</pre>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-emerald-700 dark:text-emerald-200">{remediationResult.nextStep}</p>
                    </div>
                  )}
                </div>

                <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-[#1E293B] dark:bg-[#111827] sm:flex-row sm:justify-end">
                  <button
                    onClick={closeRemediation}
                    disabled={remediationRunning}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#1E293B] dark:text-[#CBD5E1] dark:hover:bg-[#1A2234]"
                  >
                    取消
                  </button>
                  <button
                    onClick={runRemediation}
                    disabled={remediationRunning}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {remediationRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                    {remediationDialog.plan.canAutoFix ? '确认一键修复' : '执行安全预检'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
