// Server-side admission approval (Admin SDK). Same result as the client batch in
// web/src/services/admissions.js, plus what only a server can guarantee:
//   • the caller's role is verified from users/{uid}, not trusted from the client
//   • capacity and status are checked inside a transaction (two admins cannot overfill a group)
//   • the parent login is created with the Admin SDK and rolled back if the transaction fails
import { randomInt } from 'node:crypto'

export class ApprovalError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

const dayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const monthKey = (d = new Date()) => dayKey(d).slice(0, 7)
export const genPassword = () => 'Dar' + randomInt(100000, 1000000)

/**
 * deps: { db, auth, FieldValue }  (firebase-admin instances; injectable for tests)
 * input: { applicationId, groupId, linkExistingParentId?, createAccount?, createFee?, notify? }
 */
export async function approveApplication(deps, input, callerUid) {
  const { db, auth, FieldValue } = deps
  if (!callerUid) throw new ApprovalError('unauthenticated', 'سجّل الدخول أولًا')
  const caller = await db.collection('users').doc(callerUid).get()
  const cd = caller.exists ? caller.data() : null
  if (!cd || cd.role !== 'admin' || cd.isActive === false) throw new ApprovalError('permission-denied', 'اعتماد القبول من صلاحيات مدير الدار')
  if (!input?.applicationId || !input?.groupId) throw new ApprovalError('invalid-argument', 'بيانات ناقصة')

  const appRef = db.collection('applications').doc(input.applicationId)
  const pre = await appRef.get()
  if (!pre.exists) throw new ApprovalError('not-found', 'الطلب غير موجود')
  const g = pre.data().guardianInfo || {}
  const linkExisting = !!input.linkExistingParentId
  const wantAccount = !!input.createAccount && !linkExisting && !!g.email

  // Auth accounts cannot join a Firestore transaction: create first, delete on failure.
  let parentId = input.linkExistingParentId || null
  let password = null
  let createdUid = null
  if (wantAccount) {
    password = genPassword()
    try {
      createdUid = (await auth.createUser({ email: g.email, password, displayName: g.name })).uid
    } catch (e) {
      if (e.code === 'auth/email-already-exists') throw new ApprovalError('already-exists', 'بريد ولي الأمر مسجّل بحساب آخر — اختر "ربط بحساب موجود"')
      throw e
    }
    parentId = createdUid
  }
  if (!parentId) parentId = db.collection('parents').doc().id
  const studentId = db.collection('students').doc().id
  const now = FieldValue.serverTimestamp()

  try {
    await db.runTransaction(async (tx) => {
      const groupRef = db.collection('groups').doc(input.groupId)
      const settingsRef = db.collection('settings').doc('general')
      const [appSnap, groupSnap, settingsSnap] = await Promise.all([tx.get(appRef), tx.get(groupRef), tx.get(settingsRef)])
      const app = appSnap.data()
      if (app.status === 'approved') throw new ApprovalError('failed-precondition', 'الطلب مقبول بالفعل')
      if (!groupSnap.exists) throw new ApprovalError('not-found', 'الحلقة غير موجودة')
      const group = { id: groupSnap.id, ...groupSnap.data() }
      if ((group.studentCount || 0) >= (group.capacity || 0)) throw new ApprovalError('failed-precondition', 'الحلقة مكتملة')
      if (linkExisting) {
        const ps = await tx.get(db.collection('parents').doc(parentId))
        if (!ps.exists) throw new ApprovalError('not-found', 'ولي الأمر غير موجود')
      }
      const p = app.personalInfo || {}
      const fee = Number(settingsSnap.exists ? settingsSnap.data().monthlyFee : 0) || 0
      const col = (c, id) => (id ? db.collection(c).doc(id) : db.collection(c).doc())

      tx.set(col('students', studentId), {
        applicationId: appRef.id, status: 'active', parentId, enrollType: app.type, joinedAt: now, createdAt: now,
        personalInfo: p, guardianInfo: g,
        academicInfo: { groupId: group.id, groupName: group.name, teacherId: group.teacherId, teacherName: group.teacherName, level: group.level || '', currentJuz: Number(app.academicInfo?.juzCount) || 0, totalMemorized: 0 }
      })
      if (linkExisting) tx.update(col('parents', parentId), { childrenIds: FieldValue.arrayUnion(studentId), updatedAt: now })
      else tx.set(col('parents', parentId), { name: g.name, phone: g.phone, email: g.email || '', relation: g.relation || '', childrenIds: [studentId], hasAccount: wantAccount, createdAt: now })
      if (wantAccount) tx.set(col('users', parentId), { displayName: g.name, email: g.email, role: 'parent', parentId, isActive: true, createdAt: now })
      tx.update(col('groups', group.id), { studentCount: FieldValue.increment(1) })
      tx.set(col('hifzProgress', studentId), { studentId, parentId, totalMemorized: 0, juzProgress: [], lastUpdated: now })
      tx.update(appRef, {
        status: 'approved', reviewedBy: callerUid, reviewedAt: now,
        decisionData: {
          decision: 'approved', decisionBy: callerUid, decisionByName: cd.displayName || '', decisionAt: now,
          studentId, parentId, groupId: group.id, teacherId: group.teacherId,
          note: `وُزّع على ${group.teacherName} (${group.name}) • ${linkExisting ? 'رُبط بولي أمر مسجّل' : 'أُنشئ سجل ولي الأمر'}${wantAccount ? ' مع حساب دخول' : ''}`
        }
      })
      if (input.createFee && fee > 0) {
        tx.set(col('payments'), { studentId, studentName: p.fullName, parentId, month: monthKey(), amount: fee, status: 'pending', dueDate: dayKey(new Date(Date.now() + 7 * 864e5)), createdAt: now })
      }
      if (input.notify) {
        tx.set(col('notifications'), { userId: parentId, type: 'admission', title: `تم قبول ${p.fullName}`, body: `انضم إلى ${group.name} مع ${group.teacherName}`, isRead: false, createdAt: now })
        tx.set(col('notifications'), { userId: group.teacherId, type: 'admission', title: 'طالب جديد في حلقتك', body: `${p.fullName} انضم إلى ${group.name}`, isRead: false, createdAt: now })
      }
    })
  } catch (e) {
    if (createdUid) await auth.deleteUser(createdUid).catch(() => {}) // compensate
    throw e
  }
  return { studentId, parentId, credentials: wantAccount ? { name: g.name, email: g.email, password } : null }
}
