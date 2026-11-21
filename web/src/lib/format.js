// Formatting helpers (Arabic, Egypt locale & Africa/Cairo timezone).
export const EGYPT_TZ = 'Africa/Cairo'
export const DEFAULT_CURRENCY = 'ج.م'

export const todayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
export const monthKey = (d = new Date()) => todayKey(d).slice(0, 7)
export const addDays = (n, d = new Date()) => new Date(d.getTime() + n * 864e5)

export const initials = (name) => String(name || '؟').trim().split(/\s+/)[0].slice(0, 2)

export function ageFrom(birth) {
  if (!birth) return null
  const b = new Date(birth)
  if (Number.isNaN(b.getTime())) return null
  const n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  const m = n.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--
  return a
}
export const ageLabel = (a) => (a == null ? '' : `${a} ${a >= 3 && a <= 10 ? 'سنوات' : 'سنة'}`)

export function relTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`
  if (s < 172800) return 'أمس'
  if (s < 604800) return `منذ ${Math.floor(s / 86400)} أيام`
  return d.toLocaleDateString('ar-EG', { timeZone: EGYPT_TZ, day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtDate(v, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!v) return '—'
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+02:00`) : new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('ar-EG', { timeZone: EGYPT_TZ, ...opts })
}
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('ar-EG', { timeZone: EGYPT_TZ, hour: '2-digit', minute: '2-digit' }) : '—')
export const fmtMoney = (n, currency = DEFAULT_CURRENCY) => `${Number(n || 0).toLocaleString('ar-EG')}${currency ? ' ' + currency : ''}`

export const daysUntil = (dateKey) => Math.round((new Date(dateKey) - new Date(todayKey())) / 864e5)

export function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: EGYPT_TZ, hour: 'numeric', hour12: false }).format(new Date())) % 24
  return h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور'
}

export function waPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '')
  if (/^01[0125]\d{8}$/.test(digits)) return '2' + digits
  return digits
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#047857,#059669)', 'linear-gradient(135deg,#1D4ED8,#2563EB)',
  'linear-gradient(135deg,#B45309,#D97706)', 'linear-gradient(135deg,#5B21B6,#7C3AED)',
  'linear-gradient(135deg,#6B5220,#B8923F)', 'linear-gradient(135deg,#BE185D,#DB2777)'
]
export function avatarGradient(seed) {
  let h = 0
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

export const genPassword = () => 'Dar' + Math.floor(100000 + Math.random() * 900000)

/** Arabic message for Firebase / adapter errors. */
export function errorMessage(e) {
  const code = e?.code || ''
  const map = {
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة',
    'auth/wrong-password': 'كلمة المرور غير صحيحة',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد',
    'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
    'auth/too-many-requests': 'محاولات كثيرة — حاول بعد قليل',
    'auth/network-request-failed': 'تعذّر الاتصال بالإنترنت',
    'auth/email-already-in-use': 'هذا البريد مسجّل بحساب آخر',
    'auth/weak-password': 'كلمة المرور ضعيفة (٦ أحرف على الأقل)',
    'permission-denied': 'ليست لديك صلاحية لهذه العملية',
    'functions/permission-denied': 'ليست لديك صلاحية لهذه العملية',
    'functions/failed-precondition': e?.message,
    'functions/already-exists': e?.message,
    'unavailable': 'الخادم غير متاح — ستُرسل البيانات عند عودة الاتصال',
    'not-found': 'السجل غير موجود'
  }
  return map[code] || e?.message || 'حدث خطأ غير متوقع'
}
