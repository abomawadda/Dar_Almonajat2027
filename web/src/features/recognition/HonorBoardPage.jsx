// لوحة الشرف والنقاط: ranking by month / all-time and by group, the viewer's own points and ledger,
// manual awards (staff/teachers) and the point rules (admin).
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Button, Card, Chips, EmptyState, Field, Input, ListItem, Section, Select, Skeleton, cx } from '@/components/ui'
import { MASTERY, ATTENDANCE } from '@/config/constants'
import { isStaffRole } from '@/config/roles'
import { useAction } from '@/hooks/useAction'
import { POINT_SOURCES, getPointRules, ledgerFor, levelOf, manualPoints, rankBalances, resetPointRulesCache, savePointRules, subscribeBalances } from '@/services/points'
import { recordScope } from '@/services/scope'
import { addDays, fmtDate, todayKey } from '@/lib/format'

const MEDAL = ['🥇', '🥈', '🥉']

export default function HonorBoardPage() {
  const { actor } = useAuth()
  const { students, groups } = useData()
  const [balances, setBalances] = useState(null)
  const thisMonth = todayKey().slice(0, 7)
  const lastMonth = todayKey(addDays(-new Date().getDate())).slice(0, 7)
  const [period, setPeriod] = useState(thisMonth)
  const [groupId, setGroupId] = useState('')
  const canAward = isStaffRole(actor.role) || actor.role === 'teacher'
  const mine = actor.role === 'student' || actor.role === 'parent'

  useEffect(() => subscribeBalances(setBalances), [])
  const ranked = useMemo(() => rankBalances(balances, { period, groupId }), [balances, period, groupId])

  if (!balances || !students) return <Page title="لوحة الشرف"><Skeleton rows={5} /></Page>

  return (
    <Page title="لوحة الشرف">
      {mine && students.map((s) => <MyPoints key={s.id} student={s} balance={balances.find((b) => b.studentId === s.id)} actor={actor} />)}

      <Chips value={period} onChange={setPeriod} options={[[thisMonth, 'هذا الشهر'], [lastMonth, 'الشهر الماضي'], ['all', 'كل الأوقات']]} />
      {(groups || []).length > 1 && (
        <Section>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">كل الحلقات</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Section>
      )}

      <Section>
        {!ranked.length ? <EmptyState icon="medal-ribbons-star-bold">لا توجد نقاط في هذه الفترة بعد</EmptyState> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3 items-end">
              {[1, 0, 2].map((i) => ranked[i] && (
                <Card key={ranked[i].studentId} className={cx('p-3 text-center', i === 0 && 'border-gold-400/60 bg-gold-50')}>
                  <div className="text-2xl">{MEDAL[ranked[i].rank - 1] || ranked[i].rank}</div>
                  <div className="flex justify-center my-1"><Avatar name={ranked[i].studentName} size={i === 0 ? 52 : 42} /></div>
                  <div className="text-xs font-extrabold leading-5 line-clamp-2">{ranked[i].studentName}</div>
                  <div className="text-[11px] text-ink-muted">{ranked[i].groupName}</div>
                  <div className="text-sm font-extrabold text-gold-600 mt-1">{ranked[i].score} نقطة</div>
                </Card>
              ))}
            </div>
            <Card>
              {ranked.slice(3, 30).map((x) => (
                <ListItem key={x.studentId} leading={<span className="w-7 text-center font-extrabold text-ink-muted">{x.rank}</span>}
                  title={x.studentName} subtitle={`${x.groupName || ''} • ${levelOf(x.balance)}`}
                  trailing={<b className="text-gold-600">{x.score}</b>} />
              ))}
            </Card>
          </>
        )}
      </Section>

      {canAward && <ManualPoints students={students} actor={actor} />}
      {actor.role === 'admin' && <RulesEditor />}
    </Page>
  )
}

function MyPoints({ student, balance, actor }) {
  const [ledger, setLedger] = useState(null)
  useEffect(() => {
    const scope = recordScope(actor, { teacherField: null }).where || []
    ledgerFor(student.id, scope).then(setLedger).catch(() => setLedger([]))
  }, [student.id, actor])
  const b = Number(balance?.balance) || 0
  return (
    <Section title={student.personalInfo.fullName}>
      <Card className="p-4">
        <div className="grid grid-cols-3 text-center bg-field rounded-2xl py-3 mb-3">
          <div><div className="text-xl font-extrabold text-gold-600">{b}</div><div className="text-[11px] text-ink-muted">رصيد النقاط</div></div>
          <div><div className="text-xl font-extrabold text-ok">{Number(balance?.months?.[todayKey().slice(0, 7)]) || 0}</div><div className="text-[11px] text-ink-muted">هذا الشهر</div></div>
          <div><div className="text-sm font-extrabold text-info mt-1">{levelOf(b)}</div><div className="text-[11px] text-ink-muted">المستوى</div></div>
        </div>
        {!ledger ? <Skeleton rows={2} /> : ledger.slice(0, 8).map((e) => (
          <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
            <span className="text-ink-soft"><Badge>{POINT_SOURCES[e.source] || e.source}</Badge> {e.reason}</span>
            <b className={e.delta > 0 ? 'text-ok' : 'text-bad'}>{e.delta > 0 ? '+' : ''}{e.delta}</b>
          </div>
        ))}
      </Card>
    </Section>
  )
}

function ManualPoints({ students, actor }) {
  const [f, setF] = useState({ sid: '', delta: 5, reason: '' })
  const student = students.find((s) => s.id === (f.sid || students[0]?.id))
  const [give, busy] = useAction(async () => { await manualPoints({ student, delta: +f.delta, reason: f.reason }, actor); setF({ ...f, reason: '' }) },
    { success: 'سُجّلت النقاط' })
  if (!students.length) return null
  return (
    <Section title="منح / خصم نقاط">
      <Card className="p-4">
        <Field label="الطالب">
          <Select value={student?.id} onChange={(e) => setF({ ...f, sid: e.target.value })}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="النقاط">
            <Select value={f.delta} onChange={(e) => setF({ ...f, delta: e.target.value })}>
              {[20, 10, 5, 3, 1, -1, -3, -5, -10].map((n) => <option key={n} value={n}>{n > 0 ? '+' : ''}{n}</option>)}
            </Select>
          </Field>
          <div className="col-span-2"><Field label="السبب"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="مثال: مساعدة زملائه" /></Field></div>
        </div>
        <Button block icon="star-bold" busy={busy} onClick={give}>تسجيل</Button>
      </Card>
    </Section>
  )
}

function RulesEditor() {
  const [r, setR] = useState(null)
  useEffect(() => { resetPointRulesCache(); getPointRules().then(setR) }, [])
  const [save, busy] = useAction(() => savePointRules(r), { success: 'حُفظت قواعد النقاط' })
  if (!r) return null
  const num = (v) => Math.round(Number(v) || 0)
  return (
    <Section title="قواعد النقاط">
      <Card className="p-4">
        <div className="text-xs font-extrabold text-gold-600 mb-2">التسميع (لكل مقطع: جديد/قريب/بعيد)</div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(MASTERY).map(([k, l]) => (
            <Field key={k} label={l}><Input type="number" value={r.hifz[k]} onChange={(e) => setR({ ...r, hifz: { ...r.hifz, [k]: num(e.target.value) } })} /></Field>
          ))}
        </div>
        <div className="text-xs font-extrabold text-ok mb-2">الحضور</div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(ATTENDANCE).map(([k, v]) => (
            <Field key={k} label={v.label}><Input type="number" value={r.attendance[k]} onChange={(e) => setR({ ...r, attendance: { ...r.attendance, [k]: num(e.target.value) } })} /></Field>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="إتمام جزء"><Input type="number" value={r.juzComplete} onChange={(e) => setR({ ...r, juzComplete: num(e.target.value) })} /></Field>
          <Field label="جديد مُعاد"><Input type="number" value={r.repeat} onChange={(e) => setR({ ...r, repeat: num(e.target.value) })} /></Field>
          <Field label="تنبيه غياب متتالٍ"><Input type="number" min="2" value={r.absenceStreak} onChange={(e) => setR({ ...r, absenceStreak: num(e.target.value) })} /></Field>
        </div>
        <Button block icon="check-circle-bold" busy={busy} onClick={save}>حفظ القواعد</Button>
      </Card>
    </Section>
  )
}
