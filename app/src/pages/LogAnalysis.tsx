import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { motion } from 'framer-motion';
import {
  CloudCheck,
  Brain,
  AlertTriangle,
  Search,
  Send,
  Paperclip,
  Zap,
  DownloadCloud,
  Settings,
  Check,
  Copy,
  Terminal,
  Loader2,
  Eye,
  EyeOff,
  BookOpen,
  Database,
  ThumbsUp,
  Plus,
  Trash2,
  Pencil,
  MessageSquare,
  ListFilter,
  Upload,
  RefreshCw,
  FileText,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth';
import { GeneratedEmptyStateVisual } from '@/components/GeneratedEmptyStateVisual';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';

type LogEntry = {
  id: string;
  node: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  timestamp: string;
  source?: string;
};

type CollectionStatus = {
  node: string;
  collecting: boolean;
  lastSync: string;
  logSize: string;
};

type LogsPayload = {
  summary: {
    collectedAt: string;
    totalLogs: number;
    warningCount: number;
    normalCount?: number;
    nodeCount: number;
    coveredNodes: number;
    totalSizeBytes: number;
    totalSizeLabel: string;
    todayDeltaLabel: string;
    engineStatus: string;
    engineModel: string;
    collectionScope?: string;
    defaultView?: 'attention' | 'all';
  };
  logs: LogEntry[];
  collectionStatus: CollectionStatus[];
};

type AISettings = {
  provider: 'deepseek' | 'openai' | 'custom';
  baseUrl: string;
  apiKey: string;
  apiKeyMasked?: string;
  apiKeyConfigured?: boolean;
  modelId: string;
  updatedAt?: string | null;
};

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  meta?: string;
  knowledgeMatches?: KnowledgeMatch[];
}

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

type AgentSessionSummary = {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  lastMessage?: string;
  messageCount: number;
};

type AgentSession = {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  relatedLogSnapshotIds: string[];
  summary: string;
  memoryNotes: string[];
};

type AgentConfig = {
  agentId: string;
  agentName: string;
  model: string;
  systemPrompt: string;
  updatedAt: string;
};

type KnowledgeDraft = {
  title: string;
  problem: string;
  solution: string;
  extraSteps: string;
  tags: string;
  sourceQuestion: string;
  sourceAnswer: string;
  sourceLogs: string;
};

type KnowledgeMatch = {
  id: number | string;
  matchId?: string;
  kind?: 'case' | 'doc_chunk';
  title: string;
  heading?: string;
  content?: string;
  problem?: string;
  solution?: string;
  score?: number;
  feedback_score?: number;
  hit_count?: number;
  tags?: string[];
};

type KnowledgeDocument = {
  id: string;
  title: string;
  filename: string;
  latest_version_id: string;
  version_count: number;
  chunk_count: number;
  status: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

type KnowledgeCase = {
  id: number;
  title: string;
  problem: string;
  solution: string;
  extra_steps: string;
  tags: string[];
  source_question: string;
  source_answer: string;
  source_logs: string;
  feedback_score: number;
  hit_count: number;
  embedding_status: string;
  vector_id: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeStats = {
  caseCount: number;
  documentCount: number;
  chunkCount: number;
  vectorCount: number;
  vectorUpdatedAt: string;
  embedding: string;
};

type KnowledgeVersion = {
  id: string;
  document_id: string;
  version_number: number;
  filename: string;
  size_bytes: number;
  content_sha256: string;
  chunk_count: number;
  parser: string;
  status: string;
  created_at: string;
};

type KnowledgeChunk = {
  id: string;
  document_id: string;
  version_id: string;
  chunk_index: number;
  title: string;
  heading: string;
  content: string;
  tags: string[];
  feedback_score: number;
  hit_count: number;
};

const providerPresets: Record<AISettings['provider'], { label: string; baseUrl: string; modelId: string }> = {
  deepseek: { label: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', modelId: 'deepseek-chat' },
  openai: { label: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-4o-mini' },
  custom: { label: '自定义 OpenAI 渠道', baseUrl: '', modelId: '' },
};

const EMPTY_KNOWLEDGE_STATS: KnowledgeStats = {
  caseCount: 0,
  documentCount: 0,
  chunkCount: 0,
  vectorCount: 0,
  vectorUpdatedAt: '',
  embedding: '',
};

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

function LevelBadge({ level }: { level: LogEntry['level'] }) {
  const colors = {
    DEBUG: 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]',
    INFO: 'bg-[#10B981]/10 text-[#10B981]',
    WARN: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    ERROR: 'bg-[#EF4444]/10 text-[#EF4444]',
    FATAL: 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30',
  };
  return <span className={cn('rounded px-2 py-0.5 text-xs font-medium', colors[level])}>{level}</span>;
}

function isAttentionLog(log: LogEntry) {
  return ['WARN', 'ERROR', 'FATAL'].includes(log.level);
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative mt-2 overflow-hidden rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320]">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9] transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[#10B981]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap p-3 text-xs font-mono leading-relaxed text-slate-600 dark:text-[#94A3B8]">{code}</pre>
    </div>
  );
}

function ChatMessageBubble({
  msg,
  onSaveKnowledge,
  onFeedback,
}: {
  msg: ChatMessage;
  onSaveKnowledge?: (msg: ChatMessage) => void;
  onFeedback?: (msg: ChatMessage) => void;
}) {
  const isUser = msg.role === 'user';
  const lines = msg.content.split('\n');
  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {!isUser && (
        <div className="mt-1 shrink-0">
          <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[#0EA5E9]/30">
            <img src={assetPath('/ai-assistant-avatar.svg')} alt="AI" className="h-full w-full" />
          </div>
        </div>
      )}
      <div className={cn('max-w-[80%] rounded-xl px-4 py-3', isUser ? 'bg-gradient-to-br from-[#0EA5E9] to-[#6366F1]' : 'bg-white dark:bg-[#1A2234] border border-[#1E293B]')}>
        <div className={cn('whitespace-pre-wrap text-sm leading-relaxed', isUser ? 'text-white' : 'text-slate-900 dark:text-[#F1F5F9]')}>
          {lines.map((line, index) => {
            if (line.trim() === '') return <div key={index} className="h-1" />;
            return <p key={index}>{line}</p>;
          })}
        </div>
        <div className={cn('mt-1 text-[10px] text-slate-500 dark:text-[#64748B]', isUser ? 'text-right' : 'text-left')}>{msg.timestamp}</div>
        {msg.meta && !isUser && <div className="mt-1 text-[10px] text-[#0EA5E9]">{msg.meta}</div>}
        {!isUser && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSaveKnowledge?.(msg)}
              className="inline-flex items-center gap-1 rounded-full border border-[#1E293B] px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] dark:text-[#94A3B8]"
            >
              <Database className="h-3 w-3" />
              录入知识库
            </button>
            <button
              type="button"
              onClick={() => onFeedback?.(msg)}
              className="inline-flex items-center gap-1 rounded-full border border-[#1E293B] px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-[#10B981] hover:text-[#10B981] dark:text-[#94A3B8]"
            >
              <ThumbsUp className="h-3 w-3" />
              本次回复有帮助
            </button>
            {!!msg.knowledgeMatches?.length && (
              <span className="rounded-full bg-[#0EA5E9]/10 px-2 py-1 text-[11px] text-[#0EA5E9]">
                命中知识库 {msg.knowledgeMatches.length} 条
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function buildInitialAIMessage(payload: LogsPayload, settings: AISettings | null) {
  const topWarnings = payload.logs.filter(isAttentionLog).slice(-5);
  return `你好！我是 LustreOps AI 助手 👋

我已连接到当前测试环境的 Lustre 日志采集结果。
当前覆盖范围: ${payload.summary.coveredNodes}/${payload.summary.nodeCount} 个节点对象，已收集 ${payload.summary.totalLogs} 条日志，最近收集时间: ${new Date(payload.summary.collectedAt).toLocaleString('zh-CN')}。
采集范围说明: ${payload.summary.collectionScope || '当前部署节点本机日志与数据库已知节点对象'}

AI 模型状态: ${settings?.apiKeyConfigured || settings?.apiKey ? `${providerPresets[settings.provider].label} / ${settings.modelId}` : '未配置'}

大模型默认优先分析 WARN / ERROR / FATAL 异常日志，普通 INFO 日志仅作为必要上下文。

最近需要关注的日志:
${topWarnings.length ? topWarnings.map((log) => `• [${log.level}] ${log.node} - ${log.message}`).join('\n') : '• 暂未发现高优先级异常日志'}
`;
}

function buildAIReply(question: string, payload: LogsPayload) {
  const lower = question.toLowerCase();
  const warnings = payload.logs.filter(isAttentionLog);
  const topNodes = Array.from(new Set(warnings.map((log) => log.node))).slice(0, 5);

  if (warnings.length === 0) {
    return `当前已采集范围内未发现 WARN、ERROR 或 FATAL 日志，共 ${payload.summary.normalCount ?? payload.summary.totalLogs} 条普通日志。该结论仅覆盖 ${payload.summary.coveredNodes}/${payload.summary.nodeCount} 个已采集节点对象。`;
  }

  if (lower.includes('最近') || lower.includes('异常')) {
    return `基于最近一次真实采集结果，共发现 ${warnings.length} 条警告/错误日志。

重点节点:
${topNodes.map((node) => `• ${node}`).join('\n') || '• 暂无'}

最新异常:
${warnings.slice(-5).map((log) => `• ${log.timestamp} ${log.node} [${log.level}] ${log.message}`).join('\n') || '• 暂无异常'}
`;
  }

  const matchedNode = payload.logs.find((log) => lower.includes(log.node.toLowerCase()));
  if (matchedNode) {
    const nodeLogs = payload.logs.filter((log) => log.node === matchedNode.node).slice(-8);
    return `节点 ${matchedNode.node} 的真实日志摘要:

最近日志数: ${nodeLogs.length}
告警数: ${nodeLogs.filter((log) => ['WARN', 'ERROR', 'FATAL'].includes(log.level)).length}

明细:
${nodeLogs.map((log) => `• ${log.timestamp} [${log.level}] ${log.message}`).join('\n')}
`;
  }

  return `已基于当前真实日志池完成一次快速分析。

当前概况:
• 覆盖节点对象: ${payload.summary.coveredNodes}/${payload.summary.nodeCount}
• 已采集日志: ${payload.summary.totalLogs} 条
• 告警/错误: ${payload.summary.warningCount} 条
• 普通日志: ${payload.summary.normalCount ?? Math.max(payload.summary.totalLogs - payload.summary.warningCount, 0)} 条
• AI 模型状态: ${payload.summary.engineStatus}
• 分析策略: 优先分析异常日志，普通日志只作为详情和上下文

建议你继续提问:
• 最近有什么异常？
• 分析某个具体节点
• 总结最近 20 条告警日志`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '刚刚';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function chatMessageFromAgentMessage(message: AgentMessage): ChatMessage | null {
  if (message.role === 'system') return null;
  const metadata = message.metadata || {};
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'ai',
    content: message.content,
    timestamp: formatMessageTime(message.createdAt),
    meta: message.role === 'assistant' && metadata.model ? `来自 ${metadata.provider || 'AI'} / ${metadata.model}` : undefined,
    knowledgeMatches: Array.isArray(metadata.knowledgeMatches) ? metadata.knowledgeMatches as KnowledgeMatch[] : undefined,
  };
}

function chatMessagesFromSession(session: AgentSession | null, payload: LogsPayload | null, settings: AISettings | null) {
  if (!session) return [];
  const mapped = (session.messages || [])
    .map(chatMessageFromAgentMessage)
    .filter((item): item is ChatMessage => Boolean(item));
  if (mapped.length) return mapped;
  if (!payload) return [];
  return [{
    id: 'session-welcome',
    role: 'ai' as const,
    content: buildInitialAIMessage(payload, settings),
    timestamp: '刚刚',
  }];
}

function compactSessionForFrontend(session: AgentSession): AgentSessionSummary {
  const last = [...(session.messages || [])].reverse().find((item) => item.content?.trim());
  return {
    sessionId: session.sessionId,
    title: session.title || '新会话',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    summary: session.summary,
    lastMessage: last?.content?.slice(0, 120) || session.summary || '',
    messageCount: session.messages?.length || 0,
  };
}

async function requestAgentConfig(): Promise<{ ok: boolean; config: AgentConfig }> {
  return requestJson('/api/ai/logs/agent/config');
}

async function saveAgentConfig(config: Pick<AgentConfig, 'agentName' | 'model' | 'systemPrompt'>): Promise<{ ok: boolean; config: AgentConfig; message: string }> {
  return requestJson('/api/ai/logs/agent/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

async function resetAgentConfig(): Promise<{ ok: boolean; config: AgentConfig; message: string }> {
  return requestJson('/api/ai/logs/agent/config/reset', { method: 'POST', body: '{}' });
}

async function requestSessions(): Promise<{ ok: boolean; sessions: AgentSessionSummary[] }> {
  return requestJson('/api/ai/logs/sessions');
}

async function createSession(title = '新会话'): Promise<{ ok: boolean; session: AgentSession }> {
  return requestJson('/api/ai/logs/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

async function requestSession(sessionId: string): Promise<{ ok: boolean; session: AgentSession }> {
  return requestJson(`/api/ai/logs/sessions/${sessionId}`);
}

async function updateSessionTitle(sessionId: string, title: string): Promise<{ ok: boolean; session: AgentSession }> {
  return requestJson(`/api/ai/logs/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

async function deleteSession(sessionId: string): Promise<{ ok: boolean; message: string }> {
  return requestJson(`/api/ai/logs/sessions/${sessionId}`, { method: 'DELETE' });
}

async function requestSessionChat(sessionId: string, question: string): Promise<{
  ok: boolean;
  answer: string;
  model: string;
  provider: string;
  session: AgentSession;
  knowledgeMatches?: KnowledgeMatch[];
}> {
  return requestJson(`/api/ai/logs/sessions/${sessionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

async function requestKnowledgeOverview(): Promise<{
  ok: boolean;
  cases: KnowledgeCase[];
  documents: KnowledgeDocument[];
  stats: KnowledgeStats;
}> {
  return requestJson('/api/knowledge/overview');
}

async function requestKnowledgeDocumentDetail(documentId: string): Promise<{
  ok: boolean;
  document: KnowledgeDocument;
  versions: KnowledgeVersion[];
  chunks: KnowledgeChunk[];
}> {
  return requestJson(`/api/knowledge/documents/${documentId}`);
}

async function deleteKnowledgeDocument(documentId: string): Promise<{ ok: boolean; message: string }> {
  return requestJson(`/api/knowledge/documents/${documentId}`, { method: 'DELETE' });
}

async function uploadKnowledgeDocument(file: File, title: string, tags: string, documentId?: string): Promise<{
  ok: boolean;
  message: string;
  document: KnowledgeDocument;
  version: KnowledgeVersion;
}> {
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  form.append('tags', tags);
  if (documentId) form.append('documentId', documentId);
  const res = await authFetch(documentId ? `/api/knowledge/documents/${documentId}/versions/upload` : '/api/knowledge/documents/upload', {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

async function rebuildKnowledgeIndex(): Promise<{ ok: boolean; message: string; vectorCount: number; updatedAt: string }> {
  return requestJson('/api/knowledge/reindex', { method: 'POST', body: '{}' });
}

async function searchKnowledge(query: string, logs: LogEntry[] = []): Promise<{ ok: boolean; matches: KnowledgeMatch[]; count: number }> {
  return requestJson('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({ query, logs: logs.slice(-20), limit: 8 }),
  });
}

function AISettingsDialog({
  open,
  onOpenChange,
  settings,
  setSettings,
  agentConfig,
  setAgentConfig,
  onSave,
  onTest,
  onSaveAgent,
  onResetAgent,
  saving,
  testing,
  agentSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AISettings;
  setSettings: (value: AISettings) => void;
  agentConfig: AgentConfig | null;
  setAgentConfig: (value: AgentConfig) => void;
  onSave: () => void;
  onTest: () => void;
  onSaveAgent: () => void;
  onResetAgent: () => void;
  saving: boolean;
  testing: boolean;
  agentSaving: boolean;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const baseUrlValid = settings.baseUrl.trim().startsWith('http');
  const modelValid = settings.modelId.trim().length > 0;
  const keyValid = settings.apiKey.trim().length > 0 || Boolean(settings.apiKeyConfigured);
  const canSave = !saving && baseUrlValid && modelValid;
  const canTest = !testing && baseUrlValid && modelValid && keyValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-96px)] w-[calc(100vw-96px)] !max-w-[1320px] flex-col overflow-hidden border-[#1E293B] bg-white p-0 text-slate-900 dark:bg-[#111827] dark:text-[#F1F5F9] max-sm:h-[calc(100dvh-32px)] max-sm:w-[calc(100vw-24px)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-5 dark:border-[#1E293B]">
          <DialogTitle>智能体设置</DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-[#94A3B8]">
            配置模型连接、智能体名称和系统提示词。系统提示词会保存到后端长期记忆目录，下一次分析立即生效。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-auto px-6 py-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#0D1320]">
              <div className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">模型连接</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">API Key 只保存到后端，不写入前端构建产物。</p>
            </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">渠道类型</label>
            <select
              value={settings.provider}
              onChange={(e) => {
                const provider = e.target.value as AISettings['provider'];
                const preset = providerPresets[provider];
                setSettings({
                  ...settings,
                  provider,
                  baseUrl: provider === 'custom' ? settings.baseUrl : preset.baseUrl,
                  modelId: provider === 'custom' ? settings.modelId : preset.modelId,
                });
              }}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#0EA5E9]"
            >
              {Object.entries(providerPresets).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">Base URL</label>
            <input
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              aria-invalid={!baseUrlValid}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#0EA5E9]"
            />
            {!baseUrlValid && <p className="mt-1 text-xs text-amber-500">请输入以 http 或 https 开头的服务地址。</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">API Key</label>
            <div className="flex rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] focus-within:border-[#0EA5E9]">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="sk-..."
                className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-slate-900 outline-none dark:text-[#F1F5F9]"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((visible) => !visible)}
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                className="px-3 text-slate-500 transition-colors hover:text-slate-900 dark:text-[#64748B] dark:hover:text-[#F1F5F9]"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">密钥只提交到后端保存，前端不会写入构建产物。</p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">Model ID</label>
            <input
              value={settings.modelId}
              onChange={(e) => setSettings({ ...settings, modelId: e.target.value })}
              placeholder="gpt-4o-mini / deepseek-chat"
              aria-invalid={!modelValid}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#0EA5E9]"
            />
            {!modelValid && <p className="mt-1 text-xs text-amber-500">请输入模型 ID。</p>}
          </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#0D1320]">
              <div className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">日志诊断智能体</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">系统提示词会参与每次会话分析，适合沉淀诊断格式和安全边界。</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">智能体名称</label>
              <input
                value={agentConfig?.agentName || ''}
                onChange={(e) => agentConfig && setAgentConfig({ ...agentConfig, agentName: e.target.value })}
                placeholder="LustreOps AI 日志诊断助手"
                className="w-full rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">当前模型</label>
              <input
                value={agentConfig?.model || settings.modelId}
                onChange={(e) => agentConfig && setAgentConfig({ ...agentConfig, model: e.target.value })}
                placeholder="默认使用左侧模型 ID"
                className="w-full rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-[#94A3B8]">系统提示词</label>
              <textarea
                value={agentConfig?.systemPrompt || ''}
                onChange={(e) => agentConfig && setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
                className="min-h-[420px] w-full resize-y rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-900 outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320] dark:text-[#F1F5F9]"
                placeholder="请输入智能体系统提示词"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex flex-wrap gap-2 border-t border-slate-200 px-6 py-4 dark:border-[#1E293B]">
          <button
            onClick={() => onOpenChange(false)}
            disabled={saving || testing || agentSaving}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
          >
            取消
          </button>
          <button
            onClick={onTest}
            disabled={!canTest}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#94A3B8]"
          >
            {testing ? <span className="inline-flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> 测试中</span> : '测试连接'}
          </button>
          <button
            onClick={onResetAgent}
            disabled={agentSaving}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-[#F59E0B] hover:text-[#F59E0B] disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#94A3B8]"
          >
            恢复默认提示词
          </button>
          <button
            onClick={onSaveAgent}
            disabled={!agentConfig?.systemPrompt?.trim() || agentSaving}
            className="rounded-lg border border-[#0EA5E9]/40 px-4 py-2 text-sm font-medium text-[#0EA5E9] transition-colors hover:bg-[#0EA5E9]/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {agentSaving ? <span className="inline-flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> 保存中</span> : '保存智能体'}
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <span className="inline-flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> 保存中</span> : '保存设置'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogDetailDialog({
  log,
  onOpenChange,
}: {
  log: LogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[calc(100vw-32px)] border-[#1E293B] bg-white text-slate-900 sm:!max-w-3xl dark:bg-[#111827] dark:text-[#F1F5F9]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-[#0EA5E9]" />
            日志详情
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-[#94A3B8]">
            查看单条日志的完整时间、节点、来源和原始消息。
          </DialogDescription>
        </DialogHeader>
        {log && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#0D1320]">
                <div className="text-xs text-slate-500 dark:text-[#64748B]">时间</div>
                <div className="mt-1 text-sm font-medium">{log.timestamp}</div>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#0D1320]">
                <div className="text-xs text-slate-500 dark:text-[#64748B]">节点</div>
                <div className="mt-1 text-sm font-medium">{log.node}</div>
              </div>
              <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#0D1320]">
                <div className="text-xs text-slate-500 dark:text-[#64748B]">级别</div>
                <div className="mt-1"><LevelBadge level={log.level} /></div>
              </div>
            </div>
            <CodeBlock code={`[${log.timestamp}] [${log.source || 'lustre'}] ${log.node} — ${log.level}\n${log.message}`} />
          </div>
        )}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] dark:text-[#94A3B8]"
          >
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeCaptureDialog({
  open,
  draft,
  saving,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  draft: KnowledgeDraft;
  saving: boolean;
  onDraftChange: (draft: KnowledgeDraft) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const canSubmit = draft.title.trim() && draft.problem.trim() && draft.solution.trim() && !saving;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[calc(100vw-32px)] border-[#1E293B] bg-white text-slate-900 sm:!max-w-3xl dark:bg-[#111827] dark:text-[#F1F5F9]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[#0EA5E9]" />
            确认录入本地知识库
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-[#94A3B8]">
            确认本次问题、模型建议和人工补充步骤后写入知识库。后续 RAG/向量检索会把这些经验作为智能体知识来源。
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-3 overflow-auto pr-1">
          <label className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-[#64748B]">知识标题</span>
            <input
              value={draft.title}
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320]"
              placeholder="例如：客户端挂载丢失恢复后日志分析"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-[#64748B]">问题现象</span>
            <textarea
              value={draft.problem}
              onChange={(e) => onDraftChange({ ...draft, problem: e.target.value })}
              className="min-h-24 w-full resize-y rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320]"
              placeholder="记录故障现象、告警、关键日志和影响范围"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-[#64748B]">模型建议/确认方案</span>
            <textarea
              value={draft.solution}
              onChange={(e) => onDraftChange({ ...draft, solution: e.target.value })}
              className="min-h-36 w-full resize-y rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320]"
              placeholder="记录已经确认有效的分析结论和处理建议"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-[#64748B]">人工补充处理步骤</span>
            <textarea
              value={draft.extraSteps}
              onChange={(e) => onDraftChange({ ...draft, extraSteps: e.target.value })}
              className="min-h-24 w-full resize-y rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320]"
              placeholder="如果实际处理步骤与模型建议不同，在这里补充；例如具体节点、命令前置条件、回滚方式"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-[#64748B]">标签</span>
            <input
              value={draft.tags}
              onChange={(e) => onDraftChange({ ...draft, tags: e.target.value })}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#0D1320]"
              placeholder="lustre,日志分析,客户端挂载,LNet"
            />
          </label>
        </div>
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-slate-500 hover:text-slate-900 disabled:opacity-60 dark:text-[#94A3B8]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <span className="inline-flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> 录入中</span> : '确认录入'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeBaseDialog({
  open,
  cases,
  documents,
  stats,
  selectedCase,
  selectedDocument,
  versions,
  chunks,
  matches,
  loading,
  uploading,
  reindexing,
  error,
  searchQuery,
  uploadTitle,
  uploadTags,
  onOpenChange,
  onRefresh,
  onSelectCase,
  onSelectDocument,
  onUpload,
  onReindex,
  onDeleteDocument,
  onSearchQueryChange,
  onSearch,
  onFeedback,
  setUploadTitle,
  setUploadTags,
}: {
  open: boolean;
  cases: KnowledgeCase[];
  documents: KnowledgeDocument[];
  stats: KnowledgeStats;
  selectedCase: KnowledgeCase | null;
  selectedDocument: KnowledgeDocument | null;
  versions: KnowledgeVersion[];
  chunks: KnowledgeChunk[];
  matches: KnowledgeMatch[];
  loading: boolean;
  uploading: boolean;
  reindexing: boolean;
  error: string;
  searchQuery: string;
  uploadTitle: string;
  uploadTags: string;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
  onSelectCase: (item: KnowledgeCase) => void;
  onSelectDocument: (documentId: string) => void;
  onUpload: (file: File, asNewVersion: boolean) => void;
  onReindex: () => void;
  onDeleteDocument: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onFeedback: (match: KnowledgeMatch, helpful: boolean) => void;
  setUploadTitle: (value: string) => void;
  setUploadTags: (value: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const versionFileInputRef = useRef<HTMLInputElement | null>(null);
  const currentFileName = selectedDocument?.filename || '未选择文档';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-80px)] w-[calc(100vw-80px)] !max-w-[1440px] flex-col overflow-hidden border-[#1E293B] bg-white p-0 text-slate-900 dark:bg-[#111827] dark:text-[#F1F5F9] max-sm:h-[calc(100dvh-24px)] max-sm:w-[calc(100vw-20px)]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 py-5 dark:border-[#1E293B]">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[#10B981]" />
            智能体知识库
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-[#94A3B8]">
            统一管理人工确认的故障经验与上传文档，两类知识都会进入本地向量索引，供 AI 日志分析召回。
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-slate-500 dark:text-[#64748B]">
            <span className="rounded border border-[#1E293B] px-2 py-1">人工经验 {stats.caseCount}</span>
            <span className="rounded border border-[#1E293B] px-2 py-1">文档 {stats.documentCount}</span>
            <span className="rounded border border-[#1E293B] px-2 py-1">知识片段 {stats.chunkCount}</span>
            <span className="rounded border border-[#10B981]/40 px-2 py-1 text-[#10B981]">向量 {stats.vectorCount}</span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
          <section className="flex min-h-0 flex-col rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320]">
            <div className="shrink-0 border-b border-slate-200 p-4 dark:border-[#1E293B]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">文档上传</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">支持 .md / .txt / .log / .conf，单文件 5MB 内。</p>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="rounded-lg border border-[#1E293B] p-2 text-slate-500 hover:text-[#0EA5E9] disabled:opacity-60"
                  title="刷新知识库"
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  value={uploadTitle}
                  onChange={(event) => setUploadTitle(event.target.value)}
                  className="w-full rounded-lg border border-[#1E293B] bg-white px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#111827]"
                  placeholder="文档标题，例如 Lustre 维护手册"
                />
                <input
                  value={uploadTags}
                  onChange={(event) => setUploadTags(event.target.value)}
                  className="w-full rounded-lg border border-[#1E293B] bg-white px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#111827]"
                  placeholder="标签，例如 lustre,官方手册,运维"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,.log,.conf,text/plain,text/markdown"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, false);
                    event.currentTarget.value = '';
                  }}
                />
                <input
                  ref={versionFileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,.log,.conf,text/plain,text/markdown"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, true);
                    event.currentTarget.value = '';
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    上传文档
                  </button>
                  <button
                    type="button"
                    onClick={() => versionFileInputRef.current?.click()}
                    disabled={uploading || !selectedDocument}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#1E293B] px-3 py-2 text-sm font-medium text-slate-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#94A3B8]"
                    title={selectedDocument ? `为 ${currentFileName} 上传新版本` : '请先选择一个文档'}
                  >
                    <Layers className="h-4 w-4" />
                    新版本
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onReindex}
                  disabled={reindexing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#10B981]/40 px-3 py-2 text-sm font-medium text-[#10B981] hover:bg-[#10B981]/10 disabled:opacity-60"
                >
                  {reindexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  重建向量索引
                </button>
                <button
                  type="button"
                  onClick={onDeleteDocument}
                  disabled={!selectedDocument || uploading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#EF4444]/35 px-3 py-2 text-sm font-medium text-[#EF4444] hover:bg-[#EF4444]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  删除当前文档
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {loading && !cases.length && !documents.length ? (
                <div className="rounded-lg border border-dashed border-[#1E293B] p-6 text-center text-sm text-slate-500">正在加载知识库...</div>
              ) : error ? (
                <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm text-[#EF4444]">
                  <div className="font-medium">知识库加载失败</div>
                  <p className="mt-1 text-xs">{error}</p>
                  <button type="button" onClick={onRefresh} className="mt-3 rounded border border-[#EF4444]/40 px-3 py-1.5 text-xs">重新加载</button>
                </div>
              ) : cases.length || documents.length ? (
                <div className="space-y-4">
                  {!!cases.length && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#64748B]">
                        <span>人工确认经验</span>
                        <span>{cases.length} 条</span>
                      </div>
                      <div className="space-y-2">
                        {cases.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectCase(item)}
                            className={cn(
                              'w-full rounded-lg border p-3 text-left transition-colors',
                              selectedCase?.id === item.id
                                ? 'border-[#10B981] bg-[#10B981]/10'
                                : 'border-[#1E293B] bg-white hover:border-[#10B981]/60 dark:bg-[#111827]'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="line-clamp-1 text-sm font-medium">{item.title}</span>
                              <span className="shrink-0 rounded bg-[#10B981]/10 px-2 py-0.5 text-[11px] text-[#10B981]">经验</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-[#64748B]">{item.problem}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-[#64748B]">
                              <span>命中 {item.hit_count}</span>
                              <span>质量分 {item.feedback_score}</span>
                              {item.tags?.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!documents.length && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#64748B]">
                        <span>上传文档</span>
                        <span>{documents.length} 份</span>
                      </div>
                      <div className="space-y-2">
                        {documents.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => onSelectDocument(doc.id)}
                            className={cn(
                              'w-full rounded-lg border p-3 text-left transition-colors',
                              selectedDocument?.id === doc.id
                                ? 'border-[#0EA5E9] bg-[#0EA5E9]/10'
                                : 'border-[#1E293B] bg-white hover:border-[#0EA5E9]/60 dark:bg-[#111827]'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="line-clamp-1 text-sm font-medium">{doc.title}</span>
                              <span className="rounded-full bg-[#0EA5E9]/10 px-2 py-0.5 text-[11px] text-[#0EA5E9]">{doc.status}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">{doc.filename}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-[#64748B]">
                              <span>版本 {doc.version_count}</span>
                              <span>片段 {doc.chunk_count}</span>
                              {doc.tags?.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[#1E293B] p-6 text-center">
                  <GeneratedEmptyStateVisual
                    src="visuals/lustre-knowledge-empty.webp"
                    alt="Lustre 知识库等待内容"
                    fallbackIcon={FileText}
                  />
                  <div className="mt-2 text-sm font-medium">暂无知识数据</div>
                  <p className="mt-1 text-xs text-slate-500">可从 AI 对话确认录入经验，或上传 Lustre 运维文档。</p>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-lg border border-[#1E293B] bg-white dark:bg-[#0D1320]">
            <div className="shrink-0 border-b border-slate-200 p-4 dark:border-[#1E293B]">
              <h3 className="text-sm font-semibold">{selectedCase ? '经验知识详情' : '版本与知识片段'}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">
                {selectedCase
                  ? `${selectedCase.title} · 人工确认录入`
                  : selectedDocument
                    ? `${selectedDocument.title} · 最新版本 ${selectedDocument.version_count}`
                    : '选择左侧知识查看详细内容。'}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {selectedCase ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-[#10B981]/10 px-2 py-1 text-[#10B981]">人工经验</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-[#1A2234] dark:text-[#94A3B8]">命中 {selectedCase.hit_count}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-[#1A2234] dark:text-[#94A3B8]">质量分 {selectedCase.feedback_score}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-[#1A2234] dark:text-[#94A3B8]">
                      {selectedCase.embedding_status === 'ready' ? '已索引' : selectedCase.embedding_status === 'pending' ? '待索引' : '索引异常'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[#1E293B] bg-slate-50 p-4 dark:bg-[#111827]">
                    <div className="text-xs font-semibold text-slate-500 dark:text-[#64748B]">问题现象</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedCase.problem}</p>
                  </div>
                  <div className="rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4">
                    <div className="text-xs font-semibold text-[#10B981]">确认的处理建议</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedCase.solution}</p>
                  </div>
                  {!!selectedCase.extra_steps && (
                    <div className="rounded-lg border border-[#0EA5E9]/30 bg-[#0EA5E9]/5 p-4">
                      <div className="text-xs font-semibold text-[#0EA5E9]">人工补充步骤</div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedCase.extra_steps}</p>
                    </div>
                  )}
                  {!!selectedCase.source_question && (
                    <div className="rounded-lg border border-[#1E293B] p-4">
                      <div className="text-xs font-semibold text-slate-500 dark:text-[#64748B]">来源问题</div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedCase.source_question}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-[#1E293B] dark:text-[#64748B]">
                    {selectedCase.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                    <span>录入时间 {selectedCase.created_at.replace('T', ' ').slice(0, 19)}</span>
                  </div>
                </div>
              ) : selectedDocument ? (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-[#64748B]">版本记录</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {versions.map((version) => (
                        <div key={version.id} className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 text-xs dark:bg-[#111827]">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">v{version.version_number}</span>
                            <span>{version.status}</span>
                          </div>
                          <div className="mt-1 text-slate-500 dark:text-[#64748B]">{version.filename}</div>
                          <div className="mt-1 text-slate-500 dark:text-[#64748B]">片段 {version.chunk_count} · {Math.ceil((version.size_bytes || 0) / 1024)} KB</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-[#64748B]">当前索引片段</div>
                    <div className="space-y-2">
                      {chunks.slice(0, 40).map((chunk) => (
                        <div key={chunk.id} className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#111827]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="line-clamp-1 text-sm font-medium">{chunk.heading || chunk.title}</div>
                            <div className="shrink-0 text-[11px] text-slate-500">命中 {chunk.hit_count}</div>
                          </div>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500 dark:text-[#64748B]">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#1E293B] text-sm text-slate-500">
                  请选择一条经验或一份文档
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-lg border border-[#1E293B] bg-white dark:bg-[#0D1320]">
            <div className="shrink-0 border-b border-slate-200 p-4 dark:border-[#1E293B]">
              <h3 className="text-sm font-semibold">向量召回测试</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#64748B]">模拟 AI 日志分析时的知识召回结果，可对命中项点赞或降权。</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSearch();
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[#1E293B] bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0EA5E9] dark:bg-[#111827]"
                  placeholder="例如：LNet 超时、OST 不可用、客户端挂载失败"
                />
                <button
                  type="button"
                  onClick={onSearch}
                  disabled={!searchQuery.trim()}
                  className="rounded-lg bg-[#0EA5E9] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  检索
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {matches.length ? (
                <div className="space-y-3">
                  {matches.map((match) => (
                    <div key={`${match.kind}-${match.id}`} className="rounded-lg border border-[#1E293B] bg-slate-50 p-3 dark:bg-[#111827]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{match.title}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {match.kind === 'case' ? '故障经验' : '文档片段'} · 召回分 {match.score ?? '--'} · 质量分 {match.feedback_score ?? 0}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => onFeedback(match, true)} className="rounded border border-[#1E293B] p-1 hover:text-[#10B981]" title="提升权重">
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => onFeedback(match, false)} className="rounded border border-[#1E293B] p-1 hover:text-[#EF4444]" title="降低权重">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-5 text-xs leading-5 text-slate-500 dark:text-[#64748B]">
                        {match.kind === 'case' ? (match.solution || match.problem) : match.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#1E293B] text-center text-sm text-slate-500">
                  输入问题后可以测试本地向量知识库召回结果。
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 px-6 py-4 dark:border-[#1E293B]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] dark:text-[#94A3B8]"
          >
            关闭
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogExplorerPanel({
  payload,
  loading,
  logView,
  setLogView,
  logFilter,
  setLogFilter,
  filteredLogs,
  uniqueNodes,
  attentionLogs,
  onSelectLog,
}: {
  payload: LogsPayload | null;
  loading: boolean;
  logView: 'attention' | 'all';
  setLogView: (value: 'attention' | 'all') => void;
  logFilter: { node: string; level: string; keyword: string };
  setLogFilter: Dispatch<SetStateAction<{ node: string; level: string; keyword: string }>>;
  filteredLogs: LogEntry[];
  uniqueNodes: string[];
  attentionLogs: LogEntry[];
  onSelectLog: (log: LogEntry) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[#1E293B] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-[#1E293B] bg-slate-50 p-1 dark:bg-[#0D1320]">
            <button
              type="button"
              onClick={() => setLogView('attention')}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', logView === 'attention' ? 'bg-white text-[#0EA5E9] shadow-sm dark:bg-[#1A2234]' : 'text-slate-500 hover:text-slate-900 dark:text-[#64748B] dark:hover:text-[#F1F5F9]')}
            >
              需关注日志 {attentionLogs.length}
            </button>
            <button
              type="button"
              onClick={() => setLogView('all')}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', logView === 'all' ? 'bg-white text-[#0EA5E9] shadow-sm dark:bg-[#1A2234]' : 'text-slate-500 hover:text-slate-900 dark:text-[#64748B] dark:hover:text-[#F1F5F9]')}
            >
              全部日志 {payload?.summary.totalLogs || 0}
            </button>
          </div>
          <div className="text-xs text-slate-500 dark:text-[#64748B]">
            默认只展示 WARN / ERROR / FATAL，普通 INFO 可在全部日志中查看
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_150px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-[#64748B]" />
            <input
              type="text"
              placeholder="搜索日志内容或节点..."
              value={logFilter.keyword}
              onChange={(e) => setLogFilter((prev) => ({ ...prev, keyword: e.target.value }))}
              className="w-full rounded-lg border border-[#1E293B] bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors focus:border-[#0EA5E9] dark:bg-[#0D1320] dark:text-[#F1F5F9]"
            />
          </div>
          <select
            value={logFilter.node}
            onChange={(e) => setLogFilter((prev) => ({ ...prev, node: e.target.value }))}
            className="rounded-lg border border-[#1E293B] bg-slate-50 px-2 py-1.5 text-sm text-slate-600 focus:border-[#0EA5E9] focus:outline-none dark:bg-[#0D1320] dark:text-[#94A3B8]"
          >
            <option value="all">全部节点</option>
            {uniqueNodes.map((node) => <option key={node} value={node}>{node}</option>)}
          </select>
          <select
            value={logFilter.level}
            onChange={(e) => setLogFilter((prev) => ({ ...prev, level: e.target.value }))}
            className="rounded-lg border border-[#1E293B] bg-slate-50 px-2 py-1.5 text-sm text-slate-600 focus:border-[#0EA5E9] focus:outline-none dark:bg-[#0D1320] dark:text-[#94A3B8]"
          >
            <option value="all">全部级别</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="FATAL">FATAL</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-[#64748B]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            读取日志中...
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-white dark:bg-[#1A2234]">
              <tr>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">时间</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">节点</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">级别</th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">消息</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-sm">
                      {logView === 'attention' ? (
                        <GeneratedEmptyStateVisual
                          src="visuals/lustre-logs-healthy.webp"
                          alt="Lustre 日志采集正常"
                          fallbackIcon={CloudCheck}
                        />
                      ) : (
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-[#1A2234] dark:text-[#64748B]">
                          <Search className="h-5 w-5" />
                        </div>
                      )}
                      <div className="mt-3 text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">
                        {logView === 'attention' ? '当前没有需关注日志' : '没有匹配的日志'}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#64748B]">
                        {logView === 'attention'
                          ? 'WARN / ERROR / FATAL 日志为空。普通 INFO 日志已收起，可切换到全部日志查看详情。'
                          : '请调整节点、级别或关键词筛选条件。'}
                      </p>
                      {logView === 'attention' && (
                        <button
                          type="button"
                          onClick={() => setLogView('all')}
                          className="mt-3 rounded-lg border border-[#1E293B] px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] dark:text-[#94A3B8]"
                        >
                          查看全部普通日志
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => onSelectLog(log)}
                  className="cursor-pointer border-b border-[#1E293B] transition-colors hover:bg-slate-50 dark:hover:bg-[#1A2234]"
                >
                  <td className="px-3 py-2 text-xs font-mono text-slate-500 dark:text-[#64748B]">{log.timestamp.split(' ')[1]}</td>
                  <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-[#94A3B8]">{log.node}</td>
                  <td className="px-3 py-2"><LevelBadge level={log.level} /></td>
                  <td className="max-w-[720px] px-3 py-2 text-xs text-slate-900 dark:text-[#F1F5F9]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{log.message}</span>
                      <span className="shrink-0 rounded-full border border-[#1E293B] px-2 py-0.5 text-[10px] text-slate-500 dark:text-[#64748B]">详情</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 border-t border-[#1E293B] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-[#94A3B8]">日志收集状态</span>
          <span className="text-xs text-slate-500 dark:text-[#64748B]">{payload?.summary.coveredNodes || 0} 节点对象 · 实时</span>
        </div>
        <p className="mb-2 text-[11px] leading-4 text-slate-500 dark:text-[#64748B]">
          {payload?.summary.collectionScope || '当前展示当前部署节点本机 Lustre/LNet 相关日志；完整 server/client 节点采集需接入节点清单与远程采集代理。'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(payload?.collectionStatus || []).slice(0, 8).map((item) => (
            <div key={item.node} className={cn('flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]', item.collecting ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', item.collecting ? 'bg-[#10B981]' : 'bg-[#EF4444]')} />
              {item.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LogExplorerDialog({
  open,
  onOpenChange,
  ...panelProps
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & ComponentProps<typeof LogExplorerPanel>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-96px)] w-[calc(100vw-32px)] !max-w-[calc(100vw-32px)] flex-col overflow-hidden border-[#1E293B] bg-white p-0 text-slate-900 sm:w-[90vw] sm:!max-w-6xl dark:bg-[#111827] dark:text-[#F1F5F9]">
        <DialogHeader className="shrink-0 border-b border-[#1E293B] px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListFilter className="h-4 w-4 text-[#0EA5E9]" />
            日志详情
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 dark:text-[#94A3B8]">
            查看、搜索和筛选当前采集到的 Lustre 日志。日志详情仅在需要时弹窗展示，不占用主工作台空间。
          </DialogDescription>
        </DialogHeader>
        <LogExplorerPanel {...panelProps} />
      </DialogContent>
    </Dialog>
  );
}

function SessionSidebar({
  sessions,
  activeSessionId,
  loading,
  creating,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: AgentSessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  creating: boolean;
  onCreate: () => void;
  onSelect: (sessionId: string) => void;
  onRename: (session: AgentSessionSummary) => void;
  onDelete: (session: AgentSessionSummary) => void;
}) {
  return (
    <aside className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] xl:min-h-0">
      <div className="flex shrink-0 items-center justify-between border-b border-[#1E293B] px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[#F1F5F9]">智能诊断会话</h2>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-[#64748B]">长期保存到后端记忆目录</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex items-center gap-1 rounded-lg bg-[#0EA5E9] px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          新建
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-[#64748B]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            读取会话...
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <MessageSquare className="h-8 w-8 text-[#0EA5E9]" />
            <div className="mt-3 text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">暂无会话</div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#64748B]">创建一个会话后，日志诊断上下文会持久保存。</p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-3 rounded-lg border border-[#1E293B] px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9] dark:text-[#94A3B8]"
            >
              新建会话
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const active = session.sessionId === activeSessionId;
              return (
                <div
                  key={session.sessionId}
                  className={cn('group rounded-lg border p-2 transition-colors', active ? 'border-[#0EA5E9] bg-[#0EA5E9]/5' : 'border-[#1E293B] hover:border-[#0EA5E9]/50 hover:bg-slate-50 dark:hover:bg-[#1A2234]')}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(session.sessionId)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{session.title || '新会话'}</div>
                      <div className="shrink-0 text-[10px] text-slate-500 dark:text-[#64748B]">{formatSessionTime(session.updatedAt)}</div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-[#64748B]">
                      {session.lastMessage || session.summary || '还没有对话内容'}
                    </p>
                    <div className="mt-2 text-[10px] text-slate-400">{session.messageCount || 0} 条消息</div>
                  </button>
                  <div className="mt-2 flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onRename(session)}
                      className="rounded p-1 text-slate-500 transition-colors hover:bg-white hover:text-[#0EA5E9] dark:text-[#64748B] dark:hover:bg-[#0D1320]"
                      title="重命名会话"
                      aria-label="重命名会话"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(session)}
                      className="rounded p-1 text-slate-500 transition-colors hover:bg-white hover:text-[#EF4444] dark:text-[#64748B] dark:hover:bg-[#0D1320]"
                      title="删除会话"
                      aria-label="删除会话"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

export default function LogAnalysis() {
  const [payload, setPayload] = useState<LogsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [logExplorerOpen, setLogExplorerOpen] = useState(false);
  const [logFilter, setLogFilter] = useState({ node: 'all', level: 'all', keyword: '' });
  const [logView, setLogView] = useState<'attention' | 'all'>('attention');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeManagerOpen, setKnowledgeManagerOpen] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeDraft>({
    title: '',
    problem: '',
    solution: '',
    extraSteps: '',
    tags: 'lustre,日志分析',
    sourceQuestion: '',
    sourceAnswer: '',
    sourceLogs: '',
  });
  const [aiSettings, setAISettings] = useState<AISettings>({
    provider: 'openai',
    baseUrl: providerPresets.openai.baseUrl,
    apiKey: '',
    modelId: providerPresets.openai.modelId,
  });
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [knowledgeCases, setKnowledgeCases] = useState<KnowledgeCase[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats>(EMPTY_KNOWLEDGE_STATS);
  const [selectedKnowledgeCase, setSelectedKnowledgeCase] = useState<KnowledgeCase | null>(null);
  const [selectedKnowledgeDocument, setSelectedKnowledgeDocument] = useState<KnowledgeDocument | null>(null);
  const [knowledgeVersions, setKnowledgeVersions] = useState<KnowledgeVersion[]>([]);
  const [knowledgeChunks, setKnowledgeChunks] = useState<KnowledgeChunk[]>([]);
  const [knowledgeMatches, setKnowledgeMatches] = useState<KnowledgeMatch[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeUploading, setKnowledgeUploading] = useState(false);
  const [knowledgeReindexing, setKnowledgeReindexing] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const [knowledgeUploadTitle, setKnowledgeUploadTitle] = useState('');
  const [knowledgeUploadTags, setKnowledgeUploadTags] = useState('lustre,官方手册,运维知识');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionCreating, setSessionCreating] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickPrompts = ['分析当前异常日志', '总结 WARN/ERROR 日志', '分析 lustrefs-OST0002', '为什么当前没有异常'];

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const loadAISettings = useCallback(async () => {
    const data = await requestJson<AISettings>('/api/ai/settings');
    setAISettings({
      provider: data.provider,
      baseUrl: data.baseUrl,
      apiKey: '',
      modelId: data.modelId,
      apiKeyMasked: data.apiKeyMasked,
      apiKeyConfigured: data.apiKeyConfigured,
      updatedAt: data.updatedAt,
    });
    return data;
  }, []);

  const loadLatestLogs = useCallback(async () => {
    const data = await requestJson<LogsPayload>('/api/logs/latest');
    setPayload(data);
    return data;
  }, []);

  const loadAgentConfig = useCallback(async () => {
    const data = await requestAgentConfig();
    setAgentConfig(data.config);
    return data.config;
  }, []);

  const refreshSessions = useCallback(async () => {
    const data = await requestSessions();
    setSessions(data.sessions);
    return data.sessions;
  }, []);

  const loadKnowledgeOverview = useCallback(async () => {
    setKnowledgeLoading(true);
    setKnowledgeError('');
    try {
      const data = await requestKnowledgeOverview();
      setKnowledgeCases(data.cases);
      setKnowledgeDocuments(data.documents);
      setKnowledgeStats(data.stats);
      return data;
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : '无法读取知识库数据');
      throw error;
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  const loadKnowledgeDocumentDetail = useCallback(async (documentId: string) => {
    setKnowledgeLoading(true);
    try {
      const data = await requestKnowledgeDocumentDetail(documentId);
      setSelectedKnowledgeDocument(data.document);
      setKnowledgeVersions(data.versions);
      setKnowledgeChunks(data.chunks);
      return data.document;
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string, logsData?: LogsPayload | null, settingsData?: AISettings | null) => {
    setSessionLoading(true);
    try {
      const data = await requestSession(sessionId);
      setActiveSession(data.session);
      setActiveSessionId(data.session.sessionId);
      localStorage.setItem('lustre-log-analyzer-session-id', data.session.sessionId);
      setMessages(chatMessagesFromSession(data.session, logsData ?? null, settingsData ?? null));
      return data.session;
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const [logsData, settingsData, , sessionList] = await Promise.all([
        loadLatestLogs(),
        loadAISettings(),
        loadAgentConfig(),
        refreshSessions(),
      ]);
      let nextSessions = sessionList;
      let selectedSessionId = localStorage.getItem('lustre-log-analyzer-session-id');
      if (!nextSessions.length) {
        const created = await createSession('新会话');
        nextSessions = [compactSessionForFrontend(created.session)];
        setSessions(nextSessions);
        selectedSessionId = created.session.sessionId;
      }
      if (!selectedSessionId || !nextSessions.some((item) => item.sessionId === selectedSessionId)) {
        selectedSessionId = nextSessions[0]?.sessionId || null;
      }
      if (selectedSessionId) {
        await loadSession(selectedSessionId, logsData, settingsData);
      }
    } catch (error) {
      toast.error(`初始化失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [loadAISettings, loadAgentConfig, loadLatestLogs, loadSession, refreshSessions]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (!knowledgeManagerOpen) return;
    void (async () => {
      try {
        const data = await loadKnowledgeOverview();
        if (data.cases[0]) {
          setSelectedKnowledgeCase(data.cases[0]);
          setSelectedKnowledgeDocument(null);
          setKnowledgeVersions([]);
          setKnowledgeChunks([]);
        } else if (data.documents[0]?.id) {
          setSelectedKnowledgeCase(null);
          await loadKnowledgeDocumentDetail(data.documents[0].id);
        } else {
          setSelectedKnowledgeCase(null);
          setSelectedKnowledgeDocument(null);
          setKnowledgeVersions([]);
          setKnowledgeChunks([]);
        }
      } catch (error) {
        toast.error(`知识库加载失败: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    })();
  }, [knowledgeManagerOpen, loadKnowledgeOverview, loadKnowledgeDocumentDetail]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const data = await requestJson<LogsPayload>('/api/logs/collect', { method: 'POST', body: '{}' });
      setPayload(data);
      if (activeSession && (!activeSession.messages || activeSession.messages.length === 0)) {
        setMessages(chatMessagesFromSession(activeSession, data, aiSettings));
      }
      toast.success(`日志收集完成，已采集 ${data.summary.totalLogs} 条真实日志`);
    } catch (error) {
      toast.error(`日志收集失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setCollecting(false);
    }
  };

  const handleSelectKnowledgeCase = (item: KnowledgeCase) => {
    setSelectedKnowledgeCase(item);
    setSelectedKnowledgeDocument(null);
    setKnowledgeVersions([]);
    setKnowledgeChunks([]);
  };

  const handleSelectKnowledgeDocument = async (documentId: string) => {
    try {
      setSelectedKnowledgeCase(null);
      await loadKnowledgeDocumentDetail(documentId);
    } catch (error) {
      toast.error(`文档详情加载失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const handleUploadKnowledgeDocument = async (file: File, asNewVersion: boolean) => {
    if (asNewVersion && !selectedKnowledgeDocument) {
      toast.error('请先选择要更新的文档');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('文件超过 5MB，请拆分后上传');
      return;
    }
    setKnowledgeUploading(true);
    try {
      const data = await uploadKnowledgeDocument(
        file,
        knowledgeUploadTitle || file.name.replace(/\.[^.]+$/, ''),
        knowledgeUploadTags,
        asNewVersion ? selectedKnowledgeDocument?.id : undefined,
      );
      toast.success(data.message || '文档已完成解析和向量索引');
      await loadKnowledgeOverview();
      setSelectedKnowledgeCase(null);
      await loadKnowledgeDocumentDetail(data.document.id);
    } catch (error) {
      toast.error(`上传失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setKnowledgeUploading(false);
    }
  };

  const handleRebuildKnowledgeIndex = async () => {
    setKnowledgeReindexing(true);
    try {
      const data = await rebuildKnowledgeIndex();
      toast.success(`${data.message}，向量数 ${data.vectorCount}`);
      await loadKnowledgeOverview();
      if (selectedKnowledgeDocument) {
        await loadKnowledgeDocumentDetail(selectedKnowledgeDocument.id);
      }
    } catch (error) {
      toast.error(`重建索引失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setKnowledgeReindexing(false);
    }
  };

  const handleDeleteKnowledgeDocument = async () => {
    if (!selectedKnowledgeDocument) {
      toast('请先选择文档');
      return;
    }
    if (!window.confirm(`确定删除“${selectedKnowledgeDocument.title}”吗？这会删除该文档的所有版本和向量片段。`)) return;
    setKnowledgeLoading(true);
    try {
      const data = await deleteKnowledgeDocument(selectedKnowledgeDocument.id);
      toast.success(data.message || '文档已删除');
      setSelectedKnowledgeDocument(null);
      setSelectedKnowledgeCase(null);
      setKnowledgeVersions([]);
      setKnowledgeChunks([]);
      setKnowledgeMatches([]);
      const overview = await loadKnowledgeOverview();
      if (overview.cases[0]) {
        setSelectedKnowledgeCase(overview.cases[0]);
      } else if (overview.documents[0]?.id) {
        await loadKnowledgeDocumentDetail(overview.documents[0].id);
      }
    } catch (error) {
      toast.error(`删除失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleSearchKnowledge = async () => {
    if (!knowledgeSearchQuery.trim()) {
      toast('请输入要检索的问题');
      return;
    }
    setKnowledgeLoading(true);
    try {
      const data = await searchKnowledge(knowledgeSearchQuery.trim(), payload?.logs || []);
      setKnowledgeMatches(data.matches);
      const overview = await loadKnowledgeOverview();
      const refreshedCase = overview.cases.find((item) => item.id === selectedKnowledgeCase?.id);
      if (refreshedCase) setSelectedKnowledgeCase(refreshedCase);
      toast.success(`召回 ${data.count} 条知识`);
    } catch (error) {
      toast.error(`召回测试失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const submitKnowledgeFeedback = async (match: KnowledgeMatch, helpful: boolean) => {
    const kind = match.kind || (String(match.matchId || '').startsWith('chunk:') ? 'doc_chunk' : 'case');
    const endpoint = kind === 'doc_chunk'
      ? `/api/knowledge/chunks/${match.id}/feedback`
      : `/api/knowledge/logs/${match.id}/feedback`;
    await requestJson(endpoint, {
      method: 'POST',
      body: JSON.stringify({ helpful }),
    });
  };

  const handleKnowledgeMatchFeedback = async (match: KnowledgeMatch, helpful: boolean) => {
    try {
      await submitKnowledgeFeedback(match, helpful);
      toast.success(helpful ? '已提升该知识命中权重' : '已降低该知识命中权重');
      if (knowledgeSearchQuery.trim()) {
        const data = await searchKnowledge(knowledgeSearchQuery.trim(), payload?.logs || []);
        setKnowledgeMatches(data.matches);
      }
    } catch (error) {
      toast.error(`反馈失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const data = await requestJson<{ ok: boolean; settings: AISettings }>('/api/ai/settings', {
        method: 'POST',
        body: JSON.stringify(aiSettings),
      });
      setAISettings({
        ...aiSettings,
        apiKey: '',
        apiKeyMasked: data.settings.apiKeyMasked,
        apiKeyConfigured: data.settings.apiKeyConfigured,
        updatedAt: data.settings.updatedAt,
      });
      setSettingsOpen(false);
      toast.success('AI 模型设置已保存');
      if (payload) {
        setPayload({
          ...payload,
          summary: {
            ...payload.summary,
            engineStatus: '已配置',
            engineModel: aiSettings.modelId,
          },
        });
      }
    } catch (error) {
      toast.error(`保存失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleTestSettings = async () => {
    setSettingsTesting(true);
    try {
      const data = await requestJson<{ ok: boolean; message: string; availableModels?: string[] }>('/api/ai/settings/test', {
        method: 'POST',
        body: JSON.stringify(aiSettings),
      });
      toast.success(data.message);
    } catch (error) {
      toast.error(`测试失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setSettingsTesting(false);
    }
  };

  const handleSaveAgentConfig = async () => {
    if (!agentConfig?.systemPrompt.trim()) {
      toast.error('系统提示词不能为空');
      return;
    }
    setAgentSaving(true);
    try {
      const data = await saveAgentConfig({
        agentName: agentConfig.agentName,
        model: agentConfig.model || aiSettings.modelId,
        systemPrompt: agentConfig.systemPrompt,
      });
      setAgentConfig(data.config);
      toast.success(data.message || '智能体设置已保存');
    } catch (error) {
      toast.error(`智能体设置保存失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setAgentSaving(false);
    }
  };

  const handleResetAgentConfig = async () => {
    if (!window.confirm('确定恢复默认系统提示词吗？当前编辑内容会被覆盖。')) return;
    setAgentSaving(true);
    try {
      const data = await resetAgentConfig();
      setAgentConfig(data.config);
      toast.success(data.message || '已恢复默认系统提示词');
    } catch (error) {
      toast.error(`恢复默认失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setAgentSaving(false);
    }
  };

  const handleCreateSession = async () => {
    setSessionCreating(true);
    try {
      const data = await createSession('新会话');
      const session = data.session;
      const nextSessions = await refreshSessions();
      setSessions(nextSessions.length ? nextSessions : [compactSessionForFrontend(session)]);
      await loadSession(session.sessionId, payload, aiSettings);
      toast.success('已创建新会话');
    } catch (error) {
      toast.error(`创建会话失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setSessionCreating(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    try {
      await loadSession(sessionId, payload, aiSettings);
    } catch (error) {
      toast.error(`切换会话失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const handleRenameSession = async (session: AgentSessionSummary) => {
    const title = window.prompt('请输入新的会话标题', session.title || '新会话');
    if (!title || !title.trim()) return;
    try {
      const data = await updateSessionTitle(session.sessionId, title.trim());
      await refreshSessions();
      if (session.sessionId === activeSessionId) {
        setActiveSession(data.session);
        setMessages(chatMessagesFromSession(data.session, payload, aiSettings));
      }
      toast.success('会话标题已更新');
    } catch (error) {
      toast.error(`重命名失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const handleDeleteSession = async (session: AgentSessionSummary) => {
    if (!window.confirm(`确定删除会话“${session.title || '新会话'}”吗？此操作会删除后端会话 JSON。`)) return;
    try {
      await deleteSession(session.sessionId);
      let nextSessions = await refreshSessions();
      if (!nextSessions.length) {
        const created = await createSession('新会话');
        nextSessions = [compactSessionForFrontend(created.session)];
        setSessions(nextSessions);
      }
      const nextActive = session.sessionId === activeSessionId ? nextSessions[0]?.sessionId : activeSessionId;
      if (nextActive) {
        await loadSession(nextActive, payload, aiSettings);
      }
      toast.success('会话已删除');
    } catch (error) {
      toast.error(`删除失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const handleSend = async (text?: string) => {
    const content = text || inputValue.trim();
    if (!content || !payload || isTyping) return;
    if (!(aiSettings.apiKeyConfigured || aiSettings.apiKey)) {
      toast.error('AI 模型未配置 API Key，请先在设置中保存模型配置');
      setSettingsOpen(true);
      return;
    }
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = await createSession('新会话');
      sessionId = created.session.sessionId;
      setActiveSession(created.session);
      setActiveSessionId(sessionId);
      localStorage.setItem('lustre-log-analyzer-session-id', sessionId);
      await refreshSessions();
    }
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    try {
      const data = await requestSessionChat(sessionId, content);
      setActiveSession(data.session);
      setActiveSessionId(data.session.sessionId);
      setMessages(chatMessagesFromSession(data.session, payload, aiSettings));
      await refreshSessions();
    } catch (error) {
      const fallback = buildAIReply(content, payload);
      const message = error instanceof Error ? error.message : 'unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-error-${Date.now()}`,
          role: 'ai',
          content: `模型调用失败：${message}\n\n以下是本地规则摘要，仅供临时参考：\n\n${fallback}`,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          meta: '未使用大模型，已降级为本地摘要',
        },
      ]);
      toast.error(`模型调用失败：${message}`);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const focusInputWithText = (text: string) => {
    setInputValue(text);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(text.length, text.length);
    }, 0);
  };

  const handleInsertCollectionSummary = () => {
    if (!payload) {
      toast('请先执行一次日志收集');
      return;
    }
    focusInputWithText(
      `请优先基于 WARN/ERROR/FATAL 异常日志分析问题。当前覆盖 ${payload.summary.coveredNodes}/${payload.summary.nodeCount} 个节点对象，` +
      `共 ${payload.summary.totalLogs} 条日志，其中 ${payload.summary.warningCount} 条为告警或错误，普通日志 ${payload.summary.normalCount ?? Math.max(payload.summary.totalLogs - payload.summary.warningCount, 0)} 条。`
    );
  };

  const handleInsertQuickTemplate = () => {
    const sentCount = messages.filter((item) => item.role === 'user').length;
    const template = quickPrompts[sentCount % quickPrompts.length];
    focusInputWithText(template);
  };

  const openKnowledgeCapture = (msg: ChatMessage) => {
    const lastUser = [...messages].reverse().find((item) => item.role === 'user');
    const sourceLogs = (payload?.logs || [])
      .filter(isAttentionLog)
      .slice(-12)
      .map((log) => `[${log.timestamp}] ${log.node} ${log.level}: ${log.message}`)
      .join('\n');
    setKnowledgeDraft({
      title: lastUser?.content ? lastUser.content.slice(0, 80) : 'Lustre 日志诊断经验',
      problem: lastUser?.content || '请补充本次问题现象、影响范围和关键日志。',
      solution: msg.content,
      extraSteps: '',
      tags: 'lustre,日志分析,运维经验',
      sourceQuestion: lastUser?.content || '',
      sourceAnswer: msg.content,
      sourceLogs,
    });
    setKnowledgeOpen(true);
  };

  const submitKnowledge = async () => {
    if (!knowledgeDraft.title.trim() || !knowledgeDraft.problem.trim() || !knowledgeDraft.solution.trim()) {
      toast.error('标题、问题现象和处理建议不能为空');
      return;
    }
    setKnowledgeSaving(true);
    try {
      await requestJson('/api/knowledge/logs', {
        method: 'POST',
        body: JSON.stringify({
          ...knowledgeDraft,
          tags: knowledgeDraft.tags.split(',').map((item) => item.trim()).filter(Boolean),
        }),
      });
      setKnowledgeOpen(false);
      toast.success('已录入本地知识库，后续分析可作为经验召回');
    } catch (error) {
      toast.error(`录入失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const handleHelpfulFeedback = async (msg: ChatMessage) => {
    if (!msg.knowledgeMatches?.length) {
      toast.success('已记录本次回复有帮助；如已解决问题，建议录入知识库沉淀经验');
      return;
    }
    try {
      await Promise.all(msg.knowledgeMatches.map((item) => submitKnowledgeFeedback(item, true)));
      toast.success(`已提升 ${msg.knowledgeMatches.length} 条知识库经验权重`);
    } catch (error) {
      toast.error(`反馈记录失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!payload) return [];
    return payload.logs.filter((log) => {
      if (logView === 'attention' && !isAttentionLog(log)) return false;
      if (logFilter.node !== 'all' && log.node !== logFilter.node) return false;
      if (logFilter.level !== 'all' && log.level !== logFilter.level) return false;
      if (logFilter.keyword) {
        const q = logFilter.keyword.toLowerCase();
        if (!log.message.toLowerCase().includes(q) && !log.node.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [payload, logFilter, logView]);

  const uniqueNodes = useMemo(() => Array.from(new Set((payload?.logs || []).map((log) => log.node))), [payload]);
  const attentionLogs = useMemo(() => (payload?.logs || []).filter(isAttentionLog), [payload]);

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-slate-50 dark:bg-[#0A0F1A]">
      <AISettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={aiSettings}
        setSettings={setAISettings}
        agentConfig={agentConfig}
        setAgentConfig={setAgentConfig}
        onSave={handleSaveSettings}
        onTest={handleTestSettings}
        onSaveAgent={handleSaveAgentConfig}
        onResetAgent={handleResetAgentConfig}
        saving={settingsSaving}
        testing={settingsTesting}
        agentSaving={agentSaving}
      />
      <LogDetailDialog
        log={selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      />
      <KnowledgeCaptureDialog
        open={knowledgeOpen}
        draft={knowledgeDraft}
        saving={knowledgeSaving}
        onDraftChange={setKnowledgeDraft}
        onOpenChange={setKnowledgeOpen}
        onSubmit={submitKnowledge}
      />
      <KnowledgeBaseDialog
        open={knowledgeManagerOpen}
        cases={knowledgeCases}
        documents={knowledgeDocuments}
        stats={knowledgeStats}
        selectedCase={selectedKnowledgeCase}
        selectedDocument={selectedKnowledgeDocument}
        versions={knowledgeVersions}
        chunks={knowledgeChunks}
        matches={knowledgeMatches}
        loading={knowledgeLoading}
        uploading={knowledgeUploading}
        reindexing={knowledgeReindexing}
        error={knowledgeError}
        searchQuery={knowledgeSearchQuery}
        uploadTitle={knowledgeUploadTitle}
        uploadTags={knowledgeUploadTags}
        onOpenChange={setKnowledgeManagerOpen}
        onRefresh={() => {
          void (async () => {
            try {
              const data = await loadKnowledgeOverview();
              const currentCase = data.cases.find((item) => item.id === selectedKnowledgeCase?.id);
              const currentDocument = data.documents.find((item) => item.id === selectedKnowledgeDocument?.id);
              if (currentCase) {
                handleSelectKnowledgeCase(currentCase);
              } else if (currentDocument) {
                await handleSelectKnowledgeDocument(currentDocument.id);
              } else if (data.cases[0]) {
                handleSelectKnowledgeCase(data.cases[0]);
              } else if (data.documents[0]) {
                await handleSelectKnowledgeDocument(data.documents[0].id);
              }
              toast.success('知识库已刷新');
            } catch (error) {
              toast.error(`知识库刷新失败: ${error instanceof Error ? error.message : 'unknown error'}`);
            }
          })();
        }}
        onSelectCase={handleSelectKnowledgeCase}
        onSelectDocument={handleSelectKnowledgeDocument}
        onUpload={handleUploadKnowledgeDocument}
        onReindex={handleRebuildKnowledgeIndex}
        onDeleteDocument={handleDeleteKnowledgeDocument}
        onSearchQueryChange={setKnowledgeSearchQuery}
        onSearch={handleSearchKnowledge}
        onFeedback={handleKnowledgeMatchFeedback}
        setUploadTitle={setKnowledgeUploadTitle}
        setUploadTags={setKnowledgeUploadTags}
      />
      <LogExplorerDialog
        open={logExplorerOpen}
        onOpenChange={setLogExplorerOpen}
        payload={payload}
        loading={loading}
        logView={logView}
        setLogView={setLogView}
        logFilter={logFilter}
        setLogFilter={setLogFilter}
        filteredLogs={filteredLogs}
        uniqueNodes={uniqueNodes}
        attentionLogs={attentionLogs}
        onSelectLog={setSelectedLog}
      />

      <div className="shrink-0 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
              <span>日志分析</span>
              <span>/</span>
              <span className="text-[#0EA5E9]">AI 智能分析</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-[#F1F5F9] sm:text-3xl">AI 日志分析</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">自动收集当前环境的 Lustre 日志，并通过后端安全代理调用已配置的大模型分析</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-70 sm:px-4 sm:text-sm"
            >
              {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
              立即收集
            </button>
            <button
              onClick={() => setLogExplorerOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#1E293B] bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:bg-[#111827] dark:text-[#94A3B8] dark:hover:bg-[#1A2234] dark:hover:text-[#F1F5F9] sm:px-4 sm:text-sm"
            >
              <ListFilter className="h-4 w-4" />
              日志详情
            </button>
            <button
              onClick={() => setKnowledgeManagerOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#1E293B] bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:bg-[#111827] dark:text-[#94A3B8] dark:hover:bg-[#1A2234] dark:hover:text-[#F1F5F9] sm:px-4 sm:text-sm"
            >
              <Database className="h-4 w-4" />
              知识库
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#1E293B] bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:bg-[#111827] dark:text-[#94A3B8] dark:hover:bg-[#1A2234] dark:hover:text-[#F1F5F9] sm:px-4 sm:text-sm"
            >
              <Settings className="h-4 w-4" />
              设置
            </button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mx-4 mb-4 grid shrink-0 grid-cols-1 gap-4 rounded-xl bg-white p-4 dark:bg-[#111827] sm:mx-6 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            icon: CloudCheck,
            label: '日志收集',
            status: collecting ? '采集中' : payload ? '就绪' : '未初始化',
            detail: payload ? `上次: ${new Date(payload.summary.collectedAt).toLocaleString('zh-CN')} · 覆盖 ${payload.summary.coveredNodes}/${payload.summary.nodeCount}` : '尚未采集',
            color: 'text-[#10B981]',
          },
          {
            icon: null,
            label: '已收集日志',
            value: payload?.summary.totalSizeLabel || '--',
            detail: payload ? `共 ${payload.summary.totalLogs} 条 · 普通 ${payload.summary.normalCount ?? Math.max(payload.summary.totalLogs - payload.summary.warningCount, 0)} 条` : '无数据',
          },
          {
            icon: Brain,
            label: 'AI 引擎',
            status: payload?.summary.engineStatus || '未配置',
            detail: payload ? `模型: ${payload.summary.engineModel}` : '未读取设置',
            color: payload?.summary.engineStatus === '已配置' ? 'text-[#10B981]' : 'text-[#F59E0B]',
          },
          {
            icon: AlertTriangle,
            label: '待确认异常',
            value: String(payload?.summary.warningCount || 0),
            detail: payload ? `${payload.summary.warningCount} 条 WARN/ERROR/FATAL` : '无数据',
            valueColor: 'text-[#F59E0B]',
          },
        ].map((item, index) => (
          <div key={index} className="flex items-start gap-3">
            {item.icon && <item.icon className="mt-0.5 h-5 w-5 text-slate-500 dark:text-[#64748B]" />}
            <div>
              <div className="text-xs text-slate-500 dark:text-[#64748B]">{item.label}</div>
              {'value' in item && item.value ? (
                <div className={cn('text-lg font-medium tabular-nums', item.valueColor || 'text-slate-900 dark:text-[#F1F5F9]')}>{item.value}</div>
              ) : (
                <div className={cn('text-sm font-medium', item.color || 'text-slate-900 dark:text-[#F1F5F9]')}>{item.status}</div>
              )}
              <div className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B]">{item.detail}</div>
            </div>
          </div>
        ))}
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto px-4 pb-4 sm:px-6 xl:grid-cols-[clamp(280px,22vw,340px)_minmax(0,1fr)] xl:overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={sessionLoading || loading}
          creating={sessionCreating}
          onCreate={handleCreateSession}
          onSelect={handleSelectSession}
          onRename={handleRenameSession}
          onDelete={handleDeleteSession}
        />

        <div className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] xl:min-h-0">
          <div className="shrink-0 border-b border-[#1E293B] bg-white px-4 py-3 dark:bg-[#111827]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">智能诊断对话</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#64748B]">
                  默认把 WARN / ERROR / FATAL 作为主要诊断对象，普通日志只作为上下文；有效结论可人工确认后沉淀到本地知识库。
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0EA5E9]/10 px-2 py-1 text-[11px] text-[#0EA5E9]">
                  <BookOpen className="h-3 w-3" />
                  Markdown 手册
                </span>
                <button
                  type="button"
                  onClick={() => setKnowledgeManagerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-1 text-[11px] text-[#10B981] transition-colors hover:bg-[#10B981]/20"
                >
                  <Database className="h-3 w-3" />
                  本地经验库
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                msg={msg}
                onSaveKnowledge={openKnowledgeCapture}
                onFeedback={handleHelpfulFeedback}
              />
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="mt-1 shrink-0">
                  <div className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-[#0EA5E9]/30">
                    <img src={assetPath('/ai-assistant-avatar.svg')} alt="AI" className="h-full w-full" />
                  </div>
                </div>
                <div className="rounded-xl border border-[#1E293B] bg-white px-4 py-3 dark:bg-[#1A2234]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0EA5E9]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && !isTyping && (
            <div className="shrink-0 px-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void handleSend(prompt)}
                    className="rounded-full border border-[#1E293B] bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-[#0EA5E9]/50 hover:text-[#0EA5E9] dark:bg-[#1A2234] dark:text-[#94A3B8]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-[#1E293B] bg-white p-3 dark:bg-[#111827]">
            <div className="flex items-end gap-2">
              <button
                type="button"
                aria-label="插入当前采集摘要"
                onClick={handleInsertCollectionSummary}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-600 dark:text-[#64748B] dark:hover:bg-[#1A2234] dark:hover:text-[#94A3B8]"
                title="插入当前采集摘要"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="输入问题，例如：分析最近一小时的异常"
                  className="max-h-[120px] min-h-[40px] w-full resize-none rounded-xl border border-[#1E293B] bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-[#0EA5E9] dark:bg-[#0D1320] dark:text-[#F1F5F9]"
                />
              </div>
              <button
                type="button"
                aria-label="插入快捷分析模板"
                onClick={handleInsertQuickTemplate}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-600 dark:text-[#64748B] dark:hover:bg-[#1A2234] dark:hover:text-[#94A3B8]"
                title="插入快捷分析模板"
              >
                <Zap className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="发送日志分析问题"
                onClick={() => void handleSend()}
                disabled={!inputValue.trim() || isTyping}
                className={cn('rounded-lg p-2 transition-all', inputValue.trim() && !isTyping ? 'bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] text-white hover:opacity-90' : 'bg-white text-slate-500 dark:bg-[#1A2234] dark:text-[#64748B]')}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between px-1">
              <span className="text-[10px] text-slate-500 dark:text-[#64748B]">Enter 发送，Shift+Enter 换行</span>
              <span className="text-[10px] text-slate-500 dark:text-[#64748B]">{inputValue.length}/2000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
