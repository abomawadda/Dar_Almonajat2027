// Rewards store: staff manage a catalog; a student (or parent for a child) requests a reward;
// staff approve → points are deducted through the ledger and stock decreases; then mark delivered.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { isStaffRole } from '@/config/roles'
import { award, getBalance } from './points'

const notify = (b, userId, type, title, body) => {
  if (userId) b.add(COL.NOTIFICATIONS, { userId, type, title, body, isRead: false, createdAt: op.now() })
}

export const subscribeRewards = (cb) =>
  db().subscribe(COL.REWARDS, {}, (rows) => cb(rows.sort((a, b) => (a.cost || 0) - (b.cost || 0))))

export function saveReward({ id, name, cost, stock, icon }, actor) {
  if (!name?.trim()) throw new Error('اكتب اسم الجائزة')
  const c = Math.round(Number(cost))
  if (!(c > 0)) throw new Error('حدد تكلفة الجائزة بالنقاط')
  const doc = { name: name.trim(), cost: c, stock: stock === '' || stock == null ? null : Math.max(0, Math.round(Number(stock))), icon: icon || '🎁', active: true, updatedBy: actor.uid, updatedAt: op.now() }
  return id ? db().update(COL.REWARDS, id, doc) : db().add(COL.REWARDS, { ...doc, createdAt: op.now() })
}
export const toggleReward = (r) => db().update(COL.REWARDS, r.id, { active: !r.active })

export function subscribeRedemptions(actor, cb) {
  const where = isStaffRole(actor.role) ? []
    : actor.role === 'teacher' ? [['teacherId', '==', actor.linkedId]]
      : actor.role === 'parent' ? [['parentId', '==', actor.linkedId]]
        : [['studentId', '==', actor.linkedId]]
  return db().subscribe(COL.REDEMPTIONS, { where }, (rows) => cb(rows.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1))))
}

/** Points already reserved by the student's pending requests. */
async function reserved(studentId) {
  const rows = await db().list(COL.REDEMPTIONS, { where: [['studentId', '==', studentId], ['status', '==', 'pending']] })
  return rows.reduce((n, r) => n + (Number(r.cost) || 0), 0)
}

export async function requestReward(reward, student, actor) {
  if (!reward?.active) throw new Error('الجائزة غير متاحة')
  if (reward.stock === 0) throw new Error('نفدت الكمية')
  const bal = Number((await getBalance(student.id))?.balance) || 0
  const avail = bal - (await reserved(student.id))
  if (avail < reward.cost) throw new Error(`الرصيد المتاح ${avail} نقطة — تحتاج ${reward.cost}`)
  const ac = student.academicInfo || {}
  const b = db().batch()
  b.add(COL.REDEMPTIONS, {
    rewardId: reward.id, rewardName: reward.name, cost: reward.cost,
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupId: ac.groupId || '', teacherId: ac.teacherId || '',
    status: 'pending', requestedBy: actor.uid, createdAt: op.now()
  })
  notify(b, 'staff', 'reward', `طلب جائزة: ${reward.name}`, `${student.personalInfo.fullName} • ${reward.cost} نقطة`)
  await b.commit()
}

export async function decideRedemption(red, decision, actor) {
  const next = { approve: 'approved', reject: 'rejected', deliver: 'delivered' }[decision]
  const allowed = { approve: 'pending', reject: 'pending', deliver: 'approved' }[decision]
  if (red.status !== allowed) throw new Error('لا يمكن تنفيذ هذا الإجراء على الطلب')
  const b = db().batch()
  if (decision === 'approve') {
    const reward = await db().get(COL.REWARDS, red.rewardId)
    if (reward && reward.stock === 0) throw new Error('نفدت الكمية')
    const bal = Number((await getBalance(red.studentId))?.balance) || 0
    if (bal < red.cost) throw new Error(`رصيد الطالب ${bal} نقطة فقط`)
    const student = { id: red.studentId, parentId: red.parentId, personalInfo: { fullName: red.studentName }, academicInfo: { groupId: red.groupId, teacherId: red.teacherId } }
    award(b, { student, delta: -red.cost, source: 'redeem', refId: red.id, reason: `استبدال: ${red.rewardName}` }, actor)
    if (reward && reward.stock != null) b.update(COL.REWARDS, red.rewardId, { stock: op.inc(-1) })
  }
  b.update(COL.REDEMPTIONS, red.id, { status: next, [`${next}By`]: actor.uid, [`${next}At`]: op.now() })
  const msg = { approve: 'تمت الموافقة على', reject: 'لم تتم الموافقة على', deliver: 'تم تسليم' }[decision]
  notify(b, red.parentId, 'reward', `${msg} جائزة ${red.studentName.split(' ')[0]}`, red.rewardName)
  if (red.studentId !== red.parentId) notify(b, red.studentId, 'reward', `${msg} جائزتك`, red.rewardName)
  await b.commit()
}
