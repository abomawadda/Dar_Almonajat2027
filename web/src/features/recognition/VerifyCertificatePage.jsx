// Public certificate verification (no sign-in): /verify/:code — shows only name, type, grade, date, serial.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Icon, Input } from '@/components/ui'
import { verifyCertificate } from '@/services/certificates'
import { fmtDate } from '@/lib/format'

export default function VerifyCertificatePage() {
  const { code } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState(code || '')
  const [state, setState] = useState(code ? 'loading' : 'idle')
  const [cert, setCert] = useState(null)

  useEffect(() => {
    if (!code) return
    setState('loading')
    verifyCertificate(code).then((c) => { setCert(c); setState(c ? 'found' : 'missing') }).catch(() => setState('missing'))
  }, [code])

  const ok = cert?.status === 'valid'
  return (
    <div className="min-h-screen bg-paper px-4 py-10" dir="rtl">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <Icon name="diploma-verified-bold" className="text-5xl text-gold-500 mx-auto block" />
          <h1 className="text-xl font-extrabold mt-2">التحقق من شهادة</h1>
          <div className="text-xs text-ink-muted mt-1">دار المناجاة لتحفيظ القرآن الكريم</div>
        </div>
        <Card className="p-4 mb-4">
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/verify/${q.trim().toUpperCase()}`) }} className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رمز التحقق المطبوع على الشهادة" className="flex-1 font-mono" />
            <Button type="submit">تحقق</Button>
          </form>
        </Card>
        {state === 'loading' && <Card className="p-6 text-center text-sm text-ink-muted">جارٍ التحقق…</Card>}
        {state === 'missing' && <Card className="p-6 text-center"><div className="text-bad font-extrabold">لم يُعثر على شهادة بهذا الرمز</div><div className="text-xs text-ink-muted mt-1">تأكد من كتابة الرمز كما هو مطبوع</div></Card>}
        {state === 'found' && cert && (
          <Card className={`p-5 border-2 ${ok ? 'border-ok/40' : 'border-bad/40'}`}>
            <div className={`text-center font-extrabold text-lg mb-4 ${ok ? 'text-ok' : 'text-bad'}`}>{ok ? '✓ شهادة صحيحة' : '✗ هذه الشهادة ملغاة'}</div>
            <dl className="space-y-2 text-sm">
              <Row k="اسم الطالب" v={cert.studentName} />
              <Row k="الشهادة" v={cert.type} />
              {cert.grade && <Row k="التقدير" v={cert.grade} />}
              <Row k="تاريخ الإصدار" v={fmtDate(cert.issuedOn, { day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row k="الرقم التسلسلي" v={<span className="font-mono">{cert.serial}</span>} />
            </dl>
          </Card>
        )}
      </div>
    </div>
  )
}
const Row = ({ k, v }) => <div className="flex justify-between gap-3 border-b last:border-0 pb-2"><dt className="text-ink-muted">{k}</dt><dd className="font-bold text-left">{v}</dd></div>
