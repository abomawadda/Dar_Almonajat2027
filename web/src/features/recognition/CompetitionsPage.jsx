import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Badge, Button, Field, Icon, Input, Progress, Sheet, Textarea, cx } from '@/components/ui'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { createCompetition, subscribeCompetitions } from '@/services/comms'
import { daysUntil, fmtDate, todayKey } from '@/lib/format'

function phase(c) {
  const t = todayKey()
  if (c.startDate > t) return ['upcoming', 'قادمة', 'info']
  if (c.endDate < t) return ['finished', 'منتهية', 'muted']
  return ['active', 'جارية', 'ok']
}

export default function CompetitionsPage() {
  const { actor } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => subscribeCompetitions(setRows), [])

  return (
    <Page title="المسابقات" actions={can(actor.role, 'competitions.manage') && <Button size="sm" icon="add-square-bold" onClick={() => setOpen(true)}>جديدة</Button>}>
      <Async data={rows} empty="لا توجد مسابقات" emptyIcon="cup-star-bold">
        <div className="px-4 space-y-3">
          {(rows || []).map((c) => {
            const [p, label, tone] = phase(c)
            const total = Math.max(1, daysUntil(c.endDate) - daysUntil(c.startDate))
            const done = Math.min(total, Math.max(0, -daysUntil(c.startDate)))
            return (
              <div key={c.id} className={cx('rounded-[18px] p-4 border', p === 'active' ? 'bg-gradient-to-l from-card to-gold-50 border-gold-400/40' : 'bg-card', p === 'finished' && 'opacity-75')}>
                <div className="flex justify-between gap-2 mb-2"><div className="font-extrabold">{c.title}</div><Badge tone={tone}>{label}</Badge></div>
                <div className="text-xs text-ink-muted mb-2">{fmtDate(c.startDate, { day: 'numeric', month: 'short' })} — {fmtDate(c.endDate, { day: 'numeric', month: 'short' })}</div>
                {c.condition && <div className="text-[13px] text-ink-soft mb-1.5">الشرط: {c.condition}</div>}
                {c.prizes && <div className="text-[13px] text-gold-600 font-bold flex gap-1.5"><Icon name="cup-star-bold" className="mt-1" />{c.prizes}</div>}
                {p === 'active' && <div className="mt-3"><Progress value={(done / total) * 100} /><div className="text-[11px] text-ink-muted mt-1">متبقٍ {daysUntil(c.endDate)} يوم</div></div>}
              </div>
            )
          })}
        </div>
      </Async>
      <NewCompetitionSheet open={open} onClose={() => setOpen(false)} />
    </Page>
  )
}

function NewCompetitionSheet({ open, onClose }) {
  const { actor } = useAuth()
  const [f, setF] = useState({ title: '', startDate: todayKey(), endDate: '', condition: '', prizes: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const [save, busy] = useAction(() => createCompetition(f, actor), { success: 'تم إنشاء المسابقة' })
  return (
    <Sheet open={open} title="مسابقة جديدة" onClose={onClose}>
      <Field label="اسم المسابقة" required><Input value={f.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="البداية" required><Input type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="النهاية" required><Input type="date" min={f.startDate} value={f.endDate} onChange={set('endDate')} /></Field>
      </div>
      <Field label="شرط المشاركة"><Input value={f.condition} onChange={set('condition')} /></Field>
      <Field label="الجوائز"><Textarea value={f.prizes} onChange={set('prizes')} /></Field>
      <Button block icon="cup-star-bold" busy={busy} disabled={!f.title.trim() || !f.endDate} onClick={async () => (await save()) && onClose()}>إنشاء</Button>
    </Sheet>
  )
}
