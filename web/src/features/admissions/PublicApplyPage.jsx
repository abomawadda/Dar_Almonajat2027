// Public multi-step application form (no account needed). Also used by staff to file a request.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { submitApplication, validateApplication } from '@/services/admissions'
import { ENROLL_TYPES } from '@/config/constants'
import { Button, Card, Field, Icon, Input, Segmented, Select, Textarea, cx } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, todayKey } from '@/lib/format'

const STEPS = ['الطالب', 'ولي الأمر', 'المستوى', 'المواعيد']
const STEP_FIELDS = [['fullName', 'birthDate', 'nationalId'], ['guardianName', 'phone', 'email'], [], []]
const PERIODS = ['الفجر', 'الصباح', 'الظهر', 'المساء']
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']

export default function PublicApplyPage() {
  const { actor } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [refNo, setRefNo] = useState(null)
  const [errors, setErrors] = useState({})
  const [f, setF] = useState({ type: 'quran', gender: 'ذكر', nationality: 'مصري', relation: 'الأب', level: 'مبتدئ', juzCount: 0, schoolStage: 'ابتدائي', periods: ['الصباح'], days: [] })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))

  const next = async () => {
    const all = validateApplication(f)
    const stepErr = Object.fromEntries(STEP_FIELDS[step].filter((k) => all[k]).map((k) => [k, all[k]]))
    setErrors(stepErr)
    if (Object.keys(stepErr).length) return
    if (step < STEPS.length - 1) { setStep(step + 1); window.scrollTo(0, 0); return }
    setBusy(true)
    try { setRefNo(await submitApplication(f, actor)) } catch (e) { toast(errorMessage(e), 'error') } finally { setBusy(false) }
  }

  if (refNo) {
    return (
      <Shell onBack={() => nav(actor ? '/applications' : '/login')}>
        <Card className="mx-4 p-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-ok-soft text-ok text-4xl flex items-center justify-center mb-4"><Icon name="check-circle-bold" /></div>
          <div className="text-xl font-extrabold mb-2">تم إرسال الطلب</div>
          <p className="text-sm text-ink-soft leading-7">ستراجع إدارة الدار الطلب وتتواصل مع ولي الأمر على رقم <b dir="ltr">{f.phone}</b>.</p>
          <div className="mt-5 p-4 rounded-2xl border-2 border-dashed border-gold-400/40 bg-gold-50">
            <div className="text-xs text-ink-muted">رقم الطلب</div>
            <div className="text-2xl font-extrabold tracking-widest text-gold-600 font-mono my-1" dir="ltr">{refNo.slice(-8).toUpperCase()}</div>
            <div className="text-[11px] text-ink-muted">احتفظ به للمتابعة مع الإدارة</div>
          </div>
          <Button variant="outline" block className="mt-5" onClick={() => nav(actor ? '/applications' : '/login')}>{actor ? 'العودة إلى الطلبات' : 'العودة للرئيسية'}</Button>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell onBack={() => (step ? setStep(step - 1) : nav(-1))}>
      <div className="flex gap-1.5 px-4 mb-5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cx('h-1.5 rounded-full', i < step ? 'bg-ok' : i === step ? 'bg-gold-grad' : 'bg-black/10')} />
            <div className={cx('text-[11px] font-bold mt-1.5 text-center', i === step ? 'text-gold-600' : 'text-ink-muted')}>{s}</div>
          </div>
        ))}
      </div>
      <Card className="mx-4 p-4">
        {step === 0 && <>
          <Field label="اسم الطالب الرباعي" required error={errors.fullName}><Input value={f.fullName || ''} onChange={set('fullName')} placeholder="الاسم الكامل" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ الميلاد" required error={errors.birthDate}><Input type="date" max={todayKey()} value={f.birthDate || ''} onChange={set('birthDate')} /></Field>
            <Field label="الجنس"><Select value={f.gender} onChange={set('gender')}><option>ذكر</option><option>أنثى</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الجنسية"><Input value={f.nationality || ''} onChange={set('nationality')} /></Field>
            <Field label="الرقم القومي (١٤ رقمًا)" error={errors.nationalId}><Input inputMode="numeric" dir="ltr" maxLength={14} value={f.nationalId || ''} onChange={set('nationalId')} /></Field>
          </div>
          <Field label="نوع الالتحاق"><Segmented value={f.type} onChange={set('type')} options={Object.entries(ENROLL_TYPES)} /></Field>
        </>}
        {step === 1 && <>
          <Field label="اسم ولي الأمر" required error={errors.guardianName}><Input value={f.guardianName || ''} onChange={set('guardianName')} /></Field>
          <Field label="صلة القرابة"><Select value={f.relation} onChange={set('relation')}><option>الأب</option><option>الأم</option><option>ولي أمر</option></Select></Field>
          <Field label="رقم الجوال" required error={errors.phone}><Input type="tel" dir="ltr" value={f.phone || ''} onChange={set('phone')} placeholder="010XXXXXXXX" /></Field>
          <Field label="البريد الإلكتروني (لإنشاء حساب متابعة)" error={errors.email}><Input type="email" dir="ltr" value={f.email || ''} onChange={set('email')} placeholder="name@example.com" /></Field>
        </>}
        {step === 2 && <>
          <Field label="المستوى الحالي"><Segmented value={f.level} onChange={set('level')} options={[['مبتدئ', 'مبتدئ'], ['متوسط', 'متوسط'], ['متقدم', 'متقدم']]} /></Field>
          <Field label="عدد الأجزاء المحفوظة"><Input type="number" min="0" max="30" value={f.juzCount} onChange={set('juzCount')} /></Field>
          <Field label="آخر ما حفظه"><Input value={f.lastMemorized || ''} onChange={set('lastMemorized')} placeholder="مثال: سورة البقرة كاملة" /></Field>
          <Field label="المرحلة الدراسية"><Select value={f.schoolStage} onChange={set('schoolStage')}><option>ما قبل المدرسة</option><option>ابتدائي</option><option>إعدادي</option><option>ثانوي</option><option>جامعي</option></Select></Field>
        </>}
        {step === 3 && <>
          <Field label="الفترة المفضلة"><Pills items={PERIODS} value={f.periods} onToggle={(v) => toggle('periods', v)} /></Field>
          <Field label="أيام الحضور"><Pills items={DAYS} value={f.days} onToggle={(v) => toggle('days', v)} /></Field>
          <Field label="ملاحظات"><Textarea value={f.notes || ''} onChange={set('notes')} placeholder="أي ملاحظات أو ظروف صحية…" /></Field>
        </>}
      </Card>
      <div className="px-4 mt-4">
        <Button block busy={busy} onClick={next} icon={step === STEPS.length - 1 ? 'plain-bold' : undefined}>{step === STEPS.length - 1 ? 'إرسال الطلب' : 'التالي'}</Button>
        {!actor && <p className="text-center text-sm text-ink-muted mt-4">لديك حساب؟ <Link to="/login" className="font-bold text-gold-500">تسجيل الدخول</Link></p>}
      </div>
    </Shell>
  )
}

function Pills({ items, value, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => (
        <button key={v} type="button" onClick={() => onToggle(v)}
          className={cx('h-9 px-4 rounded-full text-[13px] font-bold border transition', value.includes(v) ? 'bg-gold-500 text-white border-gold-500' : 'bg-card text-ink-soft')}>{v}</button>
      ))}
    </div>
  )
}

function Shell({ onBack, children }) {
  return (
    <div className="min-h-dvh bg-paper pb-10 md:max-w-lg md:mx-auto">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b pt-[env(safe-area-inset-top)] mb-4">
        <div className="h-14 px-3 flex items-center gap-2">
          <button onClick={onBack} aria-label="رجوع" className="w-10 h-10 rounded-xl bg-card border flex items-center justify-center"><Icon name="arrow-right-linear" /></button>
          <h1 className="flex-1 text-center text-[17px] font-extrabold">طلب الالتحاق</h1>
          <span className="w-10" />
        </div>
      </header>
      {children}
    </div>
  )
}
