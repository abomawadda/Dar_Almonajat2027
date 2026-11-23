import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dailyNotifications } from '../lib/daily.js'

test('daily summary groups activity per student and skips quiet ones', () => {
  const out = dailyNotifications('2026-11-23', {
    attendance: [
      { studentId: 'S1', parentId: 'P1', studentName: 'محمد طارق', status: 'present' },
      { studentId: 'S9', parentId: 'P9', studentName: 'بلا ولي', status: 'absent' },
      { studentId: 'S2', studentName: 'بدون ولي أمر', status: 'present' }
    ],
    hifz: [{ studentId: 'S1', parentId: 'P1', masteryLevel: 'excellent', newMemorization: { label: 'الملك 1–10' }, homework: 'القريب: الملك' }],
    points: [{ studentId: 'S1', parentId: 'P1', delta: 2 }, { studentId: 'S1', parentId: 'P1', delta: 10 }]
  })
  assert.equal(out.length, 2)
  const s1 = out.find((n) => n.studentId === 'S1')
  assert.equal(s1.parentId, 'P1')
  assert.equal(s1.title, 'ملخص يوم محمد')
  assert.match(s1.body, /حاضر/)
  assert.match(s1.body, /الجديد: الملك 1–10/)
  assert.match(s1.body, /واجب الغد: القريب: الملك/)
  assert.match(s1.body, /\+12/)
  assert.match(out.find((n) => n.studentId === 'S9').body, /غائب/)
})

test('web copy of the summary builder is identical', () => {
  const a = readFileSync(new URL('../lib/summary.js', import.meta.url), 'utf8')
  const b = readFileSync(new URL('../../web/src/lib/summary.js', import.meta.url), 'utf8')
  assert.equal(a, b)
})
