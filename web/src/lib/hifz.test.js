import { describe, it, expect, beforeEach } from 'vitest'
import { setDb, db } from '@/lib/backend'
import { createMemoryAdapter } from '@/lib/db/memory'
import { seedDemo } from '@/data/seed'
import { recordHifz, saveHifzPlan } from '@/services/academic'
import { TOTAL_AYAHS } from '@/config/quran'
import {
  JUZ, ayahIndex, fromIndex, mergeRanges, countAyahs, juzCoverage, juzOf,
  suggestNew, suggestNear, suggestFar, isAccepted, lastJuzRanges, estimateCompletion
} from './hifz'

const teacher = { uid: 'T1', role: 'teacher', linkedId: 'T1' }

describe('hifz engine — positions', () => {
  it('maps surah/ayah to global index and back', () => {
    expect(ayahIndex('الفاتحة', 1)).toBe(0)
    expect(ayahIndex('البقرة', 1)).toBe(7)
    expect(ayahIndex('الناس', 6)).toBe(TOTAL_AYAHS - 1)
    expect(fromIndex(7)).toEqual({ surah: 'البقرة', ayah: 1 })
  })
  it('covers the whole mushaf with 30 contiguous juz', () => {
    expect(JUZ).toHaveLength(30)
    expect(JUZ[0].s).toBe(0)
    expect(JUZ[29].e).toBe(TOTAL_AYAHS - 1)
    for (let i = 1; i < 30; i++) expect(JUZ[i].s).toBe(JUZ[i - 1].e + 1)
    expect(juzOf(ayahIndex('النبأ', 1))).toBe(30)
    expect(juzOf(ayahIndex('الملك', 1))).toBe(29)
  })
  it('merges overlapping and adjacent ranges', () => {
    expect(mergeRanges([{ s: 10, e: 20 }, { s: 0, e: 5 }, { s: 6, e: 9 }, { s: 15, e: 30 }])).toEqual([{ s: 0, e: 30 }])
    expect(countAyahs([{ s: 0, e: 9 }, { s: 20, e: 29 }])).toBe(20)
  })
  it('computes juz coverage', () => {
    const cov = juzCoverage(lastJuzRanges(2))
    expect(cov[29].pct).toBe(1)
    expect(cov[28].pct).toBe(1)
    expect(cov[27].pct).toBe(0)
  })
})

describe('hifz engine — suggestions', () => {
  it('backward plan starts at الناس, then moves to earlier surahs', () => {
    expect(suggestNew({})).toMatchObject({ surah: 'الناس', from: 1, to: 6 })
    expect(suggestNew({ ranges: lastJuzRanges(1) })).toMatchObject({ surah: 'المرسلات', from: 1 })
  })
  it('forward plan continues after the memorized prefix', () => {
    const p = { plan: { direction: 'forward', dailyNew: 5 }, ranges: [{ s: 0, e: 6 }] }
    expect(suggestNew(p)).toEqual({ surah: 'البقرة', from: 1, to: 5 })
  })
  it('a pending repeat takes priority', () => {
    expect(suggestNew({ pendingRepeat: { surah: 'الملك', from: 1, to: 10 } })).toMatchObject({ surah: 'الملك', repeat: true })
  })
  it('near review is a window anchored at the last new', () => {
    const n = suggestNear({ ranges: lastJuzRanges(2), lastNew: { s: JUZ[28].s, e: JUZ[28].s + 9 } })
    expect(n.s).toBe(JUZ[28].s)
    expect(n.e - n.s + 1).toBe(100)
  })
  it('far review prefers weak, then least-recently reviewed juz', () => {
    const base = { ranges: lastJuzRanges(5), lastNew: { s: JUZ[25].s, e: JUZ[25].s + 5 } }
    expect(suggestFar({ ...base, juzReviewedAt: { 26: '2026-05-01', 27: '2026-01-01', 28: '2026-02-01', 29: '2026-03-01', 30: '2026-04-01' } }).juz).toBe(27)
    expect(suggestFar({ ...base, juzReviewedAt: { 27: '2026-01-01' }, weakJuz: [29] }).juz).toBe(29)
    expect(suggestFar({})).toBeNull()
    // never the juz already covered by the near window
    const nearJuz = juzOf(suggestNear(base).s)
    expect(suggestFar(base).juz).not.toBe(nearJuz)
  })
  it('acceptance threshold and completion estimate', () => {
    expect(isAccepted(3)).toBe(true)
    expect(isAccepted(4)).toBe(false)
    expect(estimateCompletion({ ranges: [{ s: 0, e: TOTAL_AYAHS - 1 }] })).toEqual({ done: true })
    expect(estimateCompletion({ ranges: [], pace: 10 }).days).toBe(624)
  })
})

describe('recordHifz — three tracks', () => {
  beforeEach(async () => { setDb(createMemoryAdapter()); await seedDemo(db()) })
  const studentOf = (id) => db().get('students', id).then((s) => ({ id, ...s }))

  it('accepted new + near + far updates ranges, reviews and status', async () => {
    const st = await studentOf('S6')
    const before = await db().get('hifzProgress', 'S6')
    await recordHifz({
      student: st, mastery: 'excellent', hifzMistakes: 1,
      segments: { new: { surah: 'الحديد', from: 1, to: 6 }, near: { surah: 'النبأ', from: 1, to: 40 }, far: { surah: 'الملك', from: 1, to: 30 } }
    }, teacher)
    const p = await db().get('hifzProgress', 'S6')
    expect(countAyahs(p.ranges)).toBe(countAyahs(before.ranges) + 6)
    expect(p.juzReviewedAt[30]).toBeTruthy()
    expect(p.juzReviewedAt[29]).toBeTruthy()
    const rec = (await db().list('hifzRecords', { where: [['studentId', '==', 'S6']] })).find((r) => r.tracks)
    expect(rec).toMatchObject({ status: 'accepted', tracks: ['new', 'near', 'far'] })
    expect(rec.nearReview.ayahCount).toBe(40)
  })

  it('too many mistakes → repeat: nothing added, suggested again next time', async () => {
    const st = await studentOf('S6')
    await saveHifzPlan('S6', { maxNewMistakes: 2 })
    await recordHifz({ student: st, mastery: 'weak', hifzMistakes: 5, segments: { new: { surah: 'الحديد', from: 1, to: 6 } } }, teacher)
    const p = await db().get('hifzProgress', 'S6')
    expect(countAyahs(p.ranges)).toBe(countAyahs(lastJuzRanges(3)))
    expect(suggestNew(p)).toMatchObject({ surah: 'الحديد', from: 1, to: 6, repeat: true })
  })

  it('weak review marks the juz weak; excellent clears it', async () => {
    const st = await studentOf('S6')
    await recordHifz({ student: st, mastery: 'weak', segments: { far: { surah: 'الملك', from: 1, to: 10 } } }, teacher)
    expect((await db().get('hifzProgress', 'S6')).weakJuz).toEqual([29])
    await recordHifz({ student: st, mastery: 'excellent', segments: { far: { surah: 'الملك', from: 1, to: 10 } } }, teacher)
    expect((await db().get('hifzProgress', 'S6')).weakJuz).toEqual([])
  })

  it('re-reciting memorized ayahs as "new" does not double count', async () => {
    const st = await studentOf('S6')
    const before = (await db().get('hifzProgress', 'S6')).ranges
    await recordHifz({ student: st, mastery: 'good', segments: { new: { surah: 'النبأ', from: 1, to: 10 } } }, teacher)
    expect(countAyahs((await db().get('hifzProgress', 'S6')).ranges)).toBe(countAyahs(before))
  })
})
