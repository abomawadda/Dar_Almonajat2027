// Cloud Functions (Node 20, 2nd gen). Requires the Blaze (pay-as-you-go) plan.
// The web app works without these: set VITE_USE_FUNCTIONS=true to route approvals here.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2'
import { approveApplication as approve, ApprovalError } from './lib/approval.js'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

const deps = () => ({ db: getFirestore(), auth: getAuth(), FieldValue })

// Called from the web app as httpsCallable('approveApplication').
export const approveApplication = onCall(async (req) => {
  try {
    return await approve(deps(), req.data, req.auth?.uid)
  } catch (e) {
    if (e instanceof ApprovalError) throw new HttpsError(e.code, e.message)
    console.error(e)
    throw new HttpsError('internal', 'تعذّر اعتماد القبول')
  }
})


// ── Push notifications (FCM) ────────────────────────────────────────────────
// Every notification document is also pushed to the recipient's registered devices.
// Devices register in pushTokens/{token} with the inbox keys they listen to (uid, linked id, 'staff').
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getMessaging } from 'firebase-admin/messaging'
import { dailyNotifications } from './lib/daily.js'

export const pushNotification = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data()
  if (!n?.userId) return
  const db = getFirestore()
  const snap = await db.collection('pushTokens').where('keys', 'array-contains', n.userId).limit(50).get()
  if (snap.empty) return
  const tokens = snap.docs.map((d) => d.id)
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: n.title || 'دار المناجاة', body: String(n.body || '').slice(0, 200) },
    webpush: { fcmOptions: { link: n.link || '/notifications' } }
  })
  // drop tokens the push service no longer accepts
  const dead = res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || '') ? tokens[i] : null)).filter(Boolean)
  await Promise.all(dead.map((t) => db.collection('pushTokens').doc(t).delete()))
})

// ── Daily summary for parents — every day at 20:30 Cairo time ──────────────
export const dailyParentSummary = onSchedule({ schedule: '30 20 * * *', timeZone: 'Africa/Cairo' }, async () => {
  const db = getFirestore()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
  const get = (c) => db.collection(c).where('date', '==', date).get().then((s) => s.docs.map((d) => d.data()))
  const [attendance, hifz, points] = await Promise.all([get('attendance'), get('hifzRecords'), get('pointsLedger')])
  const list = dailyNotifications(date, { attendance, hifz, points })
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch()
    for (const n of list.slice(i, i + 400)) {
      batch.set(db.collection('notifications').doc(), {
        userId: n.parentId, type: 'daily_summary', title: n.title, body: n.body, link: '/dashboard',
        isRead: false, createdAt: FieldValue.serverTimestamp()
      })
    }
    await batch.commit()
  }
  console.log(`daily summary: ${list.length} notifications for ${date}`)
})
