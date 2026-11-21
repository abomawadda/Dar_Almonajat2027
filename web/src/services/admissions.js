// Admissions workflow: public request → review → interview → decision.
// Approval creates the student, links teacher/group and parent, initialises progress,
// creates the first fee and notifies — atomically (one batch, or one Cloud Function).
import { db, USE_FUNCTIONS, callFunction, createLoginAccount } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { monthKey, todayKey, addDays, genPassword } from '@/lib/format'
import { findParentByPhone, getSettings } from './people'

export function validateApplication(f) {
  const errors = {}
  if (!f.fullName || f.fullName.trim().split(/\s+/).length < 2) errors.fullName = 'اكتب اسم الطالب كاملًا'
  if (!f.birthDate) errors.birthDate = 'تاريخ الميلاد مطلوب'
  if (f.nationalId && !/^\d{14}$/.test(f.nationalId.trim())) errors.nationalId = 'الرقم القومي يجب أن يتكون من ١٤ رقمًا'
  if (!f.guardianName?.trim()) errors.guardianName = 'اسم ولي الأمر مطلوب'
  if (!/^\+?\d[\d\s-]{7,}$/.test(f.phone || '')) errors.phone = 'رقم الجوال غير صحيح'
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) errors.email = 'البريد الإلكتروني غير صحيح'
  return errors
}

export function submitApplication(f, actor = null) {
  const doc = {
    status: 'pending',
    type: f.type || 'quran',
    source: actor ? 'admin' : 'public',
    submittedAt: op.now(),
    createdAt: op.now(),
    personalInfo: { fullName: f.fullName.trim(), birthDate: f.birthDate, gender: f.gender || 'ذكر', nationality: f.nationality || '', nationalId: f.nationalId || '' },
    guardianInfo: { name: f.guardianName.trim(), relation: f.relation || 'الأب', phone: f.phone.trim(), email: (f.email || '').trim() },
    academicInfo: { level: f.level || 'مبتدئ', juzCount: Number(f.juzCount) || 0, lastMemorized: f.lastMemorized || '', schoolStage: f.schoolStage || '' },
    preferences: { periods: f.periods || [], days: f.days || [], notes: f.notes || '' }
  }
  if (actor) doc.createdBy = actor.uid
  return db().add(COL.APPLICATIONS, doc)
}

export const subscribeApplications = (cb) =>
  db().subscribe(COL.APPLICATIONS, {}, (rows) => cb(rows.sort((a, b) => ((b.submittedAt || '') > (a.submittedAt || '') ? 1 : -1))))

export const startReview = (appId, actor) =>
  db().update(COL.APPLICATIONS, appId, { status: 'reviewing', reviewedBy: actor.uid, reviewedAt: op.now(), decisionData: {} })

export const scheduleInterview = (appId, at, note, actor) =>
  db().update(COL.APPLICATIONS, appId, {
    status: 'interview_scheduled', reviewedBy: actor.uid,
    'interviewData.scheduledAt': new Date(at).toISOString(), 'interviewData.note': note || ''
  })

export const defer = (appId, { reason, reviewAt, note }, actor) =>
  db().update(COL.APPLICATIONS, appId, {
    status: 'waitlisted', reviewedBy: actor.uid, reviewedAt: op.now(),
    decisionData: { decision: 'deferred', reason, reviewAt: reviewAt || '', note: note || '', decisionBy: actor.uid, decisionByName: actor.name, decisionAt: op.now() }
  })

export function reject(appId, { reason, note }, actor) {
  if (!reason) return Promise.reject(new Error('سبب الرفض مطلوب'))
  return db().update(COL.APPLICATIONS, appId, {
    status: 'rejected', reviewedBy: actor.uid, reviewedAt: op.now(),
    decisionData: { decision: 'rejected', decisionReason: reason + (note ? ' — ' + note : ''), decisionBy: actor.uid, decisionByName: actor.name, decisionAt: op.now() }
  })
}

/** Everything the approval sheet needs, including a suggested group. */
export async function prepareApproval(app) {
  const [groups, existingParent, settings] = await Promise.all([
    db().list(COL.GROUPS),
    findParentByPhone(app.guardianInfo?.phone),
    getSettings()
  ])
  const open = groups.filter((g) => (g.studentCount || 0) < (g.capacity || 0))
  const suggested = open.find((g) => g.level === app.academicInfo?.level) || open[0] || null
  return { groups, existingParent, settings, suggestedGroupId: suggested?.id || null }
}

/**
 * Approve an application.
 * opts: { groupId, linkExistingParentId?, createAccount, createFee, notify }
 * returns { studentId, parentId, credentials? }
 */
export async function approve(app, opts, actor, ctx) {
  const live = db().kind === 'firestore' // decided by the active adapter, not a global flag
  if (USE_FUNCTIONS && live) {
    return callFunction('approveApplication', { applicationId: app.id, ...opts })
  }
  const { groups, settings } = ctx || (await prepareApproval(app))
  const group = groups.find((g) => g.id === opts.groupId)
  if (!group) throw new Error('اختر الحلقة')
  if ((group.studentCount || 0) >= (group.capacity || 0)) throw new Error('الحلقة مكتملة')
  if (app.status === 'approved') throw new Error('الطلب مقبول بالفعل')

  const g = app.guardianInfo || {}
  const p = app.personalInfo || {}
  const linkExisting = !!opts.linkExistingParentId
  const wantAccount = !!opts.createAccount && !linkExisting && !!g.email
  const fee = Number(settings?.monthlyFee) || 0
  const password = wantAccount ? genPassword() : null

  let parentId = opts.linkExistingParentId
  if (!parentId) parentId = wantAccount && live ? await createLoginAccount(g.email, password) : db().newId(COL.PARENTS)

  const sid = db().newId(COL.STUDENTS)
  const b = db().batch()
  b.set(COL.STUDENTS, sid, {
    applicationId: app.id, status: 'active', parentId, enrollType: app.type, joinedAt: op.now(), createdAt: op.now(),
    personalInfo: p, guardianInfo: g,
    academicInfo: {
      groupId: group.id, groupName: group.name, teacherId: group.teacherId, teacherName: group.teacherName,
      level: group.level || '', currentJuz: Number(app.academicInfo?.juzCount) || 0, totalMemorized: 0
    }
  })
  if (linkExisting) b.update(COL.PARENTS, parentId, { childrenIds: op.union(sid), updatedAt: op.now() })
  else b.set(COL.PARENTS, parentId, { name: g.name, phone: g.phone, email: g.email || '', relation: g.relation || '', childrenIds: [sid], hasAccount: wantAccount, createdAt: op.now() })
  if (wantAccount) b.set(COL.USERS, parentId, { displayName: g.name, email: g.email, role: 'parent', parentId, isActive: true, createdAt: op.now() })
  b.update(COL.GROUPS, group.id, { studentCount: op.inc(1) })
  b.set(COL.HIFZ_PROGRESS, sid, { studentId: sid, parentId, totalMemorized: 0, juzProgress: [], lastUpdated: op.now() })
  b.update(COL.APPLICATIONS, app.id, {
    status: 'approved', reviewedBy: actor.uid, reviewedAt: op.now(),
    decisionData: {
      decision: 'approved', decisionBy: actor.uid, decisionByName: actor.name, decisionAt: op.now(),
      studentId: sid, parentId, groupId: group.id, teacherId: group.teacherId,
      note: `وُزّع على ${group.teacherName} (${group.name}) • ${linkExisting ? 'رُبط بولي أمر مسجّل' : 'أُنشئ سجل ولي الأمر'}${wantAccount ? ' مع حساب دخول' : ''}`
    }
  })
  if (opts.createFee && fee > 0) {
    b.add(COL.PAYMENTS, { studentId: sid, studentName: p.fullName, parentId, month: monthKey(), amount: fee, status: 'pending', dueDate: todayKey(addDays(7)), createdAt: op.now() })
  }
  if (opts.notify) {
    b.add(COL.NOTIFICATIONS, { userId: parentId, type: 'admission', title: `تم قبول ${p.fullName}`, body: `انضم إلى ${group.name} مع ${group.teacherName}`, isRead: false, createdAt: op.now() })
    b.add(COL.NOTIFICATIONS, { userId: group.teacherId, type: 'admission', title: 'طالب جديد في حلقتك', body: `${p.fullName} انضم إلى ${group.name}`, isRead: false, createdAt: op.now() })
  }
  await b.commit()
  return { studentId: sid, parentId, credentials: wantAccount ? { name: g.name, email: g.email, password } : null }
}
