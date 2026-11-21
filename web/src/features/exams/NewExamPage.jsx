import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import { createExam } from '@/services/academic'
import { addDays, todayKey } from '@/lib/format'

export default function NewExamPage() {
  const { actor } = useAuth()
  const { groups } = useData()
  const nav = useNavigate()
  const mine = (groups || []).filter((g) => actor.role !== 'teacher' || g.teacherId === actor.linkedId)
  const [f, setF] = useState({ title: '', groupId: '', date: todayKey(addDays(3)), time: '10:00', duration: 60, scope: '', totalMarks: 100, passMark: 60 })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const group = mine.find((g) => g.id === (f.groupId || mine[0]?.id))
  const [save, busy] = useAction(() => createExam(f, group, actor), { success: 'تمت جدولة الاختبار' })

  if (groups && !mine.length) return <Page title="اختبار جديد"><EmptyState icon="widget-5-bold">لا توجد حلقات مسندة إليك</EmptyState></Page>
  return (
    <Page title="اختبار جديد">
      <Card className="mx-4 p-4">
        <Field label="عنوان الاختبار" required><Input value={f.title} onChange={set('title')} placeholder="مثال: اختبار حفظ الجزء الحادي عشر" /></Field>
        <Field label="الحلقة"><Select value={group?.id || ''} onChange={set('groupId')}>{mine.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="التاريخ" required><Input type="date" min={todayKey()} value={f.date} onChange={set('date')} /></Field>
          <Field label="الوقت"><Input type="time" value={f.time} onChange={set('time')} /></Field>
        </div>
        <Field label="المدة (دقيقة)"><Input type="number" min="15" value={f.duration} onChange={set('duration')} /></Field>
        <Field label="نطاق الاختبار"><Textarea value={f.scope} onChange={set('scope')} placeholder="مثال: سورة هود كاملة + مراجعة يونس" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الدرجة الكلية"><Input type="number" min="10" value={f.totalMarks} onChange={set('totalMarks')} /></Field>
          <Field label="درجة النجاح"><Input type="number" min="1" value={f.passMark} onChange={set('passMark')} /></Field>
        </div>
      </Card>
      <div className="px-4 mt-4"><Button block icon="check-circle-bold" busy={busy} disabled={!f.title.trim() || !group} onClick={async () => (await save()) && nav('/exams', { replace: true })}>حفظ الاختبار</Button></div>
    </Page>
  )
}
