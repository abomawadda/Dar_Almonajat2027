// Daily summary for a parent — pure function, no imports.
// The same file is used by the web app (parent dashboard) and by the scheduled Cloud Function;
// web/src/lib/summary.js must stay identical (a test checks it).

const ATT = { present: 'حاضر ✅', late: 'متأخر ⏰', absent: 'غائب ❌', excused: 'غائب بعذر', early_leave: 'انصرف مبكرًا' }
const MASTERY = { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', weak: 'ضعيف' }
const TRACKS = { newMemorization: 'الجديد', nearReview: 'القريب', revision: 'البعيد' }

/**
 * @param {object} d { studentName, date, attendance?: {status}, hifz?: [records], points?: [ledger entries], behavior?: [records] }
 * @returns {{ title: string, lines: string[], text: string, empty: boolean }}
 */
export function buildDailySummary(d) {
  const first = String(d.studentName || '').split(' ')[0] || 'الطالب'
  const lines = []
  if (d.attendance?.status) lines.push(`الحضور: ${ATT[d.attendance.status] || d.attendance.status}`)
  for (const r of d.hifz || []) {
    const parts = Object.keys(TRACKS).filter((k) => r[k]).map((k) => `${TRACKS[k]}: ${r[k].label || `${r[k].surahName} ${r[k].fromAyah}–${r[k].toAyah}`}`)
    const status = r.status === 'repeat' ? ' (يُعاد)' : ''
    if (parts.length) lines.push(`التسميع${status} — ${MASTERY[r.masteryLevel] || ''}: ${parts.join(' • ')}`)
    if (r.homework) lines.push(`واجب الغد: ${r.homework}`)
    if (r.teacherNotes) lines.push(`ملاحظة المحفظ: ${r.teacherNotes}`)
  }
  for (const b of d.behavior || []) lines.push(`${b.type === 'positive' ? 'إشادة' : 'ملاحظة سلوك'}: ${b.description}`)
  const pts = (d.points || []).reduce((n, e) => n + (Number(e.delta) || 0), 0)
  if ((d.points || []).length) lines.push(`النقاط اليوم: ${pts > 0 ? '+' : ''}${pts}`)
  const title = `ملخص يوم ${first}`
  return { title, lines, text: lines.join('\n'), empty: lines.length === 0 }
}
