// Student attendance, staff attendance, hifz sessions, behavior, exams.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL, MASTERY } from '@/config/constants'
import { validateRange } from '@/config/quran'
import { isStaffRole } from '@/config/roles'
import { todayKey } from '@/lib/format'
import { recordScope } from './scope'
import { DEFAULT_PLAN, addRange, countAyahs, fromIndex, isAccepted, juzCoverage, juzOf, pickLabel, pickToRange, planOf, segmentRange } from '@/lib/hifz'

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

// ── Hifz session (three tracks: new / near / far) ───────────────────────────
export const HIFZ_TRACKS = { new: 'الجديد', near: 'الماضي القريب', far: 'الماضي البعيد' }

/** Normalise input → { new?, near?, far? } segments. Accepts the legacy `type` + surah/from/to/rev* shape. */
function toSegments(i) {
  if (i.segments) return i.segments
  const seg = {}
  const type = i.type || 'new'
  if (type === 'new' || type === 'both') seg.new = { surah: i.surah, from: i.from, to: i.to, repetitions: i.repetitions }
  if (type === 'near') seg.near = { surah: i.surah, from: i.from, to: i.to }
  if (type === 'revision' || type === 'far' || type === 'both') {
    seg.far = { surah: i.revSurah || i.surah, from: i.revFrom ?? i.from, to: i.revTo ?? i.to }
  }
  return seg
}

export const getHifzProgress = (studentId) => db().get(COL.HIFZ_PROGRESS, studentId)
export const saveHifzPlan = (studentId, plan) =>
  db().set(COL.HIFZ_PROGRESS, studentId, { studentId, plan: { ...DEFAULT_PLAN, ...plan }, lastUpdated: op.now() }, { merge: true })

export async function recordHifz(input, actor) {
  const { student, mastery, hifzMistakes = 0, tajweedMistakes = 0, tashkeelMistakes = 0, homework, notes } = input
  if (!student) throw new Error('اختر الطالب')
  if (!MASTERY[mastery]) throw new Error('اختر مستوى الإتقان')
  const segs = Object.fromEntries(Object.entries(toSegments(input)).filter(([, v]) => v))
  if (!Object.keys(segs).length) throw new Error('اختر نوع التسميع')

  const parsed = {}
  for (const [k, sg] of Object.entries(segs)) {
    const err = (m) => new Error(Object.keys(segs).length > 1 ? `${HIFZ_TRACKS[k]}: ${m}` : m)
    if (sg.unit) {
      // picker value: juz / hizb / surah(s) / ayahs — chosen from mushaf lists
      const range = pickToRange(sg)
      if (!range) throw err('اختر المقطع من القوائم')
      const a = fromIndex(range.s), z = fromIndex(range.e)
      parsed[k] = { surah: a.surah, from: a.ayah, to: a.surah === z.surah ? z.ayah : a.ayah, toSurah: z.surah, toAyah: z.ayah,
        count: range.e - range.s + 1, range, label: pickLabel(sg), pick: sg, repetitions: sg.repetitions }
    } else {
      const v = validateRange(sg.surah, sg.from, sg.to)
      if (!v.ok) throw err(v.error)
      parsed[k] = { ...sg, count: v.count, range: segmentRange(sg), label: `${sg.surah} ${sg.from}–${sg.to}` }
    }
  }

  const today = todayKey()
  const ac = student.academicInfo || {}
  const hm = Math.max(0, Number(hifzMistakes) || 0)
  const tm = Math.max(0, Number(tajweedMistakes) || 0)
  const km = Math.max(0, Number(tashkeelMistakes) || 0)
  const progress = (await db().get(COL.HIFZ_PROGRESS, student.id)) || {}
  const plan = planOf(progress)
  const accepted = !parsed.new || isAccepted(hm, plan)

  const rec = {
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupId: ac.groupId || '', teacherId: ac.teacherId || '', teacherName: ac.teacherName || '', recordedBy: actor.uid,
    date: today, type: input.type || Object.keys(parsed).join('+'), tracks: Object.keys(parsed),
    status: accepted ? 'accepted' : 'repeat',
    masteryLevel: mastery, hifzMistakes: hm, tajweedMistakes: tm, tashkeelMistakes: km,
    homework: '', teacherNotes: (notes || '').trim(), createdAt: op.now()
  }
  const segDoc = (p) => ({ surahName: p.surah, fromAyah: p.from, toAyah: p.to, ayahCount: p.count, masteryLevel: mastery,
    label: p.label, s: p.range.s, e: p.range.e, ...(p.toSurah && p.toSurah !== p.surah ? { toSurah: p.toSurah, toSurahAyah: p.toAyah } : {}) })
  if (parsed.new) rec.newMemorization = { ...segDoc(parsed.new), repetitions: parsed.new.repetitions || 1 }
  if (parsed.near) rec.nearReview = segDoc(parsed.near)
  if (parsed.far) rec.revision = segDoc(parsed.far)

  // Progress: memorized ranges grow only with an accepted "new"; reviews stamp their juz.
  const pPatch = { studentId: student.id, parentId: student.parentId || '', lastUpdated: op.now(), lastSession: today }
  let ranges = progress.ranges || []
  let added = 0
  if (parsed.new) {
    if (accepted) {
      const before = countAyahs(ranges)
      ranges = addRange(ranges, parsed.new.range)
      added = countAyahs(ranges) - before
      pPatch.ranges = ranges
      pPatch.lastNew = parsed.new.range
      pPatch.pendingRepeat = null
      pPatch.totalMemorized = op.inc(added)
      const sessions = (Number(progress.newSessions) || 0) + 1
      pPatch.newSessions = sessions
      pPatch.pace = Math.round((((Number(progress.pace) || parsed.new.count) * (sessions - 1)) + parsed.new.count) / sessions * 10) / 10
    } else {
      pPatch.pendingRepeat = { surah: parsed.new.surah, from: parsed.new.from, to: parsed.new.to }
    }
  }
  const reviewed = { ...(progress.juzReviewedAt || {}) }
  const weak = new Set(progress.weakJuz || [])
  for (const k of ['near', 'far']) {
    if (!parsed[k]) continue
    const j = juzOf(parsed[k].range.s)
    reviewed[j] = today
    if (mastery === 'weak' || mastery === 'average') weak.add(j)
    else if (mastery === 'excellent') weak.delete(j)
  }
  if (parsed.near || parsed.far) { pPatch.juzReviewedAt = reviewed; pPatch.weakJuz = [...weak].sort((a, b) => a - b) }

  // The teacher's assignment for the next session (الجديد/القريب/البعيد), recited next time.
  const next = {}
  for (const [k, pk] of Object.entries(input.assignNext || {})) {
    if (!pk) continue
    const r = pickToRange(pk)
    if (!r) throw new Error(`واجب ${HIFZ_TRACKS[k]}: اختر المقطع من القوائم`)
    next[k] = { ...pk, label: pickLabel(pk), s: r.s, e: r.e }
  }
  if (Object.keys(next).length) {
    pPatch.assignment = { ...next, assignedOn: today, assignedBy: actor.uid }
    rec.assignedNext = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.label]))
  } else {
    pPatch.assignment = null // the previous assignment was recited in this session
  }
  const assignText = Object.entries(next).map(([k, v]) => `${HIFZ_TRACKS[k]}: ${v.label}`).join(' • ')

  const cleanHw = [assignText, (homework || '').trim()].filter(Boolean).join(' • ')
  rec.homework = cleanHw

  const b = db().batch()
  b.add(COL.HIFZ_RECORDS, rec)
  b.set(COL.HIFZ_PROGRESS, student.id, pPatch, { merge: true })

  const studentPatch = { 'academicInfo.lastSession': today, 'academicInfo.lastMastery': mastery }
  if (cleanHw) {
    studentPatch['academicInfo.lastHomework'] = cleanHw
    studentPatch['academicInfo.lastHomeworkDate'] = today
  }
  if (parsed.new && accepted) {
    const n = parsed.new
    studentPatch['academicInfo.totalMemorized'] = op.inc(added)
    studentPatch['academicInfo.currentJuz'] = juzCoverage(ranges).filter((c) => c.pct >= 0.999).length
    studentPatch['academicInfo.lastHifz'] = { surahName: n.surah, fromAyah: n.from, toAyah: n.to, date: today, masteryLevel: mastery }
  }
  b.update(COL.STUDENTS, student.id, studentPatch)

  const parts = []
  if (parsed.new) parts.push(`${accepted ? 'حفظ' : 'إعادة حفظ'} ${parsed.new.label}`)
  if (parsed.near) parts.push(`قريب ${parsed.near.label}`)
  if (parsed.far) parts.push(`بعيد ${parsed.far.label}`)
  const totalMistakes = hm + tm + km
  if (totalMistakes > 0) parts.push(`أخطاء: ${totalMistakes}`)
  if (cleanHw) parts.push(`واجب الغد: ${cleanHw}`)
  const summary = parts.join(' • ')

  notify(b, student.parentId, 'hifz', `تسميع ${student.personalInfo.fullName.split(' ')[0]} — ${MASTERY[mastery]}`, summary)
  if (student.id && student.id !== student.parentId) {
    notify(b, student.id, 'hifz', `تسميعك اليوم — ${MASTERY[mastery]}`, summary)
  }

  await b.commit()
  return Object.values(parsed).reduce((n, p) => n + p.count, 0)
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
