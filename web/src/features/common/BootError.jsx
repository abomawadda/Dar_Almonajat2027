import { Icon } from '@/components/ui/Icon'

/** Shown when Firebase cannot initialise (no internet, missing config). Blocks data entry on purpose. */
export default function BootError({ error }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-paper">
      <div className="max-w-sm w-full bg-card border rounded-3xl p-6 text-center shadow-card">
        <div className="w-16 h-16 mx-auto rounded-full bg-bad-soft text-bad flex items-center justify-center text-3xl mb-4"><Icon name="cloud-cross-bold" /></div>
        <div className="text-lg font-extrabold mb-2">تعذّر الاتصال بقاعدة البيانات</div>
        <div className="text-sm text-ink-soft leading-7 mb-5">{navigator.onLine ? (error?.message || 'خطأ غير معروف') : 'لا يوجد اتصال بالإنترنت'}. لن تُحفظ أي بيانات حتى يعود الاتصال.</div>
        <button onClick={() => location.reload()} className="w-full h-12 rounded-2xl bg-gold-grad text-white font-bold">إعادة المحاولة</button>
      </div>
    </div>
  )
}
