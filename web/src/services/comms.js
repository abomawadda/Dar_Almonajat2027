// Announcements, circulars, notifications, certificates, competitions.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { audienceScope, recipientIds, recordScope } from './scope'

const newestFirst = (a, b) => ((b.createdAt || b.issuedAt || '') > (a.createdAt || a.issuedAt || '') ? 1 : -1)

// ── Announcements ───────────────────────────────────────────────────────────
export const subscribeAnnouncements = (actor, cb) =>
  db().subscribe(COL.ANNOUNCEMENTS, audienceScope(actor), (rows) =>
    cb(rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || newestFirst(a, b))))

export function publishAnnouncement(f, actor) {
  if (!f.title?.trim() || !f.body?.trim()) return Promise.reject(new Error('العنوان والنص مطلوبان'))
  return db().add(COL.ANNOUNCEMENTS, {
    title: f.title.trim(), body: f.body.trim(), type: f.type || 'general', audience: f.audience || 'all',
    pinned: !!f.pinned, authorId: actor.uid, authorName: actor.name, createdAt: op.now()
  })
}
export const deleteAnnouncement = (id) => db().remove(COL.ANNOUNCEMENTS, id)

// ── Circulars ───────────────────────────────────────────────────────────────
export const subscribeCirculars = (actor, cb) =>
  db().subscribe(COL.CIRCULARS, audienceScope(actor), (rows) => cb(rows.sort(newestFirst)))

export function sendCircular(f, actor) {
  if (!f.title?.trim() || !f.body?.trim()) return Promise.reject(new Error('العنوان والنص مطلوبان'))
  return db().add(COL.CIRCULARS, {
    title: f.title.trim(), body: f.body.trim(), audience: f.audience || 'all', requiresAck: f.requiresAck !== false,
    acks: [], authorId: actor.uid, authorName: actor.name, createdAt: op.now()
  })
}
/** A user may only add their own uid (enforced in firestore.rules). */
export const acknowledgeCircular = (id, actor) => db().update(COL.CIRCULARS, id, { acks: op.union(actor.uid) })
export const deleteCircular = (id) => db().remove(COL.CIRCULARS, id)

// ── Notifications ───────────────────────────────────────────────────────────
export const subscribeNotifications = (actor, cb) =>
  db().subscribe(COL.NOTIFICATIONS, { where: [['userId', 'in', recipientIds(actor)]] }, (rows) => cb(rows.sort(newestFirst)))
export const markRead = (id) => db().update(COL.NOTIFICATIONS, id, { isRead: true })
export async function markAllRead(list) {
  const b = db().batch()
  list.filter((n) => !n.isRead).forEach((n) => b.update(COL.NOTIFICATIONS, n.id, { isRead: true }))
  await b.commit()
}

// ── Certificates ────────────────────────────────────────────────────────────
export const subscribeCertificates = (actor, cb) =>
  db().subscribe(COL.CERTIFICATES, recordScope(actor, { teacherField: null }), (rows) => cb(rows.sort(newestFirst)))

export async function issueCertificate({ student, type, notes }, actor) {
  const b = db().batch()
  b.add(COL.CERTIFICATES, {
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupName: student.academicInfo?.groupName || '', type, notes: notes || '',
    issuedBy: actor.uid, issuedByName: actor.name, issuedAt: op.now()
  })
  if (student.parentId) b.add(COL.NOTIFICATIONS, { userId: student.parentId, type: 'certificate', title: 'شهادة جديدة', body: `شهادة ${type} للطالب ${student.personalInfo.fullName}`, isRead: false, createdAt: op.now() })
  await b.commit()
}

// ── Competitions ────────────────────────────────────────────────────────────
export const subscribeCompetitions = (cb) =>
  db().subscribe(COL.COMPETITIONS, {}, (rows) => cb(rows.sort((a, b) => (a.startDate < b.startDate ? 1 : -1))))

export function createCompetition(f, actor) {
  if (!f.title?.trim() || !f.startDate || !f.endDate) return Promise.reject(new Error('الاسم والتاريخان مطلوبة'))
  if (f.endDate < f.startDate) return Promise.reject(new Error('تاريخ النهاية قبل البداية'))
  return db().add(COL.COMPETITIONS, {
    title: f.title.trim(), startDate: f.startDate, endDate: f.endDate, condition: f.condition || '', prizes: f.prizes || '',
    createdBy: actor.uid, createdAt: op.now()
  })
}
