import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { firebaseConfig } from '@/lib/backend'
import { ROLES } from '@/config/roles'
import { Button, Field, Icon, Input, cx } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/format'

const DEMO_ROLES = [['admin', 'shield-user-bold'], ['supervisor', 'shield-check-bold'], ['teacher', 'user-speak-bold'], ['parent', 'users-group-rounded-bold'], ['student', 'book-2-bold']]

export default function LoginPage() {
  const { actor, mode, signIn, signInDemo, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState('admin')
  const toast = useToast()
  const nav = useNavigate()
  const from = useLocation().state?.from || '/dashboard'
  if (actor) return <Navigate to={from} replace />

  const submit = async (e) => {
    e.preventDefault()
    if (mode === 'demo') { signInDemo(role); nav(from, { replace: true }); return }
    if (!email || !password) return toast('أدخل البريد الإلكتروني وكلمة المرور', 'error')
    setBusy(true)
    try { await signIn(email, password) } catch (err) { toast(errorMessage(err), 'error') } finally { setBusy(false) }
  }
  const forgot = async () => {
    if (mode === 'demo') return toast('استعادة كلمة المرور متاحة في الوضع المتصل', 'info')
    if (!email) return toast('اكتب بريدك الإلكتروني أولًا', 'error')
    try { await resetPassword(email); toast('أُرسل رابط تعيين كلمة المرور إلى بريدك', 'success') } catch (err) { toast(errorMessage(err), 'error') }
  }

  return (
    <div className="min-h-dvh bg-paper flex flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+40px)] pb-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="w-24 h-24 mx-auto rounded-full bg-gold-50 border-[3px] border-gold-400 flex items-center justify-center text-gold-500 text-4xl shadow-lift mb-4"><Icon name="book-minimalistic-bold" /></div>
          <h1 className="font-quran text-3xl font-bold text-gold-600">دار المناجاة</h1>
          <p className="text-sm text-ink-muted mt-1">لتحفيظ القرآن الكريم</p>
        </div>

        <div className={cx('flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold mb-5 border', mode === 'demo' ? 'bg-warn-soft text-[#92400E] border-warn/20' : 'bg-ok-soft text-ok border-ok/20')}>
          <Icon name={mode === 'demo' ? 'test-tube-bold' : 'cloud-check-bold'} className="text-base" />
          {mode === 'demo' ? 'وضع تجريبي: البيانات على هذا الجهاز فقط' : <span>متصل بقاعدة البيانات <b dir="ltr">{firebaseConfig.projectId}</b></span>}
        </div>

        <form onSubmit={submit}>
          {mode === 'demo' ? (
            <>
              <div className="text-[13px] text-ink-soft mb-2.5">اختر الحساب التجريبي:</div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {DEMO_ROLES.map(([r, icon]) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={cx('h-14 rounded-2xl border flex flex-col items-center justify-center gap-0.5 text-[13px] font-bold transition', role === r ? 'bg-gold-50 border-gold-400 text-gold-600' : 'bg-card text-ink-soft')}>
                    <Icon name={icon} className="text-lg" />{ROLES[r].label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
              <Field label="كلمة المرور">
                <div className="relative">
                  <Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-11" />
                  <button type="button" onClick={() => setShow(!show)} aria-label="إظهار كلمة المرور" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-lg"><Icon name={show ? 'eye-closed-bold' : 'eye-bold'} /></button>
                </div>
              </Field>
              <button type="button" onClick={forgot} className="text-[13px] font-bold text-gold-500 mb-4">نسيت كلمة المرور؟</button>
            </>
          )}
          <Button type="submit" block icon="login-3-bold" busy={busy}>تسجيل الدخول</Button>
        </form>

        <p className="text-center text-sm text-ink-muted mt-6">ليس لديك حساب؟ <Link to="/apply" className="font-bold text-gold-500">تقديم طلب التحاق</Link></p>
      </div>
    </div>
  )
}
