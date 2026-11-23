import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Badge, Button, Chips, Icon } from '@/components/ui'
import { can } from '@/config/permissions'
import { EXAM_KINDS } from '@/services/exams'
import { daysUntil, fmtDate, todayKey } from '@/lib/format'

export default function ExamsPage() {
  const { actor } = useAuth()
  const { exams } = useData()
  const nav = useNavigate()
  const [tab, setTab] = useState('upcoming')
  const t = todayKey()
  const buckets = {
    upcoming: (exams || []).filter((e) => e.date > t),
    today: (exams || []).filter((e) => e.date === t),
    past: (exams || []).filter((e) => e.date < t).reverse()
  }
  const list = buckets[tab]
  const canManage = can(actor.role, 'exams.manage')

  return (
    <Page title="الامتحانات" actions={canManage && <Button size="sm" icon="add-square-bold" onClick={() => nav('/exams/new')}>جديد</Button>}>
      <Chips value={tab} onChange={setTab} options={[['upcoming', `القادمة (${buckets.upcoming.length})`], ['today', `اليوم (${buckets.today.length})`], ['past', `منتهية (${buckets.past.length})`]]} />
      <Async data={exams && list} empty={{ upcoming: 'لا توجد اختبارات قادمة', today: 'لا توجد اختبارات اليوم', past: 'لا توجد اختبارات منتهية' }[tab]} emptyIcon="document-add-bold">
        <div className="px-4 space-y-3">
          {list.map((e) => (
            <button key={e.id} onClick={() => nav(`/exams/${e.id}`)} className="w-full text-right bg-card border rounded-[18px] p-4 shadow-xs active:scale-[.99] transition">
              <div className="flex justify-between gap-2 mb-2.5">
                <div><div className="font-extrabold text-[15px]">{e.title}</div><div className="text-xs text-ink-muted mt-0.5">{e.groupName} • {e.teacherName}</div></div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={EXAM_KINDS[e.kind || 'periodic'].tone}>{EXAM_KINDS[e.kind || 'periodic'].label}</Badge>
                  <Badge tone={e.status === 'published' ? 'ok' : tab === 'today' ? 'ok' : tab === 'past' ? 'warn' : 'info'}>{e.status === 'published' ? `النتائج: ${e.passedCount ?? 0}/${e.gradedCount ?? 0} ناجح` : tab === 'today' ? 'اليوم' : tab === 'past' ? 'بانتظار الرصد' : `بعد ${daysUntil(e.date)} يوم`}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                <span className="flex items-center gap-1"><Icon name="calendar-bold" />{fmtDate(e.date)}</span>
                {e.time && <span className="flex items-center gap-1"><Icon name="clock-circle-bold" />{e.time}</span>}
                <span className="flex items-center gap-1"><Icon name="hourglass-linear" />{e.duration || 60} د</span>
              </div>
              {e.scope && <div className="mt-2.5 p-2.5 bg-field rounded-xl text-xs text-ink-soft">النطاق: {e.scope}</div>}
            </button>
          ))}
        </div>
      </Async>
    </Page>
  )
}
