// Printable student report for a period: hifz (new / near / far), attendance, exams, points and
// the teacher's notes. Staff and teachers open it from reports; parents for their own children.
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Button, Card, EmptyState, KV, Section, Select, Skeleton } from '@/components/ui'
import { COL, MASTERY } from '@/config/constants'
import { db } from '@/lib/backend'
import { attendanceByStudent, hifzByStudent, periodRange } from '@/services/reports'
import { juzCoverage } from '@/lib/hifz'
import { fmtDate } from '@/lib/format'
import { Table } from './ReportsPage'

export default function StudentReportPage() {
  const { id } = useParams()
  const { actor } = useAuth()
  const { students } = useData()
  const s = (students || []).find((x) => x.id === id)
  const [period, setPeriod] = useState('month')
  const range = useMemo(() => periodRange(period), [period])
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!s) return
    setData(null)
    const scope = actor.role === 'parent' ? [['parentId', '==', actor.linkedId]] : actor.role === 'student' ? [] : []
    const by = [['studentId', '==', s.id], ...scope]
    const inRange = (r) => r.date >= range.from && r.date <= range.to
    Promise.all([
      db().list(COL.HIFZ_RECORDS, { where: by }), db().list(COL.ATTENDANCE, { where: by }),
      db().list(COL.EXAM_RESULTS, { where: [...by, ['published', '==', true]] }), db().list(COL.POINTS_LEDGER, { where: by }),
      db().get(COL.HIFZ_PROGRESS, s.id).catch(() => null)
    ]).then(([hifz, att, res, pts, progress]) => setData({
      hifz: hifz.filter(inRange).sort((a, b) => (a.date < b.date ? 1 : -1)), att: att.filter(inRange), res: res.filter(inRange), pts: pts.filter(inRange), progress
    })).catch(() => setData({ hifz: [], att: [], res: [], pts: [], progress: null }))
  }, [s?.id, range.from, range.to, actor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!students) return <Page title="تقرير الطالب"><Skeleton rows={4} /></Page>
  if (!s) return <Page title="تقرير الطالب"><EmptyState icon="users-group-rounded-bold">الطالب غير موجود</EmptyState></Page>
  const h = data && hifzByStudent(data.hifz, [s], range)[0]
  const a = data && attendanceByStudent(data.att, [s])[0]
  const points = data ? data.pts.reduce((n, e) => n + (Number(e.delta) || 0), 0) : 0
  const juz = data?.progress?.ranges ? juzCoverage(data.progress.ranges).filter((c) => c.pct >= 0.999).length : s.academicInfo?.currentJuz
  const notes = data ? data.hifz.filter((r) => r.teacherNotes).slice(0, 5) : []

  return (
    <Page title="تقرير الطالب">
      <div className="px-4 mb-3 flex gap-2 no-print">
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-10 text-[13px] flex-1">
          {['month', 'last_month', '30', '90'].map((k) => <option key={k} value={k}>{periodRange(k).label}</option>)}
        </Select>
        <Button size="sm" icon="printer-minimalistic-bold" onClick={() => window.print()}>طباعة / PDF</Button>
      </div>
      {!data ? <Skeleton rows={5} /> : (
        <div className="print-area print-flow">
          <Section>
            <Card className="p-4">
              <div className="text-center border-b pb-3 mb-3">
                <div className="text-xs text-ink-muted">دار المناجاة لتحفيظ القرآن الكريم</div>
                <div className="text-lg font-extrabold mt-1">تقرير متابعة الطالب</div>
                <div className="text-xs text-ink-muted">{range.label}: {fmtDate(range.from, { day: 'numeric', month: 'short' })} — {fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <KV label="الطالب">{s.personalInfo.fullName}</KV><KV label="الحلقة / المحفظ">{`${s.academicInfo?.groupName || ''} • ${s.academicInfo?.teacherName || ''}`}</KV>
                <KV label="الأجزاء المكتملة">{juz ?? '—'}</KV><KV label="إجمالي الآيات المحفوظة">{(s.academicInfo?.totalMemorized || 0).toLocaleString('ar-EG')}</KV>
              </div>
            </Card>
          </Section>
          <Section title="الحفظ والمراجعة">
            <Card className="p-4 grid grid-cols-3 gap-3 text-center">
              <KV label="آيات جديدة">{h.newAyahs}</KV><KV label="آيات مراجعة">{h.reviewAyahs}</KV><KV label="جلسات">{h.sessions}</KV>
              <KV label="معدل أسبوعي">{h.perWeek}</KV><KV label="الإتقان">{h.mastery != null ? `${h.mastery}%` : '—'}</KV><KV label="نسبة الإعادة">{h.repeatRate != null ? `${h.repeatRate}%` : '—'}</KV>
            </Card>
          </Section>
          {data.hifz.length > 0 && (
            <Section title="سجل التسميع">
              <Table cols={['التاريخ', 'الجديد', 'القريب', 'البعيد', 'التقدير']} rows={data.hifz.slice(0, 20).map((r) => [
                fmtDate(r.date, { day: 'numeric', month: 'short' }),
                r.newMemorization ? `${r.newMemorization.label || `${r.newMemorization.surahName} ${r.newMemorization.fromAyah}–${r.newMemorization.toAyah}`}${r.status === 'repeat' ? ' (إعادة)' : ''}` : '—',
                r.nearReview?.label || '—', r.revision ? r.revision.label || `${r.revision.surahName} ${r.revision.fromAyah}–${r.revision.toAyah}` : '—', MASTERY[r.masteryLevel] || ''
              ])} />
            </Section>
          )}
          <Section title="الحضور">
            <Card className="p-4 grid grid-cols-4 gap-2 text-center">
              <KV label="حاضر">{a.present + a.late}</KV><KV label="غائب">{a.absent}</KV><KV label="معذور">{a.excused}</KV><KV label="النسبة">{a.rate != null ? `${a.rate}%` : '—'}</KV>
            </Card>
          </Section>
          {data.res.length > 0 && (
            <Section title="الاختبارات">
              <Table cols={['الاختبار', 'التاريخ', 'الدرجة', 'التقدير']} rows={data.res.map((r) => [r.examTitle, r.date, r.absent ? '—' : `${r.total}/${r.totalMarks} (${r.percent}%)`, r.grade])} />
            </Section>
          )}
          <Section title="النقاط والملاحظات">
            <Card className="p-4">
              <KV label="النقاط في الفترة"><span className={points >= 0 ? 'text-ok' : 'text-bad'}>{points > 0 ? '+' : ''}{points}</span></KV>
              {notes.length > 0 && <div className="mt-3 space-y-1">{notes.map((r) => <div key={r.id} className="text-xs text-ink-soft">• {fmtDate(r.date, { day: 'numeric', month: 'short' })}: {r.teacherNotes}</div>)}</div>}
              <div className="flex justify-between mt-8 text-[10px] text-ink-muted"><span className="w-[38%] border-t pt-1">المحفظ</span><span className="w-[38%] border-t pt-1">مدير الدار</span></div>
            </Card>
          </Section>
        </div>
      )}
    </Page>
  )
}
