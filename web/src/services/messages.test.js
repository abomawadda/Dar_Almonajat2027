import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { contactsFor, markConversationRead, myKey, otherName, sendMessage } from './messages'
import { dailySummaryFor } from './summary'
import { recordHifz, saveAttendanceDay } from './academic'
import { todayKey } from '@/lib/format'

const parent = { uid: 'P1', role: 'parent', linkedId: 'P1', name: 'طارق الشناوي' }
const teacher = { uid: 'T1', role: 'teacher', linkedId: 'T1', name: 'الشيخ سعد' }
const admin = { uid: 'demo-admin', role: 'admin', linkedId: 'demo-admin', name: 'أ. محمود' }
const studentsOf = (pid) => db().list('students', { where: [['parentId', '==', pid]] })

beforeEach(async () => { setDb(createMemoryAdapter()); await seedDemo(db()) })

describe('messages', () => {
  it('parent contacts: their children’s teachers + administration', async () => {
    const kids = await studentsOf('P1')
    const c = contactsFor(parent, kids)
    expect(c.map((x) => x.other)).toContain('staff')
    expect(c.filter((x) => x.other !== 'staff').every((x) => x.parentId === 'P1')).toBe(true)
    expect(myKey(admin)).toBe('staff')
    expect(myKey({ role: 'student', linkedId: 'S1' })).toBeNull()
  })

  it('send → unread counter + notification → reply → mark read', async () => {
    const kids = await studentsOf('P1')
    const toTeacher = contactsFor(parent, kids).find((x) => x.other === 'T1')
    const convId = await sendMessage(toTeacher, '  السلام عليكم، هل حضر محمد اليوم؟ ', parent)
    let conv = { id: convId, ...(await db().get('conversations', convId)) }
    expect(conv.participants).toEqual(['P1', 'T1'])
    expect(conv.unread).toMatchObject({ T1: 1, P1: 0 })
    expect(otherName(conv, parent)).toBe(toTeacher.name)
    expect(otherName(conv, teacher)).toBe('طارق الشناوي')
    const notif = await db().list('notifications', { where: [['userId', '==', 'T1'], ['type', '==', 'message']] })
    expect(notif).toHaveLength(1)
    await sendMessage({ parentId: 'P1', other: 'T1', name: otherName(conv, teacher) }, 'نعم وحفظ الملك', teacher)
    conv = { id: convId, ...(await db().get('conversations', convId)) }
    expect(conv.unread).toMatchObject({ T1: 0, P1: 1 })
    expect(conv.names).toMatchObject({ P1: 'طارق الشناوي', T1: 'الشيخ سعد' })
    await markConversationRead(conv, parent)
    expect((await db().get('conversations', convId)).unread.P1).toBe(0)
    const msgs = await db().list('chatMessages', { where: [['convId', '==', convId]] })
    expect(msgs.map((m) => m.from).sort()).toEqual(['P1', 'T1'])
  })

  it('rejects empty, too long, and outsiders', async () => {
    const c = { parentId: 'P1', other: 'T1', name: 'x' }
    await expect(sendMessage(c, '   ', parent)).rejects.toThrow()
    await expect(sendMessage(c, 'x'.repeat(1001), parent)).rejects.toThrow()
    await expect(sendMessage(c, 'hi', { uid: 'P2', role: 'parent', linkedId: 'P2' })).rejects.toThrow()
  })
})

describe('daily summary', () => {
  it('summarizes today for a child', async () => {
    const [kid] = (await studentsOf('P1')).filter((s) => s.id === 'S1')
    const st = { ...kid }
    const group = { id: st.academicInfo.groupId, ...(await db().get('groups', st.academicInfo.groupId)) }
    const roster = await db().list('students', { where: [['academicInfo.groupId', '==', group.id]] })
    await saveAttendanceDay({ group, date: todayKey(), students: roster, marks: {} }, teacher)
    await recordHifz({ student: st, mastery: 'excellent', segments: { far: { unit: 'juz', from: 30, to: 30 } }, assignNext: { near: { unit: 'surah', from: 67, to: 67 } } }, teacher)
    const sum = await dailySummaryFor(st, parent)
    expect(sum.empty).toBe(false)
    expect(sum.text).toMatch(/حاضر/)
    expect(sum.text).toMatch(/البعيد: جزء 30/)
    expect(sum.text).toMatch(/واجب الغد: الماضي القريب: الملك/)
    expect(sum.text).toMatch(/النقاط اليوم: \+12/)
  })
})
