// Student attendance, staff attendance, hifz sessions, behavior, exams.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL, MASTERY } from '@/config/constants'
import { validateRange } from '@/config/quran'
import { isStaffRole } from '@/config/roles'
import { todayKey } from '@/lib/format'
import { recordScope } from './scope'

const newestFirst = (a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1)
const notify = (b, userId, type, title, body) => {
  if (userId) b.add(COL.NOTIFICATIONS, { userId, type, title, body, isRead: false, createdAt: op.now() })
}

// ── Student attendance ──────────────────────────────────────────────────────
export async function loadAttendanceDay(groupId, date) {
  const rows = await db().list(COL.ATTENDANCE, { where: [['date', '==', date], ['groupId', '==', groupId]] })
  const marks = {}
  const excuses = {}
  rows.forEach((r) => {
    marks[r.studentId] = r.status
    if (r.excusedByParent || r.excuseReason) {
      excuses[r.studentId] = {
        reason: r.excuseReason || '',
        note: r.excuseNote || '',
        byParent: !!r.excusedByParent
      }
    }
  })
  return { marks, excuses, saved: rows.some((r) => !r.excusedByParent) }
}

/** One document per student per day (id = date_studentId) → re-saving updates, never duplicates. */
export async function saveAttendanceDay({ group, date, students, marks, excuses = {}, alreadySaved }, actor) {
  const b = db().batch()
  students.forEach((s) => {
    const status = marks[s.id] || 'present'
    const doc = {
      date, groupId: group.id, groupName: group.name, teacherId: group.teacherId,
      studentId: s.id, studentName: s.personalInfo.fullName, parentId: s.parentId || '',
      status, recordedBy: actor.uid, updatedAt: op.now()
    }
    const ex = excuses[s.id]
    if (status === 'excused' && ex) {
      doc.excuseReason = ex.reason || ''
      doc.excuseNote = ex.note || ''
      doc.excusedByParent = !!ex.byParent
    }
    b.set(COL.ATTENDANCE, `${date}_${s.id}`, doc)
    if (!alreadySaved && status === 'absent') notify(b, s.parentId, 'absence', `غياب ${s.personalInfo.fullName}`, `لم يحضر حصة ${group.name} بتاريخ ${date}`)
  })
  await b.commit()
  return students.length
}

/** Parent submits an advance absence excuse for a child. */
export async function submitExcuse({ student, date, reason, note }, actor) {
  if (!student) throw new Error('اختر الطالب')
  if (!date) throw new Error('اختر التاريخ')
  if (!reason?.trim()) throw new Error('اختر سبب الاستئذان')
  const ac = student.academicInfo || {}
  const cleanNote = (note || '').trim()
  const b = db().batch()
  b.set(COL.ATTENDANCE, `${date}_${student.id}`, {
    date,
    groupId: ac.groupId || '',
    groupName: ac.groupName || '',
    teacherId: ac.teacherId || '',
    studentId: student.id,
    studentName: student.personalInfo.fullName,
    parentId: student.parentId || actor.linkedId,
    status: 'excused',
    excuseReason: reason.trim(),
    excuseNote: cleanNote,
    excusedByParent: true,
    recordedBy: actor.uid,
    updatedAt: op.now()
  })
  notify(
    b,
    ac.teacherId,
    'excuse',
    `استئذان غياب — ${student.personalInfo.fullName.split(' ')[0]}`,
    `تاريخ ${date} • السبب: ${reason.trim()}${cleanNote ? ' — ' + cleanNote : ''}`
  )
  await b.commit()
}

export const attendanceHistory = (actor) =>
  db().list(COL.ATTENDANCE, recordScope(actor)).then((r) => r.sort((a, b) => (a.date < b.date ? 1 : -1)))

// ── Staff attendance ────────────────────────────────────────────────────────
export function listStaffDay(date, actor) {
  const where = [['date', '==', date]]
  if (!isStaffRole(actor.role)) where.push(['staffId', '==', actor.linkedId])
  return db().list(COL.STAFF_ATTENDANCE, { where })
}
export function staffCheck({ staffId, staffName, date, kind }, actor) {
  const patch = { date, staffId, staffName, recordedBy: actor.uid, updatedAt: op.now() }
  patch[kind === 'in' ? 'checkIn' : 'checkOut'] = new Date().toISOString()
  return db().set(COL.STAFF_ATTENDANCE, `${date}_${staffId}`, patch, { merge: true })
}

// ── Hifz session ────────────────────────────────────────────────────────────
export async function recordHifz(
  { student, type = 'new', surah, from, to, revSurah, revFrom, revTo, repetitions, mastery, hifzMistakes = 0, tajweedMistakes = 0, homework, notes },
  actor
) {
  if (!student) throw new Error('اختر الطالب')
  if (!MASTERY[mastery]) throw new Error('اختر مستوى الإتقان')
  const hasNew = type === 'new' || type === 'both'
  const hasRev = type === 'revision' || type === 'both'
  if (!hasNew && !hasRev) throw new Error('اختر نوع التسميع')

  let nv = null
  if (hasNew) {
    nv = validateRange(surah, from, to)
    if (!nv.ok) throw new Error(nv.error)
  }

  let rv = null
  const rSurah = revSurah || surah
  const rFrom = revFrom ?? from
  const rTo = revTo ?? to
  if (hasRev) {
    rv = validateRange(rSurah, rFrom, rTo)
    if (!rv.ok) throw new Error(type === 'both' ? `مراجعة: ${rv.error}` : rv.error)
  }

  const today = todayKey()
  const ac = student.academicInfo || {}
  const hm = Math.max(0, Number(hifzMistakes) || 0)
  const tm = Math.max(0, Number(tajweedMistakes) || 0)
  const cleanHw = (homework || '').trim()

  const rec = {
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupId: ac.groupId || '', teacherId: ac.teacherId || '', teacherName: ac.teacherName || '', recordedBy: actor.uid,
    date: today, type, masteryLevel: mastery, hifzMistakes: hm, tajweedMistakes: tm,
    homework: cleanHw, teacherNotes: (notes || '').trim(), createdAt: op.now()
  }
  if (hasNew) rec.newMemorization = { surahName: surah, fromAyah: from, toAyah: to, ayahCount: nv.count, masteryLevel: mastery, repetitions: repetitions || 1 }
  if (hasRev) rec.revision = { surahName: rSurah, fromAyah: rFrom, toAyah: rTo, ayahCount: rv.count, masteryLevel: mastery }

  const b = db().batch()
  b.add(COL.HIFZ_RECORDS, rec)

  const studentPatch = { 'academicInfo.lastSession': today, 'academicInfo.lastMastery': mastery }
  if (cleanHw) {
    studentPatch['academicInfo.lastHomework'] = cleanHw
    studentPatch['academicInfo.lastHomeworkDate'] = today
  }
  if (hasNew) {
    b.set(COL.HIFZ_PROGRESS, student.id, { studentId: student.id, parentId: student.parentId || '', totalMemorized: op.inc(nv.count), lastUpdated: op.now() }, { merge: true })
    studentPatch['academicInfo.totalMemorized'] = op.inc(nv.count)
    studentPatch['academicInfo.lastHifz'] = { surahName: surah, fromAyah: from, toAyah: to, date: today, masteryLevel: mastery }
  }
  b.update(COL.STUDENTS, student.id, studentPatch)

  const parts = []
  if (hasNew) parts.push(`حفظ ${surah} ${from}–${to}`)
  if (hasRev) parts.push(`مراجعة ${rSurah} ${rFrom}–${rTo}`)
  const totalMistakes = hm + tm
  if (totalMistakes > 0) parts.push(`أخطاء: ${totalMistakes}`)
  if (cleanHw) parts.push(`الواجب: ${cleanHw}`)
  const summary = parts.join(' • ')

  notify(b, student.parentId, 'hifz', `تسميع ${student.personalInfo.fullName.split(' ')[0]} — ${MASTERY[mastery]}`, summary)
  if (student.id && student.id !== student.parentId) {
    notify(b, student.id, 'hifz', `تسميعك اليوم — ${MASTERY[mastery]}`, summary)
  }

  await b.commit()
  return (nv?.count || 0) + (rv?.count || 0)
}

export const hifzRecordsFor = (studentId) =>
  db().list(COL.HIFZ_RECORDS, { where: [['studentId', '==', studentId]] }).then((r) => r.sort(newestFirst))

export async function todayHifzIds(actor, date = todayKey()) {
  const where = [['date', '==', date]]
  if (actor.role === 'teacher') where.push(['teacherId', '==', actor.linkedId])
  const rows = await db().list(COL.HIFZ_RECORDS, { where })
  return [...new Set(rows.map((r) => r.studentId))]
}

// ── Behavior ────────────────────────────────────────────────────────────────
export const subscribeBehavior = (actor, cb) =>
  db().subscribe(COL.BEHAVIOR, recordScope(actor), (rows) => cb(rows.sort(newestFirst)))

export async function addBehavior({ student, type, category, description, points, notifyParent }, actor) {
  if (!description?.trim()) throw new Error('اكتب وصف السلوك')
  const pts = Math.abs(Number(points) || 0) * (type === 'positive' ? 1 : -1)
  const ac = student.academicInfo
  const b = db().batch()
  b.add(COL.BEHAVIOR, {
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupId: ac.groupId, teacherId: ac.teacherId, teacherName: actor.role === 'teacher' ? actor.name : ac.teacherName,
    recordedBy: actor.uid, type, category, description: description.trim(), points: pts, notifyParent: !!notifyParent, createdAt: op.now()
  })
  if (notifyParent) notify(b, student.parentId, 'behavior', `${type === 'positive' ? 'إشادة' : 'ملاحظة سلوك'}: ${student.personalInfo.fullName.split(' ')[0]}`, description.trim())
  await b.commit()
}

// ── Exams ───────────────────────────────────────────────────────────────────
export function subscribeExams(actor, cb) {
  const spec = actor.role === 'teacher' ? { where: [['teacherId', '==', actor.linkedId]] } : {}
  return db().subscribe(COL.EXAMS, spec, (rows) => cb(rows.sort((a, b) => (a.date > b.date ? 1 : -1))))
}
export function createExam(f, group, actor) {
  if (!f.title?.trim() || !group || !f.date) return Promise.reject(new Error('العنوان والحلقة والتاريخ مطلوبة'))
  return db().add(COL.EXAMS, {
    title: f.title.trim(), groupId: group.id, groupName: group.name, teacherId: group.teacherId, teacherName: group.teacherName,
    date: f.date, time: f.time || '', duration: Number(f.duration) || 60, scope: f.scope || '',
    totalMarks: Number(f.totalMarks) || 100, passMark: Number(f.passMark) || 60,
    status: 'scheduled', studentCount: group.studentCount || 0, createdBy: actor.uid, createdAt: op.now()
  })
}
export const deleteExam = (id) => db().remove(COL.EXAMS, id)
