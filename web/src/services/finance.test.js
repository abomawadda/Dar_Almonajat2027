import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import {
  addDonation, addExpense, cancelInvoice, cashTotals, closeDay, generateInvoices, generatePayroll, monthSummary,
  payPayslip, priceFor, recordPayment, setStudentFees, updatePayslip, voidExpense, voidPayment
} from './finance'
import { todayKey } from '@/lib/format'

const acc = { uid: 'demo-accountant', role: 'accountant', linkedId: 'demo-accountant', name: 'المحاسب' }
const month = todayKey().slice(0, 7)
const all = async (c) => db().list(c)
const students = () => db().list('students')
const plans = () => db().list('feePlans')
const inv = async (sid) => ({ id: `${month}_${sid}`, ...(await db().get('invoices', `${month}_${sid}`)) })
const box = async () => cashTotals(await all('cashEntries'), { cashOnly: true })

beforeEach(async () => { setDb(createMemoryAdapter()); await seedDemo(db()) })

describe('fees & invoices', () => {
  it('prices with discount and validates the billing profile', async () => {
    expect(priceFor({ amount: 200 }, { discountPercent: 25 })).toEqual({ gross: 200, discount: 50, amount: 150 })
    const [s] = await students()
    expect(() => setStudentFees(s, { planId: 'F1', discountPercent: 30 }, acc)).toThrow('سبب')
    expect(() => setStudentFees(s, { planId: 'F1', discountPercent: 130, discountReason: 'يتيم' }, acc)).toThrow()
  })

  it('generates one invoice per active student per month (idempotent), applying discounts', async () => {
    const st = await students()
    const r1 = await generateInvoices(month, st, await plans(), acc)
    expect(r1.created).toBe(st.length)
    expect((await inv('S6')).amount).toBe(100) // 50% sibling discount
    expect((await inv('S1'))).toMatchObject({ amount: 200, paid: 0, status: 'due' })
    const r2 = await generateInvoices(month, st, await plans(), acc)
    expect(r2.created).toBe(0)
    const notes = await db().list('notifications', { where: [['type', '==', 'invoice']] })
    expect(notes.length).toBe(st.length)
  })
})

describe('payments, receipts, voids and the treasury', () => {
  beforeEach(async () => { await generateInvoices(month, await students(), await plans(), acc) })

  it('partial then full payment, sequential receipts, cash box follows', async () => {
    const a = await recordPayment(await inv('S1'), { amount: 120, method: 'cash' }, acc)
    expect((await inv('S1'))).toMatchObject({ paid: 120, status: 'partial' })
    await expect(recordPayment(await inv('S1'), { amount: 100 }, acc)).rejects.toThrow('المتبقي')
    const b = await recordPayment(await inv('S1'), { amount: 80, method: 'instapay' }, acc)
    expect((await inv('S1')).status).toBe('paid')
    expect(a.receiptNo).toMatch(/^R-\d{4}-00001$/)
    expect(b.receiptNo).toMatch(/00002$/)
    expect((await box()).net).toBe(120) // instapay is not physical cash
    expect(cashTotals(await all('cashEntries')).net).toBe(200)
  })

  it('voiding a receipt reverses invoice and cash; cancelled invoices refuse payment', async () => {
    const p = await recordPayment(await inv('S2'), { amount: 200 }, acc)
    const [pay] = await db().list('payments', { where: [['receiptNo', '==', p.receiptNo]] })
    await expect(voidPayment(pay, '', acc)).rejects.toThrow()
    await expect(cancelInvoice(await inv('S2'), 'خطأ', acc)).rejects.toThrow('مدفوعات')
    await voidPayment(pay, 'دُفع مرتين', acc)
    expect((await inv('S2'))).toMatchObject({ paid: 0, status: 'due' })
    expect((await box()).net).toBe(0)
    await expect(voidPayment({ ...pay, status: 'voided' }, 'x', acc)).rejects.toThrow()
    await cancelInvoice(await inv('S2'), 'انسحب الطالب', acc)
    await expect(recordPayment(await inv('S2'), { amount: 10 }, acc)).rejects.toThrow('ملغاة')
  })

  it('expenses, donations, payroll and month summary', async () => {
    await recordPayment(await inv('S1'), { amount: 200 }, acc)
    const e = await addExpense({ category: 'كهرباء ومياه', amount: 350, vendor: 'شركة الكهرباء' }, acc)
    expect(e.voucherNo).toMatch(/^E-/)
    await expect(addExpense({ category: 'غير موجود', amount: 5 }, acc)).rejects.toThrow()
    await addDonation({ anonymous: true, amount: 1000, purpose: 'general' }, acc)
    await expect(addDonation({ donorName: 'أحمد', amount: 500, purpose: 'student' }, acc)).rejects.toThrow('المكفول')

    const teachers = await db().list('teachers')
    expect(await generatePayroll(month, teachers, acc)).toBe(3)
    expect(await generatePayroll(month, teachers, acc)).toBe(0)
    const slip = { id: `${month}_T1`, ...(await db().get('payroll', `${month}_T1`)) }
    await updatePayslip(slip, { bonus: 300, deductions: 100, notes: 'حافز ختمات' })
    const s2 = { id: slip.id, ...(await db().get('payroll', slip.id)) }
    expect(s2.net).toBe(4700)
    await payPayslip(s2, 'cash', acc)
    await expect(payPayslip(s2, 'cash', acc)).rejects.toThrow()
    expect(() => updatePayslip({ ...s2, status: 'paid' }, { bonus: 1 })).toThrow()

    const [exp] = await db().list('expenses')
    await voidExpense(exp, 'سُجّل بالخطأ', acc)

    const sum = monthSummary({ invoices: await all('invoices'), entries: await all('cashEntries') }, month)
    expect(sum).toMatchObject({ collected: 200, donations: 1000, expenses: 0, payroll: 4700, income: 1200, spending: 4700, net: -3500 })
    expect(sum.rate).toBeGreaterThan(0)
    expect((await box()).net).toBe(200 + 1000 - 4700)
  })

  it('closing the day compares counted cash with the expected balance, once', async () => {
    await recordPayment(await inv('S1'), { amount: 200 }, acc)
    const c = await closeDay(todayKey(), 190, acc)
    expect(c).toMatchObject({ expected: 200, counted: 190, diff: -10, in: 200 })
    await expect(closeDay(todayKey(), 200, acc)).rejects.toThrow('مسبقًا')
  })
})
