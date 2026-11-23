// Reports: loaders scoped by role + pure aggregation functions (tested), CSV export for Excel,
// teacher performance index and early-warning flags for struggling students.
import { db } from '@/lib/backend'
import { COL } from '@/config/constants'
import { addDays, todayKey } from '@/lib/format'

const MASTERY_SCORE = { excellent: 100, good: 80, average: 60, weak: 35 }
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)
const avg = (xs) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null)

// ── Periods ────────────────────────────────────────────────────────────────
export function periodRange(kind, today = todayKey()) {
  const d = new Date(today + 'T12:00:00Z')
  if (kind === 'month') return { from: today.slice(0, 8) + '01', to: today, label: 'هذا الشهر' }
  if (kind === 'last_month') {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), label: 'الشهر الماضي' }
  }
  if (kind === '90') return { from: todayKey(addDays(-89, d)), to: today, label: 'آخر ٩٠ يومًا' }
  return { from: todayKey(addDays(-29, d)), to: today, label: 'آخر ٣٠ يومًا' }
}
const weeksIn = ({ from, to }) => Math.max(1, (new Date(to) - new Date(from)) / (7 * 864e5) + 1 / 7)

// ── Loading (queries mirror the read rules: teachers see their own group) ───
export async function loadReportData({ from, to }, actor) {
  const range = [['date', '>=', from], ['date', '<=', to]]
  const mine = actor.role === 'teacher' ? [['teacherId', '==', actor.linkedId]] : []
  const [hifz, attendance, results] = await Promise.all([
    db().list(COL.HIFZ_RECORDS, { where: [...mine, ...range] }),
    db().list(COL.ATTENDANCE, { where: [...mine, ...range] }),
    db().list(COL.EXAM_RESULTS, { where: [...mine, ...range] })
  ])
  return { hifz, attendance, results: results.filter((r) => r.published) }
}

// ── Hifz ───────────────────────────────────────────────────────────────────
/** Per-student hifz figures over the period. */
export function hifzByStudent(records, students, range) {
  const weeks = weeksIn(range)
  return students.map((s) => {
    const rs = records.filter((r) => r.studentId === s.id)
    const news = rs.filter((r) => r.newMemorization)
    const accepted = news.filter((r) => r.status !== 'repeat')
    const newAyahs = accepted.reduce((n, r) => n + (Number(r.newMemorization.ayahCount) || 0), 0)
    const reviewAyahs = rs.reduce((n, r) => n + (Number(r.nearReview?.ayahCount) || 0) + (Number(r.revision?.ayahCount) || 0), 0)
    return {
      studentId: s.id, name: s.personalInfo.fullName, groupId: s.academicInfo?.groupId || '', groupName: s.academicInfo?.groupName || '',
      teacherId: s.academicInfo?.teacherId || '', sessions: rs.length, newAyahs, reviewAyahs,
      perWeek: Math.round((newAyahs / weeks) * 10) / 10,
      repeatRate: pct(news.length - accepted.length, news.length),
      mastery: avg(rs.map((r) => MASTERY_SCORE[r.masteryLevel]).filter((x) => x != null)),
      mistakes: rs.length ? Math.round((rs.reduce((n, r) => n + (r.hifzMistakes || 0) + (r.tajweedMistakes || 0) + (r.tashkeelMistakes || 0), 0) / rs.length) * 10) / 10 : null,
      lastSession: rs.map((r) => r.date).sort().pop() || s.academicInfo?.lastSession || '',
      totalMemorized: Number(s.academicInfo?.totalMemorized) || 0
    }
  })
}

// ── Attendance ─────────────────────────────────────────────────────────────
export function attendanceByStudent(rows, students) {
  return students.map((s) => {
    const rs = rows.filter((r) => r.studentId === s.id)
    const c = (st) => rs.filter((r) => r.status === st).length
    const counted = rs.length - c('excused')
    return {
      studentId: s.id, name: s.personalInfo.fullName, groupId: s.academicInfo?.groupId || '', groupName: s.academicInfo?.groupName || '',
      days: rs.length, present: c('present'), late: c('late'), absent: c('absent'), excused: c('excused'), earlyLeave: c('early_leave'),
      rate: pct(c('present') + c('late') + c('early_leave'), counted)
    }
  })
}

// ── Exams ──────────────────────────────────────────────────────────────────
export function examsSummary(results) {
  const byExam = new Map()
  for (const r of results) {
    if (!byExam.has(r.examId)) byExam.set(r.examId, { examId: r.examId, title: r.examTitle, date: r.date, kind: r.kind, rows: [] })
    byExam.get(r.examId).rows.push(r)
  }
  return [...byExam.values()].map((e) => {
    const sat = e.rows.filter((r) => !r.absent)
    return { ...e, rows: undefined, count: e.rows.length, absent: e.rows.length - sat.length, passRate: pct(sat.filter((r) => r.passed).length, sat.length), average: avg(sat.map((r) => r.percent)) }
  }).sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ── Groups & teachers ──────────────────────────────────────────────────────
export function groupSummary(groups, hifzRows, attRows, results) {
  return groups.map((g) => {
    const h = hifzRows.filter((x) => x.groupId === g.id)
    const a = attRows.filter((x) => x.groupId === g.id && x.rate != null)
    const ex = results.filter((r) => r.groupId === g.id && !r.absent)
    return {
      groupId: g.id, name: g.name, teacherId: g.teacherId, teacherName: g.teacherName, students: h.length,
      newAyahs: h.reduce((n, x) => n + x.newAyahs, 0),
      perWeek: avg(h.map((x) => x.perWeek)) ?? 0,
      mastery: avg(h.map((x) => x.mastery).filter((x) => x != null)),
      attendance: avg(a.map((x) => x.rate)),
      passRate: pct(ex.filter((r) => r.passed).length, ex.length)
    }
  })
}

/**
 * Teacher performance index (0–100): hifz pace vs. target 40%, mastery 25%, attendance 20%, exams 15%.
 * Missing parts are left out and the weights re-normalised, so a group without exams is not penalised.
 */
export function teacherIndex(group, { targetPerWeek = 20 } = {}) {
  const parts = [
    [group.perWeek != null ? Math.min(100, (group.perWeek / targetPerWeek) * 100) : null, 0.4],
    [group.mastery, 0.25], [group.attendance, 0.2], [group.passRate, 0.15]
  ].filter(([v]) => v != null)
  const w = parts.reduce((n, [, x]) => n + x, 0)
  return w ? Math.round(parts.reduce((n, [v, x]) => n + v * x, 0) / w) : null
}

// ── Early warning ──────────────────────────────────────────────────────────
export const RISK_RULES = { attendance: 75, idleDays: 7, repeatRate: 40, mastery: 55 }

/** Students who need attention, with the reasons. Sorted by number of reasons. */
export function atRisk(hifzRows, attRows, results, { today = todayKey(), rules = RISK_RULES } = {}) {
  const att = Object.fromEntries(attRows.map((a) => [a.studentId, a]))
  const failed = new Map()
  results.filter((r) => !r.absent && !r.passed).forEach((r) => failed.set(r.studentId, (failed.get(r.studentId) || 0) + 1))
  return hifzRows.map((h) => {
    const reasons = []
    const a = att[h.studentId]
    if (a?.rate != null && a.rate < rules.attendance) reasons.push(`حضور ${a.rate}%`)
    if (a?.absent >= 3) reasons.push(`${a.absent} غياب`)
    const idle = h.lastSession ? Math.round((new Date(today) - new Date(h.lastSession)) / 864e5) : null
    if (idle == null || idle >= rules.idleDays) reasons.push(idle == null ? 'لا تسميع مسجّل' : `بلا تسميع منذ ${idle} يوم`)
    if (h.repeatRate != null && h.repeatRate >= rules.repeatRate) reasons.push(`إعادة الجديد ${h.repeatRate}%`)
    if (h.mastery != null && h.mastery < rules.mastery) reasons.push('إتقان ضعيف')
    if (failed.get(h.studentId)) reasons.push(`لم يجتز ${failed.get(h.studentId)} اختبار`)
    return { ...h, reasons, level: reasons.length >= 3 ? 'high' : reasons.length === 2 ? 'medium' : 'low' }
  }).filter((x) => x.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length)
}

// ── Export ─────────────────────────────────────────────────────────────────
/** CSV with a UTF-8 BOM so Excel shows Arabic correctly. columns: [[key, header], …] */
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [columns.map(([, h]) => esc(h)).join(','), ...rows.map((r) => columns.map(([k]) => esc(typeof k === 'function' ? k(r) : r[k])).join(','))].join('\n')
}
export function downloadCsv(name, rows, columns) {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
