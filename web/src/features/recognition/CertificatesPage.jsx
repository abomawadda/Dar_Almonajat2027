import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page, TileIcon } from '@/components/layout/AppShell'
import { Async, Badge, Button, Chips, Field, Icon, Select, Sheet, Textarea } from '@/components/ui'
import { CERTIFICATE_TYPES } from '@/config/constants'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { issueCertificate, subscribeCertificates } from '@/services/comms'
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
              <Badge tone="gold">{fmtDate(c.issuedAt, { day: 'numeric', month: 'short' })}</Badge>
            </button>
          ))}
        </div>
      </Async>
      <Sheet open={!!view} title="الشهادة" onClose={() => setView(null)}>
        {view && <CertificatePreview c={view} />}
      </Sheet>
      {canIssue && <IssueSheet open={params.get('new') === '1'} onClose={() => setParams({})} onIssued={setView} />}
    </Page>
  )
}

function CertificatePreview({ c }) {
  const text = `شهادة ${c.type} — ${c.studentName} — دار المناجاة لتحفيظ القرآن الكريم`
  return (
    <>
      <div className="print-area bg-gradient-to-l from-[#FFF9EC] to-gold-50 rounded-2xl p-2.5">
        <div className="border-[1.5px] border-gold-400/50 rounded-xl p-6 text-center outline-dashed outline-1 outline-gold-400/30 -outline-offset-[7px]">
          <div className="text-[11px] text-ink-muted mb-2">دار المناجاة لتحفيظ القرآن الكريم</div>
          <Icon name="diploma-verified-bold" className="text-5xl text-gold-500 mx-auto block" />
          <div className="font-quran text-xl font-bold text-gold-600 mt-2">شهادة {c.type}</div>
          <div className="text-[11px] text-ink-muted mt-3">تُمنح للطالب</div>
          <div className="font-quran text-2xl font-bold">{c.studentName}</div>
          <div className="text-[11px] text-ink-muted mt-2">{fmtDate(c.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="flex justify-between mt-6 text-[10px] text-ink-muted"><span className="w-[38%] border-t pt-1">المحفظ</span><span className="w-[38%] border-t pt-1">مدير الدار</span></div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button className="flex-1" icon="printer-minimalistic-bold" onClick={() => window.print()}>طباعة</Button>
        <Button className="flex-1" variant="secondary" icon="share-bold" onClick={() => navigator.share?.({ text }).catch(() => {})}>مشاركة</Button>
      </div>
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
  const [save, busy] = useAction(() => issueCertificate({ student, type, notes }, actor), { success: 'تم إصدار الشهادة وإشعار ولي الأمر' })
  return (
    <Sheet open={open} title="إصدار شهادة" onClose={onClose}>
      <Field label="الطالب"><Select value={student?.id || ''} onChange={(e) => setSid(e.target.value)}>{(students || []).map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}</Select></Field>
      <Field label="نوع الشهادة"><Select value={type} onChange={(e) => setType(e.target.value)}>{CERTIFICATE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="ملاحظات"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button block icon="diploma-verified-bold" busy={busy} disabled={!student}
        onClick={async () => { if (await save()) { onClose(); onIssued({ type, studentName: student.personalInfo.fullName, issuedAt: new Date().toISOString() }) } }}>إصدار</Button>
    </Sheet>
  )
}
