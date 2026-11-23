// Daily recitation: three tracks per student — الجديد / الماضي القريب / الماضي البعيد —
// each prefilled from the student's progress (plan, memorized ranges, review rotation).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, EmptyState, Field, Input, Progress, Section, Select, Skeleton, Textarea, Toggle, cx } from '@/components/ui'
import { MASTERY } from '@/config/constants'
import { SURAHS, nextAyahStart, suggestMastery, validateRange } from '@/config/quran'
import { fromIndex, planOf, rangeLabel, suggestFar, suggestNear, suggestNew } from '@/lib/hifz'
import { useAction } from '@/hooks/useAction'
import { HIFZ_TRACKS, getHifzProgress, hifzRecordsFor, recordHifz, todayHifzIds } from '@/services/academic'
import { fmtDate } from '@/lib/format'

const TRACK_TONE = { new: 'text-gold-600', near: 'text-ok', far: 'text-info' }

/** A global range → an editable single-surah segment (first surah of the range). */
function rangeToSeg(r) {
  if (!r) return null
  const a = fromIndex(r.s), b = fromIndex(r.e)
  const sur = SURAHS.find((x) => x.name === a.surah)
  return { surah: a.surah, from: a.ayah, to: a.surah === b.surah ? b.ayah : sur.ayahs }
}
const blank = (surah = 'الفاتحة') => ({ on: false, surah, from: '', to: '', hint: '' })

export default function RecordHifzPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [sid, setSid] = useState('')
  const [tracks, setTracks] = useState({ new: blank(), near: blank(), far: blank() })
  const [f, setF] = useState({ notes: '', homework: '', repetitions: 5 })
  const [mist, setMist] = useState({ hifz: 0, tajweed: 0, tashkeel: 0 })
  const [mastery, setMastery] = useState('excellent')
  const [doneIds, setDoneIds] = useState(() => new Set())
  const [lastRec, setLastRec] = useState(null)
  const [progress, setProgress] = useState(null)

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
    setProgress(null)
    setMist({ hifz: 0, tajweed: 0, tashkeel: 0 })
    setMastery('excellent')
    setF((x) => ({ notes: '', homework: '', repetitions: x.repetitions || 5 }))

    Promise.all([getHifzProgress(student.id), hifzRecordsFor(student.id)]).then(([p, recs]) => {
      if (cancelled) return
      setProgress(p || {})
      setLastRec(recs[0] || null)
      const next = { new: blank(), near: blank(), far: blank() }
      let nw = suggestNew(p)
      if (!p?.ranges && !p?.pendingRepeat) {
        // legacy students without ranges: continue after the last recorded new memorization
        const mem = recs.find((r) => r.newMemorization)?.newMemorization || student.academicInfo?.lastHifz
        if (mem) { const n = nextAyahStart(mem.surahName, mem.toAyah); nw = { surah: n.surah, from: n.from, to: '' } }
      }
      if (nw) next.new = { on: true, surah: nw.surah, from: String(nw.from), to: String(nw.to || ''), hint: nw.repeat ? 'إعادة — لم يُقبل في المرة السابقة' : '' }
      const nr = suggestNear(p)
      const ns = rangeToSeg(nr)
      if (ns) next.near = { on: true, surah: ns.surah, from: String(ns.from), to: String(ns.to), hint: `المقرر: ${rangeLabel(nr)}` }
      const fr = suggestFar(p)
      const fs = rangeToSeg(fr)
      if (fs) next.far = { on: true, surah: fs.surah, from: String(fs.from), to: String(fs.to), hint: `الجزء ${fr.juz}: ${rangeLabel(fr)}` }
      setTracks(next)
    }).catch(() => setProgress({}))

    return () => { cancelled = true }
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ranges = useMemo(() => Object.fromEntries(Object.entries(tracks).map(([k, t]) =>
    [k, validateRange(t.surah, parseInt(t.from, 10), parseInt(t.to, 10))])), [tracks])
  const anyOn = Object.values(tracks).some((t) => t.on)
  const canSave = anyOn && Object.entries(tracks).every(([k, t]) => !t.on || ranges[k].ok)
  const plan = planOf(progress)
  const willRepeat = tracks.new.on && mist.hifz > plan.maxNewMistakes

  const setTrack = (k, patch) => setTracks((t) => ({ ...t, [k]: { ...t[k], ...patch } }))
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
      for (const [k, t] of Object.entries(tracks)) {
        if (t.on) segments[k] = { surah: t.surah, from: parseInt(t.from, 10), to: parseInt(t.to, 10), ...(k === 'new' ? { repetitions: parseInt(f.repetitions, 10) } : {}) }
      }
      return recordHifz({
        student, segments, mastery,
        hifzMistakes: mist.hifz, tajweedMistakes: mist.tajweed, tashkeelMistakes: mist.tashkeel,
        homework: f.homework, notes: f.notes
      }, actor)
    },
    { success: (n) => `حُفظ التسميع (${n} آية)${willRepeat ? ' — الجديد يُعاد غدًا' : ''}${student?.parentId ? ' وأُشعر ولي الأمر' : ''}` }
  )

  if (!students) return <Page title="تسجيل تسميع"><Skeleton rows={5} /></Page>
  if (!students.length) return <Page title="تسجيل تسميع"><EmptyState icon="users-group-rounded-bold">لا يوجد طلبة</EmptyState></Page>

  const doneCount = students.filter((s) => doneIds.has(s.id)).length
  const hwText = lastRec?.homework || student.academicInfo?.lastHomework
  const lastMem = lastRec?.newMemorization || lastRec?.nearReview || lastRec?.revision || student.academicInfo?.lastHifz
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
                  {lastRec?.status === 'repeat' ? ' — إعادة' : ''}
                </span>
                {lastMastery && <Badge tone={lastMastery === 'excellent' ? 'ok' : lastMastery === 'weak' ? 'bad' : 'gold'}>{MASTERY[lastMastery]}</Badge>}
              </div>
            )}
            {hwText && <div className="text-ink-soft leading-6"><b className="text-ink">الواجب المطلوب اليوم:</b> {hwText}</div>}
          </div>
        )}
        <Link to={`/hifz-map?student=${student.id}`} className="text-xs font-bold text-info">خريطة الحفظ والخطة ←</Link>
      </Section>

      {!progress ? <div className="px-4"><Skeleton rows={3} /></div> : (
        <Card className="mx-4 p-4 space-y-3">
          {Object.keys(HIFZ_TRACKS).map((k) => (
            <TrackSection key={k} k={k} t={tracks[k]} range={ranges[k]} onChange={(p) => setTrack(k, p)}
              extra={k === 'new' && tracks.new.on && (
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
          <Field label="ملاحظات المعلم"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="ملاحظاتك على أداء الطالب" /></Field>
          <Field label="الواجب"><Input value={f.homework} onChange={(e) => setF({ ...f, homework: e.target.value })} placeholder="مثال: مراجعة هود ١–٣٩ + حفظ ٧١–١٠٠" /></Field>
        </Card>
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
          }}>حفظ التسميع</Button>
        <Button variant="secondary" onClick={() => nextStudent()}>الطالب التالي</Button>
      </div>
    </Page>
  )
}

function TrackSection({ k, t, range, onChange, extra }) {
  return (
    <div className={cx('rounded-2xl border p-3', t.on ? 'bg-card' : 'bg-field/60')}>
      <div className="flex items-center justify-between">
        <div>
          <div className={cx('text-sm font-extrabold', TRACK_TONE[k])}>{HIFZ_TRACKS[k]}</div>
          {t.hint && <div className="text-[11px] text-ink-muted mt-0.5">{t.hint}</div>}
        </div>
        <Toggle checked={t.on} onChange={(v) => onChange({ on: v })} />
      </div>
      {t.on && (
        <div className="mt-3">
          <Field label="السورة">
            <Select value={t.surah} onChange={(e) => onChange({ surah: e.target.value })}>
              {SURAHS.map((s) => <option key={s.n} value={s.name}>{s.n}. {s.name} ({s.ayahs} آية)</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="من آية"><Input type="number" inputMode="numeric" min="1" value={t.from} onChange={(e) => onChange({ from: e.target.value })} /></Field>
            <Field label="إلى آية"><Input type="number" inputMode="numeric" min="1" value={t.to} onChange={(e) => onChange({ to: e.target.value })} /></Field>
          </div>
          {t.from && t.to && (
            <div className={cx('text-center text-sm font-bold rounded-xl py-2 mb-2', range.ok ? 'bg-gold-50 text-gold-600' : 'bg-bad-soft text-bad')}>
              {range.ok ? `عدد الآيات: ${range.count}` : range.error}
            </div>
          )}
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
