// Points: an append-only ledger (pointsLedger) plus a per-student balance (pointsBalance) that also
// keeps monthly totals for the honor board. Rules are configurable in settings/points.
// Corrections are new ledger entries with the opposite sign — entries are never edited or deleted.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { todayKey } from '@/lib/format'

export const DEFAULT_POINT_RULES = {
  hifz: { excellent: 10, good: 6, average: 3, weak: 0 }, // per track recited (new / near / far)
  repeat: 0,          // new portion not accepted
  juzComplete: 50,    // completing a whole juz
  attendance: { present: 2, late: 0, excused: 0, absent: -3, early_leave: 0 },
  absenceStreak: 3    // consecutive absences that trigger an alert
}
export const POINT_SOURCES = { hifz: 'تسميع', attendance: 'حضور', behavior: 'سلوك', juz: 'إتمام جزء', exam: 'اختبار', manual: 'يدوي', redeem: 'استبدال' }

let cache = null
export async function getPointRules() {
  if (cache) return cache
  const s = (await db().get(COL.SETTINGS, 'points').catch(() => null)) || {}
  cache = {
    ...DEFAULT_POINT_RULES, ...s,
    hifz: { ...DEFAULT_POINT_RULES.hifz, ...(s.hifz || {}) },
    attendance: { ...DEFAULT_POINT_RULES.attendance, ...(s.attendance || {}) }
  }
  return cache
}
export async function savePointRules(rules) {
  await db().set(COL.SETTINGS, 'points', rules, { merge: true })
  cache = null
}
export const resetPointRulesCache = () => { cache = null }

const monthKey = (date = todayKey()) => date.slice(0, 7)

/**
 * Add a ledger entry and move the balance, inside an existing batch.
 * `id` (optional) makes the entry idempotent-by-key, e.g. one attendance entry per student per day.
 */
export function award(b, { student, delta, source, refId = '', reason = '', date = todayKey(), id }, actor) {
  const d = Math.round(Number(delta) || 0)
  if (!d || !student?.id) return 0
  const ac = student.academicInfo || {}
  const entry = {
    studentId: student.id, studentName: student.personalInfo?.fullName || '', parentId: student.parentId || '',
    groupId: ac.groupId || '', teacherId: ac.teacherId || '',
    delta: d, source, refId, reason, date, month: monthKey(date), by: actor?.uid || '', createdAt: op.now()
  }
  if (id) b.set(COL.POINTS_LEDGER, id, entry)
  else b.add(COL.POINTS_LEDGER, entry)
  b.set(COL.POINTS_BALANCE, student.id, {
    studentId: student.id, studentName: entry.studentName, parentId: entry.parentId,
    groupId: entry.groupId, groupName: ac.groupName || '',
    balance: op.inc(d), [d > 0 ? 'earned' : 'lost']: op.inc(Math.abs(d)),
    months: { [entry.month]: op.inc(d) }, updatedAt: op.now()
  }, { merge: true })
  return d
}

/** Manual award / deduction by staff or teacher. */
export async function manualPoints({ student, delta, reason }, actor) {
  if (!student) throw new Error('اختر الطالب')
  if (!Number(delta)) throw new Error('أدخل عدد النقاط')
  if (!reason?.trim()) throw new Error('اكتب السبب')
  const b = db().batch()
  award(b, { student, delta, source: 'manual', reason: reason.trim() }, actor)
  await b.commit()
}

export const getBalance = (studentId) => db().get(COL.POINTS_BALANCE, studentId)
export const subscribeBalances = (cb) => db().subscribe(COL.POINTS_BALANCE, {}, cb)
export const ledgerFor = (studentId, scopeWhere = []) =>
  db().list(COL.POINTS_LEDGER, { where: [['studentId', '==', studentId], ...scopeWhere] })
    .then((r) => r.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1)))

/** Honor board ranking for a period: 'all' or a month key (YYYY-MM); optional group filter. */
export function rankBalances(balances, { period = 'all', groupId = '' } = {}) {
  return (balances || [])
    .filter((x) => !groupId || x.groupId === groupId)
    .map((x) => ({ ...x, score: period === 'all' ? Number(x.balance) || 0 : Number(x.months?.[period]) || 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.studentName || '').localeCompare(b.studentName || '', 'ar'))
    .map((x, i, arr) => ({ ...x, rank: i > 0 && arr[i - 1].score === x.score ? null : i + 1 }))
    .map((x, i, arr) => ({ ...x, rank: x.rank ?? arr.slice(0, i).reverse().find((y) => y.rank)?.rank }))
}

export const LEVELS = [[0, 'مبتدئ'], [100, 'مجتهد'], [300, 'متميّز'], [700, 'متقن'], [1500, 'حامل الراية']]
export const levelOf = (balance) => [...LEVELS].reverse().find(([min]) => (balance || 0) >= min)[1]
