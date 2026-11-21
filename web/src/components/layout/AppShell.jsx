// Shell: mobile top bar + bottom nav with centre quick-action button; desktop sidebar.
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { BOTTOM_NAV, QUICK_ACTIONS, SERVICE_GROUPS, servicesFor } from '@/config/services'
import { isStaffRole } from '@/config/roles'
import { Avatar, Icon, Sheet, TONES, cx } from '@/components/ui'

export function TileIcon({ icon, tone, badge, size = 52 }) {
  return (
    <span className={cx('relative flex items-center justify-center rounded-2xl', TONES[tone])} style={{ width: size, height: size, fontSize: size * 0.46 }}>
      <Icon name={icon} />
      {badge > 0 && <i className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10px] font-extrabold not-italic flex items-center justify-center border-2 border-card">{badge}</i>}
    </span>
  )
}

/** Page wrapper: title bar with back button; content scrolls under it. */
export function Page({ title, back = true, actions, children }) {
  const nav = useNavigate()
  return (
    <div className="pb-28 md:pb-10">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-3 flex items-center gap-2 md:max-w-5xl md:mx-auto md:px-6">
          {back ? (
            <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/dashboard'))} aria-label="رجوع"
              className="w-10 h-10 rounded-xl bg-card border flex items-center justify-center md:hidden">
              <Icon name="arrow-right-linear" className="text-lg" />
            </button>
          ) : <span className="w-10 md:hidden" />}
          <h1 className="flex-1 text-center md:text-right text-[17px] font-extrabold truncate">{title}</h1>
          <div className="min-w-10 flex justify-end gap-2">{actions}</div>
        </div>
      </header>
      <div className="pt-3 md:max-w-5xl md:mx-auto">{children}</div>
    </div>
  )
}

function BottomNav({ onQuick }) {
  const { actor } = useAuth()
  const { badges } = useData()
  const tabs = BOTTOM_NAV[actor.role] || BOTTOM_NAV.student
  const item = ([to, label, icon]) => (
    <NavLink key={to} to={to} end={to === '/dashboard'}
      className={({ isActive }) => cx('flex-1 flex flex-col items-center gap-0.5 pt-2 text-[11px] font-bold', isActive ? 'text-gold-600' : 'text-ink-muted')}>
      <span className="relative text-[22px]"><Icon name={icon} />{to === '/notifications' && badges.notifications > 0 && <i className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-bad" />}</span>
      {label}
    </NavLink>
  )
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t pb-[env(safe-area-inset-bottom)]">
      <div className="h-16 flex items-start">
        {tabs.slice(0, 2).map(item)}
        <div className="w-20 flex justify-center">
          <button onClick={onQuick} aria-label="إجراء سريع"
            className="-mt-6 w-[60px] h-[60px] rounded-full bg-gold-grad text-white shadow-lift border-4 border-paper flex items-center justify-center text-2xl active:scale-95 transition">
            <Icon name={actor.role === 'student' || actor.role === 'parent' ? 'bell-bold' : 'add-square-bold'} />
          </button>
        </div>
        {tabs.slice(2).map(item)}
      </div>
    </nav>
  )
}

function Sidebar() {
  const { actor, signOut, mode } = useAuth()
  const { badges } = useData()
  const mine = servicesFor(actor.role)
  return (
    <aside className="hidden md:flex fixed inset-y-0 right-0 w-64 bg-card border-l flex-col z-30">
      <div className="p-5 border-b flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold-50 border border-gold-400/30 flex items-center justify-center text-gold-500 text-xl"><Icon name="book-minimalistic-bold" /></div>
        <div><div className="font-quran text-base font-bold text-gold-600">دار المناجاة</div><div className="text-[11px] text-ink-muted">لتحفيظ القرآن الكريم</div></div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <SideLink to="/dashboard" icon="home-smile-bold-duotone" label="الرئيسية" end />
        {SERVICE_GROUPS.map((g) => {
          const items = mine.filter((s) => s.group === g.id)
          if (!items.length) return null
          return (
            <div key={g.id} className="mt-2">
              <div className="px-5 py-1.5 text-[10.5px] font-bold text-ink-muted">{g.label}</div>
              {items.map((s) => <SideLink key={s.id} to={s.path} icon={s.icon} label={s.label} badge={s.badge && badges[s.badge]} muted={s.ready === false} />)}
            </div>
          )
        })}
      </nav>
      <div className="p-4 border-t flex items-center gap-3">
        <Avatar name={actor.name} size={36} />
        <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{actor.name}</div><div className="text-[11px] text-ink-muted">{actor.roleLabel}{mode === 'demo' && ' • تجريبي'}</div></div>
        <button onClick={signOut} title="تسجيل الخروج" className="p-2 rounded-lg text-bad hover:bg-bad-soft"><Icon name="logout-2-bold" /></button>
      </div>
    </aside>
  )
}
function SideLink({ to, icon, label, badge, end, muted }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cx('flex items-center gap-3 px-5 py-2.5 text-[13.5px] font-medium border-r-[3px]', isActive ? 'text-gold-600 bg-gold-50 font-bold border-gold-400' : 'text-ink-soft border-transparent hover:bg-field', muted && 'opacity-60')}>
      <Icon name={icon} className="text-lg" /><span className="flex-1">{label}</span>
      {badge > 0 && <span className="text-[10px] font-extrabold bg-bad text-white rounded-full px-1.5">{badge}</span>}
    </NavLink>
  )
}

function QuickActions({ open, onClose }) {
  const { actor } = useAuth()
  const nav = useNavigate()
  const list = isStaffRole(actor.role) ? QUICK_ACTIONS.staff : QUICK_ACTIONS.teacher
  return (
    <Sheet open={open} title="إجراء سريع" onClose={onClose}>
      <div className="grid grid-cols-4 gap-y-3">
        {list.map((a) => (
          <button key={a.label} onClick={() => { onClose(); nav(a.to) }} className="flex flex-col items-center gap-1.5 p-1 rounded-2xl active:bg-field">
            <TileIcon icon={a.icon} tone={a.tone} />
            <span className="text-[11.5px] font-bold text-ink-soft text-center leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export default function AppShell() {
  const { actor } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [quick, setQuick] = useState(false)
  const onQuick = () => (actor.role === 'student' || actor.role === 'parent' ? nav('/notifications') : setQuick(true))
  return (
    <div className="min-h-dvh bg-paper md:pr-64">
      <Sidebar />
      <main key={loc.pathname} className="animate-fade"><Outlet /></main>
      <BottomNav onQuick={onQuick} />
      <QuickActions open={quick} onClose={() => setQuick(false)} />
    </div>
  )
}
