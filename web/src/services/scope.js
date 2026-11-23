// Role-scoped queries. Each query mirrors a read rule in firestore.rules, so Firestore
// can prove the query is allowed (it rejects queries it cannot prove).
import { isStaffRole, audiencesFor } from '@/config/roles'

/** actor: { uid, name, role, linkedId } — linkedId = teacherId / studentId / parentId. */
export function studentScope(actor) {
  if (isStaffRole(actor.role) || actor.role === 'accountant') return {}
  if (actor.role === 'teacher') return { where: [['academicInfo.teacherId', '==', actor.linkedId]] }
  if (actor.role === 'parent') return { where: [['parentId', '==', actor.linkedId]] }
  return null // student reads their own document by id
}

/** Records that carry studentId / parentId / teacherId (behavior, hifzRecords, attendance, certificates). */
export function recordScope(actor, { teacherField = 'teacherId' } = {}) {
  if (isStaffRole(actor.role)) return {}
  if (actor.role === 'teacher') return teacherField ? { where: [[teacherField, '==', actor.linkedId]] } : {}
  if (actor.role === 'parent') return { where: [['parentId', '==', actor.linkedId]] }
  return { where: [['studentId', '==', actor.linkedId]] }
}

export function audienceScope(actor) {
  const a = audiencesFor(actor.role)
  return a ? { where: [['audience', 'in', a]] } : {}
}

/** Notification recipients: the auth uid and the linked record id (they may differ). */
export const recipientIds = (actor) => [...new Set([actor.uid, actor.linkedId, isStaffRole(actor.role) ? 'staff' : ''].filter(Boolean))]
