// Daily recitation. The teacher assigns tomorrow's portions (الجديد / الماضي القريب / الماضي البعيد)
// at the end of each session; the next session opens with those portions preloaded. Every portion is
// chosen from mushaf lists (juz / hizb / surah / ayahs) — nothing is typed by hand.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, EmptyState, Field, Input, Progress, Section, Select, Skeleton, Textarea, Toggle, cx } from '@/components/ui'
import { MASTERY } from '@/config/constants'
import { SURAHS, suggestMastery } from '@/config/quran'
import { addRange, pickLabel, pickToRange, planOf, rangeToPick, suggestFar, suggestNear, suggestNew } from '@/lib/hifz'
import { useAction } from '@/hooks/useAction'
import { HIFZ_TRACKS, getHifzProgress, hifzRecordsFor, recordHifz, todayHifzIds } from '@/services/academic'
import { fmtDate } from '@/lib/format'
import MushafPicker from './MushafPicker'

const TRACK_TONE = { new: 'text-gold-600', near: 'text-ok', far: 'text-info' }
const KEYS = ['new', 'near', 'far']
const fromSuggestion = (sg) => (sg ? { unit: 'ayahs', surah: suggestionSurahNo(sg.surah), from: sg.from, to: sg.to } : null)
function suggestionSurahNo(name) { return SURAHS.findIndex((s) => s.name === name) + 1 }

/** Today's portions: the teacher's assignment first, otherwise the plan's suggestion for الجديد only. */
function todayTracks(p) {
  const a = p?.assignment || {}
  const t = {}
  for (const k of KEYS) {
    if (a[k]) { t[k] = { on: true, pick: a[k], assigned: true }; continue }
    const def = k === 'new' ? fromSuggestion(suggestNew(p)) : rangeToPick(k === 'near' ? suggestNear(p) : suggestFar(p))
    t[k] = { on: k === 'new' && !!def, pick: def, assigned: false }
  }
  return t
}

/** Defaults for tomorrow, taking today's accepted new portion into account. */
function tomorrowTracks(p, today) {
  const after = { ...(p || {}), pendingRepeat: null }
  const nr = today.new?.on && pickToRange(today.new.pick)
  if (nr) { after.ranges = addRange(after.ranges, nr); after.lastNew = nr }
  return {
    new: { on: true, pick: fromSuggestion(suggestNew(after)) },
    near: { on: false, pick: rangeToPick(suggestNear(after)) },
    far: { on: false, pick: rangeToPick(suggestFar(after)) }
  }
}

export default function RecordHifzPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [sid, setSid] = useState('')
  const [progress, setProgress] = useState(null)
  const [today, setToday] = useState(null)
  const [next, setNext] = useState(null)
  const [f, setF] = useState({ notes: '', homework: '', repetitions: 5 })
  const [mist, setMist] = useState({ hifz: 0, tajweed: 0, tashkeel: 0 })
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
    setProgress(null); setToday(null); setNext(null); setLastRec(null)
    setMist({ hifz: 0, tajweed: 0, tashkeel: 0 })
    setMastery('excellent')
    setF((x) => ({ notes: '', homework: '', repetitions: x.repetitions || 5 }))
    Promise.all([getHifzProgress(student.id), hifzRecordsFor(student.id)]).then(([p, recs]) => {
      if (cancelled) return
      const prog = p || {}
      const t = todayTracks(prog)
      setProgress(prog); setLastRec(recs[0] || null); setToday(t); setNext(tomorrowTracks(prog, t))
    }).catch(() => { if (!cancelled) { setProgress({}); setToday(todayTracks({})); setNext(tomorrowTracks({}, {})) } })
    return () => { cancelled = true }
  }, [student?.id])

  // keep tomorrow's "new" in step with today's new portion
  const todayNewKey = today?.new?.on ? JSON.stringify(today.new.pick) : ''
  useEffect(() => {
    if (!progress || !today) return
    setNext((n) => n && ({ ...n, new: { ...n.new, pick: tomorrowTracks(progress, today).new.pick } }))
  }, [todayNewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = planOf(progress)
  const willRepeat = today?.new?.on && mist.hifz > plan.maxNewMistakes
  const canSave = useMemo(() => {
    if (!today) return false
    const on = KEYS.filter((k) => today[k].on)
    return on.length > 0 && on.every((k) => pickToRange(today[k].pick)) && KEYS.every((k) => !next?.[k]?.on || pickToRange(next[k].pick))
  }, [today, next])

  const updateMistake = (kind, delta) => {
    const m = { ...mist, [kind]: Math.max(0, mist[kind] + delta) }
    setMist(m)
    setMastery(suggestMastery(m.hifz, m.tajweed + m.tashkeel))
  }

  const nextStudent = (done = doneIds) => {
    if (!students?.length || !student) return
    const curIdx = students.findIndex((s) => s.id === student.id)
    for (let step = 1; step <= students.length; step++) {
      const cand = students[(curIdx + step) % students.length]
      if (!done.has(cand.id)) { setSid(cand.id); return }
    }
    setSid(students[(curIdx + 1) % students.length].id)
  }

  const [save, busy] = useAction(
    () => {
      const segments = {}
      for (const k of KEYS) if (today[k].on) segments[k] = { ...today[k].pick, ...(k === 'new' ? { repetitions: +f.repetitions || 1 } : {}) }
      const assignNext = {}
      for (const k of KEYS) if (next[k].on) assignNext[k] = next[k].pick
      return recordHifz({
        student, segments, assignNext, mastery,
        hifzMistakes: mist.hifz, tajweedMistakes: mist.tajweed, tashkeelMistakes: mist.tashkeel,
        homework: f.homework, notes: f.notes
      }, actor)
    },
    { success: (n) => `حُفظ التسميع (${n} آية)${willRepeat ? ' — الجديد يُعاد' : ''}${student?.parentId ? ' وأُرسل الواجب لولي الأمر' : ''}` }
  )

  if (!students) return <Page title="تسجيل تسميع"><Skeleton rows={5} /></Page>
  if (!students.length) return <Page title="تسجيل تسميع"><EmptyState icon="users-group-rounded-bold">لا يوجد طلبة</EmptyState></Page>

  const doneCount = students.filter((s) => doneIds.has(s.id)).length
  const lastMastery = lastRec?.masteryLevel || student.academicInfo?.lastMastery
  const lastDate = lastRec?.date || student.academicInfo?.lastSession

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
              <option key={s.id} value={s.id}>{doneIds.has(s.id) ? '✓ ' : ''}{s.personalInfo.fullName} — {s.academicInfo?.groupName}</option>
            ))}
          </Select>
        </Field>
        {lastDate && (
          <div className="mb-2 p-3 rounded-2xl bg-gold-50 border border-gold-400/30 text-xs flex items-center justify-between gap-2">
            <span className="font-bold text-gold-600">آخر تسميع: {fmtDate(lastDate, { day: 'numeric', month: 'short' })}{lastRec?.status === 'repeat' ? ' — الجديد إعادة' : ''}</span>
            {lastMastery && <Badge tone={lastMastery === 'excellent' ? 'ok' : lastMastery === 'weak' ? 'bad' : 'gold'}>{MASTERY[lastMastery]}</Badge>}
          </div>
        )}
        <Link to={`/hifz-map?student=${student.id}`} className="text-xs font-bold text-info">خريطة الحفظ والخطة ←</Link>
      </Section>

      {!today || !next ? <div className="px-4"><Skeleton rows={4} /></div> : (
        <>
          <Section title="تسميع اليوم">
            <Card className="p-4 space-y-3">
              {KEYS.map((k) => (
                <TrackCard key={k} k={k} t={today[k]} onChange={(p) => setToday((x) => ({ ...x, [k]: { ...x[k], ...p } }))}
                  hint={today[k].assigned ? 'مقرر من المحفظ في الجلسة السابقة' : k === 'new' ? 'مقترح من خطة الطالب' : ''}
                  extra={k === 'new' && (
                    <Field label="عدد التكرارات"><Input type="number" min="1" value={f.repetitions} onChange={(e) => setF({ ...f, repetitions: e.target.value })} /></Field>
                  )} />
              ))}

              <div className="grid grid-cols-3 gap-2">
                <MistakeCounter label="حفظ وتردد" value={mist.hifz} onChange={(d) => updateMistake('hifz', d)} />
                <MistakeCounter label="تشكيل" value={mist.tashkeel} onChange={(d) => updateMistake('tashkeel', d)} />
                <MistakeCounter label="تجويد" value={mist.tajweed} onChange={(d) => updateMistake('tajweed', d)} />
              </div>
              {willRepeat && (
                <div className="text-xs font-bold rounded-xl p-2.5 bg-bad-soft text-bad">
                  أخطاء الحفظ تجاوزت الحد ({plan.maxNewMistakes}) — سيُسجَّل الجديد «إعادة» ولن يُضاف للمحفوظ.
                </div>
              )}
              <Field label="مستوى الإتقان (يُقترح تلقائيًا من الأخطاء)">
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(MASTERY).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setMastery(k)}
                      className={cx('h-10 rounded-xl text-[13px] font-bold border transition', mastery === k ? { excellent: 'bg-ok-soft text-ok border-ok/30', good: 'bg-gold-50 text-gold-600 border-gold-400/40', average: 'bg-info-soft text-info border-info/30', weak: 'bg-bad-soft text-bad border-bad/30' }[k] : 'bg-field text-ink-muted border-transparent')}>{label}</button>
                  ))}
                </div>
              </Field>
              <Field label="ملاحظات المحفظ"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="ملاحظاتك على أداء الطالب" /></Field>
            </Card>
          </Section>

          <Section title="واجب الجلسة القادمة">
            <Card className="p-4 space-y-3">
              {willRepeat && <div className="text-[11px] text-ink-muted">الجديد غير المقبول يُعاد تلقائيًا إن لم تحدد جديدًا آخر.</div>}
              {KEYS.map((k) => (
                <TrackCard key={k} k={k} t={next[k]} onChange={(p) => setNext((x) => ({ ...x, [k]: { ...x[k], ...p } }))} />
              ))}
              <Field label="تكليف إضافي (اختياري)"><Input value={f.homework} onChange={(e) => setF({ ...f, homework: e.target.value })} placeholder="مثال: الاستماع للسورة ٣ مرات" /></Field>
            </Card>
          </Section>
        </>
      )}

      <div className="flex gap-2.5 px-4 mt-4">
        <Button className="flex-1" icon="check-circle-bold" busy={busy} disabled={!canSave}
          onClick={async () => {
            if (await save()) {
              const nextSet = new Set(doneIds)
              nextSet.add(student.id)
              setDoneIds(nextSet)
              nextStudent(nextSet)
            }
          }}>حفظ التسميع والواجب</Button>
        <Button variant="secondary" onClick={() => nextStudent()}>الطالب التالي</Button>
      </div>
    </Page>
  )
}

function TrackCard({ k, t, onChange, hint, extra }) {
  const r = t.pick && pickToRange(t.pick)
  return (
    <div className={cx('rounded-2xl border p-3', t.on ? 'bg-card' : 'bg-field/60')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={cx('text-sm font-extrabold', TRACK_TONE[k])}>{HIFZ_TRACKS[k]}</div>
          <div className="text-[11px] text-ink-muted mt-0.5 truncate">
            {t.on && t.pick ? `${pickLabel(t.pick)}${r ? ` • ${r.e - r.s + 1} آية` : ''}` : hint || 'غير مقرر'}
          </div>
        </div>
        <Toggle checked={t.on} onChange={(v) => onChange({ on: v, pick: t.pick || { unit: 'surah', from: 114, to: 114 } })} />
      </div>
      {t.on && (
        <div className="mt-3">
          {hint && <div className="text-[11px] font-bold text-gold-600 mb-2">{hint}</div>}
          <MushafPicker value={t.pick} onChange={(pick) => onChange({ pick })} />
          {extra}
        </div>
      )}
    </div>
  )
}

function MistakeCounter({ label, value, onChange }) {
  return (
    <div className="bg-field rounded-xl p-2 text-center">
      <div className="text-[11px] font-bold text-ink-soft mb-1.5">{label}</div>
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label={`إنقاص ${label}`} onClick={() => onChange(-1)}
          className="w-7 h-7 rounded-lg bg-card border font-extrabold text-ink-soft active:bg-paper">-</button>
        <span className={cx('text-base font-extrabold min-w-[20px]', value > 0 ? 'text-bad' : 'text-ok')}>{value}</span>
        <button type="button" aria-label={`زيادة ${label}`} onClick={() => onChange(1)}
          className="w-7 h-7 rounded-lg bg-card border font-extrabold text-bad active:bg-bad-soft">+</button>
      </div>
    </div>
  )
}
