// Excuse requests: parents submit with an optional attachment; teacher/staff review.
import { useEffect, useState } from 'react'
import { Badge, Button, Card, Field, Input, Section, Select, Sheet, Textarea } from '@/components/ui'
import { EXCUSE_REASONS, EXCUSE_STATUS } from '@/config/constants'
import { useAction } from '@/hooks/useAction'
import { decideExcuse, submitExcuseRequest, subscribeExcuses, MAX_EXCUSE_DAYS } from '@/services/excuses'
import { checkFile, uploadFile } from '@/lib/files'
import { addDays, todayKey } from '@/lib/format'

export function useExcuses(actor) {
  const [rows, setRows] = useState(null)
  useEffect(() => subscribeExcuses(actor, setRows), [actor])
  return rows
}

const period = (e) => (e.fromDate === e.toDate ? e.fromDate : `${e.fromDate} ← ${e.toDate} (${e.days} أيام)`)

function Attachment({ a }) {
  if (!a?.url) return null
  return <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-info underline">📎 {a.name || 'المرفق'}</a>
}

export function ExcuseItem({ e, actions }) {
  const st = EXCUSE_STATUS[e.status] || {}
  return (
    <div className="py-3 border-b last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{e.studentName}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="text-xs text-ink-soft mt-1 leading-5">{period(e)} • {e.reason}{e.note ? ` — ${e.note}` : ''}</div>
      <div className="flex items-center justify-between gap-2 mt-1"><Attachment a={e.attachment} />{e.decisionNote && <span className="text-[11px] text-ink-muted">{e.decisionNote}</span>}</div>
      {actions}
    </div>
  )
}

/** Teacher / staff: pending excuses with approve / reject. */
export function ExcuseReview({ rows, actor }) {
  const pending = (rows || []).filter((e) => e.status === 'pending')
  const [notes, setNotes] = useState({})
  const [decide, busy] = useAction((e, ok) => decideExcuse(e, ok, notes[e.id], actor), { success: 'تم' })
  if (!pending.length) return null
  return (
    <Section title={`أعذار بانتظار الموافقة (${pending.length})`}>
      <Card className="px-3">
        {pending.map((e) => (
          <ExcuseItem key={e.id} e={e} actions={(
            <div className="mt-2 space-y-2">
              <Input placeholder="ملاحظة (اختياري)" value={notes[e.id] || ''} onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })} className="h-9 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" icon="check-circle-bold" busy={busy} onClick={() => decide(e, true)}>قبول</Button>
                <Button size="sm" variant="secondary" busy={busy} onClick={() => decide(e, false)}>رفض</Button>
              </div>
            </div>
          )} />
        ))}
      </Card>
    </Section>
  )
}

/** Parent: new excuse request (date range + reason + optional image/PDF). */
export function ExcuseRequestSheet({ open, students, actor, onClose }) {
  const [f, setF] = useState({ sid: '', from: todayKey(), to: todayKey(), reason: EXCUSE_REASONS[0], note: '' })
  const [file, setFile] = useState(null)
  const [fileErr, setFileErr] = useState('')
  const student = students.find((s) => s.id === (f.sid || students[0]?.id))
  const [save, busy] = useAction(async () => {
    const attachment = file ? await uploadFile(`excuses/${actor.uid}`, file) : null
    await submitExcuseRequest({ student, fromDate: f.from, toDate: f.to, reason: f.reason, note: f.note, attachment }, actor)
  }, { success: 'تم إرسال العذر للمحفظ' })

  return (
    <Sheet open={open} title="تقديم عذر غياب" onClose={onClose}>
      {students.length > 1 && (
        <Field label="الابن">
          <Select value={student?.id || ''} onChange={(e) => setF({ ...f, sid: e.target.value })}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="من تاريخ" required><Input type="date" min={todayKey(addDays(-7))} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></Field>
        <Field label="إلى تاريخ"><Input type="date" min={f.from} max={todayKey(addDays(MAX_EXCUSE_DAYS - 1, new Date(f.from + 'T12:00:00')))} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      <Field label="السبب" required>
        <Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{EXCUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
      </Field>
      <Field label="تفاصيل (اختياري)"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="أي توضيح للمحفظ…" /></Field>
      <Field label="مرفق (تقرير طبي أو صورة — اختياري)" error={fileErr}>
        <input type="file" accept="image/*,application/pdf" className="block w-full text-xs"
          onChange={(e) => { const x = e.target.files?.[0] || null; const err = checkFile(x); setFileErr(err || ''); setFile(err ? null : x) }} />
      </Field>
      <Button block icon="check-circle-bold" busy={busy} disabled={!student}
        onClick={async () => { if (await save()) { setF({ ...f, note: '' }); setFile(null); onClose() } }}>إرسال العذر</Button>
    </Sheet>
  )
}
