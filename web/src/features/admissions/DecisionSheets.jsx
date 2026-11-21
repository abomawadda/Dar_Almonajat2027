import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { Badge, Button, EmptyState, Field, Input, PickRow, Progress, Select, Sheet, Skeleton, Textarea, ToggleRow } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import { approve, defer, prepareApproval, reject, scheduleInterview } from '@/services/admissions'
import { DEFER_REASONS, REJECT_REASONS } from '@/config/constants'
import { fmtMoney, todayKey } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'

export function ApproveSheet({ open, app, onClose }) {
  const { actor } = useAuth()
  const toast = useToast()
  const [ctx, setCtx] = useState(null)
  const [groupId, setGroupId] = useState(null)
  const [linkExisting, setLinkExisting] = useState(true)
  const [createAccount, setCreateAccount] = useState(true)
  const [createFee, setCreateFee] = useState(true)
  const [notify, setNotify] = useState(true)
  const [creds, setCreds] = useState(null)
  const [run, busy] = useAction((opts) => approve(app, opts, actor, ctx))
  const g = app.guardianInfo || {}

  useEffect(() => {
    if (!open) return
    setCtx(null); setCreds(null)
    prepareApproval(app).then((c) => {
      setCtx(c); setGroupId(c.suggestedGroupId); setLinkExisting(!!c.existingParent)
      setCreateAccount(!!g.email && !c.existingParent); setCreateFee(Number(c.settings?.monthlyFee) > 0)
    }).catch((e) => { toast(e.message, 'error'); onClose() })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!groupId) return toast('اختر الحلقة والمحفظ', 'error')
    const r = await run({ groupId, linkExistingParentId: linkExisting ? ctx.existingParent?.id : null, createAccount: createAccount && !!g.email, createFee, notify })
    if (!r) return
    toast(`تم قبول ${app.personalInfo.fullName} وربطه بالمحفظ وولي الأمر`, 'success')
    if (r.credentials) setCreds(r.credentials)
    else onClose()
  }

  if (creds) {
    const text = `السلام عليكم ${creds.name}\nتم قبول ابنكم في دار المناجاة.\nبيانات الدخول للتطبيق:\nالبريد: ${creds.email}\nكلمة المرور: ${creds.password}`
    return (
      <Sheet open={open} title="بيانات دخول ولي الأمر" onClose={onClose}>
        <div className="bg-field rounded-2xl px-4">
          {[['البريد', creds.email], ['كلمة المرور', creds.password]].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center py-3 border-b last:border-0"><span className="text-xs text-ink-muted">{k}</span><b dir="ltr" className="font-mono select-all">{v}</b></div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-muted my-3 leading-6">لن تظهر كلمة المرور مرة أخرى. أرسلها الآن، ويمكن لولي الأمر تغييرها من "نسيت كلمة المرور".</p>
        <Button block icon="share-bold" onClick={() => (navigator.share ? navigator.share({ text }).catch(() => {}) : navigator.clipboard?.writeText(text).then(() => toast('نُسخت البيانات', 'success')))}>إرسال لولي الأمر</Button>
      </Sheet>
    )
  }

  const fee = Number(ctx?.settings?.monthlyFee) || 0
  return (
    <Sheet open={open} title={`قبول ${app.personalInfo?.fullName || ''}`} onClose={onClose}>
      {!ctx ? <Skeleton /> : (
        <>
          <Label>١. توزيع الطالب على محفظ وحلقة</Label>
          {ctx.groups.length ? ctx.groups.map((x) => {
            const full = (x.studentCount || 0) >= (x.capacity || 0)
            return (
              <PickRow key={x.id} checked={groupId === x.id} disabled={full} onSelect={() => setGroupId(x.id)}
                title={<>{x.teacherName} {x.id === ctx.suggestedGroupId && <Badge tone="ok">مقترح</Badge>}</>}
                subtitle={`${x.name} • ${x.studentCount || 0}/${x.capacity} طالب${full ? ' — مكتملة' : ''}`}>
                <div className="mt-2"><Progress value={((x.studentCount || 0) / (x.capacity || 1)) * 100} tone={full ? 'bad' : 'gold'} /></div>
              </PickRow>
            )
          }) : <EmptyState icon="widget-5-bold">لا توجد حلقات — شغّل سكربت التهيئة أولًا</EmptyState>}

          <Label>٢. ربط ولي الأمر</Label>
          {ctx.existingParent && <PickRow checked={linkExisting} onSelect={() => setLinkExisting(true)} title={`ربط بحساب ${ctx.existingParent.name}`} subtitle={`مسجّل بنفس رقم الجوال • ${(ctx.existingParent.childrenIds || []).length} أبناء بالدار`} />}
          <PickRow checked={!linkExisting || !ctx.existingParent} onSelect={() => setLinkExisting(false)} title="إنشاء سجل ولي أمر جديد" subtitle={<>{g.name} • <span dir="ltr">{g.phone}</span></>} />
          <ToggleRow title="إنشاء حساب دخول لولي الأمر" subtitle={g.email ? <span dir="ltr">{g.email}</span> : 'يتطلب بريدًا إلكترونيًا في الطلب'}
            checked={createAccount && !!g.email && !(linkExisting && ctx.existingParent)} onChange={setCreateAccount} disabled={!g.email || (linkExisting && !!ctx.existingParent)} />

          <Label>٣. التفعيل</Label>
          <ToggleRow title="إنشاء رسوم الشهر الحالي" subtitle={fee ? fmtMoney(fee, ctx.settings.currency) : 'لم تُحدد رسوم في الإعدادات'} checked={createFee && fee > 0} onChange={setCreateFee} disabled={!fee} />
          <ToggleRow title="إشعار ولي الأمر والمحفظ" checked={notify} onChange={setNotify} />
          <Button block className="mt-3" icon="check-circle-bold" busy={busy} onClick={submit}>اعتماد القبول</Button>
        </>
      )}
    </Sheet>
  )
}

export function DeferSheet({ open, app, onClose }) {
  const { actor } = useAuth()
  const [f, setF] = useState({ reason: DEFER_REASONS[0], reviewAt: '', note: '' })
  const [run, busy] = useAction(() => defer(app.id, f, actor), { success: 'تم تأجيل الطلب' })
  return (
    <Sheet open={open} title="تأجيل الطلب" onClose={onClose}>
      <Field label="سبب التأجيل"><Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{DEFER_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
      <Field label="موعد إعادة النظر"><Input type="date" min={todayKey()} value={f.reviewAt} onChange={(e) => setF({ ...f, reviewAt: e.target.value })} /></Field>
      <Field label="ملاحظات"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <Button block variant="info" icon="clock-circle-bold" busy={busy} onClick={async () => (await run()) && onClose()}>تأجيل الطلب</Button>
    </Sheet>
  )
}

export function RejectSheet({ open, app, onClose }) {
  const { actor } = useAuth()
  const [f, setF] = useState({ reason: '', note: '' })
  const [run, busy] = useAction(() => reject(app.id, f, actor), { success: 'تم رفض الطلب' })
  return (
    <Sheet open={open} title="رفض الطلب" onClose={onClose}>
      <Field label="سبب الرفض" required><Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option value="">— اختر السبب —</option>{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
      <Field label="توضيح"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <Button block variant="danger" icon="close-circle-bold" busy={busy} disabled={!f.reason} onClick={async () => (await run()) && onClose()}>تأكيد الرفض</Button>
    </Sheet>
  )
}

export function InterviewSheet({ open, app, onClose }) {
  const { actor } = useAuth()
  const [at, setAt] = useState((app.interviewData?.scheduledAt || '').slice(0, 16))
  const [note, setNote] = useState(app.interviewData?.note || '')
  const [run, busy] = useAction(() => scheduleInterview(app.id, at, note, actor), { success: 'تم تحديد موعد المقابلة' })
  return (
    <Sheet open={open} title="موعد المقابلة" onClose={onClose}>
      <Field label="التاريخ والوقت" required><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
      <Field label="ملاحظات"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="المكان أو ما يُحضر للمقابلة" /></Field>
      <Button block icon="calendar-mark-bold" busy={busy} disabled={!at} onClick={async () => (await run()) && onClose()}>حفظ الموعد</Button>
    </Sheet>
  )
}

const Label = ({ children }) => <div className="text-xs font-extrabold text-gold-600 mt-4 mb-2 first:mt-0">{children}</div>
