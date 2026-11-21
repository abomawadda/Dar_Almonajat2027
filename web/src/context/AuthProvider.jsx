// Authentication + profile (users/{uid}) → actor used by every service call.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DATA_MODE, authApi } from '@/lib/backend'
import { getProfile } from '@/services/people'
import { DEMO_USERS, ROLES } from '@/config/roles'

const AuthCtx = createContext(null)
const DEMO_KEY = 'dar.react.demo.session'

function toActor(uid, p) {
  return {
    uid,
    name: p.displayName || p.email || '',
    email: p.email || '',
    role: p.role,
    roleLabel: ROLES[p.role]?.label || p.role,
    linkedId: p.teacherId || p.studentId || p.parentId || uid
  }
}

export function AuthProvider({ children }) {
  const [actor, setActor] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (DATA_MODE === 'demo') {
      try {
        const role = sessionStorage.getItem(DEMO_KEY)
        if (role && DEMO_USERS[role]) setActor(toActor(DEMO_USERS[role].uid, DEMO_USERS[role]))
      } catch { /* private mode */ }
      setReady(true)
      return
    }
    return authApi.onChange(async (u) => {
      if (!u) { setActor(null); setReady(true); return }
      try {
        const p = await getProfile(u.uid)
        if (!p?.role || !ROLES[p.role] || p.isActive === false) {
          await authApi.signOut()
          setActor(null)
        } else {
          setActor(toActor(u.uid, { ...p, email: p.email || u.email }))
        }
      } catch (e) {
        console.error(e)
        setActor(null)
      }
      setReady(true)
    })
  }, [])

  const signIn = useCallback(async (email, password) => {
    const cred = await authApi.signIn(email, password)
    // Validate the profile here so the login form can show the reason;
    // onAuthStateChanged applies the same check and sets the actor.
    const p = await getProfile(cred.user.uid).catch(() => null)
    if (!p?.role || !ROLES[p.role] || p.isActive === false) {
      await authApi.signOut()
      throw new Error(p?.isActive === false ? 'تم إيقاف هذا الحساب' : 'هذا الحساب غير مفعّل في الدار — تواصل مع الإدارة')
    }
  }, [])

  const signInDemo = useCallback((role) => {
    const p = DEMO_USERS[role]
    try { sessionStorage.setItem(DEMO_KEY, role) } catch { /* ignore */ }
    setActor(toActor(p.uid, p))
  }, [])

  const signOut = useCallback(async () => {
    if (DATA_MODE === 'demo') { try { sessionStorage.removeItem(DEMO_KEY) } catch { /* ignore */ } setActor(null); return }
    await authApi.signOut()
  }, [])

  const value = useMemo(() => ({ actor, ready, signIn, signInDemo, signOut, resetPassword: authApi.resetPassword, mode: DATA_MODE }), [actor, ready, signIn, signInDemo, signOut])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
