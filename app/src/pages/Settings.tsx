import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Settings as SettingsIcon,
  Users,
  Plug,
  Database,
  Bell,
  Sliders,
  Save,
  RotateCcw,
  ChevronRight,
  Plus,
  Search,
  Send,
  Key,
  Copy,
  Check,
  X,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  AlertTriangle,
  Download,
  Upload,
  ShieldAlert,
  TestTube,
  RefreshCw,
} from 'lucide-react';
import {
  users,
  emailConfig,
  feishuConfig,
  apiConfig,
  webhookConfig,
  dataRetention,
  displayPreferences,
  advancedSettings,
  type User,
  type EmailConfig,
  type FeishuConfig,
  type DisplayPreferences,
} from '@/data/mockSettings';
import { listUsers, createUser, updateUser, deleteUser } from '@/lib/users';
import type { CurrentUser } from '@/lib/auth';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SidebarItem {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  badge?: number;
}

const sidebarItems: SidebarItem[] = [
  { id: 'general', label: '通用设置', icon: SettingsIcon, description: '界面、语言、主题' },
  { id: 'users', label: '用户管理', icon: Users, description: '账户、权限、团队', badge: users.length },
  { id: 'integrations', label: '集成配置', icon: Plug, description: '邮件、飞书、API' },
  { id: 'data', label: '数据采集', icon: Database, description: '日志、指标、保留策略' },
  { id: 'alerts', label: '告警设置', icon: Bell, description: '全局告警规则、通知' },
  { id: 'advanced', label: '高级选项', icon: Sliders, description: '性能、调试、系统' },
];

/* ------------------------------------------------------------------ */
/*  Page Header                                                        */
/* ------------------------------------------------------------------ */
function PageHeader({ unsavedCount, onSave, onReset }: {
  unsavedCount: number;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-[#64748B]">
        <span>系统</span>
        <ChevronRight className="h-4 w-4" />
        <span className="text-slate-900 dark:text-[#F1F5F9]">设置</span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-[#F1F5F9] tracking-tight">系统设置</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#64748B]">
            用户管理 · 集成配置 · 数据策略 · 显示偏好
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-white dark:bg-[#111827] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-all hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
          >
            <RotateCcw className="h-4 w-4" />
            重置
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
            保存全部
            {unsavedCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                {unsavedCount} 项
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toggle Switch                                                      */
/* ------------------------------------------------------------------ */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label || (checked ? '关闭开关' : '开启开关')}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors duration-200',
        checked ? 'bg-[#0EA5E9]' : 'bg-white dark:bg-[#1E293B]',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <motion.div
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Segmented Control                                                  */
/* ------------------------------------------------------------------ */
function SegmentedControl({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] p-1">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === opt.value ? 'bg-[#0EA5E9]/20 text-[#0EA5E9]' : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:text-[#F1F5F9]'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Card                                                      */
/* ------------------------------------------------------------------ */
function SettingsCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-6', className)}>
      {title && <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-[#F1F5F9]">{title}</h3>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form Row                                                           */
/* ------------------------------------------------------------------ */
function FormRow({ label, children, helpText }: { label: string; children: React.ReactNode; helpText?: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-[#1E293B] last:border-0">
      <div className="flex-1 pr-4">
        <label className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{label}</label>
        {helpText && <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B]">{helpText}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  General Settings Panel                                           */
/* ------------------------------------------------------------------ */
function GeneralSettingsPanel({ prefs, onChange }: {
  prefs: DisplayPreferences;
  onChange: (k: string, v: unknown) => void;
}) {
  const accentColors = [
    { color: '#0EA5E9', name: 'cyan' },
    { color: '#8B5CF6', name: 'purple' },
    { color: '#10B981', name: 'green' },
    { color: '#3B82F6', name: 'blue' },
    { color: '#F59E0B', name: 'orange' },
  ];

  return (
    <div className="space-y-6">
      <SettingsCard title="主题设置">
        <FormRow label="主题模式" helpText="选择应用的主题外观">
          <SegmentedControl
            options={[
              { value: 'dark', label: '深色' },
              { value: 'light', label: '浅色' },
              { value: 'system', label: '跟随系统' },
            ]}
            value={prefs.theme}
            onChange={v => onChange('theme', v)}
          />
        </FormRow>
        <FormRow label="强调色" helpText="选择应用的主色调">
          <div className="flex items-center gap-2">
            {accentColors.map(ac => (
              <button
                key={ac.name}
                onClick={() => onChange('accentColor', ac.color)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                  prefs.accentColor === ac.color ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: ac.color }}
              >
                {prefs.accentColor === ac.color && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label="密度" helpText="调整界面元素的间距">
          <SegmentedControl
            options={[
              { value: 'compact', label: '紧凑' },
              { value: 'comfortable', label: '舒适' },
            ]}
            value={prefs.density}
            onChange={v => onChange('density', v)}
          />
        </FormRow>
        <FormRow label="动画效果" helpText="控制界面动画的显示">
          <SegmentedControl
            options={[
              { value: 'enabled', label: '启用' },
              { value: 'reduced', label: '减少动画' },
              { value: 'disabled', label: '关闭' },
            ]}
            value={prefs.animations}
            onChange={v => onChange('animations', v)}
          />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="语言与区域">
        <FormRow label="界面语言">
          <select
            value={prefs.language}
            onChange={e => onChange('language', e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </FormRow>
        <FormRow label="日期格式">
          <SegmentedControl
            options={[
              { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
              { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
              { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
            ]}
            value={prefs.dateFormat}
            onChange={v => onChange('dateFormat', v)}
          />
        </FormRow>
        <FormRow label="时间格式">
          <SegmentedControl
            options={[
              { value: '24h', label: '24小时制' },
              { value: '12h', label: '12小时制' },
            ]}
            value={prefs.timeFormat}
            onChange={v => onChange('timeFormat', v)}
          />
        </FormRow>
        <FormRow label="时区">
          <select
            value={prefs.timezone}
            onChange={e => onChange('timezone', e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </FormRow>
      </SettingsCard>

      <SettingsCard title="显示设置">
        <FormRow label="默认首页">
          <select
            value={prefs.defaultPage}
            onChange={e => onChange('defaultPage', e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value="dashboard">仪表盘</option>
            <option value="performance">性能监控</option>
            <option value="alerts">告警中心</option>
          </select>
        </FormRow>
        <FormRow label="自动刷新间隔">
          <select
            value={prefs.autoRefresh}
            onChange={e => onChange('autoRefresh', e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value="5秒">5秒</option>
            <option value="15秒">15秒</option>
            <option value="30秒">30秒</option>
            <option value="1分钟">1分钟</option>
            <option value="手动">手动</option>
          </select>
        </FormRow>
        <FormRow label="表格页大小">
          <select
            value={prefs.tablePageSize}
            onChange={e => onChange('tablePageSize', Number(e.target.value))}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </FormRow>
        <FormRow label="图表时间范围默认">
          <select
            value={prefs.chartTimeRange}
            onChange={e => onChange('chartTimeRange', e.target.value)}
            className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          >
            <option value="5分钟">5分钟</option>
            <option value="15分钟">15分钟</option>
            <option value="1小时">1小时</option>
          </select>
        </FormRow>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  User Management Panel                                              */
/* ------------------------------------------------------------------ */
function UserManagementPanel() {
  const [userList, setUserList] = useState<User[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'readonly' as User['role'],
    password: '',
    status: 'active' as User['status'],
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listUsers();
      setUserList(list.map(u => ({
        id: String(u.id),
        name: u.username,
        email: u.email,
        role: u.role,
        permissions: [],
        lastLogin: u.lastLogin || '未登录',
        status: u.status,
      })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const roleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-[#EF4444]/10 text-[#EF4444]';
      case 'engineer': return 'bg-[#0EA5E9]/10 text-[#0EA5E9]';
      case 'readonly': return 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]';
      default: return 'bg-[#64748B]/10 text-slate-500 dark:text-[#64748B]';
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'admin': return '管理员';
      case 'engineer': return '运维工程师';
      case 'readonly': return '只读';
      default: return role;
    }
  };

  const handleAdd = async () => {
    const name = newUser.name.trim();
    const email = newUser.email.trim();
    if (!name) {
      setFormError('请输入用户名');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('请输入有效的邮箱地址');
      return;
    }
    if (!newUser.password || newUser.password.length < 6) {
      setFormError('密码至少 6 位');
      return;
    }
    try {
      await createUser({
        username: name,
        email,
        password: newUser.password,
        role: newUser.role,
        status: newUser.status,
      });
      setShowAddModal(false);
      setFormError('');
      setNewUser({ name: '', email: '', role: 'readonly', password: '', status: 'active' });
      toast.success(`用户 ${name} 已添加`);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(Number(id));
      toast.success('用户已删除');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleToggleStatus = async (id: string) => {
    const target = userList.find(u => u.id === id);
    if (!target) return;
    const nextStatus = target.status === 'active' ? 'inactive' : 'active';
    try {
      await updateUser(Number(id), { status: nextStatus });
      toast.success(`用户状态已更新为 ${nextStatus === 'active' ? '启用' : '停用'}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleResetPassword = async (id: string, name: string) => {
    const pw = window.prompt(`为「${name}」设置新密码（至少 6 位）`);
    if (!pw) return;
    if (pw.length < 6) { toast.error('密码至少 6 位'); return; }
    try {
      await updateUser(Number(id), { password: pw });
      toast.success('密码已重置');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置失败');
    }
  };

  const handleEdit = async (id: string) => {
    const target = userList.find(u => u.id === id);
    if (!target) return;
    const email = window.prompt('修改邮箱', target.email);
    if (email === null) return;
    try {
      await updateUser(Number(id), { email: email.trim() });
      toast.success('用户信息已更新');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const filteredUsers = userList.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <SettingsCard>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2">
              <Search className="h-4 w-4 text-slate-500 dark:text-[#64748B]" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索用户..."
                className="w-[200px] bg-transparent text-sm text-slate-900 dark:text-[#F1F5F9] outline-none placeholder:text-slate-500 dark:text-[#64748B]"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-[#0EA5E9]/20"
          >
            <Plus className="h-4 w-4" /> 添加用户
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#1E293B]">
          <table className="w-full">
            <thead>
              <tr className="bg-white dark:bg-[#1A2234]">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">用户名</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">邮箱</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">角色</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">最后登录</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#94A3B8]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-[#1E293B]">
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-[#64748B]">加载中…</td>
                </tr>
              )}
              {!loading && filteredUsers.length === 0 && (
                <tr className="border-t border-[#1E293B]">
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-[#64748B]">暂无用户</td>
                </tr>
              )}
              {filteredUsers.map((user, idx) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.04 }}
                  className="border-t border-[#1E293B] transition-colors hover:bg-white dark:bg-[#1A2234]/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#6366F1] text-xs font-bold text-white">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-[#94A3B8]">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', roleBadge(user.role))}>
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-[#64748B]">{user.lastLogin}</td>
                  <td className="px-4 py-3">
                    <ToggleSwitch
                      checked={user.status === 'active'}
                      label={`${user.name} 用户状态`}
                      onChange={() => handleToggleStatus(user.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`编辑用户 ${user.name}`}
                        title="编辑用户"
                        onClick={() => handleEdit(user.id)}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`重置 ${user.name} 的密码`}
                        title="重置密码"
                        onClick={() => handleResetPassword(user.id, user.name)}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                      >
                        <Key className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`删除用户 ${user.name}`}
                        title="删除用户"
                        onClick={() => handleDelete(user.id)}
                        className="rounded p-1 text-slate-500 dark:text-[#64748B] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-6 shadow-2xl"
            >
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">添加用户</h3>
              {formError && (
                <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#EF4444]">
                  {formError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-[#94A3B8]">用户名</label>
                  <input
                    value={newUser.name}
                    onChange={e => {
                      setFormError('');
                      setNewUser(p => ({ ...p, name: e.target.value }));
                    }}
                    className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
                    placeholder="输入用户名"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-[#94A3B8]">邮箱</label>
                  <input
                    value={newUser.email}
                    onChange={e => {
                      setFormError('');
                      setNewUser(p => ({ ...p, email: e.target.value }));
                    }}
                    className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-[#94A3B8]">角色</label>
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser(p => ({ ...p, role: e.target.value as User['role'] }))}
                    className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
                  >
                    <option value="admin">管理员</option>
                    <option value="engineer">运维工程师</option>
                    <option value="readonly">只读</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600 dark:text-[#94A3B8]">密码</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                    className="w-full rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
                    placeholder="留空则自动生成"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ToggleSwitch
                    checked={newUser.status === 'active'}
                    label="新用户激活状态"
                    onChange={v => setNewUser(p => ({ ...p, status: v ? 'active' : 'inactive' }))}
                  />
                  <span className="text-sm text-slate-600 dark:text-[#94A3B8]">激活账户</span>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormError('');
                  }}
                  className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="rounded-lg bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] px-4 py-2 text-sm font-medium text-white"
                >
                  添加
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Integration Settings Panel                                         */
/* ------------------------------------------------------------------ */
function IntegrationSettingsPanel() {
  const [email, setEmail] = useState<EmailConfig>(emailConfig);
  const [feishu, setFeishu] = useState<FeishuConfig>(feishuConfig);
  const [testResult, setTestResult] = useState<{ type: 'email' | 'feishu'; status: 'idle' | 'loading' | 'success' | 'error' } | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const runTest = (type: 'email' | 'feishu') => {
    setTestResult({ type, status: 'loading' });
    setTimeout(() => {
      setTestResult({ type, status: type === 'email' ? 'success' : 'success' });
      setTimeout(() => setTestResult(null), 3000);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Email */}
      <SettingsCard title="邮件集成">
        <FormRow label="启用邮件通知">
          <ToggleSwitch checked={email.enabled} onChange={v => setEmail(p => ({ ...p, enabled: v }))} />
        </FormRow>
        {email.enabled && (
          <>
            <FormRow label="SMTP 服务器">
              <input
                value={email.smtpServer}
                onChange={e => setEmail(p => ({ ...p, smtpServer: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="端口">
              <input
                type="number"
                value={email.port}
                onChange={e => setEmail(p => ({ ...p, port: Number(e.target.value) }))}
                className="w-32 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="发件人地址">
              <input
                value={email.sender}
                onChange={e => setEmail(p => ({ ...p, sender: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="用户名">
              <input
                value={email.username}
                onChange={e => setEmail(p => ({ ...p, username: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="密码">
              <input
                type="password"
                value={email.password}
                onChange={e => setEmail(p => ({ ...p, password: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="TLS 加密">
              <ToggleSwitch checked={email.tls} onChange={v => setEmail(p => ({ ...p, tls: v }))} />
            </FormRow>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => runTest('email')}
                disabled={testResult?.type === 'email' && testResult.status === 'loading'}
                className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
              >
                {testResult?.type === 'email' && testResult.status === 'loading' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
                测试连接
              </button>
              {testResult?.type === 'email' && testResult.status === 'success' && (
                <span className="flex items-center gap-1 text-sm text-[#10B981]">
                  <Check className="h-4 w-4" /> 连接成功
                </span>
              )}
              {testResult?.type === 'email' && testResult.status === 'error' && (
                <span className="flex items-center gap-1 text-sm text-[#EF4444]">
                  <X className="h-4 w-4" /> 连接失败
                </span>
              )}
            </div>
          </>
        )}
      </SettingsCard>

      {/* Feishu */}
      <SettingsCard title="飞书集成">
        <FormRow label="启用飞书通知">
          <ToggleSwitch checked={feishu.enabled} onChange={v => setFeishu(p => ({ ...p, enabled: v }))} />
        </FormRow>
        {feishu.enabled && (
          <>
            <FormRow label="Webhook URL">
              <input
                value={feishu.webhookUrl}
                onChange={e => setFeishu(p => ({ ...p, webhookUrl: e.target.value }))}
                className="w-full max-w-md rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="密钥">
              <input
                type="password"
                value={feishu.secret}
                onChange={e => setFeishu(p => ({ ...p, secret: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <FormRow label="@用户列表">
              <input
                value={feishu.atUsers}
                onChange={e => setFeishu(p => ({ ...p, atUsers: e.target.value }))}
                className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
                placeholder="user1,user2"
              />
            </FormRow>
            <FormRow label="消息模板">
              <textarea
                value={feishu.messageTemplate}
                onChange={e => setFeishu(p => ({ ...p, messageTemplate: e.target.value }))}
                rows={4}
                className="w-full max-w-md rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
              />
            </FormRow>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => runTest('feishu')}
                disabled={testResult?.type === 'feishu' && testResult.status === 'loading'}
                className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
              >
                {testResult?.type === 'feishu' && testResult.status === 'loading' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                发送测试消息
              </button>
              {testResult?.type === 'feishu' && testResult.status === 'success' && (
                <span className="flex items-center gap-1 text-sm text-[#10B981]">
                  <Check className="h-4 w-4" /> 测试消息已发送
                </span>
              )}
            </div>
          </>
        )}
      </SettingsCard>

      {/* API Access */}
      <SettingsCard title="API 访问">
        <FormRow label="API 密钥">
          <div className="flex items-center gap-2">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiConfig.apiKey}
              readOnly
              className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9]"
            />
            <button
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              className="rounded p-1.5 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
            >
              {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(apiConfig.apiKey)}
              className="rounded p-1.5 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </FormRow>
        <FormRow label="速率限制">
          <span className="text-sm text-slate-600 dark:text-[#94A3B8]">{apiConfig.rateLimit}</span>
        </FormRow>
        <FormRow label="IP 白名单">
          <textarea
            defaultValue={apiConfig.ipWhitelist}
            rows={3}
            className="w-64 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          />
        </FormRow>

        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">访问日志</h4>
          <div className="overflow-hidden rounded-lg border border-[#1E293B]">
            <table className="w-full">
              <thead>
                <tr className="bg-white dark:bg-[#1A2234]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-[#94A3B8]">时间</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-[#94A3B8]">端点</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-[#94A3B8]">方法</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-[#94A3B8]">IP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-[#94A3B8]">状态</th>
                </tr>
              </thead>
              <tbody>
                {apiConfig.accessLog.map(log => (
                  <tr key={log.id} className="border-t border-[#1E293B]">
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-[#64748B]">{log.timestamp}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-[#F1F5F9]">{log.endpoint}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-[#94A3B8]">{log.method}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-[#94A3B8]">{log.ip}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-xs', log.status < 300 ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]')}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsCard>

      {/* Webhook Endpoints */}
      <SettingsCard title="Webhook 端点">
        <FormRow label="入站 Webhook URL">
          <div className="flex items-center gap-2">
            <input
              value={webhookConfig.inboundUrl}
              readOnly
              className="w-80 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-600 dark:text-[#94A3B8]"
            />
            <button
              onClick={() => navigator.clipboard.writeText(webhookConfig.inboundUrl)}
              className="rounded p-1.5 text-slate-500 dark:text-[#64748B] hover:bg-white dark:bg-[#1A2234] hover:text-slate-900 dark:text-[#F1F5F9]"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </FormRow>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">支持的事件</label>
          <div className="space-y-2">
            {Object.entries(webhookConfig.events).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-[#94A3B8]">
                  {key === 'alertTriggered' && '告警触发'}
                  {key === 'alertAcknowledged' && '告警确认'}
                  {key === 'alertResolved' && '告警解决'}
                  {key === 'checkCompleted' && '检查完成'}
                  {key === 'nodeStatusChanged' && '节点状态变化'}
                </span>
                <ToggleSwitch checked={value} onChange={() => {}} />
              </div>
            ))}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data Collection Panel                                              */
/* ------------------------------------------------------------------ */
function DataCollectionPanel() {
  const [retention, setRetention] = useState(dataRetention);

  return (
    <div className="space-y-6">
      <SettingsCard title="指标采集">
        <FormRow label="性能指标保留">
          <SegmentedControl
            options={[
              { value: '7天', label: '7天' },
              { value: '30天', label: '30天' },
              { value: '90天', label: '90天' },
              { value: '180天', label: '180天' },
              { value: '1年', label: '1年' },
            ]}
            value={retention.metricsDays + '天'}
            onChange={v => setRetention(p => ({ ...p, metricsDays: Number(v.replace('天', '').replace('年', '365').replace('180天', '180').replace('90天', '90').replace('30天', '30')) }))}
          />
        </FormRow>
        <FormRow label="采样间隔">
          <SegmentedControl
            options={[
              { value: '1秒', label: '1秒' },
              { value: '5秒', label: '5秒' },
              { value: '15秒', label: '15秒' },
              { value: '1分钟', label: '1分钟' },
            ]}
            value={retention.sampleInterval}
            onChange={v => setRetention(p => ({ ...p, sampleInterval: v }))}
          />
        </FormRow>
        <FormRow label="聚合策略" helpText="数据自动降采样策略">
          <span className="text-sm text-slate-600 dark:text-[#94A3B8]">{retention.aggregationPolicy}</span>
        </FormRow>
      </SettingsCard>

      <SettingsCard title="日志采集">
        <FormRow label="日志保留">
          <SegmentedControl
            options={[
              { value: '7天', label: '7天' },
              { value: '30天', label: '30天' },
              { value: '90天', label: '90天' },
            ]}
            value={retention.logDays + '天'}
            onChange={v => setRetention(p => ({ ...p, logDays: Number(v.replace('天', '')) }))}
          />
        </FormRow>
        <FormRow label="日志轮转">
          <ToggleSwitch checked={retention.autoRotate} onChange={v => setRetention(p => ({ ...p, autoRotate: v }))} />
        </FormRow>
        <FormRow label="存储位置">
          <SegmentedControl
            options={[
              { value: 'local', label: '本地' },
              { value: 's3', label: 'S3 兼容对象存储' },
            ]}
            value={retention.storageType}
            onChange={v => setRetention(p => ({ ...p, storageType: v as 'local' | 's3' }))}
          />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="巡检报告">
        <FormRow label="报告保留">
          <SegmentedControl
            options={[
              { value: '30天', label: '30天' },
              { value: '90天', label: '90天' },
              { value: '1年', label: '1年' },
              { value: '永久', label: '永久' },
            ]}
            value={retention.reportDays === 9999 ? '永久' : retention.reportDays + '天'}
            onChange={v => setRetention(p => ({ ...p, reportDays: v === '永久' ? 9999 : Number(v.replace('天', '').replace('年', '365')) }))}
          />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="数据导入/导出">
        <div className="flex items-center gap-3">
          <button onClick={() => toast.success('已开始导出数据（测试环境为模拟导出）')} className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9]">
            <Download className="h-4 w-4" /> 立即导出所有数据
          </button>
          <button onClick={() => toast('导入配置功能待接入')} className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8] transition-colors hover:border-[#0EA5E9] hover:text-[#0EA5E9]">
            <Upload className="h-4 w-4" /> 导入配置
          </button>
        </div>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Alert Settings Panel                                               */
/* ------------------------------------------------------------------ */
function AlertSettingsPanel() {
  return (
    <div className="space-y-6">
      <SettingsCard title="全局告警规则">
        <FormRow label="磁盘利用率阈值" helpText="超过此阈值触发告警">
          <div className="flex items-center gap-2">
            <input
              type="number"
              defaultValue={85}
              className="w-20 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            />
            <span className="text-sm text-slate-600 dark:text-[#94A3B8]">%</span>
          </div>
        </FormRow>
        <FormRow label="写入延迟阈值" helpText="写入延迟超过此值触发告警">
          <div className="flex items-center gap-2">
            <input
              type="number"
              defaultValue={4.0}
              step={0.1}
              className="w-20 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            />
            <span className="text-sm text-slate-600 dark:text-[#94A3B8]">ms</span>
          </div>
        </FormRow>
        <FormRow label="节点离线超时" helpText="节点多久无响应判定为离线">
          <div className="flex items-center gap-2">
            <input
              type="number"
              defaultValue={60}
              className="w-20 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            />
            <span className="text-sm text-slate-600 dark:text-[#94A3B8]">秒</span>
          </div>
        </FormRow>
        <FormRow label="自动确认告警">
          <ToggleSwitch checked={false} onChange={() => {}} />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="通知渠道">
        <FormRow label="邮件通知">
          <ToggleSwitch checked={true} onChange={() => {}} />
        </FormRow>
        <FormRow label="飞书通知">
          <ToggleSwitch checked={true} onChange={() => {}} />
        </FormRow>
        <FormRow label="Webhook 通知">
          <ToggleSwitch checked={false} onChange={() => {}} />
        </FormRow>
        <FormRow label="告警静默时间" helpText="夜间不发送非紧急告警">
          <SegmentedControl
            options={[
              { value: 'none', label: '不静默' },
              { value: '22-06', label: '22:00-06:00' },
              { value: '00-08', label: '00:00-08:00' },
            ]}
            value="22-06"
            onChange={() => {}}
          />
        </FormRow>
      </SettingsCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Advanced Settings Panel                                            */
/* ------------------------------------------------------------------ */
function AdvancedSettingsPanel() {
  const [settings, setSettings] = useState(advancedSettings);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div className="space-y-6">
      <SettingsCard title="性能">
        <FormRow label="最大并发连接">
          <input
            type="number"
            value={settings.maxConnections}
            onChange={e => setSettings(p => ({ ...p, maxConnections: Number(e.target.value) }))}
            className="w-32 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
          />
        </FormRow>
        <FormRow label="查询超时">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.queryTimeout}
              onChange={e => setSettings(p => ({ ...p, queryTimeout: Number(e.target.value) }))}
              className="w-20 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            />
            <span className="text-sm text-slate-600 dark:text-[#94A3B8]">秒</span>
          </div>
        </FormRow>
        <FormRow label="启用缓存">
          <ToggleSwitch checked={settings.cacheEnabled} onChange={v => setSettings(p => ({ ...p, cacheEnabled: v }))} />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="调试">
        <FormRow label="调试模式" helpText="启用后将记录更多日志">
          <ToggleSwitch checked={settings.debugMode} onChange={v => setSettings(p => ({ ...p, debugMode: v }))} />
        </FormRow>
        <FormRow label="日志级别">
          <SegmentedControl
            options={[
              { value: 'ERROR', label: 'ERROR' },
              { value: 'WARN', label: 'WARN' },
              { value: 'INFO', label: 'INFO' },
              { value: 'DEBUG', label: 'DEBUG' },
            ]}
            value={settings.logLevel}
            onChange={v => setSettings(p => ({ ...p, logLevel: v as typeof settings.logLevel }))}
          />
        </FormRow>
        <FormRow label="启用 pprof">
          <ToggleSwitch checked={settings.pprofEnabled} onChange={v => setSettings(p => ({ ...p, pprofEnabled: v }))} />
        </FormRow>
      </SettingsCard>

      <SettingsCard title="系统">
        <FormRow label="自动备份配置">
          <SegmentedControl
            options={[
              { value: 'daily', label: '每天' },
              { value: 'weekly', label: '每周' },
              { value: 'disabled', label: '禁用' },
            ]}
            value={settings.autoBackup}
            onChange={v => setSettings(p => ({ ...p, autoBackup: v as typeof settings.autoBackup }))}
          />
        </FormRow>
        <FormRow label="备份保留">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.backupRetention}
              onChange={e => setSettings(p => ({ ...p, backupRetention: Number(e.target.value) }))}
              className="w-20 rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-3 py-2 text-sm text-slate-900 dark:text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            />
            <span className="text-sm text-slate-600 dark:text-[#94A3B8]">天</span>
          </div>
        </FormRow>
        <FormRow label="自动检查更新">
          <ToggleSwitch checked={settings.autoCheckUpdate} onChange={v => setSettings(p => ({ ...p, autoCheckUpdate: v }))} />
        </FormRow>
        <FormRow label="当前版本">
          <span className="font-mono text-sm text-slate-600 dark:text-[#94A3B8]">{settings.currentVersion}</span>
        </FormRow>
      </SettingsCard>

      {/* Danger Zone */}
      <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#EF4444]" />
          <h3 className="text-base font-semibold text-[#EF4444]">危险操作</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[#EF4444]/20 bg-white dark:bg-[#111827] p-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">重置所有设置</p>
              <p className="text-xs text-slate-500 dark:text-[#64748B]">将所有设置恢复为默认值</p>
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="rounded-lg border border-[#EF4444]/30 px-4 py-2 text-sm text-[#EF4444] transition-colors hover:bg-[#EF4444]/10"
            >
              重置
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#EF4444]/20 bg-white dark:bg-[#111827] p-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">清除所有监控数据</p>
              <p className="text-xs text-slate-500 dark:text-[#64748B]">删除所有历史指标、日志和报告</p>
            </div>
            <button onClick={() => toast('清除监控数据需要后端确认，当前未执行')} className="rounded-lg border border-[#EF4444]/30 px-4 py-2 text-sm text-[#EF4444] transition-colors hover:bg-[#EF4444]/10">
              清除
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#EF4444]/20 bg-white dark:bg-[#111827] p-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-[#F1F5F9]">卸载组件</p>
              <p className="text-xs text-slate-500 dark:text-[#64748B]">移除已安装的监控组件</p>
            </div>
            <button onClick={() => toast('卸载组件功能待接入后端控制')} className="rounded-lg border border-[#EF4444]/30 px-4 py-2 text-sm text-[#EF4444] transition-colors hover:bg-[#EF4444]/10">
              卸载
            </button>
          </div>
        </div>
      </div>

      {/* Reset confirmation modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#EF4444]/30 bg-white dark:bg-[#111827] p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-[#EF4444]" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-[#F1F5F9]">确认重置</h3>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-[#94A3B8]">
                此操作将重置所有设置为默认值，无法撤销。是否继续？
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="rounded-lg border border-[#1E293B] bg-slate-50 dark:bg-[#0D1320] px-4 py-2 text-sm text-slate-600 dark:text-[#94A3B8]"
                >
                  取消
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-medium text-white hover:bg-[#DC2626]"
                >
                  确认重置
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function Settings({ currentUser }: { currentUser?: CurrentUser | null } = {}) {
  const [activeCategory, setActiveCategory] = useState('general');
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, unknown>>({});
  const [displayPrefs, setDisplayPrefs] = useState<DisplayPreferences>(displayPreferences);

  const handlePreferenceChange = useCallback((key: string, value: unknown) => {
    setDisplayPrefs(prev => ({ ...prev, [key]: value }));
    setUnsavedChanges(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = () => {
    setUnsavedChanges({});
    toast.success('设置已保存');
  };

  const handleReset = () => {
    setDisplayPrefs(displayPreferences);
    setUnsavedChanges({});
    toast.success('设置已重置为默认值');
  };

  const unsavedCount = Object.keys(unsavedChanges).length;
  // 仅管理员可见「用户管理」分类
  const visibleSidebarItems = sidebarItems.filter(
    (item) => item.id !== 'users' || currentUser?.role === 'admin',
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-[#0A0F1A]">
      <PageHeader unsavedCount={unsavedCount} onSave={handleSave} onReset={handleReset} />

      <div className="flex gap-6 px-6 pb-6">
        {/* Sidebar */}
        <div className="sticky top-20 h-fit w-60 shrink-0">
          <div className="rounded-xl border border-[#1E293B] bg-white dark:bg-[#111827] p-4">
            <div className="space-y-1">
              {visibleSidebarItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeCategory === item.id;
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.3 }}
                    onClick={() => setActiveCategory(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-all',
                      isActive
                        ? 'border-l-2 border-l-[#0EA5E9] bg-white dark:bg-[#1A2234] text-[#0EA5E9]'
                        : 'text-slate-600 dark:text-[#94A3B8] hover:bg-white dark:bg-[#1A2234]/50 hover:text-slate-900 dark:text-[#F1F5F9]'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="rounded-full bg-[#0EA5E9]/10 px-2 py-0.5 text-xs text-[#0EA5E9]">{item.badge}</span>
                        )}
                        {activeCategory === item.id && unsavedCount > 0 && item.id === 'general' && (
                          <span className="ml-2 h-2 w-2 rounded-full bg-[#F59E0B]" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-[#64748B]">{item.description}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeCategory === 'general' && (
                <GeneralSettingsPanel prefs={displayPrefs} onChange={handlePreferenceChange} />
              )}
              {activeCategory === 'users' && <UserManagementPanel />}
              {activeCategory === 'integrations' && <IntegrationSettingsPanel />}
              {activeCategory === 'data' && <DataCollectionPanel />}
              {activeCategory === 'alerts' && <AlertSettingsPanel />}
              {activeCategory === 'advanced' && <AdvancedSettingsPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
