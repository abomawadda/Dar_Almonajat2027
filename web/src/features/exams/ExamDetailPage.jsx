// Exam detail: info, grading sheet (rubric scores chosen from lists), publishing, retakes;
// students and parents see their own published results.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, KV, Section, Select, Skeleton, StatRow, Toggle, cx } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import { EXAM_KINDS, canGrade, createRetake, deleteExam, gradeOf, myResults, publishResults, resultsFor, saveResult, scoreResult } from '@/services/exams'
import { addDays, fmtDate, todayKey } from '@/lib/format'

export default function ExamDetailPage() {
  const { id } = useParams()
  const { actor } = useAuth()
  const { exams, students } = useData()
  const nav = useNavigate()
  const exam = (exams || []).find((e) => e.id === id)
  const [results, setResults] = useState(null)
  const grader = exam && canGrade(exam, actor)
  const viewer = actor.role === 'student' || actor.role === 'parent'

  const load = useCallback(() => {
    if (!exam) return
    if (viewer) {
      // students/parents: only their own published results (rules require the owner field)
      myResults(exam.id, actor).then(setResults).catch(() => setResults([]))
    } else resultsFor(exam.id).then(setResults).catch(() => setResults([]))
  }, [exam?.id, exam?.status, viewer, actor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load])

  const roster = useMemo(() => (students || []).filter((s) => s.academicInfo?.groupId === exam?.groupId && (!exam?.studentIds || exam.studentIds.includes(s.id))), [students, exam])
  const byStudent = Object.fromEntries((results || []).map((r) => [r.studentId, r]))
  const published = exam?.status === 'published'

  const [publish, publishing] = useAction(() => publishResults(exam, roster, actor), { success: (r) => `نُشرت النتائج — ناجح ${r.passed} من ${r.total}` })
  const [retake, retaking] = useAction(() => createRetake(exam, results, todayKey(addDays(7)), actor), { success: 'جُدول اختبار الإعادة بعد أسبوع' })
  const [remove, removing] = useAction(() => deleteExam(exam.id), { success: 'أُلغي الاختبار' })

  if (!exams || !students) return <Page title="الاختبار"><Skeleton rows={4} /></Page>
  if (!exam) return <Page title="الاختبار"><EmptyState icon="document-add-bold">الاختبار غير موجود</EmptyState></Page>

  const graded = roster.filter((s) => byStudent[s.id]).length
  const passed = roster.filter((s) => byStudent[s.id]?.passed).length
  const canDelete = !published && (actor.role === 'admin' || (actor.role === 'teacher' && exam.teacherId === actor.linkedId))

  return (
    <Page title={EXAM_KINDS[exam.kind || 'periodic'].label}>
      <Section>
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="text-[17px] font-extrabold">{exam.title}</div>
            <Badge tone={published ? 'ok' : 'info'}>{published ? 'نُشرت النتائج' : 'مجدول'}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KV label="الحلقة">{exam.groupName}</KV><KV label="المحفظ">{exam.teacherName}</KV>
            <KV label="التاريخ">{fmtDate(exam.date)}</KV><KV label="الوقت">{`${exam.time || ''} • ${exam.duration || 60} دقيقة`}</KV>
            <KV label="الدرجة الكلية">{exam.totalMarks}</KV><KV label="النجاح">{`${exam.passPercent ?? Math.round((exam.passMark / exam.totalMarks) * 100)}% (${exam.passMark})`}</KV>
          </div>
          {exam.scope && <div className="mt-3 p-3 bg-field rounded-xl text-sm">النطاق: {exam.scope}</div>}
          {exam.rubric && <div className="mt-2 flex flex-wrap gap-1.5">{exam.rubric.map((c) => <Badge key={c.key}>{c.label} {c.max}</Badge>)}</div>}
          {exam.certificateType && <div className="mt-2 text-xs font-bold text-gold-600">🎓 شهادة «{exam.certificateType}» للناجحين</div>}
          {exam.retakeOf && <div className="mt-2 text-xs text-ink-muted">اختبار إعادة للطلاب الذين لم يجتازوا</div>}
        </Card>
      </Section>

      {viewer ? (
        <Section title="النتيجة">
          {!results ? <Skeleton /> : !results.length ? <EmptyState icon="document-add-bold">لم تُنشر النتيجة بعد</EmptyState> : results.map((r) => <ResultCard key={r.id} exam={exam} r={r} />)}
        </Section>
      ) : (
        <>
          {exam.rubric && <StatRow items={[[`${graded}/${roster.length}`, 'تم الرصد', 'info'], [passed, 'ناجح', 'ok'], [graded - passed, 'لم يجتز', 'bad']]} />}
          {!results ? <Skeleton /> : !exam.rubric ? (
            <EmptyState icon="document-add-bold">اختبار قديم بدون معايير تقييم — أنشئ اختبارًا جديدًا لرصد الدرجات</EmptyState>
          ) : (
            <Section title={grader && !published ? 'رصد الدرجات' : 'النتائج'}>
              {roster.map((s) => (grader && !published
                ? <GradeCard key={s.id} exam={exam} student={s} result={byStudent[s.id]} actor={actor} onSaved={load} />
                : <ResultCard key={s.id} exam={exam} r={byStudent[s.id]} name={s.personalInfo.fullName} />))}
            </Section>
          )}
          <div className="px-4 space-y-2.5 mt-2">
            {grader && !published && exam.rubric && (
              <Button block icon="check-circle-bold" busy={publishing} disabled={graded < roster.length}
                onClick={async () => { if (confirm('نشر النتائج؟ لا يمكن تعديل الدرجات بعد النشر.') && (await publish())) load() }}>
                نشر النتائج {graded < roster.length ? `(متبقٍ ${roster.length - graded})` : ''}
              </Button>
            )}
            {grader && published && (results || []).some((r) => !r.passed) && (
              <Button block variant="secondary" icon="refresh-bold" busy={retaking} onClick={async () => (await retake()) && nav('/exams')}>جدولة إعادة لمن لم يجتز</Button>
            )}
            {canDelete && <Button block variant="danger" icon="trash-bin-trash-bold" busy={removing} onClick={async () => { if (confirm('إلغاء الاختبار؟') && (await remove())) nav('/exams', { replace: true }) }}>إلغاء الاختبار</Button>}
          </div>
        </>
      )}
    </Page>
  )
}

function ResultCard({ exam, r, name }) {
  if (!r) return <Card className="p-3 mb-2 flex items-center justify-between"><span className="text-sm font-bold">{name}</span><Badge>لم يُرصد</Badge></Card>
  const g = r.absent ? { label: 'غائب', tone: 'muted' } : gradeOf(r.percent, exam.passPercent ?? 60)
  return (
    <Card className="p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{name || r.studentName}</span>
        <Badge tone={g.tone}>{g.label}</Badge>
      </div>
      {!r.absent && (
        <>
          <div className="text-2xl font-extrabold text-gold-600 mt-1">{r.total}<span className="text-sm text-ink-muted"> / {exam.totalMarks} • {r.percent}%</span></div>
          <div className="flex flex-wrap gap-1.5 mt-2">{(exam.rubric || []).map((c) => <Badge key={c.key}>{c.label}: {r.scores?.[c.key] ?? '—'}/{c.max}</Badge>)}</div>
        </>
      )}
      {r.notes && <div className="text-xs text-ink-soft mt-2">{r.notes}</div>}
    </Card>
  )
}

function GradeCard({ exam, student, result, actor, onSaved }) {
  const init = () => ({ absent: !!result?.absent, notes: result?.notes || '', scores: Object.fromEntries(exam.rubric.map((c) => [c.key, result?.scores?.[c.key] ?? ''])) })
  const [f, setF] = useState(init)
  const [open, setOpen] = useState(!result)
  useEffect(() => { setF(init()) }, [result?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  let preview = null
  try { preview = scoreResult(exam, f.scores, f.absent) } catch { preview = null }
  const [save, busy] = useAction(() => saveResult(exam, student, f, actor), { success: (r) => `${student.personalInfo.fullName.split(' ')[0]}: ${r.absent ? 'غائب' : `${r.total} — ${r.grade}`}` })

  return (
    <Card className={cx('p-3 mb-2', result && 'border-ok/30')}>
      <button type="button" className="w-full flex items-center gap-2.5 text-right" onClick={() => setOpen(!open)}>
        <Avatar name={student.personalInfo.fullName} size={34} />
        <span className="flex-1 text-sm font-bold truncate">{student.personalInfo.fullName}</span>
        {result ? <Badge tone={result.absent ? 'muted' : result.passed ? 'ok' : 'bad'}>{result.absent ? 'غائب' : `${result.total} • ${result.grade}`}</Badge> : <Badge tone="warn">لم يُرصد</Badge>}
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-ink-soft">غائب عن الاختبار</span><Toggle checked={f.absent} onChange={(v) => setF({ ...f, absent: v })} /></div>
          {!f.absent && (
            <div className="grid grid-cols-2 gap-2">
              {exam.rubric.map((c) => (
                <Field key={c.key} label={`${c.label} (من ${c.max})`}>
                  <Select value={f.scores[c.key]} onChange={(e) => setF({ ...f, scores: { ...f.scores, [c.key]: e.target.value } })}>
                    <option value="">—</option>
                    {Array.from({ length: c.max * 2 + 1 }, (_, i) => c.max - i / 2).map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
          )}
          <Field label="ملاحظات"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="اختياري" /></Field>
          <div className="flex items-center gap-2">
            <Button className="flex-1" size="sm" icon="check-circle-bold" busy={busy} disabled={!f.absent && !preview}
              onClick={async () => { if (await save()) { onSaved(); setOpen(false) } }}>حفظ الدرجة</Button>
            {preview && !f.absent && <span className="text-sm font-extrabold text-gold-600">{preview.total}/{exam.totalMarks} • {preview.grade}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
