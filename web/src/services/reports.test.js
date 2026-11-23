import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { recordHifz, saveAttendanceDay } from './academic'
import { atRisk, attendanceByStudent, examsSummary, groupSummary, hifzByStudent, loadReportData, periodRange, teacherIndex, toCsv } from './reports'
import { addDays, todayKey } from '@/lib/format'

const teacher = { uid: 'T1', role: 'teacher', linkedId: 'T1' }
const admin = { uid: 'demo-admin', role: 'admin', linkedId: 'demo-admin' }
beforeEach(async () => { setDb(createMemoryAdapter()); await seedDemo(db()) })

describe('periods', () => {
  it('computes month / last month / rolling windows', () => {
    expect(periodRange('month', '2026-11-23')).toMatchObject({ from: '2026-11-01', to: '2026-11-23' })
    expect(periodRange('last_month', '2026-03-15')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('30', '2026-11-30').from).toBe('2026-11-01')
  })
})

describe('aggregation', () => {
  const students = [
    { id: 'A', personalInfo: { fullName: 'أحمد' }, academicInfo: { groupId: 'G1', groupName: 'ح1', teacherId: 'T1' } },
    { id: 'B', personalInfo: { fullName: 'بلال' }, academicInfo: { groupId: 'G1', groupName: 'ح1', teacherId: 'T1' } }
  ]
  const range = { from: '2026-11-01', to: '2026-11-14' } // 2 weeks
  const hifz = [
    { studentId: 'A', groupId: 'G1', date: '2026-11-10', masteryLevel: 'excellent', status: 'accepted', newMemorization: { ayahCount: 20 }, revision: { ayahCount: 50 }, hifzMistakes: 1 },
    { studentId: 'A', groupId: 'G1', date: '2026-11-12', masteryLevel: 'good', status: 'accepted', newMemorization: { ayahCount: 20 }, hifzMistakes: 2 },
    { studentId: 'B', groupId: 'G1', date: '2026-11-02', masteryLevel: 'weak', status: 'repeat', newMemorization: { ayahCount: 10 }, hifzMistakes: 7 }
  ]
  const att = [
    ...['01', '02', '03', '04'].map((d) => ({ studentId: 'A', groupId: 'G1', date: `2026-11-${d}`, status: 'present' })),
    { studentId: 'B', groupId: 'G1', date: '2026-11-01', status: 'present' },
    ...['02', '03', '04'].map((d) => ({ studentId: 'B', groupId: 'G1', date: `2026-11-${d}`, status: 'absent' })),
    { studentId: 'B', groupId: 'G1', date: '2026-11-05', status: 'excused' }
  ]
  const results = [
    { examId: 'E1', examTitle: 'الملك', date: '2026-11-10', groupId: 'G1', studentId: 'A', percent: 92, passed: true, published: true },
    { examId: 'E1', examTitle: 'الملك', date: '2026-11-10', groupId: 'G1', studentId: 'B', percent: 40, passed: false, published: true }
  ]

  it('hifz, attendance and exam figures', () => {
    const h = hifzByStudent(hifz, students, range)
    expect(h[0]).toMatchObject({ newAyahs: 40, reviewAyahs: 50, sessions: 2, perWeek: 20, repeatRate: 0, mastery: 90, mistakes: 1.5, lastSession: '2026-11-12' })
    expect(h[1]).toMatchObject({ newAyahs: 0, repeatRate: 100, mastery: 35 })
    const a = attendanceByStudent(att, students)
    expect(a[0].rate).toBe(100)
    expect(a[1]).toMatchObject({ absent: 3, excused: 1, rate: 25 }) // excused days don't count
    expect(examsSummary(results)[0]).toMatchObject({ count: 2, passRate: 50, average: 66 })
  })

  it('group summary, teacher index and early warning', () => {
    const h = hifzByStudent(hifz, students, range), a = attendanceByStudent(att, students)
    const [g] = groupSummary([{ id: 'G1', name: 'ح1', teacherId: 'T1' }], h, a, results)
    expect(g).toMatchObject({ students: 2, newAyahs: 40, perWeek: 10, mastery: 63, attendance: 63, passRate: 50 })
    const idx = teacherIndex(g)
    expect(idx).toBeGreaterThan(40); expect(idx).toBeLessThan(70)
    expect(teacherIndex({ perWeek: 20, mastery: 100, attendance: 100, passRate: null })).toBe(100) // no exams → not penalised
    const risk = atRisk(h, a, results, { today: '2026-11-14' })
    expect(risk.map((r) => r.studentId)).toEqual(['B'])
    expect(risk[0].level).toBe('high')
    expect(risk[0].reasons.join(' ')).toMatch(/حضور 25%/)
    expect(risk[0].reasons.join(' ')).toMatch(/لم يجتز 1/)
  })

  it('CSV export keeps Arabic and escapes', () => {
    const csv = toCsv([{ a: 'أحمد, محمد', b: 5 }], [['a', 'الاسم'], [(r) => r.b * 2, 'ضعف']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"أحمد, محمد",10')
  })
})

describe('loading', () => {
  it('teachers only receive their own groups; staff receive all', async () => {
    const st = { id: 'S1', ...(await db().get('students', 'S1')) }
    await recordHifz({ student: st, mastery: 'good', segments: { far: { unit: 'juz', from: 30, to: 30 } } }, teacher)
    const g3 = { id: 'G3', ...(await db().get('groups', 'G3')) }
    const roster = await db().list('students', { where: [['academicInfo.groupId', '==', 'G3']] })
    await saveAttendanceDay({ group: g3, date: todayKey(), students: roster, marks: {} }, admin)
    const range = { from: todayKey(addDays(-1)), to: todayKey() }
    const mine = await loadReportData(range, teacher)
    expect(mine.attendance.every((r) => r.teacherId === 'T1')).toBe(true)
    expect(mine.hifz.length).toBeGreaterThan(0)
    const all = await loadReportData(range, admin)
    expect(all.attendance.length).toBeGreaterThan(mine.attendance.length)
  })
})

describe('demo history', () => {
  it('feeds every report with a month of data', async () => {
    setDb(createMemoryAdapter()); await seedDemo(db(), { history: true })
    const range = periodRange('30')
    const data = await loadReportData(range, admin)
    const students = (await db().list('students')).map((s) => ({ ...s }))
    const h = hifzByStudent(data.hifz, students, range)
    const a = attendanceByStudent(data.attendance, students)
    expect(h.every((x) => x.sessions > 5)).toBe(true)
    expect(a.every((x) => x.rate != null)).toBe(true)
    expect(atRisk(h, a, data.results).length).toBeGreaterThan(0) // S5 is absent every 4th day
  })
})
