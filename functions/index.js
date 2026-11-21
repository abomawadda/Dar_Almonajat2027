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

