import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Badge, Button, Chips, Icon, KV, Sheet } from '@/components/ui'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { deleteExam } from '@/services/academic'
import { daysUntil, fmtDate, todayKey } from '@/lib/format'

export default function ExamsPage() {
  const { actor } = useAuth()
  const { exams } = useData()
  const nav = useNavigate()
  const [tab, setTab] = useState('upcoming')
  const [open, setOpen] = useState(null)
  const t = todayKey()
  const buckets = {
    upcoming: (exams || []).filter((e) => e.date > t),
    today: (exams || []).filter((e) => e.date === t),
    past: (exams || []).filter((e) => e.date < t).reverse()
  }
  const list = buckets[tab]
  const canManage = can(actor.role, 'exams.manage')
  const [remove, removing] = useAction(deleteExam, { success: 'أُلغي الاختبار' })

  return (
    <Page title="الامتحانات" actions={canManage && <Button size="sm" icon="add-square-bold" onClick={() => nav('/exams/new')}>جديد</Button>}>
      <Chips value={tab} onChange={setTab} options={[['upcoming', `القادمة (${buckets.upcoming.length})`], ['today', `اليوم (${buckets.today.length})`], ['past', `منتهية (${buckets.past.length})`]]} />
      <Async data={exams && list} empty={{ upcoming: 'لا توجد اختبارات قادمة', today: 'لا توجد اختبارات اليوم', past: 'لا توجد اختبارات منتهية' }[tab]} emptyIcon="document-add-bold">
        <div className="px-4 space-y-3">
          {list.map((e) => (
            <button key={e.id} onClick={() => setOpen(e)} className="w-full text-right bg-card border rounded-[18px] p-4 shadow-xs active:scale-[.99] transition">
              <div className="flex justify-between gap-2 mb-2.5">
                <div><div className="font-extrabold text-[15px]">{e.title}</div><div className="text-xs text-ink-muted mt-0.5">{e.groupName} • {e.teacherName}</div></div>
                <Badge tone={tab === 'today' ? 'ok' : tab === 'past' ? 'muted' : 'info'}>{tab === 'today' ? 'اليوم' : tab === 'past' ? 'منتهٍ' : `بعد ${daysUntil(e.date)} يوم`}</Badge>
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
      <Sheet open={!!open} title="تفاصيل الاختبار" onClose={() => setOpen(null)}>
        {open && <>
          <div className="text-[17px] font-extrabold mb-4">{open.title}</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <KV label="الحلقة">{open.groupName}</KV><KV label="المحفظ">{open.teacherName}</KV>
            <KV label="التاريخ">{fmtDate(open.date)}</KV><KV label="الوقت">{`${open.time || ''} • ${open.duration || 60} دقيقة`}</KV>
            <KV label="الدرجة الكلية">{open.totalMarks}</KV><KV label="درجة النجاح">{open.passMark}</KV>
          </div>
          {open.scope && <div className="p-3 bg-field rounded-xl text-sm mb-4">{open.scope}</div>}
          {(actor.role === 'admin' || (actor.role === 'teacher' && open.teacherId === actor.linkedId)) &&
            <Button block variant="danger" icon="trash-bin-trash-bold" busy={removing} onClick={async () => { if (confirm('إلغاء الاختبار؟') && (await remove(open.id))) setOpen(null) }}>إلغاء الاختبار</Button>}
        </>}
      </Sheet>
    </Page>
  )
}
