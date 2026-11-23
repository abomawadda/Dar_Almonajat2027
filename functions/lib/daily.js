// Groups one day's activity by student and builds the parent notifications (pure; tested).
import { buildDailySummary } from './summary.js'

/**
 * @param {object} rows { attendance: [], hifz: [], points: [] } — documents for one date
 * @returns {Array<{ parentId, studentId, title, body }>}
 */
export function dailyNotifications(date, rows) {
  const by = new Map()
  const slot = (r) => {
    if (!r.studentId || !r.parentId) return null
    if (!by.has(r.studentId)) by.set(r.studentId, { studentId: r.studentId, parentId: r.parentId, studentName: r.studentName || '', date, hifz: [], points: [] })
    return by.get(r.studentId)
  }
  for (const a of rows.attendance || []) { const s = slot(a); if (s) s.attendance = a }
  for (const h of rows.hifz || []) { const s = slot(h); if (s) s.hifz.push(h) }
  for (const p of rows.points || []) { const s = slot(p); if (s) s.points.push(p) }
  return [...by.values()]
    .map((d) => ({ d, sum: buildDailySummary(d) }))
    .filter(({ sum }) => !sum.empty)
    .map(({ d, sum }) => ({ parentId: d.parentId, studentId: d.studentId, title: sum.title, body: sum.text }))
}
