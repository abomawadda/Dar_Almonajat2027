// Exams & tests: periodic tests (by the group teacher) and official exams (by a committee),
// a scope chosen from the mushaf, a weighted rubric, grading, publishing (points, parent notices,
// auto-issued certificates for official exams) and retakes for those who failed.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { pickLabel, pickToRange } from '@/lib/hifz'
import { award, getPointRules } from './points'
import { issueCertificateDoc } from './certificates'

export const EXAM_KINDS = {
  periodic: { label: 'اختبار دوري', tone: 'info' },
  official: { label: 'امتحان رسمي', tone: 'gold' }
}
export const DEFAULT_RUBRIC = [
  { key: 'hifz', label: 'الحفظ', max: 60 },
  { key: 'tajweed', label: 'أحكام التجويد', max: 20 },
  { key: 'makharij', label: 'المخارج والأداء', max: 10 },
  { key: 'waqf', label: 'الوقف والابتداء', max: 10 }
]
export const GRADES = [[90, 'ممتاز', 'ok'], [80, 'جيد جدًا', 'ok'], [70, 'جيد', 'gold'], [0, 'مقبول', 'info']]

/** Grade label for a percentage given the pass mark (percentage). */
export function gradeOf(percent, passPercent) {
  if (percent < passPercent) return { label: 'لم يجتز', tone: 'bad', passed: false }
  const [, label, tone] = GRADES.find(([min]) => percent >= min)
  return { label, tone, passed: true }
}

export function subscribeExams(actor, cb) {
  const sort = (rows) => rows.sort((a, b) => (a.date > b.date ? 1 : -1))
  if (actor.role !== 'teacher') return db().subscribe(COL.EXAMS, {}, (rows) => cb(sort(rows)))
  // teachers: their groups' exams + official exams where they sit on the committee
  let own = [], committee = []
  const emit = () => { const m = new Map([...own, ...committee].map((e) => [e.id, e])); cb(sort([...m.values()])) }
  const u1 = db().subscribe(COL.EXAMS, { where: [['teacherId', '==', actor.linkedId]] }, (r) => { own = r; emit() })
  const u2 = db().subscribe(COL.EXAMS, { where: [['committee', 'array-contains', actor.linkedId]] }, (r) => { committee = r; emit() })
  return () => { u1 && u1(); u2 && u2() }
}

export async function createExam(f, group, actor) {
  if (!f.title?.trim()) throw new Error('اكتب عنوان الاختبار')
  if (!group) throw new Error('اختر الحلقة')
  if (!f.date) throw new Error('اختر التاريخ')
  const kind = EXAM_KINDS[f.kind] ? f.kind : 'periodic'
  const rubric = (f.rubric || DEFAULT_RUBRIC).filter((c) => Number(c.max) > 0).map((c) => ({ key: c.key, label: c.label, max: Math.round(Number(c.max)) }))
  if (!rubric.length) throw new Error('حدد بندًا واحدًا على الأقل في معايير التقييم')
  const totalMarks = rubric.reduce((n, c) => n + c.max, 0)
  const passPercent = Math.min(100, Math.max(1, Math.round(Number(f.passPercent) || 60)))
  const range = f.scopePick ? pickToRange(f.scopePick) : null
  if (f.scopePick && !range) throw new Error('اختر نطاق الاختبار من القوائم')
  if (kind === 'official' && !(f.committee || []).length) throw new Error('اختر عضوًا واحدًا على الأقل في لجنة الامتحان')
  return db().add(COL.EXAMS, {
    kind, title: f.title.trim(), groupId: group.id, groupName: group.name, teacherId: group.teacherId, teacherName: group.teacherName,
    date: f.date, time: f.time || '', duration: Number(f.duration) || 60,
    scopePick: f.scopePick || null, scope: [f.scopePick ? pickLabel(f.scopePick) : '', (f.scopeNote || '').trim()].filter(Boolean).join(' — '),
    scopeRange: range, rubric, totalMarks, passPercent, passMark: Math.ceil((totalMarks * passPercent) / 100),
    committee: kind === 'official' ? f.committee : [], certificateType: kind === 'official' ? (f.certificateType || '') : '',
    studentIds: f.studentIds || null, retakeOf: f.retakeOf || null,
    status: 'scheduled', studentCount: f.studentIds?.length || group.studentCount || 0, createdBy: actor.uid, createdAt: op.now()
  })
}
export const deleteExam = (id) => db().remove(COL.EXAMS, id)

/** Who may grade: staff, the group teacher (periodic), committee members (official). */
export function canGrade(exam, actor) {
  if (actor.role === 'admin' || actor.role === 'supervisor') return true
  if (exam.kind === 'official') return (exam.committee || []).includes(actor.linkedId)
  return actor.role === 'teacher' && exam.teacherId === actor.linkedId
}

export const resultsFor = (examId) => db().list(COL.EXAM_RESULTS, { where: [['examId', '==', examId]] })
/** A student's / parent's own published results for an exam (query carries the field the rules check). */
export const myResults = (examId, actor) =>
  db().list(COL.EXAM_RESULTS, { where: [['examId', '==', examId], [actor.role === 'parent' ? 'parentId' : 'studentId', '==', actor.linkedId], ['published', '==', true]] })
export const resultsForStudent = (studentId, scopeWhere = []) =>
  db().list(COL.EXAM_RESULTS, { where: [['studentId', '==', studentId], ['published', '==', true], ...scopeWhere] })

/** Compute total / percent / grade from rubric scores. Throws on out-of-range input. */
export function scoreResult(exam, scores, absent) {
  if (absent) return { absent: true, total: 0, percent: 0, passed: false, grade: 'غائب' }
  let total = 0
  for (const c of exam.rubric) {
    const v = Number(scores?.[c.key])
    if (scores?.[c.key] === '' || scores?.[c.key] == null || Number.isNaN(v)) throw new Error(`أدخل درجة «${c.label}»`)
    if (v < 0 || v > c.max) throw new Error(`درجة «${c.label}» بين 0 و${c.max}`)
    total += v
  }
  const percent = Math.round((total / exam.totalMarks) * 1000) / 10
  const g = gradeOf(percent, exam.passPercent)
  return { absent: false, total, percent, passed: g.passed, grade: g.label }
}

export async function saveResult(exam, student, { scores, absent, notes }, actor) {
  if (!canGrade(exam, actor)) throw new Error('ليست لديك صلاحية رصد هذا الاختبار')
  if (exam.status === 'published') throw new Error('نُشرت النتائج — لا يمكن التعديل')
  const r = scoreResult(exam, scores, absent)
  await db().set(COL.EXAM_RESULTS, `${exam.id}_${student.id}`, {
    examId: exam.id, examTitle: exam.title, kind: exam.kind, date: exam.date,
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupId: exam.groupId, teacherId: exam.teacherId,
    scores: absent ? {} : Object.fromEntries(exam.rubric.map((c) => [c.key, Number(scores[c.key])])),
    ...r, totalMarks: exam.totalMarks, notes: (notes || '').trim(),
    examinerId: actor.linkedId || actor.uid, published: false, updatedAt: op.now()
  })
  return r
}

/**
 * Publish: lock results, notify parents/students, award points, auto-issue certificates
 * (official exams with a certificate type) for those who passed.
 */
export async function publishResults(exam, roster, actor) {
  if (!canGrade(exam, actor)) throw new Error('ليست لديك صلاحية نشر النتائج')
  if (exam.status === 'published') throw new Error('نُشرت النتائج مسبقًا')
  const results = await resultsFor(exam.id)
  const byStudent = Object.fromEntries(results.map((r) => [r.studentId, r]))
  const missing = roster.filter((s) => !byStudent[s.id])
  if (missing.length) throw new Error(`لم تُرصد درجات: ${missing.map((s) => s.personalInfo.fullName.split(' ')[0]).join('، ')}`)
  const rules = await getPointRules()
  const b = db().batch()
  let passed = 0
  for (const s of roster) {
    const r = byStudent[s.id]
    b.update(COL.EXAM_RESULTS, r.id, { published: true, publishedAt: op.now() })
    if (r.absent) continue
    if (r.passed) passed++
    const pts = r.passed ? (r.percent >= 90 ? Number(rules.exam.distinction) : Number(rules.exam.pass)) || 0 : 0
    award(b, { student: s, delta: pts, source: 'exam', refId: r.id, reason: `${exam.title} — ${r.grade}` }, actor)
    const body = `${exam.title}: ${r.total}/${exam.totalMarks} (${r.percent}%) — ${r.grade}`
    notify(b, s.parentId, 'exam', `نتيجة ${s.personalInfo.fullName.split(' ')[0]}`, body)
    if (s.id !== s.parentId) notify(b, s.id, 'exam', 'نتيجة اختبارك', body)
    if (r.passed && exam.kind === 'official' && exam.certificateType) {
      await issueCertificateDoc(b, { student: s, type: exam.certificateType, notes: `${exam.title} — ${r.grade} (${r.percent}%)`, examId: exam.id, grade: r.grade }, actor)
    }
  }
  b.update(COL.EXAMS, exam.id, { status: 'published', passedCount: passed, gradedCount: results.length, publishedAt: op.now(), publishedBy: actor.uid })
  await b.commit()
  return { passed, total: roster.length }
}

/** New exam for the students who failed (or were absent), same rubric and scope. */
export async function createRetake(exam, results, date, actor) {
  const ids = results.filter((r) => !r.passed).map((r) => r.studentId)
  if (!ids.length) throw new Error('لا يوجد طلاب يحتاجون إعادة')
  const group = { id: exam.groupId, name: exam.groupName, teacherId: exam.teacherId, teacherName: exam.teacherName }
  return createExam({ ...exam, title: `إعادة: ${exam.title.replace(/^إعادة: /, '')}`, date, scopeNote: '', scopePick: exam.scopePick, studentIds: ids, retakeOf: exam.id }, group, actor)
}

function notify(b, userId, type, title, body) {
  if (userId) b.add(COL.NOTIFICATIONS, { userId, type, title, body, isRead: false, createdAt: op.now() })
}
