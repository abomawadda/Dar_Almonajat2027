// Shared bootstrap for admin scripts. Authenticates with a service account key:
//   Firebase Console → Project settings → Service accounts → Generate new private key
//   then:  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json   (keep it out of git)
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'node:fs'

function projectId() {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID
  try { return JSON.parse(readFileSync(new URL('../../.firebaserc', import.meta.url))).projects.default } catch { return undefined }
}

export function admin() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('✗ ضع مسار مفتاح حساب الخدمة في GOOGLE_APPLICATION_CREDENTIALS (راجع README)')
    process.exit(1)
  }
  initializeApp({ credential: applicationDefault(), projectId: projectId() })
  return { db: getFirestore(), auth: getAuth(), FieldValue, projectId: projectId() }
}

export function args() {
  const out = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true
  return out
}
