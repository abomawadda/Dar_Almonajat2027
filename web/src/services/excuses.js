// Absence excuses: the parent submits (optionally with an attachment) → teacher/staff approve or reject.
// Approval marks the covered days "excused" in attendance (never overriding a recorded presence).
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { isStaffRole } from '@/config/roles'
import { addDays, todayKey } from '@/lib/format'
import { award, getPointRules } from './points'

export const MAX_EXCUSE_DAYS = 14

const notify = (b, userId, type, title, body) => {
  if (userId) b.add(COL.NOTIFICATIONS, { userId, type, title, body, isRead: false, createdAt: op.now() })
}

/** Inclusive list of YYYY-MM-DD dates. */
export function datesBetween(from, to) {
  const out = []
  let d = new Date(from + 'T12:00:00Z')
  const end = new Date((to || from) + 'T12:00:00Z')
  while (d <= end && out.length <= MAX_EXCUSE_DAYS) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5) }
  return out
}

export async function submitExcuseRequest({ student, fromDate, toDate, reason, note, attachment }, actor) {
  if (!student) throw new Error('اختر الابن')
  if (!fromDate) throw new Error('اختر تاريخ البداية')
  const to = toDate || fromDate
  if (to < fromDate) throw new Error('تاريخ النهاية قبل البداية')
  if (datesBetween(fromDate, to).length > MAX_EXCUSE_DAYS) throw new Error(`أقصى مدة للعذر ${MAX_EXCUSE_DAYS} يومًا`)
  if (fromDate < todayKey(addDays(-7))) throw new Error('لا يمكن تقديم عذر لأكثر من أسبوع مضى')
  if (!reason?.trim()) throw new Error('اختر سبب الغياب')
  const ac = student.academicInfo || {}
  const name = student.personalInfo.fullName
  const b = db().batch()
  b.add(COL.EXCUSES, {
    studentId: student.id, studentName: name, parentId: student.parentId || actor.linkedId,
    groupId: ac.groupId || '', groupName: ac.groupName || '', teacherId: ac.teacherId || '',
    fromDate, toDate: to, days: datesBetween(fromDate, to).length,
    reason: reason.trim(), note: (note || '').trim(), attachment: attachment || null,
    status: 'pending', submittedBy: actor.uid, createdAt: op.now()
  })
  const period = fromDate === to ? fromDate : `${fromDate} ← ${to}`
  notify(b, ac.teacherId, 'excuse', `عذر غياب — ${name.split(' ')[0]}`, `${period} • ${reason.trim()}${attachment ? ' • مرفق' : ''}`)
  await b.commit()
}

export function subscribeExcuses(actor, cb) {
  const where = isStaffRole(actor.role) ? []
    : actor.role === 'teacher' ? [['teacherId', '==', actor.linkedId]]
      : actor.role === 'parent' ? [['parentId', '==', actor.linkedId]]
        : [['studentId', '==', actor.linkedId]]
  return db().subscribe(COL.EXCUSES, { where }, (rows) => cb(rows.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1))))
}

/** Approved / pending excuses covering a date for a group (shown on the attendance sheet). */
export async function excusesForDay(groupId, date) {
  const rows = await db().list(COL.EXCUSES, { where: [['groupId', '==', groupId]] })
  const out = {}
  rows.filter((e) => e.status !== 'rejected' && e.fromDate <= date && e.toDate >= date).forEach((e) => { out[e.studentId] = e })
  return out
}

export async function decideExcuse(excuse, approve, note, actor) {
  if (excuse.status !== 'pending') throw new Error('تم البت في هذا العذر مسبقًا')
  const b = db().batch()
  b.update(COL.EXCUSES, excuse.id, { status: approve ? 'approved' : 'rejected', decisionNote: (note || '').trim(), decidedBy: actor.uid, decidedAt: op.now() })
  if (approve) {
    const rules = await getPointRules()
    const student = { id: excuse.studentId, parentId: excuse.parentId, personalInfo: { fullName: excuse.studentName },
      academicInfo: { groupId: excuse.groupId, groupName: excuse.groupName, teacherId: excuse.teacherId } }
    for (const date of datesBetween(excuse.fromDate, excuse.toDate)) {
      const id = `${date}_${excuse.studentId}`
      const cur = await db().get(COL.ATTENDANCE, id)
      if (cur && (cur.status === 'present' || cur.status === 'late')) continue
      if (cur?.status && cur.status !== 'excused') {
        // refund what the recorded status cost (e.g. an absence already marked)
        const diff = (Number(rules.attendance.excused) || 0) - (Number(rules.attendance[cur.status]) || 0)
        award(b, { student, delta: diff, source: 'attendance', reason: `عذر مقبول ${date}`, date }, actor)
      }
      b.set(COL.ATTENDANCE, id, {
        ...(cur || {}), date, groupId: excuse.groupId, groupName: excuse.groupName, teacherId: excuse.teacherId,
        studentId: excuse.studentId, studentName: excuse.studentName, parentId: excuse.parentId,
        status: 'excused', excuseReason: excuse.reason, excuseNote: excuse.note || '', excuseId: excuse.id,
        recordedBy: actor.uid, updatedAt: op.now()
      })
    }
  }
  notify(b, excuse.parentId, 'excuse', `${approve ? 'قُبل' : 'رُفض'} عذر ${excuse.studentName.split(' ')[0]}`,
    `${excuse.fromDate === excuse.toDate ? excuse.fromDate : `${excuse.fromDate} ← ${excuse.toDate}`}${note?.trim() ? ` • ${note.trim()}` : ''}`)
  await b.commit()
}
