// Firestore adapter: same interface as the memory adapter.
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, writeBatch,
  serverTimestamp, increment, arrayUnion
} from 'firebase/firestore'
import { isOp } from './ops.js'

// Timestamps come back as ISO strings so the UI never deals with two date types.
function normalize(v) {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = normalize(v[k]) }); return o }
  return v
}
function translate(v) {
  if (isOp(v)) {
    if (v.__op === 'now') return serverTimestamp()
    if (v.__op === 'inc') return increment(v.n)
    if (v.__op === 'union') return arrayUnion(...v.v)
  }
  if (Array.isArray(v)) return v.map(translate)
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = translate(v[k]) }); return o }
  return v
}

// Firestore applies writes to the local cache immediately but resolves the promise only
// after the server acknowledges. Offline, that never happens until reconnection, so we
// resolve as soon as the write is queued; the SDK syncs it when the connection returns.
function settle(promise, value) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    promise.catch((e) => console.error('[db] queued write failed', e))
    return Promise.resolve(value)
  }
  return promise.then(() => value)
}

export function createFirestoreAdapter(db) {
  const ref = (c, id) => doc(db, c, id)
  const toQuery = (c, spec = {}) => {
    const cons = (spec.where || []).map(([f, o, v]) => where(f, o, v))
    if (spec.orderBy) cons.push(orderBy(spec.orderBy[0], spec.orderBy[1] || 'asc'))
    if (spec.limit) cons.push(limit(spec.limit))
    return query(collection(db, c), ...cons)
  }
  const rows = (snap) => snap.docs.map((d) => ({ ...normalize(d.data()), id: d.id }))

  return {
    kind: 'firestore',
    newId: (c = '_') => doc(collection(db, c)).id,
    async get(c, id) { const s = await getDoc(ref(c, id)); return s.exists() ? { ...normalize(s.data()), id: s.id } : null },
    async list(c, spec) { return rows(await getDocs(toQuery(c, spec))) },
    set: (c, id, data, opts) => settle(setDoc(ref(c, id), translate(data), opts || {}), id),
    add(c, data) {
      const r = doc(collection(db, c)) // id generated locally, so it is known even offline
      return settle(setDoc(r, translate(data)), r.id)
    },
    update: (c, id, patch) => settle(updateDoc(ref(c, id), translate(patch))),
    remove: (c, id) => settle(deleteDoc(ref(c, id))),
    subscribe(c, spec, cb, onError) {
      return onSnapshot(toQuery(c, spec), (s) => cb(rows(s)), (e) => {
        console.warn('[db]', c, e.code, e.message)
        onError ? onError(e) : cb([])
      })
    },
    batch() {
      const b = writeBatch(db)
      return {
        set: (c, id, d, o) => b.set(ref(c, id), translate(d), o || {}),
        update: (c, id, p) => b.update(ref(c, id), translate(p)),
        add: (c, d) => { const r = doc(collection(db, c)); b.set(r, translate(d)); return r.id },
        commit: () => settle(b.commit())
      }
    },
    isEmpty: () => false,
    reset() { throw new Error('reset is only available in demo mode') }
  }
}
