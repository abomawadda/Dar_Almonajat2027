// Parent: fees per child — open invoices, paid ones, and receipts (printable).
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Card, EmptyState, ListItem, Section, Sheet, Skeleton, StatRow } from '@/components/ui'
import { INVOICE_STATUS, PAY_METHODS, subscribeInvoices, subscribePayments } from '@/services/finance'
import { fmtMoney } from '@/lib/format'
import Receipt from './Receipt'

export default function PaymentsPage() {
  const { actor } = useAuth()
  const [invoices, setInvoices] = useState(null)
  const [payments, setPayments] = useState(null)
  const [receipt, setReceipt] = useState(null)
  useEffect(() => subscribeInvoices([['parentId', '==', actor.linkedId]], setInvoices), [actor])
  useEffect(() => subscribePayments([['parentId', '==', actor.linkedId]], setPayments), [actor])
  if (!invoices || !payments) return <Page title="الرسوم والمدفوعات"><Skeleton rows={4} /></Page>
  const open = invoices.filter((i) => i.status === 'due' || i.status === 'partial')
  const due = open.reduce((n, i) => n + i.amount - (i.paid || 0), 0)
  const paid = payments.filter((p) => p.status === 'valid').reduce((n, p) => n + p.amount, 0)
  return (
    <Page title="الرسوم والمدفوعات">
      <StatRow items={[[fmtMoney(due, ''), 'المستحق الآن', due ? 'bad' : 'ok'], [open.length, 'فواتير مفتوحة', 'warn'], [fmtMoney(paid, ''), 'إجمالي المدفوع', 'ok']]} />
      <Section title="الفواتير">
        {!invoices.length ? <EmptyState icon="card-bold">لا توجد فواتير</EmptyState> : (
          <Card>{invoices.filter((i) => i.status !== 'cancelled').map((i) => (
            <ListItem key={i.id} title={`${i.studentName} — ${i.period}`}
              subtitle={`${i.planName}${i.discount ? ` • خصم ${fmtMoney(i.discount)}` : ''} • استحقاق ${i.dueDate}`}
              trailing={<div className="flex flex-col items-end gap-1"><b>{fmtMoney(i.amount)}</b><Badge tone={INVOICE_STATUS[i.status].tone}>{i.status === 'partial' ? `باقي ${fmtMoney(i.amount - i.paid, '')}` : INVOICE_STATUS[i.status].label}</Badge></div>} />
          ))}</Card>
        )}
        {open.length > 0 && <div className="text-xs text-ink-muted mt-2 leading-6">السداد لدى إدارة الدار نقدًا أو بالتحويل (إنستاباي / فودافون كاش) — يصلك إيصال إلكتروني فور التسجيل.</div>}
      </Section>
      <Section title="الإيصالات">
        {!payments.length ? <EmptyState icon="wallet-money-bold">لا توجد إيصالات</EmptyState> : (
          <Card>{payments.map((p) => (
            <ListItem key={p.id} onClick={() => setReceipt(p)} title={`${p.receiptNo}${p.status === 'voided' ? ' (ملغى)' : ''}`} subtitle={`${p.studentName} • ${p.period} • ${PAY_METHODS[p.method]}`} trailing={<b className={p.status === 'voided' ? 'line-through text-ink-muted' : 'text-ok'}>{fmtMoney(p.amount)}</b>} />
          ))}</Card>
        )}
      </Section>
      <Sheet open={!!receipt} title="الإيصال" onClose={() => setReceipt(null)}>{receipt && <Receipt r={receipt} />}</Sheet>
    </Page>
  )
}
