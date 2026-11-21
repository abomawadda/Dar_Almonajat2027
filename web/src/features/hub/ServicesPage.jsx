import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page, TileIcon } from '@/components/layout/AppShell'
import { Avatar, Card, EmptyState, Icon, SearchInput } from '@/components/ui'
import { SERVICE_GROUPS, servicesFor } from '@/config/services'

export function ServiceTile({ s, badge }) {
  return (
    <Link to={s.path} className="flex flex-col items-center gap-1.5 py-2 rounded-2xl active:bg-field active:scale-95 transition">
      <TileIcon icon={s.icon} tone={s.tone} badge={badge} />
      <span className="text-[11.5px] font-bold text-ink-soft text-center leading-tight">{s.label}</span>
    </Link>
  )
}

export default function ServicesPage() {
  const { actor } = useAuth()
  const { badges } = useData()
  const [q, setQ] = useState('')
  const mine = servicesFor(actor.role)
  const groups = SERVICE_GROUPS.map((g) => ({ ...g, items: mine.filter((s) => s.group === g.id && (!q || s.label.includes(q.trim()))) })).filter((g) => g.items.length)

  return (
    <Page title="كل الخدمات" back={false}>
      <div className="mx-4 mb-4 p-5 rounded-[20px] bg-gold-grad text-white shadow-lift relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 15% 120%,rgba(255,255,255,.35),transparent 55%)' }} />
        <div className="relative flex items-center gap-3">
          <div className="rounded-full border-2 border-white/40"><Avatar name={actor.name} size={48} /></div>
          <div className="flex-1"><div className="text-base font-extrabold">{actor.name}</div><div className="text-xs opacity-85">{actor.roleLabel}</div></div>
          <Icon name="shield-user-bold" className="text-3xl opacity-80" />
        </div>
        <div className="relative mt-3.5 inline-flex items-center gap-1.5 text-xs bg-white/15 rounded-full px-3 py-1.5"><Icon name="key-minimalistic-bold" />{mine.length} خدمة متاحة لصلاحيتك</div>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="ابحث عن خدمة…" />
      {groups.length ? groups.map((g) => (
        <Card key={g.id} className="mx-4 mb-3.5 px-2 pt-3.5 pb-2">
          <div className="flex items-center gap-2 px-2 pb-1.5 text-[13px] font-extrabold"><Icon name={g.icon} className="text-gold-500 text-lg" />{g.label}<span className="mr-auto text-[11px] text-ink-muted font-semibold">{g.items.length}</span></div>
          <div className="grid grid-cols-4 md:grid-cols-6">{g.items.map((s) => <ServiceTile key={s.id} s={s} badge={s.badge && badges[s.badge]} />)}</div>
        </Card>
      )) : <EmptyState icon="magnifer-linear">لا توجد خدمة بهذا الاسم</EmptyState>}
    </Page>
  )
}
