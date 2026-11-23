// Security-rules tests against the Firestore emulator (run: npm test, inside emulators:exec).
import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore'

let env
const users = {
  admin: { role: 'admin' },
  t1: { role: 'teacher', teacherId: 'T1' },
  t2: { role: 'teacher', teacherId: 'T2' },
  p1: { role: 'parent', parentId: 'P1' },
  p2: { role: 'parent', parentId: 'P2' },
  s1: { role: 'student', studentId: 'S1' }
}
const as = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dar',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  })
})
after(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const [uid, p] of Object.entries(users)) await setDoc(doc(db, 'users', uid), { ...p, isActive: true })
    await setDoc(doc(db, 'students', 'S1'), { parentId: 'P1', academicInfo: { groupId: 'G1', teacherId: 'T1' } })
    await setDoc(doc(db, 'conversations', 'P1__T1'), { participants: ['P1', 'T1'], parentId: 'P1', other: 'T1', unread: {} })
    await setDoc(doc(db, 'chatMessages', 'm1'), { convId: 'P1__T1', participants: ['P1', 'T1'], from: 'P1', text: 'السلام عليكم' })
    await setDoc(doc(db, 'certVerify', 'ABCDEFGH'), { serial: 'DAR-2026-0001', studentName: 'محمد', status: 'valid' })
    await setDoc(doc(db, 'examResults', 'E1_S1'), { examId: 'E1', studentId: 'S1', parentId: 'P1', published: false, total: 80 })
    await setDoc(doc(db, 'pointsLedger', 'L1'), { studentId: 'S1', parentId: 'P1', delta: 5 })
    await setDoc(doc(db, 'excuses', 'X1'), { studentId: 'S1', parentId: 'P1', teacherId: 'T1', status: 'pending' })
  })
})

test('messages: participants only; sender must be me; no edits', async () => {
  await assertSucceeds(getDoc(doc(as('p1'), 'conversations', 'P1__T1')))
  await assertSucceeds(getDoc(doc(as('t1'), 'conversations', 'P1__T1')))
  await assertFails(getDoc(doc(as('p2'), 'conversations', 'P1__T1')))
  await assertFails(getDoc(doc(as('t2'), 'conversations', 'P1__T1')))
  await assertSucceeds(getDocs(query(collection(as('t1'), 'conversations'), where('participants', 'array-contains', 'T1'))))
  await assertSucceeds(getDocs(query(collection(as('p1'), 'chatMessages'), where('convId', '==', 'P1__T1'), where('participants', 'array-contains', 'P1'))))
  await assertSucceeds(setDoc(doc(as('t1'), 'chatMessages', 'm2'), { convId: 'P1__T1', participants: ['P1', 'T1'], from: 'T1', text: 'وعليكم السلام' }))
  await assertFails(setDoc(doc(as('t1'), 'chatMessages', 'm3'), { convId: 'P1__T1', participants: ['P1', 'T1'], from: 'P1', text: 'انتحال' }))
  await assertFails(setDoc(doc(as('p2'), 'chatMessages', 'm4'), { convId: 'P1__T1', participants: ['P1', 'T1'], from: 'P2', text: 'x' }))
  await assertFails(updateDoc(doc(as('p1'), 'chatMessages', 'm1'), { text: 'تعديل' }))
  await assertFails(setDoc(doc(as('p1'), 'conversations', 'P1__T1'), { participants: ['P1', 'T2'] }, { merge: true }))
  await assertSucceeds(setDoc(doc(as('admin'), 'conversations', 'P1__staff'), { participants: ['P1', 'staff'], parentId: 'P1', other: 'staff' }))
  await assertFails(setDoc(doc(as('p2'), 'conversations', 'P1__staff2'), { participants: ['P1', 'staff'] }))
})

test('certificate verification is public; exam results hidden from parents until published', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'certVerify', 'ABCDEFGH')))
  await assertFails(setDoc(doc(anon(), 'certVerify', 'X'), { status: 'valid' }))
  await assertFails(setDoc(doc(as('p1'), 'certVerify', 'X'), { status: 'valid' }))
  await assertFails(getDoc(doc(as('p1'), 'examResults', 'E1_S1')))
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'examResults', 'E1_S1'), { published: true }))
  await assertSucceeds(getDoc(doc(as('p1'), 'examResults', 'E1_S1')))
  await assertFails(getDoc(doc(as('p2'), 'examResults', 'E1_S1')))
  await assertFails(updateDoc(doc(as('t1'), 'examResults', 'E1_S1'), { total: 100 }))
})

test('points ledger is append-only; excuses decided by the group teacher only', async () => {
  await assertFails(updateDoc(doc(as('admin'), 'pointsLedger', 'L1'), { delta: 50 }))
  await assertFails(deleteDoc(doc(as('admin'), 'pointsLedger', 'L1')))
  await assertFails(setDoc(doc(as('p1'), 'pointsLedger', 'L2'), { studentId: 'S1', delta: 100 }))
  await assertSucceeds(setDoc(doc(as('t1'), 'pointsLedger', 'L3'), { studentId: 'S1', parentId: 'P1', delta: 2 }))
  await assertFails(updateDoc(doc(as('t2'), 'excuses', 'X1'), { status: 'approved' }))
  await assertFails(updateDoc(doc(as('p1'), 'excuses', 'X1'), { status: 'approved' }))
  await assertSucceeds(updateDoc(doc(as('t1'), 'excuses', 'X1'), { status: 'approved', decidedBy: 't1' }))
  await assertSucceeds(setDoc(doc(as('p1'), 'excuses', 'X2'), { studentId: 'S1', parentId: 'P1', status: 'pending' }))
  await assertFails(setDoc(doc(as('p1'), 'excuses', 'X3'), { studentId: 'S1', parentId: 'P1', status: 'approved' }))
})

test('push tokens: only my own keys', async () => {
  await assertSucceeds(setDoc(doc(as('p1'), 'pushTokens', 'tok1'), { uid: 'p1', keys: ['p1', 'P1'] }))
  await assertFails(setDoc(doc(as('p1'), 'pushTokens', 'tok2'), { uid: 'p1', keys: ['P2'] }))
  await assertFails(setDoc(doc(as('p1'), 'pushTokens', 'tok3'), { uid: 'p2', keys: ['p1'] }))
  await assertSucceeds(setDoc(doc(as('admin'), 'pushTokens', 'tok4'), { uid: 'admin', keys: ['admin', 'staff'] }))
  await assertFails(getDoc(doc(as('p1'), 'pushTokens', 'tok1')))
})
