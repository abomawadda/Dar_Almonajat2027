// خريطة الحفظ: 30-juz coverage grid, today's three-track wird, weak juz, completion estimate,
// and (for staff/teachers) the student's hifz plan.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Button, Card, EmptyState, Field, Input, KV, Section, Segmented, Select, Skeleton, cx } from '@/components/ui'
import { TOTAL_AYAHS } from '@/config/quran'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { HIFZ_TRACKS, getHifzProgress, saveHifzPlan } from '@/services/academic'
import { countAyahs, estimateCompletion, juzCoverage, planOf, rangeLabel, suggestFar, suggestNear, suggestNew } from '@/lib/hifz'
import { fmtDate } from '@/lib/format'

function cellTone(pct, weak) {
  if (pct <= 0) return 'bg-field text-ink-muted'
  if (weak) return 'bg-bad-soft text-bad border-bad/30'
  if (pct >= 0.999) return 'bg-ok-soft text-ok border-ok/30'
  return 'bg-gold-50 text-gold-600 border-gold-400/40'
}

export default function HifzMapPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [params, setParams] = useSearchParams()
  const sid = params.get('student') || students?.[0]?.id
  const student = students?.find((s) => s.id === sid)
  const [progress, setProgress] = useState(null)
  const [plan, setPlan] = useState(null)
  const canEdit = can(actor.role, 'hifz.record')

  useEffect(() => {
    if (!sid) return
    let cancelled = false
    setProgress(null)
    getHifzProgress(sid).then((p) => { if (!cancelled) { setProgress(p || {}); setPlan(planOf(p)) } }).catch(() => setProgress({}))
    return () => { cancelled = true }
  }, [sid])

  const [savePlan, saving] = useAction(async () => {
    await saveHifzPlan(sid, { ...plan, dailyNew: +plan.dailyNew, nearWindow: +plan.nearWindow, maxNewMistakes: +plan.maxNewMistakes })
    setProgress((p) => ({ ...p, plan }))
  }, { success: 'حُفظت الخطة' })

  if (!students) return <Page title="خريطة الحفظ"><Skeleton rows={5} /></Page>
  if (!students.length || !student) return <Page title="خريطة الحفظ"><EmptyState icon="map-bold">لا يوجد طلبة</EmptyState></Page>

  const ranges = progress?.ranges || []
  const cov = juzCoverage(ranges)
  const weak = new Set((progress?.weakJuz || []).map(Number))
  const total = countAyahs(ranges)
  const done = cov.filter((c) => c.pct >= 0.999).length
  const eta = progress && estimateCompletion(progress)
  const nw = progress && suggestNew(progress)
  const nr = progress && suggestNear(progress)
  const fr = progress && suggestFar(progress)

  return (
    <Page title="خريطة الحفظ">
      {students.length > 1 && (
        <Section>
          <Select value={sid} onChange={(e) => setParams({ student: e.target.value })}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName} — {s.academicInfo?.groupName}</option>)}
          </Select>
        </Section>
      )}
      {!progress ? <div className="px-4"><Skeleton rows={4} /></div> : (
        <>
          <Section>
            <Card className="p-4">
              <div className="grid grid-cols-3 text-center bg-field rounded-2xl py-3 mb-3">
                <div><div className="text-xl font-extrabold text-gold-600">{done}</div><div className="text-[11px] text-ink-muted">جزء مكتمل</div></div>
                <div><div className="text-xl font-extrabold text-ok">{total.toLocaleString('ar-EG')}</div><div className="text-[11px] text-ink-muted">آية محفوظة</div></div>
                <div><div className="text-xl font-extrabold text-info">{Math.round((total / TOTAL_AYAHS) * 100)}%</div><div className="text-[11px] text-ink-muted">من المصحف</div></div>
              </div>
              <div className="grid grid-cols-6 gap-1.5" dir="rtl">
                {cov.map((c) => (
                  <div key={c.n} title={`الجزء ${c.n}: ${Math.round(c.pct * 100)}%`}
                    className={cx('aspect-square rounded-xl border border-transparent flex flex-col items-center justify-center', cellTone(c.pct, weak.has(c.n)))}>
                    <span className="text-sm font-extrabold">{c.n}</span>
                    {c.pct > 0 && c.pct < 0.999 && <span className="text-[9px] font-bold">{Math.round(c.pct * 100)}%</span>}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted mt-3">
                <span><b className="text-ok">■</b> مكتمل</span><span><b className="text-gold-600">■</b> جزئي</span>
                <span><b className="text-bad">■</b> يحتاج تثبيت</span><span><b className="text-ink-muted">■</b> لم يبدأ</span>
              </div>
            </Card>
          </Section>

          {progress.assignment && (
            <Section title="الواجب المقرر من المحفظ">
              <Card className="p-4 space-y-2 text-sm">
                {Object.keys(HIFZ_TRACKS).filter((k) => progress.assignment[k]).map((k) => (
                  <KV key={k} label={HIFZ_TRACKS[k]}>{progress.assignment[k].label}</KV>
                ))}
              </Card>
            </Section>
          )}
          <Section title="اقتراح الخطة">
            <Card className="p-4 space-y-2 text-sm">
              <KV label={HIFZ_TRACKS.new}>{nw ? `${nw.surah} ${nw.from}–${nw.to}${nw.repeat ? ' (إعادة)' : ''}` : 'أتمّ الحفظ'}</KV>
              <KV label={HIFZ_TRACKS.near}>{nr ? rangeLabel(nr) : '—'}</KV>
              <KV label={HIFZ_TRACKS.far}>{fr ? `الجزء ${fr.juz}: ${rangeLabel(fr)}` : '—'}</KV>
              <KV label="الختم المتوقع">{eta?.done ? 'ختم القرآن 🎉' : eta ? fmtDate(eta.date, { month: 'long', year: 'numeric' }) : '—'}</KV>
              <KV label="معدل الحفظ">{progress.pace ? `${progress.pace} آية/جلسة` : '—'}</KV>
            </Card>
          </Section>

          {canEdit && plan && (
            <Section title="خطة الحفظ">
              <Card className="p-4">
                <Field label="اتجاه الحفظ">
                  <Segmented value={plan.direction} onChange={(v) => setPlan({ ...plan, direction: v })}
                    options={[['backward', 'من الناس'], ['forward', 'من الفاتحة']]} />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="الجديد (آيات)"><Input type="number" min="1" value={plan.dailyNew} onChange={(e) => setPlan({ ...plan, dailyNew: e.target.value })} /></Field>
                  <Field label="القريب (آيات)"><Input type="number" min="1" value={plan.nearWindow} onChange={(e) => setPlan({ ...plan, nearWindow: e.target.value })} /></Field>
                  <Field label="حد الأخطاء"><Input type="number" min="0" value={plan.maxNewMistakes} onChange={(e) => setPlan({ ...plan, maxNewMistakes: e.target.value })} /></Field>
                </div>
                <Button block icon="check-circle-bold" busy={saving} onClick={savePlan}>حفظ الخطة</Button>
              </Card>
            </Section>
          )}
        </>
      )}
    </Page>
  )
}
