import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Avatar, Badge, Button, Card, Chips, Field, Icon, Input, SearchInput, Section, Segmented, Select, Sheet, StatRow, Textarea, ToggleRow, cx } from '@/components/ui'
import { BEHAVIOR_CATEGORIES, BEHAVIOR_TYPES } from '@/config/constants'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { addBehavior, subscribeBehavior } from '@/services/academic'
import { relTime } from '@/lib/format'

export default function BehaviorPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [rows, setRows] = useState(null)
  const [childId, setChildId] = useState('all')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const canAdd = can(actor.role, 'behavior.record')
  const open = params.get('new') === '1' && canAdd
  useEffect(() => subscribeBehavior(actor, setRows), [actor])

  const scoped = (rows || []).filter((r) => actor.role !== 'parent' || childId === 'all' || r.studentId === childId)
  const pos = scoped.filter((r) => r.points > 0).reduce((n, r) => n + r.points, 0)
  const neg = scoped.filter((r) => r.points < 0).reduce((n, r) => n + r.points, 0)
  const list = scoped.filter((r) => (filter === 'all' || r.type === filter) && (!q || r.studentName.includes(q.trim())))
  const top = useMemo(() => {
    const t = {}
    ;(rows || []).forEach((r) => { t[r.studentId] = t[r.studentId] || { name: r.studentName, pts: 0 }; t[r.studentId].pts += Number(r.points) || 0 })
    return Object.values(t).sort((a, b) => b.pts - a.pts).slice(0, 3)
  }, [rows])

  return (
    <Page title="السلوك" actions={canAdd && <Button size="sm" icon="add-square-bold" onClick={() => setParams({ new: '1' })}>تسجيل</Button>}>
      {actor.role === 'parent' && (students || []).length > 1 && (
        <Chips value={childId} onChange={setChildId} options={[['all', 'كل الأبناء'], ...students.map((s) => [s.id, s.personalInfo.fullName.split(' ')[0]])]} />
      )}
      <StatRow items={[[`+${pos}`, 'نقاط إيجابية', 'ok'], [neg, 'نقاط سلبية', 'bad'], [pos + neg, 'الصافي', 'gold']]} />
      <Chips value={filter} onChange={setFilter} options={[['all', 'الكل'], ...Object.entries(BEHAVIOR_TYPES).map(([k, v]) => [k, v.label])]} />
      {(canAdd || actor.role === 'parent') && <SearchInput value={q} onChange={setQ} placeholder="بحث باسم الطالب…" />}
      <Async data={rows && list} empty="لا توجد سجلات سلوك" emptyIcon="star-bold">
        <Card className="mx-4 px-4 mb-5">
          {list.map((r) => {
            const t = BEHAVIOR_TYPES[r.type] || BEHAVIOR_TYPES.positive
            return (
              <div key={r.id} className="flex gap-3 py-3.5 border-b last:border-0">
                <span className={cx('w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0', { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' }[t.tone])}>
                  <Icon name={r.type === 'positive' ? 'star-bold' : r.type === 'warning' ? 'danger-triangle-bold' : 'close-square-bold'} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{r.studentName}</div>
                  <div className="text-xs text-ink-muted mt-0.5">{r.description}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge tone={r.points >= 0 ? 'ok' : 'bad'}>{r.points > 0 ? '+' : ''}{r.points} نقاط</Badge>
                    <Badge>{r.category}</Badge>
                    <span className="text-[10px] text-ink-muted">{r.teacherName} • {relTime(r.createdAt)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      </Async>
      {canAdd && top.length > 0 && (
        <Section title="أعلى الطلبة نقاطًا">
          <Card className="px-4">{top.map((t, i) => <div key={t.name} className="flex items-center gap-3 py-3 border-b last:border-0"><span className="w-6 text-center">{['🥇', '🥈', '🥉'][i]}</span><Avatar name={t.name} size={34} /><span className="flex-1 text-sm font-bold">{t.name}</span><Badge tone={t.pts >= 0 ? 'ok' : 'bad'}>{t.pts} نقطة</Badge></div>)}</Card>
        </Section>
      )}
      <AddBehaviorSheet open={open} onClose={() => setParams({})} />
    </Page>
  )
}

function AddBehaviorSheet({ open, onClose }) {
  const { actor } = useAuth()
  const { students } = useData()
  const [f, setF] = useState({ studentId: '', type: 'positive', category: BEHAVIOR_CATEGORIES[0], description: '', points: 5, notifyParent: true })
  const student = (students || []).find((s) => s.id === (f.studentId || students?.[0]?.id))
  const [save, busy] = useAction(() => addBehavior({ ...f, student }, actor), { success: 'تم تسجيل السلوك' })
  return (
    <Sheet open={open} title="تسجيل سلوك" onClose={onClose}>
      <Field label="الطالب"><Select value={student?.id || ''} onChange={(e) => setF({ ...f, studentId: e.target.value })}>{(students || []).map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}</Select></Field>
      <Field label="نوع السلوك"><Segmented value={f.type} onChange={(type) => setF({ ...f, type })} options={Object.entries(BEHAVIOR_TYPES).map(([k, v]) => [k, v.label])} /></Field>
      <Field label="التصنيف"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{BEHAVIOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="الوصف" required><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="وصف مختصر" /></Field>
      <Field label="النقاط"><Input type="number" min="1" max="50" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></Field>
      <ToggleRow title="إشعار ولي الأمر" checked={f.notifyParent} onChange={(v) => setF({ ...f, notifyParent: v })} />
      <Button block className="mt-2" icon="check-circle-bold" busy={busy} disabled={!student || !f.description.trim()}
        onClick={async () => { if (await save()) { setF((x) => ({ ...x, description: '' })); onClose() } }}>حفظ</Button>
    </Sheet>
  )
}
