// node --test — runs approval.js against a minimal in-memory imitation of the Admin SDK.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approveApplication } from '../lib/approval.js'

function fakeAdmin(seed) {
  const store = JSON.parse(JSON.stringify(seed))
  let n = 0
  const FieldValue = { serverTimestamp: () => ({ $ts: 1 }), increment: (v) => ({ $inc: v }), arrayUnion: (...v) => ({ $union: v }) }
  const apply = (cur, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v?.$inc !== undefined) cur[k] = (cur[k] || 0) + v.$inc
      else if (v?.$union) cur[k] = [...new Set([...(cur[k] || []), ...v.$union])]
      else cur[k] = v
    }
    return cur
  }
  const ref = (c, id) => ({ c, id: id || 'auto' + ++n })
  const snap = (r) => ({ id: r.id, exists: !!store[r.c]?.[r.id], data: () => store[r.c]?.[r.id] })
  const db = {
    collection: (c) => ({ doc: (id) => ({ ...ref(c, id), get: async function () { return snap(this) } }) }),
    async runTransaction(fn) {
      const writes = []
      const tx = {
        get: async (r) => snap(r),
        set: (r, d) => writes.push(() => { (store[r.c] ||= {})[r.id] = apply({}, d) }),
        update: (r, d) => writes.push(() => { if (!store[r.c]?.[r.id]) throw new Error('missing ' + r.c + '/' + r.id); apply(store[r.c][r.id], d) })
      }
      await fn(tx)
      writes.forEach((w) => w()) // commit only if fn succeeded
    }
  }
  const users = new Map()
  const auth = {
    createUser: async ({ email }) => { if ([...users.values()].includes(email)) { const e = new Error('x'); e.code = 'auth/email-already-exists'; throw e } const uid = 'U' + ++n; users.set(uid, email); return { uid } },
    deleteUser: async (uid) => users.delete(uid)
  }
  return { deps: { db, auth, FieldValue }, store, users }
}

const SEED = {
  users: { A: { role: 'admin', displayName: 'المدير' }, S: { role: 'supervisor' } },
  groups: { G1: { name: 'حلقة', teacherId: 'T1', teacherName: 'الشيخ', capacity: 2, studentCount: 1 } },
  settings: { general: { monthlyFee: 1500 } },
  parents: { P1: { name: 'أب', phone: '050', childrenIds: ['S0'] } },
  applications: {
    A1: { status: 'reviewing', type: 'quran', personalInfo: { fullName: 'طالب أول' }, guardianInfo: { name: 'ولي', phone: '055', email: 'w@x.com' }, academicInfo: { juzCount: 2 } },
    A2: { status: 'pending', type: 'quran', personalInfo: { fullName: 'طالب ثان' }, guardianInfo: { name: 'أب', phone: '050' } }
  }
}

test('approves: student, parent account, group count, fee, notifications', async () => {
  const { deps, store, users } = fakeAdmin(SEED)
  const r = await approveApplication(deps, { applicationId: 'A1', groupId: 'G1', createAccount: true, createFee: true, notify: true }, 'A')
  assert.equal(store.applications.A1.status, 'approved')
  assert.equal(store.students[r.studentId].academicInfo.teacherId, 'T1')
  assert.deepEqual(store.parents[r.parentId].childrenIds, [r.studentId])
  assert.equal(store.users[r.parentId].role, 'parent')
  assert.equal(users.get(r.parentId), 'w@x.com')
  assert.equal(store.groups.G1.studentCount, 2)
  assert.equal(Object.values(store.payments).length, 1)
  assert.equal(Object.values(store.notifications).length, 2)
  assert.match(r.credentials.password, /^Dar\d{6}$/)
})

test('only an active admin can approve', async () => {
  const { deps } = fakeAdmin(SEED)
  await assert.rejects(approveApplication(deps, { applicationId: 'A1', groupId: 'G1' }, 'S'), { code: 'permission-denied' })
  await assert.rejects(approveApplication(deps, { applicationId: 'A1', groupId: 'G1' }, undefined), { code: 'unauthenticated' })
})

test('full group fails and the created login is rolled back', async () => {
  const seed = JSON.parse(JSON.stringify(SEED)); seed.groups.G1.studentCount = 2
  const { deps, store, users } = fakeAdmin(seed)
  await assert.rejects(approveApplication(deps, { applicationId: 'A1', groupId: 'G1', createAccount: true }, 'A'), { code: 'failed-precondition' })
  assert.equal(users.size, 0, 'auth user deleted')
  assert.equal(store.applications.A1.status, 'reviewing', 'nothing written')
  assert.equal(store.students, undefined)
})

test('links an existing parent and refuses a second approval', async () => {
  const { deps, store } = fakeAdmin(SEED)
  const r = await approveApplication(deps, { applicationId: 'A2', groupId: 'G1', linkExistingParentId: 'P1' }, 'A')
  assert.deepEqual(store.parents.P1.childrenIds, ['S0', r.studentId])
  await assert.rejects(approveApplication(deps, { applicationId: 'A2', groupId: 'G1' }, 'A'), { code: 'failed-precondition' })
})
