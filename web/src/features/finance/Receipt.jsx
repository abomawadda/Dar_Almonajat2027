// Printable receipt (payments, donations). Print → "Save as PDF" gives a PDF copy.
import { Button, Icon } from '@/components/ui'
import { PAY_METHODS } from '@/services/finance'
import { fmtDate, fmtMoney } from '@/lib/format'

export default function Receipt({ r, title = 'إيصال استلام نقدية' }) {
  const text = `${title} ${r.receiptNo}\n${r.studentName ? `الطالب: ${r.studentName}\n` : ''}${r.donorName ? `المتبرع: ${r.donorName}\n` : ''}المبلغ: ${fmtMoney(r.amount)}\nالتاريخ: ${r.date}`
  return (
    <>
      <div className="print-area bg-card border rounded-2xl p-5">
        <div className="flex items-center justify-between border-b pb-3 mb-3">
          <div><div className="text-sm font-extrabold">دار المناجاة لتحفيظ القرآن الكريم</div><div className="text-[11px] text-ink-muted">{title}</div></div>
          <Icon name="wallet-money-bold" className="text-3xl text-gold-500" />
        </div>
        <dl className="space-y-2 text-sm">
          <Row k="رقم الإيصال" v={<span className="font-mono">{r.receiptNo}</span>} />
          <Row k="التاريخ" v={fmtDate(r.date, { day: 'numeric', month: 'long', year: 'numeric' })} />
          {r.studentName && <Row k="الطالب" v={r.studentName} />}
          {r.period && <Row k="عن شهر" v={r.period} />}
          {r.donorName && <Row k="المتبرع" v={r.donorName} />}
          {r.purposeLabel && <Row k="الغرض" v={r.purposeLabel} />}
          <Row k="طريقة الدفع" v={PAY_METHODS[r.method] || r.method} />
          <Row k="المبلغ" v={<b className="text-lg text-gold-600">{fmtMoney(r.amount)}</b>} />
          {r.remaining != null && r.remaining > 0 && <Row k="المتبقي على الفاتورة" v={fmtMoney(r.remaining)} />}
          {r.status === 'voided' && <Row k="الحالة" v={<b className="text-bad">ملغى — {r.voidReason}</b>} />}
        </dl>
        <div className="flex justify-between mt-6 text-[10px] text-ink-muted"><span className="w-[40%] border-t pt-1">المستلم {r.receivedByName || ''}</span><span className="w-[40%] border-t pt-1">الختم</span></div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button className="flex-1" icon="printer-minimalistic-bold" onClick={() => window.print()}>طباعة / PDF</Button>
        <Button className="flex-1" variant="secondary" icon="share-bold" onClick={() => navigator.share?.({ text }).catch(() => {})}>مشاركة</Button>
      </div>
    </>
  )
}
const Row = ({ k, v }) => <div className="flex justify-between gap-3 border-b border-dashed last:border-0 pb-2"><dt className="text-ink-muted">{k}</dt><dd className="font-bold text-left">{v}</dd></div>
