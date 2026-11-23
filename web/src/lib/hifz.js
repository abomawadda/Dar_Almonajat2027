// Hifz engine — pure functions (no I/O) behind the three-track recitation model:
//   new  (الجديد)        → extends the memorized set when accepted
//   near (الماضي القريب) → the most recently memorized window
//   far  (الماضي البعيد) → rotation over everything memorized, weakest juz first
// Positions are global ayah indexes 0..6235 in mushaf order; memorized content is a
// sorted list of non-overlapping ranges {s, e} (inclusive) — Firestore cannot store nested arrays.
import { SURAHS, TOTAL_AYAHS } from '@/config/quran'

// ── Positions ───────────────────────────────────────────────────────────────
const OFFSETS = (() => {
  const o = []
  let acc = 0
  for (const s of SURAHS) { o.push(acc); acc += s.ayahs }
  return o
})()

export function ayahIndex(surahName, ayah) {
  const i = SURAHS.findIndex((s) => s.name === surahName)
  if (i === -1) return -1
  return OFFSETS[i] + Number(ayah) - 1
}

export function fromIndex(idx) {
  let i = SURAHS.length - 1
  while (i > 0 && OFFSETS[i] > idx) i--
  return { surah: SURAHS[i].name, ayah: idx - OFFSETS[i] + 1 }
}

/** Juz start points (surah number, ayah) — standard Madani division. */
const JUZ_STARTS = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1]
]
export const JUZ = JUZ_STARTS.map(([sn, a], i) => {
  const s = OFFSETS[sn - 1] + a - 1
  const next = JUZ_STARTS[i + 1]
  const e = next ? OFFSETS[next[0] - 1] + next[1] - 2 : TOTAL_AYAHS - 1
  return { n: i + 1, s, e, size: e - s + 1 }
})
export const juzOf = (idx) => JUZ.find((j) => idx >= j.s && idx <= j.e)?.n || 1

// ── Ranges ──────────────────────────────────────────────────────────────────
export function mergeRanges(ranges) {
  const sorted = (ranges || []).filter((r) => r && r.e >= r.s).map((r) => ({ s: r.s, e: r.e })).sort((a, b) => a.s - b.s)
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.s <= last.e + 1) last.e = Math.max(last.e, r.e)
    else out.push(r)
  }
  return out
}
export const addRange = (ranges, r) => mergeRanges([...(ranges || []), r])
export const countAyahs = (ranges) => (ranges || []).reduce((n, r) => n + r.e - r.s + 1, 0)
const overlap = (r, s, e) => Math.max(0, Math.min(r.e, e) - Math.max(r.s, s) + 1)

/** Per-juz coverage 0..1. */
export const juzCoverage = (ranges) =>
  JUZ.map((j) => ({ n: j.n, pct: (ranges || []).reduce((n, r) => n + overlap(r, j.s, j.e), 0) / j.size }))

/** Convert a segment {surah, from, to} into a global range. */
export function segmentRange({ surah, from, to }) {
  const s = ayahIndex(surah, from)
  const e = ayahIndex(surah, to)
  return s < 0 || e < s ? null : { s, e }
}
export function rangeLabel({ s, e }) {
  const a = fromIndex(s), b = fromIndex(e)
  return a.surah === b.surah ? `${a.surah} ${a.ayah}–${b.ayah}` : `${a.surah} ${a.ayah} ← ${b.surah} ${b.ayah}`
}

// ── Plan & rules ────────────────────────────────────────────────────────────
export const DEFAULT_PLAN = {
  direction: 'backward',   // backward = من الناس نحو البقرة (الأشيع للصغار) | forward = من الفاتحة
  dailyNew: 10,            // آيات الحفظ الجديد يوميًا
  nearWindow: 100,         // حجم نافذة الماضي القريب بالآيات (≈ آخر 5 صفحات)
  farDaily: 1,             // عدد الأجزاء في المراجعة البعيدة يوميًا (جزء كامل أو جزئي حسب المحفوظ)
  maxNewMistakes: 3        // أكثر من ذلك في الجديد ← إعادة ولا يُضاف للمحفوظ
}
export const planOf = (progress) => ({ ...DEFAULT_PLAN, ...(progress?.plan || {}) })

/** Is a "new" recitation accepted? */
export const isAccepted = (hifzMistakes, plan = DEFAULT_PLAN) => (Number(hifzMistakes) || 0) <= plan.maxNewMistakes

// ── Suggestions ─────────────────────────────────────────────────────────────
function clampToSurah(start, count) {
  const p = fromIndex(start)
  const surah = SURAHS.find((s) => s.name === p.surah)
  return { surah: p.surah, from: p.ayah, to: Math.min(surah.ayahs, p.ayah + count - 1) }
}

/** Next "new" segment, honoring a pending repeat. */
export function suggestNew(progress) {
  const plan = planOf(progress)
  if (progress?.pendingRepeat) return { ...progress.pendingRepeat, repeat: true }
  const ranges = progress?.ranges || []
  if (plan.direction === 'forward') {
    let idx = 0
    for (const r of ranges) { if (r.s <= idx) idx = Math.max(idx, r.e + 1) }
    if (idx >= TOTAL_AYAHS) return null
    return clampToSurah(idx, plan.dailyNew)
  }
  // backward: walk surahs from الناس toward البقرة; first surah not fully memorized, from its first missing ayah
  for (let i = SURAHS.length - 1; i >= 0; i--) {
    const s = OFFSETS[i], e = OFFSETS[i] + SURAHS[i].ayahs - 1
    let idx = s
    for (const r of ranges) { if (r.s <= idx && r.e >= idx) idx = r.e + 1 }
    if (idx <= e) return clampToSurah(idx, plan.dailyNew)
  }
  return null
}

/** Near review: the last `nearWindow` ayahs memorized before the latest new point. */
export function suggestNear(progress) {
  const plan = planOf(progress)
  const ranges = progress?.ranges || []
  if (!ranges.length) return null
  const anchor = progress?.lastNew || (plan.direction === 'backward' ? ranges[0] : ranges[ranges.length - 1])
  // collect memorized ayahs ending at anchor.e within the containing range, up to nearWindow
  const r = ranges.find((x) => anchor.e >= x.s && anchor.e <= x.e) || ranges[ranges.length - 1]
  const end = Math.min(anchor.e, r.e)
  const start = plan.direction === 'backward'
    ? Math.max(r.s, anchor.s)            // backward: recent surahs sit after the new point
    : Math.max(r.s, end - plan.nearWindow + 1)
  const e = plan.direction === 'backward' ? Math.min(r.e, start + plan.nearWindow - 1) : end
  if (e < start) return null
  return { s: start, e }
}

/** Far review: the memorized juz reviewed longest ago (never-reviewed and weak juz first). */
export function suggestFar(progress, today = new Date().toISOString().slice(0, 10)) {
  const ranges = progress?.ranges || []
  const reviewed = progress?.juzReviewedAt || {}
  const weak = new Set((progress?.weakJuz || []).map(Number))
  const near = suggestNear(progress)
  const candidates = juzCoverage(ranges)
    .filter((c) => c.pct > 0)
    .map((c) => ({ ...c, last: reviewed[c.n] || '', weak: weak.has(c.n) }))
    .filter((c) => !near || overlap(near, JUZ[c.n - 1].s, JUZ[c.n - 1].e) === 0)
    .filter((c) => c.last !== today)
  if (!candidates.length) return null
  candidates.sort((a, b) => (a.weak !== b.weak ? (a.weak ? -1 : 1) : a.last < b.last ? -1 : a.last > b.last ? 1 : a.n - b.n))
  const j = JUZ[candidates[0].n - 1]
  // the memorized part of that juz
  const parts = ranges.map((r) => ({ s: Math.max(r.s, j.s), e: Math.min(r.e, j.e) })).filter((r) => r.e >= r.s)
  return { juz: j.n, s: parts[0].s, e: parts[parts.length - 1].e }
}

/** Estimated finish date from the actual pace (ayahs/day over recent sessions). */
export function estimateCompletion(progress, today = new Date()) {
  const remaining = TOTAL_AYAHS - countAyahs(progress?.ranges)
  if (remaining <= 0) return { done: true }
  const pace = Number(progress?.pace) || planOf(progress).dailyNew
  if (pace <= 0) return null
  const days = Math.ceil(remaining / pace)
  const d = new Date(today)
  d.setDate(d.getDate() + Math.ceil(days * 7 / 5)) // ~5 study days a week
  return { days, date: d.toISOString().slice(0, 10) }
}

/** Seed helper: memorize the last `juz` parts (juz 30 backwards). */
export const lastJuzRanges = (juz) => (juz > 0 ? [{ s: JUZ[30 - juz].s, e: TOTAL_AYAHS - 1 }] : [])
