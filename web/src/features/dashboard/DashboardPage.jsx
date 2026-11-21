// One dashboard route; the content adapts to the role (all figures are live).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { isStaffRole } from '@/config/roles'
import { SERVICES } from '@/config/services'
import { APP_STATUS, MASTERY } from '@/config/constants'
import { Avatar, Badge, Card, Icon, ListItem, Section, Skeleton, cx } from '@/components/ui'
import { ServiceTile } from '@/features/hub/ServicesPage'
import { daysUntil, fmtDate, greeting, relTime, todayKey } from '@/lib/format'

const SHORTCUTS = {
  staff:   ['applications', 'students', 'attendance', 'record', 'behavior', 'exams', 'announcements', 'circulars'],
  teacher: ['record', 'attendance', 'behavior', 'exams', 'staff', 'circulars', 'announcements', 'certificates'],
  student: ['exams', 'certificates', 'attendance', 'behavior', 'competitions', 'announcements', 'honor', 'hifzmap'],
  parent:  ['behavior', 'attendance', 'exams', 'certificates', 'announcements', 'circulars', 'payments', 'competitions']
}
const VERSES = {
  staff: ['إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ', 'الحجر ٩'],
  teacher: ['وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ', 'القمر ١٧'],
  student: ['وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا', 'المزمل ٤'],
  parent: ['وَقُل رَّبِّ زِدْنِي عِلْمًا', 'طه ١١٤']
}

export default function DashboardPage() {
  const { actor } = useAuth()
  const data = useData()
  const kind = isStaffRole(actor.role) ? 'staff' : actor.role
  const [verse, ref] = VERSES[kind]
  const tiles = SHORTCUTS[kind].map((id) => SERVICES.find((s) => s.id === id)).filter((s) => s && s.roles.includes(actor.role))

  return (
    <div className="pb-28 md:pb-10 md:max-w-5xl md:mx-auto">
      <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
        <Avatar name={actor.name} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-ink-muted font-semibold">{greeting()}</div>
          <div className="text-base font-extrabold truncate">{actor.name}</div>
        </div>
        <Link to="/notifications" aria-label="الإشعارات" className="relative w-11 h-11 rounded-xl bg-card border flex items-center justify-center text-xl">
          <Icon name="bell-bold" />
          {data.badges.notifications > 0 && <i className="absolute top-2 left-2.5 w-2.5 h-2.5 rounded-full bg-bad border-2 border-card" />}
        </Link>
      </header>

      <div className="mx-4 mb-4 py-4 text-center">
        <div className="font-quran text-xl text-gold-600 leading-[2]">{verse}</div>
        <div className="text-[11px] text-ink-muted">سورة {ref}</div>
      </div>

      {kind === 'staff' && <StaffKpis data={data} />}
      {kind === 'teacher' && <TeacherKpis data={data} actor={actor} />}
      {(kind === 'student' || kind === 'parent') && <Children data={data} kind={kind} />}

      <Section title={kind === 'staff' ? 'وحدات النظام' : kind === 'teacher' ? 'أدوات المحفظ' : 'خدماتي'} action={<Link to="/services" className="text-xs font-bold text-gold-500">كل الخدمات</Link>}>
        <Card className="px-1.5 py-2 grid grid-cols-4 md:grid-cols-8">{tiles.map((s) => <ServiceTile key={s.id} s={s} badge={s.badge && data.badges[s.badge]} />)}</Card>
      </Section>

      {kind === 'staff' && <RecentApplications apps={data.applications} />}
      <UpcomingExams exams={data.exams} />
      <LatestAnnouncements list={data.announcements} />
    </div>
  )
}

function Kpi({ icon, tone, value, label, sub, to }) {
  const C = to ? Link : 'div'
  const tones = { info: 'bg-info-soft text-info', ok: 'bg-ok-soft text-ok', gold: 'bg-gold-50 text-gold-500', warn: 'bg-warn-soft text-warn' }
  return (
    <C to={to} className="bg-card border rounded-[18px] p-4 shadow-xs block">
      <div className={cx('w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-3', tones[tone])}><Icon name={icon} /></div>
      <div className="text-[26px] font-extrabold leading-none">{value ?? '—'}</div>
      <div className="text-[12.5px] text-ink-muted mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>}
    </C>
  )
}

function StaffKpis({ data }) {
  const st = data.students
  if (!st || !data.groups) return <Skeleton rows={2} />
  const avg = st.length ? (st.reduce((s, x) => s + (x.academicInfo?.currentJuz || 0), 0) / st.length).toFixed(1) : 0
  const cap = data.groups.reduce((s, g) => s + (g.capacity || 0), 0)
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 mb-5">
      <Kpi to="/students" icon="users-group-rounded-bold" tone="info" value={st.length} label="الطلبة" sub={`${data.groups.length} حلقات`} />
      <Kpi to="/applications" icon="clipboard-list-bold" tone="warn" value={data.badges.applications} label="طلبات جديدة" sub={`${(data.applications || []).length} إجمالي`} />
      <Kpi icon="book-bookmark-bold" tone="gold" value={avg} label="متوسط الأجزاء" sub="لكل طالب" />
      <Kpi icon="widget-5-bold" tone="ok" value={cap ? `${Math.round((st.length / cap) * 100)}%` : '—'} label="إشغال الحلقات" sub={`${st.length} من ${cap} مقعد`} />
    </div>
  )
}

function TeacherKpis({ data, actor }) {
  if (!data.students || !data.groups) return <Skeleton rows={2} />
  const mine = data.groups.filter((g) => g.teacherId === actor.linkedId)
  const today = (data.exams || []).filter((e) => e.date === todayKey()).length
  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 mb-5">
        <Kpi to="/students" icon="users-group-rounded-bold" tone="ok" value={data.students.length} label="طلابي" />
        <Kpi icon="widget-5-bold" tone="gold" value={mine.length} label="حلقاتي" sub={today ? `${today} اختبار اليوم` : undefined} />
      </div>
      {mine.length > 0 && (
        <Section title="حلقاتي">
          <Card className="px-4">{mine.map((g) => <ListItem key={g.id} leading={<span className="w-10 h-10 rounded-xl bg-gold-50 text-gold-500 flex items-center justify-center text-lg"><Icon name="widget-5-bold" /></span>} title={g.name} subtitle={`${g.studentCount || 0} طالب • ${g.room || ''} • ${g.time || ''}`} trailing={<Link to="/attendance" className="text-xs font-bold text-gold-500">الحضور</Link>} />)}</Card>
        </Section>
      )}
    </>
  )
}

function Children({ data, kind }) {
  if (!data.students) return <Skeleton rows={2} />
  return (
    <Section title={kind === 'parent' ? 'أبنائي في الدار' : null}>
      <div className="space-y-3">
        {data.students.map((s) => <ChildCard key={s.id} s={s} kind={kind} />)}
      </div>
    </Section>
  )
}

function ChildCard({ s, kind }) {
  const ac = s.academicInfo || {}
  const hwKey = `dar.hw.done.${s.id}.${ac.lastHomeworkDate || 'cur'}`
  const [hwDone, setHwDone] = useState(() => {
    try { return localStorage.getItem(hwKey) === '1' } catch { return false }
  })
  const toggleHw = () => {
    const next = !hwDone
    setHwDone(next)
    try { localStorage.setItem(hwKey, next ? '1' : '0') } catch { /* ignore */ }
  }

  return (
    <div className="space-y-2">
      <Link to={`/students/${s.id}`} className="block bg-card border rounded-[18px] p-4 shadow-xs">
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={s.personalInfo.fullName} size={48} />
          <div>
            <div className="font-extrabold">{s.personalInfo.fullName}</div>
            <div className="text-xs text-gold-500 font-bold">{ac.groupName} • {ac.teacherName}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 text-center">
          <div><div className="text-xl font-extrabold text-gold-600">{ac.currentJuz || 0}</div><div className="text-[11px] text-ink-muted">جزء محفوظ</div></div>
          <div><div className="text-xl font-extrabold text-ok">{(ac.totalMemorized || 0).toLocaleString('ar-EG')}</div><div className="text-[11px] text-ink-muted">آية</div></div>
        </div>
      </Link>
      {ac.lastHomework && (
        <div className="bg-gold-50 border border-gold-400/35 rounded-[18px] p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-gold-600">
              <Icon name="book-bookmark-bold" />
              <span>{kind === 'student' ? 'واجبي للحلقة القادمة' : `واجب ${s.personalInfo.fullName.split(' ')[0]} للحلقة القادمة`}</span>
            </div>
            {ac.lastMastery && (
              <Badge tone={ac.lastMastery === 'excellent' ? 'ok' : ac.lastMastery === 'weak' ? 'bad' : 'gold'}>
                {MASTERY[ac.lastMastery]}
              </Badge>
            )}
          </div>
          <div className="text-[13px] font-bold text-ink leading-6">{ac.lastHomework}</div>
          <div className="flex items-center justify-between gap-2 mt-2.5">
            <span className="text-[11px] text-ink-muted">
              {ac.lastSession ? `آخر تسميع: ${fmtDate(ac.lastSession, { day: 'numeric', month: 'short' })}` : ''}
            </span>
            <button type="button" onClick={toggleHw}
              className={cx('h-8 px-3 rounded-xl text-xs font-bold border transition',
                hwDone ? 'bg-ok-soft text-ok border-ok/30' : 'bg-card text-gold-600 border-gold-400/40')}>
              {hwDone ? 'تم التحضير ✓' : 'أتممت التحضير ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RecentApplications({ apps }) {
  if (!apps?.length) return null
  return (
    <Section title="أحدث الطلبات" action={<Link to="/applications" className="text-xs font-bold text-gold-500">عرض الكل</Link>}>
      <Card className="px-4">
        {apps.slice(0, 4).map((a) => {
          const st = APP_STATUS[a.status] || APP_STATUS.pending
          return <Link key={a.id} to={`/applications/${a.id}`}><ListItem leading={<Avatar name={a.personalInfo?.fullName} size={36} />} title={a.personalInfo?.fullName} subtitle={relTime(a.submittedAt)} trailing={<Badge tone={st.tone}>{st.label}</Badge>} /></Link>
        })}
      </Card>
    </Section>
  )
}

function UpcomingExams({ exams }) {
  const list = (exams || []).filter((e) => e.date >= todayKey()).slice(0, 3)
  if (!list.length) return null
  return (
    <Section title="الاختبارات القادمة" action={<Link to="/exams" className="text-xs font-bold text-gold-500">عرض الكل</Link>}>
      <Card className="px-4">{list.map((e) => <ListItem key={e.id} leading={<span className="w-10 h-10 rounded-xl bg-info-soft text-info flex items-center justify-center text-lg"><Icon name="document-add-bold" /></span>} title={e.title} subtitle={`${e.groupName} • ${fmtDate(e.date)}`} trailing={<Badge tone={daysUntil(e.date) === 0 ? 'ok' : 'info'}>{daysUntil(e.date) === 0 ? 'اليوم' : `بعد ${daysUntil(e.date)} يوم`}</Badge>} />)}</Card>
    </Section>
  )
}

function LatestAnnouncements({ list }) {
  if (!list?.length) return null
  const a = list[0]
  return (
    <Section title="آخر الإعلانات" action={<Link to="/announcements" className="text-xs font-bold text-gold-500">عرض الكل</Link>}>
      <Link to="/announcements" className="block bg-card border rounded-[18px] p-4 shadow-xs">
        <div className="flex items-center justify-between mb-1.5"><span className="font-extrabold text-sm">{a.title}</span>{a.pinned && <Badge tone="gold">مثبّت</Badge>}</div>
        <p className="text-[13px] text-ink-soft leading-7 clamp-3">{a.body}</p>
      </Link>
    </Section>
  )
}
