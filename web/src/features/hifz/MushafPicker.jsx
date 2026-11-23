// Pick a recitation portion from mushaf lists only: آيات من سورة، سورة/سور، حزب/أحزاب، جزء/أجزاء.
// Value shape matches lib/hifz pickToRange(): { unit, surah?, from, to }.
import { Field, Segmented, Select } from '@/components/ui'
import { SURAHS } from '@/config/quran'
import { HIZB, JUZ, UNITS, fromIndex, pickToRange } from '@/lib/hifz'

const range = (n) => Array.from({ length: n }, (_, i) => i + 1)
const juzName = (n) => `الجزء ${n} — ${fromIndex(JUZ[n - 1].s).surah}`
const hizbName = (n) => `الحزب ${n} — ${fromIndex(HIZB[n - 1].s).surah} ${fromIndex(HIZB[n - 1].s).ayah}`
const surahName = (n) => `${n}. ${SURAHS[n - 1].name}`

/** Sensible default when switching unit, anchored at the current selection. */
function switchUnit(unit, value) {
  const r = pickToRange(value)
  const start = r ? r.s : 0
  if (unit === 'juz') { const n = JUZ.findIndex((j) => start >= j.s && start <= j.e) + 1 || 1; return { unit, from: n, to: n } }
  if (unit === 'hizb') { const n = HIZB.findIndex((j) => start >= j.s && start <= j.e) + 1 || 1; return { unit, from: n, to: n } }
  const p = fromIndex(start)
  const n = SURAHS.findIndex((s) => s.name === p.surah) + 1 || 1
  if (unit === 'surah') return { unit, from: n, to: n }
  return { unit, surah: n, from: 1, to: Math.min(SURAHS[n - 1].ayahs, 10) }
}

export default function MushafPicker({ value, onChange }) {
  const v = value || { unit: 'surah', from: 114, to: 114 }
  const set = (patch) => onChange({ ...v, ...patch })
  const opts = v.unit === 'juz' ? range(30).map((n) => [n, juzName(n)])
    : v.unit === 'hizb' ? range(60).map((n) => [n, hizbName(n)])
      : v.unit === 'surah' ? range(114).map((n) => [n, surahName(n)])
        : range(SURAHS[(v.surah || 1) - 1].ayahs).map((n) => [n, `آية ${n}`])

  return (
    <div>
      <Segmented value={v.unit} onChange={(u) => onChange(switchUnit(u, v))} options={Object.entries(UNITS)} />
      {v.unit === 'ayahs' && (
        <Field label="السورة">
          <Select value={v.surah} onChange={(e) => { const n = +e.target.value; set({ surah: n, from: 1, to: Math.min(SURAHS[n - 1].ayahs, 10) }) }}>
            {range(114).map((n) => <option key={n} value={n}>{surahName(n)} ({SURAHS[n - 1].ayahs} آية)</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <Field label="من">
          <Select value={v.from} onChange={(e) => { const n = +e.target.value; set({ from: n, to: Math.max(n, v.to) }) }}>
            {opts.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </Select>
        </Field>
        <Field label="إلى">
          <Select value={v.to} onChange={(e) => set({ to: +e.target.value })}>
            {opts.filter(([n]) => n >= v.from).map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </Select>
        </Field>
      </div>
    </div>
  )
}
