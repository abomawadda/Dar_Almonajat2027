import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page, TileIcon } from '@/components/layout/AppShell'
import { Async, Badge, Button, Chips, Field, Icon, Select, Sheet, Textarea } from '@/components/ui'
import { CERTIFICATE_TYPES } from '@/config/constants'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import QRCode from 'qrcode'
import { Input } from '@/components/ui'
import { issueCertificate, revokeCertificate, subscribeCertificates, verifyUrl } from '@/services/certificates'
import { fmtDate } from '@/lib/format'

export default function CertificatesPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [rows, setRows] = useState(null)
  const [childId, setChildId] = useState('all')
  const [view, setView] = useState(null)
  const [params, setParams] = useSearchParams()
  const canIssue = can(actor.role, 'certificates.issue')
  useEffect(() => subscribeCertificates(actor, setRows), [actor])

  const list = (rows || []).filter((c) => actor.role !== 'parent' || childId === 'all' || c.studentId === childId)

  return (
    <Page title="الشهادات" actions={canIssue && <Button size="sm" icon="add-square-bold" onClick={() => setParams({ new: '1' })}>إصدار</Button>}>
      {actor.role === 'parent' && (students || []).length > 1 && (
        <Chips value={childId} onChange={setChildId} options={[['all', 'كل الأبناء'], ...students.map((s) => [s.id, s.personalInfo.fullName.split(' ')[0]])]} />
      )}
      <Async data={rows && list} empty="لا توجد شهادات بعد" emptyIcon="diploma-verified-bold">
        <div className="px-4 space-y-3">
          {list.map((c) => (
            <button key={c.id} onClick={() => setView(c)} className="w-full text-right flex items-center gap-3 p-4 rounded-[18px] border border-gold-400/30 bg-gradient-to-l from-[#FFF9EC] to-gold-50">
              <TileIcon icon="diploma-verified-bold" tone="gold" size={46} />
              <div className="flex-1 min-w-0"><div className="text-sm font-extrabold text-gold-600">شهادة {c.type}</div><div className="text-xs text-ink-muted mt-0.5">{c.studentName} • {c.groupName}</div></div>
              <Badge tone={c.status === 'revoked' ? 'bad' : 'gold'}>{c.status === 'revoked' ? 'ملغاة' : fmtDate(c.issuedAt, { day: 'numeric', month: 'short' })}</Badge>
            </button>
          ))}
        </div>
      </Async>
      <Sheet open={!!view} title="الشهادة" onClose={() => setView(null)}>
        {view && <CertificatePreview c={view} canRevoke={actor.role === 'admin'} onDone={() => setView(null)} />}
      </Sheet>
      {canIssue && <IssueSheet open={params.get('new') === '1'} onClose={() => setParams({})} onIssued={setView} />}
    </Page>
  )
}

function CertificatePreview({ c, canRevoke, onDone }) {
  const { actor } = useAuth()
  const [qr, setQr] = useState('')
  const [reason, setReason] = useState('')
  const url = c.verifyCode ? verifyUrl(c.verifyCode) : ''
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 240 }).then(setQr).catch(() => setQr('')) }, [url])
  const [revoke, revoking] = useAction(() => revokeCertificate(c, reason, actor), { success: 'أُلغيت الشهادة' })
  const text = `شهادة ${c.type} — ${c.studentName} — دار المناجاة لتحفيظ القرآن الكريم${url ? `\nللتحقق: ${url}` : ''}`
  return (
    <>
      <div className="print-area bg-gradient-to-l from-[#FFF9EC] to-gold-50 rounded-2xl p-2.5 relative">
        {c.status === 'revoked' && <div className="absolute inset-0 flex items-center justify-center z-10"><span className="text-4xl font-extrabold text-bad/70 -rotate-12 border-4 border-bad/60 rounded-2xl px-4">ملغاة</span></div>}
        <div className="border-[1.5px] border-gold-400/50 rounded-xl p-6 text-center outline-dashed outline-1 outline-gold-400/30 -outline-offset-[7px]">
          <div className="text-[11px] text-ink-muted mb-2">دار المناجاة لتحفيظ القرآن الكريم</div>
          <Icon name="diploma-verified-bold" className="text-5xl text-gold-500 mx-auto block" />
          <div className="font-quran text-xl font-bold text-gold-600 mt-2">شهادة {c.type}</div>
          <div className="text-[11px] text-ink-muted mt-3">تُمنح للطالب</div>
          <div className="font-quran text-2xl font-bold">{c.studentName}</div>
          {c.grade && <div className="text-sm font-bold text-gold-600 mt-1">بتقدير {c.grade}</div>}
          <div className="text-[11px] text-ink-muted mt-2">{fmtDate(c.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="flex justify-between items-end mt-6 text-[10px] text-ink-muted gap-2">
            <span className="w-[32%] border-t pt-1">المحفظ</span>
            {qr ? <div className="text-center"><img src={qr} alt="رمز التحقق" className="w-16 h-16 mx-auto bg-white p-0.5 rounded" /><div className="mt-0.5 font-mono">{c.serial}</div></div> : <span />}
            <span className="w-[32%] border-t pt-1">مدير الدار</span>
          </div>
        </div>
      </div>
      {c.verifyCode && <div className="text-center text-[11px] text-ink-muted mt-2">رمز التحقق: <b className="font-mono">{c.verifyCode}</b></div>}
      <div className="flex gap-2 mt-4">
        <Button className="flex-1" icon="printer-minimalistic-bold" onClick={() => window.print()}>طباعة / PDF</Button>
        <Button className="flex-1" variant="secondary" icon="share-bold" onClick={() => navigator.share?.({ text }).catch(() => {})}>مشاركة</Button>
      </div>
      {canRevoke && c.id && c.status !== 'revoked' && (
        <div className="mt-4 pt-3 border-t">
          <Field label="إلغاء الشهادة (سبب الإلغاء)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: صدرت بالخطأ" /></Field>
          <Button block variant="danger" busy={revoking} disabled={!reason.trim()} onClick={async () => { if (confirm('إلغاء الشهادة؟ ستظهر «ملغاة» عند التحقق.') && (await revoke())) onDone() }}>إلغاء الشهادة</Button>
        </div>
      )}
    </>
  )
}

function IssueSheet({ open, onClose, onIssued }) {
  const { actor } = useAuth()
  const { students } = useData()
  const [sid, setSid] = useState('')
  const [type, setType] = useState(CERTIFICATE_TYPES[0])
  const [notes, setNotes] = useState('')
  const student = (students || []).find((s) => s.id === (sid || students?.[0]?.id))
  const [save, busy] = useAction(() => issueCertificate({ student, type, notes }, actor), { success: (c) => `صدرت الشهادة ${c.serial}` })
  return (
    <Sheet open={open} title="إصدار شهادة" onClose={onClose}>
      <Field label="الطالب"><Select value={student?.id || ''} onChange={(e) => setSid(e.target.value)}>{(students || []).map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}</Select></Field>
      <Field label="نوع الشهادة"><Select value={type} onChange={(e) => setType(e.target.value)}>{CERTIFICATE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="ملاحظات"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button block icon="diploma-verified-bold" busy={busy} disabled={!student}
        onClick={async () => { const c = await save(); if (c) { onClose(); onIssued({ ...c, issuedAt: new Date().toISOString() }) } }}>إصدار</Button>
    </Sheet>
  )
}
