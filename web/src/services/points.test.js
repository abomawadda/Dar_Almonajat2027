import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { recordHifz, saveAttendanceDay, addBehavior } from './academic'
import { manualPoints, rankBalances, resetPointRulesCache, savePointRules, levelOf } from './points'
import { addDays, todayKey } from '@/lib/format'

const teacher = { uid: 'T1', role: 'teacher', linkedId: 'T1', name: 'الشيخ' }
const student = async (id) => ({ id, ...(await db().get('students', id)) })
const bal = async (id) => (await db().get('pointsBalance', id)) || {}
const start = {}
const delta = async (id) => ({ balance: ((await bal(id)).balance || 0) - (start[id] || 0) })

beforeEach(async () => {
  setDb(createMemoryAdapter()); await seedDemo(db()); resetPointRulesCache()
  for (const b of await db().list('pointsBalance')) start[b.id] = b.balance
})

describe('points', () => {
  it('hifz awards per recited track by mastery; repeat earns nothing for the new portion', async () => {
    const st = await student('S6')
    await recordHifz({ student: st, mastery: 'excellent', segments: { new: { unit: 'ayahs', surah: 57, from: 1, to: 3 }, far: { unit: 'juz', from: 30, to: 30 } } }, teacher)
    expect((await delta('S6')).balance).toBe(20)
    await savePointRules({ hifz: { weak: 0 } }); resetPointRulesCache()
    await recordHifz({ student: st, mastery: 'weak', hifzMistakes: 9, segments: { new: { unit: 'ayahs', surah: 57, from: 4, to: 6 } } }, teacher)
    expect((await delta('S6')).balance).toBe(20)
  })

  it('completing a juz adds the juz bonus and notifies the parent', async () => {
    const st = await student('S6') // memorized juz 28–30
    // juz 27 = الذاريات 31 → الحديد 29
    await recordHifz({ student: st, mastery: 'good', segments: { new: { unit: 'juz', from: 27, to: 27 } } }, teacher)
    const ledger = await db().list('pointsLedger', { where: [['studentId', '==', 'S6'], ['source', '==', 'juz']] })
    expect(ledger).toHaveLength(1)
    expect(ledger[0].delta).toBe(50)
    const n = await db().list('notifications', { where: [['type', '==', 'achievement']] })
    expect(n).toHaveLength(1)
  })

  it('attendance points move only by the difference when a day is re-saved', async () => {
    const group = { id: 'G1', ...(await db().get('groups', 'G1')) }
    const all = await db().list('students', { where: [['academicInfo.groupId', '==', 'G1']] })
    const date = todayKey()
    const s0 = all[0].id
    await saveAttendanceDay({ group, date, students: all, marks: {} }, teacher)
    expect((await delta(s0)).balance).toBe(2)
    await saveAttendanceDay({ group, date, students: all, marks: { [s0]: 'absent' }, alreadySaved: true }, teacher)
    expect((await delta(s0)).balance).toBe(-3)
    await saveAttendanceDay({ group, date, students: all, marks: { [s0]: 'absent' }, alreadySaved: true }, teacher)
    expect((await delta(s0)).balance).toBe(-3)
  })

  it('alerts parent, teacher and staff on the Nth consecutive absence', async () => {
    const group = { id: 'G1', ...(await db().get('groups', 'G1')) }
    const all = await db().list('students', { where: [['academicInfo.groupId', '==', 'G1']] })
    const s0 = all[0]
    for (const d of [-2, -1, 0]) {
      await saveAttendanceDay({ group, date: todayKey(addDays(d)), students: all, marks: { [s0.id]: 'absent' } }, teacher)
    }
    const alerts = await db().list('notifications', { where: [['type', '==', 'absence_streak']] })
    expect(alerts.map((a) => a.userId).sort()).toEqual([s0.parentId, group.teacherId, 'staff'].sort())
  })

  it('behavior and manual points go through the ledger; ranking and levels', async () => {
    const st = await student('S1')
    await addBehavior({ student: st, type: 'positive', category: 'أدب وسلوك', description: 'تعاون', points: 5 }, teacher)
    await manualPoints({ student: st, delta: -2, reason: 'تأخر الواجب' }, teacher)
    expect((await delta('S1')).balance).toBe(3)
    await expect(manualPoints({ student: st, delta: 3, reason: '' }, teacher)).rejects.toThrow()
    const ranked = rankBalances([
      { studentId: 'a', balance: 10, months: { '2026-11': 4 } },
      { studentId: 'b', balance: 10, months: { '2026-11': 9 } },
      { studentId: 'c', balance: 5 }
    ])
    expect(ranked.map((x) => x.rank)).toEqual([1, 1, 3])
    expect(rankBalances([{ studentId: 'a', balance: 1, months: { '2026-11': 4 } }, { studentId: 'b', balance: 1, months: { '2026-11': 9 } }], { period: '2026-11' })[0].studentId).toBe('b')
    expect(levelOf(320)).toBe('متميّز')
  })
})
