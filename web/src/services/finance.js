// Finance: fee plans → monthly invoices → payments with receipts; expenses; donations & sponsorships;
// payroll; and the treasury. Every money movement writes one append-only cash entry (in/out), so the
// treasury balance is derived, never typed. Corrections are voids that write a reversing entry.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { todayKey } from '@/lib/format'

export const PAY_METHODS = { cash: 'نقدي', instapay: 'إنستاباي', vodafone: 'فودافون كاش', fawry: 'فوري', bank: 'تحويل بنكي' }
export const PERIODS = { monthly: 'شهري', term: 'فصلي', once: 'مرة واحدة' }
export const INVOICE_STATUS = {
  due: { label: 'مستحقة', tone: 'warn' }, partial: { label: 'مدفوعة جزئيًا', tone: 'info' },
  paid: { label: 'مدفوعة', tone: 'ok' }, cancelled: { label: 'ملغاة', tone: 'muted' }
}
export const EXPENSE_CATEGORIES = ['رواتب ومكافآت', 'إيجار', 'كهرباء ومياه', 'إنترنت واتصالات', 'أدوات ومصاحف', 'جوائز وهدايا', 'صيانة ونظافة', 'ضيافة وفعاليات', 'أخرى']
export const DONATION_PURPOSES = { general: 'تبرع عام', student: 'كفالة طالب', teacher: 'كفالة محفظ', zakat: 'زكاة', event: 'فعالية' }
export const DISCOUNT_REASONS = ['أخوة', 'يتيم', 'متفوق', 'ظروف خاصة', 'ابن عامل بالدار']

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const monthOf = (date) => String(date).slice(0, 7)
const notify = (b, userId, type, title, body) => {
  if (userId) b.add(COL.NOTIFICATIONS, { userId, type, title, body, isRead: false, createdAt: op.now() })
}

/** Sequential document numbers per prefix and year (R-2026-00001). Moves to a server transaction with Functions. */
async function nextNumber(b, prefix, year) {
  const id = `${prefix}_${year}`
  const cur = await db().get(COL.COUNTERS, id)
  b.__n = b.__n || {}
  b.__n[id] = (b.__n[id] || 0) + 1
  const n = (Number(cur?.value) || 0) + b.__n[id]
  b.set(COL.COUNTERS, id, { value: op.inc(1) }, { merge: true })
  return `${prefix}-${year}-${String(n).padStart(5, '0')}`
}

function cashEntry(b, { direction, amount, method = 'cash', source, refId = '', note = '', date = todayKey() }, actor) {
  b.add(COL.CASH_ENTRIES, {
    direction, amount: round2(amount), method, source, refId, note, date, month: monthOf(date),
    by: actor.uid, createdAt: op.now()
  })
}

// ── Fee plans & student billing profile ────────────────────────────────────
export const subscribeFeePlans = (cb) => db().subscribe(COL.FEE_PLANS, {}, (r) => cb(r.sort((a, b) => a.amount - b.amount)))
export function saveFeePlan({ id, name, amount, period }, actor) {
  if (!name?.trim()) throw new Error('اكتب اسم الخطة')
  const amt = round2(amount)
  if (!(amt > 0)) throw new Error('حدد قيمة الرسوم')
  const doc = { name: name.trim(), amount: amt, period: PERIODS[period] ? period : 'monthly', active: true, updatedBy: actor.uid, updatedAt: op.now() }
  return id ? db().update(COL.FEE_PLANS, id, doc) : db().add(COL.FEE_PLANS, doc)
}

export function setStudentFees(student, { planId, discountPercent = 0, discountReason = '' }, actor) {
  const pct = Math.round(Number(discountPercent) || 0)
  if (pct < 0 || pct > 100) throw new Error('نسبة الخصم بين 0 و100')
  if (pct > 0 && !discountReason) throw new Error('اختر سبب الخصم')
  return db().update(COL.STUDENTS, student.id, { fees: { planId: planId || '', discountPercent: pct, discountReason: pct ? discountReason : '', updatedBy: actor.uid } })
}

/** Invoice amounts for a student and plan. */
export function priceFor(plan, fees = {}) {
  const gross = round2(plan?.amount)
  const pct = Math.min(100, Math.max(0, Number(fees.discountPercent) || 0))
  const discount = round2((gross * pct) / 100)
  return { gross, discount, amount: round2(gross - discount) }
}

// ── Invoices ───────────────────────────────────────────────────────────────
export const subscribeInvoices = (where, cb) =>
  db().subscribe(COL.INVOICES, { where }, (r) => cb(r.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : (a.studentName || '').localeCompare(b.studentName || '', 'ar')))))

/**
 * Create the invoices of a month for every active student with a monthly plan.
 * Idempotent: invoice id = `${period}_${studentId}`; existing invoices are left untouched.
 */
export async function generateInvoices(period, students, plans, actor, { dueDay = 10 } = {}) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('اختر الشهر')
  const planById = Object.fromEntries(plans.map((p) => [p.id, p]))
  const existing = new Set((await db().list(COL.INVOICES, { where: [['period', '==', period]] })).map((i) => i.studentId))
  const b = db().batch()
  let created = 0, total = 0
  for (const s of students) {
    if (s.status && s.status !== 'active') continue
    const plan = planById[s.fees?.planId]
    if (!plan || !plan.active || plan.period !== 'monthly' || existing.has(s.id)) continue
    const p = priceFor(plan, s.fees)
    if (p.amount <= 0) continue // fully exempted
    b.set(COL.INVOICES, `${period}_${s.id}`, {
      period, studentId: s.id, studentName: s.personalInfo.fullName, parentId: s.parentId || '',
      groupId: s.academicInfo?.groupId || '', groupName: s.academicInfo?.groupName || '',
      planId: plan.id, planName: plan.name, gross: p.gross, discount: p.discount, discountReason: s.fees?.discountReason || '',
      amount: p.amount, paid: 0, status: 'due', dueDate: `${period}-${String(dueDay).padStart(2, '0')}`,
      createdBy: actor.uid, createdAt: op.now()
    })
    notify(b, s.parentId, 'invoice', `رسوم ${period} — ${s.personalInfo.fullName.split(' ')[0]}`, `المستحق ${p.amount} ج.م حتى ${period}-${String(dueDay).padStart(2, '0')}`)
    created++; total += p.amount
  }
  if (created) await b.commit()
  return { created, total: round2(total) }
}

export async function cancelInvoice(inv, reason, actor) {
  if (!reason?.trim()) throw new Error('اكتب سبب الإلغاء')
  if ((Number(inv.paid) || 0) > 0) throw new Error('لا يمكن إلغاء فاتورة عليها مدفوعات — ألغِ الإيصالات أولًا')
  await db().update(COL.INVOICES, inv.id, { status: 'cancelled', cancelReason: reason.trim(), cancelledBy: actor.uid, cancelledAt: op.now() })
}

const statusFor = (amount, paid) => (paid <= 0 ? 'due' : paid + 0.001 >= amount ? 'paid' : 'partial')

// ── Payments & receipts ─────────────────────────────────────────────────────
export async function recordPayment(given, { amount, method = 'cash', note = '', date = todayKey() }, actor) {
  const inv = { ...given, ...(await db().get(COL.INVOICES, given.id)), id: given.id } // current paid amount
  if (inv.status === 'cancelled') throw new Error('الفاتورة ملغاة')
  const amt = round2(amount)
  const remaining = round2(inv.amount - (Number(inv.paid) || 0))
  if (!(amt > 0)) throw new Error('أدخل المبلغ')
  if (amt > remaining + 0.001) throw new Error(`المتبقي على الفاتورة ${remaining} ج.م فقط`)
  if (!PAY_METHODS[method]) throw new Error('اختر طريقة الدفع')
  const b = db().batch()
  const receiptNo = await nextNumber(b, 'R', date.slice(0, 4))
  const payId = b.add(COL.PAYMENTS, {
    invoiceId: inv.id, period: inv.period, studentId: inv.studentId, studentName: inv.studentName, parentId: inv.parentId,
    amount: amt, method, note: note.trim(), date, receiptNo, status: 'valid', receivedBy: actor.uid, receivedByName: actor.name || '', createdAt: op.now()
  })
  const paid = round2((Number(inv.paid) || 0) + amt)
  b.update(COL.INVOICES, inv.id, { paid: op.inc(amt), status: statusFor(inv.amount, paid), lastPaymentAt: op.now() })
  cashEntry(b, { direction: 'in', amount: amt, method, source: 'payment', refId: payId, note: `${receiptNo} — ${inv.studentName} (${inv.period})`, date }, actor)
  notify(b, inv.parentId, 'payment', `تم استلام ${amt} ج.م`, `إيصال ${receiptNo} — رسوم ${inv.period} للطالب ${inv.studentName}`)
  await b.commit()
  return { id: payId, receiptNo, amount: amt, method, date, studentName: inv.studentName, period: inv.period, remaining: round2(remaining - amt) }
}

export async function voidPayment(given, reason, actor) {
  const pay = { ...given, ...(await db().get(COL.PAYMENTS, given.id)), id: given.id }
  if (pay.status === 'voided') throw new Error('الإيصال ملغى مسبقًا')
  if (!reason?.trim()) throw new Error('اكتب سبب إلغاء الإيصال')
  const inv = await db().get(COL.INVOICES, pay.invoiceId)
  const b = db().batch()
  b.update(COL.PAYMENTS, pay.id, { status: 'voided', voidReason: reason.trim(), voidedBy: actor.uid, voidedAt: op.now() })
  if (inv) {
    const paid = round2((Number(inv.paid) || 0) - pay.amount)
    b.update(COL.INVOICES, pay.invoiceId, { paid: op.inc(-pay.amount), status: inv.status === 'cancelled' ? 'cancelled' : statusFor(inv.amount, paid) })
  }
  cashEntry(b, { direction: 'out', amount: pay.amount, method: pay.method, source: 'refund', refId: pay.id, note: `إلغاء ${pay.receiptNo}: ${reason.trim()}` }, actor)
  await b.commit()
}

export const subscribePayments = (where, cb) =>
  db().subscribe(COL.PAYMENTS, { where }, (r) => cb(r.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1))))

// ── Expenses ───────────────────────────────────────────────────────────────
export async function addExpense({ category, amount, vendor = '', note = '', method = 'cash', date = todayKey(), attachment = null }, actor) {
  if (!EXPENSE_CATEGORIES.includes(category)) throw new Error('اختر بند المصروف')
  const amt = round2(amount)
  if (!(amt > 0)) throw new Error('أدخل المبلغ')
  const b = db().batch()
  const voucherNo = await nextNumber(b, 'E', date.slice(0, 4))
  const id = b.add(COL.EXPENSES, { category, amount: amt, vendor: vendor.trim(), note: note.trim(), method, date, month: monthOf(date), voucherNo, attachment, status: 'valid', by: actor.uid, createdAt: op.now() })
  cashEntry(b, { direction: 'out', amount: amt, method, source: 'expense', refId: id, note: `${voucherNo} — ${category}${vendor ? ' — ' + vendor.trim() : ''}`, date }, actor)
  await b.commit()
  return { id, voucherNo }
}
export async function voidExpense(given, reason, actor) {
  const exp = { ...given, ...(await db().get(COL.EXPENSES, given.id)), id: given.id }
  if (exp.status === 'voided') throw new Error('ملغى مسبقًا')
  if (!reason?.trim()) throw new Error('اكتب سبب الإلغاء')
  const b = db().batch()
  b.update(COL.EXPENSES, exp.id, { status: 'voided', voidReason: reason.trim(), voidedBy: actor.uid, voidedAt: op.now() })
  cashEntry(b, { direction: 'in', amount: exp.amount, method: exp.method, source: 'expense_void', refId: exp.id, note: `إلغاء ${exp.voucherNo}: ${reason.trim()}` }, actor)
  await b.commit()
}

// ── Donations & sponsorships ───────────────────────────────────────────────
export async function addDonation({ donorName, phone = '', amount, purpose = 'general', studentId = '', studentName = '', method = 'cash', note = '', date = todayKey(), anonymous = false }, actor) {
  if (!anonymous && !donorName?.trim()) throw new Error('اكتب اسم المتبرع أو اختر «فاعل خير»')
  if (!DONATION_PURPOSES[purpose]) throw new Error('اختر الغرض')
  if (purpose === 'student' && !studentId) throw new Error('اختر الطالب المكفول')
  const amt = round2(amount)
  if (!(amt > 0)) throw new Error('أدخل المبلغ')
  const b = db().batch()
  const receiptNo = await nextNumber(b, 'D', date.slice(0, 4))
  const id = b.add(COL.DONATIONS, {
    donorName: anonymous ? 'فاعل خير' : donorName.trim(), phone: phone.trim(), amount: amt, purpose, studentId, studentName,
    method, note: note.trim(), date, month: monthOf(date), receiptNo, status: 'valid', by: actor.uid, createdAt: op.now()
  })
  cashEntry(b, { direction: 'in', amount: amt, method, source: 'donation', refId: id, note: `${receiptNo} — ${DONATION_PURPOSES[purpose]}`, date }, actor)
  await b.commit()
  return { id, receiptNo }
}

export function setTeacherSalary(teacher, salary, actor) {
  const v = round2(salary)
  if (!(v >= 0)) throw new Error('أدخل الراتب')
  return db().update(COL.TEACHERS, teacher.id, { salary: v, salaryUpdatedBy: actor.uid })
}

// ── Payroll ────────────────────────────────────────────────────────────────
/** Draft payslips for a month from each teacher's base salary (idempotent per teacher & month). */
export async function generatePayroll(month, teachers, actor) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('اختر الشهر')
  const existing = new Set((await db().list(COL.PAYROLL, { where: [['month', '==', month]] })).map((p) => p.teacherId))
  const b = db().batch()
  let created = 0
  for (const t of teachers) {
    const base = round2(t.salary)
    if (!(base > 0) || existing.has(t.id) || t.isActive === false) continue
    b.set(COL.PAYROLL, `${month}_${t.id}`, { month, teacherId: t.id, name: t.name, base, bonus: 0, deductions: 0, net: base, notes: '', status: 'draft', createdBy: actor.uid, createdAt: op.now() })
    created++
  }
  if (created) await b.commit()
  return created
}
export function updatePayslip(slip, { bonus, deductions, notes }) {
  if (slip.status !== 'draft') throw new Error('صُرف هذا الراتب — لا يمكن التعديل')
  const bo = round2(bonus), de = round2(deductions)
  if (bo < 0 || de < 0) throw new Error('القيم لا تكون سالبة')
  const net = round2(slip.base + bo - de)
  if (net < 0) throw new Error('الخصومات أكبر من المستحق')
  return db().update(COL.PAYROLL, slip.id, { bonus: bo, deductions: de, net, notes: (notes || '').trim() })
}
export async function payPayslip(given, method, actor) {
  const slip = { ...given, ...(await db().get(COL.PAYROLL, given.id)), id: given.id } // never trust a stale copy
  if (slip.status !== 'draft') throw new Error('صُرف هذا الراتب مسبقًا')
  const b = db().batch()
  b.update(COL.PAYROLL, slip.id, { status: 'paid', method, paidBy: actor.uid, paidAt: op.now(), paidOn: todayKey() })
  cashEntry(b, { direction: 'out', amount: slip.net, method, source: 'payroll', refId: slip.id, note: `راتب ${slip.name} — ${slip.month}` }, actor)
  notify(b, slip.teacherId, 'payroll', `صُرف راتب ${slip.month}`, `الصافي ${slip.net} ج.م`)
  await b.commit()
}

// ── Treasury ───────────────────────────────────────────────────────────────
export const subscribeCash = (where, cb) =>
  db().subscribe(COL.CASH_ENTRIES, { where }, (r) => cb(r.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1))))

/** Totals of a list of cash entries; `cashOnly` limits to physical cash (the box). */
export function cashTotals(entries, { cashOnly = false } = {}) {
  let inn = 0, out = 0
  for (const e of entries || []) {
    if (cashOnly && e.method !== 'cash') continue
    if (e.direction === 'in') inn += e.amount
    else out += e.amount
  }
  return { in: round2(inn), out: round2(out), net: round2(inn - out) }
}

/** Close a day: compare the counted cash with what the entries say should be in the box. */
export async function closeDay(date, counted, actor) {
  const existing = await db().get(COL.CASH_CLOSINGS, date)
  if (existing) throw new Error('أُقفل هذا اليوم مسبقًا')
  const all = await db().list(COL.CASH_ENTRIES, {})
  const expected = cashTotals(all.filter((e) => e.date <= date), { cashOnly: true }).net
  const day = cashTotals(all.filter((e) => e.date === date), { cashOnly: true })
  const c = round2(counted)
  if (Number.isNaN(c) || c < 0) throw new Error('أدخل المبلغ الموجود فعليًا في الخزينة')
  const doc = { date, in: day.in, out: day.out, expected, counted: c, diff: round2(c - expected), closedBy: actor.uid, closedByName: actor.name || '', closedAt: op.now() }
  await db().set(COL.CASH_CLOSINGS, date, doc)
  return doc
}

/** Month summary for the dashboard. */
export function monthSummary({ invoices = [], entries = [] }, month) {
  const inv = invoices.filter((i) => i.period === month && i.status !== 'cancelled')
  const due = round2(inv.reduce((n, i) => n + i.amount, 0))
  const collected = round2(inv.reduce((n, i) => n + (Number(i.paid) || 0), 0))
  const m = entries.filter((e) => e.month === month)
  const sum = (src, dir) => round2(m.filter((e) => src.includes(e.source) && e.direction === dir).reduce((n, e) => n + e.amount, 0))
  const income = round2(sum(['payment', 'donation'], 'in') - sum(['refund'], 'out'))
  const spending = round2(sum(['expense', 'payroll'], 'out') - sum(['expense_void'], 'in'))
  return {
    due, collected, outstanding: round2(due - collected), rate: due ? Math.round((collected / due) * 100) : 0,
    donations: sum(['donation'], 'in'), expenses: round2(sum(['expense'], 'out') - sum(['expense_void'], 'in')), payroll: sum(['payroll'], 'out'),
    income, spending, net: round2(income - spending)
  }
}
