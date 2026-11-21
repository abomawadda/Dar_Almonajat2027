import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Progress, Section, Segmented, Select, Skeleton, Textarea, cx } from '@/components/ui'
import { MASTERY } from '@/config/constants'
import { SURAHS, nextAyahStart, suggestMastery, validateRange } from '@/config/quran'
import { useAction } from '@/hooks/useAction'
import { hifzRecordsFor, recordHifz, todayHifzIds } from '@/services/academic'
import { fmtDate } from '@/lib/format'

const EMPTY = { from: '', to: '', revFrom: '', revTo: '', notes: '', homework: '' }

export default function RecordHifzPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [sid, setSid] = useState('')
  const [type, setType] = useState('new')
  const [surah, setSurah] = useState('الفاتحة')
  const [revSurah, setRevSurah] = useState('الفاتحة')
  const [f, setF] = useState({ ...EMPTY, repetitions: 5 })
  const [hifzMistakes, setHifzMistakes] = useState(0)
  const [tajweedMistakes, setTajweedMistakes] = useState(0)
  const [mastery, setMastery] = useState('excellent')
  const [doneIds, setDoneIds] = useState(() => new Set())
  const [lastRec, setLastRec] = useState(null)

  const student = (students || []).find((s) => s.id === (sid || students?.[0]?.id))

  useEffect(() => {
    let cancelled = false
    todayHifzIds(actor).then((ids) => { if (!cancelled) setDoneIds(new Set(ids)) }).catch(() => {})
    return () => { cancelled = true }
  }, [actor])

  useEffect(() => {
    if (!student?.id) return
    let cancelled = false
    setLastRec(null)
    setHifzMistakes(0)
    setTajweedMistakes(0)
    setMastery('excellent')

    const fallbackNew = student.academicInfo?.lastHifz
    const startFallback = nextAyahStart(fallbackNew?.surahName, fallbackNew?.toAyah)
    setSurah(startFallback.surah)
    setF((x) => ({ ...EMPTY, from: String(startFallback.from), repetitions: x.repetitions || 5 }))

    hifzRecordsFor(student.id).then((recs) => {
      if (cancelled) return
      const latest = recs[0] || null
      const latestNew = recs.find((r) => r.newMemorization) || null
      const latestRev = recs.find((r) => r.revision) || null
      setLastRec(latest)
      const mem = latestNew?.newMemorization || fallbackNew
      if (mem) {
        const next = nextAyahStart(mem.surahName, mem.toAyah)
        setSurah(next.surah)
        setF((x) => ({ ...EMPTY, from: String(next.from), repetitions: x.repetitions || 5 }))
      }
      if (latestRev?.revision?.surahName) {
        setRevSurah(latestRev.revision.surahName)
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasNew = type === 'new' || type === 'both'
  const hasRev = type === 'revision' || type === 'both'
  const newRange = useMemo(() => validateRange(surah, parseInt(f.from, 10), parseInt(f.to, 10)), [surah, f.from, f.to])
  const revRange = useMemo(() => validateRange(revSurah, parseInt(f.revFrom, 10), parseInt(f.revTo, 10)), [revSurah, f.revFrom, f.revTo])
  const canSave = (hasNew ? newRange.ok : true) && (hasRev ? revRange.ok : true)

  const updateMistake = (kind, delta) => {
    const nextHifz = kind === 'hifz' ? Math.max(0, hifzMistakes + delta) : hifzMistakes
    const nextTajweed = kind === 'tajweed' ? Math.max(0, tajweedMistakes + delta) : tajweedMistakes
    setHifzMistakes(nextHifz)
    setTajweedMistakes(nextTajweed)
    setMastery(suggestMastery(nextHifz, nextTajweed))
  }

  const nextStudent = (done = doneIds) => {
    if (!students?.length || !student) return
    const curIdx = students.findIndex((s) => s.id === student.id)
    for (let step = 1; step <= students.length; step++) {
      const cand = students[(curIdx + step) % students.length]
      if (!done.has(cand.id)) {
        setSid(cand.id)
        return
      }
    }
    setSid(students[(curIdx + 1) % students.length].id)
  }

  const [save, busy] = useAction(
    () => recordHifz({
      student,
      type,
      surah,
      from: parseInt(f.from, 10),
      to: parseInt(f.to, 10),
      revSurah,
      revFrom: parseInt(f.revFrom, 10),
      revTo: parseInt(f.revTo, 10),
      repetitions: parseInt(f.repetitions, 10),
      mastery,
      hifzMistakes,
      tajweedMistakes,
      homework: f.homework,
      notes: f.notes
    }, actor),
    { success: (n) => `حُفظ التسميع (${n} آية)${student?.parentId ? ' وأُشعر ولي الأمر' : ''}` }
  )

  if (!students) return <Page title="تسجيل تسميع"><Skeleton rows={5} /></Page>
  if (!students.length) return <Page title="تسجيل تسميع"><EmptyState icon="users-group-rounded-bold">لا يوجد طلبة</EmptyState></Page>

  const doneCount = students.filter((s) => doneIds.has(s.id)).length
  const hwText = lastRec?.homework || student.academicInfo?.lastHomework
  const lastMem = lastRec?.newMemorization || lastRec?.revision || student.academicInfo?.lastHifz
  const lastMastery = lastRec?.masteryLevel || lastMem?.masteryLevel || student.academicInfo?.lastMastery
  const lastDate = lastRec?.date || lastMem?.date || student.academicInfo?.lastSession

  return (
    <Page title="تسجيل تسميع">
      <div className="px-4 mb-3">
        <Card className="p-3">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-ink-soft">تم التسميع اليوم: {doneCount} من {students.length} طالب</span>
            <span className="text-gold-600">{Math.round((doneCount / students.length) * 100)}%</span>
          </div>
          <Progress value={(doneCount / students.length) * 100} />
        </Card>
      </div>

      <Section>
        <Field label="الطالب">
          <Select value={student.id} onChange={(e) => setSid(e.target.value)}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {doneIds.has(s.id) ? '✓ ' : ''}{s.personalInfo.fullName} — {s.academicInfo?.groupName}
              </option>
            ))}
          </Select>
        </Field>
        {(lastMem || hwText) && (
          <div className="mb-3 p-3 rounded-2xl bg-gold-50 border border-gold-400/30 text-xs space-y-1">
            {lastMem && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gold-600">
                  آخر تسميع: {lastMem.surahName} {lastMem.fromAyah}–{lastMem.toAyah}
                  {lastDate ? ` (${fmtDate(lastDate, { day: 'numeric', month: 'short' })})` : ''}
                </span>
                {lastMastery && <Badge tone={lastMastery === 'excellent' ? 'ok' : lastMastery === 'weak' ? 'bad' : 'gold'}>{MASTERY[lastMastery]}</Badge>}
              </div>
            )}
            {hwText && (
              <div className="text-ink-soft leading-6">
                <b className="text-ink">الواجب المطلوب اليوم:</b> {hwText}
              </div>
            )}
          </div>
        )}
        <Segmented value={type} onChange={setType} options={[['new', 'حفظ جديد'], ['both', 'حفظ + مراجعة'], ['revision', 'مراجعة']]} />
      </Section>

      <Card className="mx-4 p-4">
        {hasNew && (
          <div className={cx(hasRev && 'pb-3 mb-3 border-b')}>
            {type === 'both' && <div className="text-xs font-extrabold text-gold-600 mb-2">الحفظ الجديد</div>}
            <Field label="السورة">
              <Select value={surah} onChange={(e) => setSurah(e.target.value)}>
                {SURAHS.map((s) => <option key={s.n} value={s.name}>{s.n}. {s.name} ({s.ayahs} آية)</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من آية"><Input type="number" inputMode="numeric" min="1" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <Field label="إلى آية"><Input type="number" inputMode="numeric" min="1" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
            </div>
            {f.from && f.to && (
              <div className={cx('text-center text-sm font-bold rounded-xl py-2 mb-3', newRange.ok ? 'bg-gold-50 text-gold-600' : 'bg-bad-soft text-bad')}>
                {newRange.ok ? `عدد آيات الحفظ: ${newRange.count}` : newRange.error}
              </div>
            )}
            <Field label="عدد التكرارات"><Input type="number" min="1" value={f.repetitions} onChange={(e) => setF({ ...f, repetitions: e.target.value })} /></Field>
          </div>
        )}

        {hasRev && (
          <div className={cx(hasNew && 'pb-2 mb-3 border-b')}>
            {type === 'both' && <div className="text-xs font-extrabold text-info mb-2">المراجعة</div>}
            <Field label={type === 'both' ? 'سورة المراجعة' : 'السورة'}>
              <Select value={revSurah} onChange={(e) => setRevSurah(e.target.value)}>
                {SURAHS.map((s) => <option key={s.n} value={s.name}>{s.n}. {s.name} ({s.ayahs} آية)</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من آية"><Input type="number" inputMode="numeric" min="1" value={f.revFrom} onChange={(e) => setF({ ...f, revFrom: e.target.value })} /></Field>
              <Field label="إلى آية"><Input type="number" inputMode="numeric" min="1" value={f.revTo} onChange={(e) => setF({ ...f, revTo: e.target.value })} /></Field>
            </div>
            {f.revFrom && f.revTo && (
              <div className={cx('text-center text-sm font-bold rounded-xl py-2 mb-3', revRange.ok ? 'bg-info-soft text-info' : 'bg-bad-soft text-bad')}>
                {revRange.ok ? `عدد آيات المراجعة: ${revRange.count}` : revRange.error}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <MistakeCounter label="أخطاء الحفظ والتردد" value={hifzMistakes} onChange={(d) => updateMistake('hifz', d)} />
          <MistakeCounter label="أخطاء التجويد" value={tajweedMistakes} onChange={(d) => updateMistake('tajweed', d)} />
        </div>

        <Field label="مستوى الإتقان (يُقترح تلقائيًا من الأخطاء)">
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(MASTERY).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMastery(k)}
                className={cx('h-10 rounded-xl text-[13px] font-bold border transition', mastery === k ? { excellent: 'bg-ok-soft text-ok border-ok/30', good: 'bg-gold-50 text-gold-600 border-gold-400/40', average: 'bg-info-soft text-info border-info/30', weak: 'bg-bad-soft text-bad border-bad/30' }[k] : 'bg-field text-ink-muted border-transparent')}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label="ملاحظات المعلم"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="ملاحظاتك على أداء الطالب" /></Field>
        <Field label="الواجب"><Input value={f.homework} onChange={(e) => setF({ ...f, homework: e.target.value })} placeholder="مثال: مراجعة هود ١–٣٩ + حفظ ٧١–١٠٠" /></Field>
      </Card>

      <div className="flex gap-2.5 px-4 mt-4">
        <Button className="flex-1" icon="check-circle-bold" busy={busy} disabled={!canSave}
          onClick={async () => {
            if (await save()) {
              const nextSet = new Set(doneIds)
              nextSet.add(student.id)
              setDoneIds(nextSet)
              nextStudent(nextSet)
            }
          }}>حفظ التسميع</Button>
        <Button variant="secondary" onClick={() => nextStudent()}>الطالب التالي</Button>
      </div>
    </Page>
  )
}

function MistakeCounter({ label, value, onChange }) {
  return (
    <div className="bg-field rounded-xl p-2.5 text-center">
      <div className="text-[11px] font-bold text-ink-soft mb-1.5">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label={`إنقاص ${label}`} onClick={() => onChange(-1)}
          className="w-8 h-8 rounded-lg bg-card border font-extrabold text-ink-soft active:bg-paper">-</button>
        <span className={cx('text-base font-extrabold min-w-[24px]', value > 0 ? 'text-bad' : 'text-ok')}>{value}</span>
        <button type="button" aria-label={`زيادة ${label}`} onClick={() => onChange(1)}
          className="w-8 h-8 rounded-lg bg-card border font-extrabold text-bad active:bg-bad-soft">+</button>
      </div>
    </div>
  )
}
