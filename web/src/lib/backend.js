// Chooses and initialises the data backend once at startup.
//   live → Firebase (Auth + Firestore with offline cache [+ Functions])
//   demo → in-memory store persisted to localStorage (VITE_DATA_MODE=demo)
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, createUserWithEmailAndPassword
} from 'firebase/auth'
import {
  initializeFirestore, getFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager
} from 'firebase/firestore'
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions'
import { createFirestoreAdapter } from './db/firestore.js'
import { createMemoryAdapter } from './db/memory.js'

const env = import.meta.env
export const DATA_MODE = env.VITE_DATA_MODE === 'demo' ? 'demo' : 'live'
export const USE_FUNCTIONS = env.VITE_USE_FUNCTIONS === 'true'

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
}

let _db = null
let fb = null // { app, auth, functions }

/** Data adapter used by every service. Tests inject their own with setDb(). */
export const db = () => {
  if (!_db) throw new Error('Backend not initialised')
  return _db
}
export const setDb = (adapter) => { _db = adapter }

export async function initBackend() {
  if (DATA_MODE === 'demo') {
    _db = createMemoryAdapter({ storageKey: 'dar.react.demo.eg.v2' })
    if (_db.isEmpty()) {
      const { seedDemo } = await import('../data/seed.js')
      await seedDemo(_db)
    }
    return { mode: 'demo' }
  }
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error('إعدادات Firebase غير موجودة — راجع ملف web/.env')
  }
  const app = initializeApp(firebaseConfig)
  let fs
  try {
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  } catch {
    fs = getFirestore(app)
  }
  const auth = getAuth(app)
  const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'europe-west1')
  if (env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(fs, '127.0.0.1', 8080)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  }
  fb = { app, auth, functions }
  _db = createFirestoreAdapter(fs)
  return { mode: 'live', projectId: firebaseConfig.projectId }
}

// ── Auth (live only; demo auth lives in AuthProvider) ────────────────────────
export const authApi = {
  onChange: (cb) => onAuthStateChanged(fb.auth, cb),
  signIn: (email, password) => signInWithEmailAndPassword(fb.auth, email.trim(), password),
  signOut: () => signOut(fb.auth),
  resetPassword: (email) => sendPasswordResetEmail(fb.auth, email.trim())
}

/**
 * Create a login for another person (e.g. a parent) without signing the admin out,
 * using a temporary secondary app. Used only when Cloud Functions are disabled.
 */
export async function createLoginAccount(email, password) {
  const sec = initializeApp(firebaseConfig, 'secondary-' + Date.now())
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(sec), email, password)
    await signOut(getAuth(sec))
    return cred.user.uid
  } finally {
    await deleteApp(sec)
  }
}

export const firebaseApp = () => fb?.app || null

export const callFunction = (name, data) => httpsCallable(fb.functions, name)(data).then((r) => r.data)
