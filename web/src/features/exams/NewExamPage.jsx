// New exam: periodic test (group teacher) or official exam (committee), scope from the mushaf,
// weighted rubric, pass percentage, and the certificate auto-issued to those who pass (official).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Button, Card, EmptyState, Field, Input, PickRow, Section, Segmented, Select, Textarea, Toggle } from '@/components/ui'
import { CERTIFICATE_TYPES } from '@/config/constants'
import { isStaffRole } from '@/config/roles'
import { useAction } from '@/hooks/useAction'
import { DEFAULT_RUBRIC, EXAM_KINDS, createExam } from '@/services/exams'
import { pickToRange } from '@/lib/hifz'
import MushafPicker from '@/features/hifz/MushafPicker'
import { addDays, todayKey } from '@/lib/format'

export default function NewExamPage() {
  const { actor } = useAuth()
  const { groups, teachers } = useData()
  const nav = useNavigate()
  const staff = isStaffRole(actor.role)
  const mine = (groups || []).filter((g) => actor.role !== 'teacher' || g.teacherId === actor.linkedId)
  const [f, setF] = useState({
    kind: 'periodic', title: '', groupId: '', date: todayKey(addDays(3)), time: '10:00', duration: 60,
    scopeOn: true, scopePick: { unit: 'juz', from: 30, to: 30 }, scopeNote: '', passPercent: 60,
    rubric: DEFAULT_RUBRIC.map((c) => ({ ...c, on: true })), committee: [], certificateType: ''
  })
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e })
  const group = mine.find((g) => g.id === (f.groupId || mine[0]?.id))
  const total = f.rubric.filter((c) => c.on).reduce((n, c) => n + (Number(c.max) || 0), 0)
  const scopeRange = f.scopeOn ? pickToRange(f.scopePick) : null
  const [save, busy] = useAction(() => createExam({
    ...f, scopePick: f.scopeOn ? f.scopePick : null, rubric: f.rubric.filter((c) => c.on)
  }, group, actor), { success: 'تمت جدولة الاختبار' })

  if (groups && !mine.length) return <Page title="اختبار جديد"><EmptyState icon="widget-5-bold">لا توجد حلقات مسندة إليك</EmptyState></Page>
  return (
    <Page title="اختبار جديد">
      <Section>
        <Segmented value={f.kind} onChange={(k) => setF({ ...f, kind: k })}
          options={Object.entries(EXAM_KINDS).filter(([k]) => staff || k === 'periodic').map(([k, v]) => [k, v.label])} />
      </Section>
      <Card className="mx-4 p-4">
        <Field label="العنوان" required><Input value={f.title} onChange={set('title')} placeholder={f.kind === 'official' ? 'مثال: امتحان إتمام جزء عمّ' : 'مثال: اختبار الشهر — سورة الملك'} /></Field>
        <Field label="الحلقة"><Select value={group?.id || ''} onChange={set('groupId')}>{mine.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="التاريخ" required><Input type="date" min={todayKey()} value={f.date} onChange={set('date')} /></Field>
          <Field label="الوقت"><Input type="time" value={f.time} onChange={set('time')} /></Field>
          <Field label="المدة (د)"><Select value={f.duration} onChange={set('duration')}>{[15, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>
      </Card>

      <Section title="نطاق الاختبار">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">{f.scopeOn && scopeRange ? `${scopeRange.e - scopeRange.s + 1} آية` : 'بدون تحديد من المصحف'}</span>
            <Toggle checked={f.scopeOn} onChange={(v) => setF({ ...f, scopeOn: v })} />
          </div>
          {f.scopeOn && <MushafPicker value={f.scopePick} onChange={(p) => setF({ ...f, scopePick: p })} />}
          <Field label="ملاحظة على النطاق (اختياري)"><Textarea value={f.scopeNote} onChange={set('scopeNote')} placeholder="مثال: التركيز على المتشابهات" /></Field>
        </Card>
      </Section>

      <Section title={`معايير التقييم — المجموع ${total}`}>
        <Card className="p-4 space-y-2">
          {f.rubric.map((c, i) => (
            <div key={c.key} className="flex items-center gap-3">
              <Toggle checked={c.on} onChange={(v) => setF({ ...f, rubric: f.rubric.map((x, j) => (j === i ? { ...x, on: v } : x)) })} />
              <span className="flex-1 text-sm font-bold">{c.label}</span>
              <Select className="w-24 h-10" disabled={!c.on} value={c.max} onChange={(e) => setF({ ...f, rubric: f.rubric.map((x, j) => (j === i ? { ...x, max: +e.target.value } : x)) })}>
                {[5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          ))}
          <Field label="نسبة النجاح">
            <Select value={f.passPercent} onChange={set('passPercent')}>{[50, 60, 65, 70, 75, 80, 85, 90].map((n) => <option key={n} value={n}>{n}% ({Math.ceil((total * n) / 100)} من {total})</option>)}</Select>
          </Field>
        </Card>
      </Section>

      {f.kind === 'official' && (
        <Section title="لجنة الامتحان والشهادة">
          <Card className="p-4">
            <div className="text-xs font-bold text-ink-soft mb-2">أعضاء اللجنة (يرصدون الدرجات)</div>
            {(teachers || []).map((t) => (
              <PickRow key={t.id} checked={f.committee.includes(t.id)} title={t.name || t.fullName}
                onSelect={() => setF({ ...f, committee: f.committee.includes(t.id) ? f.committee.filter((x) => x !== t.id) : [...f.committee, t.id] })} />
            ))}
            <Field label="شهادة تُصدر تلقائيًا للناجحين">
              <Select value={f.certificateType} onChange={set('certificateType')}>
                <option value="">بدون شهادة</option>
                {CERTIFICATE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </Card>
        </Section>
      )}

      <div className="px-4 mt-4"><Button block icon="check-circle-bold" busy={busy} disabled={!f.title.trim() || !group || !total}
        onClick={async () => (await save()) && nav('/exams', { replace: true })}>حفظ الاختبار</Button></div>
    </Page>
  )
}
