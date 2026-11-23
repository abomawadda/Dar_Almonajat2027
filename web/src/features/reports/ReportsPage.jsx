// التقارير: hifz, attendance, exams, teacher performance, early warning and finance —
// for a chosen period, exportable to Excel (CSV) and printable / savable as PDF.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, Chips, EmptyState, Section, Select, Skeleton, StatRow, cx } from '@/components/ui'
import { isStaffRole } from '@/config/roles'
import { atRisk, attendanceByStudent, downloadCsv, examsSummary, groupSummary, hifzByStudent, loadReportData, periodRange, teacherIndex } from '@/services/reports'
import { monthSummary } from '@/services/finance'
import { db } from '@/lib/backend'
import { COL } from '@/config/constants'
import { fmtDate, fmtMoney, todayKey } from '@/lib/format'

export default function ReportsPage() {
  const { actor } = useAuth()
  const finance = actor.role === 'admin' || actor.role === 'accountant'
  const academic = actor.role !== 'accountant'
  const tabs = [
    ...(academic ? [['hifz', 'الحفظ'], ['attendance', 'الحضور'], ['exams', 'الاختبارات'], ['risk', 'التنبيه المبكر']] : []),
    ...(academic && actor.role !== 'teacher' ? [['teachers', 'المحفظون والحلقات']] : []),
    ...(finance ? [['finance', 'المالية']] : [])
  ]
  const [tab, setTab] = useState(tabs[0][0])
  const [period, setPeriod] = useState('month')
  const range = useMemo(() => periodRange(period), [period])

  return (
    <Page title="التقارير">
      {tab !== 'finance' && (
        <div className="px-4 mb-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-10 text-[13px]">
            {['month', 'last_month', '30', '90'].map((k) => <option key={k} value={k}>{periodRange(k).label}</option>)}
          </Select>
        </div>
      )}
      <Chips value={tab} onChange={setTab} options={tabs} />
      {tab === 'finance' ? <FinanceReport /> : <Academic tab={tab} range={range} actor={actor} />}
    </Page>
  )
}

function Academic({ tab, range, actor }) {
  const { students, groups } = useData()
  const [data, setData] = useState(null)
  useEffect(() => { setData(null); loadReportData(range, actor).then(setData).catch(() => setData({ hifz: [], attendance: [], results: [] })) }, [range.from, range.to, actor]) // eslint-disable-line react-hooks/exhaustive-deps
  const myGroups = (groups || []).filter((g) => actor.role !== 'teacher' || g.teacherId === actor.linkedId)
  const roster = (students || []).filter((s) => myGroups.some((g) => g.id === s.academicInfo?.groupId))
  const calc = useMemo(() => {
    if (!data) return null
    const h = hifzByStudent(data.hifz, roster, range)
    const a = attendanceByStudent(data.attendance, roster)
    return { h, a, ex: examsSummary(data.results), groups: groupSummary(myGroups, h, a, data.results), risk: atRisk(h, a, data.results) }
  }, [data, students, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!calc || !students) return <Skeleton rows={5} />
  const title = `${range.label} (${range.from} ← ${range.to})`
  const file = (n) => `${n}-${range.from}_${range.to}`

  if (tab === 'hifz') {
    const rows = [...calc.h].sort((x, y) => y.newAyahs - x.newAyahs)
    return (
      <Report title={`تقرير الحفظ — ${title}`} onCsv={() => downloadCsv(file('الحفظ'), rows, [['name', 'الطالب'], ['groupName', 'الحلقة'], ['sessions', 'جلسات'], ['newAyahs', 'آيات جديدة'], ['perWeek', 'آية/أسبوع'], ['reviewAyahs', 'آيات مراجعة'], ['repeatRate', 'نسبة الإعادة %'], ['mastery', 'الإتقان %'], ['mistakes', 'متوسط الأخطاء'], ['totalMemorized', 'إجمالي المحفوظ'], ['lastSession', 'آخر تسميع']])}>
        <StatRow items={[[rows.reduce((n, r) => n + r.newAyahs, 0), 'آية جديدة', 'gold'], [rows.reduce((n, r) => n + r.reviewAyahs, 0), 'آية مراجعة', 'info'], [rows.reduce((n, r) => n + r.sessions, 0), 'جلسة تسميع', 'ok']]} />
        <Table cols={['الطالب', 'جديد', 'أسبوعي', 'مراجعة', 'إتقان', 'إعادة']} rows={rows.map((r) => [<Link key="n" to={`/student-report/${r.studentId}`} className="font-bold text-info">{r.name}</Link>, r.newAyahs, r.perWeek, r.reviewAyahs, r.mastery != null ? `${r.mastery}%` : '—', r.repeatRate != null ? `${r.repeatRate}%` : '—'])} />
      </Report>
    )
  }
  if (tab === 'attendance') {
    const rows = [...calc.a].sort((x, y) => (x.rate ?? 101) - (y.rate ?? 101))
    const all = rows.reduce((o, r) => ({ p: o.p + r.present + r.late + r.earlyLeave, d: o.d + r.days - r.excused }), { p: 0, d: 0 })
    return (
      <Report title={`تقرير الحضور — ${title}`} onCsv={() => downloadCsv(file('الحضور'), rows, [['name', 'الطالب'], ['groupName', 'الحلقة'], ['days', 'أيام مسجلة'], ['present', 'حاضر'], ['late', 'متأخر'], ['earlyLeave', 'انصراف مبكر'], ['absent', 'غائب'], ['excused', 'معذور'], ['rate', 'نسبة الحضور %']])}>
        <StatRow items={[[all.d ? `${Math.round((all.p / all.d) * 100)}%` : '—', 'نسبة الحضور', 'ok'], [rows.reduce((n, r) => n + r.absent, 0), 'غياب', 'bad'], [rows.reduce((n, r) => n + r.late, 0), 'تأخير', 'warn']]} />
        <Table cols={['الطالب', 'حاضر', 'متأخر', 'غائب', 'معذور', 'النسبة']} rows={rows.map((r) => [r.name, r.present, r.late, r.absent, r.excused, r.rate != null ? <b key="r" className={r.rate < 75 ? 'text-bad' : 'text-ok'}>{r.rate}%</b> : '—'])} />
      </Report>
    )
  }
  if (tab === 'exams') {
    return (
      <Report title={`تقرير الاختبارات — ${title}`} onCsv={() => downloadCsv(file('الاختبارات'), calc.ex, [['title', 'الاختبار'], ['date', 'التاريخ'], ['count', 'عدد الطلاب'], ['absent', 'غائب'], ['average', 'المتوسط %'], ['passRate', 'نسبة النجاح %']])}>
        {!calc.ex.length ? <EmptyState icon="document-add-bold">لا توجد نتائج منشورة في الفترة</EmptyState> : (
          <Table cols={['الاختبار', 'التاريخ', 'الطلاب', 'المتوسط', 'النجاح']} rows={calc.ex.map((e) => [<Link key="t" to={`/exams/${e.examId}`} className="font-bold text-info">{e.title}</Link>, e.date, e.count, e.average != null ? `${e.average}%` : '—', e.passRate != null ? `${e.passRate}%` : '—'])} />
        )}
      </Report>
    )
  }
  if (tab === 'teachers') {
    const rows = calc.groups.map((g) => ({ ...g, index: teacherIndex(g) })).sort((x, y) => (y.index ?? -1) - (x.index ?? -1))
    return (
      <Report title={`أداء المحفظين والحلقات — ${title}`} note="المؤشر من 100: معدل الحفظ مقابل هدف 20 آية أسبوعيًا (40%)، الإتقان (25%)، الحضور (20%)، نجاح الاختبارات (15%)."
        onCsv={() => downloadCsv(file('المحفظون'), rows, [['name', 'الحلقة'], ['teacherName', 'المحفظ'], ['students', 'الطلاب'], ['newAyahs', 'آيات جديدة'], ['perWeek', 'متوسط آية/أسبوع'], ['mastery', 'الإتقان %'], ['attendance', 'الحضور %'], ['passRate', 'نجاح الاختبارات %'], ['index', 'المؤشر']])}>
        {rows.map((g) => (
          <Card key={g.groupId} className="p-3 mb-2">
            <div className="flex items-center justify-between"><div><b className="text-sm">{g.teacherName}</b><div className="text-xs text-ink-muted">{g.name} • {g.students} طالب</div></div>
              <div className={cx('text-2xl font-extrabold', g.index >= 75 ? 'text-ok' : g.index >= 50 ? 'text-gold-600' : 'text-bad')}>{g.index ?? '—'}</div></div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge>جديد {g.newAyahs} آية</Badge><Badge>{g.perWeek} آية/أسبوع</Badge><Badge>إتقان {g.mastery ?? '—'}%</Badge><Badge>حضور {g.attendance ?? '—'}%</Badge><Badge>نجاح {g.passRate ?? '—'}%</Badge>
            </div>
          </Card>
        ))}
      </Report>
    )
  }
  // risk
  return (
    <Report title={`التنبيه المبكر — ${title}`} note="طلاب يحتاجون متابعة: حضور أقل من 75%، أو 3 غيابات فأكثر، أو بلا تسميع منذ أسبوع، أو إعادة الجديد كثيرًا، أو إتقان ضعيف، أو عدم اجتياز اختبار."
      onCsv={() => downloadCsv(file('التنبيه-المبكر'), calc.risk, [['name', 'الطالب'], ['groupName', 'الحلقة'], [(r) => r.reasons.join(' • '), 'الأسباب']])}>
      {!calc.risk.length ? <EmptyState icon="check-circle-bold">لا يوجد طلاب في دائرة الخطر 👍</EmptyState> : calc.risk.map((r) => (
        <Card key={r.studentId} className={cx('p-3 mb-2 border-r-4', r.level === 'high' ? 'border-r-bad' : r.level === 'medium' ? 'border-r-warn' : 'border-r-info')}>
          <div className="flex items-center justify-between"><Link to={`/student-report/${r.studentId}`} className="text-sm font-bold text-info">{r.name}</Link><span className="text-xs text-ink-muted">{r.groupName}</span></div>
          <div className="flex flex-wrap gap-1.5 mt-2">{r.reasons.map((x) => <Badge key={x} tone={r.level === 'high' ? 'bad' : 'warn'}>{x}</Badge>)}</div>
        </Card>
      ))}
    </Report>
  )
}

function FinanceReport() {
  const [data, setData] = useState(null)
  useEffect(() => {
    Promise.all([db().list(COL.INVOICES, {}), db().list(COL.CASH_ENTRIES, {})]).then(([invoices, entries]) => setData({ invoices, entries })).catch(() => setData({ invoices: [], entries: [] }))
  }, [])
  if (!data) return <Skeleton rows={5} />
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return todayKey(d).slice(0, 7) })
  const rows = months.map((m) => ({ month: m, ...monthSummary(data, m) }))
  return (
    <Report title="التقرير المالي — آخر ٦ أشهر" onCsv={() => downloadCsv('التقرير-المالي', rows, [['month', 'الشهر'], ['due', 'المستحق'], ['collected', 'المحصّل'], ['outstanding', 'المتبقي'], ['rate', 'نسبة التحصيل %'], ['donations', 'التبرعات'], ['expenses', 'المصروفات'], ['payroll', 'الرواتب'], ['income', 'الإيرادات'], ['spending', 'المنصرف'], ['net', 'الصافي']])}>
      <Table cols={['الشهر', 'المحصّل', 'التحصيل', 'التبرعات', 'المنصرف', 'الصافي']} rows={rows.map((r) => [fmtDate(`${r.month}-01`, { month: 'short', year: 'numeric' }), fmtMoney(r.collected, ''), `${r.rate}%`, fmtMoney(r.donations, ''), fmtMoney(r.spending, ''), <b key="n" className={r.net >= 0 ? 'text-ok' : 'text-bad'}>{fmtMoney(r.net, '')}</b>])} />
    </Report>
  )
}

function Report({ title, note, onCsv, children }) {
  return (
    <Section>
      <div className="flex gap-2 mb-3 no-print">
        <Button size="sm" variant="secondary" icon="document-text-bold" className="flex-1" onClick={onCsv}>تصدير Excel</Button>
        <Button size="sm" variant="secondary" icon="printer-minimalistic-bold" className="flex-1" onClick={() => window.print()}>طباعة / PDF</Button>
      </div>
      <div className="print-area print-flow">
        <div className="hidden print:block text-center mb-3"><div className="font-extrabold">دار المناجاة لتحفيظ القرآن الكريم</div><div className="text-sm">{title}</div></div>
        <div className="text-xs font-bold text-ink-soft mb-2 print:hidden">{title}</div>
        {note && <div className="text-[11px] text-ink-muted mb-2 leading-5">{note}</div>}
        {children}
      </div>
    </Section>
  )
}

export function Table({ cols, rows }) {
  if (!rows.length) return <EmptyState icon="chart-2-bold">لا توجد بيانات</EmptyState>
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-field">{cols.map((c) => <th key={c} className="text-right font-bold text-ink-soft px-2.5 py-2 whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((v, j) => <td key={j} className="px-2.5 py-2 whitespace-nowrap">{v}</td>)}</tr>)}</tbody>
      </table>
    </Card>
  )
}
