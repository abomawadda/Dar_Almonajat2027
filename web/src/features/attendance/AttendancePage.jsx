import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Avatar, Badge, Button, Card, Chips, EmptyState, Field, Icon, Input, ListItem, Select, Sheet, Skeleton, StatRow, Textarea, cx } from '@/components/ui'
import { ATTENDANCE, EXCUSE_REASONS } from '@/config/constants'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { attendanceHistory, loadAttendanceDay, saveAttendanceDay, submitExcuse } from '@/services/academic'
import { fmtDate, todayKey } from '@/lib/format'

export default function AttendancePage() {
  const { actor } = useAuth()
  return can(actor.role, 'attendance.record') ? <RecordAttendance /> : <AttendanceHistory />
}

function RecordAttendance() {
  const { actor } = useAuth()
  const { students, groups } = useData()
  const myGroups = useMemo(() => (groups || []).filter((g) => actor.role !== 'teacher' || g.teacherId === actor.linkedId), [groups, actor])
  const [date, setDate] = useState(todayKey())
  const [groupId, setGroupId] = useState('')
  const [day, setDay] = useState(null) // { marks, excuses, saved }
  const gid = groupId || myGroups[0]?.id
  const group = myGroups.find((g) => g.id === gid)
  const roster = (students || []).filter((s) => s.academicInfo?.groupId === gid)

  useEffect(() => {
    if (!gid) return
    setDay(null)
    loadAttendanceDay(gid, date).then(setDay).catch(() => setDay({ marks: {}, excuses: {}, saved: false }))
  }, [gid, date])

  const marks = day?.marks || {}
  const excuses = day?.excuses || {}
  const statusOf = (id) => marks[id] || 'present'
  const counts = Object.fromEntries(Object.keys(ATTENDANCE).map((k) => [k, roster.filter((s) => statusOf(s.id) === k).length]))
  const [save, busy] = useAction(() => saveAttendanceDay({ group, date, students: roster, marks, excuses, alreadySaved: day.saved }, actor), { success: (n) => `تم حفظ حضور ${n} طالب` })

  if (!groups || !students) return <Page title="حضور الطلبة"><Skeleton rows={4} /></Page>
  if (!myGroups.length) return <Page title="حضور الطلبة"><EmptyState icon="widget-5-bold">لا توجد حلقات مسندة إليك</EmptyState></Page>

  return (
    <Page title="حضور الطلبة">
      <div className="grid grid-cols-2 gap-2 px-4 mb-3">
        <Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className="h-11 text-[13px]" />
        <Select value={gid} onChange={(e) => setGroupId(e.target.value)} className="h-11 text-[13px]">{myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
      </div>
      {day?.saved && <div className="mx-4 mb-3 px-3 py-2.5 rounded-xl bg-ok-soft text-ok text-xs font-bold flex items-center gap-1.5"><Icon name="cloud-check-bold" />سُجّل حضور هذا اليوم — أي تعديل يُحدّث السجل</div>}
      <StatRow items={Object.entries(ATTENDANCE).map(([k, v]) => [counts[k], v.label, v.tone])} />
      {!day ? <Skeleton /> : roster.length ? (
        <>
          <Card className="mx-4 px-3">
            {roster.map((s) => {
              const ex = excuses[s.id]
              return (
                <div key={s.id} className="py-3 border-b last:border-0">
                  <div className="flex items-center gap-2.5 mb-2"><Avatar name={s.personalInfo.fullName} size={34} /><span className="text-sm font-bold flex-1 truncate">{s.personalInfo.fullName}</span></div>
                  {ex && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-info-soft text-info text-[11.5px] font-bold">
                      عذر من ولي الأمر: {ex.reason}{ex.note ? ` — ${ex.note}` : ''}
                    </div>
                  )}
                  <div className="flex bg-field rounded-xl p-0.5 gap-0.5">
                    {Object.entries(ATTENDANCE).map(([k, v]) => (
                      <button key={k} onClick={() => setDay((d) => ({ ...d, marks: { ...d.marks, [s.id]: k } }))}
                        className={cx('flex-1 h-9 rounded-[10px] text-xs font-bold transition', statusOf(s.id) === k ? 'bg-card shadow-card ' + { ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', info: 'text-info' }[v.tone] : 'text-ink-muted')}>{v.label}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </Card>
          <div className="px-4 mt-4"><Button block icon="check-circle-bold" busy={busy} onClick={async () => (await save()) && setDay((d) => ({ ...d, saved: true }))}>حفظ سجل الحضور ({roster.length})</Button></div>
        </>
      ) : <EmptyState icon="users-group-rounded-bold">لا يوجد طلبة في هذه الحلقة</EmptyState>}
    </Page>
  )
}

function AttendanceHistory() {
  const { actor } = useAuth()
  const { students } = useData()
  const [rows, setRows] = useState(null)
  const [childId, setChildId] = useState('all')
  const [excuseOpen, setExcuseOpen] = useState(false)

  const load = useCallback(() => {
    attendanceHistory(actor).then(setRows).catch(() => setRows([]))
  }, [actor])

  useEffect(load, [load])

  const filtered = (rows || []).filter((r) => actor.role !== 'parent' || childId === 'all' || r.studentId === childId)
  const present = filtered.filter((r) => r.status === 'present' || r.status === 'late').length
  const canExcuse = actor.role === 'parent' && (students || []).length > 0

  return (
    <Page
      title={actor.role === 'student' ? 'حضوري' : 'حضور الأبناء'}
      actions={canExcuse && <Button size="sm" icon="calendar-add-bold" onClick={() => setExcuseOpen(true)}>إبلاغ عن عذر</Button>}
    >
      {actor.role === 'parent' && (students || []).length > 1 && (
        <Chips
          value={childId}
          onChange={setChildId}
          options={[['all', 'كل الأبناء'], ...students.map((s) => [s.id, s.personalInfo.fullName.split(' ')[0]])]}
        />
      )}
      {rows && <StatRow items={[[filtered.length ? `${Math.round((present / filtered.length) * 100)}%` : '—', 'نسبة الحضور', 'ok'], [filtered.length, 'يوم مسجل'], [filtered.filter((r) => r.status === 'absent').length, 'غياب', 'bad']]} />}
      <Async data={rows && filtered} empty="لم يُسجل حضور بعد" emptyIcon="calendar-bold">
        <Card className="mx-4 px-4">
          {filtered.slice(0, 90).map((r) => (
            <ListItem
              key={r.id}
              title={fmtDate(r.date)}
              subtitle={[r.studentName, r.groupName, r.excuseReason ? `العذر: ${r.excuseReason}` : ''].filter(Boolean).join(' • ')}
              trailing={<Badge tone={ATTENDANCE[r.status]?.tone}>{ATTENDANCE[r.status]?.label}</Badge>}
            />
          ))}
        </Card>
      </Async>
      {canExcuse && <ExcuseSheet open={excuseOpen} students={students} actor={actor} onClose={() => setExcuseOpen(false)} onSaved={load} />}
    </Page>
  )
}

function ExcuseSheet({ open, students, actor, onClose, onSaved }) {
  const [studentId, setStudentId] = useState('')
  const [date, setDate] = useState(todayKey())
  const [reason, setReason] = useState(EXCUSE_REASONS[0])
  const [note, setNote] = useState('')
  const student = students.find((s) => s.id === (studentId || students[0]?.id))
  const [save, busy] = useAction(() => submitExcuse({ student, date, reason, note }, actor), { success: 'تم إرسال الاستئذان للمحفظ' })

  return (
    <Sheet open={open} title="إبلاغ عن غياب بعذر" onClose={onClose}>
      {students.length > 1 ? (
        <Field label="الابن">
          <Select value={student?.id || ''} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}
          </Select>
        </Field>
      ) : (
        <div className="mb-3.5 px-3 py-2.5 rounded-xl bg-field text-sm font-bold">{student?.personalInfo.fullName}</div>
      )}
      <Field label="التاريخ" required><Input type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="سبب الاستئذان" required>
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {EXCUSE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label="تفاصيل إضافية (اختياري)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="أي توضيح للمحفظ…" /></Field>
      <Button block icon="check-circle-bold" busy={busy} disabled={!student || !date}
        onClick={async () => { if (await save()) { setNote(''); onSaved(); onClose() } }}>إرسال العذر</Button>
    </Sheet>
  )
}
