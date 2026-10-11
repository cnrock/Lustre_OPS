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
import Login from './pages/Login'
import { AUTH_EXPIRED_EVENT, fetchMe, logout as doLogout, getToken, type CurrentUser } from './lib/auth'
import { APP_VERSION_LABEL } from './lib/version'

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

function NavLink({ item, isActive, onNavigate }: { item: typeof navItems[number]; isActive: boolean; onNavigate: () => void }) {
 const Icon = item.icon
 return (
 <Link key={item.path} to={item.path} onClick={onNavigate}
 className={['group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
 isActive
 ? 'bg-primary text-primary-foreground shadow-sm'
 : 'text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]'
 ].join(' ')}>
 <Icon className={['h-[17px] w-[17px] transition-transform duration-200 group-hover:scale-105', isActive ? '' : 'opacity-70'].join(' ')} />
 <span>{item.label}</span>
 </Link>
 )
}

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (v: boolean) => void }) {
 const location = useLocation()
 const close = () => setIsOpen(false)
 return (
 <>
 {isOpen && (
 <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={close} />
 )}
 <aside className={[
 'ops-glass fixed top-0 left-0 z-50 flex h-screen w-[248px] flex-col border-r transition-transform duration-300 ease-[cubic-bezier(.25,.1,.25,1)]',
 isOpen ? 'translate-x-0' : '-translate-x-full',
 'lg:translate-x-0 bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]'
 ].join(' ')}>
 <div className="flex items-center justify-between px-5 py-[18px]">
 <div className="flex items-center gap-2.5">
 <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary shadow-sm">
 <HardDrive className="h-4 w-4 text-white" />
 </div>
 <div>
 <h1 className="text-[13px] font-semibold leading-tight tracking-tight">Lustre 监控运维</h1>
 <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">HPC Storage Console</p>
 </div>
 </div>
 <button onClick={close} className="rounded-lg p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--sidebar-accent))] lg:hidden" aria-label="关闭导航菜单">
 <X className="h-5 w-5" />
 </button>
 </div>

 <nav className="flex-1 overflow-y-auto px-2.5 pb-3 ops-scrollbar">
 <p className="mb-1.5 mt-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">监控态势</p>
 {navItems.slice(0, 1).map(item => (
 <NavLink key={item.path} item={item} isActive={location.pathname === item.path} onNavigate={close} />
 ))}

 <p className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">资源与可观测</p>
 {navItems.slice(1).map(item => (
 <NavLink key={item.path} item={item} isActive={location.pathname === item.path} onNavigate={close} />
 ))}

 <p className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">系统</p>
 {systemItems.map(item => (
 <NavLink key={item.path} item={item} isActive={location.pathname === item.path} onNavigate={close} />
 ))}
 </nav>

 <div className="p-3">
 <div className="rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))]/60 p-3">
 <div className="flex items-center gap-2 text-[12px] font-medium">
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
 生产环境监控中
 </div>
 <p className="mt-1.5 text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">Lustre OPS {APP_VERSION_LABEL} · HPC 存储控制台</p>
 </div>
 </div>
 </aside>
 </>
 )
}

function Header({ setSidebarOpen, currentUser, onLogout }: { setSidebarOpen: (v: boolean) => void; currentUser?: CurrentUser | null; onLogout?: () => void }) {
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
 if (onLogout) onLogout()
 else toast.success('已退出')
 }

 const displayName = currentUser?.username || currentUser?.name || 'admin'
 const displayEmail = currentUser?.email || ''
 const avatarText = (displayName || 'U').slice(0, 2).toUpperCase()

 return (
 <header className={[
 'ops-glass sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 sm:px-6',
 ].join(' ')}>
 <div className="flex items-center gap-3">
 <button
 onClick={() => setSidebarOpen(true)}
 aria-label="打开导航菜单"
 className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-foreground lg:hidden"
 >
 <Menu className="h-5 w-5" />
 </button>
 <div className="hidden items-center gap-2 text-[12px] text-[hsl(var(--muted-foreground))] sm:flex">
 <span>控制台</span>
 <span className="opacity-40">/</span>
 <span className="font-medium text-foreground">{currentItem?.label || '总览'}</span>
 </div>
 </div>

 <div className="flex items-center gap-2 sm:gap-3">
 <div className="relative hidden md:block">
 <div className="flex h-9 items-center gap-2 rounded-full border bg-[hsl(var(--muted))] px-3.5 transition-colors focus-within:border-primary/40">
 <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
 <input
 type="text"
 value={searchQuery}
 onChange={(event) => setSearchQuery(event.target.value)}
 onKeyDown={(event) => {
 if (event.key === 'Enter') submitSearch()
 if (event.key === 'Escape') setSearchQuery('')
 }}
 placeholder="搜索页面、指标、告警…"
 aria-label="搜索页面"
 className="w-64 bg-transparent text-[12px] text-foreground outline-none placeholder:text-[hsl(var(--muted-foreground))]"
 />
 </div>
 {searchResults.length > 0 && (
 <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border bg-popover shadow-xl">
 {searchResults.map((item) => {
 const Icon = item.icon
 return (
 <button
 key={item.path}
 onClick={() => {
 navigate(item.path)
 setSearchQuery('')
 }}
 className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"
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
 className="hidden h-9 items-center gap-2 rounded-full border bg-card px-3.5 text-[12px] text-foreground transition-colors hover:bg-[hsl(var(--accent))] lg:inline-flex"
 >
 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
 生产环境
 <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
 </button>

 <Link
 to="/health-check"
 className="ops-btn-primary hidden h-9 items-center gap-2 rounded-full px-4 text-[12px] font-medium xl:inline-flex"
 >
 <ShieldCheck className="h-3.5 w-3.5" />
 巡检
 </Link>

 {/* Notifications */}
 <div className="relative">
 <button
 onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false) }}
 aria-label={`通知中心，${unreadCount} 条未读`}
 className="relative rounded-full p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"
 >
 <Bell className="h-4 w-4" />
 {unreadCount > 0 && (
 <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
 )}
 </button>
 {notifOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
 <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border bg-popover shadow-xl">
 <div className="flex items-center justify-between border-b px-4 py-3">
 <h3 className="text-[13px] font-semibold text-foreground">通知</h3>
 <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{unreadCount} 条未读</span>
 </div>
 <div className="max-h-72 overflow-y-auto ops-scrollbar">
 {notifications.map(n => {
 const Icon = n.icon
 return (
 <div key={n.id} className={`flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-[hsl(var(--accent))]/50 ${!n.read ? 'bg-[hsl(var(--accent))]/30' : ''}`}>
 <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${n.color}`}>
 <Icon className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0 flex-1">
 <p className={`text-[12px] ${!n.read ? 'font-medium text-foreground' : 'text-[hsl(var(--muted-foreground))]'}`}>{n.title}</p>
 <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{n.time}</p>
 </div>
 {!n.read && <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />}
 </div>
 )
 })}
 </div>
 <div className="border-t px-4 py-2">
 <Link to="/alerts" onClick={() => setNotifOpen(false)} className="block text-center text-[12px] text-primary hover:opacity-80">查看全部通知</Link>
 </div>
 </div>
 </>
 )}
 </div>

 {/* Theme toggle */}
 <button
 onClick={() => setDarkMode(!darkMode)}
 aria-label={darkMode ? '切换到日间模式' : '切换到夜间模式'}
 className="rounded-full p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"
 title={darkMode ? '切换到日间模式' : '切换到夜间模式'}
 >
 {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
 </button>

 {/* User avatar */}
 <div className="relative">
 <button
 onClick={() => { setUserOpen(!userOpen); setNotifOpen(false) }}
 aria-label="打开用户菜单"
 className="flex h-9 items-center gap-2 rounded-full border bg-card px-2 pr-3 text-[12px] font-medium text-foreground transition-colors hover:bg-[hsl(var(--accent))]"
 >
 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] text-white">{avatarText}</span>
 <span className="hidden sm:inline">{displayName}</span>
 <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
 </button>
 {userOpen && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
 <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-2xl border bg-popover shadow-xl">
 <div className="border-b px-4 py-3">
 <p className="text-[13px] font-medium text-foreground">{displayName}</p>
 <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{displayEmail}</p>
 </div>
 <div className="py-1">
 <Link to="/settings" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground">
 <User className="h-3.5 w-3.5" /> 个人设置
 </Link>
 <button
 onClick={handleLogout}
 className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-red-500"
 >
 <LogOut className="h-3.5 w-3.5" /> 退出登录
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
 const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>('checking')
 const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

 useEffect(() => {
 let alive = true
 ;(async () => {
 if (!getToken()) {
 if (alive) setAuthState('out')
 return
 }
 const me = await fetchMe()
 if (!alive) return
 if (me) {
 setCurrentUser(me)
 setAuthState('in')
 } else {
 setAuthState('out')
 }
 })()
 const onExpired = () => setAuthState('out')
 window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
 return () => {
 alive = false
 window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
 }
 }, [])

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

 if (authState === 'checking') {
 return (
 <div className="flex min-h-screen items-center justify-center bg-background text-[hsl(var(--muted-foreground))]">
 <div className="flex flex-col items-center gap-3">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-primary" />
 <span className="text-[13px]">正在校验登录状态…</span>
 </div>
 </div>
 )
 }

 if (authState === 'out') {
 return <Login onSuccess={() => { setAuthState('in'); fetchMe().then(setCurrentUser) }} />
 }

 return (
 <div className="min-h-screen bg-background">
 <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
 <Toaster position="top-center" toastOptions={{ duration: 2400 }} />
 <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
 <div className="lg:ml-[248px]">
 <Header setSidebarOpen={setSidebarOpen} currentUser={currentUser} onLogout={async () => { await doLogout(); setCurrentUser(null); setAuthState('out') }} />
 <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
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
 <Route path="/settings" element={<SettingsPage currentUser={currentUser} />} />
 </Routes>
 </main>
 </div>
 </ThemeContext.Provider>
 </div>
 )
}
