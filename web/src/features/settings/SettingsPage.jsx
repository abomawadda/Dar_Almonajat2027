import { useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Button, Card, Icon, ListItem, Section, ToggleRow } from '@/components/ui'
import { disablePush, enablePush, pushAvailability, pushEnabledHere } from '@/lib/push'
import { useToast } from '@/components/ui/Toast'
import { db, firebaseConfig } from '@/lib/backend'
import { seedDemo } from '@/data/seed'
import { errorMessage } from '@/lib/format'

export default function SettingsPage() {
  const { actor, signOut, mode, resetPassword } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [push, setPush] = useState(pushEnabledHere())
  const pushState = pushAvailability()
  const togglePush = async (on) => {
    try {
      if (on) { await enablePush(actor); toast('فُعّلت الإشعارات على هذا الجهاز', 'success') } else { await disablePush(); toast('أُوقفت الإشعارات على هذا الجهاز', 'success') }
      setPush(on)
    } catch (e) { toast(errorMessage(e), 'error') }
  }

  const resetDemo = async () => {
    if (!confirm('سيتم حذف كل البيانات التجريبية وإعادة البيانات الافتراضية. متابعة؟')) return
    setBusy(true); db().reset(); await seedDemo(db(), { history: true }); setBusy(false)
    toast('أُعيدت البيانات التجريبية', 'success')
  }
  const changePassword = async () => {
    try { await resetPassword(actor.email); toast('أُرسل رابط تغيير كلمة المرور إلى بريدك', 'success') } catch (e) { toast(errorMessage(e), 'error') }
  }

  return (
    <Page title="الإعدادات">
      <Section>
        <Card className="p-4 flex items-center gap-3.5">
          <Avatar name={actor.name} size={56} />
          <div><div className="text-base font-extrabold">{actor.name}</div><div className="text-xs text-gold-500 font-bold mt-0.5">{actor.roleLabel}</div>{actor.email && <div className="text-xs text-ink-muted mt-0.5" dir="ltr">{actor.email}</div>}</div>
        </Card>
      </Section>
      <Section title="الحساب">
        <Card className="px-4">
          {mode === 'live' && actor.email && <ListItem onClick={changePassword} leading={<Icon name="key-minimalistic-bold" className="text-xl text-gold-500" />} title="تغيير كلمة المرور" subtitle="يُرسل رابط إلى بريدك" />}
          <ListItem onClick={signOut} leading={<Icon name="logout-2-bold" className="text-xl text-bad" />} title={<span className="text-bad">تسجيل الخروج</span>} />
        </Card>
      </Section>
      <Section title="الإشعارات">
        <Card className="px-4">
          <ToggleRow title="إشعارات الجوال على هذا الجهاز" subtitle={pushState.ok ? 'التسميع والحضور والرسائل والنتائج وملخص اليوم' : pushState.reason}
            checked={push} disabled={!pushState.ok} onChange={togglePush} />
        </Card>
      </Section>
      <Section title="قاعدة البيانات">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Icon name={mode === 'demo' ? 'test-tube-bold' : 'cloud-check-bold'} className={mode === 'demo' ? 'text-warn' : 'text-ok'} />
            {mode === 'demo' ? 'الوضع التجريبي — البيانات على هذا الجهاز فقط' : <span>متصل بمشروع <b dir="ltr">{firebaseConfig.projectId}</b></span>}
          </div>
          {mode === 'demo' && <Button variant="secondary" block className="mt-3" icon="restart-bold" busy={busy} onClick={resetDemo}>إعادة ضبط البيانات التجريبية</Button>}
        </Card>
      </Section>
      <p className="text-center text-[11px] text-ink-muted mt-6">دار المناجاة لتحفيظ القرآن الكريم • الإصدار 5.0</p>
    </Page>
  )
}
