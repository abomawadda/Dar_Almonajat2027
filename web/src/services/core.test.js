import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { op } from '@/lib/db/ops'
import { seedDemo } from '@/data/seed'
import * as admissions from './admissions'
import * as academic from './academic'
import * as comms from './comms'
import { studentScope, recordScope, audienceScope } from './scope'
import { validateRange, nextAyahStart, suggestMastery, SURAHS } from '@/config/quran'
import { can } from '@/config/permissions'
import { DEMO_USERS } from '@/config/roles'
import { fmtMoney, todayKey, waPhone } from '@/lib/format'

const actorFor = (role) => { const p = DEMO_USERS[role]; return { uid: p.uid, name: p.displayName, role, linkedId: p.teacherId || p.studentId || p.parentId || p.uid } }
const admin = actorFor('admin')
const ctx = () => admissions.prepareApproval

beforeEach(async () => {
  setDb(createMemoryAdapter())
  await seedDemo(db())
})

describe('memory adapter', () => {
  it('applies increment, arrayUnion and dotted paths', async () => {
    await db().set('x', 'a', { n: 1, tags: ['a'], deep: { v: 1 } })
    await db().update('x', 'a', { n: op.inc(2), tags: op.union('a', 'b'), 'deep.w': 5 })
    expect(await db().get('x', 'a')).toMatchObject({ n: 3, tags: ['a', 'b'], deep: { v: 1, w: 5 } })
  })
  it('rolls back a failed batch completely', async () => {
    const b = db().batch()
    b.set('x', 'ok', { v: 1 })
    b.update('x', 'missing', { v: 2 })
    await expect(b.commit()).rejects.toThrow()
    expect(await db().get('x', 'ok')).toBeNull()
  })
  it('supports in / array-contains / orderBy / limit', async () => {
    const r = await db().list('students', { where: [['parentId', 'in', ['P1']]], orderBy: ['personalInfo.fullName', 'asc'], limit: 1 })
    expect(r).toHaveLength(1)
    expect((await db().list('parents', { where: [['childrenIds', 'array-contains', 'S6']] }))[0].id).toBe('P1')
  })
})

describe('admissions', () => {
  it('validates the public form', () => {
    expect(admissions.validateApplication({ fullName: 'أحمد', phone: '12' })).toMatchObject({ fullName: expect.any(String), birthDate: expect.any(String), phone: expect.any(String), guardianName: expect.any(String) })
    expect(admissions.validateApplication({ fullName: 'أحمد علي', birthDate: '2015-01-01', guardianName: 'علي', phone: '01012345678', nationalId: '123' })).toMatchObject({ nationalId: expect.any(String) })
    expect(admissions.validateApplication({ fullName: 'أحمد علي', birthDate: '2015-01-01', guardianName: 'علي', phone: '01012345678', nationalId: '30501011234567' })).toEqual({})
  })

  it('approve creates student, links group/teacher/parent, fee and notifications atomically', async () => {
    const id = await admissions.submitApplication({ fullName: 'عمر خالد السبيعي', birthDate: '2015-06-01', guardianName: 'خالد', phone: '0559998877', email: 'k@x.com', juzCount: 3 })
    const app = await db().get('applications', id)
    expect(app.status).toBe('pending')
    const before = (await db().get('groups', 'G1')).studentCount
    const res = await admissions.approve(app, { groupId: 'G1', createAccount: true, createFee: true, notify: true }, admin)

    const st = await db().get('students', res.studentId)
    expect(st.academicInfo).toMatchObject({ groupId: 'G1', teacherId: 'T1', currentJuz: 3 })
    expect(st.parentId).toBe(res.parentId)
    expect((await db().get('parents', res.parentId)).childrenIds).toEqual([res.studentId])
    expect((await db().get('users', res.parentId))).toMatchObject({ role: 'parent', parentId: res.parentId })
    expect((await db().get('groups', 'G1')).studentCount).toBe(before + 1)
    expect(await db().get('hifzProgress', res.studentId)).toBeTruthy()
    expect((await db().get('applications', id))).toMatchObject({ status: 'approved', decisionData: { studentId: res.studentId } })
    expect(await db().list('payments', { where: [['studentId', '==', res.studentId]] })).toHaveLength(1)
    const n = await db().list('notifications', { where: [['type', '==', 'admission']] })
    expect(n.map((x) => x.userId).sort()).toEqual([res.parentId, 'T1'].sort())
    expect(res.credentials).toMatchObject({ email: 'k@x.com', password: expect.stringMatching(/^Dar\d{6}$/) })
  })

  it('detects an existing parent by phone and links instead of duplicating', async () => {
    const app = await db().get('applications', 'APP-1004') // phone of P4
    const prep = await admissions.prepareApproval(app)
    expect(prep.existingParent.id).toBe('P4')
    await admissions.approve(app, { groupId: prep.suggestedGroupId, linkExistingParentId: 'P4', notify: false }, admin, prep)
    expect((await db().get('parents', 'P4')).childrenIds).toHaveLength(2)
    expect(await db().list('parents', { where: [['phone', '==', '01000000004']] })).toHaveLength(1)
  })

  it('refuses a full group and a second approval', async () => {
    await db().update('groups', 'G2', { studentCount: 15 })
    const app = await db().get('applications', 'APP-1001')
    await expect(admissions.approve(app, { groupId: 'G2' }, admin)).rejects.toThrow('مكتملة')
    await admissions.approve(app, { groupId: 'G1' }, admin)
    const again = await db().get('applications', 'APP-1001')
    await expect(admissions.approve(again, { groupId: 'G1' }, admin)).rejects.toThrow('مقبول')
  })

  it('reject requires a reason; defer sets waitlisted', async () => {
    await expect(admissions.reject('APP-1002', { reason: '' }, admin)).rejects.toThrow()
    await admissions.reject('APP-1002', { reason: 'بيانات غير مكتملة' }, admin)
    expect((await db().get('applications', 'APP-1002')).status).toBe('rejected')
    await admissions.defer('APP-1003', { reason: 'سبب آخر', reviewAt: '2026-12-01' }, admin)
    expect((await db().get('applications', 'APP-1003'))).toMatchObject({ status: 'waitlisted', decisionData: { reviewAt: '2026-12-01' } })
  })
})

describe('academic', () => {
  it('attendance: one doc per student per day, absence notifies the parent once', async () => {
    const group = await db().get('groups', 'G1')
    const students = await db().list('students', { where: [['academicInfo.groupId', '==', 'G1']] })
    const args = { group, date: '2026-10-31', students, marks: { S2: 'absent' }, alreadySaved: false }
    await academic.saveAttendanceDay(args, admin)
    await academic.saveAttendanceDay({ ...args, alreadySaved: true }, admin)
    expect(await db().list('attendance', { where: [['groupId', '==', 'G1'], ['date', '==', '2026-10-31']] })).toHaveLength(students.length)
    expect(await db().list('notifications', { where: [['userId', '==', 'P2'], ['type', '==', 'absence']] })).toHaveLength(1)
    expect((await academic.loadAttendanceDay('G1', '2026-10-31')).marks.S2).toBe('absent')
  })

  it('hifz: validates range against the surah and updates progress', async () => {
    const s = await db().get('students', 'S1')
    const t = actorFor('teacher')
    await expect(academic.recordHifz({ student: s, type: 'new', surah: 'هود', from: 1, to: 200, mastery: 'good' }, t)).rejects.toThrow('123')
    const before = (await db().get('hifzProgress', 'S1')).totalMemorized
    expect(await academic.recordHifz({ student: s, type: 'new', surah: 'هود', from: 71, to: 100, mastery: 'excellent' }, t)).toBe(30)
    expect((await db().get('hifzProgress', 'S1')).totalMemorized).toBe(before + 30)
    await academic.recordHifz({ student: s, type: 'revision', surah: 'يونس', from: 1, to: 50, mastery: 'good' }, t)
    expect((await db().get('hifzProgress', 'S1')).totalMemorized).toBe(before + 30) // revision does not add
  })

  it('hifz: supports combined new + revision, mistakes, homework, student notification and todayHifzIds', async () => {
    const s = await db().get('students', 'S3')
    const t = { uid: 'T2', name: 'الشيخ عبدالله الحصري', role: 'teacher', linkedId: 'T2' }
    const before = (await db().get('hifzProgress', 'S3')).totalMemorized
    const count = await academic.recordHifz({
      student: s,
      type: 'both',
      surah: 'الأنفال',
      from: 1,
      to: 20,
      revSurah: 'الأعراف',
      revFrom: 1,
      revTo: 30,
      hifzMistakes: 2,
      tajweedMistakes: 1,
      mastery: 'good',
      homework: 'حفظ الأنفال ٢١–٤٠'
    }, t)
    expect(count).toBe(50)
    expect((await db().get('hifzProgress', 'S3')).totalMemorized).toBe(before + 20)
    const updatedStudent = await db().get('students', 'S3')
    expect(updatedStudent.academicInfo.lastHomework).toBe('حفظ الأنفال ٢١–٤٠')
    expect(updatedStudent.academicInfo.lastHifz).toMatchObject({ surahName: 'الأنفال', fromAyah: 1, toAyah: 20 })
    const parentNotifs = await db().list('notifications', { where: [['userId', '==', 'P3'], ['type', '==', 'hifz']] })
    const studentNotifs = await db().list('notifications', { where: [['userId', '==', 'S3'], ['type', '==', 'hifz']] })
    expect(parentNotifs).toHaveLength(1)
    expect(studentNotifs).toHaveLength(1)
    expect(parentNotifs[0].body).toContain('أخطاء: 3')
    expect(await academic.todayHifzIds(t)).toContain('S3')
  })

  it('attendance: parent excuse notifies teacher, shows in loadAttendanceDay, and survives saveAttendanceDay', async () => {
    const parent = actorFor('parent')
    const s = await db().get('students', 'S1')
    const date = todayKey()
    await academic.submitExcuse({ student: s, date, reason: 'ظرف عائلي', note: 'سفر ليوم واحد' }, parent)
    const day = await academic.loadAttendanceDay('G1', date)
    expect(day.saved).toBe(false)
    expect(day.marks.S1).toBe('excused')
    expect(day.excuses.S1).toMatchObject({ reason: 'ظرف عائلي', note: 'سفر ليوم واحد', byParent: true })
    const teacherNotifs = await db().list('notifications', { where: [['userId', '==', 'T1'], ['type', '==', 'excuse']] })
    expect(teacherNotifs).toHaveLength(1)

    const group = await db().get('groups', 'G1')
    const students = await db().list('students', { where: [['academicInfo.groupId', '==', 'G1']] })
    await academic.saveAttendanceDay({ group, date, students, marks: day.marks, excuses: day.excuses, alreadySaved: day.saved }, admin)
    const savedDoc = await db().get('attendance', `${date}_S1`)
    expect(savedDoc).toMatchObject({ status: 'excused', excuseReason: 'ظرف عائلي', excusedByParent: true })
  })

  it('behavior: sign follows type', async () => {
    const s = await db().get('students', 'S3')
    await academic.addBehavior({ student: s, type: 'negative', category: 'أدب وسلوك', description: 'x', points: 5 }, admin)
    const rows = await db().list('behavior', { where: [['studentId', '==', 'S3']] })
    expect(rows.some((r) => r.points === -5)).toBe(true)
  })
})

describe('comms', () => {
  it('circular acknowledgement adds the reader once', async () => {
    const [c] = await db().list('circulars')
    const t = actorFor('teacher')
    await comms.acknowledgeCircular(c.id, t)
    await comms.acknowledgeCircular(c.id, t)
    expect((await db().get('circulars', c.id)).acks).toEqual(['T1'])
  })
})

describe('scoping and config', () => {
  it('scopes queries by role', () => {
    expect(studentScope(admin)).toEqual({})
    expect(studentScope(actorFor('teacher')).where[0]).toEqual(['academicInfo.teacherId', '==', 'T1'])
    expect(studentScope(actorFor('student'))).toBeNull()
    expect(recordScope(actorFor('parent')).where[0]).toEqual(['parentId', '==', 'P1'])
    expect(audienceScope(actorFor('teacher')).where[0][2]).toEqual(['all', 'teachers'])
  })
  it('permissions', () => {
    expect(can('admin', 'applications.decide')).toBe(true)
    expect(can('supervisor', 'applications.decide')).toBe(false)
    expect(can('teacher', 'certificates.issue')).toBe(false)
  })
  it('quran data', () => {
    expect(SURAHS).toHaveLength(114)
    expect(validateRange('الناس', 1, 6)).toEqual({ ok: true, count: 6 })
    expect(nextAyahStart('هود', 70)).toEqual({ surah: 'هود', from: 71 })
    expect(nextAyahStart('هود', 123)).toEqual({ surah: 'يوسف', from: 1 })
    expect(suggestMastery(1, 0)).toBe('excellent')
    expect(suggestMastery(2, 1)).toBe('good')
    expect(suggestMastery(3, 2)).toBe('average')
    expect(suggestMastery(4, 2)).toBe('weak')
  })
  it('egypt formatting helpers', () => {
    expect(fmtMoney(300)).toContain('ج.م')
    expect(waPhone('01012345678')).toBe('201012345678')
  })
})
