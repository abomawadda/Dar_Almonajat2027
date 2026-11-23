import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { saveAttendanceDay } from './academic'
import { datesBetween, decideExcuse, excusesForDay, submitExcuseRequest } from './excuses'
import { decideRedemption, requestReward, saveReward } from './rewards'
import { resetPointRulesCache } from './points'
import { addDays, todayKey } from '@/lib/format'

const teacher = { uid: 'T1', role: 'teacher', linkedId: 'T1' }
const admin = { uid: 'demo-admin', role: 'admin', linkedId: 'demo-admin' }
const parentOf = (st) => ({ uid: st.parentId, role: 'parent', linkedId: st.parentId })
const student = async (id) => ({ id, ...(await db().get('students', id)) })
const balance = async (id) => Number((await db().get('pointsBalance', id))?.balance) || 0

beforeEach(async () => { setDb(createMemoryAdapter()); await seedDemo(db()); resetPointRulesCache() })

describe('excuses', () => {
  it('validates the date range', async () => {
    expect(datesBetween('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    const st = await student('S1')
    await expect(submitExcuseRequest({ student: st, fromDate: '2026-12-05', toDate: '2026-12-01', reason: 'سفر' }, parentOf(st))).rejects.toThrow('قبل')
    await expect(submitExcuseRequest({ student: st, fromDate: todayKey(addDays(-30)), reason: 'سفر' }, parentOf(st))).rejects.toThrow('أسبوع')
    await expect(submitExcuseRequest({ student: st, fromDate: todayKey(), toDate: todayKey(addDays(20)), reason: 'سفر' }, parentOf(st))).rejects.toThrow('أقصى')
  })

  it('approval marks covered days excused, keeps recorded presence, refunds absence points', async () => {
    const st = await student('S1')
    const group = { id: st.academicInfo.groupId, ...(await db().get('groups', st.academicInfo.groupId)) }
    const roster = await db().list('students', { where: [['academicInfo.groupId', '==', group.id]] })
    const d0 = todayKey(), d1 = todayKey(addDays(1)), dm1 = todayKey(addDays(-1))
    await saveAttendanceDay({ group, date: dm1, students: roster, marks: { S1: 'absent' } }, teacher)
    await saveAttendanceDay({ group, date: d0, students: roster, marks: {} }, teacher) // S1 present today
    const before = await balance('S1')
    await submitExcuseRequest({ student: st, fromDate: dm1, toDate: d1, reason: 'ظرف صحي / مرض', attachment: { name: 'r.pdf', url: 'data:x' } }, parentOf(st))
    const [exc] = await db().list('excuses')
    expect(exc).toMatchObject({ status: 'pending', days: 3 })
    expect((await excusesForDay(group.id, d1)).S1.status).toBe('pending')
    await decideExcuse(exc, true, 'سلامته', teacher)
    expect((await db().get('attendance', `${dm1}_S1`)).status).toBe('excused')
    expect((await db().get('attendance', `${d0}_S1`)).status).toBe('present')
    expect((await db().get('attendance', `${d1}_S1`)).status).toBe('excused')
    expect(await balance('S1')).toBe(before + 3) // absence (-3) refunded to excused (0)
    await expect(decideExcuse({ ...exc, status: 'approved' }, true, '', teacher)).rejects.toThrow()
  })

  it('rejection notifies the parent and writes no attendance', async () => {
    const st = await student('S2')
    await submitExcuseRequest({ student: st, fromDate: todayKey(addDays(2)), reason: 'سفر' }, parentOf(st))
    const [exc] = await db().list('excuses')
    await decideExcuse(exc, false, 'يرجى إحضار ما يثبت', teacher)
    expect(await db().get('attendance', `${todayKey(addDays(2))}_S2`)).toBeNull()
    const n = await db().list('notifications', { where: [['userId', '==', st.parentId], ['type', '==', 'excuse']] })
    expect(n[0].title).toContain('رُفض')
  })
})

describe('rewards store', () => {
  it('request → approve deducts points & stock → deliver; balance and reservations enforced', async () => {
    const st = await student('S1')
    const bal0 = await balance('S1')
    const reward = { id: 'R1', ...(await db().get('rewards', 'R1')) }
    await requestReward(reward, st, parentOf(st))
    const [red] = await db().list('redemptions')
    expect(red).toMatchObject({ status: 'pending', cost: reward.cost })
    // reserved points count against a second request when the balance is not enough for both
    const big = { id: 'X', name: 'كبير', cost: bal0 - reward.cost + 1, active: true, stock: null }
    await expect(requestReward(big, st, parentOf(st))).rejects.toThrow('الرصيد المتاح')
    await decideRedemption(red, 'approve', admin)
    expect(await balance('S1')).toBe(bal0 - reward.cost)
    expect((await db().get('rewards', 'R1')).stock).toBe(reward.stock - 1)
    await expect(decideRedemption({ ...red, status: 'approved' }, 'approve', admin)).rejects.toThrow()
    await decideRedemption({ ...red, status: 'approved' }, 'deliver', admin)
    expect((await db().get('redemptions', red.id)).status).toBe('delivered')
  })

  it('validates the catalog and out-of-stock', async () => {
    expect(() => saveReward({ name: '', cost: 5 }, admin)).toThrow()
    expect(() => saveReward({ name: 'x', cost: 0 }, admin)).toThrow()
    const st = await student('S1')
    await expect(requestReward({ id: 'Z', name: 'z', cost: 1, active: true, stock: 0 }, st, parentOf(st))).rejects.toThrow('نفدت')
  })
})
