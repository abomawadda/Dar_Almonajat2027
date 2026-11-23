// Phone/desktop push via Firebase Cloud Messaging. Active only in live mode with VITE_FCM_VAPID_KEY set
// (Firebase console → Project settings → Cloud Messaging → Web Push certificates).
// The device token is saved in pushTokens/{token} with the inbox keys it should receive
// (uid, linked id, and 'staff' for admins/supervisors); the pushNotification Cloud Function sends to them.
import { DATA_MODE, db, firebaseApp, firebaseConfig } from './backend'
import { op } from './db/ops'
import { recipientIds } from '@/services/scope'

const VAPID = import.meta.env.VITE_FCM_VAPID_KEY

export function pushAvailability() {
  if (DATA_MODE === 'demo') return { ok: false, reason: 'الإشعارات على الجوال تعمل في الوضع المتصل فقط' }
  if (!VAPID) return { ok: false, reason: 'لم يُضبط مفتاح الإشعارات (VITE_FCM_VAPID_KEY) بعد' }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return { ok: false, reason: 'المتصفح لا يدعم الإشعارات — على iPhone أضف التطبيق للشاشة الرئيسية أولًا' }
  return { ok: true }
}
export const pushPermission = () => ('Notification' in window ? Notification.permission : 'unsupported')

export async function enablePush(actor) {
  const a = pushAvailability()
  if (!a.ok) throw new Error(a.reason)
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('لم يُسمح بالإشعارات — فعّلها من إعدادات المتصفح')
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) throw new Error('المتصفح لا يدعم الإشعارات')
  const cfg = encodeURIComponent(JSON.stringify(firebaseConfig))
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?config=${cfg}`, { scope: '/firebase-cloud-messaging-push-scope' })
  const token = await getToken(getMessaging(firebaseApp()), { vapidKey: VAPID, serviceWorkerRegistration: reg })
  if (!token) throw new Error('تعذّر تفعيل الإشعارات')
  await db().set('pushTokens', token, { uid: actor.uid, role: actor.role, keys: recipientIds(actor), ua: navigator.userAgent.slice(0, 120), updatedAt: op.now() })
  try { localStorage.setItem('dar.push.token', token) } catch { /* ignore */ }
  return token
}

export async function disablePush() {
  let token = null
  try { token = localStorage.getItem('dar.push.token') } catch { /* ignore */ }
  if (!token) return
  const { getMessaging, deleteToken } = await import('firebase/messaging')
  await deleteToken(getMessaging(firebaseApp())).catch(() => {})
  await db().remove('pushTokens', token).catch(() => {})
  try { localStorage.removeItem('dar.push.token') } catch { /* ignore */ }
}
export const pushEnabledHere = () => { try { return !!localStorage.getItem('dar.push.token') } catch { return false } }
