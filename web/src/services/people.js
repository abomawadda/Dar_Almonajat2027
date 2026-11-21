// Students, groups (halaqat), teachers, parents, settings.
import { db } from '@/lib/backend'
import { COL } from '@/config/constants'
import { studentScope } from './scope'

const byName = (a, b) => (a.personalInfo?.fullName || a.name || '').localeCompare(b.personalInfo?.fullName || b.name || '', 'ar')

export function subscribeStudents(actor, cb) {
  const scope = studentScope(actor)
  if (!scope) {
    db().get(COL.STUDENTS, actor.linkedId).then((s) => cb(s ? [s] : []))
    return () => {}
  }
  return db().subscribe(COL.STUDENTS, scope, (rows) => cb(rows.filter((s) => s.status !== 'withdrawn').sort(byName)))
}

export const subscribeGroups = (cb) =>
  db().subscribe(COL.GROUPS, {}, (rows) => cb(rows.sort(byName)))

export const subscribeTeachers = (cb) =>
  db().subscribe(COL.TEACHERS, {}, (rows) => cb(rows.sort(byName)))

export const getStudent = (id) => db().get(COL.STUDENTS, id)
export const getSettings = () => db().get(COL.SETTINGS, 'general').then((s) => s || {})
export const findParentByPhone = (phone) =>
  phone ? db().list(COL.PARENTS, { where: [['phone', '==', phone]] }).then((r) => r[0] || null) : Promise.resolve(null)
export const getProfile = (uid) => db().get(COL.USERS, uid)
