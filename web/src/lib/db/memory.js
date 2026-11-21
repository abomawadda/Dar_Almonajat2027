// In-memory adapter with optional localStorage persistence.
// Used for demo mode and unit tests; behaves like Firestore for the subset the app uses
// (dotted field paths, increment/arrayUnion/serverTimestamp, atomic batches, live queries).
import { isOp } from './ops.js'

const clone = (o) => JSON.parse(JSON.stringify(o))
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o)

function resolve(val, old) {
  if (isOp(val)) {
    if (val.__op === 'now') return new Date().toISOString()
    if (val.__op === 'inc') return (Number(old) || 0) + val.n
    if (val.__op === 'union') {
      const a = Array.isArray(old) ? old.slice() : []
      val.v.forEach((x) => { if (!a.includes(x)) a.push(x) })
      return a
    }
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const o = {}
    Object.keys(val).forEach((k) => { o[k] = resolve(val[k], old && old[k]) })
    return o
  }
  return val
}
function setPath(obj, path, val) {
  const parts = path.split('.')
  let o = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}
    o = o[parts[i]]
  }
  const last = parts[parts.length - 1]
  o[last] = resolve(val, o[last])
}
function matches(doc, [field, opr, x]) {
  const v = getPath(doc, field)
  switch (opr) {
    case '==': return v === x
    case '!=': return v !== x
    case '>=': return v >= x
    case '<=': return v <= x
    case '>': return v > x
    case '<': return v < x
    case 'in': return x.includes(v)
    case 'array-contains': return Array.isArray(v) && v.includes(x)
    default: throw new Error('Unsupported operator ' + opr)
  }
}

export function createMemoryAdapter({ storageKey = null, storage = globalThis.localStorage } = {}) {
  let store = {}
  if (storageKey && storage) {
    try { store = JSON.parse(storage.getItem(storageKey) || '{}') } catch { store = {} }
  }
  const listeners = new Set()
  const pending = new Set()
  let seq = 0

  const col = (c) => store[c] || (store[c] = {})
  const persist = () => { if (storageKey && storage) { try { storage.setItem(storageKey, JSON.stringify(store)) } catch { /* quota */ } } }
  const run = (c, q = {}) => {
    let rows = Object.keys(col(c)).map((id) => ({ ...clone(store[c][id]), id }))
    ;(q.where || []).forEach((w) => { rows = rows.filter((d) => matches(d, w)) })
    if (q.orderBy) {
      const [f, dir] = q.orderBy
      const s = dir === 'desc' ? -1 : 1
      rows.sort((a, b) => { const x = getPath(a, f), y = getPath(b, f); return (x > y ? 1 : x < y ? -1 : 0) * s })
    }
    if (q.limit) rows = rows.slice(0, q.limit)
    return rows
  }
  const notify = (c) => {
    if (pending.has(c)) return
    pending.add(c)
    queueMicrotask(() => {
      pending.delete(c)
      listeners.forEach((l) => { if (l.c === c) l.cb(run(c, l.q)) })
    })
  }
  const writeSet = (c, id, data, opts) => {
    const cur = col(c)[id]
    if (opts?.merge && cur) Object.keys(data).forEach((k) => setPath(cur, k, data[k]))
    else store[c][id] = resolve(data, {})
    notify(c)
  }
  const writeUpdate = (c, id, patch) => {
    const cur = col(c)[id]
    if (!cur) { const e = new Error('No document to update: ' + c + '/' + id); e.code = 'not-found'; throw e }
    Object.keys(patch).forEach((k) => setPath(cur, k, patch[k]))
    notify(c)
  }

  const api = {
    kind: 'memory',
    newId: () => 'M' + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6),
    async get(c, id) { const d = col(c)[id]; return d ? { ...clone(d), id } : null },
    async list(c, q) { return run(c, q) },
    async set(c, id, data, opts) { writeSet(c, id, data, opts); persist(); return id },
    async add(c, data) { const id = api.newId(); writeSet(c, id, data); persist(); return id },
    async update(c, id, patch) { writeUpdate(c, id, patch); persist() },
    async remove(c, id) { delete col(c)[id]; persist(); notify(c) },
    subscribe(c, q, cb) {
      const l = { c, q, cb }
      listeners.add(l)
      queueMicrotask(() => { if (listeners.has(l)) cb(run(c, q)) })
      return () => listeners.delete(l)
    },
    batch() {
      const ops = []
      return {
        set: (c, id, d, o) => ops.push(() => writeSet(c, id, d, o)),
        update: (c, id, p) => ops.push(() => writeUpdate(c, id, p)),
        add: (c, d) => { const id = api.newId(); ops.push(() => writeSet(c, id, d)); return id },
        async commit() {
          const snapshot = JSON.stringify(store)
          try { ops.forEach((f) => f()); persist() } catch (e) { store = JSON.parse(snapshot); throw e } // all-or-nothing
        }
      }
    },
    isEmpty: () => Object.keys(store).length === 0,
    reset() { store = {}; persist(); Object.keys(store).forEach(notify) }
  }
  return api
}
