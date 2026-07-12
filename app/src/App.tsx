import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router'
import {
  LayoutDashboard, Server, Activity, HardDrive, Network,
  Bell, FileText, HeartPulse, FileBarChart, Settings, Menu, X,
  Search, Moon, Sun, User, LogOut, CheckCircle2, AlertTriangle, Info,
  ChevronDown, ShieldCheck
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { ThemeContext, useTheme } from './theme-context'
import toast, { Toaster } from 'react-hot-toast'
import ClusterConfig from './pages/ClusterConfig'
import Performance from './pages/Performance'
import Storage from './pages/Storage'
import NetworkPage from './pages/Network'
import AlertsPage from './pages/Alerts'
import LogAnalysis from './pages/LogAnalysis'
import HealthCheck from './pages/HealthCheck'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import Dashboard from './pages/Dashboard'
import AlertDetail from './pages/AlertDetail'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '总览' },
  { path: '/config', icon: Server, label: '文件系统' },
  { path: '/performance', icon: Activity, label: '指标中心' },
  { path: '/capacity', icon: HardDrive, label: '容量管理' },
  { path: '/network', icon: Network, label: '网络质量' },
  { path: '/alerts', icon: Bell, label: '告警管理' },
  { path: '/health-check', icon: HeartPulse, label: '巡检管理' },
  { path: '/logs', icon: FileText, label: '日志中心' },
  { path: '/reports', icon: FileBarChart, label: '报表管理' },
]

const systemItems = [
  { path: '/settings', icon: Settings, label: '设置' },
]

const allNavItems = [...navItems, ...systemItems]

const notifications = [
  { id: 1, type: 'warning', icon: AlertTriangle, title: 'OST-003 容量超过 85%', time: '3分钟前', read: false, color: 'text-amber-400 bg-amber-500/10' },
  { id: 2, type: 'info', icon: Info, title: '每日巡检报告已生成', time: '10分钟前', read: false, color: 'text-sky-400 bg-sky-500/10' },
  { id: 3, type: 'success', icon: CheckCircle2, title: '集群健康检查通过', time: '30分钟前', read: true, color: 'text-emerald-400 bg-emerald-500/10' },
  { id: 4, type: 'warning', icon: AlertTriangle, title: 'node-12 网络延迟异常', time: '1小时前', read: true, color: 'text-amber-400 bg-amber-500/10' },
]

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (v: boolean) => void }) {
  const location = useLocation()
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
      <aside className={[
        'fixed top-0 left-0 z-50 h-screen border-r transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0 w-[248px] flex flex-col bg-[#07172b] border-[#10233f] text-slate-300'
      ].join(' ')}>
        <div className="flex items-center justify-between border-b border-[#10233f] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-white">Lustre 监控运维</h1>
              <p className="mt-0.5 text-[11px] text-slate-400">HPC Storage Console</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="关闭导航菜单">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p className="mb-2 px-3 text-[11px] font-medium text-slate-500">监控态势</p>
          {navItems.slice(0, 1).map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setIsOpen(false)}
                className={['mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                ].join(' ')}>
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}

          <p className="mb-2 mt-5 px-3 text-[11px] font-medium text-slate-500">资源与可观测</p>
          {navItems.slice(1).map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setIsOpen(false)}
                className={['mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                ].join(' ')}>
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}

          <p className="mb-2 mt-5 px-3 text-[11px] font-medium text-slate-500">系统</p>
          {systemItems.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link key={item.path} to={item.path} onClick={() => setIsOpen(false)}
                className={['mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                ].join(' ')}>
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-[#10233f] p-3">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              生产环境监控中
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">Lustre OPS v1.0 · 测试服务器</p>
          </div>
        </div>
      </aside>
    </>
  )
}

function Header({ setSidebarOpen }: { setSidebarOpen: (v: boolean) => void }) {
  const { darkMode, setDarkMode } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const unreadCount = notifications.filter(n => !n.read).length
  const currentItem = allNavItems.find(item => item.path === location.pathname)
  const searchResults = searchQuery.trim()
    ? allNavItems.filter(item => item.label.includes(searchQuery.trim())).slice(0, 5)
    : []

  useEffect(() => {
    if (!notifOpen && !userOpen) return
    const closeFloatingMenus = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setNotifOpen(false)
      setUserOpen(false)
    }
    window.addEventListener('keydown', closeFloatingMenus)
    return () => window.removeEventListener('keydown', closeFloatingMenus)
  }, [notifOpen, userOpen])

  const submitSearch = () => {
    const keyword = searchQuery.trim()
    if (!keyword) return
    const target = allNavItems.find(item => item.label.includes(keyword))
    if (target) {
      navigate(target.path)
      setSearchQuery('')
      toast.success(`已打开${target.label}`)
      return
    }
    toast.error('没有找到匹配的页面，请换个关键词')
  }

  const handleLogout = () => {
    setUserOpen(false)
    toast.success('当前为测试环境，已退出本地会话菜单')
  }

  return (
    <header className={['sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4',
      darkMode
        ? 'bg-slate-950 border-slate-800'
        : 'bg-white border-slate-200'
      ].join(' ')}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="打开导航菜单"
          className="lg:hidden text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
          <span>控制台</span>
          <span>/</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{currentItem?.label || '总览'}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <div className={['flex h-9 items-center gap-2 rounded-md border px-3',
          darkMode
            ? 'bg-slate-900 border-slate-700'
            : 'bg-slate-50 border-slate-200'
          ].join(' ')}>
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitSearch()
                if (event.key === 'Escape') setSearchQuery('')
              }}
              placeholder="搜索文件系统、主机、指标、告警..."
              aria-label="搜索页面"
              className="w-72 bg-transparent text-xs text-slate-700 outline-none placeholder-slate-400 dark:text-slate-300"
            />
          </div>
          {searchResults.length > 0 && (
            <div className={['absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-lg border shadow-xl',
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            ].join(' ')}>
              {searchResults.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path)
                      setSearchQuery('')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => toast.success('当前环境：生产环境')}
          className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 lg:inline-flex"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          生产环境
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <Link
          to="/health-check"
          className="hidden h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-500 xl:inline-flex"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          巡检
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false) }}
            aria-label={`通知中心，${unreadCount} 条未读`}
            className="relative p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">{unreadCount}</span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className={['absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-lg border shadow-xl',
                darkMode
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-white border-slate-200'
              ].join(' ')}>
                <div className={['flex items-center justify-between px-4 py-3 border-b',
                  darkMode ? 'border-slate-700/50' : 'border-slate-200'].join(' ')}>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">通知</h3>
                  <span className="text-xs text-slate-500">{unreadCount} 条未读</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map(n => {
                    const Icon = n.icon
                    return (
                      <div key={n.id} className={[`flex items-start gap-3 px-4 py-3 border-b transition-colors ${!n.read ? 'bg-slate-50 dark:bg-slate-700/10' : ''}`,
                        darkMode ? 'border-slate-700/30 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'].join(' ')}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${n.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${!n.read ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-300'}`}>{n.title}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{n.time}</p>
                        </div>
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />}
                      </div>
                    )
                  })}
                </div>
                <div className={['px-4 py-2 border-t',
                  darkMode ? 'border-slate-700/50' : 'border-slate-200'].join(' ')}>
                  <Link to="/alerts" onClick={() => setNotifOpen(false)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 text-center block">查看全部通知</Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          aria-label={darkMode ? '切换到日间模式' : '切换到夜间模式'}
          className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title={darkMode ? '切换到日间模式' : '切换到夜间模式'}
        >
          {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-500" />}
        </button>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={() => { setUserOpen(!userOpen); setNotifOpen(false) }}
            aria-label="打开用户菜单"
            className="flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] text-white">OP</span>
            <span className="hidden sm:inline">admin</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {userOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
              <div className={['absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-lg border shadow-xl',
                darkMode
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-white border-slate-200'
              ].join(' ')}>
                <div className={['px-4 py-3 border-b',
                  darkMode ? 'border-slate-700/50' : 'border-slate-200'].join(' ')}>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">运维管理员</p>
                  <p className="text-xs text-slate-500 mt-0.5">op@lustre.local</p>
                </div>
                <div className="py-1">
                  <Link to="/settings" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <User className="w-3.5 h-3.5" /> 个人设置
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> 退出登录
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
      html.style.colorScheme = 'dark'
    } else {
      html.classList.remove('dark')
      html.style.colorScheme = 'light'
    }
  }, [darkMode])

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
        <Toaster position="top-center" toastOptions={{ duration: 2400 }} />
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="lg:ml-[248px]">
          <Header setSidebarOpen={setSidebarOpen} />
          <main className="p-4 sm:p-5">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/config" element={<ClusterConfig />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/capacity" element={<Storage />} />
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/alerts/:id" element={<AlertDetail />} />
              <Route path="/logs" element={<LogAnalysis />} />
              <Route path="/health-check" element={<HealthCheck />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </ThemeContext.Provider>
    </div>
  )
}
