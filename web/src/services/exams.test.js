import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { DEFAULT_RUBRIC, canGrade, createExam, createRetake, gradeOf, myResults, publishResults, resultsFor, saveResult, scoreResult } from './exams'
import { issueCertificate, revokeCertificate, verifyCertificate } from './certificates'
import { resetPointRulesCache } from './points'
import { todayKey } from '@/lib/format'

const admin = { uid: 'demo-admin', role: 'admin', linkedId: 'demo-admin', name: 'المدير' }
const t1 = { uid: 'T1', role: 'teacher', linkedId: 'T1' }
const t2 = { uid: 'T2', role: 'teacher', linkedId: 'T2' }

let group, roster
beforeEach(async () => {
  setDb(createMemoryAdapter()); await seedDemo(db()); resetPointRulesCache()
  group = { id: 'G1', ...(await db().get('groups', 'G1')) }
  const all = await db().list('students')
  roster = all.filter((s) => s.academicInfo?.groupId === 'G1')
})
const getExam = async (id) => ({ id, ...(await db().get('exams', id)) })
const full = { hifz: 60, tajweed: 20, makharij: 10, waqf: 10 }

describe('grading', () => {
  it('grades by percentage against the pass mark', () => {
    expect(gradeOf(95, 60)).toMatchObject({ label: 'ممتاز', passed: true })
    expect(gradeOf(72, 60)).toMatchObject({ label: 'جيد', passed: true })
    expect(gradeOf(61, 60)).toMatchObject({ label: 'مقبول', passed: true })
    expect(gradeOf(59.5, 60)).toMatchObject({ passed: false })
    const exam = { rubric: DEFAULT_RUBRIC, totalMarks: 100, passPercent: 60 }
    expect(scoreResult(exam, { hifz: 50, tajweed: 15, makharij: 8, waqf: 7 })).toMatchObject({ total: 80, percent: 80, grade: 'جيد جدًا' })
    expect(() => scoreResult(exam, { hifz: 70, tajweed: 0, makharij: 0, waqf: 0 })).toThrow('بين 0 و60')
    expect(() => scoreResult(exam, { hifz: 10 })).toThrow('أدخل درجة')
    expect(scoreResult(exam, {}, true)).toMatchObject({ absent: true, passed: false })
  })
})

describe('exam lifecycle', () => {
  it('validates creation; scope from mushaf; official needs a committee', async () => {
    await expect(createExam({ title: '', date: todayKey() }, group, t1)).rejects.toThrow()
    await expect(createExam({ kind: 'official', title: 'رسمي', date: todayKey() }, group, admin)).rejects.toThrow('لجنة')
    const id = await createExam({ title: 'اختبار الملك', date: todayKey(), scopePick: { unit: 'surah', from: 67, to: 67 }, passPercent: 70 }, group, t1)
    const ex = await getExam(id)
    expect(ex).toMatchObject({ kind: 'periodic', totalMarks: 100, passMark: 70, scope: 'الملك' })
    expect(ex.scopeRange.e - ex.scopeRange.s + 1).toBe(30)
  })

  it('official exam: committee grades, publishing awards points, notifies, issues certificates; retake for failures', async () => {
    const id = await createExam({ kind: 'official', title: 'امتحان جزء عمّ', date: todayKey(), committee: ['T2'], certificateType: 'حفظ جزء كامل' }, group, admin)
    const exam = await getExam(id)
    expect(canGrade(exam, t2)).toBe(true)
    expect(canGrade(exam, t1)).toBe(false) // group teacher is not on the committee
    await expect(saveResult(exam, roster[0], { scores: full }, t1)).rejects.toThrow('صلاحية')
    await expect(publishResults(exam, roster, t2)).rejects.toThrow('لم تُرصد')

    const [pass, fail] = roster
    await saveResult(exam, pass, { scores: { hifz: 58, tajweed: 19, makharij: 9, waqf: 9 } }, t2) // 95 → ممتاز
    await saveResult(exam, fail, { scores: { hifz: 30, tajweed: 10, makharij: 5, waqf: 5 } }, t2) // 50 → fail
    for (const s of roster.slice(2)) await saveResult(exam, s, { absent: true }, t2)
    const balBefore = Number((await db().get('pointsBalance', pass.id)).balance)

    const r = await publishResults(exam, roster, t2)
    expect(r.passed).toBe(1)
    const published = await getExam(id)
    expect(published).toMatchObject({ status: 'published', passedCount: 1 })
    expect(Number((await db().get('pointsBalance', pass.id)).balance)).toBe(balBefore + 30) // distinction
    const certs = await db().list('certificates', { where: [['studentId', '==', pass.id], ['examId', '==', id]] })
    expect(certs).toHaveLength(1)
    expect(certs[0]).toMatchObject({ type: 'حفظ جزء كامل', grade: 'ممتاز', examId: id, status: 'valid' })
    expect(certs[0].serial).toMatch(/^DAR-\d{4}-0002$/) // 0001 is the seeded certificate
    expect(await db().list('certificates', { where: [['studentId', '==', fail.id], ['examId', '==', id]] })).toHaveLength(0)
    await expect(saveResult(published, pass, { scores: full }, t2)).rejects.toThrow('نُشرت')
    await expect(publishResults(published, roster, t2)).rejects.toThrow()

    // parents see only published results for their child
    const mine = await myResults(id, { role: 'parent', linkedId: pass.parentId })
    expect(mine.map((x) => x.studentId)).toContain(pass.id)

    const retakeId = await createRetake(published, await resultsFor(id), todayKey(), t2)
    const retake = await getExam(retakeId)
    expect(retake.studentIds.sort()).toEqual(roster.filter((s) => s.id !== pass.id).map((s) => s.id).sort())
    expect(retake).toMatchObject({ retakeOf: id, kind: 'official', committee: ['T2'] })
  })
})

describe('certificates', () => {
  it('sequential serials, public verification, revocation', async () => {
    const st = roster[0]
    const a = await issueCertificate({ student: st, type: 'طالب الشهر' }, admin)
    const b = await issueCertificate({ student: st, type: 'تميّز في التجويد' }, admin)
    expect(a.serial.endsWith('0002')).toBe(true)
    expect(b.serial.endsWith('0003')).toBe(true)
    expect(a.verifyCode).toMatch(/^[A-Z2-9]{8}$/)
    const v = await verifyCertificate(a.verifyCode.toLowerCase())
    expect(v).toMatchObject({ status: 'valid', studentName: st.personalInfo.fullName, type: 'طالب الشهر', serial: a.serial })
    expect(Object.keys(v)).not.toContain('parentId')
    expect(await verifyCertificate('NOPE!!')).toBeNull()
    await expect(revokeCertificate(a, '', admin)).rejects.toThrow()
    await revokeCertificate(a, 'صدرت بالخطأ', admin)
    expect((await verifyCertificate(a.verifyCode)).status).toBe('revoked')
  })
})
