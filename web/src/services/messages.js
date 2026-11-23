// Direct messages between a parent and a teacher or the administration ("staff" inbox).
// A conversation is keyed by linked ids: `${parentId}__${teacherId | 'staff'}`.
// Messages live in a flat collection that carries the participants so the security rules can check them.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { isStaffRole } from '@/config/roles'

export const STAFF_KEY = 'staff'
export const MAX_MESSAGE = 1000

/** The inbox key of the signed-in user (mirrors myKey() in firestore.rules). */
export function myKey(actor) {
  if (isStaffRole(actor.role)) return STAFF_KEY
  if (actor.role === 'teacher' || actor.role === 'parent') return actor.linkedId
  return null
}
export const convIdFor = (parentId, other) => `${parentId}__${other}`

/** People this user can start a conversation with, derived from the students they can see. */
export function contactsFor(actor, students = []) {
  const out = new Map()
  if (actor.role === 'parent') {
    students.forEach((s) => {
      const t = s.academicInfo?.teacherId
      if (t) {
        const c = out.get(t) || { key: t, parentId: actor.linkedId, other: t, name: s.academicInfo.teacherName || 'المحفظ', role: 'محفظ', students: [] }
        c.students.push(s.personalInfo.fullName.split(' ')[0])
        out.set(t, c)
      }
    })
    out.set(STAFF_KEY, { key: STAFF_KEY, parentId: actor.linkedId, other: STAFF_KEY, name: 'إدارة الدار', role: 'الإدارة', students: students.map((s) => s.personalInfo.fullName.split(' ')[0]) })
  } else if (actor.role === 'teacher' || isStaffRole(actor.role)) {
    const other = myKey(actor)
    students.filter((s) => s.parentId).forEach((s) => {
      const c = out.get(s.parentId) || { key: s.parentId, parentId: s.parentId, other, name: `ولي أمر ${s.personalInfo.fullName.split(' ').slice(0, 2).join(' ')}`, role: 'ولي أمر', students: [] }
      c.students.push(s.personalInfo.fullName.split(' ')[0])
      out.set(s.parentId, c)
    })
  }
  return [...out.values()]
}

export function subscribeConversations(actor, cb) {
  const k = myKey(actor)
  if (!k) { cb([]); return () => {} }
  return db().subscribe(COL.CONVERSATIONS, { where: [['participants', 'array-contains', k]] },
    (rows) => cb(rows.sort((a, b) => ((b.lastAt || '') > (a.lastAt || '') ? 1 : -1))))
}

export function subscribeThread(convId, actor, cb) {
  const k = myKey(actor)
  return db().subscribe(COL.CHAT_MESSAGES, { where: [['convId', '==', convId], ['participants', 'array-contains', k]] },
    (rows) => cb(rows.sort((a, b) => ((a.at || '') > (b.at || '') ? 1 : -1))))
}

/** Send a message. `contact` = { parentId, other, name, students } (from contactsFor or an existing conversation). */
export async function sendMessage(contact, text, actor) {
  const body = String(text || '').trim()
  if (!body) throw new Error('اكتب الرسالة')
  if (body.length > MAX_MESSAGE) throw new Error(`الرسالة أطول من ${MAX_MESSAGE} حرف`)
  const me = myKey(actor)
  const participants = [contact.parentId, contact.other]
  if (!me || !participants.includes(me)) throw new Error('لا يمكنك المراسلة في هذه المحادثة')
  const to = participants.find((p) => p !== me)
  const convId = convIdFor(contact.parentId, contact.other)
  const myName = isStaffRole(actor.role) ? `${actor.name || ''} (الإدارة)` : actor.name || ''
  const b = db().batch()
  b.set(COL.CONVERSATIONS, convId, {
    participants, parentId: contact.parentId, other: contact.other,
    names: me === contact.parentId
      ? { [contact.parentId]: actor.name || 'ولي الأمر', [contact.other]: contact.name }
      : { [contact.parentId]: contact.name, [contact.other]: isStaffRole(actor.role) ? 'إدارة الدار' : actor.name || 'المحفظ' },
    students: contact.students || [],
    lastText: body.slice(0, 120), lastFrom: me, lastAt: op.now(),
    unread: { [to]: op.inc(1), [me]: 0 }
  }, { merge: true })
  b.add(COL.CHAT_MESSAGES, { convId, participants, from: me, fromName: myName, text: body, at: op.now() })
  b.add(COL.NOTIFICATIONS, { userId: to, type: 'message', title: `رسالة من ${myName}`, body: body.slice(0, 120), link: `/messages?c=${convId}`, isRead: false, createdAt: op.now() })
  await b.commit()
  return convId
}

export function markConversationRead(conv, actor) {
  const k = myKey(actor)
  if (!k || !(conv.unread?.[k] > 0)) return Promise.resolve()
  return db().set(COL.CONVERSATIONS, conv.id, { unread: { [k]: 0 } }, { merge: true })
}

/** Title for a conversation from the viewer's side. */
export const otherName = (conv, actor) => conv.names?.[conv.participants.find((p) => p !== myKey(actor))] || 'محادثة'
