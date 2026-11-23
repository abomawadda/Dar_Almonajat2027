// Today's summary for each child (parent dashboard). Queries carry parentId so the rules can prove them.
import { db } from '@/lib/backend'
import { COL } from '@/config/constants'
import { buildDailySummary } from '@/lib/summary'
import { todayKey } from '@/lib/format'

export async function dailySummaryFor(student, actor, date = todayKey()) {
  const scope = actor.role === 'parent' ? [['parentId', '==', actor.linkedId]] : []
  const by = [['studentId', '==', student.id], ...scope]
  const [att, hifz, points, behavior] = await Promise.all([
    db().list(COL.ATTENDANCE, { where: [...by, ['date', '==', date]] }),
    db().list(COL.HIFZ_RECORDS, { where: [...by, ['date', '==', date]] }),
    db().list(COL.POINTS_LEDGER, { where: [...by, ['date', '==', date]] }),
    db().list(COL.BEHAVIOR, { where: by }).then((r) => r.filter((x) => String(x.createdAt || '').slice(0, 10) === date))
  ])
  return buildDailySummary({ studentName: student.personalInfo.fullName, date, attendance: att[0], hifz, points, behavior })
}
