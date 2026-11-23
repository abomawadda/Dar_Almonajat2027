// الماليات والخزينة (admin, accountant): overview, invoices & collection, expenses, donations,
// payroll, treasury (cash book + day closing) and fee settings.
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, Chips, EmptyState, Field, Input, KV, ListItem, SearchInput, Section, Select, Sheet, Skeleton, StatRow, Toggle, cx } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import {
  DISCOUNT_REASONS, DONATION_PURPOSES, EXPENSE_CATEGORIES, INVOICE_STATUS, PAY_METHODS, PERIODS,
  addDonation, addExpense, cancelInvoice, cashTotals, closeDay, generateInvoices, generatePayroll, monthSummary,
  payPayslip, priceFor, recordPayment, saveFeePlan, setStudentFees, setTeacherSalary, subscribeCash, subscribeFeePlans, subscribeInvoices,
  subscribePayments, updatePayslip, voidExpense, voidPayment
} from '@/services/finance'
import { db } from '@/lib/backend'
import { COL } from '@/config/constants'
import { fmtDate, fmtMoney, todayKey } from '@/lib/format'
import Receipt from './Receipt'

const TABS = [['overview', 'نظرة عامة'], ['invoices', 'الرسوم والتحصيل'], ['expenses', 'المصروفات'], ['donations', 'التبرعات'], ['payroll', 'الرواتب'], ['cash', 'الخزينة'], ['setup', 'الإعدادات']]
const lastMonths = (n = 6) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return todayKey(d).slice(0, 7) })
const useLive = (col, where = []) => {
  const [rows, setRows] = useState(null)
  const key = JSON.stringify(where)
  useEffect(() => db().subscribe(col, { where }, (r) => setRows(r.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1)))), [col, key]) // eslint-disable-line react-hooks/exhaustive-deps
  return rows
}

export default function FinancePage() {
  const [tab, setTab] = useState('overview')
  const [month, setMonth] = useState(todayKey().slice(0, 7))
  return (
    <Page title="الماليات والخزينة">
      <div className="px-4 mb-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 text-[13px]">
          {lastMonths(12).map((m) => <option key={m} value={m}>{fmtDate(`${m}-01`, { month: 'long', year: 'numeric' })}</option>)}
        </Select>
      </div>
      <Chips value={tab} onChange={setTab} options={TABS} />
      {tab === 'overview' && <Overview month={month} />}
      {tab === 'invoices' && <Invoices month={month} />}
      {tab === 'expenses' && <Expenses month={month} />}
      {tab === 'donations' && <Donations month={month} />}
      {tab === 'payroll' && <Payroll month={month} />}
      {tab === 'cash' && <Treasury />}
      {tab === 'setup' && <Setup />}
    </Page>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────
function Overview({ month }) {
  const invoices = useLive(COL.INVOICES, [['period', '==', month]])
  const entries = useLive(COL.CASH_ENTRIES)
  if (!invoices || !entries) return <Skeleton rows={4} />
  const s = monthSummary({ invoices, entries }, month)
  const boxBal = cashTotals(entries, { cashOnly: true }).net
  const late = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled' && i.dueDate < todayKey())
  return (
    <>
      <StatRow items={[[fmtMoney(s.collected, ''), 'المحصّل', 'ok'], [fmtMoney(s.outstanding, ''), 'المتبقي', 'warn'], [`${s.rate}%`, 'نسبة التحصيل', 'info']]} />
      <Section title="الشهر">
        <Card className="p-4 grid grid-cols-2 gap-3">
          <KV label="الإيرادات (رسوم + تبرعات)">{fmtMoney(s.income)}</KV>
          <KV label="المصروفات + الرواتب">{fmtMoney(s.spending)}</KV>
          <KV label="التبرعات">{fmtMoney(s.donations)}</KV>
          <KV label="الرواتب المصروفة">{fmtMoney(s.payroll)}</KV>
          <KV label="صافي الشهر"><span className={s.net >= 0 ? 'text-ok' : 'text-bad'}>{fmtMoney(s.net)}</span></KV>
          <KV label="رصيد الخزينة (نقدي)"><b>{fmtMoney(boxBal)}</b></KV>
        </Card>
      </Section>
      <Section title={`متأخرات السداد (${late.length})`}>
        {!late.length ? <EmptyState icon="check-circle-bold">لا توجد متأخرات</EmptyState> : (
          <Card>{late.slice(0, 20).map((i) => <ListItem key={i.id} title={i.studentName} subtitle={`${i.groupName} • استحقاق ${i.dueDate}`} trailing={<b className="text-bad">{fmtMoney(i.amount - (i.paid || 0))}</b>} />)}</Card>
        )}
      </Section>
    </>
  )
}

// ── Invoices & collection ────────────────────────────────────────────────
function Invoices({ month }) {
  const { actor } = useAuth()
  const { students } = useData()
  const [invoices, setInvoices] = useState(null)
  const [plans, setPlans] = useState([])
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [pay, setPay] = useState(null)
  const [receipt, setReceipt] = useState(null)
  useEffect(() => subscribeInvoices([['period', '==', month]], setInvoices), [month])
  useEffect(() => subscribeFeePlans(setPlans), [])
  const [gen, generating] = useAction(() => generateInvoices(month, students || [], plans, actor),
    { success: (r) => (r.created ? `أُنشئت ${r.created} فاتورة بإجمالي ${fmtMoney(r.total)}` : 'كل فواتير الشهر موجودة') })

  if (!invoices) return <Skeleton rows={4} />
  const list = invoices.filter((i) => (filter === 'open' ? i.status === 'due' || i.status === 'partial' : filter === 'all' || i.status === filter))
    .filter((i) => !q || i.studentName.includes(q))
  return (
    <>
      <div className="px-4 mb-3"><Button block icon="document-add-bold" busy={generating} onClick={gen}>إصدار فواتير الشهر</Button></div>
      <Chips value={filter} onChange={setFilter} options={[['open', 'غير مسددة'], ['paid', 'مدفوعة'], ['cancelled', 'ملغاة'], ['all', 'الكل']]} />
      <div className="px-4 mb-2"><SearchInput value={q} onChange={setQ} placeholder="بحث باسم الطالب" /></div>
      <Section>
        {!list.length ? <EmptyState icon="card-bold">لا توجد فواتير</EmptyState> : (
          <Card>
            {list.map((i) => (
              <ListItem key={i.id} onClick={() => setPay(i)} title={i.studentName}
                subtitle={`${i.planName}${i.discount ? ` • خصم ${fmtMoney(i.discount)} (${i.discountReason})` : ''}`}
                trailing={<div className="flex flex-col items-end gap-1"><b>{fmtMoney(i.amount)}</b><Badge tone={INVOICE_STATUS[i.status].tone}>{i.status === 'partial' ? `باقي ${fmtMoney(i.amount - i.paid, '')}` : INVOICE_STATUS[i.status].label}</Badge></div>} />
            ))}
          </Card>
        )}
      </Section>
      <PaySheet inv={pay} actor={actor} onClose={() => setPay(null)} onPaid={(r) => { setPay(null); setReceipt(r) }} />
      <Sheet open={!!receipt} title="الإيصال" onClose={() => setReceipt(null)}>{receipt && <Receipt r={{ ...receipt, receivedByName: actor.name }} />}</Sheet>
    </>
  )
}

function PaySheet({ inv, actor, onClose, onPaid }) {
  const [f, setF] = useState({ amount: '', method: 'cash', note: '' })
  const [cancelReason, setCancelReason] = useState('')
  const [payments, setPayments] = useState([])
  useEffect(() => {
    if (!inv) return
    setF({ amount: String(inv.amount - (inv.paid || 0)), method: 'cash', note: '' })
    return subscribePayments([['invoiceId', '==', inv.id]], setPayments)
  }, [inv?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pay, paying] = useAction(() => recordPayment(inv, f, actor), { success: (r) => `إيصال ${r.receiptNo}` })
  const [cancel, cancelling] = useAction(() => cancelInvoice(inv, cancelReason, actor), { success: 'أُلغيت الفاتورة' })
  const [voidIt, voiding] = useAction((p) => voidPayment(p, prompt('سبب إلغاء الإيصال؟') || '', actor), { success: 'أُلغي الإيصال' })
  const remaining = inv ? inv.amount - (inv.paid || 0) : 0
  return (
    <Sheet open={!!inv} title={inv ? `${inv.studentName} — ${inv.period}` : ''} onClose={onClose}>
      {inv && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <KV label="المستحق">{fmtMoney(inv.amount)}</KV><KV label="المدفوع">{fmtMoney(inv.paid || 0)}</KV><KV label="المتبقي"><b className="text-bad">{fmtMoney(remaining)}</b></KV>
          </div>
          {remaining > 0 && inv.status !== 'cancelled' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="المبلغ"><Input type="number" inputMode="decimal" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
                <Field label="طريقة الدفع"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              </div>
              <Field label="ملاحظة"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="اختياري — مثل رقم التحويل" /></Field>
              <Button block icon="check-circle-bold" busy={paying} onClick={async () => { const r = await pay(); if (r) onPaid(r) }}>تسجيل الدفع وإصدار إيصال</Button>
            </>
          )}
          {payments.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold text-ink-soft mb-1">الإيصالات</div>
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b text-sm">
                  <span className={cx(p.status === 'voided' && 'line-through text-ink-muted')}>{p.receiptNo} • {PAY_METHODS[p.method]} • {fmtMoney(p.amount)}</span>
                  {p.status === 'valid' && <Button size="xs" variant="secondary" busy={voiding} onClick={() => voidIt(p)}>إلغاء</Button>}
                </div>
              ))}
            </div>
          )}
          {inv.status !== 'cancelled' && !(inv.paid > 0) && (
            <div className="mt-4 pt-3 border-t">
              <Field label="إلغاء الفاتورة (السبب)"><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثال: انسحب الطالب" /></Field>
              <Button block variant="danger" busy={cancelling} disabled={!cancelReason.trim()} onClick={async () => (await cancel()) && onClose()}>إلغاء الفاتورة</Button>
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

// ── Expenses ─────────────────────────────────────────────────────────────
function Expenses({ month }) {
  const { actor } = useAuth()
  const rows = useLive(COL.EXPENSES, [['month', '==', month]])
  const [f, setF] = useState({ category: EXPENSE_CATEGORIES[0], amount: '', vendor: '', note: '', method: 'cash', date: todayKey() })
  const [add, adding] = useAction(() => addExpense(f, actor), { success: (r) => `سُجّل المصروف ${r.voucherNo}` })
  const [voidIt] = useAction((e) => voidExpense(e, prompt('سبب الإلغاء؟') || '', actor), { success: 'أُلغي المصروف' })
  if (!rows) return <Skeleton rows={4} />
  const total = rows.filter((e) => e.status === 'valid').reduce((n, e) => n + e.amount, 0)
  const byCat = EXPENSE_CATEGORIES.map((c) => [c, rows.filter((e) => e.status === 'valid' && e.category === c).reduce((n, e) => n + e.amount, 0)]).filter(([, v]) => v > 0)
  return (
    <>
      <Section title="مصروف جديد">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label="البند"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="المبلغ"><Input type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="الجهة / المورّد"><Input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></Field>
            <Field label="طريقة الدفع"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          <Field label="التاريخ"><Input type="date" max={todayKey()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="ملاحظة"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Button block icon="check-circle-bold" busy={adding} onClick={async () => (await add()) && setF({ ...f, amount: '', vendor: '', note: '' })}>تسجيل المصروف</Button>
        </Card>
      </Section>
      <Section title={`مصروفات الشهر — ${fmtMoney(total)}`}>
        {byCat.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{byCat.map(([c, v]) => <Badge key={c}>{c}: {fmtMoney(v, '')}</Badge>)}</div>}
        {!rows.length ? <EmptyState icon="wallet-money-bold">لا توجد مصروفات</EmptyState> : (
          <Card>{rows.map((e) => (
            <ListItem key={e.id} title={<span className={cx(e.status === 'voided' && 'line-through text-ink-muted')}>{e.category}{e.vendor ? ` — ${e.vendor}` : ''}</span>}
              subtitle={`${e.voucherNo} • ${e.date}${e.note ? ` • ${e.note}` : ''}${e.status === 'voided' ? ` • ملغى: ${e.voidReason}` : ''}`}
              trailing={<div className="flex flex-col items-end gap-1"><b className="text-bad">{fmtMoney(e.amount)}</b>{e.status === 'valid' && <button className="text-[11px] text-ink-muted underline" onClick={() => voidIt(e)}>إلغاء</button>}</div>} />
          ))}</Card>
        )}
      </Section>
    </>
  )
}

// ── Donations ────────────────────────────────────────────────────────────
function Donations({ month }) {
  const { actor } = useAuth()
  const { students } = useData()
  const rows = useLive(COL.DONATIONS, [['month', '==', month]])
  const [f, setF] = useState({ donorName: '', phone: '', amount: '', purpose: 'general', studentId: '', method: 'cash', note: '', anonymous: false })
  const [receipt, setReceipt] = useState(null)
  const [add, adding] = useAction(() => {
    const st = (students || []).find((s) => s.id === f.studentId)
    return addDonation({ ...f, studentName: st?.personalInfo.fullName || '' }, actor)
  }, { success: (r) => `إيصال تبرع ${r.receiptNo}` })
  if (!rows) return <Skeleton rows={4} />
  return (
    <>
      <Section title="تبرع / كفالة جديدة">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold">فاعل خير (بدون اسم)</span><Toggle checked={f.anonymous} onChange={(v) => setF({ ...f, anonymous: v })} /></div>
          {!f.anonymous && <div className="grid grid-cols-2 gap-2">
            <Field label="اسم المتبرع"><Input value={f.donorName} onChange={(e) => setF({ ...f, donorName: e.target.value })} /></Field>
            <Field label="الهاتف"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>}
          <div className="grid grid-cols-2 gap-2">
            <Field label="الغرض"><Select value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>{Object.entries(DONATION_PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="المبلغ"><Input type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          </div>
          {f.purpose === 'student' && (
            <Field label="الطالب المكفول"><Select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">—</option>{(students || []).map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}</Select></Field>
          )}
          <Field label="طريقة الدفع"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Button block icon="check-circle-bold" busy={adding} onClick={async () => {
            const r = await add()
            if (r) { setReceipt({ ...f, ...r, amount: Number(f.amount), date: todayKey(), donorName: f.anonymous ? 'فاعل خير' : f.donorName, purposeLabel: DONATION_PURPOSES[f.purpose] }); setF({ ...f, donorName: '', phone: '', amount: '', note: '' }) }
          }}>تسجيل وإصدار إيصال</Button>
        </Card>
      </Section>
      <Section title={`تبرعات الشهر — ${fmtMoney(rows.reduce((n, d) => n + d.amount, 0))}`}>
        {!rows.length ? <EmptyState icon="gift-bold">لا توجد تبرعات</EmptyState> : (
          <Card>{rows.map((d) => <ListItem key={d.id} onClick={() => setReceipt({ ...d, purposeLabel: DONATION_PURPOSES[d.purpose] })} title={d.donorName} subtitle={`${DONATION_PURPOSES[d.purpose]}${d.studentName ? ` — ${d.studentName}` : ''} • ${d.receiptNo}`} trailing={<b className="text-ok">{fmtMoney(d.amount)}</b>} />)}</Card>
        )}
      </Section>
      <Sheet open={!!receipt} title="إيصال تبرع" onClose={() => setReceipt(null)}>{receipt && <Receipt r={{ ...receipt, receivedByName: actor.name }} title="إيصال تبرع" />}</Sheet>
    </>
  )
}

// ── Payroll ──────────────────────────────────────────────────────────────
function Payroll({ month }) {
  const { actor } = useAuth()
  const { teachers } = useData()
  const rows = useLive(COL.PAYROLL, [['month', '==', month]])
  const [edit, setEdit] = useState(null)
  const [gen, generating] = useAction(() => generatePayroll(month, teachers || [], actor), { success: (n) => (n ? `أُنشئ ${n} كشف راتب` : 'كشوف الشهر موجودة') })
  const [save, saving] = useAction(() => updatePayslip(edit, edit), { success: 'حُفظ' })
  const [pay, paying] = useAction((s, m) => payPayslip(s, m, actor), { success: 'صُرف الراتب' })
  if (!rows) return <Skeleton rows={4} />
  const total = rows.reduce((n, s) => n + s.net, 0)
  return (
    <>
      <div className="px-4 mb-3"><Button block icon="document-add-bold" busy={generating} onClick={gen}>إنشاء كشوف رواتب الشهر</Button></div>
      <Section title={`إجمالي الصافي — ${fmtMoney(total)}`}>
        {!rows.length ? <EmptyState icon="users-group-rounded-bold">لا توجد كشوف — حدد راتب كل محفظ ثم أنشئ الكشوف</EmptyState> : rows.map((s) => (
          <Card key={s.id} className="p-3 mb-2">
            <div className="flex items-center justify-between"><b className="text-sm">{s.name}</b><Badge tone={s.status === 'paid' ? 'ok' : 'warn'}>{s.status === 'paid' ? 'صُرف' : 'مسودة'}</Badge></div>
            <div className="grid grid-cols-4 gap-1 text-center text-xs mt-2">
              <KV label="الأساسي">{fmtMoney(s.base, '')}</KV><KV label="حوافز">{fmtMoney(s.bonus, '')}</KV><KV label="خصومات">{fmtMoney(s.deductions, '')}</KV><KV label="الصافي"><b>{fmtMoney(s.net, '')}</b></KV>
            </div>
            {s.notes && <div className="text-[11px] text-ink-muted mt-1">{s.notes}</div>}
            {s.status === 'draft' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button size="sm" variant="secondary" onClick={() => setEdit({ ...s })}>تعديل</Button>
                <Button size="sm" busy={paying} onClick={() => confirm(`صرف ${fmtMoney(s.net)} لـ ${s.name}؟`) && pay(s, 'cash')}>صرف نقدًا</Button>
              </div>
            )}
          </Card>
        ))}
      </Section>
      <Sheet open={!!edit} title={edit?.name || ''} onClose={() => setEdit(null)}>
        {edit && <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="حوافز"><Input type="number" min="0" value={edit.bonus} onChange={(e) => setEdit({ ...edit, bonus: e.target.value })} /></Field>
            <Field label="خصومات"><Input type="number" min="0" value={edit.deductions} onChange={(e) => setEdit({ ...edit, deductions: e.target.value })} /></Field>
          </div>
          <Field label="ملاحظات"><Input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="مثال: حافز ختمات، خصم غياب يوم" /></Field>
          <Button block busy={saving} onClick={async () => (await save()) && setEdit(null)}>حفظ</Button>
        </>}
      </Sheet>
    </>
  )
}

// ── Treasury ─────────────────────────────────────────────────────────────
const SOURCES = { payment: 'رسوم', donation: 'تبرع', expense: 'مصروف', expense_void: 'إلغاء مصروف', payroll: 'راتب', refund: 'إلغاء إيصال' }
function Treasury() {
  const { actor } = useAuth()
  const [entries, setEntries] = useState(null)
  const [date, setDate] = useState(todayKey())
  const [counted, setCounted] = useState('')
  const closings = useLive(COL.CASH_CLOSINGS)
  useEffect(() => subscribeCash([], setEntries), [])
  const [close, closing] = useAction(() => closeDay(date, counted, actor), { success: (c) => (c.diff === 0 ? 'أُقفل اليوم — الخزينة مطابقة' : `أُقفل اليوم — فرق ${fmtMoney(c.diff)}`) })
  if (!entries || !closings) return <Skeleton rows={4} />
  const day = entries.filter((e) => e.date === date)
  const t = cashTotals(day, { cashOnly: true })
  const bal = cashTotals(entries.filter((e) => e.date <= date), { cashOnly: true }).net
  const closed = closings.find((c) => c.id === date)
  return (
    <>
      <div className="px-4 mb-2"><Input type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <StatRow items={[[fmtMoney(t.in, ''), 'وارد نقدي', 'ok'], [fmtMoney(t.out, ''), 'منصرف نقدي', 'bad'], [fmtMoney(bal, ''), 'الرصيد', 'info']]} />
      <Section title="إقفال اليوم">
        <Card className="p-4">
          {closed ? (
            <div className="text-sm space-y-1">
              <div>المتوقع: <b>{fmtMoney(closed.expected)}</b> • الفعلي: <b>{fmtMoney(closed.counted)}</b></div>
              <div className={closed.diff === 0 ? 'text-ok font-bold' : 'text-bad font-bold'}>{closed.diff === 0 ? '✓ مطابق' : `فرق ${fmtMoney(closed.diff)}`}</div>
              <div className="text-[11px] text-ink-muted">بواسطة {closed.closedByName}</div>
            </div>
          ) : (
            <>
              <Field label={`النقدية الموجودة فعليًا (المتوقع ${fmtMoney(bal)})`}><Input type="number" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
              <Button block icon="check-circle-bold" busy={closing} disabled={counted === ''} onClick={close}>إقفال اليوم</Button>
            </>
          )}
        </Card>
      </Section>
      <Section title="حركة اليوم">
        {!day.length ? <EmptyState icon="wallet-money-bold">لا توجد حركة</EmptyState> : (
          <Card>{day.map((e) => <ListItem key={e.id} title={SOURCES[e.source] || e.source} subtitle={`${PAY_METHODS[e.method] || e.method} • ${e.note}`} trailing={<b className={e.direction === 'in' ? 'text-ok' : 'text-bad'}>{e.direction === 'in' ? '+' : '−'}{fmtMoney(e.amount, '')}</b>} />)}</Card>
        )}
      </Section>
    </>
  )
}

// ── Setup: fee plans + student billing profiles ─────────────────────────
function Setup() {
  const { actor } = useAuth()
  const { students, teachers } = useData()
  const [setSalary] = useAction((t, v) => setTeacherSalary(t, v, actor), { success: 'حُفظ الراتب' })
  const [plans, setPlans] = useState([])
  const [np, setNp] = useState({ name: '', amount: '', period: 'monthly' })
  const [q, setQ] = useState('')
  useEffect(() => subscribeFeePlans(setPlans), [])
  const [addPlan, adding] = useAction(() => saveFeePlan(np, actor), { success: 'أُضيفت الخطة' })
  const [setFees] = useAction((s, patch) => setStudentFees(s, { ...(s.fees || {}), ...patch }, actor), { success: 'حُفظ' })
  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans])
  const list = (students || []).filter((s) => !q || s.personalInfo.fullName.includes(q))
  return (
    <>
      <Section title="خطط الرسوم">
        <Card className="p-4">
          {plans.map((p) => <div key={p.id} className="flex justify-between text-sm py-1.5 border-b"><span>{p.name} <Badge>{PERIODS[p.period]}</Badge></span><b>{fmtMoney(p.amount)}</b></div>)}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Input placeholder="اسم الخطة" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} className="col-span-2" />
            <Input type="number" placeholder="المبلغ" value={np.amount} onChange={(e) => setNp({ ...np, amount: e.target.value })} />
          </div>
          <Button block size="sm" className="mt-2" busy={adding} onClick={async () => (await addPlan()) && setNp({ name: '', amount: '', period: 'monthly' })}>إضافة خطة شهرية</Button>
        </Card>
      </Section>
      <Section title="رواتب المحفظين (أساسي شهري)">
        <Card className="p-4">
          {(teachers || []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
              <span className="text-sm font-bold flex-1">{t.name}</span>
              <Input type="number" className="w-28 h-9" defaultValue={t.salary || ''} onBlur={(e) => Number(e.target.value) !== (t.salary || 0) && setSalary(t, e.target.value)} />
            </div>
          ))}
        </Card>
      </Section>
      <Section title="رسوم الطلاب والخصومات">
        <div className="mb-2"><SearchInput value={q} onChange={setQ} placeholder="بحث باسم الطالب" /></div>
        {list.map((s) => {
          const fees = s.fees || {}
          const p = priceFor(planById[fees.planId], fees)
          return (
            <Card key={s.id} className="p-3 mb-2">
              <div className="flex justify-between text-sm font-bold mb-2"><span>{s.personalInfo.fullName}</span><span className="text-gold-600">{fees.planId ? fmtMoney(p.amount) : 'بدون رسوم'}</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <Select className="h-9 text-xs" value={fees.planId || ''} onChange={(e) => setFees(s, { planId: e.target.value })}><option value="">معفى / بدون</option>{plans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                <Select className="h-9 text-xs" value={fees.discountPercent || 0} onChange={(e) => setFees(s, { discountPercent: +e.target.value, discountReason: +e.target.value ? (fees.discountReason || DISCOUNT_REASONS[0]) : '' })}>
                  {[0, 10, 15, 20, 25, 30, 50, 75, 100].map((n) => <option key={n} value={n}>{n ? `خصم ${n}%` : 'بدون خصم'}</option>)}
                </Select>
                <Select className="h-9 text-xs" disabled={!fees.discountPercent} value={fees.discountReason || ''} onChange={(e) => setFees(s, { discountReason: e.target.value })}>
                  <option value="">السبب</option>{DISCOUNT_REASONS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </div>
            </Card>
          )
        })}
      </Section>
    </>
  )
}
